export const STORAGE_KEY = 'maegolmo-settlement-v1';
export const won = value => `${value.toLocaleString('ko-KR')}원`;
export const id = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
export const nameKey = name => name.trim().normalize('NFC').toLocaleLowerCase('ko-KR');
export const splitNames = input => input.split(/[,\r\n]+/).map(name => name.trim()).filter(Boolean);

export function today() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts();
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function allocate(total, participantIds, overrides) {
  if (!Number.isSafeInteger(total) || total <= 0) throw new Error('지출 금액을 1원 이상의 정수로 입력해 주세요.');
  if (!participantIds.length) throw new Error('나눠 낼 사람을 한 명 이상 선택해 주세요.');
  const shares = Object.create(null);
  const automatic = [];
  let remaining = total;
  for (const person of participantIds) {
    const value = overrides[person];
    if (value === '' || value === undefined) {
      automatic.push(person);
      continue;
    }
    const amount = Number(value);
    if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(amount)) {
      throw new Error('개인 부담액을 0원 이상의 정수로 입력해 주세요.');
    }
    remaining -= amount;
    if (remaining < 0) throw new Error('지정한 부담액 합계가 지출 금액을 넘었습니다.');
    shares[person] = amount;
  }
  if (!automatic.length && remaining) throw new Error('남은 금액을 나눠 낼 사람이 없습니다. 한 명 이상의 부담액을 비워 주세요.');
  if (automatic.length) {
    const base = Math.floor(remaining / automatic.length);
    const extra = remaining % automatic.length;
    automatic.forEach((person, index) => { shares[person] = base + Number(index < extra); });
  }
  return shares;
}

export function calculate(round) {
  const people = Object.fromEntries(round.people.map(({ id: person }) => [person, { paid: 0, share: 0, received: 0, sent: 0 }]));
  const obligations = new Map(round.people.map(({ id: person }) => [person, new Map()]));
  function addObligation(from, to, amount) {
    if (from === to || !amount) return;
    const outgoing = obligations.get(from);
    const incoming = obligations.get(to);
    outgoing.set(to, (outgoing.get(to) ?? 0) + amount);
    incoming.set(from, (incoming.get(from) ?? 0) - amount);
  }

  const expenseShares = new Map();
  let total = 0;
  for (const expense of round.expenses) {
    total += expense.amount;
    people[expense.payer].paid += expense.amount;
    const shares = allocate(expense.amount, expense.participants, expense.overrides);
    expenseShares.set(expense.id, shares);
    for (const [person, amount] of Object.entries(shares)) {
      people[person].share += amount;
      addObligation(person, expense.payer, amount);
    }
  }
  for (const { from, to, amount } of round.receipts) {
    people[from].sent += amount;
    people[to].received += amount;
    addObligation(from, to, -amount);
  }
  const debtors = [];
  const creditors = [];
  for (const { id: person } of round.people) {
    const { paid, share, received, sent } = people[person];
    const balance = paid - share - received + sent;
    if (balance > 0) creditors.push({ person, balance });
    if (balance < 0) debtors.push({ person, balance: -balance, transfers: new Map() });
  }
  function addTransfer(debtor, creditor, amount) {
    const to = creditor.person;
    debtor.transfers.set(to, (debtor.transfers.get(to) ?? 0) + amount);
    debtor.balance -= amount;
    creditor.balance -= amount;
  }

  // Keep each person's share with its original payer where their net balances allow it.
  for (const debtor of debtors) {
    for (const creditor of creditors) {
      if (!debtor.balance) break;
      const owed = obligations.get(debtor.person).get(creditor.person) ?? 0;
      const amount = Math.min(owed, debtor.balance, creditor.balance);
      if (amount > 0) addTransfer(debtor, creditor, amount);
    }
  }

  // Clear remaining balances from indirect debts and previously recorded payments.
  let sender = 0;
  let recipient = 0;
  while (sender < debtors.length && recipient < creditors.length) {
    const debtor = debtors[sender];
    const creditor = creditors[recipient];
    const amount = Math.min(debtor.balance, creditor.balance);
    if (amount) addTransfer(debtor, creditor, amount);
    if (!debtor.balance) sender++;
    if (!creditor.balance) recipient++;
  }
  const pending = debtors.flatMap(({ person: from, transfers }) =>
    Array.from(transfers, ([to, amount]) => ({ from, to, amount })));
  return { people, expenseShares, total, pending, remaining: pending.reduce((sum, item) => sum + item.amount, 0) };
}

export function personInfo(round, members, personId) {
  const person = round.people.find(entry => entry.id === personId);
  return members.find(member => member.id === person.memberId) ?? person;
}

export function account(person) {
  return [person.bank, person.account, person.holder ? `(예금주 ${person.holder})` : ''].filter(Boolean).join(' ');
}

export function announcement(round, members) {
  const { pending, total } = calculate(round);
  const get = person => personInfo(round, members, person);
  const lines = [
    `[매골모 회식비 정산]${round.demo ? ' · 시연용' : ''}`,
    round.title, round.date, '',
    '■ 지출 내역',
    ...round.expenses.map(item => `· ${item.title} ${won(item.amount)} (결제 ${get(item.payer).name})`),
    `총 지출 ${won(total)}`, '',
    '■ 보낼 금액',
    ...(pending.length ? pending.flatMap(({ from, to, amount }) => {
      const receiver = get(to);
      const bank = account(receiver);
      return [`· ${get(from).name} → ${receiver.name} ${won(amount)}`, ...(bank ? [`  ${bank}`] : [])];
    }) : ['남은 송금이 없습니다.']),
  ];
  if (round.receipts.length) {
    lines.push('', '■ 입금 완료', ...round.receipts.map(({ from, to, amount }) =>
      `· ${get(from).name} → ${get(to).name} ${won(amount)}`));
  }
  return lines.join('\n');
}

export function demoRound() {
  return {
    id: 'demo', title: '가을 라운딩 뒤풀이', date: '2026-10-24', demo: true,
    people: [
      { id: 'demo-a', name: '버디별' }, { id: 'demo-b', name: '라임퍼트' },
      { id: 'demo-c', name: '구름샷' }, { id: 'demo-d', name: '노을칩' },
    ],
    expenses: [
      { id: 'demo-meal', title: '1차 식사', amount: 128000, payer: 'demo-a', participants: ['demo-a', 'demo-b', 'demo-c', 'demo-d'], overrides: {} },
      { id: 'demo-drinks', title: '2차 술자리', amount: 57000, payer: 'demo-b', participants: ['demo-a', 'demo-b', 'demo-c'], overrides: { 'demo-a': 15000 } },
    ],
    receipts: [],
  };
}
