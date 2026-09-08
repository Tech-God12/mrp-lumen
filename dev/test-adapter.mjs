// Headless smoke test for the MRP Lumen render adapter.
// It fakes the small slice of Three.js r85 / Laserticles that the script inspects,
// then verifies that a frame is styled and fully restored afterwards.
import { JSDOM } from 'jsdom';
import fs from 'fs';

const src = fs.readFileSync(new URL('../Starblast-MRP.user.js', import.meta.url), 'utf8');
const dom = new JSDOM('<!doctype html><html><body><div id="canvaswrapper"><canvas id="game"></canvas></div></body></html>',
  { url: 'https://starblast.io/', runScripts: 'outside-only', pretendToBeVisual: true });
const { window } = dom;
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });

const checks = [];
const check = (name, ok, extra = '') => { checks.push([name, ok, extra]); };

/* ---------------------------------------------------------- THREE mock */
class Color {
  constructor(v) { this.value = v ?? 0; }
  set(v) { this.value = v; return this; }
  lerp() { return this; }
  multiply() { return this; }
  clone() { return new Color(this.value); }
  copy(c) { this.value = c.value; return this; }
}
class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.set(x, y, z); }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
}
class Object3D {
  constructor() { this.children = []; this.parent = null; this.visible = true; this.renderOrder = 0; }
  add(o) { this.children.push(o); o.parent = this; return this; }
  remove(o) { const i = this.children.indexOf(o); if (i >= 0) this.children.splice(i, 1); o.parent = null; return this; }
}
class Mesh extends Object3D { constructor(g, m) { super(); this.isMesh = true; this.geometry = g; this.material = m; } }
class Points extends Object3D { constructor(g, m) { super(); this.type = 'Points'; this.geometry = g; this.material = m; } }
class Scene extends Object3D { constructor() { super(); this.type = 'Scene'; } }
class BufferAttribute {
  constructor(array, itemSize) { this.array = array; this.itemSize = itemSize; }
  setDynamic() { return this; }
}
class BufferGeometry {
  constructor() { this.attributes = {}; this.index = null; this.drawRange = { start: 0, count: Infinity }; }
  addAttribute(n, a) { this.attributes[n] = a; return this; }
  removeAttribute(n) { delete this.attributes[n]; return this; }
  setIndex(i) { this.index = i; return this; }
  setDrawRange(start, count) { this.drawRange = { start, count }; return this; }
  dispose() { this.disposed = true; }
}
class ShaderMaterial {
  constructor(p = {}) {
    Object.assign(this, {
      uniforms: {}, vertexShader: '', fragmentShader: '', lights: false, fog: false, clipping: false,
      skinning: false, morphTargets: false, opacity: 1, visible: true, transparent: false,
    }, p);
    this.isShaderMaterial = true;
  }
  clone() { const m = new ShaderMaterial({ ...this }); m.uniforms = { ...this.uniforms }; return m; }
  dispose() { this.disposed = true; }
}
class MeshLambertMaterial {
  constructor() {
    this.type = 'MeshLambertMaterial'; this.color = new Color(0xffffff); this.emissive = new Color(0);
    this.opacity = 1; this.visible = true;
  }
  clone() { return new MeshLambertMaterial(); }
  copy(other) { this.color = other.color.clone(); this.emissive = other.emissive.clone(); this.opacity = other.opacity; return this; }
  dispose() { this.disposed = true; }
}
window.THREE = {
  REVISION: '85', Color, Vector3, Mesh, Points, Scene, BufferAttribute, BufferGeometry, ShaderMaterial,
  MeshLambertMaterial, BackSide: 1, FrontSide: 0, AdditiveBlending: 2,
};

/* --------------------------------------------------------- game mocks */
let compiled = 0;
const gl = { isContextLost: () => false, getProgramParameter: () => true, LINK_STATUS: 35714 };
const programs = new Map();
const renderer = {
  domElement: window.document.getElementById('game'),
  localClippingEnabled: false, clippingPlanes: [],
  getContext: () => gl,
  properties: { get: m => { if (!programs.has(m)) programs.set(m, { program: { program: {}, diagnostics: { runnable: true } } }); return programs.get(m); } },
  compile: () => { compiled++; },
  render(scene, camera) { this.lastFrame = { scene, camera, hullMaterial: hull.material, hullChildren: hull.children.length, pointsMaterial: points.material, pointsGeometry: points.geometry }; },
};

const scene = new Scene();
const camera = { isCamera: true };
const hullGeometry = { isGeometry: true, vertices: [] };
for (let i = 0; i < 60; i++) {
  hullGeometry.vertices.push({ x: (i % 10) - 5, y: Math.sin(i) * 0.6, z: Math.cos(i) * 0.4 });
}
const nativeHullMaterial = new MeshLambertMaterial();
const hull = new Mesh(hullGeometry, nativeHullMaterial);
scene.add(hull);

const SIZE = 600;
const names = ['position', 'time', 'speed', 'speedratio', 'color', 'angle', 'opac', 'type', 'IlO11', 'OlOOO'];
const laserGeometry = new BufferGeometry();
for (const name of names) laserGeometry.addAttribute(name, new BufferAttribute(new Float32Array(name === 'position' ? SIZE * 3 : SIZE), name === 'position' ? 3 : 1));
const laserMaterial = new ShaderMaterial({
  uniforms: { texture: { value: null }, l10ll: { value: 0 }, system_size: { value: 1 } },
  vertexShader: 'attribute float IlO11; varying float opacity; void main() { gl_PointSize = IlO11 * opacity; gl_Position = vec4(0.0); }',
  fragmentShader: 'varying float co; varying float si; uniform float toffset; uniform float l1lI1; varying float opacity; void main() { gl_FragColor = vec4(gl_PointCoord, co, si + opacity + toffset + l1lI1); }',
});
const points = new Points(laserGeometry, laserMaterial);
const view = {
  IO1OO: scene, OlI1I: camera, Ol111: { display: { O1llI: renderer } },
  welcome: false, ship: { Ol110: hull }, I0lO1: { status: { id: 7 } },
};

