import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { announcement, calculate } from './dist/settlement.js';

const payers = ['motan', 'miki'];
const attendees = ['rara', 'bonggu', 'igeon', 'title'];
const participants = [...payers, ...attendees];
const splitRound = {
  people: participants.map(id => ({ id, memberId: `member-${id}`, name: id })),
  expenses: payers.map((payer, index) => ({ id: payer, title: `${index + 1}차`, amount: 60_000, payer, participants, overrides: {} })),
  receipts: [],
};
const expectedTransfers = attendees.flatMap(from => payers.map(to => ({ from, to, amount: 10_000 })));
const split = calculate(splitRound);
assert.equal(split.total, 120_000);
assert.equal(split.remaining, 80_000);
assert.deepEqual(split.pending, expectedTransfers);
const renamedMembers = [{ id: 'member-motan', name: '모탄버디' }, { id: 'member-rara', name: '라라버디' }];
assert.match(announcement(splitRound, renamedMembers), /라라버디 → 모탄버디 10,000원/);

const partial = calculate({ ...splitRound, receipts: [expectedTransfers[0]] });
assert.equal(partial.remaining, 70_000);
assert.deepEqual(partial.pending, expectedTransfers.slice(1));
assert.deepEqual(calculate({ ...splitRound, receipts: expectedTransfers }).pending, []);

const legacy = calculate({ ...splitRound, receipts: [{ from: attendees[0], to: payers[0], amount: 20_000 }] });
assert.equal(legacy.remaining, 60_000);
assert.ok(legacy.pending.every(({ from }) => from !== attendees[0]));
assert.equal(legacy.pending.filter(({ to }) => to === payers[0]).reduce((sum, entry) => sum + entry.amount, 0), 20_000);

const types = { '/': 'text/html', '/styles.css': 'text/css', '/app.js': 'text/javascript', '/settlement.js': 'text/javascript', '/receipt-photos.js': 'text/javascript' };
const testUrl = process.env.MAEGOLMO_TEST_URL;
const server = createServer(async (request, response) => {
  const path = new URL(request.url, 'http://127.0.0.1').pathname;
  if (!Object.hasOwn(types, path)) {
    response.writeHead(404).end();
    return;
  }
  const content = await readFile(new URL(`./dist${path === '/' ? '/index.html' : path}`, import.meta.url));
  response.writeHead(200, { 'Content-Type': `${types[path]}; charset=utf-8` }).end(content);
});
if (!testUrl) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
}
const url = testUrl ?? `http://127.0.0.1:${server.address().port}`;
const profile = await mkdtemp(join(tmpdir(), 'maegolmo-test-'));
const edge = spawn(process.argv[2] ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [
  '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-gpu',
  '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
], { windowsHide: true, stdio: 'ignore' });
const mobile = process.env.MAEGOLMO_TEST_DESKTOP !== '1';
const viewport = mobile ? { width: 390, height: 844, deviceScaleFactor: 2 } : { width: 1280, height: 900, deviceScaleFactor: 1 };
let launchError;
edge.once('error', error => { launchError = error; });

async function retry(operation) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (launchError) throw launchError;
    const value = await operation();
    if (value) return value;
    await delay(100);
  }
  throw new Error('Timed out waiting for the browser.');
}

