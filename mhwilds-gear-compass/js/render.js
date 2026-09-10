// js/render.js — DOM rendering for the skill pickers and the results panel.

function addSkillToSel(selArray, skill){
  const existing = selArray.find(x => x.id === skill.id);
  if(existing){ existing.level = Math.min(existing.level + 1, skill.maxLevel); }
  else selArray.push({ id: skill.id, name: skill.name, maxLevel: skill.maxLevel, level: 1, kind: skill.kind });
}

function kindTag(kind){
  if(kind === 'weapon') return '武器';
  if(kind === 'group') return 'グループ';
  return null;
}

// groups: [{ label, skills }]; renders each group's buttons in its own labelled block
function renderPickerGroups(containerId, groups, query, selArray, onPick){
  const el = document.getElementById(containerId);
  const q = query.trim().toLowerCase();
  el.innerHTML = '';

  let anyShown = false;
  groups.forEach(group => {
    const list = q ? group.skills.filter(s => s.name.toLowerCase().includes(q)) : group.skills;
    if(list.length === 0) return;
    anyShown = true;

    const wrap = document.createElement('div');
    wrap.className = 'picker-group';

    const label = document.createElement('div');
    label.className = 'picker-group-label';
    label.innerHTML = group.note ? `${group.label}　<span class="note">${group.note}</span>` : group.label;
    wrap.appendChild(label);

    const grid = document.createElement('div');
    grid.className = 'skill-grid';
    list.slice(0, 400).forEach(s => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'skill-btn';
      btn.textContent = s.name;
      if(selArray.find(x => x.id === s.id)) btn.classList.add('selected');
      btn.addEventListener('click', () => onPick(s));
      grid.appendChild(btn);
    });
    wrap.appendChild(grid);
    el.appendChild(wrap);
  });

  if(!anyShown){
    el.innerHTML = '<div class="empty-note">該当するスキルが見つかりません</div>';
  }
}

function renderChips(containerId, selArray, onChange){
  const el = document.getElementById(containerId);
  el.innerHTML = '';
  if(selArray.length === 0){
    el.innerHTML = '<div class="empty-note">まだ選択されていません</div>';
    return;
  }
  selArray.forEach(item => {
    const tag = kindTag(item.kind);
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.innerHTML = `
      ${tag ? `<span class="tag">${tag}</span>` : ''}
      <span class="name">${item.name}</span>
      <div class="lv-ctrl">
        <button data-act="dec" aria-label="レベルを下げる">−</button>
        <span class="lv">Lv${item.level}</span>
        <button data-act="inc" aria-label="レベルを上げる">＋</button>
      </div>
      <button class="rm" aria-label="削除">✕</button>
    `;
    chip.querySelector('[data-act=dec]').addEventListener('click', () => {
      item.level -= 1;
      if(item.level <= 0) selArray.splice(selArray.indexOf(item), 1);
      onChange();
    });
    chip.querySelector('[data-act=inc]').addEventListener('click', () => {
      item.level = Math.min(item.level + 1, item.maxLevel);
      onChange();
    });
    chip.querySelector('.rm').addEventListener('click', () => {
      selArray.splice(selArray.indexOf(item), 1);
      onChange();
    });
    el.appendChild(chip);
  });
}

function renderResults(ctx){
  const { DATA, charmLevels, targetSel, candidatesByKind, selectedArmor } = ctx;

  const normalTargets = targetSel.filter(t => t.kind === 'armor');
  const groupTargets = targetSel.filter(t => t.kind === 'group');

  const slotCardsEl = document.getElementById('slotCards');
  slotCardsEl.innerHTML = '';
  PARTS.forEach(({ kind, label }) => {
    const list = candidatesByKind[kind];
    const card = document.createElement('div');
    card.className = 'slot-card';
    const opts = list.map((a, i) => `<option value="${i}">${a.name}（防御${a.defense.base}／スロット${(a.slots || []).join(',') || 'なし'}）</option>`).join('');
    card.innerHTML = `
      <div class="slot-label">${label}</div>
      <select data-kind="${kind}">${opts || '<option>候補なし</option>'}</select>
      <div class="deco-tags" data-tags="${kind}"></div>
    `;
    card.querySelector('select').addEventListener('change', e => {
      ctx.selectedArmor[kind] = candidatesByKind[kind][Number(e.target.value)];
      renderResults(ctx);
    });
    slotCardsEl.appendChild(card);
  });

  const totals = currentSkillTotals(selectedArmor, charmLevels);
  const remainingAfterArmor = {};
  normalTargets.forEach(t => { remainingAfterArmor[t.id] = Math.max(0, t.level - (totals[t.id] || 0)); });

  const openSlots = [];
  PARTS.forEach(({ kind }) => {
    const a = selectedArmor[kind];
    if(a) (a.slots || []).forEach(size => openSlots.push({ part: kind, size }));
  });

  const decoResult = assignDecorations(remainingAfterArmor, openSlots, DATA.decorations);

  PARTS.forEach(({ kind }) => {
    const tagsEl = document.querySelector(`[data-tags="${kind}"]`);
    const placed = decoResult.placements.filter(p => p.part === kind);
    tagsEl.innerHTML = placed.length === 0
      ? '<span class="deco-tag empty">装飾品なし</span>'
      : placed.map(p => `<span class="deco-tag">${p.decoName}</span>`).join('');
  });

  const finalTotals = Object.assign({}, totals);
  decoResult.placements.forEach(p => { finalTotals[p.skillId] = (finalTotals[p.skillId] || 0) + p.level; });

  const summaryEl = document.getElementById('skillSummary');
  summaryEl.innerHTML = '';
  let unmetCount = 0;

  normalTargets.forEach(t => {
    const have = Math.min(finalTotals[t.id] || 0, t.maxLevel);
    const met = have >= t.level;
    if(!met) unmetCount++;
    const row = document.createElement('div');
    row.className = 'row ' + (met ? 'met' : 'unmet');
    row.innerHTML = `<span class="sname">${t.name}</span><span class="slv">Lv${have} / ${t.level}</span>`;
    summaryEl.appendChild(row);
  });

  groupTargets.forEach(t => {
    const have = computeGroupAchieved(selectedArmor, t.id, DATA.skillMap);
    const met = have >= t.level;
    if(!met) unmetCount++;
    const row = document.createElement('div');
    row.className = 'row ' + (met ? 'met' : 'unmet');
    row.innerHTML = `<span class="sname">${t.name}<span class="tag">グループ</span></span><span class="slv">Lv${have} / ${t.level}</span>`;
    summaryEl.appendChild(row);
  });

  const warnEl = document.getElementById('warnBox');
  warnEl.innerHTML = unmetCount > 0
    ? `<div class="warn-box">目標スキル ${unmetCount} 件が届いていません。武器スキルやセットボーナス、別の防具候補（各部位のプルダウン）を試すと届く場合があります。</div>`
    : '';

  const totalDefense = PARTS.reduce((sum, { kind }) => sum + (selectedArmor[kind] ? selectedArmor[kind].defense.base : 0), 0);
  const metCount = normalTargets.length + groupTargets.length - unmetCount;
  document.getElementById('totalsBar').innerHTML = `
    <div class="t">基礎防御力合計　<b>${totalDefense}</b></div>
    <div class="t">使用スロット　<b>${decoResult.usedSlots} / ${decoResult.totalSlots}</b></div>
    <div class="t">目標スキル達成　<b>${metCount} / ${normalTargets.length + groupTargets.length}</b></div>
  `;
}
