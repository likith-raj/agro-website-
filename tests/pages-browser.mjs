import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Node 22+; use an already-running Chrome. Read-only scene telemetry; no forced app state, DOM input, or style overrides.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const origin = process.argv[2] || 'http://127.0.0.1:5173';
const browser = `http://127.0.0.1:${process.env.CHROME_PORT || 9334}`;
const prefix = origin.startsWith('file:') ? 'pages-offline' : 'pages-dev';
const output = path.join(root, 'verification'), downloads = path.join(output, `${prefix}-downloads`);
const routes = ['home', 'shelf', 'products', 'about', 'contact'];
const sections = { home: ['.hero', '#flight', '#motion', '#home-earth'], shelf: ['#shelf'], products: ['#products', '.parts-explorer', '#anatomy', '.equipment-section'], about: ['#approach'], contact: ['#contact'] };
const titles = { home: 'Agro Drone Tech — Built for the field.', shelf: 'Shelf — Agro Drone Tech', products: 'Products — Agro Drone Tech', about: 'About — Agro Drone Tech', contact: 'Contact — Agro Drone Tech' };
const checks = [], exceptions = [], consoleErrors = [], requests = [], networkFailures = [], downloadEvents = [], setupErrors = [], contexts = new Map(), pending = new Map(), listeners = new Set(), attaching = new Set();
let socket, page, sequence = 0, current = 'Connect to Chrome', failure, diagnostics;
const q = JSON.stringify, delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function cdp(method, params = {}, sessionId) {
  return new Promise((resolve, reject) => {
    const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 60000);
    pending.set(id, { resolve: v => { clearTimeout(timer); resolve(v); }, reject: e => { clearTimeout(timer); reject(new Error(`${method}: ${e.message}`)); } });
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
}
function eventOnce(method, timeout = 30000) {
  return new Promise((resolve, reject) => { const listen = data => { if (data.method === method && !data.sessionId) { clearTimeout(timer); listeners.delete(listen); resolve(data.params); } }; const timer = setTimeout(() => { listeners.delete(listen); reject(new Error(`No ${method} event`)); }, timeout); listeners.add(listen); });
}
async function configure(sessionId) {
  await Promise.all([cdp('Runtime.enable', {}, sessionId), cdp('Network.enable', {}, sessionId)]);
  await cdp('Network.setBlockedURLs', { urls: ['https://*'] }, sessionId);
  await cdp('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true }, sessionId);
  if (sessionId) await cdp('Runtime.runIfWaitingForDebugger', {}, sessionId);
}
async function evaluate(expression, frame) {
  const context = frame ? contexts.get(frame) : undefined;
  if (frame && !context) throw new Error(`Iframe context disappeared: ${frame}`);
  const result = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, ...(context ? { contextId: context.id } : {}) }, context?.sessionId);
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
// Poll only observer/load/render readiness. Every user action and every assertion is performed once.
async function ready(expression, frame, timeout = 30000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (await evaluate(expression, frame)) return; await delay(100); }
  throw new Error(`Readiness timeout (${current}): ${expression}`);
}
async function verify(name, expression, expected = true, frame) {
  current = name; const actual = typeof expression === 'string' ? await evaluate(expression, frame) : expression;
  try { assert.deepEqual(actual, expected, name); checks.push({ name, pass: true }); console.log('PASS', name); }
  catch (error) { checks.push({ name, pass: false, actual, expected }); throw error; }
}
function skip(name, reason) { checks.push({ name, pass: null, skipped: reason }); }
async function settle(frame) {
  let last = '', stable = 0;
  for (let i = 0; i < 80; i++) { const next = q(await evaluate('[scrollX,scrollY,innerWidth,innerHeight]', frame)); stable = next === last ? stable + 1 : 0; if (stable === 4) return; last = next; await delay(100); }
  throw new Error('Scrolling did not settle');
}
async function scroll(selector, frame) {
  current = `Scroll to ${selector}`;
  await evaluate(`document.querySelector(${q(selector)}).scrollIntoView({block:'center',inline:'nearest',behavior:'instant'})`, frame);
  await settle(frame); await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))', frame);
}
async function point(selector, frame, host) {
  const p = await evaluate(`(()=>{const e=document.querySelector(${q(selector)}),r=e.getBoundingClientRect();if(!r.width||!r.height||getComputedStyle(e).visibility==='hidden')throw Error('Invisible target');return{x:r.x+r.width/2,y:r.y+r.height/2}})()`, frame);
  if (host) { const offset = await evaluate(`(()=>{const r=document.querySelector(${q(host)}).getBoundingClientRect();return{x:r.x,y:r.y}})()`); p.x += offset.x; p.y += offset.y; }
  return p;
}
async function mouse(type, p, down = false) { await cdp('Input.dispatchMouseEvent', { type, ...p, ...(type === 'mouseMoved' ? { buttons: down ? 1 : 0 } : { button: 'left', clickCount: 1 }) }); }
async function click(selector, frame, host) {
  if (host) await scroll(host); await scroll(selector, frame); current = `Click ${selector}`;
  const p = await point(selector, frame, host); await mouse('mouseMoved', p); await mouse('mousePressed', p); await mouse('mouseReleased', p);
  await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))', frame);
}
async function key(key, modifiers = 0) {
  const codes = { Escape: 27, Home: 36, End: 35, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, a: 65 };
  for (const type of ['keyDown', 'keyUp']) await cdp('Input.dispatchKeyEvent', { type, key, code: key === 'a' ? 'KeyA' : key, windowsVirtualKeyCode: codes[key], modifiers });
}
async function type(selector, text) { await click(selector); await key('a', 2); await cdp('Input.insertText', { text }); }
async function drag(selector, dx, dy = 0, frame, host, override) {
  if (host) await scroll(host); await scroll(selector, frame); const p = override || await point(selector, frame, host);
  await mouse('mouseMoved', p); await mouse('mousePressed', p);
  for (let i = 1; i <= 8; i++) await mouse('mouseMoved', { x: p.x + dx * i / 8, y: p.y + dy * i / 8 }, true);
  await mouse('mouseReleased', { x: p.x + dx, y: p.y + dy });
}
async function shot(name) { await settle(); const { data } = await cdp('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(path.join(output, `${prefix}-${name}.png`), Buffer.from(data, 'base64')); }
async function route(id, nav = '.right-menu-box') {
  await evaluate('window.scrollTo({top:0,behavior:"instant"})'); await settle();
  if (await evaluate(`document.querySelector('main')?.dataset.page===${q(id)}`)) {
    const other = id === 'home' ? 'about' : 'home'; await click(`${nav} a[href="#${other}"]`); await ready(`document.querySelector('main')?.dataset.page===${q(other)}`); await settle();
  }
  await click(`${nav} a[href="#${id}"]`); await ready(`document.querySelector('main')?.dataset.page===${q(id)}`); await settle();
}
const routeState = id => `(()=>{const m=document.querySelector('main');return location.hash===${q('#' + id)}&&m.dataset.page===${q(id)}&&document.activeElement===m&&scrollY===0&&document.title===${q(titles[id])}&&m.querySelectorAll('.showroom-page').length===1&&${q(routes)}.every(p=>!!m.querySelector('.page-'+p)===(p===${q(id)}))&&${q(sections[id])}.every(s=>!!m.querySelector(s))&&${q(routes.filter(p => p !== id).flatMap(p => sections[p]).filter(s => !sections[id].includes(s)))}.every(s=>!m.querySelector(s))&&[...document.querySelectorAll('.nav-links a[aria-current],.right-menu-box a[aria-current]')].every(a=>a.hash===location.hash)&&document.querySelectorAll('.nav-links a[aria-current],.right-menu-box a[aria-current]').length===2})()`;
async function scene(host) {
  await scroll(host); await ready(`!!document.querySelector(${q(host + ' iframe')})`);
  const title = await evaluate(`document.querySelector(${q(host + ' iframe')}).title`), end = Date.now() + 30000;
  while (Date.now() < end) { for (const frame of contexts.keys()) if (await evaluate('document.title', frame) === title) return frame; await delay(100); }
  throw new Error(`No sandbox execution context for ${title}`);
}
async function shelfReady(frame) {
  await ready(`document.querySelector('#gl')?.classList.contains('on')&&document.querySelector('#loader')?.classList.contains('gone')&&!!window.__COVERS`, frame, 90000);
  await evaluate(`Promise.all(document.getAnimations().filter(a=>Number.isFinite(a.effect.getComputedTiming().iterations)).map(a=>a.finished)).then(()=>true)`, frame);
  await delay(1800); // Authored shelf intro is 1000 + 10*78 ms; never repeat a click rejected during it.
}
async function drone(selector) { await scroll(selector); await ready(`document.querySelector(${q(selector)})?.__drone?.state.frames>0&&document.querySelector(${q(selector)}).getAttribute('aria-busy')==='false'`); }
const imageOK = selector => `(async()=>{const images=[...document.querySelectorAll(${q(selector)})];await Promise.all(images.map(i=>i.decode()));return images.length>0&&images.every(i=>i.naturalWidth>=64&&i.naturalHeight>=64&&!/placeholder|dummy|fake/i.test(i.currentSrc)&&!['https:', 'http:', '//'].some(p=>i.getAttribute('src').startsWith(p))&&getComputedStyle(i).visibility!=='hidden')})()`;
const ink = (selector, webgl = false) => `new Promise(resolve=>requestAnimationFrame(()=>{const c=document.querySelector(${q(selector)}),colors=new Set();${webgl ? "const g=c.getContext('webgl2')||c.getContext('webgl'),p=new Uint8Array(4);for(let y=1;y<9;y++)for(let x=1;x<9;x++){g.readPixels(Math.floor(c.width*x/10),Math.floor(c.height*y/10),1,1,g.RGBA,g.UNSIGNED_BYTE,p);colors.add([...p].join(','));}" : "const g=c.getContext('2d'),p=g.getImageData(0,0,c.width,c.height).data;for(let i=0;i<p.length;i+=256)if(p[i+3]>0)colors.add([p[i],p[i+1],p[i+2]].join(','));"}resolve(c.width>100&&c.height>100&&colors.size>8)}))`;
async function close() { await key('Escape'); await ready(`!document.querySelector('dialog[open]')`); }
async function reload() { const loaded = eventOnce('Page.loadEventFired'); await cdp('Page.reload'); await loaded; await ready(`!!document.querySelector('main[data-page]')`); await evaluate('document.fonts.ready'); await settle(); }
const video = `document.querySelector('.combined-video')`;
try {
  await fs.mkdir(downloads, { recursive: true });
  const response = await fetch(`${browser}/json/new?about:blank`, { method: 'PUT' }); if (!response.ok) throw new Error(`Chrome endpoint: ${response.status}`); page = await response.json();
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  socket.addEventListener('message', event => {
    const data = JSON.parse(event.data), s = data.sessionId;
    if (data.id && pending.has(data.id)) { const p = pending.get(data.id); pending.delete(data.id); data.error ? p.reject(new Error(JSON.stringify(data.error))) : p.resolve(data.result); }
    for (const listen of listeners) listen(data);
    if (data.method === 'Runtime.executionContextCreated' && data.params.context.auxData?.isDefault) { const c = data.params.context; contexts.set(c.auxData.frameId, { id: c.id, sessionId: s }); }
    if (['Runtime.executionContextDestroyed', 'Runtime.executionContextsCleared', 'Target.detachedFromTarget'].includes(data.method)) for (const [f, c] of contexts) if (c.sessionId === (data.method === 'Target.detachedFromTarget' ? data.params.sessionId : s) && (data.method !== 'Runtime.executionContextDestroyed' || c.id === data.params.executionContextId)) contexts.delete(f);
    if (data.method === 'Runtime.exceptionThrown') exceptions.push({ sessionId: s, ...data.params.exceptionDetails });
    if (data.method === 'Runtime.consoleAPICalled' && data.params.type === 'error') consoleErrors.push({ sessionId: s, args: data.params.args });
    if (data.method === 'Network.requestWillBeSent') requests.push({ sessionId: s, url: data.params.request.url, method: data.params.request.method, type: data.params.type });
    if (data.method === 'Network.loadingFailed' || (data.method === 'Network.responseReceived' && data.params.response.status >= 400)) networkFailures.push({ sessionId: s, ...data.params });
    if (data.method?.startsWith('Browser.download')) downloadEvents.push({ event: data.method, ...data.params });
    if (data.method === 'Target.attachedToTarget') { const task = configure(data.params.sessionId).catch(e => setupErrors.push(e.message)); attaching.add(task); task.finally(() => attaching.delete(task)); }
  });
  await cdp('Page.enable'); await configure(); await cdp('Browser.setDownloadBehavior', { behavior: 'allowAndName', downloadPath: downloads, eventsEnabled: true });
  await cdp('Emulation.setEmulatedMedia', { features: [] }); await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url: origin.split('#')[0] + '#home' }); await ready(`document.querySelector('main')?.dataset.page==='home'`); await evaluate('document.fonts.ready');
  await verify('Home retains original hero, film, paper and Earth, without shelf or catalogue', routeState('home'));
  await drone('.hero .drone-stage'); await verify('Original hero has a genuinely painted 3D model', ink('.hero canvas')); await shot('home-desktop');
  for (const nav of ['.nav-links', '.right-menu-box']) for (const id of ['shelf', 'products', 'about', 'contact', 'home']) { await route(id, nav); await verify(`${nav} native click mounts only ${id}, resets scroll, title and focus`, routeState(id)); }
  for (const [offset, id] of [[-1, 'contact'], [-1, 'about'], [1, 'contact'], [1, 'home']]) { const history = await cdp('Page.getNavigationHistory'); await cdp('Page.navigateToHistoryEntry', { entryId: history.entries[history.currentIndex + offset].id }); await ready(`document.querySelector('main')?.dataset.page===${q(id)}`); await settle(); await verify(`History ${offset < 0 ? 'back' : 'forward'} to ${id}`, routeState(id)); }
  for (const id of routes) { await cdp('Page.navigate', { url: origin.split('#')[0] + '#' + id }); await ready(`document.querySelector('main')?.dataset.page===${q(id)}`); await reload(); await verify(`Direct #${id} survives reload with isolated content and focus`, routeState(id)); await verify(`${id} does not invent email, phone or WhatsApp contacts`, `!document.querySelector('a[href^="mailto:"],a[href^="tel:"],a[href*="wa.me"]')`); }
  if (prefix === 'pages-offline') { await cdp('Page.navigate', { url: pathToFileURL(path.join(root, 'index.html')).href + '#products' }); await ready(`document.querySelector('main')?.dataset.page==='products'`); await verify('Root disk entry redirects to offline build and preserves hash', `location.href===${q(pathToFileURL(path.join(root, 'offline/index.html')).href + '#products')}`); } else skip('Root disk entry redirects to offline build and preserves hash', 'Requires file:// origin');
  await route('home'); await scroll('.combined-video'); await ready(`${video}.readyState>=2&&!${video}.paused`);
  await verify('Combined film is real 640×360, ~11.596s media with controls', `(()=>{const v=${video};return v.videoWidth===640&&v.videoHeight===360&&Math.abs(v.duration-11.596)<.08&&v.loop&&v.muted&&v.playsInline&&!document.querySelector('.film-seek input').disabled})()`);
  await click('.film-play-toggle'); await verify('Manual pause really pauses playback', `${video}.paused`); await click('.film-seek input'); await key('Home'); await key('ArrowRight'); await verify('Native range keyboard seeks media', `Math.abs(${video}.currentTime-.05)<.025`); await key('Home');
  const journey = evaluate(`new Promise(resolve=>{const v=${video};let last=0,max=0,frames=0,joins=[false,false],token;const finish=result=>{clearTimeout(timer);v.cancelVideoFrameCallback(token);resolve({...result,frames,max,joins})};const timer=setTimeout(()=>finish({timeout:true}),22000);const tick=(now,m)=>{const t=m.mediaTime;frames++;if(last<3.782&&t>=3.782)joins[0]=true;if(last<7.564&&t>=7.564)joins[1]=true;max=Math.max(max,t);if(last>v.duration-.35&&t<.5){finish({looped:true});return}last=t;token=v.requestVideoFrameCallback(tick)};token=v.requestVideoFrameCallback(tick)})`);
  await click('.film-play-toggle'); const played = await journey; await verify('Decoded playback crosses both joins, reaches end and loops', !!played.looped && played.frames > 100 && played.joins.every(Boolean) && played.max > 11.2); await shot('combined-film');
  await scroll('.hero'); await ready(`${video}.paused`); await verify('Offscreen observer pauses combined film', `${video}.paused`); await scroll('.combined-video'); await ready(`!${video}.paused`); await click('.film-play-toggle'); await scroll('.hero'); await scroll('.combined-video'); await delay(350); await verify('Manual pause persists across leave/return', `${video}.paused`);
  const paper = await scene('.paper-frame'); await ready(`window.__sheet?.state().intro>.9&&window.__sheet.renderer.info.render.calls>0`, paper, 90000);
  await verify('Paper renders original shader in allow-scripts-only sandbox', `document.querySelector('.paper-frame iframe').getAttribute('sandbox')==='allow-scripts'`); await verify('Paper is genuine rendered shader geometry', ink('#gl', true), true, paper);
  await verify('Paper artwork has Agro branding and five honest compliance steps', `document.querySelector('#bg h1').textContent==='AGRO'&&['PRODUCT IDENTITY','PUBLISHED SPECIFICATIONS','SELLER DOCUMENTATION','APPLICABLE REQUIREMENTS','HANDOVER & SUPPORT','NOT A LICENSE, CERTIFICATION OR MANUFACTURER AUTHORIZATION.'].every(t=>[...document.scripts].some(s=>s.textContent.includes(t)))`, true, paper);
  const paperPoint = await evaluate(`(()=>{const a=window.__sheet.state().quad;return{x:a.reduce((s,p)=>s+p[0],0)/4,y:a.reduce((s,p)=>s+p[1],0)/4}})()`, paper), offset = await evaluate(`(()=>{const r=document.querySelector('.paper-frame iframe').getBoundingClientRect();return{x:r.x,y:r.y}})()`), paperYaw = await evaluate('window.__sheet.state().dragYaw', paper);
  await drag('#gl', 70, -10, paper, '.paper-frame iframe', { x: paperPoint.x + offset.x, y: paperPoint.y + offset.y }); await verify('Native pointer drag actually rotates paper', `Math.abs(window.__sheet.state().dragYaw-${paperYaw})>.2`, true, paper); await shot('paper');
  for (const id of ['home', 'contact']) { if (id === 'contact') await click('#home-earth a[href="#contact"]'); const host = id === 'home' ? '#home-earth' : '#contact'; await scroll(`${host} .earth-wrap`); await ready(`!!document.querySelector('${host} .globe-stage')?.getRotation&&document.querySelector('${host} canvas').width>100`); const y = await evaluate(`document.querySelector('${host} .globe-stage').getRotation().y`); await delay(450); await verify(`${id} globe rotates naturally`, `document.querySelector('${host} .globe-stage').getRotation().y>${y}`); const before = await evaluate(`document.querySelector('${host} .globe-stage').getRotation().y`); await drag(`${host} canvas`, 100, 25); await verify(`${id} globe responds to native drag`, `document.querySelector('${host} .globe-stage').getRotation().y-${before}>.6`); await shot(`${id}-earth`); }
  await click('#contact .contact-copy > .btn'); await ready(`!!document.querySelector('dialog[open] form')`); await verify('Contact inquiry opens with honest local-only messaging', `document.querySelector('dialog[open]').textContent.includes('Direct chat will be available')`); await close();
  await route('shelf'); const shelf = await scene('.shelf-frame'); await shelfReady(shelf);
  await verify('Shelf page is only an actual books shelf with hardware bridge', `!document.querySelector('.hero,.product-card,.equipment-card,.paper-frame,.combined-video')&&document.querySelector('#shelf a').hash==='#products'`);
  await verify('Shelf is genuinely rendered 3D, sandboxed', ink('#gl', true), true, shelf); await verify('Shelf iframe is isolated', `document.querySelector('.shelf-frame iframe').getAttribute('sandbox')==='allow-scripts'`);
  await verify('All ten guide editions map to the three real platforms', `[...document.querySelectorAll('.tli h2')].map(e=>e.textContent)`, ['T50', 'T25', 'MAVIC 3M', 'T50', 'T25', 'MAVIC 3M', 'T50', 'T25', 'MAVIC 3M', 'T50'], shelf);
  await verify('Both shelves contain five unique guide editions', `(()=>{const source=[...document.scripts].map(s=>s.textContent).join(String.fromCharCode(10)),marker='const BOOKS = ',start=source.indexOf(marker)+marker.length,b=JSON.parse(source.slice(start,source.indexOf(';',start)));return b.length===10&&new Set(b.map(x=>x.id)).size===10&&[0,1].every(s=>b.filter(x=>x.shelf===s).length===5)&&b.every(x=>['t50','t25','mavic'].includes(x.productId))})()`, true, shelf); await verify('Guide manufacturer photographs decode as real images', imageOK('.tlmark'), true, shelf); await shot('shelf-desktop');
  await click('.tli:nth-child(2)', shelf, '.shelf-frame iframe'); await ready(`document.querySelector('#detail').classList.contains('on')`, shelf); await verify('Shelf selection is T25', `document.querySelector('#detail-title').textContent`, 'T25', shelf); await delay(750); await click('#detail-look', shelf, '.shelf-frame iframe'); await delay(750); await shot('shelf-turned');
  await click('#product-specifications', shelf, '.shelf-frame iframe'); await ready(`!!document.querySelector('dialog[open] .detail-hero')`); await drone('dialog[open] .drone-stage'); await verify('Shelf bridge opens actual T25 specifications and painted 3D', `document.querySelector('dialog[open] h2').textContent==='T25'&&document.querySelector('dialog[open] .spec-table').textContent.includes('DB800')&&document.querySelector('dialog[open] dl').children.length===8`); await verify('T25 detail 3D paints real pixels', ink('dialog[open] canvas')); await close();
  await click('#detail-close', shelf, '.shelf-frame iframe'); await delay(750); await click('#shelf a[href="#products"]'); await ready(`document.querySelector('main')?.dataset.page==='products'`); await verify('Shelf hardware bridge navigates Products', routeState('products'));
  await verify('Products contains original three cards, components, anatomy and 53 additional items', `document.querySelectorAll('.product-card').length===3&&document.querySelectorAll('.equipment-card').length===53&&!!document.querySelector('.parts-explorer')&&!!document.querySelector('#anatomy')`);
  for (const [label, index, names] of [['Spraying', 2, ['T50', 'T25']], ['Crop intelligence', 4, ['Mavic 3M']], ['All', 1, ['T50', 'T25', 'Mavic 3M']]]) { await click(`.catalogue-tools .filter-chip:nth-child(${index})`); await verify(`Original catalogue ${label} filter`, `[...document.querySelectorAll('.product-card:not([hidden]) h3')].map(e=>e.textContent)`, names); }
  for (const [i, id, name] of [[1, 't50', 'T50'], [2, 't25', 'T25'], [3, 'mavic', 'Mavic 3M']]) {
    const card = `.product-card:nth-child(${i})`; await drone(`${card} .drone-stage`); await verify(`${name} original card paints 3D`, ink(`${card} canvas`)); const yaw = await evaluate(`document.querySelector('${card} .drone-stage').__drone.state.yaw`); await drag(`${card} canvas`, 100); await verify(`${name} native 3D drag turns model`, `document.querySelector('${card} .drone-stage').__drone.state.yaw-${yaw}>1`);
    await click(`${card} .view-toggle button:last-child`); await ready(`document.querySelector('${card} .photo-stage')?.getAttribute('aria-busy')==='false'`); await verify(`${name} real manufacturer photo decodes`, imageOK(`${card} .photo-plane img`)); await click(`${card} .view-toggle button:first-child`); await drone(`${card} .drone-stage`); await verify(`${name} photo-to-3D roundtrip`, `document.querySelector('${card} .drone-stage').dataset.product===${q(id)}&&document.querySelector('${card} .view-toggle button').getAttribute('aria-pressed')==='true'`);
    await click(`${card} .product-buttons .text-link`); await ready(`!!document.querySelector('dialog[open] .detail-hero')`); await drone('dialog[open] .drone-stage'); await verify(`${name} detailed published specifications`, `document.querySelector('dialog[open] h2').textContent===${q(name)}&&document.querySelector('dialog[open] dl').children.length===8&&document.querySelector('dialog[open] .detail-note a').href.startsWith('https://')`); await click('dialog[open] .view-toggle button:last-child'); await ready(`document.querySelector('dialog[open] .photo-stage')?.getAttribute('aria-busy')==='false'`); await verify(`${name} detail photograph decodes`, imageOK('dialog[open] .photo-plane img')); await click('dialog[open] .view-toggle button:first-child'); await drone('dialog[open] .drone-stage'); await verify(`${name} detail returns to painted 3D`, ink('dialog[open] canvas')); await close();
  }
  await click('.product-card:nth-child(2) .inquire-button'); await ready(`!!document.querySelector('dialog[open] form')`); await verify('T25 inquiry selection and required empty-form validation', `document.querySelector('dialog[open] select').value==='t25'&&!document.querySelector('dialog[open] form').checkValidity()`);
  await type('[name="name"]', 'Pages Verification Grower'); await type('[name="email"]', 'invalid-email'); await type('[name="message"]', 'Please confirm T25 and DB800 compatibility.'); await verify('Malformed email is genuinely rejected', `document.querySelector('[name="email"]').validity.typeMismatch&&!document.querySelector('dialog[open] form').checkValidity()`);
  await type('[name="email"]', 'pages@example.com'); await verify('Valid inquiry passes native validity', `document.querySelector('dialog[open] form').checkValidity()`);
  const downloadStarted = eventOnce('Browser.downloadWillBegin'), beforeSubmit = requests.length; await click('dialog[open] button[type="submit"]'); const download = await downloadStarted; await ready(`!!document.querySelector('.export-confirmation')`);
  const endDownload = Date.now() + 30000; while (!downloadEvents.some(e => e.guid === download.guid && e.state === 'completed')) { if (Date.now() > endDownload) throw new Error('Inquiry download did not complete'); await delay(100); }
  await verify('Inquiry exports exact local text and makes no submission request', download.suggestedFilename === 'agro-drone-inquiry.txt' && download.url.startsWith('blob:') && (await fs.readFile(path.join(downloads, download.guid), 'utf8')) === 'AGRO DRONE TECH — PRODUCT INQUIRY\n\nName: Pages Verification Grower\nEmail: pages@example.com\nInterest: DJI AGRAS T25\n\nPlease confirm T25 and DB800 compatibility.\n' && !requests.slice(beforeSubmit).some(r => r.method !== 'GET'));
  await verify('Export status does not claim the inquiry was sent', `document.querySelector('.export-confirmation').textContent.includes('not been sent')`); await close();
  for (let i = 1; i <= 3; i++) await click(`.product-card:nth-child(${i}) .compare-toggle`); await click('.compare-bar-actions .btn'); await ready(`!!document.querySelector('dialog[open] .compare-table')`); await verify('Compare shows all three systems and published differences', `[...document.querySelectorAll('dialog[open] thead strong')].map(e=>e.textContent)`, ['T50', 'T25', 'Mavic 3M']);
  const differentRows = await evaluate(`document.querySelectorAll('dialog[open] tr.differs').length`); await click('dialog[open] .compare-controls button'); await verify('Differences-only comparison filters actual rows', `document.querySelectorAll('dialog[open] tbody tr').length`, differentRows); await verify('Compare photographs really decode', imageOK('dialog[open] thead img')); await shot('compare'); await close(); await click('.compare-clear'); await verify('Compare clears selection and bar', `!document.querySelector('.compare-bar')&&[...document.querySelectorAll('.compare-toggle')].every(b=>b.getAttribute('aria-pressed')==='false')`);
  for (const [i, id, name, battery, fact] of [[1, 't50', 'T50', 'DB1560 Intelligent Flight Battery', '40 L'], [2, 't25', 'T25', 'DB800 Intelligent Flight Battery', '20 L'], [3, 'mavic', 'Mavic 3M', 'Mavic 3 Series Flight Battery', '20 MP']]) {
    await click(`.parts-explorer [aria-label="Choose drone components"] button:nth-child(${i})`); await drone('.parts-model .drone-stage'); await verify(`${name} components and exact matching battery list`, `document.querySelector('.parts-model .drone-stage').dataset.product===${q(id)}&&document.querySelector('.component-list').textContent.includes(${q(fact)})&&document.querySelectorAll('.related-parts button').length===1&&document.querySelector('.related-parts button span').firstChild.textContent===${q(battery)}`); await verify(`${name} related battery photo decodes`, imageOK('.related-parts img'));
    await click('.related-parts button'); await ready(`!!document.querySelector('dialog[open] .detail-hero > img')`); await verify(`${name} battery opens manufacturer photograph and compatibility detail`, `(async()=>{const i=document.querySelector('dialog[open] .detail-hero > img');await i.decode();return document.querySelector('dialog[open] h2').textContent===${q(battery)}&&i.naturalWidth>=64&&document.querySelector('dialog[open] dl').children.length===2&&!document.querySelector('dialog[open] .drone-stage')})()`); await close();
  }
  await scroll('#anatomy'); await ready(`document.querySelector('#anatomy .film-stage').getAttribute('aria-busy')==='false'`, undefined, 90000); await verify('Original anatomy film loads and paints actual frames', ink('#anatomy canvas'));
  const equipmentNames = await evaluate(`[...document.querySelectorAll('.equipment-card h3')].map(e=>e.textContent)`); await verify('Additional catalogue has 53 distinct manufacturer items, not core duplicates', equipmentNames.length === 53 && new Set(equipmentNames).size === 53 && !equipmentNames.some(n => ['T50', 'T25', 'Mavic 3M'].includes(n)));
  for (let i = 1; i <= 53; i++) { await scroll(`.equipment-card:nth-child(${i})`); await evaluate(`document.querySelector('.equipment-card:nth-child(${i}) img').decode()`); }
  await verify('All 53 additional local manufacturer images decode, without fake placeholders', imageOK('.equipment-card img'));
  await click('.equipment-card:first-child .text-link'); await ready(`!!document.querySelector('dialog[open] .detail-hero > img')`); await verify('Additional aircraft detail uses real manufacturer photography and specifications', `(async()=>{const i=document.querySelector('dialog[open] .detail-hero > img');await i.decode();return document.querySelector('dialog[open] h2').textContent==='T40'&&i.naturalWidth>=64&&document.querySelector('dialog[open] .spec-table').textContent.includes('40 L')&&!document.querySelector('dialog[open] .drone-stage')})()`); await close();
  for (const [i, name, count] of [[2, 'drones', 7], [3, 'batteries', 8], [4, 'parts', 9], [5, 'controllers', 3], [6, 'accessories', 26], [1, 'all', 53]]) { await click(`.equipment-tools .filter-chip:nth-child(${i})`); await verify(`Additional equipment ${name} filter has exact results`, `document.querySelectorAll('.equipment-card').length===${count}&&(${q(name)}==='all'||[...document.querySelectorAll('.equipment-card > .eyebrow')].every(e=>e.textContent===${q(name)}))`); }
  await type('.equipment-search input', 'DB800'); await verify('Equipment search returns exact DB800 battery', `[...document.querySelectorAll('.equipment-card h3')].map(e=>e.textContent)`, ['DB800 Intelligent Flight Battery']); await click('.equipment-tools .filter-chip:nth-child(2)'); await verify('Filter and search intersection has honest empty state', `document.querySelectorAll('.equipment-card').length===0&&document.querySelector('.equipment-section .filter-empty').textContent.includes('No equipment matches')`); await click('.equipment-section .filter-empty button'); await verify('Empty-state reset clears search and category and restores 53 items', `document.querySelectorAll('.equipment-card').length===53&&document.querySelector('.equipment-search input').value===''&&document.querySelector('.equipment-tools .filter-chip').getAttribute('aria-pressed')==='true'`); await shot('equipment');
  await route('about'); await scroll('.field-story'); await ready(`!!document.querySelector('.field-story img')`); await verify('About retains Approach and real field photograph', imageOK('.field-story img')); await shot('about-desktop');
  await route('home'); const menuBounds = `(()=>{const r=document.querySelector('.right-menu-box').getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom}})()`; const originalMenu = await evaluate(menuBounds);
  await drag('.menu-grip', -240, -100); const moved = await evaluate(menuBounds); await verify('Menu grip really drags without accidental route change', moved.x < originalMenu.x - 100 && moved.y < originalMenu.y - 50 && await evaluate(`location.hash==='#home'`));
  await drag('.menu-grip', -2000, -2000); await verify('Menu drag clamps at top-left viewport margins', `(()=>{const r=document.querySelector('.right-menu-box').getBoundingClientRect();return r.left>=8&&r.top>=8&&r.left<=9&&r.top<=9})()`); await drag('.menu-grip', 1430, 890); await verify('Menu drag clamps at bottom-right viewport margins', `(()=>{const r=document.querySelector('.right-menu-box').getBoundingClientRect();return r.right<=innerWidth-8&&r.bottom<=innerHeight-8&&r.left>=8&&r.top>=8})()`);
  await key('Home'); await verify('Native Home key resets menu attachment', await evaluate(menuBounds), originalMenu); await key('ArrowLeft'); const keyMoved = await evaluate(menuBounds); await verify('Native arrow key moves menu by 20px without routing', Math.abs(keyMoved.x - originalMenu.x + 20) < 1 && await evaluate(`location.hash==='#home'`)); await key('Home'); await verify('Keyboard reset removes positioned state', `document.querySelector('.right-menu-box').dataset.positioned==='false'`);
  await click('.hero h1'); await scroll('.paper-frame'); await ready(`!!document.querySelector('.menu-reopen')`); await verify('Scroll-down hides desktop menu accessibly and exposes reopen', `document.querySelector('.right-menu-box').inert&&document.querySelector('.right-menu-box').classList.contains('is-hidden')`); await click('.menu-reopen'); await verify('Native reopen restores attached menu', `!document.querySelector('.right-menu-box').inert&&!document.querySelector('.menu-reopen')`); await shot('menu-reopened');
  for (const width of [320, 390, 768, 1024]) {
    await cdp('Emulation.setDeviceMetricsOverride', { width, height: width < 768 ? 844 : 900, deviceScaleFactor: 1, mobile: width <= 850 }); await settle();
    for (const id of ['shelf', 'products', 'about', 'contact', 'home']) {
      await route(id); await verify(`${width}px native navigation to ${id}`, routeState(id)); const contained = [await evaluate('document.documentElement.scrollWidth<=innerWidth')];
      for (const selector of sections[id]) { await scroll(selector); if (selector === '#shelf') await shelfReady(await scene('.shelf-frame')); contained.push(await evaluate('document.documentElement.scrollWidth<=innerWidth')); }
      await scroll('.footer'); contained.push(await evaluate('document.documentElement.scrollWidth<=innerWidth')); await verify(`${width}px ${id} overflow at top, every section and footer`, contained.every(Boolean)); await shot(`${width}-${id}`);
    }
    if (width <= 850) await verify(`${width}px bottom menu has five permanent labels and no grip`, `(()=>{const n=document.querySelector('.right-menu-box'),r=n.getBoundingClientRect();return !n.inert&&r.left>=0&&r.right<=innerWidth&&r.top>innerHeight*.7&&getComputedStyle(document.querySelector('.menu-grip')).display==='none'&&[...n.querySelectorAll('.menu-label')].map(e=>e.textContent).join(',')==='Home,Shelf,Products,About,Contact'&&[...n.querySelectorAll('.menu-label')].every(e=>getComputedStyle(e).opacity==='1'&&e.getBoundingClientRect().width>0)})()`);
    if (width === 390) {
      await evaluate('window.scrollTo({top:0,behavior:"instant"})'); await click('.menu-toggle'); await verify('Mobile header navigation expands natively', `document.querySelector('.menu-toggle').getAttribute('aria-expanded')==='true'`); await click('.nav-links a[href="#about"]'); await ready(`document.querySelector('main')?.dataset.page==='about'`); await verify('Mobile header selection closes menu and routes About', `document.querySelector('.menu-toggle').getAttribute('aria-expanded')==='false'&&document.querySelector('main').dataset.page==='about'`);
      await route('shelf'); const mobileShelf = await scene('.shelf-frame'); await shelfReady(mobileShelf); await click('#menubtn', mobileShelf, '.shelf-frame iframe'); await click('#menu button:nth-child(2)', mobileShelf, '.shelf-frame iframe'); await ready(`document.querySelector('#mbar-title').textContent==='T25'`, mobileShelf); await verify('Mobile authored shelf catalogue selects T25', `document.body.classList.contains('mobile')&&getComputedStyle(document.querySelector('.mbar')).display==='flex'`, true, mobileShelf);
      await click('#mbar-look', mobileShelf, '.shelf-frame iframe'); await delay(1550); await click('#product-specifications', mobileShelf, '.shelf-frame iframe'); await ready(`!!document.querySelector('dialog[open] .detail-hero')`); await drone('dialog[open] .drone-stage'); await verify('Mobile shelf bridges real T25 detail, rendered 3D and bounded dialog', `(()=>{const d=document.querySelector('dialog[open]'),r=d.getBoundingClientRect();return d.querySelector('h2').textContent==='T25'&&d.querySelector('.spec-table').textContent.includes('20 L')&&r.left>=0&&r.right<=innerWidth&&r.height<=innerHeight})()`); await shot('mobile-shelf-detail'); await close();
    }
  }
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }); await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }); await route('home'); await reload(); await drone('.hero .drone-stage');
  const still = await evaluate(`(()=>{const s=document.querySelector('.hero .drone-stage').__drone.state;return[s.yaw,s.frames]})()`); await delay(450); await verify('Reduced-motion hero 3D renders but remains genuinely still', `(()=>{const s=document.querySelector('.hero .drone-stage').__drone.state;return[s.yaw,s.frames]})()`, still); await verify('Reduced-motion 3D still is not a blank placeholder', ink('.hero canvas'));
  await scroll('.combined-video'); await delay(350); await verify('Reduced motion pauses film and disables automatic loop', `${video}.paused&&!${video}.loop&&!!document.querySelector('.film-motion-note')`); await click('.film-play-toggle'); await ready(`${video}.readyState>=2&&!${video}.paused`); const manualTime = await evaluate(`${video}.currentTime`); await delay(450); await verify('Reduced-motion manual Play remains usable with decoded video', `${video}.currentTime>${manualTime}&&${video}.getVideoPlaybackQuality().totalVideoFrames>0`); await ready(`${video}.ended`, undefined, 18000); await verify('Reduced-motion manual playback reaches end without looping', `${video}.ended&&${video}.paused&&!${video}.loop`); await shot('reduced-motion');
  await route('contact'); await scroll('#contact .earth-wrap'); await ready(`!!document.querySelector('.globe-stage')?.getRotation`); const globeStill = await evaluate(`document.querySelector('.globe-stage').getRotation()`); await delay(450); await verify('Reduced-motion Contact Earth remains still', `document.querySelector('.globe-stage').getRotation()`, globeStill);
  const lossSupported = await evaluate(`!!document.querySelector('.globe-canvas').getContext('webgl2')?.getExtension('WEBGL_lose_context')`);
  if (lossSupported) { await evaluate(`document.querySelector('.globe-canvas').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext()`); await ready(`!!document.querySelector('.globe-fallback')`); await verify('Real WebGL context loss displays locally decoded static Earth fallback', `(async()=>{const e=document.querySelector('.globe-fallback-earth'),i=new Image();i.src=getComputedStyle(e).backgroundImage.slice(5,-2);await i.decode();return i.naturalWidth>=64&&document.querySelector('.globe-canvas').hidden&&document.querySelector('.globe-fallback-label').textContent.includes('WebGL unavailable')})()`); } else skip('Real WebGL context loss displays locally decoded static Earth fallback', 'Driver has no WEBGL_lose_context; context-creation failure cannot be simulated without forbidden stubs');
  await Promise.all([...attaching]); await verify('All main-page and OOP-iframe CDP sessions configured', setupErrors, []); await verify('No external network assets were requested or required', requests.filter(r => r.url.startsWith('https://') || (r.url.startsWith('http://') && new URL(r.url).origin !== new URL(origin).origin)), []); await verify('No uncaught page or iframe JavaScript exceptions', exceptions, []);
} catch (error) {
  failure = { step: current, message: error.message, stack: error.stack }; process.exitCode = 1;
  if (!checks.some(c => c.pass === false)) checks.push({ name: current, pass: false, error: error.message });
  if (socket?.readyState === WebSocket.OPEN) { try { diagnostics = await evaluate(`({url:location.href,title:document.title,page:document.querySelector('main')?.dataset.page,focus:document.activeElement?.outerHTML,scroll:[scrollX,scrollY],size:[innerWidth,innerHeight],dialogs:[...document.querySelectorAll('dialog[open]')].map(d=>d.getAttribute('aria-label')),loaders:[...document.querySelectorAll('[aria-busy="true"],[data-state="loading"]')].map(e=>e.outerHTML.slice(0,400))})`); await shot('FAIL'); } catch (e) { diagnostics = { error: e.message }; } }
} finally {
  const report = { origin, prefix, status: failure ? 'FAIL' : 'PASS', checks, completed: checks.filter(c => c.pass === true).length, skipped: checks.filter(c => c.pass === null).length, failure, diagnostics, exceptions, consoleErrors, setupErrors, networkFailures, requests, downloadEvents, contexts: [...contexts.entries()] };
  try { await fs.mkdir(output, { recursive: true }); await fs.writeFile(path.join(output, `${prefix}-results.json`), JSON.stringify(report, null, 2)); } catch (e) { process.exitCode = 1; console.error('Cannot save report:', e.message); }
  if (page) { try { await fetch(`${browser}/json/close/${page.id}`); } catch (e) { console.error('Cannot close test tab:', e.message); } } socket?.close();
  console.log(JSON.stringify({ status: report.status, completed: report.completed, skipped: report.skipped, report: path.join(output, `${prefix}-results.json`), failure }, null, 2));
}
