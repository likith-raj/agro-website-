import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import earthUrl from './assets/earth.jpg';

export default function Globe({ paused = false, reducedMotion = false }) {
  const stageRef = useRef(null);
  const canvasRef = useRef(null);
  const motionRef = useRef({ paused, reducedMotion });
  const syncRef = useRef(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    motionRef.current = { paused, reducedMotion };
    syncRef.current?.();
  }, [paused, reducedMotion]);

  useEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    const parent = stage;
    const rotation = new THREE.Euler(-0.08, 3.2, 0);
    const getRotation = () => ({ x: rotation.x, y: rotation.y, z: rotation.z });
    stage.getRotation = getRotation;
    stage.__step = () => getRotation();

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        powerPreference: 'low-power',
      });
    } catch {
      setUnavailable(true);
      return () => {
        delete stage.__step;
        delete stage.getRotation;
      };
    }

    setUnavailable(false);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 40);
    camera.position.set(0, 0, 6.6);
    const geometry = new THREE.SphereGeometry(2, 48, 32);
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.92,
      metalness: 0,
    });
    const earth = new THREE.Mesh(geometry, material);
    scene.add(earth);
    scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2);
    keyLight.position.set(-4, 3, 5);
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.45);
    fillLight.position.set(4, -1, 2);
    scene.add(keyLight, fillLight);

    let disposed = false;
    let contextLost = false;
    let frame = null;
    let lastTime = null;
    let pointer = null;
    let visible = false;

    const draw = () => {
      if (disposed || contextLost) return;
      earth.rotation.copy(rotation);
      renderer.render(scene, camera);
    };
    const moving = () => visible && !document.hidden && !motionRef.current.paused && !motionRef.current.reducedMotion;
    const step = (seconds) => {
      if (!disposed && !contextLost && moving() && !pointer && Number.isFinite(seconds) && seconds > 0) {
        rotation.y += seconds * 0.075;
      }
      draw();
      return getRotation();
    };
    stage.__step = step;

    const stop = () => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      lastTime = null;
    };
    const tick = (time) => {
      frame = null;
      if (disposed || contextLost || !moving() || pointer) {
        lastTime = null;
        return;
      }
      step(lastTime === null ? 0 : Math.min((time - lastTime) / 1000, 0.1));
      lastTime = time;
      frame = requestAnimationFrame(tick);
    };
    const sync = () => {
      if (disposed || contextLost || !moving() || pointer) {
        stop();
      } else if (frame === null) {
        lastTime = null;
        frame = requestAnimationFrame(tick);
      }
      draw();
    };
    syncRef.current = sync;
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      sync();
    }, { rootMargin: '100px' });
    intersection.observe(stage);
    document.addEventListener('visibilitychange', sync);

    const texture = new THREE.TextureLoader().load(earthUrl, (loaded) => {
      if (disposed) {
        loaded.dispose();
        return;
      }
      draw();
    });
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    material.map = texture;
    material.needsUpdate = true;

    const resize = () => {
      if (disposed || contextLost) return;
      const bounds = parent.getBoundingClientRect();
      const width = Math.max(1, Math.round(bounds.width));
      const height = Math.max(1, Math.round(bounds.height || bounds.width));
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.position.z = 6.6 / Math.min(camera.aspect, 1);
      camera.updateProjectionMatrix();
      draw();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(parent);
    resize();

    const pointerDown = (event) => {
      if (disposed || contextLost || pointer || !event.isPrimary || event.button !== 0) return;
      canvas.setPointerCapture(event.pointerId);
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
      sync();
    };
    const pointerMove = (event) => {
      if (!pointer || event.pointerId !== pointer.id) return;
      rotation.y += (event.clientX - pointer.x) * 0.007;
      rotation.x = THREE.MathUtils.clamp(
        rotation.x + (event.clientY - pointer.y) * 0.005,
        -0.55,
        0.55,
      );
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      draw();
    };
    const pointerEnd = (event) => {
      if (!pointer || event.pointerId !== pointer.id) return;
      const id = pointer.id;
      pointer = null;
      if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
      sync();
    };
    const loseContext = (event) => {
      event.preventDefault();
      contextLost = true;
      stop();
      setUnavailable(true);
    };
    canvas.addEventListener('pointerdown', pointerDown);
    canvas.addEventListener('pointermove', pointerMove);
    canvas.addEventListener('pointerup', pointerEnd);
    canvas.addEventListener('pointercancel', pointerEnd);
    canvas.addEventListener('lostpointercapture', pointerEnd);
    canvas.addEventListener('webglcontextlost', loseContext);
    sync();

    return () => {
      disposed = true;
      stop();
      observer.disconnect();
      intersection.disconnect();
      document.removeEventListener('visibilitychange', sync);
      canvas.removeEventListener('pointerdown', pointerDown);
      canvas.removeEventListener('pointermove', pointerMove);
      canvas.removeEventListener('pointerup', pointerEnd);
      canvas.removeEventListener('pointercancel', pointerEnd);
      canvas.removeEventListener('lostpointercapture', pointerEnd);
      canvas.removeEventListener('webglcontextlost', loseContext);
      if (pointer && canvas.hasPointerCapture(pointer.id)) canvas.releasePointerCapture(pointer.id);
      pointer = null;
      if (syncRef.current === sync) syncRef.current = null;
      delete stage.__step;
      delete stage.getRotation;
      texture.dispose();
      geometry.dispose();
      material.dispose();
      scene.clear();
      renderer.dispose();
    };
  }, []);

  return (
    <div className="globe-stage" ref={stageRef}>
      <canvas
        ref={canvasRef}
        className="globe-canvas"
        aria-label="Earth globe — drag to turn and tilt"
        role="img"
        hidden={unavailable}
        style={{ touchAction: 'pan-y', ...(unavailable ? { display: 'none' } : {}) }}
      />
      {unavailable && (
        <div className="globe-fallback">
          <div
            className="globe-fallback-earth"
            role="img"
            aria-label="Static Earth"
            style={{
              width: '100%',
              aspectRatio: '1',
              borderRadius: '50%',
              backgroundImage: `url(${earthUrl})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              boxShadow: 'inset -30px -12px 45px rgba(0, 0, 0, 0.7)',
            }}
          />
          <span className="globe-fallback-label" role="status">
            Static Earth view — WebGL unavailable
          </span>
        </div>
      )}
    </div>
  );
}
