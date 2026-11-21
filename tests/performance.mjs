import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

// Attach only; never launch Chrome. Example: CHROME_PORT=9334 node tests/performance.mjs --baseline
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const output = path.join(root, 'verification');
const browserOrigin = `http://127.0.0.1:${process.env.CHROME_PORT || 9334}`;
const baselineEnabled = process.argv.includes('--baseline');
const network = { offline: false, latency: 400, downloadThroughput: 50000, uploadThroughput: 50000, connectionType: 'cellular3g' };
const limits = { firstPaintMs: 5000, fcpMs: 5000, initialJsGzipBytes: 200000, fcpTargetMs: 3000, heroTargetMs: 10000 };
const binding = '__agroPerformanceReport';
const gzip = buffer => gzipSync(buffer, { level: 9 });
const hash = buffer => createHash('sha256').update(buffer).digest('hex');
const errorInfo = error => ({ name: error.name, message: error.message, stack: error.stack });
const mimeTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.avif': 'image/avif',
  '.gif': 'image/gif', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.wasm': 'application/wasm', '.pdf': 'application/pdf',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json',
};
// In particular, no images (including SVG) or fonts are re-compressed.
const textExtensions = new Set(['.html', '.js', '.mjs', '.css', '.json', '.map', '.txt', '.xml', '.csv', '.gltf']);

