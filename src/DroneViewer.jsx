import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildDrone } from './droneModels';

function shadowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  r.addColorStop(0, 'rgba(0,0,0,.55)');
  r.addColorStop(0.55, 'rgba(0,0,0,.22)');
  r.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

// One WebGL context for every viewer: shader programs compile once instead of once per viewer.
let shared = null;
function acquireRenderer() {
  if (shared?.lost) throw new Error('WebGL context lost');
  if (!shared) {
    const renderer = new THREE.WebGLRenderer({ canvas: document.createElement('canvas'), alpha: true, antialias: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(1);
    renderer.setClearColor(0x000000, 0);
    renderer.setScissorTest(true);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    const env = pmrem.fromScene(room, 0.04).texture;
    const onLost = new Set();
    const s = { renderer, pmrem, room, env, onLost, users: 0, width: 0, height: 0, lost: false };
    renderer.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); s.lost = true; [...onLost].forEach(f => f()); });
    shared = s;
  }
  shared.users++;
  return shared;
}
function releaseRenderer() {
  if (--shared.users > 0) return;
  shared.env.dispose();
  shared.room.dispose?.();
  shared.pmrem.dispose();
  shared.renderer.dispose();
  shared = null;
}
function paint(s, scene, camera, ctx, w, h) {
  if (s.lost) return;
  if (w > s.width || h > s.height) {
    s.width = Math.max(s.width, w);
    s.height = Math.max(s.height, h);
    s.renderer.setSize(s.width, s.height, false);
  }
  s.renderer.setViewport(0, 0, w, h);
  s.renderer.setScissor(0, 0, w, h);
  s.renderer.render(scene, camera);
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(s.renderer.domElement, 0, s.height - h, w, h, 0, 0, w, h);
}

