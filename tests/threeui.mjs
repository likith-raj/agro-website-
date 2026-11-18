import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'verification');
const origin = process.argv[2] || 'http://127.0.0.1:5173';
const browser = `http://127.0.0.1:${process.env.CHROME_PORT || 9333}`;
const page = await (await fetch(`${browser}/json/new?about:blank`, { method: 'PUT' })).json();
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
let id = 0;
const pending = new Map(), contexts = new Map();
const errors = [], requests = [], results = [];
function cdp(method, params = {}, sessionId) {
  return new Promise((resolve, reject) => {
    const requestId = ++id;
    const timer = setTimeout(() => { pending.delete(requestId); reject(new Error(`CDP timeout: ${method} ${JSON.stringify({ ...params, sessionId }).slice(0, 300)}`)); }, 60000);
    pending.set(requestId, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(new Error(`${method}: ${error.message}; ${JSON.stringify(params).slice(0, 220)}`)); } });
    socket.send(JSON.stringify({ id: requestId, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
}
socket.addEventListener('message', async event => {
  const data = JSON.parse(event.data);
  if (data.id && pending.has(data.id)) {
    const { resolve, reject } = pending.get(data.id);
    pending.delete(data.id);
    data.error ? reject(new Error(JSON.stringify(data.error))) : resolve(data.result);
  }
  if (data.method === 'Runtime.executionContextCreated' && data.params.context.auxData?.isDefault) {
    const context = data.params.context;
    contexts.set(context.auxData.frameId, { id: context.id, sessionId: data.sessionId });
  }
  if (data.method === 'Runtime.executionContextDestroyed') {
    for (const [frame, context] of contexts) if (context.id === data.params.executionContextId && context.sessionId === data.sessionId) contexts.delete(frame);
  }
  if (data.method === 'Runtime.exceptionThrown') errors.push(data.params.exceptionDetails);
  if (data.method === 'Network.requestWillBeSent') requests.push(data.params.request.url);
  if (data.method === 'Target.attachedToTarget') {
    const session = data.params.sessionId;
    try {
      await Promise.all([cdp('Runtime.enable', {}, session), cdp('Network.enable', {}, session)]);
      await cdp('Network.setBlockedURLs', { urls: ['https://*'] }, session);
      await cdp('Runtime.runIfWaitingForDebugger', {}, session);
    } catch (error) {
      errors.push({ message: error.message });
    }
  }
});
async function evaluate(expression, frame) {
  const start = Date.now();
  for (;;) {
    const context = frame ? contexts.get(frame.frameId) : undefined;
    if (frame && !context) {
      if (Date.now() - start > 20000) throw new Error('Iframe context was not restored: ' + frame.frameId);
      await new Promise(resolve => setTimeout(resolve, 100));
      continue;
    }
    try {
      const result = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, ...(context ? { contextId: context.id } : {}) }, context?.sessionId);
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    } catch (error) {
      if (!frame || !error.message.includes('Cannot find context') || Date.now() - start > 20000) throw error;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
}
async function until(expression, context, timeout = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await evaluate(expression, context)) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  console.log('Browser exceptions', JSON.stringify(errors));
  throw new Error(`Timed out: ${expression}`);
}
function check(name, value, expected = true) {
  assert.deepEqual(value, expected, name);
  results.push({ name, pass: true });
  console.log('PASS', name);
}
async function settle() {
  let last = -1, stable = 0;
  for (let attempt = 0; attempt < 100; attempt++) {
    const current = await evaluate('scrollY');
    stable = Math.abs(current - last) < 1 ? stable + 1 : 0;
    if (stable >= 4) return;
    last = current;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Scroll did not settle');
}
async function scene(selector) {
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center',behavior:'instant'})`);
  await settle();
  await until(`!!document.querySelector(${JSON.stringify(selector + ' iframe')})`);
  const title = await evaluate(`document.querySelector(${JSON.stringify(selector + ' iframe')}).title`);
  const start = Date.now();
  while (Date.now() - start < 20000) {
    for (const frameId of contexts.keys()) {
      const frame = { frameId };
      if (await evaluate('document.title', frame) === title) return frame;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('No iframe context for: ' + title);
}
async function click(selector, context, frameSelector) {
  await settle();
  const point = await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`, context);
  if (frameSelector) {
    const frame = await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(frameSelector)}).getBoundingClientRect();return{x:r.x,y:r.y}})()`);
    point.x += frame.x; point.y += frame.y;
  }
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point });
}
async function escape() {
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
}
async function screenshot(name) {
  await settle();
  const { data } = await cdp('Page.captureScreenshot', { format: 'png' });
  await fs.writeFile(path.join(output, name), Buffer.from(data, 'base64'));
}
try {
await cdp('Page.enable');
await cdp('Page.navigate', { url: 'about:blank' });
await cdp('Runtime.enable');
await cdp('Network.enable');
await cdp('Network.setBlockedURLs', { urls: ['https://*'] });
await cdp('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
await cdp('Emulation.setEmulatedMedia', { features: [] });
await cdp('Emulation.setTouchEmulationEnabled', { enabled: false });
await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await cdp('Page.navigate', { url: origin });
await until(`!!document.querySelector('.agro-command')`);
await evaluate('document.fonts.ready');
check('Command bar has real navigation labels', await evaluate(`[...document.querySelectorAll('.atd-modern__item')].map(e=>e.textContent)`), ['Products', 'Our approach', 'Contact']);
const dockPoint = await evaluate(`(()=>{const r=document.querySelector('.atd-modern__item').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', ...dockPoint });
await until(`Number(document.querySelector('.atd-modern__dock').dataset.dockMax)>.5`);
check('Authored proximity spring grows the dock', true);
await click('.atd-modern__cta');
await until(`!!document.querySelector('dialog[open] form')`);
check('Command bar inquiry opens', true);
await escape();
const shelf = await scene('.shelf-frame');
await until(`document.querySelector('#gl').classList.contains('on') && document.querySelectorAll('.tli').length===10`, shelf, 90000);
await until(`!document.querySelector('.loader').offsetParent || document.querySelector('.loader').classList.contains('gone')`, shelf, 90000);
check('All ten shelf slots use only the three real products', await evaluate(`[...document.querySelectorAll('.tli h2')].map(e=>e.textContent)`, shelf), ['T50', 'T25', 'MAVIC 3M', 'T50', 'T25', 'MAVIC 3M', 'T50', 'T25', 'MAVIC 3M', 'T50']);
check('Shelf has local Inter', await evaluate(`document.fonts.check('400 14px "Inter"')`, shelf));
check('Shelf typography is uppercase', await evaluate(`[...document.querySelectorAll('h2,p,button')].every(e=>getComputedStyle(e).textTransform==='uppercase')`, shelf));
check('Shelf has no fictitious price or old game titles', await evaluate(`!document.body.textContent.includes('£68')&&!document.body.textContent.includes('Nightreign')`, shelf));
await screenshot('desktop-threeui-shelf.png');
for (let attempt = 0; attempt < 10; attempt++) {
  await click('.tli:nth-child(2)', shelf, '.shelf-frame iframe');
  try { await until(`document.querySelector('#detail').classList.contains('on')`, shelf, 2000); break; } catch {}
}
await until(`document.querySelector('#detail').classList.contains('on') && document.querySelector('#detail-title').textContent==='T25'`, shelf);
check('Shelf selection opens T25', true);
await click('#detail-look', shelf, '.shelf-frame iframe');
await screenshot('desktop-threeui-shelf-turn.png');
await click('#product-specifications', shelf, '.shelf-frame iframe');
await until(`document.querySelector('dialog[open] h2')?.textContent==='T25'`);
check('Shelf opens the real T25 specifications', true);
await escape();
await click('#detail-close', shelf, '.shelf-frame iframe');
await until(`!document.querySelector('#detail').classList.contains('on')`, shelf);
check('Shelf closes selected guide', true);
check('Both shelves have five distinct guide editions', await evaluate(`(()=>{const BOOKS=JSON.parse([...document.scripts].map(s=>s.textContent).join('\\n').match(/const BOOKS = (\\[.*?\\]);/)[1]);return BOOKS.filter(b=>b.shelf===0).length===5&&BOOKS.filter(b=>b.shelf===1).length===5&&new Set(BOOKS.map(b=>b.id)).size===10})()`, shelf));
await evaluate(`document.querySelector('.tli:nth-child(9)').scrollIntoView({inline:'center',block:'nearest',behavior:'instant'})`, shelf);
for (let attempt = 0; attempt < 10; attempt++) {
  await click('.tli:nth-child(9)', shelf, '.shelf-frame iframe');
  try { await until(`document.querySelector('#detail').classList.contains('on')`, shelf, 2000); break; } catch {}
}
await until(`document.querySelector('#detail').classList.contains('on')&&document.querySelector('#detail-title').textContent==='MAVIC 3M'`, shelf);
await click('#product-specifications', shelf, '.shelf-frame iframe');
await until(`document.querySelector('dialog[open] h2')?.textContent==='Mavic 3M'`);
check('Lower-shelf edition maps to real Mavic specifications', true);
await escape();
await click('#detail-close', shelf, '.shelf-frame iframe');
await until(`!document.querySelector('#detail').classList.contains('on')`, shelf);
const paper = await scene('.paper-frame');
await until(`!!window.__sheet && window.__sheet.state().intro>.8`, paper);
check('Original paper WebGL scene renders', await evaluate(`window.__sheet.renderer.info.render.calls>0 && !!document.querySelector('#gl')`, paper));
check('Paper uses Agro branding with an isolated sandbox', await evaluate(`document.querySelector('#bg h1').textContent==='AGRO'`, paper) && await evaluate(`document.querySelector('.paper-frame iframe').getAttribute('sandbox')==='allow-scripts'`));
check('Paper shows the five honest sales and compliance steps', await evaluate(`(()=>{const art=[...document.scripts].map(s=>s.textContent).join('\\n').match(/function drawGlass[\\s\\S]*?\\n}/)[0];return ['PRODUCT IDENTITY','PUBLISHED SPECIFICATIONS','SELLER DOCUMENTATION','APPLICABLE REQUIREMENTS','HANDOVER & SUPPORT','NOT A LICENSE, CERTIFICATION OR MANUFACTURER AUTHORIZATION.'].every(text=>art.includes(text))&&!art.includes('signature')})()`, paper));
await screenshot('desktop-threeui-paper.png');
const paperPoint = await evaluate(`(()=>{const q=window.__sheet.state().quad;return{x:q.reduce((s,p)=>s+p[0],0)/4,y:q.reduce((s,p)=>s+p[1],0)/4}})()`, paper);
const framePoint = await evaluate(`(()=>{const r=document.querySelector('.paper-frame iframe').getBoundingClientRect();return{x:r.x,y:r.y}})()`);
const start = { x: paperPoint.x + framePoint.x, y: paperPoint.y + framePoint.y };
await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', ...start });
await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...start });
await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', buttons: 1, x: start.x + 70, y: start.y - 10 });
await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, x: start.x + 70, y: start.y - 10 });
check('Original paper drag changes rotation', await evaluate(`Math.abs(window.__sheet.state().dragYaw)>.1`, paper));
await evaluate(`window.__retainedPaper=window.__sheet;true`, paper);
await evaluate(`window.scrollTo({top:0,behavior:'instant'})`);
await settle();
await until(`new Promise(r=>{const a=window.__sheet.uni.uTime.value;setTimeout(()=>r(window.__sheet.uni.uTime.value===a),300)})`, paper);
const time = await evaluate(`window.__sheet.uni.uTime.value`, paper);
await new Promise(resolve => setTimeout(resolve, 250));
check('Offscreen paper stops rendering without a pause button', await evaluate(`window.__sheet.uni.uTime.value`, paper), time);
await scene('.paper-frame');
await until(`window.__sheet.uni.uTime.value>${time}`, paper);
check('Returning to paper resumes the retained scene', await evaluate(`window.__sheet===window.__retainedPaper`, paper));
await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
const mobileShelf = await scene('.shelf-frame');
await until(`document.body.classList.contains('mobile') && document.querySelector('#gl').classList.contains('on')`, mobileShelf);
check('Authored shelf switches to mobile stack', await evaluate(`getComputedStyle(document.querySelector('.mbar')).display==='flex'`, mobileShelf));
await click('#menubtn', mobileShelf, '.shelf-frame iframe');
await click('#menu button:nth-child(3)', mobileShelf, '.shelf-frame iframe');
await until(`document.querySelector('#mbar-title').textContent==='MAVIC 3M'`, mobileShelf);
check('Mobile shelf catalogue selects Mavic 3M', true);
await screenshot('mobile-threeui-shelf.png');
await click('#mbar-look', mobileShelf, '.shelf-frame iframe');
await click('#product-specifications', mobileShelf, '.shelf-frame iframe');
await until(`document.querySelector('dialog[open] h2')?.textContent==='Mavic 3M'`);
check('Mobile shelf specifications bridge works', true);
await escape();
check('Mobile remains horizontally contained', await evaluate('document.documentElement.scrollWidth<=innerWidth'));
check('No external HTTPS assets required', requests.filter(url => url.startsWith('https://')), []);
check('No page or iframe JavaScript exceptions', errors.length, 0);
await fs.writeFile(path.join(output, 'threeui-browser-results.json'), JSON.stringify({ origin, checks: results, errors, externalRequests: requests.filter(url => url.startsWith('https://')) }, null, 2));
console.log(JSON.stringify({ checks: results.length, passed: results.length, errors: errors.length, offlineAssets: true }, null, 2));
} finally {
  await fetch(`${browser}/json/close/${page.id}`);
  socket.close();
}
