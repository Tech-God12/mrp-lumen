// ==UserScript==
// @name         Starblast MRP Lumen - Local Cosmetics
// @namespace    local.starblast.mrp
// @version      2.0.0
// @description  Subtle hull recolor with thin ECP-style stripes, zigzag patterned laser sprites, and a personal MRP badge. Local visuals only.
// @match        https://starblast.io/*
// @match        https://www.starblast.io/*
// @run-at       document-end
// @grant        none
// @sandbox      raw
// @noframes
// @license      MIT
// ==/UserScript==

(() => {
  'use strict';

  // This adapter targets the public Three.js r85 renderer, not an official mod API.
  // It never changes entitlements, network traffic, weapons, movement, or game settings.
  const KEY = '__MRP_LUMEN_LOCAL_V1__';
  const STORAGE = 'mrp.lumen.cosmetics.v1';
  const VERSION = '2.0.0';
  // Single-instance guard: dispose an older copy before this one builds anything.
  if (window[KEY]?.dispose) { try { window[KEY].dispose(); } catch { /* older copy already gone */ } }

  const DEFAULTS = Object.freeze({
    enabled: true, ship: true, lasers: true, badge: true, stripes: true, rimEnabled: false,
    hull: '#65d9ff', trim: '#ffe9a8', rim: '#a18cff', shot: '#69efff', accent: '#f3aaff',
    tint: 0.45, pulse: 0.65, pulseDepth: 0.12,
    stripeDensity: 7, stripeWidth: 0.14, stripeOpacity: 0.55, stripeFlow: 0, stripeAxis: 'auto',
    glow: 0.6, expansion: 0.04,
    pattern: 'zigzag', shotTint: 0.7, patternStrength: 0.72, bandWidth: 0.08, animation: 0.8,
    scope: 'own', reduceMotion: false,
  });
  const BOUNDS = {
    tint: [0, 1], pulse: [0, 2], pulseDepth: [0, 0.4],
    stripeDensity: [1, 24], stripeWidth: [0.02, 0.6], stripeOpacity: [0, 1], stripeFlow: [0, 2],
    glow: [0, 1.5], expansion: [0, 0.12],
    shotTint: [0, 1], patternStrength: [0, 1], bandWidth: [0.035, 0.2], animation: [0, 2],
  };
  const COLOR_KEYS = ['hull', 'trim', 'rim', 'shot', 'accent'];
  // Index order matters: it is the value handed to the fragment shader.
  const PATTERNS = ['zigzag', 'chevron', 'crescent', 'helix', 'prism', 'plasma', 'native'];
  const PATTERN_LABELS = {
    zigzag: 'Zigzag stripes (default)',
    chevron: 'Chevron dashes',
    crescent: 'Twin curves',
    helix: 'Helix filaments',
    prism: 'Prism cut',
    plasma: 'Plasma core',
    native: 'Original sprite + tint only',
  };
  const AXES = { auto: 'Auto (longest axis)', x: 'Model X', y: 'Model Y', z: 'Model Z' };
  const BUILTINS = {
    Aurora: { hull: '#65d9ff', trim: '#ffe9a8', rim: '#a18cff', shot: '#69efff', accent: '#f3aaff', pattern: 'zigzag' },
    Solar: { hull: '#ffd577', trim: '#fff5c4', rim: '#ff844d', shot: '#ffcb69', accent: '#fff5c4', pattern: 'chevron' },
    Amethyst: { hull: '#c39bff', trim: '#ffd7f4', rim: '#f18cda', shot: '#c3a4ff', accent: '#ff96d4', pattern: 'helix' },
    Glacier: { hull: '#b5efff', trim: '#ffffff', rim: '#79b7ff', shot: '#b5f5ff', accent: '#ffffff', pattern: 'prism' },
  };
  const BADGE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" role="img" aria-label="MRP personal emblem">
    <defs><linearGradient id="mrp-metal" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff1bf"/><stop offset=".5" stop-color="#dcb971"/><stop offset="1" stop-color="#997041"/></linearGradient></defs>
    <path d="M80 10 126 35v59l-46 51-46-51V35Z" fill="#111b29" stroke="url(#mrp-metal)" stroke-width="3"/>
    <path d="m80 21 35 20v49l-35 39-35-39V41Z" fill="none" stroke="#6dccdf" stroke-opacity=".5"/>
    <path d="M33 62 7 47l8 27 18 12M127 62l26-15-8 27-18 12" fill="#253849" stroke="url(#mrp-metal)" stroke-width="2"/>
    <path d="m80 32 7 21 22 7-22 7-7 21-7-21-22-7 22-7Z" fill="url(#mrp-metal)"/>
    <circle cx="80" cy="60" r="7" fill="#d8fdff"/>
    <path d="M51 78q29 23 58 0M57 85q23 20 46 0" fill="none" stroke="#6dccdf" stroke-width="2"/>
    <path d="M37 96h86v25H37Z" fill="#111b29" stroke="url(#mrp-metal)"/>
    <text x="80" y="114" text-anchor="middle" font-family="Verdana,sans-serif" font-size="18" font-weight="bold" letter-spacing="5" fill="#f3dfae">MRP</text>
  </svg>`;

  function sanitize(value) {
    const output = { ...DEFAULTS };
    if (!value || typeof value !== 'object' || Array.isArray(value)) return output;
    for (const [key, fallback] of Object.entries(DEFAULTS)) {
      const item = value[key];
      if (typeof fallback === 'boolean' && typeof item === 'boolean') output[key] = item;
      else if (BOUNDS[key] && typeof item === 'number' && Number.isFinite(item)) {
        output[key] = Math.min(BOUNDS[key][1], Math.max(BOUNDS[key][0], item));
      } else if (COLOR_KEYS.includes(key) && typeof item === 'string' && /^#[\da-f]{6}$/i.test(item)) {
        output[key] = item;
      } else if (key === 'pattern' && PATTERNS.includes(item)) output[key] = item;
      else if (key === 'stripeAxis' && Object.hasOwn(AXES, item)) output[key] = item;
      else if (key === 'scope' && ['own', 'visible'].includes(item)) output[key] = item;
    }
    return output;
  }

  let stored;
  let storageWarning = '';
  try { stored = JSON.parse(localStorage.getItem(STORAGE) || 'null'); } catch { stored = null; }
  let settings = sanitize(stored?.settings);
  let prefersCalm = false;
  try { prefersCalm = Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches); } catch { prefersCalm = false; }
  if (!stored && prefersCalm) settings.reduceMotion = true;
  let customs = Array.isArray(stored?.presets) ? stored.presets.slice(0, 8)
    .filter(p => p && typeof p.name === 'string')
    .map(p => ({ name: p.name.slice(0, 28), settings: sanitize(p.settings) })) : [];

  let disposed = false;
  let suspended = false;
  let fault = '';
  let installed = null;
  let saveTimer = 0;
  let toastTimer = 0;
  let ui = null;
  let swatchFrame = 0;
  let lastSwatch = 0;
  let lastDraw = 0;
  let lastShipDraw = 0;
  let ownEmissions = 0;
  const started = performance.now();
  const layers = new Map();
  const renderers = new Map();
  const heldOutsideUI = new Set();
  const passKeyReleases = new WeakSet();
  const handledKeys = new WeakSet();
  const heldMouseButtons = new Set();
  const heldPointers = new Set();
  const passPointerReleases = new WeakSet();
  let previousFocus = null;
  const clock = () => settings.reduceMotion ? 0 : performance.now() / 1000;

  function saveNow() {
    clearTimeout(saveTimer);
    try {
      localStorage.setItem(STORAGE, JSON.stringify({ version: 1, settings, presets: customs }));
      storageWarning = '';
    } catch { storageWarning = 'Browser storage is unavailable; export a preset to keep your settings.'; }
  }
  function changed() {
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(saveNow, 250);
    syncUI();
  }

  // These are render-only paths in the inspected build. A mismatch leaves the game untouched.
  function inspect(laser) {
    const T = window.THREE;
    const view = laser?.IO1OO;
    const scene = view?.IO1OO;
    const camera = view?.OlI1I;
    const renderer = view?.Ol111?.display?.O1llI;
    const points = laser?.ll1I1;
    const material = laser?.material;
    const geometry = laser?.geometry;
    if (String(T?.REVISION) !== '85' || view?.welcome || scene?.type !== 'Scene' || !camera?.isCamera) return null;
    if (typeof renderer?.render !== 'function' || !renderer.domElement?.closest('#canvaswrapper')) return null;
    if (points?.type !== 'Points' || points.geometry !== geometry || !geometry?.attributes) return null;
    if (!material?.isShaderMaterial || !material.uniforms?.texture || !material.uniforms?.l10ll || !material.uniforms?.system_size) return null;
    for (const name of ['position', 'time', 'speed', 'speedratio', 'color', 'angle', 'opac', 'type', 'IlO11', 'OlOOO']) {
      if (!geometry.attributes[name]?.array) return null;
    }
    if (!/gl_PointSize\s*=\s*IlO11\s*\*\s*opacity/.test(material.vertexShader)) return null;
    if (!['gl_PointCoord', 'toffset', 'l1lI1', 'opacity', 'co', 'si'].every(x => material.fragmentShader.includes(x))) return null;
    if (![material.vertexShader, material.fragmentShader].every(s => /void\s+main\s*\(\s*\)/.test(s))) return null;
    const size = geometry.attributes.position.array.length / 3;
    if (!Number.isInteger(size) || size > 20000 || size !== laser.size || laser.core_size !== 500 || laser.trail_size !== size - 500) return null;
    return { T, view, scene, camera, renderer, points, material, geometry, size };
  }

  // Everything below is painted INSIDE the native particle sprite.
  // Position, velocity, lifetime, point size, depth and alpha stay exactly as the game set them.
  const LASER_FRAGMENT = `
    uniform vec3 mrpShotColor;
    uniform vec3 mrpAccentColor;
    uniform float mrpTint;
    uniform float mrpStrength;
    uniform float mrpWidth;
    uniform float mrpClock;
    uniform float mrpPattern;
    uniform float mrpAllVisible;
    varying float mrpVMask;
    void main() {
      mrpNativeFragment();
      if (mrpVMask < 0.5 && mrpAllVisible < 0.5) return;
      vec4 nativePixel = gl_FragColor;
      vec2 q = (gl_PointCoord - .5) * 2.0;
      q = vec2(q.x*co+q.y*si, q.x*si-q.y*co);
      float soft = mrpWidth + .07;
      float fade = 1.0 - smoothstep(.55, 1.05, length(q));
      float detail = 0.0;
      if (mrpPattern < .5) {
        // zigzag: small stripes running along the bolt, like an ECP trim.
        float tri = abs(fract(q.x * 2.2 - mrpClock * .55) * 2.0 - 1.0) * .62 - .31;
        detail = 1.0 - smoothstep(mrpWidth, soft, abs(q.y - tri));
        float rung = abs(fract(q.x * 4.4 - mrpClock * .55) - .5);
        detail = max(detail, (1.0 - smoothstep(mrpWidth * .6, mrpWidth * .6 + .05, rung)) * (1.0 - smoothstep(.18, .5, abs(q.y))) * .7);
      } else if (mrpPattern < 1.5) {
        // chevron dashes
        float d = abs(fract(q.x * 2.6 - mrpClock * .7 + abs(q.y) * .9) - .5);
        detail = (1.0 - smoothstep(mrpWidth * .8, mrpWidth * .8 + .06, d)) * (1.0 - smoothstep(.2, .78, abs(q.y)));
      } else if (mrpPattern < 2.5) {
        float arcA = abs(length(q - vec2(.0, .24)) - .54);
        float arcB = abs(length(q + vec2(.0, .24)) - .54);
        detail = (1.0 - smoothstep(mrpWidth, soft, min(arcA, arcB))) * (1.0 - smoothstep(.15, 1.0, abs(q.x)));
      } else if (mrpPattern < 3.5) {
        float wave = sin(q.x * 6.5 - mrpClock * 3.0) * .32;
        float thread = min(abs(q.y - wave), abs(q.y + wave));
        detail = 1.0 - smoothstep(mrpWidth, soft, thread);
      } else if (mrpPattern < 4.5) {
        float diamond = abs(abs(q.x) + abs(q.y) - .6);
        detail = 1.0 - smoothstep(mrpWidth, soft, diamond);
      } else if (mrpPattern < 5.5) {
        detail = exp(-dot(q, q) * 5.0) * (.8 + .2 * cos(mrpClock * 3.0));
      }
      detail *= fade;
      vec3 tint = mix(vec3(1.0), mrpShotColor * 1.45 + .15, mrpTint);
      vec3 decorative = mrpAccentColor * detail * mrpStrength * nativePixel.a * .8;
      // Native alpha, point size, depth, position and lifetime are not changed.
      gl_FragColor = vec4(nativePixel.rgb * tint + decorative, nativePixel.a);
    }
  `;

  // Thin painted stripes on the EXISTING hull mesh. No new geometry is created:
  // the overlay reuses the game's own hull geometry and is removed after every frame.
  const STRIPE_VERTEX = `
    uniform vec3 mrpAxis;
    uniform float mrpMin;
    uniform float mrpSpan;
    varying float mrpT;
    varying vec3 mrpNormalV;
    varying vec3 mrpViewV;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      mrpT = (dot(position, mrpAxis) - mrpMin) / mrpSpan;
      mrpNormalV = normalize(normalMatrix * normal);
      mrpViewV = -mv.xyz;
      gl_Position = projectionMatrix * mv;
    }`;
  const STRIPE_FRAGMENT = `
    uniform vec3 mrpTrim;
    uniform float mrpCount;
    uniform float mrpStripeWidth;
    uniform float mrpOpacity;
    uniform float mrpFlow;
    uniform float mrpClock;
    varying float mrpT;
    varying vec3 mrpNormalV;
    varying vec3 mrpViewV;
    void main() {
      float s = fract(mrpT * mrpCount - mrpClock * mrpFlow);
      float d = abs(s - .5);
      float half_w = clamp(mrpStripeWidth, .01, .48) * .5;
      float line = 1.0 - smoothstep(half_w, half_w + .045, d);
      float face = abs(dot(normalize(mrpNormalV), normalize(mrpViewV)));
      float ends = smoothstep(.0, .10, mrpT) * smoothstep(.0, .10, 1.0 - mrpT);
      float alpha = line * ends * mrpOpacity * (.35 + .65 * face);
      if (alpha <= .002) discard;
      gl_FragColor = vec4(mrpTrim, alpha);
    }`;

  function localIdentity(view) {
    const id = view?.I0lO1?.status?.id;
    return (typeof id === 'number' && Number.isFinite(id)) || typeof id === 'string' ? id : null;
  }

  function layerFor(laser) {
    const refs = inspect(laser);
    let state = layers.get(laser);
    if (!refs) {
      if (state) { releaseLayer(state); layers.delete(laser); }
      return null;
    }
    if (state && (state.renderer !== refs.renderer || state.geometry !== refs.geometry || state.material !== refs.material ||
        state.sourceVertex !== refs.material.vertexShader || state.sourceFragment !== refs.material.fragmentShader)) {
      releaseLayer(state);
      layers.delete(laser);
      state = null;
    }
    if (!state) {
      const { T, material, geometry, size } = refs;
      const mask = new Float32Array(size);
      const maskAttribute = new T.BufferAttribute(mask, 1).setDynamic(true);
      const effectGeometry = new T.BufferGeometry();
      for (const [name, attribute] of Object.entries(geometry.attributes)) effectGeometry.addAttribute(name, attribute);
      if (geometry.index) effectGeometry.setIndex(geometry.index);
      effectGeometry.addAttribute('mrpOwn', maskAttribute);
      effectGeometry.boundingSphere = geometry.boundingSphere?.clone() || null;
      effectGeometry.boundingBox = geometry.boundingBox?.clone() || null;
      const effectMaterial = material.clone();
      effectMaterial.vertexShader = 'attribute float mrpOwn; varying float mrpVMask;\n' +
        material.vertexShader.replace(/void\s+main\s*\(\s*\)\s*\{/, 'void main() { mrpVMask = mrpOwn;');
      effectMaterial.fragmentShader = material.fragmentShader.replace(/void\s+main\s*\(\s*\)/, 'void mrpNativeFragment()') + LASER_FRAGMENT;
      effectMaterial.uniforms = {
        ...material.uniforms,
        mrpShotColor: { value: new T.Color() }, mrpAccentColor: { value: new T.Color() },
        mrpTint: { value: 0 }, mrpStrength: { value: 0 }, mrpWidth: { value: .08 },
        mrpClock: { value: 0 }, mrpPattern: { value: 0 }, mrpAllVisible: { value: 0 },
      };
      state = { ...refs, laser, mask, maskAttribute, effectGeometry, effectMaterial,
        sourceVertex: material.vertexShader, sourceFragment: material.fragmentShader,
        shaderReady: null, hullResources: null, identity: localIdentity(refs.view), lastSeen: 0 };
      layers.set(laser, state);
    }
    if (state.renderer !== refs.renderer || state.scene !== refs.scene) {
      unlinkLayer(state);
      state.shaderReady = null;
      releaseHull(state);
    }
    Object.assign(state, refs);
    state.lastSeen = performance.now();
    const identity = localIdentity(state.view);
    if (identity !== state.identity) {
      state.mask.fill(0);
      state.maskAttribute.needsUpdate = true;
      state.identity = identity;
    }
    attachRenderer(state);
    return state;
  }

  function markEmission(state, record) {
    if (!state || !record) return;
    const { laser, mask } = state;
    const unknownWrite = () => { mask.fill(0); state.maskAttribute.needsUpdate = true; };
    const core = record.core_index;
    const start = record.index;
    if (!Number.isInteger(core) || core < 0 || core >= laser.core_size ||
        !Number.isInteger(start) || start < laser.core_size || start >= laser.size) return unknownWrite();
    const count = (laser.index - start + laser.trail_size) % laser.trail_size;
    if (count !== 9 && count !== 19) return unknownWrite();
    const knownOwner = (typeof record.shipid === 'number' && Number.isFinite(record.shipid)) || typeof record.shipid === 'string';
    const own = state.identity !== null && knownOwner && record.shipid === state.identity ? 1 : 0;
    mask[core] = own;
    for (let n = 0; n < count; n++) mask[(start - laser.core_size + n) % laser.trail_size + laser.core_size] = own;
    state.maskAttribute.needsUpdate = true;
    if (own) ownEmissions++;
  }

  function releaseHull(state) {
    const r = state.hullResources;
    if (!r) return;
    if (r.glowMesh.parent) r.glowMesh.parent.remove(r.glowMesh);
    if (r.stripeMesh.parent) r.stripeMesh.parent.remove(r.stripeMesh);
    r.tintMaterial.dispose();
    r.glowMaterial.dispose();
    r.stripeMaterial.dispose();
    // Geometry and maps belong to Starblast; never dispose them here.
    state.hullResources = null;
  }

  function unlinkLayer(state) {
    for (const [renderer, hook] of renderers) {
      for (const [scene, candidate] of hook.scenes) if (candidate === state) hook.scenes.delete(scene);
      if (!hook.scenes.size) {
        if (renderer.render === hook.wrapper) renderer.render = hook.original;
        renderer.domElement.removeEventListener('webglcontextrestored', hook.contextRestored);
        renderers.delete(renderer);
      }
    }
  }

  function releaseLayer(state) {
    unlinkLayer(state);
    releaseHull(state);
    state.effectMaterial.dispose();
    // r85 does not reference-count shared attribute buffers. Detach borrowed data first.
    for (const name of Object.keys(state.effectGeometry.attributes)) {
      if (name !== 'mrpOwn') state.effectGeometry.removeAttribute(name);
    }
    state.effectGeometry.setIndex(null);
    state.effectGeometry.dispose();
  }

  function compileEffect(state, material, geometry, kind) {
    const { T, renderer, camera } = state;
    if (typeof renderer.compile !== 'function' || !renderer.properties?.get ||
        material.lights || material.fog || material.clipping || material.skinning ||
        material.morphTargets || renderer.localClippingEnabled || renderer.clippingPlanes?.length) return false;
    const privateScene = new T.Scene();
    const probe = kind === 'points' ? new T.Points(geometry, material) : new T.Mesh(geometry, material);
    privateScene.add(probe);
    try {
      const gl = renderer.getContext();
      if (gl.isContextLost()) return false;
      // compile() initializes a private material; it does not draw or alter the game's scene.
      renderer.compile(privateScene, camera);
      const program = renderer.properties.get(material).program;
      return !gl.isContextLost() && Boolean(program?.program) &&
        program.diagnostics?.runnable !== false && gl.getProgramParameter(program.program, gl.LINK_STATUS) === true;
    } catch { return false; }
    finally { privateScene.remove(probe); }
  }

  function materialKey(material) {
    const fields = ['type', 'precision', 'shading', 'side', 'vertexColors', 'fog', 'lights', 'skinning',
      'morphTargets', 'morphNormals', 'alphaTest', 'premultipliedAlpha', 'dithering', 'combine'];
    const maps = ['map', 'envMap', 'lightMap', 'aoMap', 'emissiveMap', 'bumpMap', 'normalMap',
      'displacementMap', 'specularMap', 'roughnessMap', 'metalnessMap', 'alphaMap'];
    return fields.map(key => material[key]).concat(maps.map(key => material[key] ?
      `${key}:${material[key].encoding}:${material[key].mapping}` : '')).join('|');
  }

  // Reads the model extents without mutating game-owned geometry (r85 hulls are THREE.Geometry).
  function localBounds(geometry) {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    const take = (x, y, z) => {
      const v = [x, y, z];
      for (let a = 0; a < 3; a++) {
        if (!Number.isFinite(v[a])) return;
        if (v[a] < min[a]) min[a] = v[a];
        if (v[a] > max[a]) max[a] = v[a];
      }
    };
    if (Array.isArray(geometry.vertices) && geometry.vertices.length) {
      const list = geometry.vertices;
      const limit = Math.min(list.length, 200000);
      for (let i = 0; i < limit; i++) take(list[i].x, list[i].y, list[i].z);
    } else if (geometry.attributes?.position?.array) {
      const array = geometry.attributes.position.array;
      const limit = Math.min(array.length, 600000);
      for (let i = 0; i + 2 < limit; i += 3) take(array[i], array[i + 1], array[i + 2]);
    } else return null;
    if (!Number.isFinite(min[0]) || !Number.isFinite(max[0])) return null;
    return { min, max };
  }

  function stripeAxisSetup(bounds, choice) {
    const spans = [bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1], bounds.max[2] - bounds.min[2]];
    let index = { x: 0, y: 1, z: 2 }[choice];
    if (index === undefined) index = spans.indexOf(Math.max(...spans));
    if (index < 0) index = 0;
    return { index, min: bounds.min[index], span: Math.max(spans[index], 1e-4) };
  }

  function prepareShip(state, restore) {
    const { T, view, scene } = state;
    const hull = view.ship?.Ol110;
    if (!hull?.isMesh || !hull.geometry || Array.isArray(hull.material)) return;
    if (!hull.geometry.isGeometry && !hull.geometry.attributes?.normal) return;
    let ancestor = hull;
    while (ancestor.parent) { if (!ancestor.visible) return; ancestor = ancestor.parent; }
    if (ancestor !== scene) return;
    const nativeMaterial = hull.material;
    if (nativeMaterial?.visible === false || nativeMaterial?.opacity <= 0) return;
    if (!['MeshLambertMaterial', 'MeshPhongMaterial', 'MeshStandardMaterial'].includes(nativeMaterial?.type)) return;
    let r = state.hullResources;
    if (r && (r.hull !== hull || r.source !== nativeMaterial || r.geometry !== hull.geometry)) {
      releaseHull(state);
      r = null;
    }
    if (!r) {
      // The native material is cloned and tinted; the game's own material object is never edited.
      const tintMaterial = nativeMaterial.clone();
      const glowMaterial = new T.ShaderMaterial({
        uniforms: { mrpRim: { value: new T.Color() }, mrpGlow: { value: 0 }, mrpExpansion: { value: 0 } },
        vertexShader: `
          uniform float mrpExpansion;
          varying vec3 mrpNormal; varying vec3 mrpView;
          void main() {
            vec3 p = position * (1.0 + mrpExpansion);
            vec4 mv = modelViewMatrix * vec4(p,1.0);
            mrpNormal = normalize(normalMatrix * normal); mrpView = -mv.xyz;
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: `
          uniform vec3 mrpRim; uniform float mrpGlow;
          varying vec3 mrpNormal; varying vec3 mrpView;
          void main() {
            float edge = pow(1.0-abs(dot(normalize(mrpNormal),normalize(mrpView))),1.4);
            gl_FragColor = vec4(mrpRim, edge * mrpGlow * .48);
          }`,
        side: T.BackSide, transparent: true, depthTest: true, depthWrite: false, blending: T.AdditiveBlending,
      });
      const stripeMaterial = new T.ShaderMaterial({
        uniforms: {
          mrpTrim: { value: new T.Color() }, mrpCount: { value: 7 }, mrpStripeWidth: { value: .14 },
          mrpOpacity: { value: 0 }, mrpFlow: { value: 0 }, mrpClock: { value: 0 },
          mrpAxis: { value: new T.Vector3(1, 0, 0) }, mrpMin: { value: 0 }, mrpSpan: { value: 1 },
        },
        vertexShader: STRIPE_VERTEX,
        fragmentShader: STRIPE_FRAGMENT,
        side: T.FrontSide, transparent: true, depthTest: true, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
      });
      // Both overlays REUSE the game's hull geometry. No ship model is generated.
      const glowMesh = new T.Mesh(hull.geometry, glowMaterial);
      const stripeMesh = new T.Mesh(hull.geometry, stripeMaterial);
      stripeMesh.renderOrder = (hull.renderOrder || 0) + 1;
      r = { hull, geometry: hull.geometry, source: nativeMaterial, tintMaterial, glowMaterial, glowMesh,
        stripeMaterial, stripeMesh, color: new T.Color(), white: new T.Color(0xffffff),
        key: materialKey(nativeMaterial), glowReady: null, stripeReady: null,
        bounds: localBounds(hull.geometry), axisKey: null };
      state.hullResources = r;
    }
    r.tintMaterial.copy(nativeMaterial);
    const nextKey = materialKey(nativeMaterial);
    if (r.key !== nextKey) {
      r.tintMaterial.needsUpdate = true;
      r.key = nextKey;
    }
    const pulse = 1 + Math.sin(clock() * Math.PI * 2 * settings.pulse) * settings.pulseDepth;
    // Subtle multiply tint of the native color: the model, textures and opacity stay native.
    r.color.set(settings.hull);
    r.color.lerp(r.white, 1 - settings.tint);
    r.tintMaterial.color.multiply(r.color);
    const glow = settings.glow * pulse;
    if (r.tintMaterial.emissive) {
      if (settings.rimEnabled) r.tintMaterial.emissive.lerp(r.color.set(settings.rim), Math.min(.55, glow * .25));
      else r.tintMaterial.emissive.lerp(r.color.set(settings.hull), Math.min(.3, settings.tint * .18 * pulse));
    }
    hull.material = r.tintMaterial;
    restore.push(() => { if (hull.material === r.tintMaterial) hull.material = nativeMaterial; });

    if (settings.stripes && settings.stripeOpacity > 0 && r.bounds) {
      const axisKey = settings.stripeAxis;
      if (r.axisKey !== axisKey) {
        const setup = stripeAxisSetup(r.bounds, axisKey);
        r.stripeMaterial.uniforms.mrpAxis.value.set(setup.index === 0 ? 1 : 0, setup.index === 1 ? 1 : 0, setup.index === 2 ? 1 : 0);
        r.stripeMaterial.uniforms.mrpMin.value = setup.min;
        r.stripeMaterial.uniforms.mrpSpan.value = setup.span;
        r.axisKey = axisKey;
      }
      const u = r.stripeMaterial.uniforms;
      u.mrpTrim.value.set(settings.trim);
      u.mrpCount.value = Math.max(1, Math.round(settings.stripeDensity));
      u.mrpStripeWidth.value = settings.stripeWidth;
      u.mrpOpacity.value = settings.stripeOpacity * Math.max(0, Math.min(1, nativeMaterial.opacity)) * pulse;
      u.mrpFlow.value = settings.stripeFlow;
      u.mrpClock.value = clock();
      if (r.stripeReady === null) r.stripeReady = compileEffect(state, r.stripeMaterial, hull.geometry, 'mesh');
      if (r.stripeReady) {
        hull.add(r.stripeMesh);
        restore.push(() => hull.remove(r.stripeMesh));
      }
    }

    if (settings.rimEnabled) {
      r.glowMaterial.uniforms.mrpRim.value.set(settings.rim);
      r.glowMaterial.uniforms.mrpGlow.value = glow * Math.max(0, Math.min(1, nativeMaterial.opacity));
      r.glowMaterial.uniforms.mrpExpansion.value = settings.expansion;
      if (r.glowReady === null) r.glowReady = compileEffect(state, r.glowMaterial, hull.geometry, 'mesh');
      if (glow > 0 && settings.expansion > 0 && r.glowReady) {
        hull.add(r.glowMesh);
        restore.push(() => hull.remove(r.glowMesh));
      }
    }
    lastShipDraw = performance.now();
  }

  function prepareLasers(state, restore) {
    const { points, material, geometry, effectGeometry, effectMaterial } = state;
    if (points.material !== material || points.geometry !== geometry) return;
    if (state.shaderReady === null) state.shaderReady = compileEffect(state, effectMaterial, effectGeometry, 'points');
    if (!state.shaderReady) {
      fault = 'Laser shader is not compatible with this renderer. Native laser visuals are kept.';
      return;
    }
    for (const [name, attribute] of Object.entries(geometry.attributes)) effectGeometry.addAttribute(name, attribute);
    effectGeometry.setDrawRange(geometry.drawRange.start, geometry.drawRange.count);
    for (const [name, uniform] of Object.entries(material.uniforms)) effectMaterial.uniforms[name] = uniform;
    const u = effectMaterial.uniforms;
    u.mrpShotColor.value.set(settings.shot);
    u.mrpAccentColor.value.set(settings.accent);
    u.mrpTint.value = settings.shotTint;
    u.mrpStrength.value = settings.patternStrength;
    u.mrpWidth.value = settings.bandWidth;
    u.mrpClock.value = clock() * settings.animation;
    u.mrpPattern.value = PATTERNS.indexOf(settings.pattern);
    u.mrpAllVisible.value = settings.scope === 'visible' ? 1 : 0;
    points.geometry = effectGeometry;
    points.material = effectMaterial;
    restore.push(() => {
      if (points.geometry === effectGeometry) points.geometry = geometry;
      if (points.material === effectMaterial) points.material = material;
    });
  }

  function attachRenderer(state) {
    const { renderer, scene } = state;
    let hook = renderers.get(renderer);
    if (!hook) {
      hook = { original: renderer.render, wrapper: null, scenes: new Map() };
      hook.contextRestored = () => {
        for (const s of hook.scenes.values()) {
          s.shaderReady = null;
          s.effectMaterial.needsUpdate = true;
          s.mask.fill(0);
          s.maskAttribute.needsUpdate = true;
          if (s.hullResources) {
            s.hullResources.glowReady = null;
            s.hullResources.stripeReady = null;
            s.hullResources.glowMaterial.needsUpdate = true;
            s.hullResources.stripeMaterial.needsUpdate = true;
            s.hullResources.tintMaterial.needsUpdate = true;
          }
        }
        fault = '';
      };
      hook.wrapper = function (...args) {
        const s = hook.scenes.get(args[0]);
        if (disposed || suspended || !settings.enabled || !s || layers.get(s.laser) !== s ||
            s.view.welcome || args[1] !== s.camera || args[2]) {
          return Reflect.apply(hook.original, this, args);
        }
        const restore = [];
        try {
          try {
            if (settings.ship) prepareShip(s, restore);
            if (settings.lasers) prepareLasers(s, restore);
          } catch (error) {
            suspended = true;
            fault = `Cosmetic adapter paused: ${error?.name || 'incompatible renderer'}. Use Reconnect or disable MRP.`;
            while (restore.length) restore.pop()();
          }
          const result = Reflect.apply(hook.original, this, args);
          lastDraw = performance.now();
          return result;
        } finally {
          // Game-owned materials and scene children are restored even if rendering throws.
          while (restore.length) restore.pop()();
        }
      };
      renderer.render = hook.wrapper;
      renderer.domElement.addEventListener('webglcontextrestored', hook.contextRestored);
      renderers.set(renderer, hook);
    }
    if (renderer.render !== hook.wrapper) {
      fault = 'Another extension changed the renderer. Reload with other visual scripts disabled.';
      return;
    }
    hook.scenes.set(scene, state);
  }

  function installAdapter() {
    if (disposed || installed) return;
    const T = window.THREE;
    const proto = window.Laserticles?.prototype;
    if (String(T?.REVISION) !== '85' || typeof proto?.OIl0l !== 'function' || typeof proto?.I01I1 !== 'function') return;
    const update = proto.OIl0l;
    const emit = proto.I01I1;
    const wrappedUpdate = function (...args) {
      const result = Reflect.apply(update, this, args);
      if (!disposed && !suspended) {
        try { layerFor(this); } catch { suspended = true; fault = 'Rendering schema changed. MRP paused; original visuals remain available.'; }
      }
      return result;
    };
    const wrappedEmit = function (...args) {
      const result = Reflect.apply(emit, this, args);
      if (!disposed && !suspended) {
        try { markEmission(layerFor(this), args[0]); } catch { suspended = true; fault = 'Laser adapter changed. MRP paused; original visuals remain available.'; }
      }
      return result;
    };
    proto.OIl0l = wrappedUpdate;
    proto.I01I1 = wrappedEmit;
    installed = { proto, update, emit, wrappedUpdate, wrappedEmit };
  }

  function detachAdapter() {
    if (installed) {
      const i = installed;
      if (i.proto.OIl0l === i.wrappedUpdate) i.proto.OIl0l = i.update;
      if (i.proto.I01I1 === i.wrappedEmit) i.proto.I01I1 = i.emit;
      installed = null;
    }
    for (const [renderer, hook] of renderers) if (renderer.render === hook.wrapper) renderer.render = hook.original;
    for (const state of layers.values()) releaseLayer(state);
    layers.clear();
    renderers.clear();
    lastDraw = lastShipDraw = ownEmissions = 0;
  }

  /* ------------------------------------------------------------------ UI */

  const COLORS = {
    hull: 'Hull finish', trim: 'Stripe colour', rim: 'Rim lighting',
    shot: 'Laser body', accent: 'Laser detail',
  };
  const FORMATS = {
    tint: 'pct', pulse: 'hz', pulseDepth: 'pct',
    stripeDensity: 'lines', stripeWidth: 'pct', stripeOpacity: 'pct', stripeFlow: 'x',
    glow: 'pct', expansion: 'pct',
    shotTint: 'pct', patternStrength: 'pct', bandWidth: 'pct', animation: 'x',
  };
  const RANGES = {
    hullTone: [
      ['tint', 'Hull tint strength'],
      ['pulse', 'Pulse speed'],
      ['pulseDepth', 'Pulse amount'],
    ],
    stripe: [
      ['stripeDensity', 'Stripe count'],
      ['stripeWidth', 'Stripe thickness'],
      ['stripeOpacity', 'Stripe opacity'],
      ['stripeFlow', 'Stripe drift'],
    ],
    rim: [
      ['glow', 'Rim brightness'],
      ['expansion', 'Rim spread'],
    ],
    laser: [
      ['shotTint', 'Laser tint'],
      ['patternStrength', 'Detail intensity'],
      ['bandWidth', 'Detail width'],
      ['animation', 'Pattern motion'],
    ],
  };

  function formatValue(key, value) {
    switch (FORMATS[key]) {
      case 'pct': return `${Math.round(value * 100)}%`;
      case 'hz': return `${value.toFixed(2)} Hz`;
      case 'x': return `${value.toFixed(2)}\u00d7`;
      case 'lines': return `${Math.round(value)} lines`;
      default: return String(Number(value.toFixed(3)));
    }
  }

  const STYLE = `
    :host { font:15px/1.5 'Segoe UI',system-ui,sans-serif; color:#eef4f9; }
    * { box-sizing:border-box; } [hidden] { display:none!important; }
    button,input,select { font:inherit; }
    button,select,input[type=checkbox],input[type=color],input[type=range] { cursor:pointer; }
    button { color:inherit; border:1px solid #37485c; background:#1a2634; border-radius:10px; padding:11px 15px; transition:background .14s ease,border-color .14s ease,transform .08s ease; }
    button:hover { background:#26384b; border-color:#7fd4e6; }
    button:active { transform:translateY(1px); }
    button:disabled { opacity:.45; cursor:not-allowed; }
    button:focus-visible,input:focus-visible,select:focus-visible { outline:2px solid #7ce4f1; outline-offset:3px; }

    .dock { pointer-events:auto; position:absolute; bottom:20px; left:20px; display:flex; align-items:center; gap:12px;
      padding:9px 18px 9px 8px; background:#0e1722; box-shadow:0 6px 26px #000a; border-color:#a98853; }
    .dock svg { width:42px; height:42px; }
    .dock b { letter-spacing:.2em; font-size:17px; }
    .dock small { display:block; color:#7bd6c6; font-size:11px; letter-spacing:.1em; }
    .dock.off small { color:#ff9a8a; }

    .toast { pointer-events:none; position:absolute; top:22px; left:50%; transform:translate(-50%,-14px); opacity:0;
      padding:12px 22px; border-radius:12px; background:#0d1620; border:1px solid #3c5568;
      box-shadow:0 12px 40px #000b; font-size:15px; letter-spacing:.04em; transition:opacity .18s ease,transform .18s ease; }
    .toast.show { opacity:1; transform:translate(-50%,0); }
    .toast[data-tone=on] { border-color:#54d8a6; color:#c7ffe9; }
    .toast[data-tone=off] { border-color:#e0785f; color:#ffd8cd; }

    .panel { pointer-events:auto; position:absolute; left:20px; bottom:94px; width:620px; min-width:560px;
      max-width:calc(100vw - 26px); max-height:calc(100vh - 124px); overflow:auto; background:#0e1620;
      border:1px solid #43596c; border-radius:18px; box-shadow:0 26px 90px #000c;
      scrollbar-width:thin; scrollbar-color:#43596c #0e1620; }
    .panel::-webkit-scrollbar { width:10px; } .panel::-webkit-scrollbar-thumb { background:#31465a; border-radius:8px; }

    header { display:flex; align-items:center; gap:16px; padding:20px 22px 16px; border-bottom:1px solid #29394a;
      background:linear-gradient(125deg,#1d2f3e,#111b25); }
    header svg { width:74px; height:74px; flex:none; }
    header div.title { flex:1; }
    header small { color:#d6bb82; letter-spacing:.26em; font-size:11px; }
    h1 { font-size:33px; letter-spacing:.06em; margin:0; line-height:1.12; font-weight:600; }
    header p { font-size:12.5px; color:#9db3c4; margin:6px 0 0; }
    header p b { color:#8fe6d5; }
    .close { align-self:flex-start; font-size:24px; line-height:1; padding:4px 12px; background:transparent; border-color:transparent; }

    .power-wrap { display:flex; flex-direction:column; gap:10px; padding:18px 22px 6px; }
    .power { display:flex; align-items:center; gap:14px; width:100%; padding:18px 22px; border-radius:14px; font-size:20px;
      font-weight:600; letter-spacing:.14em; border:2px solid #2f8f74; background:linear-gradient(120deg,#10402f,#123326); color:#c8ffe9; }
    .power:hover { border-color:#63e7b6; background:linear-gradient(120deg,#14523c,#16412f); }
    .power .led { width:15px; height:15px; border-radius:50%; background:#4fe0a6; box-shadow:0 0 14px #4fe0a6; flex:none; }
    .power small { margin-left:auto; font-size:12px; letter-spacing:.16em; opacity:.75; font-weight:400; }
    .power.off { border-color:#8a3f34; background:linear-gradient(120deg,#40140f,#2a1512); color:#ffd0c5; }
    .power.off:hover { border-color:#ef8a72; }
    .power.off .led { background:#ff6f52; box-shadow:0 0 14px #ff6f52; }

    .status { padding:11px 14px; background:#0a121b; border:1px solid #24313f; border-radius:10px; color:#a9c6d0; font-size:12.5px; }

    .quick { display:flex; align-items:center; gap:8px; padding:12px 22px 4px; flex-wrap:wrap; }
    .quick .presets { flex:1; min-width:340px; }
    .presets { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; }
    .presets button { padding:11px 4px; font-size:13.5px; letter-spacing:.05em; }
    .presets button.active { border-color:#7fe3c4; background:#14332c; box-shadow:inset 0 0 0 1px #7fe3c4; color:#dcfff3; }

    .tabs { display:flex; gap:6px; padding:14px 22px 0; border-bottom:1px solid #26374a; }
    .tabs button { border:1px solid transparent; border-bottom:none; border-radius:12px 12px 0 0; background:transparent;
      padding:12px 18px; font-size:14px; letter-spacing:.1em; text-transform:uppercase; color:#8fa6b8; }
    .tabs button:hover { color:#dbe9f2; background:#16222f; }
    .tabs button[aria-selected=true] { color:#f4e7c6; background:#16222f; border-color:#334a5e; box-shadow:inset 0 3px 0 #d9bd85; }

    .tabbody { padding:18px 22px 6px; }
    .card { background:#131e2a; border:1px solid #26374a; border-radius:14px; padding:16px 18px; margin-bottom:16px; }
    .card > h2 { margin:0 0 4px; font-size:13px; letter-spacing:.18em; text-transform:uppercase; color:#d5bf93; font-weight:600; }
    .card.experimental { border-style:dashed; border-color:#5c4a6e; }
    .card.experimental h2 { color:#c6a6ef; }

    .cardtop { display:flex; align-items:center; gap:14px; justify-content:space-between; flex-wrap:wrap; }
    .check { display:flex; align-items:center; gap:10px; font-size:15px; }
    input[type=checkbox] { accent-color:#74dcda; width:22px; height:22px; margin:0; flex:none; }
    .swatchbox { display:flex; align-items:center; gap:10px; }
    canvas.mini { width:150px; height:52px; display:block; border:1px solid #2d404f; border-radius:9px; background:#070d14; }
    .swatchbox span { font-size:10.5px; letter-spacing:.1em; color:#7f97a8; max-width:92px; }

    .colors { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin:14px 0 4px; }
    .swatch { display:flex; align-items:center; gap:12px; background:#0f1a25; border:1px solid #243545;
      padding:11px 13px; border-radius:11px; font-size:13.5px; }
    .swatch .dot { width:16px; height:16px; border-radius:50%; flex:none; box-shadow:0 0 10px #0008 inset,0 0 8px currentColor; }
    .swatch small { display:block; color:#93a6b6; font:12px Consolas,ui-monospace,monospace; margin-top:3px; letter-spacing:.06em; }
    input[type=color] { padding:0; border:1px solid #35495c; border-radius:7px; background:transparent; width:52px; height:42px; flex:none; }

    .range { display:block; margin:16px 0 6px; }
    .range span { display:flex; justify-content:space-between; align-items:baseline; font-size:13.5px; color:#c6d3dd; }
    output { color:#83e6ee; font:13px Consolas,ui-monospace,monospace; background:#0c1620; border:1px solid #253748;
      border-radius:7px; padding:3px 9px; min-width:78px; text-align:right; }
    input[type=range] { display:block; width:100%; height:26px; margin:8px 0 0; accent-color:#69c9d6; background:transparent; }
    input[type=range]::-webkit-slider-runnable-track { height:8px; border-radius:6px; background:#22333f; }
    input[type=range]::-webkit-slider-thumb { -webkit-appearance:none; width:22px; height:22px; margin-top:-7px; border-radius:50%;
      background:#7fe0ea; border:2px solid #0d1620; box-shadow:0 0 10px #0008; }
    input[type=range]::-moz-range-track { height:8px; border-radius:6px; background:#22333f; }
    input[type=range]::-moz-range-thumb { width:20px; height:20px; border-radius:50%; background:#7fe0ea; border:2px solid #0d1620; }

    .field { display:block; margin:14px 0; font-size:13.5px; color:#c6d3dd; }
    select { display:block; width:100%; padding:12px; margin-top:8px; font-size:14.5px; color:#e6f1f8; background:#0f1a25;
      border:1px solid #37485c; border-radius:9px; }
    .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
    .hint { font-size:12.5px; color:#94aaba; margin:12px 0 2px; }
    .hint b { color:#c3d6e2; }
    .row { display:flex; gap:9px; margin-top:12px; flex-wrap:wrap; }
    .row button { font-size:13.5px; }
    input[type=text] { background:#0f1a25; border:1px solid #37485c; border-radius:9px; padding:12px; width:100%; color:inherit; margin-top:8px; }

    .notice { margin:4px 22px 0; padding:14px 16px; color:#a7cdd5; font-size:13px; background:#0b1620;
      border:1px solid #26374a; border-radius:11px; overflow-wrap:anywhere; }
    footer { padding:14px 22px 20px; color:#94a9b9; font-size:12.5px; }
    kbd { color:#e6eef5; background:#22344a; border:1px solid #3a5066; padding:2px 7px; border-radius:5px; font:12px Consolas,monospace; }
    .privacy { display:inline-block; margin-top:8px; padding:4px 10px; border-radius:999px; background:#132c26; border:1px solid #2e6a56; color:#93e7c9; font-size:11.5px; letter-spacing:.08em; }

    @media(max-width:700px) {
      .panel { left:10px; bottom:86px; width:calc(100vw - 20px); min-width:0; }
      .dock { left:10px; bottom:12px; } header { padding:16px; } h1 { font-size:27px; }
      .quick .presets { min-width:0; } .colors,.grid2 { grid-template-columns:1fr; }
    }
    @media(prefers-reduced-motion:reduce) { button:active { transform:none; } .toast { transition:none; } }
  `;

  function buildUI() {
    // Never allow two docks/panels: clear any leftover host from a previous injection.
    document.querySelectorAll('#mrp-lumen-local').forEach(node => node.remove());
    const host = document.createElement('div');
    host.id = 'mrp-lumen-local';
    host.style.cssText = "all:initial!important;font:15px/1.5 'Segoe UI',system-ui,sans-serif!important;color:#eef4f9!important;position:fixed!important;inset:0!important;pointer-events:none!important;z-index:2147483646!important;";
    const root = host.attachShadow({ mode: 'open' });
    const sliders = group => RANGES[group].map(([key, label]) => {
      const [min, max] = BOUNDS[key];
      const step = key === 'stripeDensity' ? 1 : (max - min) / 100 >= .01 ? .01 : .005;
      return `<label class="range"><span>${label}<output data-value="${key}"></output></span>
        <input data-key="${key}" type="range" min="${min}" max="${max}" step="${step}"></label>`;
    }).join('');
    const colorRow = keys => keys.map(key => `
      <label class="swatch"><input type="color" data-key="${key}">
      <span><i class="dot" data-dot="${key}"></i> ${COLORS[key]}<small data-color="${key}"></small></span></label>`).join('');
    const options = (map, keys) => keys.map(k => `<option value="${k}">${map[k]}</option>`).join('');

    root.innerHTML = `
      <style>${STYLE}</style>
      <button class="dock" id="dock" aria-controls="panel" aria-expanded="true" title="Open MRP settings (Shift+M)">${BADGE}<span><b>MRP</b><small id="dock-status">EFFECTS ON</small></span></button>
      <div class="toast" id="toast" role="status" aria-live="polite"></div>
      <section class="panel" id="panel" role="dialog" aria-label="MRP Lumen cosmetic settings">
        <header>${BADGE}<div class="title"><small>PERSONAL FLIGHT AESTHETICS</small><h1>MRP / LUMEN</h1>
          <p>Hull recolour, thin stripes and patterned bolts. <b>Only you see this.</b> No ECP unlock, no gameplay change.</p></div>
          <button id="close" class="close" aria-label="Close settings" title="Close (Shift+M)">&times;</button></header>

        <div class="power-wrap">
          <button id="power" class="power" aria-pressed="true"><span class="led"></span><span id="power-text">EFFECTS ON</span><small>ALT + M</small></button>
          <div class="status" id="status" role="status">Waiting for the game renderer...</div>
        </div>

        <div class="quick">
          <div class="presets">${Object.keys(BUILTINS).map(name => `<button data-preset="${name}">${name}</button>`).join('')}</div>
          <label class="check"><input type="checkbox" data-key="reduceMotion">Reduce motion</label>
        </div>

        <div class="tabs" role="tablist" aria-label="MRP sections">
          <button role="tab" data-tab="ship" aria-selected="true">Ship</button>
          <button role="tab" data-tab="laser" aria-selected="false">Lasers</button>
          <button role="tab" data-tab="presets" aria-selected="false">Presets</button>
          <button role="tab" data-tab="system" aria-selected="false">System</button>
        </div>

        <div class="tabbody">
          <section role="tabpanel" data-panel="ship">
            <div class="card">
              <div class="cardtop">
                <label class="check"><input type="checkbox" data-key="ship">Recolour my ship</label>
                <div class="swatchbox"><canvas class="mini" id="swatch-ship" aria-label="Hull colour and stripe swatch"></canvas><span>LIVE SWATCH &middot; NOT A SHIP MODEL</span></div>
              </div>
              <div class="colors">${colorRow(['hull', 'trim'])}</div>
              ${sliders('hullTone')}
              <p class="hint">The tint multiplies your <b>existing</b> hull material. No replacement ship is created, and textures, opacity and shape stay native.</p>
            </div>
            <div class="card">
              <h2>Stripes</h2>
              <label class="check" style="margin-top:10px"><input type="checkbox" data-key="stripes">Thin racing stripes</label>
              ${sliders('stripe')}
              <label class="field">Stripe direction<select data-key="stripeAxis">${options(AXES, Object.keys(AXES))}</select></label>
              <p class="hint">Stripes are painted on the game's own hull geometry each frame and removed again afterwards. Keep them subtle for an ECP-like finish.</p>
            </div>
            <div class="card experimental">
              <h2>Experimental rim</h2>
              <label class="check" style="margin-top:10px"><input type="checkbox" data-key="rimEnabled">Enable experimental rim shell (off by default)</label>
              <div class="colors">${colorRow(['rim'])}</div>
              ${sliders('rim')}
              <p class="hint">The rim is an extra additive shell around the hull. It is a visual shell only - hitboxes are untouched - but it can look heavy. Leave it off for the ECP-style look.</p>
            </div>
          </section>

          <section role="tabpanel" data-panel="laser" hidden>
            <div class="card">
              <div class="cardtop">
                <label class="check"><input type="checkbox" data-key="lasers">Style laser particles</label>
                <div class="swatchbox"><canvas class="mini" id="swatch-laser" aria-label="Laser pattern swatch"></canvas><span>LIVE SWATCH &middot; SPRITE ONLY</span></div>
              </div>
              <div class="colors">${colorRow(['shot', 'accent'])}</div>
              <div class="grid2">
                <label class="field">Bolt pattern<select data-key="pattern">${options(PATTERN_LABELS, PATTERNS)}</select></label>
                <label class="field">Apply to<select data-key="scope"><option value="own">My confirmed shots only</option><option value="visible">All rendered laser particles</option></select></label>
              </div>
              ${sliders('laser')}
              <p class="hint"><b>VISUAL ONLY:</b> every curve, zigzag and chevron is drawn inside the native particle sprite. Bullet speed, direction, range, lifetime, damage and hitboxes are never touched - nothing bends the actual flight path.</p>
              <p class="hint">Includes laser impact particles from the same pool. Rockets, missiles, mines and special weapons keep their original look.</p>
            </div>
          </section>

          <section role="tabpanel" data-panel="presets" hidden>
            <div class="card">
              <h2>Built-in looks</h2>
              <p class="hint">The highlighted look matches your current colours and pattern.</p>
              <div class="presets" style="margin-top:10px">${Object.keys(BUILTINS).map(name => `<button data-preset="${name}">${name}</button>`).join('')}</div>
            </div>
            <div class="card">
              <h2>Personal presets</h2>
              <label class="field">Preset name<input id="preset-name" type="text" maxlength="28" placeholder="My signature look" autocomplete="off"></label>
              <button id="save-preset">Save this look</button>
              <label class="field">Saved looks<select id="saved-presets"></select></label>
              <div class="row"><button id="load-preset">Apply</button><button id="delete-preset">Delete selected</button><button id="export">Export JSON</button><button id="import">Import JSON</button></div>
              <input id="import-file" type="file" accept=".json,application/json" hidden>
              <p class="hint">Stored only in this browser. Up to eight named looks. Imported JSON is validated, never executed.</p>
            </div>
          </section>

          <section role="tabpanel" data-panel="system" hidden>
            <div class="card">
              <h2>Badge &amp; maintenance</h2>
              <label class="check" style="margin-top:10px"><input type="checkbox" data-key="badge">Show my MRP emblem on the dock</label>
              <p class="hint">The MRP badge is personal artwork on your own dock. It is not an ECP badge and never appears on your public nameplate.</p>
              <div class="row"><button id="badge-download">Download SVG badge</button><button id="reconnect">Reconnect adapter</button><button id="reset">Reset look</button></div>
            </div>
            <div class="card">
              <h2>Diagnostics</h2>
              <p class="hint" id="diagnostics"></p>
              <p class="hint">One panel, one dock, four tabs - MRP never opens a second window. <span class="privacy">LOCAL ONLY &middot; NOTHING IS SENT ANYWHERE</span></p>
            </div>
          </section>
        </div>

        <p class="notice" id="notice" role="status">Changes apply live. Existing bullets keep their original look until their ownership is known.</p>
        <footer><kbd>Shift</kbd>+<kbd>M</kbd> open / close this panel &nbsp;&middot;&nbsp; <kbd>Alt</kbd>+<kbd>M</kbd> effects on / off &nbsp;&middot;&nbsp; <kbd>Esc</kbd> close.<br>
        Local-only visuals. No ECP unlocks, no network changes, no gameplay changes.</footer>
      </section>`;

    document.body.append(host);
    const $ = selector => root.querySelector(selector);
    ui = { host, root, $, panel: $('#panel'), shipSwatch: $('#swatch-ship'), laserSwatch: $('#swatch-laser'), open: true, tab: 'ship' };

    root.addEventListener('input', event => {
      const key = event.target.dataset?.key;
      if (!Object.hasOwn(DEFAULTS, key)) return;
      const value = event.target.type === 'checkbox' ? event.target.checked : BOUNDS[key] ? Number(event.target.value) : event.target.value;
      settings = sanitize({ ...settings, [key]: value });
      changed();
    });
    for (const event of ['pointerdown', 'pointerup', 'pointercancel', 'mousedown', 'mouseup', 'click', 'wheel']) {
      root.addEventListener(event, e => { if (!passPointerReleases.has(e)) e.stopPropagation(); });
    }
    root.addEventListener('keydown', event => {
      if (event.composedPath().includes(ui.panel) || ['Enter', 'Space'].includes(event.code)) event.stopPropagation();
    });
    root.addEventListener('keyup', event => {
      if (!passKeyReleases.has(event) && (event.composedPath().includes(ui.panel) || ['Enter', 'Space'].includes(event.code))) event.stopPropagation();
    });
    root.querySelectorAll('[data-preset]').forEach(button => button.addEventListener('click', () => {
      settings = sanitize({ ...DEFAULTS, ...BUILTINS[button.dataset.preset], enabled: settings.enabled, reduceMotion: settings.reduceMotion });
      changed();
      notify(`${button.dataset.preset} applied. Adjust any value to make it yours.`);
      toast(`${button.dataset.preset} look applied`);
    }));
    root.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => selectTab(button.dataset.tab)));
    $('#dock').addEventListener('click', () => panelOpen(!ui.open, true));
    $('#close').addEventListener('click', () => panelOpen(false));
    $('#power').addEventListener('click', () => toggleEffects());
    $('#reset').addEventListener('click', () => { settings = { ...DEFAULTS, reduceMotion: settings.reduceMotion }; changed(); notify('Default Aurora look restored. Saved presets kept.'); toast('Look reset'); });
    $('#reconnect').addEventListener('click', () => { detachAdapter(); suspended = false; fault = ''; installAdapter(); notify('Adapter reconnected. Fire a new shot to establish ownership.'); toast('Adapter reconnected'); });
    $('#save-preset').addEventListener('click', () => {
      const name = $('#preset-name').value.trim().slice(0, 28);
      if (!name) return notify('Give your look a name first.');
      const existing = customs.find(p => p.name === name);
      if (existing) existing.settings = { ...settings };
      else if (customs.length < 8) customs.push({ name, settings: { ...settings } });
      else return notify('Eight presets are saved. Delete one or export them first.');
      saveNow(); refreshPresetList(); $('#saved-presets').value = name; notify(`Saved: ${name}`); toast(`Saved "${name}"`);
    });
    $('#load-preset').addEventListener('click', () => {
      const p = customs.find(preset => preset.name === $('#saved-presets').value);
      if (!p) return;
      settings = sanitize(p.settings); changed(); notify(`Applied: ${p.name}`); toast(`Applied "${p.name}"`);
    });
    $('#delete-preset').addEventListener('click', () => {
      const name = $('#saved-presets').value;
      customs = customs.filter(p => p.name !== name); saveNow(); refreshPresetList(); notify('Selected saved preset removed. Current look kept.');
    });
    $('#export').addEventListener('click', () => download('mrp-lumen-presets.json', JSON.stringify({ version: 1, settings, presets: customs }, null, 2), 'application/json'));
    $('#badge-download').addEventListener('click', () => download('MRP-Lumen-badge.svg', BADGE, 'image/svg+xml'));
    $('#import').addEventListener('click', () => $('#import-file').click());
    $('#import-file').addEventListener('change', async event => {
      const file = event.target.files[0];
      event.target.value = '';
      if (!file) return;
      if (file.size > 65536) return notify('Import rejected: use an MRP JSON file smaller than 64 KB.');
      try {
        const parsed = JSON.parse(await file.text());
        if (parsed?.version !== 1 || !parsed.settings || typeof parsed.settings !== 'object' || Array.isArray(parsed.settings)) throw new Error();
        settings = sanitize(parsed.settings);
        if (Array.isArray(parsed.presets)) customs = parsed.presets.slice(0, 8).filter(p => p && typeof p.name === 'string')
          .map(p => ({ name: p.name.slice(0, 28), settings: sanitize(p.settings) }));
        saveNow(); syncUI(); refreshPresetList(); notify('Imported settings. Values were validated; no code was executed.');
      } catch { notify('Import rejected: this is not a valid MRP Lumen preset file.'); }
    });
    selectTab('ship');
    syncUI(); refreshPresetList(); startSwatches();
  }

  function selectTab(name) {
    if (!ui) return;
    ui.tab = name;
    ui.root.querySelectorAll('[data-tab]').forEach(button => button.setAttribute('aria-selected', String(button.dataset.tab === name)));
    ui.root.querySelectorAll('[data-panel]').forEach(section => { section.hidden = section.dataset.panel !== name; });
  }

  function toggleEffects(force) {
    settings.enabled = typeof force === 'boolean' ? force : !settings.enabled;
    changed();
    // Immediate visible feedback, even if the renderer is not attached yet.
    toast(settings.enabled ? 'MRP effects ON' : 'MRP effects OFF', settings.enabled ? 'on' : 'off');
    notify(settings.enabled ? 'Effects enabled. Your hull and bolts are styled again.' : 'Effects disabled. Starblast renders its original visuals.');
    drawSwatches(performance.now(), true);
  }

  function refreshPresetList() {
    if (!ui) return;
    const select = ui.$('#saved-presets');
    select.replaceChildren();
    if (!customs.length) select.add(new Option('No saved looks yet', ''));
    for (const p of customs) select.add(new Option(p.name, p.name));
    ui.$('#load-preset').disabled = ui.$('#delete-preset').disabled = !customs.length;
  }

  function presetMatches(name) {
    return Object.entries(BUILTINS[name]).every(([key, value]) => settings[key] === value);
  }

  function syncUI() {
    if (!ui) return;
    ui.root.querySelectorAll('[data-key]').forEach(input => {
      const key = input.dataset.key;
      if (input.type === 'checkbox') input.checked = settings[key]; else input.value = settings[key];
    });
    ui.root.querySelectorAll('[data-value]').forEach(output => { output.value = formatValue(output.dataset.value, settings[output.dataset.value]); });
    ui.root.querySelectorAll('[data-color]').forEach(label => { label.textContent = settings[label.dataset.color].toUpperCase(); });
    ui.root.querySelectorAll('[data-dot]').forEach(dot => { dot.style.background = settings[dot.dataset.dot]; dot.style.color = settings[dot.dataset.dot]; });
    ui.root.querySelectorAll('[data-preset]').forEach(button => button.classList.toggle('active', presetMatches(button.dataset.preset)));
    ui.$('.dock svg').style.display = settings.badge ? '' : 'none';
    ui.$('#dock-status').textContent = settings.enabled ? 'EFFECTS ON' : 'EFFECTS OFF';
    ui.$('#dock').classList.toggle('off', !settings.enabled);
    ui.$('#power-text').textContent = settings.enabled ? 'EFFECTS ON' : 'EFFECTS OFF';
    ui.$('#power').classList.toggle('off', !settings.enabled);
    ui.$('#power').setAttribute('aria-pressed', String(settings.enabled));
    updateStatus();
  }

  function notify(message) { if (ui) ui.$('#notice').textContent = message; }

  function toast(message, tone) {
    if (!ui) return;
    const element = ui.$('#toast');
    element.textContent = message;
    element.dataset.tone = tone || 'info';
    element.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => element.classList.remove('show'), 1700);
  }

  function gameFocusTarget() {
    return document.querySelector('#canvaswrapper canvas') || document.querySelector('canvas') || document.body;
  }

  function panelOpen(open, moveFocus) {
    if (!ui) return;
    if (open && document.activeElement !== ui.host) previousFocus = document.activeElement;
    ui.open = open;
    ui.panel.hidden = !open;
    ui.$('#dock').setAttribute('aria-expanded', String(open));
    if (open) {
      // Only steal focus for pointer/explicit opens; hotkey opens leave the game focused.
      if (moveFocus) ui.$('#power').focus();
      startSwatches();
    } else {
      stopSwatches();
      ui.root.activeElement?.blur();
      const back = previousFocus?.isConnected && previousFocus !== ui.host && !ui.host.contains(previousFocus) ? previousFocus : gameFocusTarget();
      try { back.focus({ preventScroll: true }); } catch { /* focus target vanished */ }
    }
  }

  function updateStatus() {
    if (!ui) return;
    const now = performance.now();
    let text = 'Waiting for a gameplay scene. Enter Training or a game when ready.';
    if (!settings.enabled) text = 'Effects off (Alt+M or the big button turns them back on). Starblast uses its original visuals.';
    else if (suspended || fault) text = fault;
    else if (now - lastDraw < 2500 && lastDraw) text = now - lastShipDraw < 2500 ? 'Renderer connected / Your hull is styled live.' : 'Renderer connected / Waiting for your visible hull.';
    else if (!installed && now - started > 12000) text = 'Adapter unavailable in this page/build. Panel works; game visuals are unchanged.';
    ui.$('#status').textContent = text;
    ui.$('#diagnostics').textContent = `MRP ${VERSION} / Three.js ${window.THREE?.REVISION || 'not exposed'} / adapter ${installed ? 'attached' : 'waiting'} / ${layers.size} scene(s) / ${ownEmissions} own shot emission(s) identified. No ownership is guessed. Updates to Starblast may require an adapter update.`;
    if (storageWarning) notify(storageWarning);
  }

  function download(name, content, type) {
    const objectURL = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement('a'); a.href = objectURL; a.download = name;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(objectURL), 2000);
  }

  /* ---------------------------------------------------- inline swatches */
  // Tiny colour chips, deliberately NOT a ship illustration and NOT a game readout.

  function startSwatches() {
    if (!ui?.open || disposed || document.hidden || swatchFrame) return;
    swatchFrame = requestAnimationFrame(swatchLoop);
  }
  function stopSwatches() {
    cancelAnimationFrame(swatchFrame);
    swatchFrame = 0;
  }
  function swatchLoop(time) {
    swatchFrame = 0;
    if (disposed || !ui?.open || document.hidden) return;
    swatchFrame = requestAnimationFrame(swatchLoop);
    if (time - lastSwatch < 40) return;
    lastSwatch = time;
    drawSwatches(time, false);
  }

  function context2d(canvas) {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(rect.width * ratio), h = Math.round(rect.height * ratio);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const c = canvas.getContext('2d');
    if (!c) return null;
    c.setTransform(ratio, 0, 0, ratio, 0, 0);
    c.clearRect(0, 0, rect.width, rect.height);
    return { c, w: rect.width, h: rect.height };
  }

  function drawSwatches(time, force) {
    if (!ui) return;
    const t = settings.reduceMotion ? 0 : (time || 0) / 1000;
    const shipVisible = force || ui.tab === 'ship';
    const laserVisible = force || ui.tab === 'laser';
    if (shipVisible) {
      const ctx = context2d(ui.shipSwatch);
      if (ctx) drawShipSwatch(ctx.c, ctx.w, ctx.h, t);
    }
    if (laserVisible) {
      const ctx = context2d(ui.laserSwatch);
      if (ctx) drawLaserSwatch(ctx.c, ctx.w, ctx.h, t);
    }
  }

  function drawShipSwatch(c, w, h, t) {
    const active = settings.enabled && settings.ship;
    const pulse = 1 + Math.sin(t * Math.PI * 2 * settings.pulse) * settings.pulseDepth;
    c.fillStyle = '#070d14'; c.fillRect(0, 0, w, h);
    const pad = 6, pw = w - pad * 2, ph = h - pad * 2;
    c.save();
    c.beginPath();
    const radius = 8;
    c.moveTo(pad + radius, pad);
    c.arcTo(pad + pw, pad, pad + pw, pad + ph, radius);
    c.arcTo(pad + pw, pad + ph, pad, pad + ph, radius);
    c.arcTo(pad, pad + ph, pad, pad, radius);
    c.arcTo(pad, pad, pad + pw, pad, radius);
    c.closePath();
    c.clip();
    const plate = c.createLinearGradient(pad, pad, pad + pw, pad + ph);
    const base = active ? settings.hull : '#8fa3b0';
    plate.addColorStop(0, base);
    plate.addColorStop(1, '#0d1a24');
    c.globalAlpha = active ? .35 + settings.tint * .65 : .45;
    c.fillStyle = plate;
    c.fillRect(pad, pad, pw, ph);
    c.globalAlpha = 1;
    if (active && settings.stripes && settings.stripeOpacity > 0) {
      const count = Math.max(1, Math.round(settings.stripeDensity));
      const cell = pw / count;
      const thickness = Math.max(1, cell * Math.min(.6, settings.stripeWidth));
      const drift = settings.reduceMotion ? 0 : (t * settings.stripeFlow * cell) % cell;
      c.fillStyle = settings.trim;
      c.globalAlpha = Math.min(1, settings.stripeOpacity * pulse);
      for (let i = -1; i <= count; i++) {
        const x = pad + i * cell + cell / 2 - thickness / 2 + drift;
        c.fillRect(x, pad, thickness, ph);
      }
      c.globalAlpha = 1;
    }
    if (active && settings.rimEnabled && settings.glow > 0) {
      c.strokeStyle = settings.rim;
      c.globalAlpha = Math.min(1, settings.glow * .7);
      c.lineWidth = 3 + settings.expansion * 30;
      c.strokeRect(pad + 1, pad + 1, pw - 2, ph - 2);
      c.globalAlpha = 1;
    }
    c.restore();
    c.strokeStyle = '#2d404f'; c.lineWidth = 1;
    c.strokeRect(.5, .5, w - 1, h - 1);
    if (!active) {
      c.fillStyle = '#8ea4b4'; c.font = '10px Consolas,monospace';
      c.fillText(settings.enabled ? 'SHIP OFF' : 'EFFECTS OFF', 10, h - 9);
    }
  }

  function drawLaserSwatch(c, w, h, t) {
    const active = settings.enabled && settings.lasers;
    c.fillStyle = '#070d14'; c.fillRect(0, 0, w, h);
    const cy = h / 2;
    const body = active ? settings.shot : '#b2e4f7';
    c.save();
    c.shadowColor = body; c.shadowBlur = 12;
    c.strokeStyle = body; c.lineWidth = 7; c.lineCap = 'round';
    c.beginPath(); c.moveTo(18, cy); c.lineTo(w - 18, cy); c.stroke();
    c.shadowBlur = 0;
    c.strokeStyle = '#ffffff'; c.globalAlpha = .35; c.lineWidth = 2;
    c.beginPath(); c.moveTo(18, cy); c.lineTo(w - 18, cy); c.stroke();
    c.globalAlpha = 1;
    c.restore();
    if (active && settings.pattern !== 'native' && settings.patternStrength > 0) {
      const phase = settings.reduceMotion ? 0 : t * settings.animation * 2;
      const amp = Math.min(h * .3, 12);
      c.save();
      c.strokeStyle = settings.accent;
      c.lineWidth = 1 + settings.bandWidth * 14;
      c.globalAlpha = Math.min(1, settings.patternStrength);
      c.lineJoin = 'round';
      c.beginPath();
      const x0 = 20, x1 = w - 20;
      if (settings.pattern === 'zigzag') {
        const step = (x1 - x0) / 8;
        for (let i = 0; i <= 8; i++) {
          const x = x0 + i * step;
          const y = cy + (i % 2 === 0 ? -amp : amp) * .55 * Math.cos(phase * .5);
          if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
        }
      } else if (settings.pattern === 'chevron') {
        const step = (x1 - x0) / 5;
        for (let i = 0; i < 5; i++) {
          const x = x0 + i * step + ((phase * 6) % step);
          c.moveTo(x, cy - amp * .6); c.lineTo(x + step * .38, cy); c.lineTo(x, cy + amp * .6);
        }
      } else if (settings.pattern === 'crescent') {
        c.moveTo(x0, cy - 4); c.bezierCurveTo((x0 + x1) / 2, cy - amp, x1, cy - 4, x1, cy);
        c.moveTo(x0, cy + 4); c.bezierCurveTo((x0 + x1) / 2, cy + amp, x1, cy + 4, x1, cy);
      } else if (settings.pattern === 'helix') {
        for (const sign of [-1, 1]) {
          for (let x = x0; x <= x1; x += 3) {
            const y = cy + sign * Math.sin((x - x0) * .16 - phase) * amp * .5;
            if (x === x0) c.moveTo(x, y); else c.lineTo(x, y);
          }
        }
      } else if (settings.pattern === 'prism') {
        const step = (x1 - x0) / 3;
        for (let i = 0; i < 3; i++) {
          const x = x0 + i * step;
          c.moveTo(x, cy); c.lineTo(x + step / 2, cy - amp * .6); c.lineTo(x + step, cy); c.lineTo(x + step / 2, cy + amp * .6); c.closePath();
        }
      } else {
        c.arc((x0 + x1) / 2, cy, 6 + Math.sin(phase) * 1.5, 0, Math.PI * 2);
      }
      c.stroke();
      c.restore();
    }
    c.strokeStyle = '#2d404f'; c.lineWidth = 1;
    c.strokeRect(.5, .5, w - 1, h - 1);
    if (!active) {
      c.fillStyle = '#8ea4b4'; c.font = '10px Consolas,monospace';
      c.fillText(settings.enabled ? 'LASERS OFF' : 'EFFECTS OFF', 10, h - 9);
    }
  }

  /* ------------------------------------------------------------ hotkeys */

  function isMKey(event) {
    // Layout tolerant: physical KeyM, the produced character, or the legacy code.
    return event.code === 'KeyM' || event.keyCode === 77 ||
      (typeof event.key === 'string' && (event.key.toLowerCase() === 'm' || event.key === '\u00b5'));
  }

  function onKey(event) {
    if (event.repeat || event.isComposing || handledKeys.has(event)) return;
    const path = event.composedPath();
    const editable = path.some(n => n instanceof HTMLElement && (n.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(n.tagName)));
    if (editable) return;
    const plain = !event.ctrlKey && !event.metaKey;
    if (plain && isMKey(event) && event.shiftKey && !event.altKey) {
      handledKeys.add(event);
      event.preventDefault(); event.stopImmediatePropagation();
      panelOpen(!ui?.open);
      toast(ui?.open ? 'MRP panel open' : 'MRP panel closed');
    } else if (plain && isMKey(event) && event.altKey && !event.shiftKey) {
      handledKeys.add(event);
      event.preventDefault(); event.stopImmediatePropagation();
      toggleEffects();
    } else if (event.code === 'Escape' && ui?.open && path.includes(ui.host)) {
      handledKeys.add(event);
      event.preventDefault(); event.stopImmediatePropagation();
      panelOpen(false);
    } else if (!path.includes(ui?.host) ||
        (path.includes(ui?.$('#dock')) && !['Enter', 'Space'].includes(event.code))) {
      heldOutsideUI.add(event.code);
    }
  }
  function onKeyUp(event) {
    if (heldOutsideUI.delete(event.code)) passKeyReleases.add(event);
  }
  function onPointerPress(event) {
    if (event.composedPath().includes(ui?.host)) return;
    if (event.type === 'mousedown') heldMouseButtons.add(event.button);
    else heldPointers.add(event.pointerId);
  }
  function onPointerRelease(event) {
    const forwarded = event.type === 'mouseup' ? heldMouseButtons.delete(event.button) : heldPointers.delete(event.pointerId);
    if (forwarded) passPointerReleases.add(event);
  }
  function onBlur() { heldOutsideUI.clear(); heldMouseButtons.clear(); heldPointers.clear(); }
  function onVisibility() {
    if (document.hidden) stopSwatches();
    else startSwatches();
  }
  function onFullscreen() {
    if (!ui) return;
    const target = document.fullscreenElement;
    if (target && target.tagName === 'CANVAS') return;
    (target || document.body).append(ui.host);
  }
  function dispose() {
    if (disposed) return;
    disposed = true; saveNow(); clearInterval(adapterTimer); stopSwatches(); clearTimeout(toastTimer);
    detachAdapter(); ui?.host.remove();
    document.querySelectorAll('#mrp-lumen-local').forEach(node => node.remove());
    ui = null;
    window.removeEventListener('keydown', onKey, true);
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('keyup', onKeyUp, true);
    for (const type of ['mousedown', 'pointerdown']) window.removeEventListener(type, onPointerPress, true);
    for (const type of ['mouseup', 'pointerup', 'pointercancel']) window.removeEventListener(type, onPointerRelease, true);
    window.removeEventListener('blur', onBlur);
    document.removeEventListener('visibilitychange', onVisibility);
    document.removeEventListener('fullscreenchange', onFullscreen);
    window.removeEventListener('pagehide', saveNow);
    if (window[KEY]?.dispose === dispose) delete window[KEY];
  }

  const adapterTimer = setInterval(() => {
    if (disposed) return;
    installAdapter();
    for (const [laser, state] of layers) if (performance.now() - state.lastSeen > 15000) { releaseLayer(state); layers.delete(laser); }
    updateStatus();
  }, 800);
  Object.defineProperty(window, KEY, { configurable: true, value: Object.freeze({ dispose, version: VERSION }) });
  window.addEventListener('keydown', onKey, true);
  // Backup listener in case another script swallows the event before the window phase.
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('keyup', onKeyUp, true);
  for (const type of ['mousedown', 'pointerdown']) window.addEventListener(type, onPointerPress, true);
  for (const type of ['mouseup', 'pointerup', 'pointercancel']) window.addEventListener(type, onPointerRelease, true);
  window.addEventListener('blur', onBlur);
  window.addEventListener('pagehide', saveNow);
  document.addEventListener('visibilitychange', onVisibility);
  document.addEventListener('fullscreenchange', onFullscreen);
  buildUI(); installAdapter();
})();