export default function DroneViewer({ product, paused = false, reduced = false, hero = false }) {
  const stageRef = useRef(null);
  const canvasRef = useRef(null);
  const apiRef = useRef(null);
  const motionRef = useRef({ paused, reduced });
  const [unavailable, setUnavailable] = useState(false);
  const [readyProduct, setReadyProduct] = useState(null);
  const [photoFailed, setPhotoFailed] = useState(false);
  const loading = readyProduct !== product.id;

  useEffect(() => {
    motionRef.current = { paused, reduced };
    apiRef.current?.sync();
  }, [paused, reduced]);

  useEffect(() => {
    setPhotoFailed(false);
    if (!unavailable) apiRef.current?.show(product.id);
  }, [product.id, unavailable]);

  useEffect(() => {
    let cleanup;
    // Yield before GPU setup so the loading placeholder can paint.
    const timer = setTimeout(() => { cleanup = initialize(); }, 0);
    function initialize() {
      const stage = stageRef.current;
      const canvas = canvasRef.current;
      let sh, ctx;
      try {
        sh = acquireRenderer();
      } catch {
        setUnavailable(true);
        return undefined;
      }
      ctx = canvas.getContext('2d');
      let pw = 1, ph = 1;

      const scene = new THREE.Scene();
      scene.environment = sh.env;
      scene.environmentIntensity = 0.75;
      const key = new THREE.DirectionalLight(0xfff1e4, 2.1);
      key.position.set(-3, 5, 4);
      const rim = new THREE.DirectionalLight(0xff8a45, 1.1);
      rim.position.set(4, 2, -4);
      scene.add(key, rim, new THREE.AmbientLight(0xffffff, 0.25));

      const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
      const target = new THREE.Vector3(0, 0, 0);
      const shadowMap = shadowTexture();
      const shadowMat = new THREE.MeshBasicMaterial({ map: shadowMap, transparent: true, depthWrite: false });
      const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), shadowMat);
      shadow.rotation.x = -Math.PI / 2;
      scene.add(shadow);

      const pivot = new THREE.Group();
      const hover = new THREE.Group();
      hover.add(pivot);
      scene.add(hover);

      const state = { yaw: -0.55, pitch: 0, props: [], current: null, disposables: [], frames: 0, product: null };
      let disposed = false, contextLost = false, frame = null, last = null, pointer = null, visible = false, elapsed = 0;

      const show = id => {
        if (state.product === id) return;
        // Build first so the shared surface textures stay alive across the swap.
        const built = buildDrone(id);
        if (state.current) {
          pivot.remove(state.current);
          state.disposables.forEach(d => d.dispose());
        }
        const box = new THREE.Box3().setFromObject(built.root);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const fit = 3.1 / Math.max(size.x, size.z);
        built.root.scale.setScalar(fit);
        built.root.position.set(-center.x * fit, -box.min.y * fit, -center.z * fit);
        pivot.position.y = -size.y * fit * 0.5;
        shadow.scale.set(size.x * fit * 1.05, size.z * fit * 1.05, 1);
        shadow.position.y = pivot.position.y - 0.02;
        pivot.add(built.root);
        state.current = built.root;
        state.props = built.props;
        state.disposables = built.disposables;
        state.product = id;
        state.yaw = -0.55;
        state.pitch = 0;
        resize();
        setReadyProduct(id);
      };

      const draw = () => {
        if (disposed || contextLost) return;
        pivot.rotation.set(0, state.yaw, 0);
        hover.rotation.x = state.pitch;
        paint(sh, scene, camera, ctx, pw, ph);
        state.frames++;
      };
      const moving = () => visible && !document.hidden && !motionRef.current.paused && !motionRef.current.reduced;
      const step = dt => {
        elapsed += dt;
        if (!pointer) state.yaw += dt * 0.32;
        for (const p of state.props) p.rotation.y += dt * 11 * p.userData.spin;
        hover.position.y = Math.sin(elapsed * 1.3) * 0.05;
        draw();
      };
      const stop = () => { if (frame !== null) cancelAnimationFrame(frame); frame = null; last = null; };
      const tick = time => {
        frame = null;
        if (disposed || contextLost || !moving()) { last = null; return; }
        step(last === null ? 0 : Math.min((time - last) / 1000, 0.05));
        last = time;
        frame = requestAnimationFrame(tick);
      };
      const sync = () => {
        for (const p of state.props) p.children.forEach(c => { if (c.userData.blur) c.visible = moving(); });
        if (!moving()) stop();
        else if (frame === null) frame = requestAnimationFrame(tick);
        draw();
      };

      const resize = () => {
        if (disposed || contextLost) return;
        const r = stage.getBoundingClientRect();
        const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
        const dpr = Math.min(window.devicePixelRatio || 1, hero ? 1.75 : 1.5);
        pw = Math.round(w * dpr);
        ph = Math.round(h * dpr);
        if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
        camera.aspect = w / h;
        const distance = 5 / Math.min(1, camera.aspect / 1.5) * (hero ? 0.92 : 1);
        camera.position.set(0, distance * 0.36, distance);
        camera.lookAt(target);
        camera.updateProjectionMatrix();
        draw();
      };
      const resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(stage);
      const io = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); }, { rootMargin: '80px' });
      io.observe(stage);
      const onVisibility = () => sync();
      document.addEventListener('visibilitychange', onVisibility);

      const down = e => {
        if (pointer || !e.isPrimary || e.button !== 0) return;
        canvas.setPointerCapture(e.pointerId);
        pointer = { id: e.pointerId, x: e.clientX, y: e.clientY };
        stage.classList.add('dragging');
      };
      const move = e => {
        if (!pointer || e.pointerId !== pointer.id) return;
        state.yaw += (e.clientX - pointer.x) * 0.012;
        state.pitch = THREE.MathUtils.clamp(state.pitch + (e.clientY - pointer.y) * 0.006, -0.35, 0.6);
        pointer.x = e.clientX;
        pointer.y = e.clientY;
        draw();
      };
      const up = e => {
        if (!pointer || e.pointerId !== pointer.id) return;
        if (canvas.hasPointerCapture(pointer.id)) canvas.releasePointerCapture(pointer.id);
        pointer = null;
        stage.classList.remove('dragging');
      };
      const key3d = e => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault();
          state.yaw += e.key === 'ArrowLeft' ? -0.3 : 0.3;
          draw();
        }
      };
      const lost = () => { contextLost = true; stop(); setReadyProduct(null); setUnavailable(true); };
      canvas.addEventListener('pointerdown', down);
      canvas.addEventListener('pointermove', move);
      canvas.addEventListener('pointerup', up);
      canvas.addEventListener('pointercancel', up);
      canvas.addEventListener('lostpointercapture', up);
      canvas.addEventListener('keydown', key3d);
      sh.onLost.add(lost);

      apiRef.current = { sync, show };
      stage.__drone = { state, step: dt => { step(dt); return { yaw: state.yaw, frames: state.frames, props: state.props.map(p => p.rotation.y) }; } };
      show(product.id);
      sync();

      return () => {
        disposed = true;
        stop();
        resizeObserver.disconnect();
        io.disconnect();
        document.removeEventListener('visibilitychange', onVisibility);
        canvas.removeEventListener('pointerdown', down);
        canvas.removeEventListener('pointermove', move);
        canvas.removeEventListener('pointerup', up);
        canvas.removeEventListener('pointercancel', up);
        canvas.removeEventListener('lostpointercapture', up);
        canvas.removeEventListener('keydown', key3d);
        sh.onLost.delete(lost);
        state.disposables.forEach(d => d.dispose());
        shadow.geometry.dispose();
        shadowMat.dispose();
        shadowMap.dispose();
        releaseRenderer();
        apiRef.current = null;
        delete stage.__drone;
      };
    }
    return () => { clearTimeout(timer); cleanup?.(); };
  }, [hero]);

  return <div ref={stageRef} className={`drone-stage ${loading ? 'viewer-pending' : ''}`} data-product={product.id} aria-busy={loading}>
    <canvas ref={canvasRef} tabIndex={loading ? -1 : 0} role="img" aria-label={`${product.brand} ${product.name} 3D illustration. Drag or use the arrow keys to rotate 360 degrees.`} hidden={unavailable} style={{ touchAction: 'pan-y' }} />
    {unavailable && <img key={product.id} className="drone-fallback" src={product.image} alt={`${product.brand} ${product.name}`} onLoad={() => { setPhotoFailed(false); setReadyProduct(product.id); }} onError={() => { setPhotoFailed(true); setReadyProduct(product.id); }} />}
    <div className="viewer-loading" role={loading ? 'status' : undefined} aria-label={loading ? `Loading ${product.name} ${unavailable ? 'photo' : '3D view'}` : undefined} aria-hidden={!loading}>
      {hero ? <span className="loading-arc" aria-hidden="true" /> : <div className="viewer-skeleton" aria-hidden="true"><span /><span /><span /></div>}
    </div>
    {photoFailed && <span className="viewer-error" role="status">Photo unavailable. View the published specifications below.</span>}
  </div>;
}
