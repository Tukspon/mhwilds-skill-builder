// js/main.js — wires everything together.

let DATA = null;          // built by buildDataModel()
let charmSel = [];        // [{id,name,maxLevel,level,kind}]
let targetSel = [];       // [{id,name,maxLevel,level,kind}]
let selectedArmor = {};   // kind -> armor object
let candidatesByKind = {};// kind -> ranked armor array

const statusPill = document.getElementById('statusPill');
const searchBtn = document.getElementById('searchBtn');
const searchHint = document.querySelector('.search-row .hint');
const retryBtn = document.getElementById('retryBtn');
const errorDetailEl = document.getElementById('errorDetail');

function charmPickerGroups(){
  return [
    { label: '防具スキル', skills: DATA.charmArmorSkills },
    { label: '武器スキル', note: '（レア8護石のみ）', skills: DATA.weaponSkills },
  ];
}
function targetPickerGroups(){
  return [
    { label: '防具スキル', skills: DATA.armorSkills },
    { label: 'グループスキル', skills: DATA.groupSkills },
  ];
}

function refreshCharmUI(){
  renderChips('charmChips', charmSel, refreshCharmUI);
  renderPickerGroups('charmGrid', charmPickerGroups(), document.getElementById('charmSearch').value, charmSel,
    s => { addSkillToSel(charmSel, s); refreshCharmUI(); });
}
function refreshTargetUI(){
  renderChips('targetChips', targetSel, refreshTargetUI);
  renderPickerGroups('targetGrid', targetPickerGroups(), document.getElementById('targetSearch').value, targetSel,
    s => { addSkillToSel(targetSel, s); refreshTargetUI(); });
}

document.getElementById('charmSearch').addEventListener('input', refreshCharmUI);
document.getElementById('targetSearch').addEventListener('input', refreshTargetUI);
retryBtn.addEventListener('click', () => { retryBtn.classList.add('hidden'); loadData(); });
searchBtn.addEventListener('click', runSearch);

async function loadData(){
  statusPill.textContent = 'データ読み込み中…';
  statusPill.classList.remove('ok', 'err');
  errorDetailEl.classList.add('hidden');
  retryBtn.classList.add('hidden');
  try{
    const raw = await apiLoadAll();
    DATA = buildDataModel(raw);

    statusPill.textContent = `データ読み込み完了（防具 ${DATA.armor.length} 件 / 装飾品 ${DATA.decorations.length} 件）`;
    statusPill.classList.add('ok');
    searchBtn.disabled = false;
    searchHint.textContent = 'スキルを選んだら押してください';

    refreshCharmUI();
    refreshTargetUI();
  }catch(err){
    console.error(err);
    statusPill.textContent = 'データの取得に失敗しました';
    statusPill.classList.add('err');
    searchHint.textContent = 'データ取得に失敗したため検索できません';
    errorDetailEl.textContent = String(err.message || err);
    errorDetailEl.classList.remove('hidden');
    retryBtn.classList.remove('hidden');
  }
}

function runSearch(){
  if(targetSel.length === 0){
    alert('付けたいスキルを1つ以上選んでください。');
    return;
  }
  const charmLevels = {};
  charmSel.forEach(c => { charmLevels[c.id] = c.level; });

  const normalTargets = targetSel.filter(t => t.kind === 'armor');
  const groupTargets = targetSel.filter(t => t.kind === 'group');
  const remaining = computeRemainingNeed(normalTargets, charmLevels);
  const activeGroupTargetIds = new Set(groupTargets.map(t => t.id));

  candidatesByKind = rankCandidates(DATA.armor, remaining, activeGroupTargetIds);
  selectedArmor = {};
  PARTS.forEach(({ kind }) => { selectedArmor[kind] = candidatesByKind[kind][0] || null; });

  document.getElementById('results').classList.remove('hidden');
  renderResults({ DATA, charmLevels, targetSel, candidatesByKind, selectedArmor });
  document.getElementById('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

loadData();
