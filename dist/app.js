import { STORAGE_KEY, won, id, nameKey, splitNames, today, allocate, calculate, personInfo, account, announcement, demoRound } from './settlement.js';

const main = document.querySelector('#main');
const dialog = document.querySelector('#dialog');
const toast = document.querySelector('#toast');
let state = { members: [], rounds: [] };
let saved = null;
let loadError = '';
let view = { type: 'home' };
let toastTimer;

const icons = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M16 3v4M8 3v4M3 10h18m5 5h2m4 0h2"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2m2-15a3 3 0 0 1 0 6m1 3a4 4 0 0 1 3 4v2"/>',
  receipt: '<path d="M5 3l2 1.5L9.5 3l2.5 1.5L14.5 3 17 4.5 19 3v18l-2-1.5-2.5 1.5-2.5-1.5L9.5 21 7 19.5 5 21V3zM8 9h8m-8 4h8"/>',
  chat: '<path d="M21 11a8.5 8.5 0 0 1-8.5 8.5H5l1.2-3A8.5 8.5 0 1 1 21 11Z"/><path d="M8 11h.01m4 0h.01m4 0h.01"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  edit: '<path d="m13 6 5 5M5 19l4-1 11-11a2 2 0 0 0-3-3L6 15l-1 4z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${icons[name]}</svg>`;
const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));
const button = (label, action, style = '', symbol = '', extra = '') =>
  `<button type="button" class="button ${style}" data-action="${action}" ${extra}>${symbol ? icon(symbol) : ''}${label}</button>`;
const dateLabel = date => date.replaceAll('-', '. ');
const currentRound = () => view.id === 'demo' ? state.demo ?? demoRound() : state.rounds.find(round => round.id === view.id);
const getPerson = (round, person) => personInfo(round, state.members, person);
const personName = (round, person) => escape(getPerson(round, person).name);
const storageNotice = `<footer class="foot">${icon('lock')} 회원과 정산 기록은 현재 브라우저에 저장됩니다.</footer>`;

function read() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    state = raw ? JSON.parse(raw) : { members: [], rounds: [] };
    saved = raw;
    loadError = '';
  } catch {
    loadError = '브라우저에 저장된 기록을 열 수 없습니다. 이 브라우저의 저장소 설정을 확인해 주세요.';
  }
}

function persist(next) {
  if (loadError) throw new Error(loadError);
  const data = JSON.stringify(next);
  try {
    if (localStorage.getItem(STORAGE_KEY) !== saved) {
      throw new Error('다른 탭에서 기록이 바뀌었습니다. 새로고침 후 다시 시도해 주세요.');
    }
    localStorage.setItem(STORAGE_KEY, data);
  } catch (error) {
    if (error.name === 'Error') throw error;
    throw new Error('기록을 저장할 수 없습니다. 이 브라우저의 저장소 설정을 확인해 주세요.');
  }
  saved = data;
  state = next;
}

function saveRound(round) {
  persist(round.demo ? { ...state, demo: round } : {
    ...state, rounds: state.rounds.map(item => item.id === round.id ? round : item),
  });
}

function notify(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toastTimer = setTimeout(() => { toast.textContent = ''; }, 3800);
}

function go(type, roundId) {
  view = { type, id: roundId };
  render();
  window.scrollTo(0, 0);
  main.focus({ preventScroll: true });
}

function render() {
  for (const tab of document.querySelectorAll('[data-tab]')) {
    const active = tab.dataset.tab === (view.type === 'members' ? 'members' : 'rounds');
    if (active) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }
  const pages = { home, members, detail, 'new-round': newRound };
  main.innerHTML = (loadError ? `<p class="notice" role="alert">${escape(loadError)}</p>` : '') + pages[view.type]() + storageNotice;
}

