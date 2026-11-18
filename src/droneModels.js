import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

// Procedural 3D illustrations built from manufacturer photos and published proportions (metres, +Z = nose).

function kit() {
  const disposables = [];
  const keep = item => { disposables.push(item); return item; };
  const m = (color, roughness = 0.5, metalness = 0, extra = {}) => keep(new THREE.MeshPhysicalMaterial({ color, roughness, metalness, ...extra }));
  const mats = {
    shell: m(0xd2d3cf, 0.42, 0, { clearcoat: 0.35, clearcoatRoughness: 0.4 }),
    shellLight: m(0xe1e2de, 0.38, 0, { clearcoat: 0.45, clearcoatRoughness: 0.35 }),
    shellMid: m(0xa9aba8, 0.5),
    carbon: m(0x18191b, 0.38, 0.25, { clearcoat: 0.6, clearcoatRoughness: 0.25 }),
    black: m(0x0e0f10, 0.55, 0.1),
    rubber: m(0x101010, 0.85),
    yellow: m(0xf3c316, 0.4),
    orange: m(0xff6a1f, 0.45),
    bladeLight: m(0xdcdedb, 0.35, 0, { side: THREE.DoubleSide, clearcoat: 0.3 }),
    bladeDark: m(0x1d1f22, 0.45, 0, { side: THREE.DoubleSide }),
    bladeGrey: m(0x45484c, 0.45, 0, { side: THREE.DoubleSide }),
    lamp: m(0xffffff, 0.2, 0, { emissive: 0xfff4e0, emissiveIntensity: 2.2 }),
    glass: m(0x050608, 0.08, 0.2, { clearcoat: 1, clearcoatRoughness: 0.05 }),
    lensRing: m(0x2a2c2f, 0.3, 0.6),
    mavic: m(0x5b5e62, 0.48, 0.05, { clearcoat: 0.25, clearcoatRoughness: 0.5 }),
    mavicDark: m(0x2f3134, 0.5, 0.05),
    mavicLight: m(0x8a8d90, 0.45, 0.05, { clearcoat: 0.3 }),
    blur: m(0xffffff, 1, 0, { transparent: true, opacity: 0.06, depthWrite: false, side: THREE.DoubleSide }),
  };
  const geo = g => keep(g);
  const mesh = (g, material, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo(g), material); o.position.set(x, y, z); return o; };
  const box = (w, h, d, r, material, x, y, z) => mesh(new RoundedBoxGeometry(w, h, d, 4, Math.min(r, w / 2, h / 2, d / 2) * 0.999), material, x, y, z);
  const cyl = (rt, rb, h, material, x, y, z, seg = 32) => mesh(new THREE.CylinderGeometry(rt, rb, h, seg), material, x, y, z);
  const tube = (a, b, r, material) => {
    const dir = new THREE.Vector3().subVectors(b, a);
    const o = mesh(new THREE.CylinderGeometry(r, r, dir.length(), 20), material);
    o.position.copy(a).addScaledVector(dir, 0.5);
    o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    return o;
  };
  const bladeShape = (len, root, chord, tipFrom = 1) => {
    const s = new THREE.Shape();
    const L = len * tipFrom;
    s.moveTo(0, -root / 2);
    s.bezierCurveTo(len * 0.18, -chord * 0.75, len * 0.55, -chord * 0.62, L, -chord * 0.28 * (tipFrom === 1 ? 1 : 1.2));
    s.quadraticCurveTo(L + chord * 0.12, 0, L, chord * 0.22);
    s.bezierCurveTo(len * 0.55, chord * 0.42, len * 0.2, chord * 0.5, 0, root / 2);
    s.lineTo(0, -root / 2);
    return s;
  };
  // Two-blade propeller; tip colour optional (DJI orange tips on T25 / Mavic).
  const prop = (len, chord, material, tipMaterial, hubR) => {
    const g = new THREE.Group();
    const extrude = { depth: chord * 0.08, bevelEnabled: false, curveSegments: 18 };
    const blade = geo(new THREE.ExtrudeGeometry(bladeShape(len, chord * 0.55, chord), extrude));
    blade.rotateX(Math.PI / 2);
    let tip;
    if (tipMaterial) {
      const ts = new THREE.Shape();
      const a = len * 0.9;
      ts.moveTo(a, -chord * 0.32);
      ts.lineTo(len, -chord * 0.28);
      ts.quadraticCurveTo(len + chord * 0.12, 0, len, chord * 0.22);
      ts.lineTo(a, chord * 0.27);
      ts.lineTo(a, -chord * 0.32);
      tip = geo(new THREE.ExtrudeGeometry(ts, { ...extrude, depth: extrude.depth * 1.15 }));
      tip.rotateX(Math.PI / 2);
    }
    for (const side of [0, 1]) {
      const arm = new THREE.Group();
      arm.rotation.y = side * Math.PI;
      const b = new THREE.Mesh(blade, material);
      b.rotation.x = 0.16;
      arm.add(b);
      if (tip) { const t = new THREE.Mesh(tip, tipMaterial); t.rotation.x = 0.16; t.position.y = 0.0005; arm.add(t); }
      g.add(arm);
    }
    g.add(cyl(hubR, hubR, chord * 0.5, mats.black, 0, 0, 0));
    const disc = mesh(new THREE.CircleGeometry(len * 1.02, 48), mats.blur);
    disc.rotation.x = -Math.PI / 2;
    disc.userData.blur = true;
    g.add(disc);
    return g;
  };
  return { mats, mesh, box, cyl, tube, prop, disposables };
}

