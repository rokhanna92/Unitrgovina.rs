// Unitrgovina, "Od reke do temelja": scroll-driven aggregate scene (three.js).
// Ported from design/strata.js. Same scene, same numbers; three.js comes from npm and the build
// yields to the main thread between the heavy steps.
import * as THREE from 'three';

export type StrataOptions = { quality?: 'full' | 'lite' };
export type Strata = {
  setProgress(p: number): void;
  setPointer(x: number, y: number): void;
  setActive(a: boolean): void;
  dispose(): void;
};
type V3 = [number, number, number];

const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const yieldToMain = () => new Promise<void>((r) => setTimeout(r, 0));
function mulberry32(a: number) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const ctx2d = (c: HTMLCanvasElement) => c.getContext('2d') as CanvasRenderingContext2D;

// periodic value noise + fBm for procedural stone/ground textures
function makeNoise(seed: number) {
  const rnd = mulberry32(seed), P = 256, T = new Float32Array(P * P);
  for (let i = 0; i < T.length; i++) T[i] = rnd();
  const sm = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number, per?: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, w = per || P;
    const a = ((xi % w) + w) % w, b = (a + 1) % w, c = ((yi % P) + P) % P, d = (c + 1) % P;
    const u = sm(xf), v = sm(yf);
    return (T[c * P + a] * (1 - u) + T[c * P + b] * u) * (1 - v) + (T[d * P + a] * (1 - u) + T[d * P + b] * u) * v;
  };
}
function smoothNormals(geo: THREE.BufferGeometry) {
  const pa = geo.attributes.position, n = pa.count, key = new Map<string, number>(), acc: THREE.Vector3[] = [], idx = new Int32Array(n);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const k = Math.round(pa.getX(i) * 1e4) + ',' + Math.round(pa.getY(i) * 1e4) + ',' + Math.round(pa.getZ(i) * 1e4);
    let j = key.get(k); if (j === undefined) { j = acc.length; key.set(k, j); acc.push(new THREE.Vector3()); } idx[i] = j;
  }
  for (let i = 0; i < n; i += 3) {
    a.fromBufferAttribute(pa, i); b.fromBufferAttribute(pa, i + 1); c.fromBufferAttribute(pa, i + 2);
    e1.subVectors(b, a); e2.subVectors(c, a); e1.cross(e2);
    acc[idx[i]].add(e1); acc[idx[i + 1]].add(e1); acc[idx[i + 2]].add(e1);
  }
  const na = geo.attributes.normal;
  for (let i = 0; i < n; i++) { const v = acc[idx[i]].clone().normalize(); na.setXYZ(i, v.x, v.y, v.z); }
  na.needsUpdate = true;
}

// Drum geometry shared by the truck and the stone layout (truck-local coords, +x = forward)
const DRUM_F = [2.25, 2.2], DRUM_R = [-4.35, 3.45];
const DRUM_PROFILE: [number, number][] = [[0.04, 0], [0.5, 0.04], [0.95, 0.32], [1.2, 0.85], [1.3, 1.6], [1.32, 2.5], [1.26, 3.4], [1.06, 4.5], [0.78, 5.55], [0.55, 6.3], [0.47, 6.7]];
const TRUCK_Z = -6.4;

// small studio environment so metal reads as metal
function makeEnv(renderer: THREE.WebGLRenderer) {
  const pm = new THREE.PMREMGenerator(renderer), es = new THREE.Scene();
  es.background = new THREE.Color(0x2b2925);
  const lm = new THREE.MeshBasicMaterial({ color: 0xfff4e4, side: THREE.DoubleSide });
  [[0, 9, 0, Math.PI / 2, 0, 14, 6], [-10, 4, 6, 0, Math.PI / 2.4, 8, 4], [10, 3, -6, 0, -Math.PI / 2.2, 6, 3]].forEach(([x, y, z, rx, ry, w, h]) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), lm); p.position.set(x, y, z); p.rotation.set(rx, ry, 0); es.add(p);
  });
  const env = pm.fromScene(es, 0.04).texture; pm.dispose();
  return env;
}

// laboratory sieve stack (granulometric analysis): 3 test sieves + bottom pan, shown exploded
const SIEVE_Y = [4.9, 3.55, 2.2, 0.85], SIEVE_R = 2.3;
function buildSieves(lite: boolean, env: THREE.Texture) {
  const g = new THREE.Group(), mats: THREE.MeshStandardMaterial[] = [];
  const steel = new THREE.MeshStandardMaterial({ color: 0xd4d3cf, roughness: 0.26, metalness: 0.92, envMap: env, envMapIntensity: 1.1, transparent: true, side: THREE.DoubleSide });
  const base = new THREE.MeshStandardMaterial({ color: 0x252523, roughness: 0.55, metalness: 0.5, envMap: env, envMapIntensity: 0.6, transparent: true });
  mats.push(steel, base);
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, y: number) => { const o = new THREE.Mesh(geo, m); o.position.y = y; o.castShadow = !lite; o.receiveShadow = !lite; g.add(o); return o; };
  const RO = SIEVE_R + 0.15, frame = new THREE.CylinderGeometry(RO, RO, 0.44, 72, 1, true);
  const rimG = new THREE.TorusGeometry(RO, 0.035, 8, 72); rimG.rotateX(Math.PI / 2);
  const meshG = new THREE.CircleGeometry(RO - 0.01, 72); meshG.rotateX(-Math.PI / 2);
  [10, 18, 30].forEach((cells, k) => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = ctx2d(c); x.strokeStyle = '#d8d6d0'; x.lineWidth = 6; x.strokeRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(cells * 2, cells * 2); t.anisotropy = 8;
    const mm = new THREE.MeshStandardMaterial({ map: t, alphaMap: t, transparent: true, alphaTest: 0.35, roughness: 0.35, metalness: 0.85, envMap: env, side: THREE.DoubleSide });
    mats.push(mm); add(meshG, mm, SIEVE_Y[k] - 0.02);
  });
  SIEVE_Y.forEach((y, k) => {
    add(frame, steel, y + 0.18); add(rimG, steel, y + 0.4); add(rimG, steel, y - 0.04);
    if (k === 3) add(meshG, steel, y - 0.03);
  });
  add(new THREE.CylinderGeometry(RO + 0.35, RO + 0.45, 0.4, 72), base, 0.2);
  [-1, 1].forEach((s) => { const r = add(new THREE.CylinderGeometry(0.05, 0.05, 5.6, 12), steel, 3.0); r.position.x = s * (RO + 0.3); });
  add(new THREE.BoxGeometry(2 * RO + 0.75, 0.1, 0.24), steel, 5.75);
  return {
    group: g,
    mats,
    dispose() {
      mats.forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
      g.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    },
  };
}