async function connect(address) {
  const socket = new WebSocket(address);
  await once(socket, 'open');
  const pending = new Map();
  let counter = 0;
  socket.addEventListener('message', ({ data }) => {
    const reply = JSON.parse(data);
    const call = pending.get(reply.id);
    if (!call) return;
    pending.delete(reply.id);
    if (reply.error) call.reject(new Error(reply.error.message));
    else call.resolve(reply.result);
  });
  return {
    send(method, params = {}) {
      const id = ++counter;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    close: () => socket.close(),
  };
}

let browser;
let page;
try {
  const [port, browserPath] = (await retry(() => readFile(join(profile, 'DevToolsActivePort'), 'utf8').catch(() => ''))).trim().split(/\r?\n/);
  browser = await connect(`ws://127.0.0.1:${port}${browserPath}`);
  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  page = await connect(pages.find(item => item.type === 'page').webSocketDebuggerUrl);
  await page.send('Page.bringToFront');
  await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await page.send('Emulation.setDeviceMetricsOverride', { ...viewport, mobile });
  await browser.send('Browser.grantPermissions', { origin: new URL(url).origin, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] });
  await page.send('Page.navigate', { url });

  async function run(expression) {
    const result = await page.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true });
    if (result.exceptionDetails) throw new Error(result.result.description);
    return result.result.value;
  }
  const click = selector => run(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const fill = (selector, value) => run(`document.querySelector(${JSON.stringify(selector)}).value = ${JSON.stringify(value)}`);
  const content = (selector = '#main') => run(`document.querySelector(${JSON.stringify(selector)}).innerText`);
  const records = () => run("JSON.parse(localStorage.getItem('maegolmo-settlement-v1'))");
  const saveExpense = () => click('#dialog [type=submit]');
  const confirmedMinsu = '.transfer:has([data-action=receipt-undo][aria-label^="민수 → 미키"])';

  await retry(() => run("document.querySelector('h1')?.textContent"));
  async function assertViewportWidth() {
    const { clientWidth, scrollWidth } = await run("({ clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth })");
    assert.equal(scrollWidth, clientWidth);
    if (mobile) assert.equal(clientWidth, viewport.width);
  }
  await assertViewportWidth();
  assert.match(await content(), /아직 등록된 회차/);
  assert.equal(await run("document.querySelector('.topbar [data-action=members]') === null"), true);
  assert.match(await content('.foot [data-action=members]'), /회원 명단/);
  await click('[data-action=demo]');
  assert.match(await content(), /시연용/);
  assert.match(await content(), /185,000원/);
  await click('[data-tab=members]');
  assert.match(await content(), /등록된 회원이 없어요/);
  await click('[data-action=back]');
  await retry(() => run("document.querySelector('h1')?.textContent === '가을 라운딩 뒤풀이'"));
  await run('history.back()');
  await retry(() => run("document.querySelector('h1')?.textContent === '매골모 회식비 정산'"));
  await click('[data-tab=rounds]');
  await click('[data-action=new-round]');
  await fill('[name=title]', '검증 회식');
  await fill('#name-input', '미키, 민수, 지은, 현우');
  await click('[data-action=names-add]');
  assert.equal(await run("document.querySelectorAll('.new-name').length"), 4);
  await fill('#name-input', '  미키\n\n임시\n  ');
  await click('[data-action=names-add]');
  assert.equal(await run("document.querySelectorAll('.new-name').length"), 5);
  await click('.new-person:last-child [data-action=name-remove]');
  await fill('.new-person:last-child .new-name', '  현우  ');
  await click('#round-form [type=submit]');
  let stored = await records();
  assert.deepEqual(stored.members.map(person => person.name), ['미키', '민수', '지은', '현우']);
  const [first, second, third, fourth] = stored.rounds[0].people.map(person => person.id);

  await click('[data-action=expense-add]');
  await fill('[name=title]', '1차 식사');
  await fill('[name=amount]', '100003');
  await fill('[name=payer]', first);
  await saveExpense();
  assert.match(await run("document.querySelector('.people-tags').textContent"), /현우 25,000원/);
  await click('[data-action=expense-add]');
  await fill('[name=title]', '2차 술자리');
  await fill('[name=amount]', '50001');
  await fill('[name=payer]', second);
  await click(`[name=participants][value="${fourth}"]`);
  await fill(`[name=share-${first}]`, '0');
  await fill(`[name=share-${third}]`, '50002');
  await saveExpense();
  assert.match(await content('#dialog'), /지출 금액을 넘었습니다/);
  await fill(`[name=share-${third}]`, '15000');
  await fill(`[name=share-${second}]`, '1');
  await saveExpense();
  assert.match(await content('#dialog'), /나눠 낼 사람이 없습니다/);
  await fill(`[name=share-${second}]`, '');
  await saveExpense();
  assert.match(await content('.detail-banner'), /150,004원/);
  assert.match(await content('.detail-banner'), /75,002원/);
  assert.match(await content('.transfer:has([data-action=receipt-add][aria-label^="민수 → 미키"])'), /미키 10,001원/);
  assert.match(await content(`[data-person="${first}"] .participation-list`), /1차 식사 부담 25,001원 · 결제자[\s\S]*2차 술자리 부담 0원/);
  assert.match(await content(`[data-person="${second}"] .participation-list`), /2차 술자리 부담 35,001원 · 결제자/);
  assert.doesNotMatch(await content(`[data-person="${fourth}"] .participation-list`), /2차 술자리/);
  await assertViewportWidth();

  await click('[data-tab=members]');
  await click('[data-action=member-edit]');
  await fill('[name=bank]', '가상은행');
  await fill('[name=account]', 'TEST-ONLY');
  await fill('[name=holder]', '미키');
  await click('#dialog [type=submit]');
  await click('[data-tab=rounds]');
  await click('[data-action=round]');
  await click('[data-action=copy]');
  const copied = await retry(() => run(`document.querySelector('#toast').textContent.includes('카톡 공지를 복사')
    ? 'copied' : document.querySelector('.statement') ? 'fallback' : ''`));
  if (copied === 'fallback') {
    const reason = await run("navigator.clipboard.writeText('clipboard check').then(() => 'write succeeded', error => error.message)");
    assert.fail(`Clipboard rejected the write: ${reason}`);
  }
  const clipboard = (await run('navigator.clipboard.readText()')).replaceAll('\r\n', '\n');
  assert.match(clipboard, /1차 식사 100,003원 \(결제 미키\)/);
  assert.match(clipboard, /2차 술자리 50,001원 \(결제 민수\)/);
  assert.match(clipboard, /총 지출 150,004원/);
  assert.match(clipboard, /민수 → 미키 10,001원\n  가상은행 TEST-ONLY \(예금주 미키\)/);

  await click('[data-action=receipt-add]');
  assert.match(await content('.detail-banner'), /65,001원/);
  await click('[data-action=expense-edit]');
  assert.match(await content('#dialog'), /입금 완료 기록이 있어요/);
  await click('[data-action=expense-open]');
  await fill('[name=amount]', '99999');
  await saveExpense();
  const jieunGroup = '.transfer-group:has([data-action=receipt-add][aria-label^="지은 → 미키"])';
  const jieunToMinsu = '[data-action=receipt-add][aria-label="지은 → 민수 1원 입금 완료 체크"]';
  assert.equal(await content(`${jieunGroup} h3`), '지은');
  assert.equal(await run(`document.querySelector(${JSON.stringify(jieunGroup)}).querySelectorAll('[data-action=receipt-add]').length`), 2);
  assert.equal(await run(`document.querySelector(${JSON.stringify(jieunGroup)}).querySelector(${JSON.stringify(jieunToMinsu)}) !== null`), true);
  await click(jieunToMinsu);
  assert.match(await content(jieunGroup), /민수 1원[\s\S]*입금 완료/);
  assert.equal(await run(`document.querySelector(${JSON.stringify(jieunGroup)}).querySelectorAll('[data-action=receipt-add]').length`), 1);
  await click(`${jieunGroup} [data-action=receipt-undo]`);
  await click('#dialog [data-action=receipt-remove]');
  assert.equal(await run(`document.querySelector(${JSON.stringify(jieunToMinsu)}) !== null`), true);
  assert.match(await content(confirmedMinsu), /미키 10,001원[\s\S]*입금 완료/);

  await page.send('Page.reload');
  await retry(() => run("document.querySelector('.detail-banner')?.textContent"));
  assert.match(await content('.detail-banner'), /150,000원/);
  assert.match(await content(confirmedMinsu), /미키 10,001원[\s\S]*입금 완료/);
  await click('[data-tab=rounds]');
  await click('[data-action=new-round]');
  assert.equal(await run("document.querySelectorAll('[name=members]').length"), 4);
  await click('[name=members]');
  await fill('[name=title]', '다음 회차');
  await fill('#name-input', '하루손님');
  await click('[data-action=names-add]');
  await click('.guest');
  await click('#round-form [type=submit]');
  stored = await records();
  assert.equal(stored.members.length, 4);
  assert.deepEqual(stored.rounds[0].people.map(person => person.name), ['미키', '하루손님']);
  assert.match(await content(), /하루손님 게스트/);

  await click('[aria-label="미키 회원 정보 수정"]');
  assert.equal(await run("document.querySelector('#dialog [name=account]').value"), 'TEST-ONLY');
  await fill('#dialog [name=name]', '민수');
  await click('#dialog [type=submit]');
  assert.match(await content('#dialog'), /같은 이름의 회원이 이미 있습니다/);
  await fill('#dialog [name=name]', '미키버디');
  await fill('#dialog [name=bank]', '가상은행2');
  await click('#dialog [type=submit]');
  assert.match(await content(), /미키버디/);
  assert.equal((await records()).members.length, 4);
  await page.send('Page.reload');
  await retry(() => run("document.querySelector('.detail-banner')?.textContent"));
  await click('[data-tab=members]');
  assert.match(await content(), /미키버디\s+가상은행2 TEST-ONLY/);
  await click('[data-tab=rounds]');
  await click('.round-card:last-child [data-action=round]');
  assert.match(await content(confirmedMinsu), /미키버디 10,001원[\s\S]*입금 완료/);
  await click('[data-tab=rounds]');
  await click('[data-action=new-round]');
  assert.match(await content('#round-form'), /미키버디/);
  await click('[data-tab=rounds]');
  await click('.round-card:last-child [data-action=round]');
  await click('[data-action=edit-roster]');
  assert.match(await content(), /완료된 입금은 실제 정산에 계속 반영/);
  await click(`[name=people][value="${first}"]`);
  await click(`[name=people][value="${third}"]`);
  await fill('#name-input', '새참석');
  await click('[data-action=names-add]');
  await click('.guest');
  await click('#round-form [type=submit]');
  await retry(() => run("document.querySelector('.detail-banner')?.textContent"));
  assert.match(await content(), /참석자 3명/);
  assert.match(await content(), /미키버디 이전 참석자/);
  assert.match(await content(), /지은 이전 참석자/);
  assert.match(await content(), /새참석 게스트/);
  assert.match(await content(confirmedMinsu), /미키버디 10,001원[\s\S]*입금 완료/);
  stored = await records();
  const updated = stored.rounds[1];
  const added = updated.people.find(person => person.name === '새참석');
  assert.equal(updated.expenses[0].payer, first);
  assert.deepEqual(updated.expenses[0].participants, [first, second, third, fourth]);
  assert.equal(updated.receipts.length, 1);
  assert.equal(stored.members.length, 4);
  await assertViewportWidth();

  await click('[data-action=expense-add]');
  await click('[data-action=expense-open]');
  assert.deepEqual(await run("[...document.querySelectorAll('[name=participants]:checked')].map(el => el.value)"), [second, fourth, added.id]);
  await click('#dialog [data-action=close]');
  await click('[aria-label="2차 술자리 수정"]');
  await click('[data-action=expense-open]');
  await click(`[name=participants][value="${third}"]`);
  await click(`[name=participants][value="${added.id}"]`);
  await saveExpense();
  assert.deepEqual((await records()).rounds[1].expenses[1].participants, [first, second, added.id]);
  await page.send('Page.reload');
  await retry(() => run("document.querySelector('.detail-banner')?.textContent"));
  assert.match(await content(), /참석자 3명/);
  assert.match(await content(confirmedMinsu), /미키버디 10,001원[\s\S]*입금 완료/);
  assert.match(await content(`[data-person="${added.id}"] .participation-list`), /2차 술자리 부담 25,000원/);
  assert.doesNotMatch(await content(`[data-person="${third}"] .participation-list`), /2차 술자리/);

  await click('[data-action=expense-add]');
  await click('[data-action=expense-open]');
  await fill('[name=title]', '3차 간식');
  await fill('[name=amount]', '5000');
  await fill('[name=payer]', second);
  await click(`[name=participants][value="${second}"]`);
  await click(`[name=participants][value="${fourth}"]`);

  const attachReceipt = (width, color) => run(`(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = ${width};
    canvas.height = 40;
    const context = canvas.getContext('2d');
    context.fillStyle = ${JSON.stringify(color)};
    context.fillRect(0, 0, canvas.width, canvas.height);
    const photo = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    const input = document.querySelector('[name=receipt-photo]');
    const transfer = new DataTransfer();
    transfer.items.add(new File([photo], 'test-receipt.png', { type: 'image/png' }));
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await run(`(() => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(['invalid image'], 'broken.jpg', { type: 'image/jpeg' }));
    document.querySelector('[name=receipt-photo]').files = transfer.files;
  })()`);
  await saveExpense();
  await retry(() => run("document.querySelector('#dialog .form-error')?.textContent.includes('사진을 읽을 수 없습니다')"));
  assert.equal((await records()).rounds[1].expenses.length, 2);
  await attachReceipt(100, '#205741');
  await saveExpense();
  await retry(() => run("document.querySelector('[data-action=photo-view]')"));
  assert.match(await content(`[data-person="${second}"] .participation-list`), /3차 간식 결제만/);
  assert.match(await content(`[data-person="${added.id}"] .participation-list`), /3차 간식 부담 5,000원/);
  const originalPhotoId = (await records()).rounds[1].expenses[2].receiptPhotoId;
  const viewReceipt = async width => {
    await click('[aria-label="3차 간식 영수증 보기"]');
    await retry(() => run(`document.querySelector('.receipt-preview img')?.naturalWidth === ${width}`));
    await assertViewportWidth();
    await click('#dialog [data-action=close]');
  };
  await viewReceipt(100);
  await page.send('Page.reload');
  await retry(() => run("document.querySelector('.detail-banner')?.textContent"));
  await viewReceipt(100);

  await click('[aria-label="3차 간식 수정"]');
  await click('[data-action=expense-open]');
  await attachReceipt(2400, '#725c24');
  await saveExpense();
  await retry(() => run("!document.querySelector('#dialog').open"));
  const replacementPhotoId = (await records()).rounds[1].expenses[2].receiptPhotoId;
  assert.notEqual(replacementPhotoId, originalPhotoId);
  await viewReceipt(2000);
  const photoExists = photoId => run(`import('./receipt-photos.js').then(async photos => Boolean(await photos.readReceiptPhoto(${JSON.stringify(photoId)})))`);
  await retry(async () => !(await photoExists(originalPhotoId)));

  await click('[aria-label="3차 간식 수정"]');
  await click('[data-action=expense-open]');
  await click('[name=remove-receipt-photo]');
  await saveExpense();
  await retry(() => run("!document.querySelector('[data-action=photo-view]')"));
  assert.equal((await records()).rounds[1].expenses[2].amount, 5000);
  await retry(async () => !(await photoExists(replacementPhotoId)));

  await click('[aria-label="3차 간식 수정"]');
  await click('[data-action=expense-open]');
  await attachReceipt(100, '#205741');
  await saveExpense();
  await retry(() => run("document.querySelector('[data-action=photo-view]')"));
  const finalPhotoId = (await records()).rounds[1].expenses[2].receiptPhotoId;

  await click('.foot [data-action=members]');
  await click('[aria-label="미키버디 회원 삭제"]');
  assert.match(await content('#dialog'), /삭제 시점의 이름과 계좌 정보가 남습니다/);
  await click('#dialog [data-action=close]');
  assert.equal((await records()).members.length, 4);
  await click('[aria-label="미키버디 회원 삭제"]');
  await click('#dialog [data-action=member-delete]');
  assert.doesNotMatch(await content(), /미키버디/);
  assert.equal((await records()).members.length, 3);
  await assertViewportWidth();
  await click('[data-action=back]');
  await retry(() => run("document.querySelector('.detail-banner')?.textContent"));
  assert.match(await content(confirmedMinsu), /미키버디 10,001원[\s\S]*입금 완료/);
  assert.match(await content('.transfers'), /가상은행2 TEST-ONLY/);
  assert.equal(await run(`document.querySelector('[data-person="${first}"] [data-action=member-edit]') === null`), true);
  await page.send('Page.reload');
  await retry(() => run("document.querySelector('.detail-banner')?.textContent"));
  assert.match(await content('.transfers'), /가상은행2 TEST-ONLY/);
  await click('[data-tab=rounds]');
  await click('[data-action=new-round]');
  assert.equal(await run("document.querySelectorAll('[name=members]').length"), 3);
  assert.doesNotMatch(await content('#round-form'), /미키버디/);

  await click('[data-action=back]');
  await retry(() => run("document.querySelectorAll('.round-card').length === 2"));
  await click('[aria-label="검증 회식 회차 수정"]');
  await fill('#round-info-form [name=title]', '수정된 회식');
  await fill('#round-info-form [name=date]', '2026-11-01');
  await click('#round-info-form [type=submit]');
  await retry(() => run("document.querySelector('[aria-label=\"수정된 회식 회차 수정\"]')"));
  assert.match(await content(), /수정된 회식\s+2026\. 11\. 01/);
  await click('[aria-label="수정된 회식 회차 삭제"]');
  assert.match(await content('#dialog'), /입금 기록, 영수증 사진이 삭제됩니다/);
  await click('#dialog [data-action=close]');
  assert.equal((await records()).rounds.length, 2);
  await click('[aria-label="수정된 회식 회차 삭제"]');
  await click('#dialog [data-action=round-delete]');
  stored = await records();
  assert.deepEqual(stored.rounds.map(round => round.title), ['다음 회차']);
  assert.equal(stored.members.length, 3);
  await retry(async () => !(await photoExists(finalPhotoId)));
  await run('history.back()');
  await retry(() => run("document.querySelectorAll('.round-card').length === 1"));
  await assertViewportWidth();
  console.log(`PASS (${mobile ? 'mobile' : 'desktop'}): layout and back navigation, round and member deletion with historical records preserved as applicable, roster editing, clipboard, payments, and receipt photos.`);
} finally {
  page?.close();
  browser?.close();
  if (edge.pid && edge.exitCode === null) {
    const exited = once(edge, 'exit');
    edge.kill();
    await exited;
  }
  if (!testUrl) server.close();
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
}