function home() {
  const art = `<svg class="hero-art" viewBox="0 0 420 420" aria-hidden="true">
    <g fill="none" stroke="currentColor" stroke-width="1" opacity=".37">
      <circle cx="236" cy="228" r="92"/><circle cx="236" cy="228" r="111"/><circle cx="236" cy="228" r="132"/>
      <circle cx="236" cy="228" r="154"/><circle cx="236" cy="228" r="177"/><circle cx="236" cy="228" r="201"/>
    </g>
    <ellipse cx="236" cy="255" rx="36" ry="11" fill="currentColor" opacity=".19"/>
    <ellipse cx="236" cy="255" rx="16" ry="5" fill="currentColor" opacity=".67"/>
    <path d="M236 253V153" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
    <path d="m238 155 51 20-51 19z" fill="currentColor"/><circle cx="185" cy="278" r="5" fill="currentColor"/>
  </svg>`;
  const rounds = [...state.rounds].sort((a, b) => b.date.localeCompare(a.date));
  return `<section class="hero">${art}<div>
    <div class="hero-kicker">${icon('receipt')} 회차 정산</div>
    <h1>매골모 회식비 정산</h1>
    <p>회식비를 나누고, 카톡 공지와 입금 확인까지 한곳에서 관리하세요.</p>
    ${button('새 회차', 'new-round', 'lime', 'plus')}
  </div></section>
  <div class="grid">
    <section class="stack" aria-labelledby="rounds-title">
      <div class="section-heading"><div><h2 id="rounds-title">회차 목록</h2><p class="muted small">저장한 회차를 열어 정산과 입금 현황을 확인하세요.</p></div><span class="chip">${rounds.length}회차</span></div>
      ${rounds.length ? rounds.map(roundRow).join('') : `<div class="card empty"><span class="tile">${icon('calendar')}</span>
        <strong>아직 등록된 회차가 없어요</strong><p class="muted small">첫 회차를 만들고 참석자를 등록해 보세요.</p>
        ${button('새 회차 만들기', 'new-round', 'outline', 'plus')}</div>`}
    </section>
    <aside class="stack" aria-label="정산 도움말">
      <section class="card">
        <h2 class="help-title">${icon('info')} 정산 순서</h2>
        <ul class="help-list small">
          <li>${icon('users')} <span><strong>참석자 등록</strong><br><span class="muted">저장된 회원을 고르거나 이름을 입력해요.</span></span></li>
          <li>${icon('receipt')} <span><strong>지출 추가</strong><br><span class="muted">항목마다 결제자와 나눠 낼 사람을 골라요.</span></span></li>
          <li>${icon('chat')} <span><strong>카톡 공유 · 입금 확인</strong><br><span class="muted">송금 내역을 복사하고 입금을 체크해요.</span></span></li>
        </ul>
      </section>
      <section class="card demo-card">
        <div class="spread"><h2>시연 회차</h2><span class="chip demo">시연용</span></div>
        <p class="muted small">가상 참석자와 지출로 정산 흐름을 체험해 보세요.</p>
        ${button('시연 회차 열기', 'demo', 'outline')}
      </section>
    </aside>
  </div>`;
}

function roundRow(round) {
  const { total, pending } = calculate(round);
  const status = pending.length ? `미입금 ${pending.length}건` : round.expenses.length ? '정산 완료' : '지출 등록 전';
  return `<button type="button" class="card round-row" data-action="round" data-id="${round.id}">
    <span class="tile">${icon('calendar')}</span>
    <span class="round-main"><strong>${escape(round.title)}</strong><small class="muted small">${dateLabel(round.date)} · ${round.people.length}명</small></span>
    <span class="row-end"><strong>${won(total)}</strong><small><span class="chip ${pending.length ? 'waiting' : ''}">${status}</span></small></span>
  </button>`;
}

function members() {
  return `<section class="stack">
    <div class="page-head"><h1>회원 명단</h1><p class="muted">저장된 회원을 다음 회차에서 다시 선택할 수 있어요. 계좌는 선택 사항입니다.</p></div>
    <div class="section-heading"><h2>등록 회원 <span class="chip">${state.members.length}명</span></h2>${button('회원 추가', 'member-add', 'primary', 'plus')}</div>
    ${state.members.length ? `<div class="card">${state.members.map(member => `<div class="person-row spread">
      <div><strong>${escape(member.name)}</strong><p class="small muted">${escape(account(member) || '계좌 미등록')}</p></div>
      ${button('수정', 'member-edit', 'outline', 'edit', `data-id="${member.id}" aria-label="${escape(member.name)} 회원 수정"`)}
    </div>`).join('')}</div>` : `<div class="card empty"><span class="tile">${icon('users')}</span><strong>등록된 회원이 없어요</strong>
      <p class="muted small">여기서 회원을 추가하거나 새 회차에서 참석자를 등록하세요.</p></div>`}
  </section>`;
}