function buildTruck(lite: boolean, env: THREE.Texture) {
  const g = new THREE.Group(), mats: THREE.Material[] = [], texs: THREE.Texture[] = [];
  const std = (o: THREE.MeshStandardMaterialParameters) => { const m = new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 0.85, ...o }); mats.push(m); return m; };
  const phys = (o: THREE.MeshPhysicalMaterialParameters) => { const m = new THREE.MeshPhysicalMaterial({ envMap: env, envMapIntensity: 1, ...o }); mats.push(m); return m; };
  const tex = (w: number, h: number, draw: (c: CanvasRenderingContext2D, w: number, h: number) => void, srgb = true) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h; draw(ctx2d(c), w, h);
    const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; texs.push(t); return t;
  };
  const paint = phys({ color: 0xf1efe9, roughness: 0.3, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08 });
  const frameM = std({ color: 0x1d1d1c, roughness: 0.55, metalness: 0.45 });
  const plastic = std({ color: 0x151514, roughness: 0.82, metalness: 0 });
  const alu = std({ color: 0xcfcfcb, roughness: 0.22, metalness: 1 });
  const chrome = std({ color: 0xf0f0f0, roughness: 0.06, metalness: 1, envMapIntensity: 1.4 });
  const rimM = phys({ color: 0xdcdad3, roughness: 0.32, metalness: 0.35, clearcoat: 0.7, clearcoatRoughness: 0.2 });
  const glass = phys({ color: 0x1b252c, roughness: 0.03, metalness: 0.35, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.8 });
  const lens = phys({ color: 0xf2f0ea, roughness: 0.05, emissive: 0xfff0d2, emissiveIntensity: 0.45, clearcoat: 1 });
  const amberL = std({ color: 0xff9a2e, roughness: 0.2, emissive: 0xff8a1a, emissiveIntensity: 0.7 });
  const redL = std({ color: 0xa3160f, roughness: 0.2, emissive: 0x7a0a06, emissiveIntensity: 0.55 });
  const hoseM = std({ color: 0x111111, roughness: 0.6, metalness: 0.1 });
  const steelP = std({ color: 0x3b3c3b, roughness: 0.45, metalness: 0.65, side: THREE.DoubleSide });
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, p?: THREE.Object3D) => {
    const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = !lite; o.receiveShadow = !lite; (p || g).add(o); return o;
  };
  const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
  const cyl = (rt: number, rb: number, h: number, seg = 24, open = false, ts = 0, tl = Math.PI * 2) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open, ts, tl);
  const rbox = (w: number, h: number, d: number, cr: number, b: number) => {
    const s = new THREE.Shape(), hw = w / 2 - b, hh = h / 2 - b, r = Math.min(cr, hw, hh);
    s.moveTo(-hw + r, -hh); s.lineTo(hw - r, -hh); s.quadraticCurveTo(hw, -hh, hw, -hh + r); s.lineTo(hw, hh - r); s.quadraticCurveTo(hw, hh, hw - r, hh);
    s.lineTo(-hw + r, hh); s.quadraticCurveTo(-hw, hh, -hw, hh - r); s.lineTo(-hw, -hh + r); s.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
    const geo = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.001, d - 2 * b), bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 3, curveSegments: 5 });
    geo.translate(0, 0, -(d - 2 * b) / 2); return geo;
  };
  const tube = (pts: V3[], r: number, m: THREE.Material) => add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), 40, r, 8, false), m, 0, 0, 0);

  // ---------- cab (side profile extruded across the width) ----------
  const CAB_X = 3.0, CW = 2.46, BT = 0.14, BS = 0.08;
  const cab = new THREE.Group(); cab.position.x = CAB_X; g.add(cab);
  const prof: [number, number][] = [[0.08, 1.33], [2.2, 1.33], [2.26, 2.56], [2.24, 2.72], [2.01, 3.82], [1.84, 3.95], [0.08, 3.95]];
  const sh = new THREE.Shape(); prof.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y))); sh.closePath();
  const cabG = new THREE.ExtrudeGeometry(sh, { depth: CW - 2 * BT, bevelEnabled: true, bevelThickness: BT, bevelSize: BS, bevelSegments: 6, curveSegments: 4 });
  cabG.translate(0, 0, -(CW - 2 * BT) / 2);
  add(cabG, paint, 0, 0, 0, cab);
  // side graphics: door seams, handle, window gasket, amber band, lettering
  const WIN: [number, number][] = [[1.02, 2.8], [2.1, 2.8], [2.13, 2.9], [1.93, 3.76], [1.02, 3.76]];
  const sideTex = (mirror: boolean) => tex(1200, 1375, (c) => {
    const S = 500, X = (x: number) => x * S, Y = (y: number) => (4.0 - y) * S;
    const poly = (pts: [number, number][]) => { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(X(x), Y(y)) : c.moveTo(X(x), Y(y)))); c.closePath(); };
    c.lineJoin = 'round';
    c.strokeStyle = 'rgba(18,18,16,.6)'; c.lineWidth = 4; poly([[0.95, 1.42], [2.14, 1.42], [2.17, 2.62], [1.95, 3.86], [0.95, 3.86]]); c.stroke();
    c.strokeStyle = '#141413'; c.lineWidth = 0.07 * S; poly(WIN); c.stroke();
    c.fillStyle = '#E3A83F'; c.fillRect(X(0.08), Y(1.66), (2.14 - 0.08) * S, 0.075 * S);
    c.fillStyle = '#1a1a18'; c.beginPath(); c.roundRect(X(1.05), Y(2.66), 0.26 * S, 0.06 * S, 12); c.fill();
    c.fillStyle = 'rgba(18,18,16,.5)'; c.fillRect(X(0.2), Y(3.7), 0.5 * S, 3); c.fillRect(X(0.2), Y(3.6), 0.5 * S, 3); c.fillRect(X(0.2), Y(3.5), 0.5 * S, 3);
    const tx = X(1.56), ty = Y(2.18);
    c.save(); c.translate(tx, ty); if (mirror) c.scale(-1, 1);
    c.fillStyle = '#0E0E0C'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = '800 92px Archivo, "Arial Narrow", sans-serif'; c.fillText('UNITRGOVINA', 0, 0);
    c.font = '500 26px "Geist Mono", ui-monospace, monospace'; c.fillText('BETON · ŠLJUNAK · 063 667 570', 0, 70);
    c.restore();
  });
  [1, -1].forEach((sd) => {
    const t = sideTex(sd < 0); t.repeat.set(1 / 2.4, 1 / 2.75); t.offset.set(0, -1.25 / 2.75);
    const m = std({ map: t, transparent: true, roughness: 0.35, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const d = add(new THREE.ShapeGeometry(sh), m, 0, 0, sd * (CW / 2 + 0.002), cab); d.castShadow = false;
    const ws = new THREE.Shape(); WIN.forEach(([x, y], i) => (i ? ws.lineTo(x, y) : ws.moveTo(x, y))); ws.closePath();
    add(new THREE.ShapeGeometry(ws), glass, 0, 0, sd * (CW / 2 + 0.006), cab).castShadow = false;
  });
  // windshield on the slanted face
  { const A = [2.24, 2.72], B = [2.01, 3.82], dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy), nx = dy / L, ny = -dx / L, ang = Math.atan2(ny, nx);
    const mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2;
    const fr = new THREE.PlaneGeometry(CW - 0.12, L + 0.06); fr.rotateY(Math.PI / 2); fr.rotateZ(ang);
    add(fr, plastic, mx + nx * (BS + 0.004), my + ny * (BS + 0.004), 0, cab);
    const gl = new THREE.PlaneGeometry(CW - 0.3, L - 0.1); gl.rotateY(Math.PI / 2); gl.rotateZ(ang);
    add(gl, glass, mx + nx * (BS + 0.01), my + ny * (BS + 0.01), 0, cab).castShadow = false;
    [-0.45, 0.5].forEach((z) => { const w = add(box(0.03, 0.03, 0.95), plastic, A[0] + nx * 0.13 - 0.02, A[1] + 0.12, z, cab); w.rotation.x = z < 0 ? 0.35 : 0.3; });
  }
  // front: grille, bumper, lights, plate
  const grille = add(box(0.06, 0.66, 1.78), plastic, 2.3, 2.2, 0, cab); grille.rotation.z = -0.049;
  for (let i = 0; i < 6; i++) { const sl = add(box(0.03, 0.035, 1.66), frameM, 2.345, 1.95 + i * 0.1, 0, cab); sl.rotation.z = -0.049; }
  add(rbox(0.26, 0.14, 0.07, 0.03, 0.015), std({ color: 0xe3a83f, roughness: 0.35, metalness: 0.3 }), 2.37, 2.62, 0, cab).rotation.y = Math.PI / 2;
  add(rbox(0.46, 0.52, 2.52, 0.08, 0.04), frameM, 2.27, 1.17, 0, cab);
  [-1, 1].forEach((sd) => {
    add(rbox(0.1, 0.24, 0.56, 0.05, 0.02), plastic, 2.48, 1.29, sd * 0.84, cab);
    add(rbox(0.04, 0.16, 0.36, 0.04, 0.012), lens, 2.53, 1.3, sd * 0.78, cab);
    add(box(0.03, 0.035, 0.36), lens, 2.535, 1.19, sd * 0.78, cab);
    add(rbox(0.04, 0.12, 0.12, 0.03, 0.012), amberL, 2.53, 1.3, sd * 1.06, cab);
    const fog = add(cyl(0.06, 0.06, 0.04, 20), lens, 2.52, 1.02, sd * 0.95, cab); fog.rotation.z = Math.PI / 2;
  });
  { const pt = tex(256, 56, (c, w, h) => { c.fillStyle = '#f4f4f0'; c.fillRect(0, 0, w, h); c.fillStyle = '#1d4fa0'; c.fillRect(0, 0, 26, h); c.fillStyle = '#111'; c.font = '700 34px "Arial Narrow", Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('PA 001-UN', 140, 30); c.strokeStyle = '#111'; c.lineWidth = 3; c.strokeRect(1.5, 1.5, w - 3, h - 3); });
    const pg = new THREE.PlaneGeometry(0.52, 0.114); pg.rotateY(Math.PI / 2); add(pg, std({ map: pt, roughness: 0.4 }), 2.505, 1.03, 0, cab); }
  add(rbox(0.56, 0.08, 2.36, 0.03, 0.02), plastic, 1.97, 3.99, 0, cab).rotation.z = -0.12;
  [-0.7, -0.35, 0, 0.35, 0.7].forEach((z) => add(box(0.06, 0.05, 0.12), amberL, 2.22, 4.02, z, cab));
  [-1, 1].forEach((sd) => { add(cyl(0.07, 0.08, 0.14, 16), amberL, 0.9, 4.03, sd * 0.85, cab); });
  // mirrors, steps, arches
  [-1, 1].forEach((sd) => {
    const arm = add(cyl(0.022, 0.022, 0.42, 10), frameM, 2.08, 3.35, sd * 1.4, cab); arm.rotation.x = Math.PI / 2;
    const arm2 = add(cyl(0.022, 0.022, 0.42, 10), frameM, 2.08, 2.72, sd * 1.4, cab); arm2.rotation.x = Math.PI / 2;
    add(rbox(0.1, 0.5, 0.25, 0.05, 0.02), plastic, 2.1, 3.12, sd * 1.6, cab);
    add(rbox(0.1, 0.22, 0.25, 0.05, 0.02), plastic, 2.1, 2.72, sd * 1.6, cab);
    add(rbox(0.72, 0.56, 0.26, 0.05, 0.03), plastic, 1.5, 1.07, sd * 1.12, cab);
    [0.88, 1.18].forEach((y) => add(box(0.6, 0.03, 0.22), alu, 1.5, y, sd * 1.15, cab));
  });
  add(rbox(0.1, 0.18, 0.22, 0.04, 0.02), plastic, 2.28, 3.86, -0.95, cab);

  // ---------- wheels ----------
  const tread = tex(512, 128, (c, w, h) => {
    c.fillStyle = '#fff'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#000';
    for (let i = 0; i < 64; i++) { const x = (i / 64) * w; c.fillRect(x, h * 0.36, 3, h * 0.12); c.fillRect(x + 4, h * 0.52, 3, h * 0.12); }
    c.fillRect(0, h * 0.49, w, 3); c.fillRect(0, h * 0.35, w, 2); c.fillRect(0, h * 0.64, w, 2);
  }, false);
  const rubber = std({ color: 0x141413, roughness: 0.92, metalness: 0, bumpMap: tread, bumpScale: 4, envMapIntensity: 0.4 });
  const tireG = new THREE.LatheGeometry([[0.355, -0.19], [0.44, -0.2], [0.51, -0.19], [0.548, -0.165], [0.562, -0.12], [0.565, 0], [0.562, 0.12], [0.548, 0.165], [0.51, 0.19], [0.44, 0.2], [0.355, 0.19]].map(([r, y]) => new THREE.Vector2(r, y)), 72);
  tireG.rotateX(Math.PI / 2);
  const barrel = cyl(0.36, 0.36, 0.36, 40, true); barrel.rotateX(Math.PI / 2);
  const disc = cyl(0.345, 0.345, 0.02, 48); disc.rotateX(Math.PI / 2);
  const boss = cyl(0.13, 0.15, 0.1, 28); boss.rotateX(Math.PI / 2);
  const nut = cyl(0.022, 0.022, 0.05, 6); nut.rotateX(Math.PI / 2);
  const hole = new THREE.CircleGeometry(0.048, 18);
  const capG = cyl(0.05, 0.11, 0.12, 24); capG.rotateX(Math.PI / 2);
  const wheels: THREE.Group[] = [];
  const wheel = (x: number, sd: number, dual: boolean) => {
    const w = new THREE.Group(); w.position.set(x, 0.565, sd * (dual ? 0.86 : 1.02)); g.add(w); wheels.push(w);
    (dual ? [-0.205, 0.205] : [0]).forEach((o) => { add(tireG, rubber, 0, 0, o, w); add(barrel, rimM, 0, 0, o, w); });
    const fz = sd * (dual ? 0.205 : 0) + sd * 0.06;
    add(disc, rimM, 0, 0, fz, w);
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2 + 0.2, hm = add(hole, plastic, Math.cos(a) * 0.245, Math.sin(a) * 0.245, fz + sd * 0.012, w); hm.rotation.y = sd < 0 ? Math.PI : 0; hm.castShadow = false; }
    add(boss, frameM, 0, 0, fz + sd * 0.05, w);
    for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; add(nut, chrome, Math.cos(a) * 0.1, Math.sin(a) * 0.1, fz + sd * 0.11, w); }
    if (!dual) add(capG, chrome, 0, 0, fz + sd * 0.13, w).rotation.x = sd < 0 ? Math.PI : 0;
  };
  const AX = [4.55, 3.15, -2.35, -3.72];
  AX.forEach((x, i) => { wheel(x, 1, i > 1); wheel(x, -1, i > 1); });
  // arches
  AX.forEach((x, i) => [-1, 1].forEach((sd) => {
    const ar = cyl(0.69, 0.69, i > 1 ? 0.9 : 0.5, 36, true, Math.PI / 2 - 0.35, Math.PI + 0.7); ar.rotateX(Math.PI / 2);
    add(ar, std({ color: 0x161615, roughness: 0.8, side: THREE.DoubleSide }), x, 0.6, sd * (i > 1 ? 0.86 : 1.02));
  }));
  [-1, 1].forEach((sd) => {
    add(box(0.03, 0.5, 0.84), plastic, -4.45, 0.52, sd * 0.86);
    add(box(0.03, 0.42, 0.5), plastic, 2.5, 0.55, sd * 1.02);
    add(box(1.38, 0.05, 0.9), plastic, -3.04, 1.29, sd * 0.86);
  });

  // ---------- chassis & equipment ----------
  [-0.48, 0.48].forEach((z) => add(box(10.2, 0.3, 0.14), frameM, -0.1, 0.92, z));
  [-4.9, -3.0, -1.0, 1.0, 2.6, 4.4].forEach((x) => add(box(0.12, 0.2, 0.96), frameM, x, 0.92, 0));
  add(box(7.0, 0.14, 1.34), frameM, -1.45, 1.13, 0);
  [-1, 1].forEach((sd) => [0.56, 0.86].forEach((y) => add(box(4.1, 0.06, 0.05), alu, 0.4, y, sd * 1.26)));
  [-1.55, 0.4, 2.35].forEach((x) => [-1, 1].forEach((sd) => add(box(0.05, 0.4, 0.3), frameM, x, 0.72, sd * 1.12)));
  add(rbox(1.3, 0.62, 0.6, 0.14, 0.05), alu, 1.15, 0.95, 0.88);
  [0.72, 1.58].forEach((x) => add(box(0.05, 0.66, 0.64), frameM, x, 0.95, 0.88));
  [[0.85, 1.05], [0.85, 0.72]].forEach(([x, y]) => { const t = add(cyl(0.14, 0.14, 1.05, 20), alu, x, y, -0.92); t.rotation.z = Math.PI / 2; });
  add(rbox(0.8, 0.5, 0.5, 0.06, 0.03), plastic, -0.75, 0.92, -0.92);
  // exhaust stack behind the cab
  add(cyl(0.075, 0.075, 3.0, 18), chrome, 2.88, 2.85, -1.02);
  add(cyl(0.11, 0.11, 1.1, 18, true), alu, 2.88, 2.6, -1.02);
  { const tp = add(cyl(0.075, 0.075, 0.3, 18), chrome, 2.8, 4.38, -1.02); tp.rotation.z = 0.9; }
  // water tank
  { const wt = add(cyl(0.38, 0.38, 1.95, 32), alu, 2.62, 1.92, 0); wt.rotation.x = Math.PI / 2; }
  [-0.55, 0.55].forEach((z) => { const bnd = add(cyl(0.39, 0.39, 0.05, 32), frameM, 2.62, 1.92, z); bnd.rotation.x = Math.PI / 2; });
  // rear bumper, lights, warning plate
  add(box(0.16, 0.18, 2.36), frameM, -5.12, 0.6, 0);
  [-1, 1].forEach((sd) => {
    add(box(0.1, 0.5, 0.12), frameM, -5.1, 0.82, sd * 0.48);
    add(rbox(0.07, 0.2, 0.52, 0.04, 0.015), plastic, -5.17, 0.96, sd * 0.86);
    add(box(0.03, 0.14, 0.16), redL, -5.21, 0.96, sd * 0.96);
    add(box(0.03, 0.14, 0.1), amberL, -5.21, 0.96, sd * 0.8);
    add(box(0.03, 0.14, 0.1), lens, -5.21, 0.96, sd * 0.68);
  });
  { const st = tex(512, 64, (c, w, h) => { c.fillStyle = '#f2f2ee'; c.fillRect(0, 0, w, h); c.fillStyle = '#c4201a'; for (let x = -h; x < w + h; x += 56) { c.beginPath(); c.moveTo(x, h); c.lineTo(x + 28, h); c.lineTo(x + 28 + h, 0); c.lineTo(x + h, 0); c.closePath(); c.fill(); } });
    const pg = new THREE.PlaneGeometry(2.0, 0.22); pg.rotateY(-Math.PI / 2); add(pg, std({ map: st, roughness: 0.3 }), -5.205, 0.6, 0); }

  // ---------- drum ----------
  const dxF = DRUM_R[0] - DRUM_F[0], dyF = DRUM_R[1] - DRUM_F[1], len = Math.hypot(dxF, dyF), ux = dxF / len, uy = dyF / len;
  const at = (p: number) => [DRUM_F[0] + ux * (p / 6.7) * len, DRUM_F[1] + uy * (p / 6.7) * len];
  const rOf = (p: number) => { for (let i = 1; i < DRUM_PROFILE.length; i++) { const [r1, y1] = DRUM_PROFILE[i], [r0, y0] = DRUM_PROFILE[i - 1]; if (p <= y1) return r0 + ((p - y0) / (y1 - y0)) * (r1 - r0); } return 0.47; };
  const pts = DRUM_PROFILE.map(([r, y]) => new THREE.Vector2(r, (y / 6.7) * len));
  const drumTex = tex(1024, 1024, (c, W, H) => {
    const img = c.createImageData(W, H), d = img.data;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const u = x / W, v = y / H, ph = (u * 2 + v * 2.6) % 1;
      const stripe = ph < 0.15, edge = Math.abs(ph - 0.15) < 0.004 || ph < 0.004;
      const n = 0.96 + 0.04 * Math.sin(x * 0.7 + y * 0.31) * Math.sin(y * 0.19 + x * 0.05);
      let col = edge ? [90, 76, 52] : stripe ? [238, 235, 228] : [227, 168, 63];
      const seam = Math.abs(v - 0.33) < 0.0025 || Math.abs(v - 0.62) < 0.0025;
      if (seam) col = col.map((k) => k * 0.72);
      const o = (y * W + x) * 4; d[o] = col[0] * n; d[o + 1] = col[1] * n; d[o + 2] = col[2] * n; d[o + 3] = 255;
    }
    c.putImageData(img, 0, 0);
    // concrete splash around the rear opening
    let sd = 7; const r = () => { sd = (sd * 16807) % 2147483647; return (sd - 1) / 2147483646; };
    for (let i = 0; i < 900; i++) { const yy = H * (0.86 + Math.pow(r(), 1.6) * 0.14); c.fillStyle = 'rgba(' + (128 + r() * 30) + ',' + (126 + r() * 28) + ',' + (120 + r() * 24) + ',' + (0.35 + r() * 0.5) + ')'; c.beginPath(); c.ellipse(r() * W, H - (H - yy), 2 + r() * 9, 2 + r() * 6, r() * 3, 0, 6.3); c.fill(); }
    for (let i = 0; i < 40; i++) { const x = r() * W, l = 30 + r() * 110; c.fillStyle = 'rgba(132,130,124,.55)'; c.fillRect(x, H * 0.86 - l * 0.2, 3 + r() * 4, l * 0.4); }
  });
  drumTex.flipY = false;
  const drumMat = phys({ map: drumTex, roughness: 0.34, metalness: 0.15, clearcoat: 0.8, clearcoatRoughness: 0.18, side: THREE.DoubleSide });
  const pivot = new THREE.Group(); pivot.position.set(DRUM_F[0], DRUM_F[1], 0);
  pivot.rotation.z = Math.atan2(-dxF, dyF);
  g.add(pivot);
  const spin = new THREE.Group(); pivot.add(spin);
  add(new THREE.LatheGeometry(pts, 112), drumMat, 0, 0, 0, spin);
  const ringAt = (p: number, tubeR: number, m: THREE.Material) => { const rr = rOf(p) + tubeR * 0.4, tg = new THREE.TorusGeometry(rr, tubeR, 10, 96); tg.rotateX(Math.PI / 2); return add(tg, m, 0, (p / 6.7) * len, 0, spin); };
  ringAt(5.85, 0.07, frameM);
  ringAt(6.66, 0.05, steelP);
  const inner = new THREE.CircleGeometry(0.44, 40); inner.rotateX(-Math.PI / 2);
  add(inner, std({ color: 0x5e5c57, roughness: 0.95 }), 0, len - 0.12, 0, spin);
  for (let k = 0; k < 2; k++) { const bl = add(box(0.06, 0.5, 0.7), std({ color: 0x6d6a64, roughness: 0.9 }), 0, len - 0.35, 0, spin); bl.rotation.y = k * Math.PI / 2 + 0.4; bl.rotation.z = 0.5; }
  // gearbox + motor at the front
  add(cyl(0.3, 0.34, 0.42, 32), frameM, 0, -0.2, 0, pivot);
  add(cyl(0.16, 0.16, 0.36, 24), steelP, 0.32, -0.25, 0.18, pivot);
  // front pedestal (A-frame)
  [-1, 1].forEach((sd) => { const l = add(box(0.18, 1.15, 0.16), frameM, 2.05, 1.66, sd * 0.4); l.rotation.x = sd * 0.42; });
  add(box(0.3, 0.2, 1.3), frameM, 2.05, 1.25, 0);
  // rear support with rollers under the roller track
  { const [tx, ty] = at(5.85), rr = rOf(5.85) + 0.1;
    [-1, 1].forEach((sd) => {
      const ro = add(cyl(0.15, 0.15, 0.16, 24), steelP, tx, ty - Math.sqrt(Math.max(0.01, (rr + 0.15) ** 2 - 0.5 ** 2)), sd * 0.5); ro.rotation.x = Math.PI / 2;
      const leg = add(box(0.2, ty - 1.2 - 0.6, 0.2), frameM, tx, 1.2 + (ty - 1.2 - 0.6) / 2, sd * 0.62); leg.rotation.x = -sd * 0.12;
    });
    add(box(0.26, 0.22, 1.5), frameM, tx, ty - 0.95, 0);
  }
  // hydraulic hoses + water line
  tube([[2.2, 2.0, 0.22], [2.0, 1.6, 0.42], [1.5, 1.3, 0.55], [0.2, 1.25, 0.55]], 0.03, hoseM);
  tube([[2.25, 2.05, -0.2], [2.05, 1.6, -0.45], [1.5, 1.32, -0.58], [0.2, 1.28, -0.58]], 0.03, hoseM);
  tube([[2.62, 1.6, -0.5], [0.6, 1.3, -0.66], [-4.6, 1.32, -0.66], [-4.85, 2.6, -0.45], [-4.85, 3.7, -0.3]], 0.028, frameM);

  // ---------- rear: hopper, chutes, ladder, platform ----------
  const [ox, oy] = at(6.7);
  const hop = add(cyl(0.9, 0.34, 0.85, 40, true), steelP, ox - 0.55, oy + 0.62, 0); hop.rotation.z = 0.18;
  { const hr = new THREE.TorusGeometry(0.9, 0.03, 8, 48); hr.rotateX(Math.PI / 2); const t = add(hr, steelP, ox - 0.62, oy + 1.04, 0); t.rotation.z = 0.18; }
  { const c1 = add(cyl(0.3, 0.3, 1.25, 24, true, Math.PI, Math.PI), steelP, ox - 0.85, oy - 0.78, 0); c1.rotation.z = Math.atan2(0.8, -0.6); }
  { const c2 = add(cyl(0.29, 0.29, 1.3, 24, true, Math.PI, Math.PI), steelP, -3.85, 2.12, 1.05); c2.rotation.z = Math.PI / 2; }
  { const c3 = add(cyl(0.29, 0.29, 1.3, 24, true, Math.PI, Math.PI), steelP, -2.5, 2.12, 1.05); c3.rotation.z = Math.PI / 2; }
  [-4.4, -3.3, -1.95].forEach((x) => add(box(0.05, 0.5, 0.05), frameM, x, 1.95, 1.1));
  [-0.27, 0.27].forEach((z) => add(box(0.06, 2.75, 0.06), alu, -5.02, 2.5, z + 0.95));
  for (let i = 0; i < 7; i++) add(box(0.05, 0.05, 0.54), alu, -5.02, 1.4 + i * 0.36, 0.95);
  add(box(0.8, 0.05, 1.15), alu, -4.75, 3.86, 0.62);
  [[-4.38, 1.18], [-5.12, 1.18], [-4.38, 0.08], [-5.12, 0.08]].forEach(([x, z]) => add(box(0.04, 0.6, 0.04), alu, x, 4.16, z));
  [1.18, 0.08].forEach((z) => add(box(0.78, 0.04, 0.04), alu, -4.75, 4.46, z));
  add(box(0.04, 0.04, 1.1), alu, -5.12, 4.46, 0.63);
  [-0.6, 0.6].forEach((z) => add(rbox(0.06, 0.12, 0.2, 0.03, 0.01), lens, -5.18, 3.95, z));

  return {
    group: g,
    wheels,
    drum: spin,
    dispose() {
      texs.forEach((t) => t.dispose());
      mats.forEach((m) => m.dispose());
      g.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    },
  };
}