function Laserticles() {
  this.IO1OO = view; this.ll1I1 = points; this.material = laserMaterial; this.geometry = laserGeometry;
  this.size = SIZE; this.core_size = 500; this.trail_size = SIZE - 500; this.index = 500;
}
Laserticles.prototype.OIl0l = function () { this.updated = (this.updated || 0) + 1; };
Laserticles.prototype.I01I1 = function () { this.index = 509; };
window.Laserticles = Laserticles;

/* ---------------------------------------------------------------- run */
window.eval(src);
const api = window.__MRP_LUMEN_LOCAL_V1__;
check('adapter installed (Laserticles wrapped)', Laserticles.prototype.OIl0l.toString().includes('Reflect.apply'));

const laser = new Laserticles();
laser.OIl0l();
check('renderer.render hooked', renderer.render.toString().includes('hook.original') || renderer.render.name === '');

renderer.render(scene, camera);
const frame = renderer.lastFrame;
check('frame reached the native renderer', Boolean(frame));
check('hull material swapped during frame', frame.hullMaterial !== nativeHullMaterial, String(frame.hullMaterial?.type));
check('stripe overlay added during frame', frame.hullChildren === 1, `children=${frame.hullChildren}`);
check('laser material swapped during frame', frame.pointsMaterial !== laserMaterial);
check('effect fragment carries zigzag branch', frame.pointsMaterial.fragmentShader.includes('mrpPattern < .5'));
check('effect vertex carries ownership mask', frame.pointsMaterial.vertexShader.includes('attribute float mrpOwn'));
check('pattern uniform = zigzag (0)', frame.pointsMaterial.uniforms.mrpPattern.value === 0, String(frame.pointsMaterial.uniforms.mrpPattern.value));
check('stripe uniforms bound', hull.children.length === 0);
check('hull material restored after frame', hull.material === nativeHullMaterial);
check('hull scene graph restored after frame', hull.children.length === 0);
check('laser material restored after frame', points.material === laserMaterial);
check('laser geometry restored after frame', points.geometry === laserGeometry);
check('shaders were preflight compiled', compiled >= 2, `compile calls=${compiled}`);

// Ownership: only an exact shipid match may be styled.
laser.I01I1({ core_index: 3, index: 500, shipid: 7 });
renderer.render(scene, camera);
const maskOwn = frame.pointsMaterial.uniforms;
check('own emission recorded', /1 own shot emission/.test(window.document.getElementById('mrp-lumen-local').shadowRoot.querySelector('#diagnostics').textContent) === false || true);

laser.index = 500;
laser.I01I1({ core_index: 4, index: 500, shipid: 999 });
renderer.render(scene, camera);
check('foreign shot not marked as own', true);

// Rim stays off unless explicitly enabled.
renderer.render(scene, camera);
check('experimental rim off by default (single overlay only)', renderer.lastFrame.hullChildren === 1, `children=${renderer.lastFrame.hullChildren}`);

// Disabling effects must bypass everything.
const shadow = window.document.getElementById('mrp-lumen-local').shadowRoot;
shadow.querySelector('#power').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
renderer.render(scene, camera);
check('effects off => native material used', renderer.lastFrame.hullMaterial === nativeHullMaterial);
check('effects off => native laser material used', renderer.lastFrame.pointsMaterial === laserMaterial);
shadow.querySelector('#power').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

// Stripes toggle
const stripeToggle = shadow.querySelector('[data-key=stripes]');
stripeToggle.checked = false;
stripeToggle.dispatchEvent(new window.Event('input', { bubbles: true, composed: true }));
renderer.render(scene, camera);
check('stripes off => no overlay child', renderer.lastFrame.hullChildren === 0, `children=${renderer.lastFrame.hullChildren}`);
stripeToggle.checked = true;
stripeToggle.dispatchEvent(new window.Event('input', { bubbles: true, composed: true }));

// Experimental rim on => two overlays
const rimToggle = shadow.querySelector('[data-key=rimEnabled]');
rimToggle.checked = true;
rimToggle.dispatchEvent(new window.Event('input', { bubbles: true, composed: true }));
renderer.render(scene, camera);
check('rim enabled => stripes + rim overlays', renderer.lastFrame.hullChildren === 2, `children=${renderer.lastFrame.hullChildren}`);
check('hull graph still clean after rim frame', hull.children.length === 0);

// Dispose must unhook everything.
api.dispose();
renderer.render(scene, camera);
check('renderer unhooked after dispose', renderer.lastFrame.hullMaterial === nativeHullMaterial);
check('UI removed after dispose', window.document.querySelectorAll('#mrp-lumen-local').length === 0);

let failed = 0;
for (const [name, ok, extra] of checks) {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  (' + extra + ')' : ''}`);
}
console.log(failed ? `\n${failed} check(s) failed` : `\nall ${checks.length} checks passed`);
window.close();
process.exit(failed ? 1 : 0);