function newRound() {
  return `<section class="stack">
    <div class="page-head">${button('회차 목록', 'home', 'outline', 'calendar')}<h1>새 회차</h1></div>
    <form id="round-form" class="card form" autocomplete="off">
      <label class="field">모임 이름<input name="title" type="text" placeholder="예: 11월 라운딩 뒤풀이" maxlength="80" required></label>
      <label class="field">날짜<input name="date" type="date" value="${today()}" required></label>
      <fieldset><legend>저장된 회원</legend>
        ${state.members.length ? `<div class="check-grid">${state.members.map(member =>
          `<label class="checkline"><input type="checkbox" name="members" value="${member.id}">${escape(member.name)}</label>`).join('')}</div>` :
          '<p class="muted small">아래에서 새 참석자를 바로 등록할 수 있어요.</p>'}
      </fieldset>
      <fieldset><legend><label for="name-input">새 참석자</label></legend>
        <p class="muted small" id="name-help">이름을 하나씩 또는 쉼표나 줄바꿈으로 구분해 입력하세요.</p>
        <div class="spread"><textarea id="name-input" rows="2" aria-describedby="name-help" placeholder="미키, 민수, 지은, 현우"></textarea>${button('추가', 'names-add', 'outline', 'plus')}</div>
        <div id="new-people"></div>
      </fieldset>
      <p class="form-error" role="alert" hidden></p>
      <div class="actions">${button('취소', 'home', 'outline')}<button class="button primary" type="submit">회차 저장</button></div>
    </form>
  </section>`;
}

function detail() {
  const round = currentRound();
  const { people, total, pending, remaining } = calculate(round);
  return `<section class="stack">
    <div class="page-head">${button('회차 목록', 'home', 'outline', 'calendar')}
      <div class="spread"><h1>${escape(round.title)}</h1>${round.demo ? '<span class="chip demo">시연용</span>' : ''}</div>
      <p class="muted">${dateLabel(round.date)} · 참석자 ${round.people.length}명</p>
    </div>
    <div class="detail-banner">
      <div><span>총 지출</span><strong>${won(total)}</strong></div>
      <div><span>미입금 건수</span><strong>${pending.length}건</strong></div>
      <div><span>미입금 금액</span><strong>${won(remaining)}</strong></div>
    </div>
    <div class="grid" style="margin-top:0">
      <div class="stack">
        <section class="card stack" aria-labelledby="expenses-title">
          <div class="spread"><h2 id="expenses-title">지출 항목</h2>${button('지출 추가', 'expense-add', 'primary', 'plus')}</div>
          ${round.receipts.length ? '<p class="notice">입금 완료 내역이 있습니다. 지출 변경 시 실제 입금액을 반영해 남은 송금액을 다시 계산합니다.</p>' : ''}
          <div>${round.expenses.length ? round.expenses.map(expense => expenseRow(round, expense)).join('') : '<p class="muted">아직 지출 항목이 없어요.</p>'}</div>
        </section>
        <section class="card stack" aria-labelledby="people-title">
          <h2 id="people-title">참석자별 금액</h2>
          <div>${round.people.map(person => `<div class="person-row spread"><strong>${personName(round, person.id)} ${!person.memberId && !round.demo ? '<span class="chip">게스트</span>' : ''}</strong>
            <span class="small muted">결제 ${won(people[person.id].paid)} · 부담 ${won(people[person.id].share)}</span></div>`).join('')}</div>
        </section>
      </div>
      <section class="card" aria-labelledby="transfers-title">
        <h2 id="transfers-title">송금 및 입금 확인</h2>
        <div class="transfers">
          ${pending.length ? pending.map((entry, index) => transferRow(round, entry, index)).join('') :
          `<p class="muted small">${round.expenses.length ? '남은 송금이 없습니다.' : '지출을 등록하면 송금액이 계산됩니다.'}</p>`}
        </div>
        ${round.receipts.length ? `<h3 class="small" style="margin-top:14px">입금 완료 기록</h3>${round.receipts.map(entry => transferRow(round, entry)).join('')}` : ''}
        <div style="margin-top:14px">${button('카톡 공지 복사', 'copy', 'primary', 'chat', round.expenses.length || round.receipts.length ? '' : 'disabled')}</div>
      </section>
    </div>
  </section>`;
}

function expenseRow(round, expense) {
  const shares = allocate(expense.amount, expense.participants, expense.overrides);
  return `<div class="expense-row"><div class="spread">
    <div><strong>${escape(expense.title)} · ${won(expense.amount)}</strong><p class="small muted">결제 ${personName(round, expense.payer)} · 분담 ${expense.participants.length}명</p></div>
    ${button('수정', 'expense-edit', 'outline', 'edit', `data-id="${expense.id}" aria-label="${escape(expense.title)} 수정"`)}
  </div><details><summary class="small">부담액 보기</summary><div class="people-tags">
    ${expense.participants.map(person => `<span class="chip">${personName(round, person)} ${won(shares[person])}</span>`).join('')}
  </div></details></div>`;
}

