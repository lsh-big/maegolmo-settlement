import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const types = { '/': 'text/html', '/styles.css': 'text/css', '/app.js': 'text/javascript', '/settlement.js': 'text/javascript' };
const server = createServer(async (request, response) => {
  const path = request.url;
  if (!Object.hasOwn(types, path)) {
    response.writeHead(404).end();
    return;
  }
  const content = await readFile(new URL(`./dist${path === '/' ? '/index.html' : path}`, import.meta.url));
  response.writeHead(200, { 'Content-Type': `${types[path]}; charset=utf-8` }).end(content);
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const url = `http://127.0.0.1:${server.address().port}`;
const profile = await mkdtemp(join(tmpdir(), 'maegolmo-test-'));
const edge = spawn(process.argv[2] ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [
  '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-gpu',
  '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
], { windowsHide: true, stdio: 'ignore' });
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
  await page.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await browser.send('Browser.grantPermissions', { origin: url, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] });
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

  await retry(() => run("document.querySelector('h1')?.textContent"));
  async function assertMobileWidth() {
    const overflow = await run(`[...document.querySelectorAll('body *')].filter(el => {
      const bounds = el.getBoundingClientRect();
      return bounds.right > 390 && (el instanceof HTMLElement);
    }).map(el => [el.tagName, el.className, el.getBoundingClientRect().right])`);
    assert.equal(await run('document.documentElement.scrollWidth'), 390, JSON.stringify(overflow));
  }
  await assertMobileWidth();
  assert.match(await content(), /아직 등록된 회차/);
  await click('[data-action=demo]');
  assert.match(await content(), /시연용/);
  assert.match(await content(), /185,000원/);
  await click('[data-tab=members]');
  assert.match(await content(), /등록된 회원이 없어요/);
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
  assert.match(await content('.transfers'), /민수 → 미키 10,001원/);
  await assertMobileWidth();

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
  assert.match(await content('.transfers'), /현우 → 민수 1원/);
  assert.doesNotMatch(await content('.transfers'), /민수 → 미키/);
  assert.match(await content(), /입금 완료 기록[\s\S]*민수 → 미키 10,001원/);

  await page.send('Page.reload');
  await retry(() => run("document.querySelector('[data-action=round]')?.textContent"));
  await click('[data-action=round]');
  assert.match(await content('.detail-banner'), /150,000원/);
  assert.match(await content(), /입금 완료 기록[\s\S]*민수 → 미키 10,001원/);
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
  console.log('PASS: mobile layout, attendee entry and reuse, expenses and custom shares, clipboard, receipts, edit reconciliation, reload, demo isolation.');
} finally {
  page?.close();
  browser?.close();
  if (edge.pid && edge.exitCode === null) {
    const exited = once(edge, 'exit');
    edge.kill();
    await exited;
  }
  server.close();
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
}