export async function createStrata(canvas: HTMLCanvasElement, overlay: HTMLElement | null, opts: StrataOptions = {}): Promise<Strata> {
  const TV = /SmartTV|SMART-TV|Tizen|Web0S|webOS|NetCast|HbbTV|BRAVIA|AFT[A-Z]|CrKey|GoogleTV|Android ?TV|VIDAA|Roku|Viera|Philips|Hisense/i.test(navigator.userAgent);
  const lite = opts.quality === 'lite' || TV;
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const N = 1331;
  const rnd = mulberry32(1990);
  const gauss = () => { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const range = (n: number) => Array.from({ length: n }, (_, i) => i);
  const shuffle = <T>(a: T[]) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; };

  // fixed pixel budget: a 4K TV / 32" monitor renders the same pixel count as a laptop
  const DEV = window.devicePixelRatio || 1, BUDGET = lite ? 1.1e6 : 2.3e6;
  const big = (canvas.clientWidth || innerWidth) * (canvas.clientHeight || innerHeight) * DEV * DEV > 3.2e6;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !lite && !big, powerPreference: 'high-performance', preserveDrawingBuffer: false, stencil: false });
  const DPR_MAX = Math.min(DEV, lite ? 1 : 1.5), DPR_MIN = 0.5;
  let dpr = DPR_MAX, slow = 0, fast = 0, cool = 2, shadowsLive = !lite, sf = 0;
  const effDpr = () => Math.max(0.35, Math.min(dpr, Math.sqrt(BUDGET / Math.max(1, (canvas.clientWidth || 1) * (canvas.clientHeight || 1)))));
  renderer.setPixelRatio(effDpr());
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = !lite;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const INK = new THREE.Color('#0e0e0c');
  renderer.setClearColor(INK, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(INK, 20, 52);
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 200);

  scene.add(new THREE.HemisphereLight(0xfff3e0, 0x15130f, 0.8));
  const key = new THREE.DirectionalLight(0xffe2b4, 2.9);
  key.position.set(-9, 18, 11);
  key.castShadow = !lite;
  key.shadow.mapSize.set(1536, 1536);
  Object.assign(key.shadow.camera, { left: -17, right: 17, top: 17, bottom: -17, near: 1, far: 70 });
  key.shadow.camera.updateProjectionMatrix();
  key.shadow.bias = -0.0005; key.shadow.normalBias = 0.03;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x9db4cc, 1.5);
  rim.position.set(12, 7, -14);
  scene.add(rim);

  await yieldToMain();
  const groundTex = (() => {
    const N2 = 512, c = document.createElement('canvas'); c.width = c.height = N2;
    const x = ctx2d(c), img = x.createImageData(N2, N2), nz = makeNoise(77), r = mulberry32(5);
    for (let j = 0; j < N2; j++) for (let i = 0; i < N2; i++) {
      let f = 0, amp = 0.5, fr = 8;
      for (let o = 0; o < 5; o++) { f += nz((i / N2) * fr, (j / N2) * fr, fr) * amp; amp *= 0.5; fr *= 2; }
      let g = 150 + (f - 0.5) * 150; if (r() < 0.018) g += 60 * r(); if (r() < 0.012) g -= 70;
      const o = (j * N2 + i) * 4; img.data[o] = g; img.data[o + 1] = g * 0.96; img.data[o + 2] = g * 0.9; img.data[o + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(22, 22); t.anisotropy = 8; return t;
  })();
  const floor = new THREE.Mesh(new THREE.CircleGeometry(90, 96), new THREE.MeshStandardMaterial({ color: 0x2a2620, map: groundTex, bumpMap: groundTex, bumpScale: 2, roughness: 1, metalness: 0 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = !lite; scene.add(floor);

  await yieldToMain();
  // real-looking stones: rounded river pebbles, lumpy cobbles and angular crushed pieces
  const nz3 = makeNoise(31);
  const n3 = (x: number, y: number, z: number) => (nz3(x * 1.7 + 11.3, y * 1.7 + z * 0.73 + 5.1) + nz3(z * 1.7 + 3.7, x * 1.7 - y * 0.61 + 8.9)) - 1;
  const mkStone = (detail: number, amp: number, freq: number, angular: boolean, seed: number) => {
    const gg = new THREE.IcosahedronGeometry(1, detail), pa = gg.attributes.position, v = new THREE.Vector3(), cols = new Float32Array(pa.count * 3);
    const r = mulberry32(seed), cuts = angular ? Array.from({ length: 7 }, () => { const d = new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize(); return { d, k: 0.62 + r() * 0.22 }; }) : [];
    for (let i = 0; i < pa.count; i++) {
      v.fromBufferAttribute(pa, i).normalize();
      const rad = 1 + amp * n3(v.x * freq + seed, v.y * freq, v.z * freq) + amp * 0.35 * n3(v.x * freq * 2.7, v.y * freq * 2.7 + seed, v.z * freq * 2.7);
      v.multiplyScalar(rad);
      cuts.forEach(({ d, k }) => { const t = v.dot(d); if (t > k) v.addScaledVector(d, k - t); });
      pa.setXYZ(i, v.x, v.y, v.z);
      const m = 1.08 + 0.3 * (nz3(v.x * 3.1 + seed, v.y * 3.1 + v.z * 1.3) - 0.5) * 2 * 0.5 + 0.08 * Math.sin(v.y * 9 + v.x * 2.3);
      cols[i * 3] = m; cols[i * 3 + 1] = m * 0.995; cols[i * 3 + 2] = m * 0.985;
    }
    gg.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    if (angular) gg.computeVertexNormals(); else smoothNormals(gg);
    gg.computeBoundingSphere(); return gg;
  };
  const stoneTex = (() => {
    const W = 1024, H = 512, c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = ctx2d(c), img = x.createImageData(W, H), nz = makeNoise(9), r = mulberry32(17);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      let f = 0, amp = 0.5, fr = 6;
      for (let o = 0; o < 5; o++) { f += nz((i / W) * fr * 2, (j / H) * fr, fr * 2) * amp; amp *= 0.5; fr *= 2; }
      let g = 205 + (f - 0.5) * 120;
      const q = r(); if (q < 0.03) g = 245; else if (q < 0.05) g = 120 + r() * 40;
      const o = (j * W + i) * 4; img.data[o] = g; img.data[o + 1] = g; img.data[o + 2] = g * 0.98; img.data[o + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    x.globalAlpha = 0.35; x.strokeStyle = '#f4f1ea';
    for (let k = 0; k < 10; k++) { x.lineWidth = 1 + r() * 2.5; x.beginPath(); let px0 = r() * W, py0 = r() * H; x.moveTo(px0, py0); for (let s2 = 0; s2 < 6; s2++) { px0 += (r() - 0.3) * 160; py0 += (r() - 0.5) * 60; x.lineTo(px0, py0); } x.stroke(); }
    const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.anisotropy = 8; return t;
  })();
  await yieldToMain();
  const D0 = lite ? 2 : 4;
  const GEOS = [mkStone(D0, 0.09, 0.9, false, 1), mkStone(D0, 0.16, 1.4, false, 2), mkStone(lite ? 1 : 2, 0.07, 1.6, true, 3)];
  const STONE_MATS: THREE.MeshStandardMaterial[] = [];
  const MESHES = GEOS.map((_gg, k) => {
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, map: stoneTex, bumpMap: stoneTex, bumpScale: k === 2 ? 1.2 : 0.7, roughness: k === 2 ? 0.9 : 0.62, metalness: 0 });
    STONE_MATS.push(m); return m;
  });
  const VAR = new Uint8Array(N), SLOT = new Uint16Array(N), VCOUNT = [0, 0, 0];
  { const r = mulberry32(4242); for (let i = 0; i < N; i++) { const q = r(), v = q < 0.56 ? 0 : q < 0.86 ? 1 : 2; VAR[i] = v; SLOT[i] = VCOUNT[v]++; } }
  const IM = GEOS.map((gg, k) => {
    const im = new THREE.InstancedMesh(gg, MESHES[k], VCOUNT[k]);
    im.castShadow = !lite; im.receiveShadow = !lite; im.frustumCulled = false;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.setColorAt(0, new THREE.Color());
    scene.add(im); return im;
  });

  // per-stone data: four washed fractions
  const COUNTS = [612, 346, 226, 147], BASER = [0.12, 0.19, 0.27, 0.37];
  const F = new Uint8Array(N), R = new Float32Array(N), SQ = new Float32Array(N * 3), ROT = new Float32Array(N * 3), SPN = new Float32Array(N * 3), PH = new Float32Array(N);
  const D = new Float32Array(N), S0 = new Float32Array(N), U = new Float32Array(N), W = new Float32Array(N);
  { let i = 0; COUNTS.forEach((c, f) => { for (let k = 0; k < c; k++) F[i++] = f; }); }
  for (let i = 0; i < N; i++) {
    R[i] = BASER[F[i]] * (0.82 + rnd() * 0.36);
    const flat = F[i] === 3 ? 0.55 : F[i] === 0 ? 0.85 : 0.68;
    SQ[i * 3] = 1 + rnd() * 0.3; SQ[i * 3 + 1] = flat + rnd() * 0.26; SQ[i * 3 + 2] = 0.86 + rnd() * 0.3;
    for (let k = 0; k < 3; k++) { ROT[i * 3 + k] = rnd() * 6.283; SPN[i * 3 + k] = (rnd() - 0.5) * 0.9; }
    D[i] = rnd(); S0[i] = rnd(); U[i] = clamp(gauss(), -2.6, 2.6); W[i] = clamp(gauss(), -2.6, 2.6);
  }
  const hexes = (a: string[]) => a.map((h) => new THREE.Color(h));
  const PAL = hexes(['#cdbfa8', '#ab9c85', '#8e8273', '#dccfb9', '#776a5b', '#b89c75', '#9e9182', '#e6dcc8', '#625a50', '#c4a77c', '#a5856a']);
  const FPAL = [
    hexes(['#d6b77f', '#c9a467', '#e0c793', '#bf9a5e']),
    hexes(['#d9d2c3', '#c7bea9', '#e6e0d3', '#b9b09d']),
    hexes(['#b3a389', '#9d8d75', '#c2b398', '#8c7e6a', '#a8875f']),
    hexes(['#8a7c6b', '#6f6457', '#9b8c79', '#5c534a', '#7d6a55']),
  ];
  const NAT = new Float32Array(N * 3), FRC = new Float32Array(N * 3), CON = new Float32Array(N * 3), col = new THREE.Color(), grey = new THREE.Color('#9a978f');
  for (let i = 0; i < N; i++) {
    col.copy(PAL[Math.floor(rnd() * PAL.length)]).multiplyScalar(0.9 + rnd() * 0.2);
    NAT[i * 3] = col.r; NAT[i * 3 + 1] = col.g; NAT[i * 3 + 2] = col.b;
    const fp = FPAL[F[i]]; col.copy(fp[Math.floor(rnd() * fp.length)]).multiplyScalar(0.9 + rnd() * 0.18);
    FRC[i * 3] = col.r; FRC[i * 3 + 1] = col.g; FRC[i * 3 + 2] = col.b;
    col.copy(grey).multiplyScalar(0.86 + rnd() * 0.24);
    CON[i * 3] = col.r; CON[i * 3 + 1] = col.g; CON[i * 3 + 2] = col.b;
  }

  // layouts: 0 river ribbon · 1 screening decks · 2 stockpiles · 3 lab cube · 4 concrete cube · 5 inside mixer drum · 6 foundation
  const P = range(7).map(() => new Float32Array(N * 3));
  const S = range(7).map(() => new Float32Array(N).fill(1));
  const CW: V3[] = [[1, 0, 0], [0, 1, 0], [0, 1, 0], [0, 1, 0], [0, 0, 1], [0, 0, 1], [0, 0, 1]]; // natural · fraction · concrete
  const SPINW = [1, 0, 0, 0, 0, 0, 0];
  const LIFT = [1.3, 1.0, 1.4, 1.2, 2.2, 1.6];
  const WIN: [number, number][] = [[0, 1], [0, 1], [0, 1], [0, 1], [0.38, 1], [0, 0.8]];

  const DW = 11, DD = 5.8, TILT = 0.17, DECKY = [6.0, 4.5, 3.0, 1.5];
  for (let f = 0; f < 4; f++) {
    const ids = range(N).filter((i) => F[i] === f), c = ids.length;
    const nx = Math.ceil(Math.sqrt((c * DW) / DD)), nz = Math.ceil(c / nx), cells = shuffle(range(nx * nz)), k = 3 - f;
    ids.forEach((i, j) => {
      const cell = cells[j], cx = cell % nx, cz = Math.floor(cell / nx);
      const x = -DW / 2 + ((cx + 0.5 + (rnd() - 0.5) * 0.5) * DW) / nx;
      const z = -DD / 2 + ((cz + 0.5 + (rnd() - 0.5) * 0.5) * DD) / nz;
      P[1][i * 3] = x; P[1][i * 3 + 1] = DECKY[k] + x * TILT + R[i] * 0.45; P[1][i * 3 + 2] = z;
      S[1][i] = f === 3 ? 0.8 : f === 0 ? 0.62 : 0.92;
    });
  }

  // stockpiles, sized by real volume; the sand pile is filled with fine grains so it reads as sand
  const vol = [0, 0, 0, 0]; for (let i = 0; i < N; i++) vol[F[i]] += R[i] ** 3;
  const vmax = Math.max(...vol), PR = vol.map((x) => 1.65 * Math.cbrt(x / vmax));
  PR[0] = Math.max(PR[0], 1.7);
  const PG = 0.75, PW = PR.reduce((a, r) => a + 2 * r, 0) + PG * 3;
  let pcx = -PW / 2; const PC = PR.map((r) => { const x = pcx + r; pcx += 2 * r + PG; return x; });
  const PH_ = PR.map((r, f) => r * (f === 0 ? 0.62 : 0.78));
  for (let i = 0; i < N; i++) {
    const f = F[i], Rr = PR[f], H = PH_[f];
    let y: number, rr: number;
    if (f === 0) { rr = Rr * Math.sqrt(rnd()) * 0.96; y = H * (1 - rr / Rr) * 0.98; }
    else { y = H * (1 - Math.cbrt(1 - rnd())); rr = Rr * (1 - y / H) * Math.pow(rnd(), 0.35); }
    const a = rnd() * 6.283;
    P[2][i * 3] = PC[f] + Math.cos(a) * rr; P[2][i * 3 + 1] = y + R[i] * 0.4; P[2][i * 3 + 2] = Math.sin(a) * rr;
    S[2][i] = f === 0 ? 0.42 : 1;
  }
  const heaps = new THREE.Group(); heaps.visible = false; scene.add(heaps);
  const heapMats: THREE.MeshStandardMaterial[] = [];
  PR.forEach((Rr, f) => {
    const H = PH_[f], k = f === 0 ? 0.985 : 0.82, pts: THREE.Vector2[] = [];
    for (let s = 0; s <= 24; s++) { const t = s / 24, r = Rr * k * t; pts.push(new THREE.Vector2(r, H * k * (1 - Math.pow(t, 1.25)) * (1 - 0.04 * Math.sin(t * 9)))); }
    pts.push(new THREE.Vector2(Rr * k, 0));
    const c = FPAL[f][0].clone().multiplyScalar(f === 0 ? 0.92 : 0.62);
    const m = new THREE.MeshStandardMaterial({ color: c, roughness: 1, metalness: 0 }); heapMats.push(m);
    const hm = new THREE.Mesh(new THREE.LatheGeometry(pts.reverse(), 48), m);
    hm.position.set(PC[f], 0, 0); hm.receiveShadow = !lite; hm.castShadow = !lite; heaps.add(hm);
  });
  const NG = lite ? 1800 : 4200, grainGeo = new THREE.IcosahedronGeometry(1, 0);
  const grainMat = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0, color: 0xffffff });
  const grains = new THREE.InstancedMesh(grainGeo, grainMat, NG);
  grains.receiveShadow = !lite;
  { const d = new THREE.Object3D(), c = new THREE.Color(), Rr = PR[0], H = PH_[0];
    for (let i = 0; i < NG; i++) {
      const rr = Rr * Math.sqrt(rnd()) * 0.99, a = rnd() * 6.283, y = H * (1 - Math.pow(rr / Rr, 1.25)) * (1 - 0.04 * Math.sin((rr / Rr) * 9)) * 0.985;
      d.position.set(PC[0] + Math.cos(a) * rr, y + 0.01, Math.sin(a) * rr);
      d.rotation.set(rnd() * 6, rnd() * 6, rnd() * 6);
      const s = 0.028 + rnd() * 0.03; d.scale.set(s, s * 0.8, s);
      d.updateMatrix(); grains.setMatrixAt(i, d.matrix);
      c.copy(FPAL[0][Math.floor(rnd() * 4)]).multiplyScalar(0.82 + rnd() * 0.26); grains.setColorAt(i, c);
    } }
  heaps.add(grains);

  // lab: each fraction lies on the sieve that retains it (16 mm, 8 mm, 4 mm, pan)
  { const GA2 = Math.PI * (3 - Math.sqrt(5)), SC = [0.55, 0.52, 0.48, 0.42];
    for (let f = 0; f < 4; f++) {
      const ids = shuffle(range(N).filter((i) => F[i] === f)), c = ids.length, y0 = SIEVE_Y[3 - f];
      ids.forEach((i, j) => {
        const rr = Math.sqrt((j + 0.5) / c) * SIEVE_R * 0.94, th = j * GA2 + (rnd() - 0.5) * 0.08;
        P[3][i * 3] = Math.cos(th) * rr; P[3][i * 3 + 2] = Math.sin(th) * rr;
        P[3][i * 3 + 1] = y0 + R[i] * SC[f] * SQ[i * 3 + 1] * 0.95;
        S[3][i] = SC[f];
      });
    } }
  const CS = 0.4, CUBEY = 5 * CS + 0.26, cperm = shuffle(range(N));
  for (let i = 0; i < N; i++) {
    const c = cperm[i], ix = c % 11, iy = Math.floor(c / 11) % 11, iz = Math.floor(c / 121);
    P[4][i * 3] = (ix - 5) * CS + (rnd() - 0.5) * 0.05;
    P[4][i * 3 + 1] = (iy - 5) * CS + (rnd() - 0.5) * 0.05;
    P[4][i * 3 + 2] = (iz - 5) * CS + (rnd() - 0.5) * 0.05;
    S[4][i] = (0.265 + rnd() * 0.02) / R[i];
  }

  // inside the drum, near the rear opening (hidden by the shell)
  { const dx = DRUM_R[0] - DRUM_F[0], dy = DRUM_R[1] - DRUM_F[1], L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
    for (let i = 0; i < N; i++) {
      const t = 0.5 + rnd() * 0.42, rho = Math.sqrt(rnd()) * 0.5, a = rnd() * 6.283;
      P[5][i * 3] = DRUM_F[0] + ux * t * L + nx * rho * Math.cos(a);
      P[5][i * 3 + 1] = DRUM_F[1] + uy * t * L + ny * rho * Math.cos(a);
      P[5][i * 3 + 2] = TRUCK_Z + rho * Math.sin(a);
      S[5][i] = 0.13 / R[i];
    } }

  // foundation strips (house footprint), surplus stones become the gravel bed inside
  const FS = 0.36, segs = [[-6.5, -4.2, 6.5, -4.2], [-6.5, 4.2, 6.5, 4.2], [-6.5, -4.2, -6.5, 4.2], [6.5, -4.2, 6.5, 4.2], [-1.5, -4.2, -1.5, 4.2], [-1.5, 0.6, 6.5, 0.6]];
  let cells6: V3[] = [];
  segs.forEach(([x0, z0, x1, z1]) => {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.round(len / FS), dx = (x1 - x0) / len, dz = (z1 - z0) / len, nx = -dz, nz = dx;
    for (let a = 0; a <= n; a++) for (let b = -1; b <= 1; b++) for (let h = 0; h < 3; h++) {
      if (b === 0 && h === 1) continue;
      const t = a * FS; cells6.push([x0 + dx * t + nx * b * FS, 0.2 + h * FS, z0 + dz * t + nz * b * FS]);
    }
  });
  cells6 = shuffle(cells6).slice(0, N);
  while (cells6.length < N) cells6.push([-6 + rnd() * 12, 0.08, -3.8 + rnd() * 7.6]);
  shuffle(cells6);
  for (let i = 0; i < N; i++) {
    const c = cells6[i];
    P[6][i * 3] = c[0] + (rnd() - 0.5) * 0.05; P[6][i * 3 + 1] = c[1]; P[6][i * 3 + 2] = c[2] + (rnd() - 0.5) * 0.05;
    S[6][i] = (c[1] < 0.1 ? 0.15 : 0.23 + rnd() * 0.03) / R[i];
  }

  const CAM = ([
    { p: [0, 2.8, 15.5], t: [0, 1.2, 0] },
    { p: [9, 10.5, 21], t: [0, 3.4, 0] },
    { p: [1.5, 7, 17.5], t: [0, 0.8, 0] },
    { p: [6.8, 9.6, 10.8], t: [0, 2.7, 0] },
    { p: [7.2, 5, 10.6], t: [0, 2.2, 0] },
    { p: [10.6, 4.1, 7.4], t: [0.3, 2.0, TRUCK_Z] },
    { p: [10.5, 19, 19.5], t: [0, -0.4, -1] },
  ] as { p: V3; t: V3 }[]).map((c) => ({ p: new THREE.Vector3(...c.p), t: new THREE.Vector3(...c.t) }));

  await yieldToMain();
  const env = makeEnv(renderer);
  STONE_MATS.forEach((m) => { m.envMap = env; m.envMapIntensity = 0.45; m.needsUpdate = true; });
  const sieves = buildSieves(lite, env);
  sieves.group.visible = false; scene.add(sieves.group);
  await yieldToMain();
  // truck mixer
  const truck = buildTruck(lite, env);
  truck.group.position.set(-40, 0, TRUCK_Z); truck.group.visible = false; scene.add(truck.group);
  let truckX = -40, wheelA = 0;

  // guides: hairline drawings that appear with their step
  const guides: { k: number; obj: THREE.Line; mat: THREE.LineBasicMaterial; max: number }[] = [];
  const lineMat = (color: number) => new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false });
  DECKY.forEach((y) => {
    const g = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-DW / 2 - 0.3, y - (DW / 2 + 0.3) * TILT, -DD / 2 - 0.3), new THREE.Vector3(DW / 2 + 0.3, y + (DW / 2 + 0.3) * TILT, -DD / 2 - 0.3),
      new THREE.Vector3(DW / 2 + 0.3, y + (DW / 2 + 0.3) * TILT, DD / 2 + 0.3), new THREE.Vector3(-DW / 2 - 0.3, y - (DW / 2 + 0.3) * TILT, DD / 2 + 0.3),
    ]);
    const mat = lineMat(0xe3a83f), l = new THREE.LineLoop(g, mat); scene.add(l); guides.push({ k: 1, obj: l, mat, max: 0.6 });
  });
  const cubeMat = lineMat(0xe3a83f);
  const cubeEdges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(4.8, 4.8, 4.8)), cubeMat);
  cubeEdges.position.y = CUBEY; scene.add(cubeEdges); guides.push({ k: 4, obj: cubeEdges, mat: cubeMat, max: 0.7 });
  const formMat = lineMat(0xe3a83f);
  const form = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-7.4, 0.02, -5.1), new THREE.Vector3(7.4, 0.02, -5.1), new THREE.Vector3(7.4, 0.02, 5.1), new THREE.Vector3(-7.4, 0.02, 5.1),
  ]), formMat);
  scene.add(form); guides.push({ k: 6, obj: form, mat: formMat, max: 0.7 });

  // labels (DOM, owned by this module)
  const LAB = [
    ...DECKY.map((y, k) => ({ k: 1, p: new THREE.Vector3(DW / 2 + 0.7, y + (DW / 2) * TILT, DD / 2), text: ['16–32 mm', '8–16 mm', '4–8 mm', '0–4 mm'][k] })),
    ...PC.map((x, f) => ({ k: 2, p: new THREE.Vector3(x - PR[f] * 0.4, 0, PR[f] + 0.5), text: ['Pesak 0–4 mm', 'Šljunak 4–8 mm', 'Šljunak 8–16 mm', 'Šljunak 16–32 mm'][f] })),
    ...SIEVE_Y.map((y, k) => ({ k: 3, p: new THREE.Vector3(SIEVE_R + 0.75, y + 0.2, 0.9), text: ['Sito 16 mm', 'Sito 8 mm', 'Sito 4 mm', 'Dno · pesak 0–4 mm'][k] })),
    { k: 3, p: new THREE.Vector3(-SIEVE_R - 0.4, 6.6, 0), text: 'Granulometrijska analiza' },
    { k: 4, p: new THREE.Vector3(0, CUBEY + 3.0, 0), text: 'Atest IMS-a · MB10–MB50' },
    { k: 5, p: new THREE.Vector3(-1.0, 5.2, TRUCK_Z), text: 'Auto-mikseri 9 i 10 m³' },
    { k: 6, p: new THREE.Vector3(7.4, 0.05, 5.1), text: 'Vaš temelj' },
  ].map((L) => {
    const el = document.createElement('div');
    el.style.cssText = 'position:absolute;left:0;top:0;display:flex;align-items:center;gap:10px;font:500 11px/1 "Geist Mono",ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase;color:#F1EEE7;white-space:nowrap;opacity:0;will-change:transform,opacity;pointer-events:none';
    el.innerHTML = '<span style="width:22px;height:1px;background:#E3A83F;display:block"></span><span>' + L.text + '</span>';
    if (overlay) overlay.appendChild(el);
    return { ...L, el, v: new THREE.Vector3() };
  });

  // state
  let ft = 0, fn = 0, pT = 0, pS = 0, time = 0, last = performance.now(), active = true, px = 0, py = 0, pxS = 0, pyS = 0, raf = 0, w = 1, h = 1, wide = true;
  const dummy = new THREE.Object3D(), A3 = [0, 0, 0, 1], B3 = [0, 0, 0, 1], cp = new THREE.Vector3(), ct = new THREE.Vector3();
  let cubeA = 0;

  function posOf(k: number, i: number, out: number[]) {
    out[3] = 1;
    if (k === 0) {
      const s = (S0[i] + time * 0.011) % 1, x = -24 + 48 * s;
      const yc = 3.5 + Math.sin(s * 5.2 + 0.4) * 0.9, zc = -8 + 10 * s + Math.sin(s * 4.0) * 2.2;
      const a = s * 5.0 + time * 0.12, u = U[i] * 1.15, ww = W[i] * 0.32;
      out[0] = x + ww * 0.3; out[1] = yc + u * Math.sin(a) * 0.55 + ww * Math.cos(a); out[2] = zc + u * Math.cos(a) - ww * Math.sin(a) * 0.3;
      const e = Math.min(s, 1 - s); out[3] = clamp(e / 0.07, 0, 1); // grow in / shrink out at the ends, no popping
      return;
    }
    const src = P[k]; let x = src[i * 3], y = src[i * 3 + 1], z = src[i * 3 + 2];
    if (k === 1 && !reduce) x += Math.sin(time * 0.5 + i * 0.37) * 0.035;
    else if (k === 4) { const c = Math.cos(cubeA), s = Math.sin(cubeA), nx = x * c + z * s; z = -x * s + z * c; x = nx; y += CUBEY; }
    else if (k === 5) x += truckX;
    out[0] = x; out[1] = y; out[2] = z;
  }

  function resize() {
    w = canvas.clientWidth || 1; h = canvas.clientHeight || 1;
    const pr = effDpr(); if (Math.abs(renderer.getPixelRatio() - pr) > 0.001) renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h; wide = w / h > 1.1 && w > 900;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize); ro.observe(canvas); resize();

  function update(dt: number) {
    const p = clamp(pS, 0, 6);
    let A = Math.floor(p); if (A >= 6) A = 5;
    const B = A + 1, f = p - A, cf = ease(clamp(f, 0, 1));
    cubeA = 0.7 + time * 0.12;

    // truck drives in during 4→5 and stays parked beside the foundation
    const nx = p < 3.9 ? -40 : lerp(-40, 0, easeOut(clamp((p - 3.9) / 0.6, 0, 1)));
    wheelA -= (nx - truckX) / 0.56; truckX = nx;
    truck.group.visible = p > 3.92;
    truck.group.position.x = truckX;
    truck.wheels.forEach((wg) => { wg.rotation.z = wheelA; });
    truck.drum.rotation.y = time * (reduce ? 0.2 : 0.9);

    const aspect = w / h, distMul = aspect < 1 ? 1 + (1 - aspect) * 1.25 : 1;
    ct.lerpVectors(CAM[A].t, CAM[B].t, cf);
    cp.lerpVectors(CAM[A].p, CAM[B].p, cf).sub(ct).multiplyScalar(distMul).add(ct);
    cp.x += pxS * 0.9; cp.y -= pyS * 0.5;
    camera.position.copy(cp); camera.lookAt(ct);
    const intro = clamp(p, 0, 1);
    camera.setViewOffset(w, h, wide ? -intro * 0.12 * w : 0, wide ? 0 : intro * 0.17 * h, w, h);

    const lw = ease(clamp(1 - Math.abs(p - 3) * 1.5, 0, 1));
    sieves.group.visible = lw > 0.002;
    if (sieves.group.visible) { sieves.mats.forEach((m) => { m.opacity = lw; }); sieves.group.position.y = (1 - lw) * -0.6; }
    const hw = ease(clamp(1 - Math.abs(p - 2) * 1.4, 0, 1));
    heaps.visible = hw > 0.002;
    heaps.scale.set(0.9 + 0.1 * hw, Math.max(0.001, hw), 0.9 + 0.1 * hw);

    const lift = LIFT[A] || 0, wa = CW[A], wb = CW[B], sa = SPINW[A], sb = SPINW[B], win = WIN[A];
    const fw = clamp((f - win[0]) / (win[1] - win[0]), 0, 1);
    for (let i = 0; i < N; i++) {
      posOf(A, i, A3); posOf(B, i, B3);
      const ti = ease(clamp((fw - D[i] * 0.4) / 0.6, 0, 1));
      PH[i] += dt * lerp(sa, sb, ti);
      const x = lerp(A3[0], B3[0], ti), y = lerp(A3[1], B3[1], ti) + Math.sin(ti * Math.PI) * lift * (0.6 + D[i] * 1.8), z = lerp(A3[2], B3[2], ti);
      const s = R[i] * lerp(S[A][i], S[B][i], ti) * lerp(A3[3], B3[3], ti), ph = PH[i];
      dummy.position.set(x, y, z);
      dummy.rotation.set(ROT[i * 3] + SPN[i * 3] * ph, ROT[i * 3 + 1] + SPN[i * 3 + 1] * ph, ROT[i * 3 + 2] + SPN[i * 3 + 2] * ph);
      dummy.scale.set(s * SQ[i * 3], s * SQ[i * 3 + 1], s * SQ[i * 3 + 2]);
      dummy.updateMatrix(); const imk = IM[VAR[i]]; imk.setMatrixAt(SLOT[i], dummy.matrix);
      const n0 = lerp(wa[0], wb[0], ti), n1 = lerp(wa[1], wb[1], ti), n2 = lerp(wa[2], wb[2], ti), o = i * 3;
      col.setRGB(NAT[o] * n0 + FRC[o] * n1 + CON[o] * n2, NAT[o + 1] * n0 + FRC[o + 1] * n1 + CON[o + 1] * n2, NAT[o + 2] * n0 + FRC[o + 2] * n1 + CON[o + 2] * n2);
      imk.setColorAt(SLOT[i], col);
    }
    IM.forEach((im) => { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; });

    cubeEdges.rotation.y = cubeA;
    guides.forEach((g) => { g.mat.opacity = clamp(1 - Math.abs(pS - g.k) * 2, 0, 1) * g.max; g.obj.visible = g.mat.opacity > 0.001; });
    camera.updateMatrixWorld();
    LAB.forEach((L) => {
      const wt = clamp(1 - Math.abs(pS - L.k) * 2.2, 0, 1);
      if (wt < 0.01) { if (L.el.style.opacity !== '0') L.el.style.opacity = '0'; return; }
      L.v.copy(L.p).project(camera);
      const sx = (L.v.x * 0.5 + 0.5) * w, sy = (-L.v.y * 0.5 + 0.5) * h;
      L.el.style.transform = 'translate3d(' + sx.toFixed(1) + 'px,' + sy.toFixed(1) + 'px,0) translateY(-50%)';
      L.el.style.opacity = String(L.v.z > 1 ? 0 : wt);
    });
  }

  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!active) return;
    time += dt * (reduce ? 0.15 : 1);
    // critically-damped follow of the scroll position: smooth, never overshoots
    const k = 1 - Math.exp(-dt * 12);
    ft += dt; fn++;
    // adaptive quality with hysteresis: step down fast, step up slowly, never oscillate
    if (fn >= 60) { const avg = ft / fn; ft = 0; fn = 0; if (cool) cool--;
      if (avg > 0.024) { slow++; fast = 0; } else if (avg < 0.0125) { fast++; slow = 0; } else { slow = 0; fast = 0; }
      if (slow && !cool) {
        slow = 0; cool = 1;
        if (dpr > DPR_MIN + 0.01) { dpr = Math.max(DPR_MIN, dpr * 0.8); resize(); }
        else if (shadowsLive && renderer.shadowMap.enabled) { shadowsLive = false; renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true; }
      } else if (fast >= 5 && !cool && shadowsLive && dpr < DPR_MAX) { fast = 0; cool = 3; dpr = Math.min(DPR_MAX, dpr + 0.1); resize(); } }
    if (!shadowsLive && renderer.shadowMap.enabled && ++sf % 3 === 0) renderer.shadowMap.needsUpdate = true;
    pS += (pT - pS) * k; if (Math.abs(pT - pS) < 0.0004) pS = pT;
    pxS += (px - pxS) * (1 - Math.exp(-dt * 2.2)); pyS += (py - pyS) * (1 - Math.exp(-dt * 2.2));
    update(dt);
    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(frame);

  return {
    setProgress(p) { pT = clamp(p, 0, 6); },
    setPointer(x, y) { px = x; py = y; },
    setActive(a) { if (a && !active) last = performance.now(); active = !!a; },
    dispose() {
      cancelAnimationFrame(raf); ro.disconnect();
      LAB.forEach((L) => L.el.remove());
      truck.dispose(); sieves.dispose(); env.dispose(); heapMats.forEach((m) => m.dispose()); grainGeo.dispose(); grainMat.dispose();
      heaps.children.forEach((c) => (c as THREE.Mesh).geometry?.dispose());
      GEOS.forEach((gg) => gg.dispose()); STONE_MATS.forEach((m) => m.dispose()); stoneTex.dispose(); groundTex.dispose(); floor.geometry.dispose(); floor.material.dispose(); renderer.dispose();
    },
  };
}