function transferRow(round, entry, index) {
  const bank = account(getPerson(round, entry.to));
  const complete = index === undefined;
  return `<div class="transfer"><div><div>${personName(round, entry.from)} → ${personName(round, entry.to)} <strong>${won(entry.amount)}</strong></div>
    ${bank && !complete ? `<p class="muted small">${escape(bank)}</p>` : ''}</div>
    ${complete ? `<div class="spread"><span class="chip">입금 완료</span>${button('체크 되돌리기', 'receipt-undo', 'ghost', '', `data-id="${entry.id}"`)}</div>` :
    button('입금 완료 체크', 'receipt-add', 'outline', 'check', `data-id="${index}"`)}
  </div>`;
}

function showError(form, message) {
  const error = form.querySelector('.form-error');
  error.textContent = message;
  error.hidden = !message;
  if (message) error.scrollIntoView({ block: 'nearest' });
}

function addNames(form) {
  const input = form.querySelector('#name-input');
  const names = splitNames(input.value);
  const known = new Set([
    ...[...form.querySelectorAll('.new-name')].map(field => field.value),
    ...state.members.filter(member => [...form.querySelectorAll('[name="members"]:checked')].some(field => field.value === member.id)).map(member => member.name),
  ].map(nameKey));
  let repeats = 0;
  for (const name of names) {
    if (known.has(nameKey(name))) {
      repeats++;
      continue;
    }
    known.add(nameKey(name));
    form.querySelector('#new-people').insertAdjacentHTML('beforeend', `<div class="new-person">
      <input class="new-name" type="text" aria-label="새 참석자 이름" value="${escape(name)}" required>
      ${button('', 'name-remove', 'ghost icon-only', 'close', 'aria-label="참석자 빼기"')}
      <label class="checkline"><input type="checkbox" class="guest">이번 회차만 참석</label>
    </div>`);
  }
  input.value = '';
  if (repeats) notify(`중복된 이름 ${repeats}개를 제외했어요.`);
  showError(form, '');
}

function submitRound(form) {
  addNames(form);
  const data = new FormData(form);
  const title = data.get('title').trim();
  if (!title) throw new Error('모임 이름을 입력해 주세요.');
  const people = [];
  const nextMembers = [...state.members];
  const used = new Set();
  function addPerson(name, member) {
    const key = nameKey(name);
    if (!key) throw new Error('참석자 이름을 입력하거나 빈 참석자를 빼 주세요.');
    if (used.has(key)) throw new Error(`‘${name}’ 참석자가 두 번 선택되었습니다.`);
    used.add(key);
    people.push({ id: id(), name, ...(member ? { memberId: member.id } : {}) });
  }
  for (const memberId of data.getAll('members')) {
    const member = nextMembers.find(entry => entry.id === memberId);
    addPerson(member.name, member);
  }
  for (const row of form.querySelectorAll('.new-person')) {
    const name = row.querySelector('.new-name').value.trim();
    if (row.querySelector('.guest').checked) {
      addPerson(name);
      continue;
    }
    let member = nextMembers.find(entry => nameKey(entry.name) === nameKey(name));
    if (!member) {
      member = { id: id(), name, bank: '', account: '', holder: '' };
      nextMembers.push(member);
    }
    addPerson(member.name, member);
  }
  if (!people.length) throw new Error('참석자를 한 명 이상 등록해 주세요.');
  const round = { id: id(), title, date: data.get('date'), people, expenses: [], receipts: [] };
  persist({ ...state, members: nextMembers, rounds: [round, ...state.rounds] });
  go('detail', round.id);
  notify('새 회차를 저장했어요.');
}

function openDialog(title, content, formType = '') {
  if (dialog.open) dialog.close();
  dialog.innerHTML = formType
    ? `<form class="modal form" data-form="${formType}" autocomplete="off"><h2 id="dialog-title">${title}</h2>${content}
      <p class="form-error" role="alert" hidden></p></form>`
    : `<div class="modal"><h2 id="dialog-title">${title}</h2>${content}</div>`;
  dialog.showModal();
}