function artifact(name, raw) {
  const extension = path.extname(name).toLowerCase();
  const compressed = textExtensions.has(extension) ? gzip(raw) : null;
  return { name, raw, compressed, contentType: mimeTypes[extension] || 'application/octet-stream' };
}
function artifactInfo(item) {
  return { file: item.name, rawBytes: item.raw.length, gzipBytes: item.compressed?.length ?? null,
    servedBytes: (item.compressed || item.raw).length, encoding: item.compressed ? 'gzip' : 'identity', sha256: hash(item.raw) };
}
function safeRelative(name) {
  assert.equal(typeof name, 'string', 'Artifact path must be a string');
  assert.ok(name && !name.startsWith('/') && !name.includes('\\') && !name.includes(':') && !name.includes('\0')
    && name.split('/').every(segment => segment && segment !== '.' && segment !== '..'), `Unsafe artifact path: ${name}`);
  return name;
}
async function loadArtifacts() {
  // Immutable, pre-gzipped snapshot: compression and disk I/O cannot distort navigation timings.
  const files = new Map();
  async function walk(directory, prefix = '') {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const name = safeRelative(prefix + entry.name);
      const location = path.join(directory, entry.name);
      assert.ok(!entry.isSymbolicLink(), `Symlinks are not served: ${location}`);
      if (entry.isDirectory()) await walk(location, `${name}/`);
      else if (entry.isFile()) files.set(name, artifact(name, await fs.readFile(location)));
    }
  }
  await walk(dist);
  assert.ok(files.has('index.html'), 'Build the live dist before running this test');
  const manifestFile = files.get('.vite/manifest.json') || files.get('manifest.json');
  assert.ok(manifestFile, 'The live Vite build must include its manifest');
  const manifest = JSON.parse(manifestFile.raw.toString('utf8'));
  const entries = manifest['index.html']?.isEntry ? ['index.html'] : Object.keys(manifest).filter(key => manifest[key].isEntry);
  assert.ok(entries.length, 'No entry points found in the Vite manifest');
  const visited = new Set(), initialJs = new Set();
  function visit(key) {
    if (visited.has(key)) return;
    const entry = manifest[key];
    assert.ok(entry, `Missing manifest import: ${key}`);
    visited.add(key);
    const name = safeRelative(entry.file);
    assert.ok(files.has(name), `Missing manifest artifact: ${name}`);
    if (/\.(?:m?js)$/.test(name)) initialJs.add(name);
    for (const dependency of entry.imports || []) visit(dependency);
    // dynamicImports deliberately do not belong to the initial JavaScript budget.
  }
  entries.forEach(visit);
  assert.ok(initialJs.size, 'Initial JavaScript closure is empty');
  const entryJs = new Set(entries.map(key => manifest[key].file));
  const js = [...files.values()].filter(item => /\.(?:m?js)$/.test(item.name));
  const deferred = js.filter(item => !initialJs.has(item.name));
  const sum = (items, key) => items.reduce((total, item) => total + artifactInfo(item)[key], 0);
  const runtimeFiles = [...files.values()].filter(item => !item.name.startsWith('.vite/') && item !== manifestFile);
  const forbidden = new Map();
  function reasons(label) {
    // Match emitted names as well as source paths; shared hero Three is intentionally allowed.
    if (/heroThree|(?:^|\/)lenis(?:[./-]|$)/i.test(label)) return [];
    const found = [];
    if (/(?:^|\/)field(?:[.-]|$)|(?:^|\/)earth(?:[.-]|$)/i.test(label)) found.push('below-fold photograph/earth');
    if (/globe|shelf|ashen[-_]?press|paper|threeuiContent/i.test(label)) found.push('below-fold scene');
    if (/three181|three128/i.test(label)) found.push('non-hero Three variant');
    if (/retroPixelField|glassParticleField|certificate|japanese|site-of-the-year/i.test(label)) found.push('unused variant');
    return found;
  }
  for (const [key, entry] of Object.entries(manifest)) {
    const found = reasons([key, entry.src, entry.name, entry.file].filter(Boolean).join(' '));
    if (found.length) forbidden.set(entry.file, [...new Set([...(forbidden.get(entry.file) || []), ...found])]);
  }
  for (const name of files.keys()) {
    const found = reasons(name);
    if (found.length) forbidden.set(name, [...new Set([...(forbidden.get(name) || []), ...found])]);
  }
  const { stdout: oldHtml } = await promisify(execFile)('git', ['show', 'HEAD:dist/index.html'],
    { cwd: root, encoding: 'buffer', maxBuffer: 64 * 1024 * 1024, timeout: 30000 });
  const baseline = artifact('baseline/index.html', oldHtml);
  let offline = null;
  try { offline = artifactInfo(artifact('offline/index.html', await fs.readFile(path.join(root, 'offline', 'index.html')))); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  return { files, baseline, forbidden, stats: {
    manifest: manifestFile.name, entryKeys: entries, entryJsFiles: [...entryJs].sort(),
    entryJsRawBytes: sum(js.filter(item => entryJs.has(item.name)), 'rawBytes'),
    entryJsGzipBytes: sum(js.filter(item => entryJs.has(item.name)), 'gzipBytes'),
    initialJsFiles: [...initialJs].sort(),
    initialJsRawBytes: sum(js.filter(item => initialJs.has(item.name)), 'rawBytes'),
    initialJsGzipBytes: sum(js.filter(item => initialJs.has(item.name)), 'gzipBytes'),
    deferredJsRawBytes: sum(deferred, 'rawBytes'), deferredJsGzipBytes: sum(deferred, 'gzipBytes'),
    deferredJsFiles: deferred.map(artifactInfo), totalArtifactRawBytes: sum(runtimeFiles, 'rawBytes'),
    totalArtifactServedBytes: sum(runtimeFiles, 'servedBytes'),
    totalArtifactGzipTextBytes: sum(runtimeFiles.filter(item => item.compressed), 'gzipBytes'),
    totalArtifactIdentityBytes: sum(runtimeFiles.filter(item => !item.compressed), 'servedBytes'),
    artifacts: runtimeFiles.map(artifactInfo), baseline: artifactInfo(baseline), offline,
    forbiddenArtifacts: Object.fromEntries(forbidden),
  } };
}
function acceptsGzip(header = '') {
  const tokens = String(header).split(',').map(token => token.trim().split(';'));
  const explicit = tokens.find(([name]) => name.toLowerCase() === 'gzip');
  const match = explicit || tokens.find(([name]) => name === '*');
  if (!match) return false;
  const quality = match.slice(1).find(parameter => /^\s*q\s*=/i.test(parameter));
  return !quality || Number(quality.split('=')[1]) > 0;
}
function startServer(assets, errors, requests) {
  const server = http.createServer((request, response) => {
    const record = { url: request.url, method: request.method, at: new Date().toISOString() };
    requests.push(record);
    function reply(status, body, headers = {}) {
      record.status = status;
      response.writeHead(status, { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers });
      response.end(request.method === 'HEAD' ? undefined : body);
    }
    try {
      if (!['GET', 'HEAD'].includes(request.method)) return reply(405, 'Method not allowed', { Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' });
      // Do not use URL.pathname: URL normalization would hide encoded/literal dot traversal.
      const pathname = decodeURIComponent(request.url.split('?')[0]);
      if (!pathname.startsWith('/') || pathname.startsWith('//') || /[\\\0:#]/.test(pathname)
        || pathname.split('/').some(segment => segment === '.' || segment === '..')) {
        return reply(400, 'Invalid path', { 'Content-Type': 'text/plain; charset=utf-8' });
      }
      if (pathname === '/agro-website-' || pathname === '/baseline') return reply(308, '', { Location: `${pathname}/` });
      let item;
      if (pathname === '/baseline/' || pathname === '/baseline/index.html') item = assets.baseline;
      else if (pathname.startsWith('/agro-website-/')) {
        const name = pathname.slice('/agro-website-/'.length) || 'index.html';
        // Exact allowlist lookup, with no filesystem access or SPA fallback.
        item = assets.files.get(name);
        if (name.startsWith('.') || name.split('/').some(segment => segment.startsWith('.'))) item = undefined;
      }
      if (!item) return reply(404, 'Not found', { 'Content-Type': 'text/plain; charset=utf-8' });
      const compressed = item.compressed && acceptsGzip(request.headers['accept-encoding']);
      const body = compressed ? item.compressed : item.raw;
      record.file = item.name;
      record.bodyBytes = body.length;
      record.encoding = compressed ? 'gzip' : 'identity';
      reply(200, body, { 'Content-Type': item.contentType, 'Content-Length': body.length,
        Vary: 'Accept-Encoding', ...(compressed ? { 'Content-Encoding': 'gzip' } : {}) });
    } catch (error) {
      errors.push({ source: 'server', url: request.url, ...errorInfo(error) });
      reply(error instanceof URIError ? 400 : 500, 'Request failed', { 'Content-Type': 'text/plain; charset=utf-8' });
    }
  });
  server.on('clientError', (error, socket) => {
    errors.push({ source: 'server-client', ...errorInfo(error) });
    socket.destroy();
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      server.on('error', error => errors.push({ source: 'server', ...errorInfo(error) }));
      resolve({ server, origin: `http://127.0.0.1:${server.address().port}` });
    });
  });
}

class CDP {
  constructor(socket) {
    this.socket = socket;
    this.id = 0;
    this.pending = new Map();
    this.listeners = new Set();
    socket.addEventListener('message', event => {
      let data;
      try { data = JSON.parse(event.data); } catch { return; }
      if (data.id && this.pending.has(data.id)) {
        const pending = this.pending.get(data.id);
        this.pending.delete(data.id);
        clearTimeout(pending.timer);
        data.error ? pending.reject(new Error(`${pending.method}: ${JSON.stringify(data.error)}`)) : pending.resolve(data.result);
      } else if (data.method) {
        for (const listener of this.listeners) listener(data.method, data.params || {});
      }
    });
    socket.addEventListener('close', () => this.fail(new Error('CDP connection closed')));
    socket.addEventListener('error', () => this.fail(new Error('CDP websocket error')));
  }
  static async connect(url) {
    assert.equal(typeof WebSocket, 'function', 'Use Node 22 or later (native WebSocket required)');
    const socket = new WebSocket(url);
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('CDP websocket connection timed out')), 10000);
        socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
        socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Cannot connect to Chrome websocket')); }, { once: true });
      });
      return new CDP(socket);
    } catch (error) { socket.close(); throw error; }
  }
  send(method, params = {}) {
    if (this.socket.readyState !== WebSocket.OPEN) return Promise.reject(new Error('CDP socket is not open'));
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP command timed out: ${method}`)); }, 10000);
      this.pending.set(id, { resolve, reject, timer, method });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  fail(error) {
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
    this.pending.clear();
  }
  close() { this.fail(new Error('CDP connection disposed')); this.socket.close(); }
}
async function browserJSON(route) {
  const response = await fetch(`${browserOrigin}${route}`, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`Chrome debugging endpoint ${route}: HTTP ${response.status}`);
  return response.json();
}

// Runs before document parsing and application scripts. Observers measure the real DOM/render
// transitions; no application state, animations, loaders or readiness delays are modified.
function installProbe(bindingName) {
  if (window !== window.top) return;
  const state = window.__agroPerformance = {
    timeOrigin: performance.timeOrigin, milestones: {}, heroSnapshot: null, observerErrors: [],
    usefulPaintMethod: 'Visible non-loading h1, confirmed across two animation frames and browser FCP; upper-bound paint opportunity, not a compositor timestamp',
  };
  const send = (kind, payload) => window[bindingName](JSON.stringify({ kind, payload, timeOrigin: performance.timeOrigin }));
  const mark = (name, time = performance.now(), details = {}) => {
    if (state.milestones[name] != null) return;
    state.milestones[name] = time;
    send('milestone', { name, time, ...details });
  };
  const fail = error => {
    const details = { message: error.message, stack: error.stack };
    state.observerErrors.push(details);
    send('observer-error', details);
  };
  function visible(element, inViewport = true) {
    if (!element || !element.isConnected || element.hidden) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    if (inViewport && (rect.bottom <= 0 || rect.right <= 0 || rect.top >= innerHeight || rect.left >= innerWidth)) return false;
    let opacity = 1;
    for (let current = element; current; current = current.parentElement) {
      const style = getComputedStyle(current);
      if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || style.contentVisibility === 'hidden') return false;
      opacity *= Number(style.opacity);
    }
    return opacity > 0.01;
  }
  function usefulHeading() {
    return [...document.querySelectorAll('h1')].find(element => {
      const text = element.textContent.replace(/\s+/g, ' ').trim();
      if (!/built for the field/i.test(text) || /loading|please wait|initializ/i.test(text) || !visible(element)) return false;
      const rect = element.getBoundingClientRect();
      const x = Math.min(innerWidth - 1, Math.max(0, rect.left + rect.width / 2));
      const y = Math.min(innerHeight - 1, Math.max(0, rect.top + rect.height / 2));
      const top = document.elementFromPoint(x, y);
      return !!top && (element === top || element.contains(top) || top.contains(element));
    });
  }
  function snapshot() {
    const viewers = [...document.querySelectorAll('.product-card .drone-stage, .product-card .photo-stage')].map(element => ({
      product: element.dataset.product || null, top: element.getBoundingClientRect().top,
      initialized: !!element.__drone || !!element.querySelector('canvas') || element.getAttribute('aria-busy') === 'false',
      canvasCount: element.querySelectorAll('canvas').length, busy: element.getAttribute('aria-busy'),
    }));
    const globes = [...document.querySelectorAll('.globe-stage')].map(element => ({
      top: element.getBoundingClientRect().top, initialized: !!element.getRotation || !!element.querySelector('canvas'),
    }));
    const frames = [...document.querySelectorAll('iframe')].filter(element => !element.closest('#home')).map(element => ({
      top: element.getBoundingClientRect().top, src: element.getAttribute('src'), srcdoc: element.hasAttribute('srcdoc'),
    }));
    const scenes = [...document.querySelectorAll('.shader-frame')].map(element => ({
      top: element.getBoundingClientRect().top, initialized: !!element.querySelector('canvas, iframe')
        || !!element.querySelector('[data-state="ready"], [data-state="loaded"]'),
    }));
    return { atMs: performance.now(), scrollY, productCards: document.querySelectorAll('.product-card').length,
      viewers, globes, iframes: frames, scenes,
      resources: performance.getEntriesByType('resource').map(entry => ({ url: entry.name, initiatorType: entry.initiatorType,
        startTime: entry.startTime, responseEnd: entry.responseEnd, transferSize: entry.transferSize, encodedBodySize: entry.encodedBodySize })),
      navigation: performance.getEntriesByType('navigation').map(entry => entry.toJSON()),
    };
  }
  let firstHeadingFrame = null, headingElement = null, raf = null;
  function check(frame = false) {
    try {
      const h1 = usefulHeading();
      if (h1 && state.milestones.usefulH1ObservedMs == null) mark('usefulH1ObservedMs', performance.now(), { text: h1.textContent.trim() });
      if (state.milestones.usefulH1PaintedMs == null && frame) {
        if (!h1) { firstHeadingFrame = null; headingElement = null; }
        else if (headingElement !== h1) { headingElement = h1; firstHeadingFrame = performance.now(); }
        else if (firstHeadingFrame != null && state.milestones.fcpMs != null) {
          mark('usefulH1PaintedMs', performance.now(), { text: h1.textContent.trim(), firstVisibleFrameMs: firstHeadingFrame,
            bootstrapContent: !!h1.closest('.site-loading') });
        }
      }
      const root = document.getElementById('root');
      const reactRoot = root && Object.keys(root).some(key => key.startsWith('__reactContainer$') || key.startsWith('__reactFiber$'));
      if (reactRoot && root.querySelector('#home h1') && root.querySelectorAll('.product-card').length === 3 && !root.querySelector('.site-loading')) {
        mark('reactReadyMs', performance.now(), { definition: 'React root committed hero and three product cards, replacing bootstrap markup' });
      }
      const stage = document.querySelector('.hero-visual .drone-stage');
      const canvas = stage?.querySelector('canvas');
      if (state.milestones.heroReadyMs == null && stage?.getAttribute('aria-busy') === 'false'
        && visible(canvas, false) && canvas.width > 0 && canvas.height > 0
        && (!stage.__drone || stage.__drone.state?.frames > 0)) {
        // The snapshot is taken in this observer turn, not after polling or screenshots.
        state.heroSnapshot = snapshot();
        mark('heroReadyMs', performance.now(), { snapshot: state.heroSnapshot, product: stage.dataset.product,
          frames: stage.__drone?.state?.frames ?? null, definition: 'Hero canvas present and non-hidden; stage aria-busy=false after rendering' });
      }
    } catch (error) { fail(error); }
  }
  function tick() {
    raf = null;
    check(true);
    if (state.milestones.usefulH1PaintedMs == null || state.milestones.heroReadyMs == null) raf = requestAnimationFrame(tick);
  }
  function schedule() {
    check();
    if (raf == null && (state.milestones.usefulH1PaintedMs == null || state.milestones.heroReadyMs == null)) raf = requestAnimationFrame(tick);
  }
  try {
    performance.setResourceTimingBufferSize(5000);
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        if (entry.name === 'first-paint') mark('firstPaintMs', entry.startTime);
        if (entry.name === 'first-contentful-paint') mark('fcpMs', entry.startTime);
      }
      schedule();
    }).observe({ type: 'paint', buffered: true });
    // Observing streamed inline-script text stalls Chrome; animation frames still detect heading text changes.
    new MutationObserver(schedule).observe(document, { subtree: true, childList: true,
      attributes: true, attributeFilter: ['aria-busy', 'class', 'style', 'hidden', 'aria-hidden', 'data-state'] });
    document.addEventListener('DOMContentLoaded', schedule, { once: true });
    schedule();
  } catch (error) { fail(error); }
}

function check(result, name, pass, actual, expected) {
  result.checks.push({ name, pass: !!pass, actual, expected });
}
function transferBefore(records, cutoff) {
  if (cutoff == null) return null;
  const requests = records.filter(request => request.startTimestamp <= cutoff).map(request => {
    const finished = request.finishedTimestamp != null && request.finishedTimestamp <= cutoff;
    const headerBytes = request.responseTimestamp <= cutoff ? request.responseEncodedBytes || 0 : 0;
    const encodedChunks = request.chunks.filter(chunk => chunk.timestamp <= cutoff).reduce((sum, chunk) => sum + chunk.encodedBytes, 0);
    const transferredBytes = finished ? request.finishedEncodedBytes : headerBytes + encodedChunks;
    return { url: request.url, type: request.type, completed: finished, transferredBytes,
      decodedBodyBytesObserved: request.chunks.filter(chunk => chunk.timestamp <= cutoff).reduce((sum, chunk) => sum + chunk.decodedBytes, 0) };
  });
  return { cdpTimestamp: cutoff, transferredBytes: requests.reduce((sum, request) => sum + request.transferredBytes, 0),
    completedTransferredBytes: requests.filter(request => request.completed).reduce((sum, request) => sum + request.transferredBytes, 0),
    inFlightTransferredBytes: requests.filter(request => !request.completed).reduce((sum, request) => sum + request.transferredBytes, 0),
    method: 'Page-target CDP encodedDataLength, including headers; finished requests use authoritative totals. In-flight compressed chunks can be underreported by CDP. Resource Timing at hero ready is also saved.',
    requests };
}
async function runPage(browser, version, assets, origin, configuration) {
  const { name, mobile, baseline, timeoutMs } = configuration;
  const url = `${origin}${baseline ? '/baseline/' : '/agro-website-/'}`;
  const result = { name, url, viewport: { width: mobile ? 390 : 1440, height: mobile ? 844 : 900, mobile, deviceScaleFactor: 1 },
    timeoutMs, milestones: {}, checks: [], errors: [], failedUrls: [], console: [], network: [], heroSnapshot: null, status: 'starting' };
  let contextId, targetId, session, navigationAnchor, settle;
  let terminal = null, cleanupStarted = false;
  const currentRequests = new Map();
  const terminalSignal = new Promise(resolve => { settle = resolve; });
  function finish(reason) { if (!terminal) { terminal = reason; settle(); } }
  function maybeFinish() {
    if (!baseline && result.milestones.firstPaintMs > limits.firstPaintMs) return finish('first-paint-over-5s');
    if (['firstPaintMs', 'fcpMs', 'usefulH1PaintedMs', 'reactReadyMs', 'heroReadyMs'].every(key => result.milestones[key] != null)) finish('ready');
  }
  function onEvent(method, params) {
    if (method === 'Runtime.bindingCalled' && params.name === binding) {
      try {
        const message = JSON.parse(params.payload);
        result.timeOrigin = message.timeOrigin;
        if (message.kind === 'milestone') {
          const { name: metric, time, snapshot, ...details } = message.payload;
          result.milestones[metric] = time;
          (result.milestoneDetails ||= {})[metric] = details;
          if (snapshot) result.heroSnapshot = snapshot;
          maybeFinish();
        } else result.errors.push({ source: 'probe', ...message.payload });
      } catch (error) { result.errors.push({ source: 'probe-message', ...errorInfo(error) }); }
    }
    if (method === 'Runtime.exceptionThrown') result.errors.push({ source: 'exception', details: params.exceptionDetails });
    if (method === 'Runtime.consoleAPICalled') {
      const entry = { type: params.type, timestamp: params.timestamp, arguments: params.args, stackTrace: params.stackTrace };
      result.console.push(entry);
      if (params.type === 'error' || params.type === 'assert') result.errors.push({ source: 'console', ...entry });
    }
    if (method === 'Log.entryAdded' && ['error', 'warning'].includes(params.entry.level)) {
      result.console.push({ source: 'log', ...params.entry });
      if (params.entry.level === 'error') result.errors.push({ source: 'log', ...params.entry });
    }
    if (method === 'Inspector.targetCrashed') { result.errors.push({ source: 'browser', message: 'Target crashed' }); finish('crashed'); }
    if (method === 'Network.requestWillBeSent') {
      const previous = currentRequests.get(params.requestId);
      if (previous && params.redirectResponse) {
        previous.status = params.redirectResponse.status;
        previous.redirectTo = params.request.url;
        previous.finishedTimestamp = params.timestamp;
        previous.finishedEncodedBytes = params.redirectResponse.encodedDataLength || 0;
      }
      const record = { id: params.requestId, url: params.request.url, method: params.request.method, type: params.type,
        initiator: params.initiator, startTimestamp: params.timestamp, wallTime: params.wallTime, chunks: [] };
      currentRequests.set(params.requestId, record);
      result.network.push(record);
      if (!navigationAnchor && params.type === 'Document' && params.request.url === url) navigationAnchor = record;
    }
    const request = currentRequests.get(params.requestId);
    if (!request) return;
    if (method === 'Network.responseReceived') {
      Object.assign(request, { status: params.response.status, mimeType: params.response.mimeType, headers: params.response.headers,
        protocol: params.response.protocol, fromDiskCache: params.response.fromDiskCache, fromServiceWorker: params.response.fromServiceWorker,
        responseTimestamp: params.timestamp, responseEncodedBytes: params.response.encodedDataLength });
      if (params.response.status >= 400) result.failedUrls.push({ url: request.url, status: params.response.status, timestamp: params.timestamp });
    }
    if (method === 'Network.dataReceived') request.chunks.push({ timestamp: params.timestamp, encodedBytes: params.encodedDataLength, decodedBytes: params.dataLength });
    if (method === 'Network.loadingFinished') Object.assign(request, { finishedTimestamp: params.timestamp, finishedEncodedBytes: params.encodedDataLength });
    if (method === 'Network.loadingFailed') {
      Object.assign(request, { failure: params.errorText, failureTimestamp: params.timestamp, canceled: params.canceled, blockedReason: params.blockedReason });
      result.failedUrls.push({ url: request.url, ...params,
        duringIntentionalStop: !!params.canceled && (cleanupStarted || terminal === 'first-paint-over-5s' || terminal === 'timeout') });
    }
  }
  try {
    // Each run has an isolated fresh cache/storage context; never clear the main agent's cache.
    ({ browserContextId: contextId } = await browser.send('Target.createBrowserContext', { disposeOnDetach: true }));
    ({ targetId } = await browser.send('Target.createTarget', { url: 'about:blank', browserContextId: contextId }));
    const targets = await browserJSON('/json/list');
    const target = targets.find(item => item.id === targetId);
    assert.ok(target?.webSocketDebuggerUrl, 'New tab has no debugging websocket');
    session = await CDP.connect(target.webSocketDebuggerUrl);
    session.listeners.add(onEvent);
    await session.send('Page.enable');
    await session.send('Runtime.enable');
    await session.send('Log.enable');
    await session.send('Network.enable', { maxTotalBufferSize: 64000000, maxResourceBufferSize: 16000000 });
    await session.send('Network.setCacheDisabled', { cacheDisabled: true });
    await session.send('Network.setBypassServiceWorker', { bypass: true });
    await session.send('Network.emulateNetworkConditions', network);
    await session.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await session.send('Emulation.setDeviceMetricsOverride', result.viewport);
    await session.send('Emulation.setTouchEmulationEnabled', { enabled: mobile, ...(mobile ? { maxTouchPoints: 1 } : {}) });
    await session.send('Emulation.setEmulatedMedia', { media: 'screen', features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
    const userAgent = mobile
      ? version['User-Agent'].replace(/\([^)]*\)/, '(Linux; Android 13; Pixel 7)').replace(' Safari/', ' Mobile Safari/')
      : version['User-Agent'];
    await session.send('Emulation.setUserAgentOverride', { userAgent, platform: mobile ? 'Android' : 'Win32' });
    result.userAgent = userAgent;
    await session.send('Runtime.addBinding', { name: binding });
    await session.send('Page.addScriptToEvaluateOnNewDocument', { source: `(${installProbe.toString()})(${JSON.stringify(binding)})` });
    result.startedAt = new Date().toISOString();
    const started = Date.now();
    let deadline;
    try {
      deadline = setTimeout(() => finish('timeout'), timeoutMs);
      const navigation = await session.send('Page.navigate', { url });
      if (navigation.errorText) throw new Error(`Navigation failed: ${navigation.errorText}`);
      await terminalSignal;
    } finally { clearTimeout(deadline); }
    result.wallDurationMs = Date.now() - started;
    result.status = terminal;
    if (terminal !== 'ready') {
      result.errors.push({ source: 'readiness', message: terminal === 'first-paint-over-5s'
        ? `First paint ${result.milestones.firstPaintMs.toFixed(1)}ms exceeds 5000ms; navigation stopped immediately`
        : `Run stopped (${terminal}) before all readiness milestones, limit ${timeoutMs}ms` });
      await session.send('Page.stopLoading');
    }
    const evaluated = await session.send('Runtime.evaluate', { expression: 'window.__agroPerformance || null', returnByValue: true });
    if (evaluated.exceptionDetails) result.errors.push({ source: 'probe-snapshot', details: evaluated.exceptionDetails });
    else if (evaluated.result?.value) result.probe = evaluated.result.value;
    const heroMs = result.milestones.heroReadyMs;
    const cutoff = heroMs != null && navigationAnchor && result.timeOrigin != null
      ? navigationAnchor.startTimestamp + (result.timeOrigin / 1000 - navigationAnchor.wallTime) + heroMs / 1000 : null;
    result.heroReadyCdpTimestamp = cutoff;
    const forbiddenRequests = result.network.flatMap(request => {
      let parsed;
      try { parsed = new URL(request.url); } catch { return []; }
      if (parsed.origin !== origin || !parsed.pathname.startsWith('/agro-website-/')) return [];
      const name = decodeURIComponent(parsed.pathname.slice('/agro-website-/'.length));
      const reasons = assets.forbidden.get(name);
      return reasons ? [{ url: request.url, file: name, reasons, startTimestamp: request.startTimestamp,
        beforeHeroReady: cutoff == null ? null : request.startTimestamp <= cutoff }] : [];
    });
    // No scrolling takes place: forbid these fetches throughout startup, not just completed resources.
    result.forbiddenRequests = forbiddenRequests;
    const screenshotFile = path.join(output, `performance-${name}.png`);
    try {
      const { data } = await session.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
      await fs.writeFile(screenshotFile, Buffer.from(data, 'base64'));
      result.screenshot = screenshotFile;
    } catch (error) { result.errors.push({ source: 'screenshot', ...errorInfo(error) }); }
    if (!baseline) {
      check(result, 'Current first paint <= 5000ms', result.milestones.firstPaintMs != null && result.milestones.firstPaintMs <= limits.firstPaintMs,
        result.milestones.firstPaintMs ?? null, '<= 5000ms');
      check(result, 'Current FCP <= 5000ms', result.milestones.fcpMs != null && result.milestones.fcpMs <= limits.fcpMs, result.milestones.fcpMs ?? null, '<= 5000ms');
      check(result, 'All real readiness milestones observed', terminal === 'ready', result.milestones, 'paint, useful h1, React commit and rendered hero');
      const snapshot = result.heroSnapshot;
      const deferredUninitialized = !!snapshot && snapshot.productCards === 3 && snapshot.scrollY === 0
        && snapshot.viewers.length === 3 && snapshot.viewers.every(item => !item.initialized)
        && snapshot.globes.every(item => !item.initialized) && snapshot.iframes.length === 0 && snapshot.scenes.every(item => !item.initialized);
      check(result, 'Below-fold viewers/globe/iframes uninitialized at hero ready', deferredUninitialized, snapshot
        ? { viewers: snapshot.viewers, globes: snapshot.globes, iframes: snapshot.iframes, scenes: snapshot.scenes, scrollY: snapshot.scrollY } : null,
        'three deferred viewers; no scene initialization or iframe');
      check(result, 'No field/earth/shelf/paper/non-hero Three/unused variant fetched', forbiddenRequests.length === 0, forbiddenRequests, []);
      check(result, 'No runtime/probe errors', result.errors.length === 0, result.errors, []);
      const unexpectedFailures = result.failedUrls.filter(failure => !failure.duringIntentionalStop);
      check(result, 'No unexpected failed URLs', unexpectedFailures.length === 0, unexpectedFailures, []);
    }
  } catch (error) {
    result.status = 'error';
    result.errors.push({ source: 'test', ...errorInfo(error) });
    check(result, 'Run completed', false, error.message, 'complete');
    if (session) {
      try {
        await session.send('Page.stopLoading');
        const { data } = await session.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        result.screenshot = path.join(output, `performance-${name}.png`);
        await fs.writeFile(result.screenshot, Buffer.from(data, 'base64'));
      } catch (captureError) { result.errors.push({ source: 'failure-screenshot', ...errorInfo(captureError) }); }
    }
  } finally {
    cleanupStarted = true;
    if (targetId) {
      try { await browser.send('Target.closeTarget', { targetId }); }
      catch (error) { result.errors.push({ source: 'close-tab', ...errorInfo(error) }); }
    }
    session?.close();
    if (contextId) {
      try { await browser.send('Target.disposeBrowserContext', { browserContextId: contextId }); }
      catch (error) { result.errors.push({ source: 'close-context', ...errorInfo(error) }); }
    }
    // Include late-delivered Network events, but never bytes whose timestamps follow readiness.
    const heroMs = result.milestones.heroReadyMs;
    result.heroReadyCdpTimestamp = heroMs != null && navigationAnchor && result.timeOrigin != null
      ? navigationAnchor.startTimestamp + (result.timeOrigin / 1000 - navigationAnchor.wallTime) + heroMs / 1000 : null;
    result.transferBeforeHero = transferBefore(result.network, result.heroReadyCdpTimestamp);
    result.finishedAt = new Date().toISOString();
    result.targets = {
      fcpWithin3s: result.milestones.fcpMs == null ? null : result.milestones.fcpMs <= limits.fcpTargetMs,
      heroWithin10s: result.milestones.heroReadyMs == null ? null : result.milestones.heroReadyMs <= limits.heroTargetMs,
    };
  }
  return result;
}

const report = { timestamp: new Date().toISOString(), browserOrigin, baselineEnabled, limits,
  conditions: { network, cpuThrottleRate: 1, cacheDisabled: true, bypassServiceWorker: true,
    isolation: 'Fresh browser context and tab for each sequential run; main-agent tabs untouched', gzipLevel: 9 },
  checks: [], runs: [], errors: [], serverRequests: [] };
let server, browser;
let outputAvailable = false;
try {
  assert.ok(process.argv.slice(2).every(argument => argument === '--baseline'), 'Usage: node tests/performance.mjs [--baseline]');
  assert.ok((await fs.stat(output)).isDirectory(), 'Existing gitignored verification directory is required');
  outputAvailable = true;
  const assets = await loadArtifacts();
  report.artifactBytes = assets.stats;
  check(report, 'Initial entry + transitive static imports gzip < 200000 bytes', assets.stats.initialJsGzipBytes < limits.initialJsGzipBytes,
    assets.stats.initialJsGzipBytes, '< 200000 bytes');
  const listening = await startServer(assets, report.errors, report.serverRequests);
  server = listening.server;
  report.origin = listening.origin;
  const version = await browserJSON('/json/version');
  report.browserVersion = version.Browser;
  browser = await CDP.connect(version.webSocketDebuggerUrl);
  // The optional slow baseline is deliberately last. Current desktop/mobile always run first.
  const configurations = [
    { name: 'current-desktop', mobile: false, baseline: false, timeoutMs: 60000 },
    { name: 'current-mobile', mobile: true, baseline: false, timeoutMs: 60000 },
    ...(baselineEnabled ? [{ name: 'baseline-desktop', mobile: false, baseline: true, timeoutMs: 180000 }] : []),
  ];
  for (const configuration of configurations) {
    const run = await runPage(browser, version, assets, listening.origin, configuration);
    report.runs.push(run);
    if (run.status === 'first-paint-over-5s') break;
  }
} catch (error) {
  report.errors.push({ source: 'setup', ...errorInfo(error) });
} finally {
  browser?.close();
  if (server) {
    try {
      const closed = new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      server.closeAllConnections();
      await closed;
    } catch (error) { report.errors.push({ source: 'close-server', ...errorInfo(error) }); }
  }
  report.failedUrls = [
    ...report.runs.flatMap(run => run.failedUrls.map(failure => ({ run: run.name, ...failure }))),
    ...report.serverRequests.filter(request => request.status >= 400).map(request => ({ source: 'server', ...request })),
  ];
  report.allErrors = [...report.errors, ...report.runs.flatMap(run => run.errors.map(error => ({ run: run.name, ...error })))];
  report.passed = report.errors.length === 0 && report.runs.length === (baselineEnabled ? 3 : 2)
    && report.failedUrls.every(failure => failure.duringIntentionalStop)
    && report.checks.every(item => item.pass) && report.runs.every(run => run.status === 'ready' && run.errors.length === 0 && run.checks.every(item => item.pass));
  report.finishedAt = new Date().toISOString();
  const resultsFile = path.join(output, 'performance-results.json');
  if (outputAvailable) {
    try { await fs.writeFile(resultsFile, JSON.stringify(report, null, 2)); }
    catch (error) { report.passed = false; console.error(`Cannot save results: ${error.message}`); }
  }
  const ms = value => value == null ? 'not observed' : `${Math.round(value)}ms`;
  console.log(`Performance ${report.passed ? 'PASS' : 'FAIL'}; Chrome attach ${browserOrigin}; 400ms latency, 50,000 B/s, no CPU throttle.`);
  if (report.artifactBytes) {
    const bytes = report.artifactBytes;
    console.log(`Gzip JS: initial ${bytes.initialJsGzipBytes} B; deferred ${bytes.deferredJsGzipBytes} B. Total live artifact served bytes: ${bytes.totalArtifactServedBytes} B (text gzip, binary identity). Baseline HTML gzip: ${bytes.baseline.gzipBytes} B.`);
  }
  for (const run of report.runs) {
    console.log(`${run.name}: ${run.status}; FP ${ms(run.milestones.firstPaintMs)}, FCP ${ms(run.milestones.fcpMs)}, useful h1 ${ms(run.milestones.usefulH1PaintedMs)}, React ${ms(run.milestones.reactReadyMs)}, hero ${ms(run.milestones.heroReadyMs)}; pre-hero transfer ${run.transferBeforeHero?.transferredBytes ?? 'unknown'} B.`);
    console.log(`  3s FCP target ${run.targets.fcpWithin3s == null ? 'NOT OBSERVED' : run.targets.fcpWithin3s ? 'MET' : 'UNMET'}; 10s hero target ${run.targets.heroWithin10s == null ? 'NOT OBSERVED' : run.targets.heroWithin10s ? 'MET' : 'UNMET'}; failed checks ${run.checks.filter(item => !item.pass).length}, errors ${run.errors.length}, failed URLs ${run.failedUrls.length}.`);
  }
  for (const error of report.errors.slice(0, 3)) console.error(error.message);
  console.log(`JSON and screenshots: ${outputAvailable ? resultsFile : 'verification directory unavailable'}`);
  if (!report.passed) process.exitCode = 1;
}
