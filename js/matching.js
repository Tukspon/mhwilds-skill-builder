// js/matching.js — turns raw API data into the shapes the UI needs, and
// implements the (intentionally simple) candidate-ranking / decoration
// assignment search.

const PARTS = [
  { kind: 'head', label: '頭' },
  { kind: 'chest', label: '胴' },
  { kind: 'arms', label: '腕' },
  { kind: 'waist', label: '腰' },
  { kind: 'legs', label: '脚' },
];

function byNameJa(a, b){ return a.name.localeCompare(b.name, 'ja'); }

// Shapes raw API responses into the lookups the rest of the app uses.
function buildDataModel({ skillsRaw, armor, decorations, charms, armorSets }){
  const skillMap = {};
  skillsRaw.forEach(s => {
    skillMap[s.id] = {
      id: s.id,
      name: s.name,
      kind: s.kind, // 'armor' | 'weapon' | 'set' | 'group'
      ranks: s.ranks,
      maxLevel: Math.max(1, ...s.ranks.map(r => r.level)),
    };
  });

  const armorSkills = skillsRaw.filter(s => s.kind === 'armor').map(s => skillMap[s.id]).sort(byNameJa);
  const weaponSkills = skillsRaw.filter(s => s.kind === 'weapon').map(s => skillMap[s.id]).sort(byNameJa);
  const groupSkillsAll = skillsRaw.filter(s => s.kind === 'group').map(s => skillMap[s.id]).sort(byNameJa);

  // Only skills that genuinely appear on a real (craftable) charm should be
  // selectable as "護石スキル" — this excludes armor-only skills like
  // Buddy-related ones that can never actually roll on a charm.
  const charmArmorSkillIds = new Set();
  charms.forEach(c => {
    (c.ranks || []).forEach(rank => {
      (rank.skills || []).forEach(sk => charmArmorSkillIds.add(sk.skill.id));
    });
  });
  const charmArmorSkills = armorSkills.filter(s => charmArmorSkillIds.has(s.id));

  const armorDecorations = decorations.filter(d => d.kind === 'armor');

  // setId -> groupBonusSkill (has its own .ranks with setPiecesRequired)
  const setGroupSkill = {};
  armorSets.forEach(set => {
    if(set.groupBonusSkill) setGroupSkill[set.id] = set.groupBonusSkill;
  });

  // Keep only group skills that some armor set actually grants.
  const obtainableGroupSkillIds = new Set(Object.values(setGroupSkill).map(g => g.id));
  const groupSkills = groupSkillsAll.filter(s => obtainableGroupSkillIds.has(s.id));

  const armorWithGroups = armor.map(a => {
    const setId = a.armorSet ? a.armorSet.id : null;
    const groupSkillId = (setId != null && setGroupSkill[setId]) ? setGroupSkill[setId].id : null;
    return Object.assign({}, a, { groupSkillId });
  });

  return {
    skillMap, armorSkills, weaponSkills, groupSkills, charmArmorSkills,
    armor: armorWithGroups, decorations: armorDecorations,
  };
}

// remaining need per armor-kind skill id, after subtracting what the charm already provides
function computeRemainingNeed(targetArmorSkills, charmLevels){
  const remaining = {};
  targetArmorSkills.forEach(t => {
    const have = charmLevels[t.id] || 0;
    remaining[t.id] = Math.max(0, t.level - have);
  });
  return remaining;
}

function scoreArmor(a, remaining, activeGroupTargetIds){
  let score = 0;
  a.skills.forEach(s => {
    const need = remaining[s.skill.id] || 0;
    if(need > 0) score += Math.min(s.level, need) * 10;
  });
  score += (a.slots || []).reduce((sum, s) => sum + s, 0) * 0.3;
  if(a.groupSkillId && activeGroupTargetIds.has(a.groupSkillId)) score += 8;
  return score;
}

function rankCandidates(armorList, remaining, activeGroupTargetIds){
  const out = {};
  PARTS.forEach(({ kind }) => {
    const pool = armorList.filter(a => a.kind === kind);
    out[kind] = pool
      .map(a => ({ a, score: scoreArmor(a, remaining, activeGroupTargetIds) }))
      .sort((x, y) => y.score - x.score || (y.a.defense.max - x.a.defense.max))
      .slice(0, 12)
      .map(x => x.a);
  });
  return out;
}

function currentSkillTotals(selectedArmor, charmLevels){
  const totals = {};
  Object.entries(charmLevels).forEach(([id, lv]) => { totals[id] = (totals[id] || 0) + lv; });
  Object.values(selectedArmor).forEach(a => {
    if(!a) return;
    a.skills.forEach(s => { totals[s.skill.id] = (totals[s.skill.id] || 0) + s.level; });
  });
  return totals;
}

function computeGroupAchieved(selectedArmor, groupSkillId, skillMap){
  const count = Object.values(selectedArmor).filter(a => a && a.groupSkillId === groupSkillId).length;
  const skill = skillMap[groupSkillId];
  if(!skill) return 0;
  let achieved = 0;
  [...skill.ranks].sort((a, b) => a.level - b.level).forEach(r => {
    if(count >= r.setPiecesRequired) achieved = r.level;
  });
  return achieved;
}

// Greedy decoration placement: harder-to-place skills (those needing a
// bigger minimum slot) are placed first, each into the smallest open slot
// that still fits, to conserve large slots for later needs.
function assignDecorations(remaining, openSlots, decorations){
  const slots = openSlots.map(s => Object.assign({}, s, { used: false }));
  const need = Object.assign({}, remaining);
  const placements = [];

  const decoIndex = {};
  decorations.forEach(d => {
    (d.skills || []).forEach(sk => {
      if(!decoIndex[sk.skill.id]) decoIndex[sk.skill.id] = [];
      decoIndex[sk.skill.id].push({ deco: d, level: sk.level, size: d.slot });
    });
  });
  Object.values(decoIndex).forEach(arr => arr.sort((a, b) => b.size - a.size));

  const order = Object.entries(need)
    .filter(([id, lv]) => lv > 0 && decoIndex[id])
    .map(([id]) => ({ id, minSize: Math.min(...decoIndex[id].map(o => o.size)) }))
    .sort((a, b) => b.minSize - a.minSize);

  order.forEach(({ id }) => {
    let guard = 0;
    while(need[id] > 0 && guard < 20){
      guard++;
      const options = decoIndex[id];
      const smallestOpt = options[options.length - 1];
      const candidateSlots = slots
        .filter(s => !s.used && s.size >= smallestOpt.size)
        .sort((a, b) => a.size - b.size);
      if(candidateSlots.length === 0) break;
      const slot = candidateSlots[0];
      const opt = options.find(o => o.size <= slot.size) || smallestOpt;
      slot.used = true;
      need[id] = Math.max(0, need[id] - opt.level);
      placements.push({ part: slot.part, slotSize: slot.size, decoName: opt.deco.name, skillId: id, level: opt.level });
    }
  });

  return {
    placements,
    stillNeeded: need,
    usedSlots: slots.filter(s => s.used).length,
    totalSlots: slots.length,
  };
}