function agras({ coaxial, scale, bladeMaterial, tipMaterial, sprinklerFront }) {
  const k = kit();
  const { mats, box, cyl, tube } = k;
  const root = new THREE.Group();
  const props = [];
  const s = scale;

  // Fuselage: frame, spray tank, top cover, front sensor column, lamps.
  root.add(box(0.56 * s, 0.34 * s, 0.78 * s, 0.07 * s, mats.shellMid, 0, 0.55 * s, 0));
  root.add(box(0.6 * s, 0.36 * s, 0.6 * s, 0.11 * s, mats.shell, 0, 0.86 * s, -0.04 * s));
  root.add(box(0.5 * s, 0.1 * s, 0.5 * s, 0.05 * s, mats.shellLight, 0, 1.06 * s, -0.06 * s));
  root.add(cyl(0.08 * s, 0.085 * s, 0.26 * s, mats.shellMid, 0, 1.0 * s, 0.24 * s, 40));
  root.add(cyl(0.084 * s, 0.084 * s, 0.02 * s, mats.black, 0, 1.12 * s, 0.24 * s, 40));
  root.add(cyl(0.065 * s, 0.065 * s, 0.05 * s, mats.shellMid, 0.17 * s, 1.12 * s, -0.12 * s, 32));
  root.add(box(0.44 * s, 0.2 * s, 0.06 * s, 0.03 * s, mats.shellMid, 0, 0.62 * s, 0.38 * s));
  for (const x of [-0.13, 0.13]) {
    root.add(box(0.07 * s, 0.035 * s, 0.02 * s, 0.01 * s, mats.lamp, x * s, 0.6 * s, 0.415 * s));
    const lens = cyl(0.022 * s, 0.022 * s, 0.02 * s, mats.glass, x * 0.45 * s, 0.68 * s, 0.415 * s, 24);
    lens.rotation.x = Math.PI / 2;
    root.add(lens);
  }
  root.add(box(0.3 * s, 0.12 * s, 0.42 * s, 0.04 * s, mats.black, 0, 0.33 * s, 0));
  root.add(box(0.18 * s, 0.08 * s, 0.1 * s, 0.02 * s, mats.black, 0, 0.36 * s, 0.32 * s));

  // Landing gear: splayed black legs with skids.
  for (const x of [-1, 1]) {
    for (const z of [-1, 1]) root.add(tube(new THREE.Vector3(x * 0.2 * s, 0.42 * s, z * 0.22 * s), new THREE.Vector3(x * 0.3 * s, 0.03 * s, z * 0.3 * s), 0.024 * s, mats.carbon));
    root.add(tube(new THREE.Vector3(x * 0.3 * s, 0.025 * s, -0.42 * s), new THREE.Vector3(x * 0.3 * s, 0.025 * s, 0.42 * s), 0.026 * s, mats.rubber));
  }

  // Four arms in an X with fold joints, yellow bands and motors.
  const reach = { x: 1.0 * s, z: 0.86 * s };
  for (const [sx, sz, spin] of [[1, 1, 1], [-1, 1, -1], [1, -1, -1], [-1, -1, 1]]) {
    const base = new THREE.Vector3(sx * 0.27 * s, 0.7 * s, sz * 0.28 * s);
    const end = new THREE.Vector3(sx * reach.x, 0.74 * s, sz * reach.z);
    root.add(tube(base, end, 0.036 * s, mats.carbon));
    const dir = new THREE.Vector3().subVectors(end, base).normalize();
    const joint = box(0.11 * s, 0.1 * s, 0.11 * s, 0.025 * s, mats.black, 0, 0, 0);
    joint.position.copy(base).addScaledVector(dir, 0.08 * s);
    root.add(joint);
    const band = tube(base.clone().addScaledVector(dir, 0.17 * s), base.clone().addScaledVector(dir, 0.2 * s), 0.039 * s, mats.yellow);
    root.add(band);
    root.add(cyl(0.06 * s, 0.06 * s, 0.1 * s, mats.black, end.x, end.y, end.z));
    root.add(cyl(0.1 * s, 0.09 * s, 0.11 * s, mats.black, end.x, end.y + 0.1 * s, end.z, 40));
    const top = k.prop(0.68 * s, 0.13 * s, bladeMaterial(mats), tipMaterial?.(mats), 0.05 * s);
    top.position.set(end.x, end.y + 0.17 * s, end.z);
    top.rotation.y = sx * sz * 0.6;
    top.userData.spin = spin;
    root.add(top);
    props.push(top);
    if (coaxial) {
      root.add(cyl(0.09 * s, 0.1 * s, 0.13 * s, mats.black, end.x, end.y - 0.11 * s, end.z, 40));
      const low = k.prop(0.68 * s, 0.13 * s, bladeMaterial(mats), tipMaterial?.(mats), 0.05 * s);
      low.position.set(end.x, end.y - 0.2 * s, end.z);
      low.rotation.y = -sx * sz * 0.9;
      low.userData.spin = -spin;
      root.add(low);
      props.push(low);
    }
    // Centrifugal atomizing sprinklers hang below the arms.
    if ((sprinklerFront ? sz > 0 : sz < 0)) {
      const at = base.clone().lerp(end, 0.86);
      root.add(tube(at, at.clone().setY(at.y - 0.16 * s), 0.018 * s, mats.black));
      root.add(cyl(0.045 * s, 0.05 * s, 0.17 * s, mats.black, at.x, at.y - 0.27 * s, at.z, 28));
      root.add(cyl(0.055 * s, 0.055 * s, 0.02 * s, mats.carbon, at.x, at.y - 0.36 * s, at.z, 28));
    }
  }
  return { root, props, disposables: k.disposables };
}