function memberEditor(member) {
  const fields = [['name', '이름 또는 닉네임'], ['bank', '은행명'], ['account', '계좌번호'], ['holder', '예금주']];
  openDialog(member ? '회원 정보 수정' : '회원 추가', `
    <input type="hidden" name="id" value="${member?.id ?? ''}">
    ${fields.map(([field, label]) => `<label class="field">${label}${field === 'name' ? '' : ' (선택)'}
      <input type="text" name="${field}" value="${escape(member?.[field])}" ${field === 'name' ? 'required autofocus' : ''} ${field === 'account' ? 'inputmode="numeric"' : ''}></label>`).join('')}
    <div class="actions">${button('취소', 'close', 'outline')}<button class="button primary" type="submit">회원 저장</button></div>`, 'member');
}

function submitMember(form) {
  const data = new FormData(form);
  const memberId = data.get('id');
  const name = data.get('name').trim();
  if (!name) throw new Error('회원 이름을 입력해 주세요.');
  if (state.members.some(member => member.id !== memberId && nameKey(member.name) === nameKey(name))) {
    throw new Error('같은 이름의 회원이 이미 있습니다.');
  }
  if (state.rounds.some(round => round.people.some(person => person.memberId === memberId) &&
    round.people.some(person => person.memberId !== memberId && nameKey(getPerson(round, person.id).name) === nameKey(name)))) {
    throw new Error('이 회원이 참석한 회차에 같은 이름의 참석자가 있습니다.');
  }
  const member = { id: memberId || id(), name, bank: data.get('bank').trim(), account: data.get('account').trim(), holder: data.get('holder').trim() };
  const members = memberId ? state.members.map(entry => entry.id === memberId ? member : entry) : [...state.members, member];
  persist({ ...state, members });
  dialog.close();
  render();
  notify('회원 정보를 저장했어요.');
}

function expenseEditor(expenseId) {
  const round = currentRound();
  const expense = round.expenses.find(entry => entry.id === expenseId);
  openDialog(expense ? '지출 수정' : '지출 추가', `
    <input type="hidden" name="id" value="${expense?.id ?? ''}">
    <label class="field">항목 이름<input name="title" type="text" value="${escape(expense?.title)}" maxlength="80" placeholder="예: 1차 식사" required autofocus></label>
    <label class="field">지출 금액 (원)<input name="amount" type="text" inputmode="numeric" value="${expense?.amount ?? ''}" placeholder="예: 120000" required></label>
    <label class="field">먼저 결제한 사람<select name="payer" required>
      <option value="">선택해 주세요</option>${round.people.map(person =>
        `<option value="${person.id}" ${expense?.payer === person.id ? 'selected' : ''}>${personName(round, person.id)}</option>`).join('')}
    </select></label>
    <fieldset><legend>나눠 낼 사람</legend><p class="muted small">빈 부담액은 균등 분할됩니다. 0원을 지정할 수도 있어요.</p>
      ${round.people.map(person => {
        const selected = expense ? expense.participants.includes(person.id) : true;
        return `<div class="split-row">
          <label class="checkline"><input type="checkbox" name="participants" value="${person.id}" ${selected ? 'checked' : ''}>${personName(round, person.id)}</label>
          <label class="field"><input type="text" name="share-${person.id}" inputmode="numeric" aria-label="${personName(round, person.id)} 부담액" placeholder="균등 분할" value="${expense?.overrides[person.id] ?? ''}" ${selected ? '' : 'disabled'}></label>
        </div>`;
      }).join('')}
    </fieldset>
    <div class="actions">
      ${expense ? button('지출 삭제', 'expense-delete-prompt', 'danger', '', `data-id="${expense.id}"`) : ''}
      ${button('취소', 'close', 'outline')}<button class="button primary" type="submit">지출 저장</button>
    </div>`, 'expense');
}

function submitExpense(form) {
  const round = currentRound();
  const data = new FormData(form);
  const title = data.get('title').trim();
  const amountInput = data.get('amount').trim();
  const amount = /^\d+$/.test(amountInput) ? Number(amountInput) : NaN;
  if (!title) throw new Error('지출 항목 이름을 입력해 주세요.');
  const participants = data.getAll('participants');
  const overrides = Object.fromEntries(participants.flatMap(person => {
    const value = data.get(`share-${person}`).trim();
    return value ? [[person, value]] : [];
  }));
  allocate(amount, participants, overrides);
  const expenseId = data.get('id');
  const expense = { id: expenseId || id(), title, amount, payer: data.get('payer'), participants, overrides };
  const expenses = expenseId ? round.expenses.map(entry => entry.id === expenseId ? expense : entry) : [...round.expenses, expense];
  if (!Number.isSafeInteger(expenses.reduce((sum, entry) => sum + entry.amount, 0))) {
    throw new Error('회차의 총 지출이 계산 가능한 금액을 넘었습니다.');
  }
  saveRound({ ...round, expenses });
  dialog.close();
  render();
  notify('지출을 저장했어요.');
}

