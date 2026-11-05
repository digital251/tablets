/* 태블릿 현황 대시보드
 * Apps Script 웹앱(API_URL)이 드라이브 폴더의 최신 단말 목록 파일을 읽어 집계해 줍니다.
 * 이 파일에는 비밀 값이 없습니다. */

// Apps Script 배포 후 받은 웹앱 주소(…/exec)
const API_URL = 'https://script.google.com/macros/s/AKfycbzFu8mMsbTXT10UQipK0MnJZ3CN58xH5hNyWmsCz6geZog8-Si4H0Kwl2eNQUFdjMWb/exec';
const CODE_KEY = 'tablet-code';

let cachedData = null;
let selectedOrg = "전체";
let selectedModel = "";

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// 접속 코드(서버에서 켰을 때만): 다음에 열 때를 위해 이 브라우저에 기억 (저장이 막힌 브라우저에서는 이번 방문 동안만)
let codeMemo = '';
const codeStore = {
  get() { try { return localStorage.getItem(CODE_KEY) || codeMemo; } catch (e) { return codeMemo; } },
  set(v) { codeMemo = v; try { if (v) localStorage.setItem(CODE_KEY, v); else localStorage.removeItem(CODE_KEY); } catch (e) {} },
};

/** body: { fresh } 새로 읽기 / { code } 접속 코드.
 *  text/plain으로 보내야 브라우저가 사전 확인(OPTIONS)을 하지 않아 Apps Script가 받을 수 있음 */
async function api(body) {
  try {
    const res = await fetch(API_URL, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ code: codeStore.get() }, body)), credentials: 'omit', redirect: 'follow'
    });
    const data = await res.json().catch(() => null);
    return data || { error: "서버가 올바른 답을 주지 않았습니다. 잠시 후 다시 시도해 주세요." };
  } catch (e) {
    return { error: "서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요." };
  }
}

function show(id, on) { $(id).classList.toggle('d-none', !on); }

function showError(msg) {
  show('dashboard', false); show('toolbar', false);
  $('errorText').textContent = msg;
  show('error', true);
}

function showCodeForm(msg) {
  show('dashboard', false); show('toolbar', false); show('error', false);
  $('fileInfo').textContent = '';
  $('codeInput').value = '';
  $('codeError').textContent = msg || '';
  show('codeError', !!msg);
  show('codeForm', true);
  $('codeInput').focus();
}

/** body.fresh = true면 서버에 기억된 내용 대신 폴더를 새로 읽음 ('데이터 새로고침' 버튼) */
async function loadData(body) {
  show('codeForm', false); show('error', false); show('dashboard', false); show('loading', true);
  const data = await api(body);
  show('loading', false);
  if (data.needCode) { codeStore.set(''); return showCodeForm(data.error); }
  if (data.error) return showError(data.error);
  cachedData = data;
  show('lockBtn', !!data.useCode);   // 접속 코드를 쓸 때만 '잠그기' 버튼
  $('fileInfo').textContent = data.file ? `기준: ${data.file.date} 내려받은 단말 목록 (${data.file.name})` : '';
  selectedOrg = "전체";
  selectedModel = "";
  renderOrgTable(data.orgSummary);
  renderModelTable(data.totalModelSummary, "전체");
  clearUserList();
  show('toolbar', true); show('dashboard', true);
}

function renderOrgTable(orgs) {
  const tbody = $('org-list');
  tbody.innerHTML = orgs.map((item, i) => `
    <tr class="clickable-row" data-i="${i}">
      <td class="px-3">${esc(item.name)}</td>
      <td class="text-end fw-bold text-success px-3">${item.count}대</td>
    </tr>
  `).join('');
  tbody.querySelectorAll('tr').forEach(tr => {
    tr.onclick = () => filterByOrg(orgs[Number(tr.dataset.i)].name, tr);
  });
}

function renderUsers(users, emptyMsg) {
  const userBox = $('user-list');
  if (users.length === 0) {
    userBox.innerHTML = `<span class="text-muted">${esc(emptyMsg)}</span>`;
    return;
  }
  userBox.innerHTML = users.map(u =>
    `<span class="badge bg-secondary badge-user" title="${esc(u.model || '')}">${esc(u.name)}</span>`
  ).join('');
}

// 🏢 1단계: 조직 클릭
function filterByOrg(orgName, rowElement) {
  document.querySelectorAll('#org-list .clickable-row').forEach(el => el.classList.remove('active-org'));
  rowElement.classList.add('active-org');
  selectedOrg = orgName;
  selectedModel = "";

  const modelsObj = cachedData.modelMap[orgName] || {};
  const filteredModels = Object.keys(modelsObj).map(key => ({ name: key, count: modelsObj[key] })).sort((a, b) => b.count - a.count);
  renderModelTable(filteredModels, orgName);

  $('user-card-header').innerText = `👤 사용자 명단 [${selectedOrg} 전체]`;
  renderUsers(cachedData.orgUserMap[orgName] || [], '해당 조직에 등록된 명단이 존재하지 않습니다.');
}

function renderModelTable(models, orgTitle) {
  $('model-card-header').innerText = `📱 2단계: 모델 선택 (${orgTitle})`;
  const tbody = $('model-list');
  tbody.innerHTML = models.map((item, i) => `
    <tr class="clickable-row" data-i="${i}">
      <td class="px-3">${esc(item.name)}</td>
      <td class="text-end fw-bold text-primary px-3">${item.count}대</td>
    </tr>
  `).join('');
  tbody.querySelectorAll('tr').forEach(tr => {
    tr.onclick = () => filterByUsers(models[Number(tr.dataset.i)].name, tr);
  });
}

// 📱 2단계: 모델 클릭
function filterByUsers(modelName, rowElement) {
  if (selectedOrg === "전체") {
    alert("1단계에서 먼저 조직을 선택해 주세요.");
    return;
  }
  document.querySelectorAll('#model-list .clickable-row').forEach(el => el.classList.remove('active-model'));
  rowElement.classList.add('active-model');
  selectedModel = modelName;

  $('user-card-header').innerText = `👤 사용자 명단 [${selectedOrg} > ${modelName}]`;
  renderUsers(cachedData.orgModelUserMap[selectedOrg + "|" + modelName] || [], '해당 조건의 사용자가 없습니다.');
}

function clearUserList() {
  $('user-card-header').innerText = `👤 사용자 명단`;
  $('user-list').innerHTML = '<span class="text-muted">조직과 모델을 차례로 클릭하면 해당하는 사용자 명단이 나타납니다.</span>';
}

function resetFilter() {
  if (!cachedData) return;
  selectedOrg = "전체";
  selectedModel = "";
  document.querySelectorAll('.clickable-row').forEach(el => el.classList.remove('active-org', 'active-model'));
  renderModelTable(cachedData.totalModelSummary, "전체");
  clearUserList();
}

$('codeForm').addEventListener('submit', e => {
  e.preventDefault();
  const code = $('codeInput').value.trim();
  if (!code) return showCodeForm('접속 코드를 입력해 주세요.');
  codeStore.set(code);
  loadData();
});
$('resetBtn').onclick = resetFilter;
$('reloadBtn').onclick = () => loadData({ fresh: true });
$('retryBtn').onclick = () => loadData({ fresh: true });
$('lockBtn').onclick = () => {
  cachedData = null;
  codeStore.set('');
  showCodeForm();
};

loadData();