function mavic3m() {
  const k = kit();
  const { mats, box, cyl, mesh } = k;
  const root = new THREE.Group();
  const props = [];
  const S = 4.2;

  // Body: tapered shell with a raised spine and the RTK module on top.
  const body = box(0.098 * S, 0.072 * S, 0.215 * S, 0.03 * S, mats.mavic, 0, 0.1 * S, 0);
  root.add(body);
  root.add(box(0.07 * S, 0.03 * S, 0.17 * S, 0.014 * S, mats.mavicLight, 0, 0.14 * S, -0.005 * S));
  root.add(cyl(0.028 * S, 0.034 * S, 0.034 * S, mats.mavicLight, 0, 0.17 * S, -0.015 * S, 40));
  const dome = mesh(new THREE.SphereGeometry(0.028 * S, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), mats.mavicLight, 0, 0.187 * S, -0.015 * S);
  root.add(dome);
  for (let i = 0; i < 6; i++) root.add(box(0.05 * S, 0.003 * S, 0.004 * S, 0.0015 * S, mats.black, 0, 0.121 * S, (0.07 + i * 0.008) * S));
  for (const x of [-0.035, 0.035]) {
    const eye = cyl(0.009 * S, 0.009 * S, 0.006 * S, mats.glass, x * S, 0.105 * S, 0.104 * S, 24);
    eye.rotation.x = Math.PI / 2;
    root.add(eye);
  }

  // Gimbal: RGB camera plus four multispectral lenses.
  root.add(box(0.03 * S, 0.02 * S, 0.02 * S, 0.006 * S, mats.mavicDark, 0, 0.068 * S, 0.095 * S));
  const cam = box(0.062 * S, 0.044 * S, 0.042 * S, 0.01 * S, mats.mavicDark, 0, 0.045 * S, 0.112 * S);
  root.add(cam);
  for (let i = 0; i < 4; i++) {
    const l = cyl(0.0045 * S, 0.0045 * S, 0.004 * S, mats.glass, (-0.021 + i * 0.014) * S, 0.056 * S, 0.134 * S, 20);
    l.rotation.x = Math.PI / 2;
    root.add(l);
  }
  const ring = cyl(0.012 * S, 0.012 * S, 0.004 * S, mats.lensRing, 0, 0.037 * S, 0.134 * S, 32);
  ring.rotation.x = Math.PI / 2;
  root.add(ring);
  const big = cyl(0.009 * S, 0.009 * S, 0.006 * S, mats.glass, 0, 0.037 * S, 0.135 * S, 32);
  big.rotation.x = Math.PI / 2;
  root.add(big);

  // Folding arms: front pair from the upper body, rear pair from below.
  const arms = [
    { from: [0.045, 0.115, 0.055], to: [0.165, 0.118, 0.115], front: true, spin: 1 },
    { from: [-0.045, 0.115, 0.055], to: [-0.165, 0.118, 0.115], front: true, spin: -1 },
    { from: [0.04, 0.085, -0.07], to: [0.16, 0.098, -0.125], front: false, spin: -1 },
    { from: [-0.04, 0.085, -0.07], to: [-0.16, 0.098, -0.125], front: false, spin: 1 },
  ];
  for (const a of arms) {
    const from = new THREE.Vector3(...a.from).multiplyScalar(S);
    const to = new THREE.Vector3(...a.to).multiplyScalar(S);
    const dir = new THREE.Vector3().subVectors(to, from);
    const arm = box(dir.length(), 0.014 * S, 0.022 * S, 0.006 * S, mats.mavic, 0, 0, 0);
    arm.position.copy(from).addScaledVector(dir, 0.5);
    arm.rotation.y = -Math.atan2(dir.z, dir.x);
    arm.rotation.z = Math.atan2(dir.y, Math.hypot(dir.x, dir.z));
    root.add(arm);
    root.add(cyl(0.016 * S, 0.016 * S, 0.026 * S, mats.mavicDark, to.x, to.y + 0.008 * S, to.z));
    root.add(cyl(0.012 * S, 0.013 * S, 0.008 * S, mats.mavic, to.x, to.y - 0.009 * S, to.z));
    if (a.front) {
      const leg = box(0.008 * S, 0.05 * S, 0.012 * S, 0.003 * S, mats.mavicDark, to.x, to.y - 0.034 * S, to.z);
      root.add(leg);
    } else {
      const leg = box(0.01 * S, 0.06 * S, 0.014 * S, 0.004 * S, mats.mavic, from.x * 1.1, 0.045 * S, from.z * 1.15);
      root.add(leg);
    }
    const p = k.prop(0.12 * S, 0.026 * S, mats.bladeGrey, mats.orange, 0.006 * S);
    p.position.set(to.x, to.y + 0.024 * S, to.z);
    p.rotation.y = a.spin * 0.8;
    p.userData.spin = a.spin;
    root.add(p);
    props.push(p);
  }
  return { root, props, disposables: k.disposables };
}

export function buildDrone(id) {
  if (id === 't50') return agras({ coaxial: true, scale: 1, bladeMaterial: m => m.bladeLight, sprinklerFront: false });
  if (id === 't25') return agras({ coaxial: false, scale: 0.86, bladeMaterial: m => m.bladeDark, tipMaterial: m => m.orange, sprinklerFront: false });
  return mavic3m();
}