function confirmAction(title, message, label, action, itemId = '', style = 'primary') {
  openDialog(title, `<p>${message}</p><div class="actions">${button('취소', 'close', 'outline')}
    ${button(label, action, style, '', `data-id="${itemId}"`)}</div>`);
}

function beginExpense(expenseId = '') {
  if (currentRound().receipts.length) {
    confirmAction('입금 완료 기록이 있어요', '이미 확인한 입금은 그대로 보관됩니다. 지출을 바꾸면 실제로 주고받은 금액을 반영해 남은 송금이나 반환이 계산됩니다.', '계속', 'expense-open', expenseId);
    return;
  }
  expenseEditor(expenseId);
}

async function copyAnnouncement() {
  const round = currentRound();
  const content = announcement(round, state.members);
  try {
    await navigator.clipboard.writeText(content);
    notify('카톡 공지를 복사했어요.');
  } catch {
    openDialog('카톡 공지', `<p class="muted">아래 공지를 선택해 복사한 뒤 카카오톡에 붙여넣으세요.</p>
      <textarea class="statement" aria-label="카톡 공지 내용" readonly>${escape(content)}</textarea>
      <div class="actions">${button('닫기', 'close', 'primary')}</div>`);
    const field = dialog.querySelector('textarea');
    field.focus();
    field.select();
  }
}

const actions = {
  home: () => go('home'),
  members: () => go('members'),
  'new-round': () => go('new-round'),
  demo: () => go('detail', 'demo'),
  round: item => go('detail', item),
  'names-add': () => {
    const form = main.querySelector('#round-form');
    addNames(form);
    form.querySelector('#name-input').focus();
  },
  'name-remove': (_, control) => control.closest('.new-person').remove(),
  'member-add': () => memberEditor(),
  'member-edit': item => memberEditor(state.members.find(member => member.id === item)),
  'expense-add': () => beginExpense(),
  'expense-edit': item => beginExpense(item),
  'expense-open': item => expenseEditor(item),
  'expense-delete-prompt': item => confirmAction('지출을 삭제할까요?', '이 항목이 빠진 금액으로 정산됩니다. 입금 완료 기록은 정산에 계속 반영됩니다.', '지출 삭제', 'expense-delete', item, 'danger'),
  'expense-delete': item => {
    const round = currentRound();
    saveRound({ ...round, expenses: round.expenses.filter(entry => entry.id !== item) });
    dialog.close();
    render();
    notify('지출을 삭제했어요.');
  },
  'receipt-add': item => {
    const round = currentRound();
    const entry = calculate(round).pending[Number(item)];
    if (!entry) return;
    saveRound({ ...round, receipts: [...round.receipts, { ...entry, id: id() }] });
    render();
    notify('입금 완료를 기록했어요.');
  },
  'receipt-undo': item => confirmAction('입금 체크를 되돌릴까요?', '이 입금을 제외하고 남은 송금액을 다시 계산합니다.', '체크 되돌리기', 'receipt-remove', item),
  'receipt-remove': item => {
    const round = currentRound();
    saveRound({ ...round, receipts: round.receipts.filter(entry => entry.id !== item) });
    dialog.close();
    render();
    notify('입금 체크를 되돌렸어요.');
  },
  copy: () => copyAnnouncement(),
  close: () => dialog.close(),
};

document.addEventListener('click', event => {
  const control = event.target.closest('[data-action]');
  if (!control) return;
  try {
    actions[control.dataset.action](control.dataset.id, control);
  } catch (error) {
    notify(error.message);
  }
});

document.addEventListener('submit', event => {
  event.preventDefault();
  const form = event.target;
  try {
    if (form.id === 'round-form') submitRound(form);
    else if (form.dataset.form === 'member') submitMember(form);
    else if (form.dataset.form === 'expense') submitExpense(form);
  } catch (error) {
    showError(form, error.message);
  }
});

document.addEventListener('change', event => {
  if (event.target.name === 'participants') {
    const form = event.target.form;
    const field = form.elements[`share-${event.target.value}`];
    field.disabled = !event.target.checked;
  }
});

read();
render();
