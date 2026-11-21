import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'verification');
const origin = process.argv[2] || 'http://127.0.0.1:5173';
const browser = `http://127.0.0.1:${process.env.CHROME_PORT || 9333}`;
const page = await (await fetch(`${browser}/json/new?about:blank`, { method: 'PUT' })).json();
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
let id = 0;
const pending = new Map();
const errors = [];
socket.addEventListener('message', e => {
  const data = JSON.parse(e.data);
  if (data.id && pending.has(data.id)) {
    const { resolve, reject } = pending.get(data.id);
    pending.delete(data.id);
    data.error ? reject(new Error(JSON.stringify(data.error))) : resolve(data.result);
  }
  if (data.method === 'Runtime.exceptionThrown') errors.push(data.params.exceptionDetails);
});
function cdp(method, params = {}) {
  return new Promise((resolve, reject) => {
    pending.set(++id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function until(expression, timeout = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await evaluate(expression)) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out: ${expression}`);
}
async function settleScroll() {
  let last = -1, stable = 0;
  for (let attempt = 0; attempt < 100; attempt++) {
    const current = await evaluate('window.scrollY');
    stable = Math.abs(current - last) < 1 ? stable + 1 : 0;
    if (stable >= 4) return;
    last = current;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Scrolling did not settle');
}
async function click(selector, index = 0) {
  await settleScroll();
  await evaluate(`document.querySelectorAll(${JSON.stringify(selector)})[${index}].scrollIntoView({block:'center',behavior:'instant'})`);
  await settleScroll();
  const coords = await evaluate(`(() => {const e=document.querySelectorAll(${JSON.stringify(selector)})[${index}]; const b=e.getBoundingClientRect(); return {x:b.x+b.width/2,y:b.y+b.height/2};})()`);
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', ...coords });
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...coords });
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...coords });
}
async function escape() {
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
}
async function screenshot(name, full = false) {
  await settleScroll();
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1435, y: 899 });
  let clip;
  if (full) {
    const { cssContentSize: size } = await cdp('Page.getLayoutMetrics');
    clip = { x: 0, y: 0, width: size.width, height: size.height, scale: 1 };
  }
  const { data } = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: full, ...(clip ? { clip } : {}) });
  await fs.writeFile(path.join(output, name), Buffer.from(data, 'base64'));
}
try {
await cdp('Page.enable');
await cdp('Runtime.enable');
await cdp('Emulation.setEmulatedMedia', { features: [] });
await cdp('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: output });
await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await cdp('Emulation.setTouchEmulationEnabled', { enabled: false });
await cdp('Page.navigate', { url: origin });
await until(`document.querySelectorAll('.product-card').length===3 && !!document.querySelector('.hero-visual .drone-stage')?.__drone && document.querySelector('.hero-visual .drone-stage').getAttribute('aria-busy')==='false'`);
await evaluate(`Promise.all([document.fonts.ready, document.fonts.load('300 32px "Inter"')]).then(()=>true)`);
await until(`[...document.images].filter(e=>!e.loading||e.loading!=='lazy').every(e=>e.complete&&e.naturalWidth>0)`);
const results = [];
function check(name, actual, expected = true) {
  assert.deepEqual(actual, expected, name);
  results.push({ name, pass: true });
}
check('Offscreen GPU scenes are not initialized at startup', await evaluate(`[...document.querySelectorAll('.product-card .drone-stage')].every(e=>!e.__drone) && !document.querySelector('.globe-stage')?.getRotation && !document.querySelector('.shader-frame iframe')`));
await evaluate(`document.getElementById('products').scrollIntoView({behavior:'instant',block:'center'})`);
await until(`[...document.querySelectorAll('.product-card .drone-stage')].filter(e=>e.__drone&&e.getAttribute('aria-busy')==='false').length===3`);
await evaluate(`document.getElementById('contact').scrollIntoView({behavior:'instant',block:'center'})`);
await until(`!!document.querySelector('.globe-stage')?.getRotation`);
check('Desktop has no horizontal overflow', await evaluate('document.documentElement.scrollWidth<=innerWidth'));
check('Inter loaded locally', await evaluate(`getComputedStyle(document.body).fontFamily.includes('Inter') && document.fonts.check('300 32px "Inter"') && document.fonts.check('400 14px "Inter"')`));
check('Three real product cards', await evaluate(`[...document.querySelectorAll('.product-card h3')].map(e=>e.textContent)`), ['T50', 'T25', 'Mavic 3M']);
check('Both globe captions removed', await evaluate(`!document.body.textContent.includes('LOCAL ROOTS. GLOBAL PERSPECTIVE.')&&!document.body.textContent.includes('One planet. A better way to grow.')`));
await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 500, y: 120 });
check('Native arrow replaces the circular cursor', await evaluate(`!document.querySelector('.cursor') && !document.documentElement.classList.contains('custom-pointer') && getComputedStyle(document.body).cursor==='default'`));
check('Pause control removed from desktop', await evaluate(`!document.querySelector('.motion-switch')`));
check('All website text is uppercase', await evaluate(`[...document.querySelectorAll('h1,h2,h3,p,button,a,label')].every(e=>getComputedStyle(e).textTransform==='uppercase')`));
check('Headings use locally loaded expanded Archivo at readable medium weight', await evaluate(`getComputedStyle(document.querySelector('h1')).fontFamily.includes('Archivo') && getComputedStyle(document.querySelector('h1')).fontWeight==='500' && getComputedStyle(document.querySelector('h1')).fontStretch==='125%' && document.fonts.check('500 32px "Archivo"') && parseFloat(getComputedStyle(document.querySelector('h1')).letterSpacing)>0`));
check('Globe auto-rotation responds', await evaluate(`(()=>{const g=document.querySelector('.globe-stage');const a=g.getRotation().y;g.__step(2);return g.getRotation().y>a})()`));
check('Hero and all three cards show a 3D drone model', await evaluate(`[...document.querySelectorAll('.drone-stage')].filter(e=>e.querySelector('canvas')&&e.__drone).map(e=>e.dataset.product)`), ['t50', 't50', 't25', 'mavic']);
check('3D models are labelled as illustrations', await evaluate(`[...document.querySelectorAll('.drone-stage canvas')].every(c=>c.getAttribute('aria-label').includes('3D illustration'))`));
check('Startup and viewer loaders finish after the first render', await evaluate(`!document.querySelector('.site-loading,.viewer-pending') && [...document.querySelectorAll('.viewer-loading')].every(e=>e.getAttribute('aria-hidden')==='true')`));
await evaluate(`window.scrollTo({top:0,behavior:'instant'})`);
await settleScroll();
check('Hero 3D drone animates on its own', await evaluate(`(async()=>{const d=document.querySelector('.hero-visual .drone-stage').__drone;const a=d.state.frames,y=d.state.yaw;await new Promise(r=>setTimeout(r,700));return d.state.frames>a&&d.state.yaw>y})()`));
check('Offscreen globe is paused', await evaluate(`(()=>{const g=document.querySelector('.globe-stage');const y=g.getRotation().y;g.__step(2);return g.getRotation().y===y})()`));
check('3D rotation and propellers respond', await evaluate(`[...document.querySelectorAll('.product-card .drone-stage')].every(e=>{const d=e.__drone;const y=d.state.yaw,p=d.state.props.map(q=>q.rotation.y);const r=d.step(1);return r.yaw>y&&r.props.length>=4&&r.props.every((v,i)=>v!==p[i])})`));
await evaluate(`window.scrollTo({top:0,behavior:'instant'})`);
await screenshot('desktop-hero.png');
for (const section of ['products', 'approach', 'contact']) {
  await evaluate(`document.getElementById('${section}').scrollIntoView({behavior:'instant',block:'start'})`);
  await until(`getComputedStyle(document.getElementById('${section}').querySelector('[style]')).opacity==='1'`);
}
await until(`document.querySelector('.field-story img').complete && document.querySelector('.field-story img').naturalWidth>0`);
check('Natural crop photograph is a 3840 by 2160 export without a colour filter', await evaluate(`(()=>{const img=document.querySelector('.field-story img');return img.naturalWidth===3840&&img.naturalHeight===2160&&getComputedStyle(img).filter==='none'})()`));
await screenshot('desktop-contact.png');
await evaluate(`document.getElementById('approach').scrollIntoView({behavior:'instant',block:'center'})`);
await screenshot('desktop-natural-crops.png');
await evaluate(`window.scrollTo({top:0,behavior:'instant'})`);
await screenshot('desktop-full.png', true);
for (let i = 0; i < 3; i++) {
  await click('.product-buttons .text-link', i);
  await until('!!document.querySelector("dialog[open]")');
  check(`Product ${i + 1} detailed specs`, await evaluate(`document.querySelector('dialog[open] dl').children.length===8`));
  if (i === 0) await screenshot('desktop-product-detail.png');
  await escape();
  await until('!document.querySelector("dialog[open]")');
}
await click('.product-buttons .inquire-button', 1);
await until('!!document.querySelector("dialog[open] form")');
await until(`document.querySelector('dialog[open] select').value==='t25'`, 3000);
check('Inquiry preselects T25', true);
check('Empty inquiry invalid', await evaluate(`!document.querySelector('dialog[open] form').checkValidity()`));
await evaluate(`(() => {const set=(name,value)=>{const e=document.querySelector('dialog[open] [name='+name+']');const proto=e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}));};set('name','Test Grower');set('email','test@example.com');set('message','Test request: T25 compatibility for a small crop plot.');})()`);
await click('dialog[open] button[type="submit"]');
await until('!!document.querySelector(".export-confirmation")');
check('Honest local-only export status', await evaluate(`document.querySelector('.export-confirmation').textContent.includes('not been sent')`));
await escape();
const card3d = '.product-card:first-child .drone-stage';
await click(`${card3d} canvas`);
const dragFrom = await evaluate(`(()=>{const b=document.querySelector('${card3d}').getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2,yaw:document.querySelector('${card3d}').__drone.state.yaw}})()`);
await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, x: dragFrom.x, y: dragFrom.y });
for (let s = 1; s <= 10; s++) await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', button: 'left', buttons: 1, x: dragFrom.x + s * 12, y: dragFrom.y });
await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, x: dragFrom.x + 120, y: dragFrom.y });
check('Dragging turns the 3D drone', await evaluate(`document.querySelector('${card3d}').__drone.state.yaw-${dragFrom.yaw}>0.9`));
const keyYaw = await evaluate(`document.querySelector('${card3d}').__drone.step(0).yaw`);
await evaluate(`document.querySelector('${card3d} canvas').focus()`);
await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 });
await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 });
check('Arrow keys turn the 3D drone', await evaluate(`document.querySelector('${card3d}').__drone.state.yaw<${keyYaw}`));
await click('.product-card:first-child .view-toggle button:last-child');
await until(`!document.querySelector('${card3d}') && document.querySelector('.product-card:first-child .photo-plane img')?.naturalWidth>0 && document.querySelector('.product-card:first-child .photo-stage').getAttribute('aria-busy')==='false'`);
check('Real photo toggle shows the product photograph', await evaluate(`document.querySelector('.product-card:first-child .view-toggle button:last-child').getAttribute('aria-pressed')==='true'`));
await click('.product-card:first-child .view-toggle button:first-child');
await until(`!!document.querySelector('${card3d} canvas')`);
check('3D model toggle returns the drone', true);
await click('.hero-selectors button', 2);
await until(`document.querySelector('.hero-product-caption').textContent.includes('Mavic 3M')`);
check('Hero product selection swaps the 3D model', await evaluate(`document.querySelector('.hero-visual .drone-stage').dataset.product==='mavic'`));
await click('.topic-controls button', 1);
await until(`document.querySelector('.contact-rotation').textContent.includes('Parts & compatibility')`);
check('Contact information selector works', true);
await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
await click('.brand');
await until('window.scrollY<2');
check('No custom cursor or pause control on phone', await evaluate(`!document.querySelector('.cursor,.motion-switch')`));
check('Phone has no horizontal overflow', await evaluate('document.documentElement.scrollWidth<=innerWidth'));
check('Phone menu available', await evaluate(`getComputedStyle(document.querySelector('.menu-toggle')).display!=='none'`));
await click('.menu-toggle');
check('Mobile navigation expands', await evaluate(`document.querySelector('.menu-toggle').getAttribute('aria-expanded')==='true'`));
await click('.nav-links a', 0);
await until(`document.querySelector('.menu-toggle').getAttribute('aria-expanded')==='false'`);
check('Mobile navigation closes after selection', true);
await click('.brand');
await until('window.scrollY<2');
await screenshot('mobile-hero.png');
await screenshot('mobile-full.png', true);
await click('.product-buttons .text-link', 2);
await until('!!document.querySelector("dialog[open]")');
check('Mobile dialog stays within viewport', await evaluate(`(()=>{const r=document.querySelector('dialog[open]').getBoundingClientRect();return r.x>=0 && r.right<=innerWidth && r.height<=innerHeight;})()`));
await screenshot('mobile-product-detail.png');
await escape();
for (const width of [768, 1024]) {
  await cdp('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
  await until(`${width <= 850 ? '!!' : '!'}document.querySelector('.menu-toggle')`);
  check(`Width ${width} has no horizontal overflow`, await evaluate('document.documentElement.scrollWidth<=innerWidth'));
}
await cdp('Emulation.setDeviceMetricsOverride', { width: 320, height: 740, deviceScaleFactor: 1, mobile: true });
check('Small phone has no horizontal overflow', await evaluate('document.documentElement.scrollWidth<=innerWidth'));
await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
await cdp('Page.navigate', { url: origin });
await until(`!!document.querySelector('.hero-visual .drone-stage')?.__drone`);
await evaluate(`document.getElementById('contact').scrollIntoView({behavior:'instant',block:'center'})`);
await until(`!!document.querySelector('.globe-stage')?.getRotation`);
check('Reduced motion honored without a custom cursor', await evaluate(`(()=>{const g=document.querySelector('.globe-stage');const a=g.getRotation().y;g.__step(2);return g.getRotation().y===a&&!document.querySelector('.cursor')})()`));
await until(`!!document.querySelector('.hero-visual .drone-stage')?.__drone`);
await evaluate(`window.scrollTo({top:0,behavior:'instant'})`);
check('Reduced motion keeps the 3D drone still', await evaluate(`(async()=>{const d=document.querySelector('.hero-visual .drone-stage').__drone;await new Promise(r=>setTimeout(r,300));const a=d.state.frames,y=d.state.yaw;await new Promise(r=>setTimeout(r,700));return a>0&&d.state.frames===a&&d.state.yaw===y})()`));
check('Reduced motion disables the loading arc and shimmer', await evaluate(`getComputedStyle(document.querySelector('.loading-arc')).animationName==='none' && getComputedStyle(document.querySelector('.viewer-skeleton span'),'::after').animationName==='none'`));
const { identifier } = await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `const originalContext=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type.startsWith('webgl')?null:originalContext.call(this,type,...args)};` });
await cdp('Page.navigate', { url: origin });
await until(`document.querySelector('.hero-visual .drone-fallback')?.naturalWidth>0 && document.querySelector('.hero-visual .drone-stage').getAttribute('aria-busy')==='false'`);
check('WebGL unavailable shows an accessible real-photo fallback', await evaluate(`document.querySelector('.hero-visual canvas').hidden && !!document.querySelector('.hero-visual .drone-fallback').alt && !document.querySelector('.hero-visual .viewer-pending')`));
await cdp('Page.removeScriptToEvaluateOnNewDocument', { identifier });
check('No JavaScript exceptions', errors.length, 0);
await fs.writeFile(path.join(output, 'browser-results.json'), JSON.stringify({ origin, timestamp: new Date().toISOString(), checks: results, errors }, null, 2));
console.log(JSON.stringify({ checks: results.length, passed: results.length, screenshots: output, errors: errors.length }, null, 2));
} finally {
  await fetch(`${browser}/json/close/${page.id}`);
  socket.close();
}
