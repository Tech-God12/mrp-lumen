// ==UserScript==
// @name         Starblast MRP Lumen - Local Cosmetics
// @namespace    local.starblast.mrp
// @version      1.0.0
// @description  Live hull colors, rim lighting, patterned laser sprites, and a personal MRP badge. Local visuals only.
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
  if (window[KEY]?.dispose) window[KEY].dispose();

  const DEFAULTS = Object.freeze({
    enabled: true, ship: true, lasers: true, badge: true,
    hull: '#65d9ff', rim: '#a18cff', shot: '#69efff', accent: '#f3aaff',
    tint: 0.62, glow: 0.75, expansion: 0.055, pulse: 0.65,
    pulseDepth: 0.18, pattern: 'crescent', shotTint: 0.75,
    patternStrength: 0.72, bandWidth: 0.08, animation: 0.8,
    scope: 'own', reduceMotion: false,
  });
  const BOUNDS = {
    tint: [0, 1], glow: [0, 1.5], expansion: [0, 0.12], pulse: [0, 2],
    pulseDepth: [0, 0.4], shotTint: [0, 1], patternStrength: [0, 1],
    bandWidth: [0.035, 0.2], animation: [0, 2],
  };
  const PATTERNS = ['native', 'plasma', 'crescent', 'helix', 'prism'];
  const BUILTINS = {
    Aurora: { hull: '#65d9ff', rim: '#a18cff', shot: '#69efff', accent: '#f3aaff', pattern: 'crescent' },
    Solar: { hull: '#ffd577', rim: '#ff844d', shot: '#ffcb69', accent: '#fff5c4', pattern: 'plasma' },
    Amethyst: { hull: '#c39bff', rim: '#f18cda', shot: '#c3a4ff', accent: '#ff96d4', pattern: 'helix' },
    Glacier: { hull: '#b5efff', rim: '#79b7ff', shot: '#b5f5ff', accent: '#ffffff', pattern: 'prism' },
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
      } else if (['hull', 'rim', 'shot', 'accent'].includes(key) && typeof item === 'string' && /^#[\da-f]{6}$/i.test(item)) {
        output[key] = item;
      } else if (key === 'pattern' && PATTERNS.includes(item)) output[key] = item;
      else if (key === 'scope' && ['own', 'visible'].includes(item)) output[key] = item;
    }
    return output;
  }

  let stored;
  let storageWarning = '';
  try { stored = JSON.parse(localStorage.getItem(STORAGE) || 'null'); } catch { stored = null; }
  let settings = sanitize(stored?.settings);
  if (!stored && window.matchMedia('(prefers-reduced-motion: reduce)').matches) settings.reduceMotion = true;
  let customs = Array.isArray(stored?.presets) ? stored.presets.slice(0, 8)
    .filter(p => p && typeof p.name === 'string')
    .map(p => ({ name: p.name.slice(0, 28), settings: sanitize(p.settings) })) : [];

  let disposed = false;
  let suspended = false;
  let fault = '';
  let installed = null;
  let saveTimer = 0;
  let ui = null;
  let previewFrame = 0;
  let lastPreview = 0;
  let lastDraw = 0;
  let lastShipDraw = 0;
  let ownEmissions = 0;
  const started = performance.now();
  const layers = new Map();
  const renderers = new Map();
  const heldOutsideUI = new Set();
  const passKeyReleases = new WeakSet();
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
      float detail = 0.0;
      if (mrpPattern > .5 && mrpPattern < 1.5) {
        detail = exp(-dot(q,q)*5.0) * (.8+.2*cos(mrpClock*3.0));
      } else if (mrpPattern < 2.5 && mrpPattern > 1.5) {
        float arcA = abs(length(q-vec2(.0,.24))-.54);
        float arcB = abs(length(q+vec2(.0,.24))-.54);
        detail = (1.0-smoothstep(mrpWidth,mrpWidth+.08,min(arcA,arcB))) * (1.0-smoothstep(.15,1.0,abs(q.x)));
      } else if (mrpPattern < 3.5 && mrpPattern > 2.5) {
        float wave = sin(q.x*6.5-mrpClock*3.0)*.32;
        float thread = min(abs(q.y-wave),abs(q.y+wave));
        detail = 1.0-smoothstep(mrpWidth,mrpWidth+.08,thread);
      } else if (mrpPattern > 3.5) {
        float diamond = abs(abs(q.x)+abs(q.y)-.6);
        detail = 1.0-smoothstep(mrpWidth,mrpWidth+.08,diamond);
      }
      vec3 tint = mix(vec3(1.0),mrpShotColor*1.45+.15,mrpTint);
      vec3 decorative = mrpAccentColor*detail*mrpStrength*nativePixel.a*.8;
      // Native alpha, point size, depth, position and lifetime are not changed.
      gl_FragColor = vec4(nativePixel.rgb*tint+decorative,nativePixel.a);
    }
  `;

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
    r.tintMaterial.dispose();
    r.glowMaterial.dispose();
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
      const glowMesh = new T.Mesh(hull.geometry, glowMaterial);
      r = { hull, geometry: hull.geometry, source: nativeMaterial, tintMaterial, glowMaterial, glowMesh,
        color: new T.Color(), white: new T.Color(0xffffff), key: materialKey(nativeMaterial), glowReady: null };
      state.hullResources = r;
    }
    r.tintMaterial.copy(nativeMaterial);
    const nextKey = materialKey(nativeMaterial);
    if (r.key !== nextKey) {
      r.tintMaterial.needsUpdate = true;
      r.key = nextKey;
    }
    r.color.set(settings.hull);
    r.color.lerp(r.white, 1 - settings.tint);
    r.tintMaterial.color.multiply(r.color);
    const pulse = 1 + Math.sin(clock() * Math.PI * 2 * settings.pulse) * settings.pulseDepth;
    const glow = settings.glow * pulse;
    if (r.tintMaterial.emissive) r.tintMaterial.emissive.lerp(r.color.set(settings.rim), Math.min(.55, glow * .25));
    r.glowMaterial.uniforms.mrpRim.value.set(settings.rim);
    r.glowMaterial.uniforms.mrpGlow.value = glow * Math.max(0, Math.min(1, nativeMaterial.opacity));
    r.glowMaterial.uniforms.mrpExpansion.value = settings.expansion;
    hull.material = r.tintMaterial;
    restore.push(() => { if (hull.material === r.tintMaterial) hull.material = nativeMaterial; });
    if (r.glowReady === null) r.glowReady = compileEffect(state, r.glowMaterial, hull.geometry, 'mesh');
    if (glow > 0 && settings.expansion > 0 && r.glowReady) {
      hull.add(r.glowMesh);
      restore.push(() => hull.remove(r.glowMesh));
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
            s.hullResources.glowMaterial.needsUpdate = true;
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

  const COLORS = [['hull', 'Hull finish'], ['rim', 'Rim lighting'], ['shot', 'Laser body'], ['accent', 'Laser detail']];
  const RANGES = {
    ship: [['tint', 'Hull tint', 0, 1, .01], ['glow', 'Rim brightness', 0, 1.5, .01], ['expansion', 'Rim spread', 0, .12, .005], ['pulse', 'Pulse speed', 0, 2, .05], ['pulseDepth', 'Pulse amount', 0, .4, .01]],
    laser: [['shotTint', 'Laser tint', 0, 1, .01], ['patternStrength', 'Detail intensity', 0, 1, .01], ['bandWidth', 'Detail width', .035, .2, .005], ['animation', 'Pattern motion', 0, 2, .05]],
  };

  function buildUI() {
    const host = document.createElement('div');
    host.id = 'mrp-lumen-local';
    host.style.cssText = "all:initial!important;font:14px/1.45 'Segoe UI',system-ui,sans-serif!important;color:#edf2f6!important;position:fixed!important;inset:0!important;pointer-events:none!important;z-index:2147483646!important;";
    const root = host.attachShadow({ mode: 'open' });
    const sliders = group => RANGES[group].map(([key, label, min, max, step]) => `
      <label class="range"><span>${label}<output data-value="${key}"></output></span>
      <input data-key="${key}" type="range" min="${min}" max="${max}" step="${step}"></label>`).join('');
    const color = keys => COLORS.filter(([key]) => keys.includes(key)).map(([key, label]) => `
      <label class="swatch"><input type="color" data-key="${key}"><span>${label}<small data-color="${key}"></small></span></label>`).join('');
    root.innerHTML = `
      <style>
        :host { font:14px/1.45 'Segoe UI',system-ui,sans-serif; color:#edf2f6; }
        * { box-sizing:border-box; } [hidden] { display:none!important; }
        button,input,select { font:inherit; } button,select,input[type=checkbox],input[type=color] { cursor:pointer; }
        button { color:inherit; border:1px solid #354454; background:#182330; border-radius:8px; padding:9px 12px; }
        button:hover { background:#243547; border-color:#76cada; } button:active { transform:translateY(1px); }
        button:focus-visible,input:focus-visible,select:focus-visible { outline:2px solid #7ce4f1; outline-offset:3px; }
        .dock { pointer-events:auto; position:absolute; bottom:18px; left:18px; display:flex; align-items:center; gap:10px;
          padding:7px 14px 7px 6px; background:#101924; box-shadow:0 5px 20px #0009; border-color:#a98853; }
        .dock svg { width:35px; height:35px; } .dock b { letter-spacing:.18em; } .dock small { display:block; color:#7bd6c6; font-size:10px; letter-spacing:.08em; }
        .panel { pointer-events:auto; position:absolute; left:18px; bottom:82px; width:440px; max-width:calc(100vw - 24px);
          max-height:calc(100vh - 106px); overflow:auto; background:#101822; border:1px solid #405566; border-radius:15px;
          box-shadow:0 22px 70px #000b; scrollbar-width:thin; scrollbar-color:#405566 #101822; }
        header { display:flex; align-items:center; gap:12px; padding:18px 18px 13px; border-bottom:1px solid #293746;
          background:linear-gradient(125deg,#1b2a37,#111a23); }
        header svg { width:64px; height:64px; flex:none; } header div { flex:1; } header small { color:#d6bb82; letter-spacing:.24em; font-size:10px; }
        h1 { font-size:27px; letter-spacing:.06em; margin:0; line-height:1.15; font-weight:600; } header p { font-size:11px; color:#91a8b9; margin:5px 0 0; }
        .close { align-self:flex-start; font-size:20px; padding:0 8px; background:transparent; border-color:transparent; }
        .status { padding:11px 18px; background:#0c131c; border-bottom:1px solid #273340; color:#a9c6d0; font-size:12px; }
        .preview { position:relative; height:135px; margin:14px 18px 9px; border:1px solid #2d404f; border-radius:9px; overflow:hidden;
          background:radial-gradient(ellipse at center,#19313e,#0b111a); }
        canvas { width:100%; height:100%; display:block; } .preview span { position:absolute; bottom:7px; left:10px; color:#8aa3b1; font-size:10px; letter-spacing:.12em; }
        .master { display:flex; flex-wrap:wrap; gap:16px; padding:8px 18px 14px; } .check { display:flex; align-items:center; gap:8px; }
        input[type=checkbox] { accent-color:#74dcda; width:17px; height:17px; margin:0; }
        .presets { display:grid; grid-template-columns:repeat(4,1fr); gap:6px; padding:0 18px 14px; } .presets button { padding:8px 2px; font-size:12px; }
        details { border-top:1px solid #2b3946; padding:0 18px 13px; } summary { cursor:pointer; padding:14px 0 4px; letter-spacing:.08em; text-transform:uppercase; font-size:12px; color:#d5bf93; }
        .colors { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin:12px 0; }
        .swatch { display:flex; align-items:center; gap:9px; background:#172331; padding:10px; border-radius:8px; font-size:12px; }
        .swatch small { display:block; color:#93a6b6; font:11px Consolas,monospace; margin-top:3px; }
        input[type=color] { padding:0; border:0; border-radius:4px; background:transparent; width:30px; height:34px; flex:none; }
        .range { display:block; margin:13px 0 4px; } .range span { display:flex; justify-content:space-between; font-size:12px; color:#bfcbd5; }
        output { color:#76dbe3; font:12px Consolas,monospace; } input[type=range] { display:block; width:100%; margin:9px 0; accent-color:#69c9d6; }
        .field { display:block; margin:12px 0; font-size:12px; color:#bfcbd5; } select { display:block; width:100%; padding:9px; margin-top:6px; color:#e1edf4; background:#172331; border:1px solid #374b5c; border-radius:7px; }
        .hint { font-size:11px; color:#8ea4b4; margin:10px 0 2px; } .row { display:flex; gap:7px; margin-top:10px; flex-wrap:wrap; }
        .row button { font-size:12px; } input[type=text] { background:#172331; border:1px solid #374b5c; border-radius:7px; padding:9px; width:100%; color:inherit; }
        .notice { margin:0; padding:12px 18px; color:#a7cdd5; font-size:12px; border-top:1px solid #273340; overflow-wrap:anywhere; }
        footer { padding:0 18px 16px; color:#91a6b6; font-size:11px; } kbd { color:#d8e2eb; background:#223243; padding:2px 4px; border-radius:3px; }
        @media(max-width:500px) { .panel { left:12px; bottom:78px; } .dock { left:12px; bottom:12px; } header { padding:14px; } h1 { font-size:24px; } }
        @media(prefers-reduced-motion:reduce) { button:active { transform:none; } }
      </style>
      <button class="dock" id="dock" aria-controls="panel" aria-expanded="true" title="Open MRP settings (Shift+M)">${BADGE}<span><b>MRP</b><small id="dock-status">LOCAL COSMETICS</small></span></button>
      <section class="panel" id="panel" role="dialog" aria-label="MRP Lumen cosmetic settings">
        <header>${BADGE}<div><small>PERSONAL FLIGHT AESTHETICS</small><h1>MRP / LUMEN</h1><p>Your look. Your browser. No account required.</p></div><button id="close" class="close" aria-label="Close settings">&times;</button></header>
        <div class="status" id="status" role="status">Waiting for the game renderer...</div>
        <div class="preview"><canvas id="preview" aria-label="Illustrative cosmetic preview"></canvas><span>STYLE PREVIEW / NOT THE GAME CAMERA</span></div>
        <div class="master"><label class="check"><input type="checkbox" data-key="enabled">Effects on</label><label class="check"><input type="checkbox" data-key="reduceMotion">Reduce motion</label></div>
        <div class="presets">${Object.keys(BUILTINS).map(name => `<button data-preset="${name}">${name}</button>`).join('')}</div>
        <details open><summary>01 / Hull &amp; lighting</summary>
          <label class="check" style="margin-top:12px"><input type="checkbox" data-key="ship">Customize my ship</label>
          <div class="colors">${color(['hull', 'rim'])}</div>${sliders('ship')}
          <p class="hint">Follows the actual hull through upgrades. Special ship materials may be left unchanged.</p>
        </details>
        <details open><summary>02 / Laser design</summary>
          <label class="check" style="margin-top:12px"><input type="checkbox" data-key="lasers">Style laser particles</label>
          <div class="colors">${color(['shot', 'accent'])}</div>
          <label class="field">Pattern<select data-key="pattern"><option value="native">Original + tint</option><option value="plasma">Plasma core</option><option value="crescent">Twin crescents</option><option value="helix">Helix filaments</option><option value="prism">Prism cut</option></select></label>
          <label class="field">Apply to<select data-key="scope"><option value="own">My confirmed shots only</option><option value="visible">All rendered laser particles</option></select></label>
          ${sliders('laser')}<p class="hint">Curves are patterns inside native laser sprites, not changed flight paths. Includes laser impact particles. Rockets, missiles, damage and hitboxes stay original.</p>
        </details>
        <details><summary>03 / Personal presets</summary>
          <label class="field">Preset name<input id="preset-name" type="text" maxlength="28" placeholder="My signature look" autocomplete="off"></label>
          <button id="save-preset">Save this look</button>
          <label class="field">Saved looks<select id="saved-presets"></select></label>
          <div class="row"><button id="load-preset">Apply</button><button id="delete-preset">Delete selected</button><button id="export">Export JSON</button><button id="import">Import JSON</button></div>
          <input id="import-file" type="file" accept=".json,application/json" hidden>
          <p class="hint">Stored only in this browser. Up to eight named looks. Export for another device.</p>
        </details>
        <details><summary>04 / Badge &amp; compatibility</summary>
          <label class="check" style="margin-top:12px"><input type="checkbox" data-key="badge">Show my MRP emblem on the dock</label>
          <p class="hint">The original MRP badge is personal artwork, not an ECP badge or a public nameplate.</p>
          <div class="row"><button id="badge-download">Download SVG badge</button><button id="reconnect">Reconnect adapter</button><button id="reset">Reset look</button></div>
          <p class="hint" id="diagnostics"></p>
        </details>
        <p class="notice" id="notice" role="status">Changes apply live. Existing bullets are left original until their ownership is known.</p>
        <footer><kbd>Shift</kbd> + <kbd>M</kbd> settings &nbsp; <kbd>Alt</kbd> + <kbd>M</kbd> effects.<br>Local-only visuals. No ECP unlocks, network changes, or gameplay changes.</footer>
      </section>`;
    document.body.append(host);
    const $ = selector => root.querySelector(selector);
    ui = { host, root, $, panel: $('#panel'), canvas: $('#preview'), open: true };
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
    }));
    $('#dock').addEventListener('click', () => panelOpen(!ui.open));
    $('#close').addEventListener('click', () => panelOpen(false));
    $('#reset').addEventListener('click', () => { settings = { ...DEFAULTS, reduceMotion: settings.reduceMotion }; changed(); notify('Default Aurora look restored. Saved presets kept.'); });
    $('#reconnect').addEventListener('click', () => { detachAdapter(); suspended = false; fault = ''; installAdapter(); notify('Adapter reconnected. Fire a new shot to establish ownership.'); });
    $('#save-preset').addEventListener('click', () => {
      const name = $('#preset-name').value.trim().slice(0, 28);
      if (!name) return notify('Give your look a name first.');
      const existing = customs.find(p => p.name === name);
      if (existing) existing.settings = { ...settings };
      else if (customs.length < 8) customs.push({ name, settings: { ...settings } });
      else return notify('Eight presets are saved. Delete one or export them first.');
      saveNow(); refreshPresetList(); $('#saved-presets').value = name; notify(`Saved: ${name}`);
    });
    $('#load-preset').addEventListener('click', () => {
      const p = customs.find(preset => preset.name === $('#saved-presets').value);
      if (!p) return;
      settings = sanitize(p.settings); changed(); notify(`Applied: ${p.name}`);
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
    syncUI(); refreshPresetList(); previewFrame = requestAnimationFrame(preview);
  }

  function refreshPresetList() {
    if (!ui) return;
    const select = ui.$('#saved-presets');
    select.replaceChildren();
    if (!customs.length) select.add(new Option('No saved looks yet', ''));
    for (const p of customs) select.add(new Option(p.name, p.name));
    ui.$('#load-preset').disabled = ui.$('#delete-preset').disabled = !customs.length;
  }
  function syncUI() {
    if (!ui) return;
    ui.root.querySelectorAll('[data-key]').forEach(input => {
      const key = input.dataset.key;
      if (input.type === 'checkbox') input.checked = settings[key]; else input.value = settings[key];
    });
    ui.root.querySelectorAll('[data-value]').forEach(output => { output.value = String(Number(settings[output.dataset.value].toFixed(3))); });
    ui.root.querySelectorAll('[data-color]').forEach(label => { label.textContent = settings[label.dataset.color].toUpperCase(); });
    ui.$('.dock svg').style.display = settings.badge ? '' : 'none';
    ui.$('#dock-status').textContent = settings.enabled ? 'LOCAL COSMETICS' : 'EFFECTS OFF';
    updateStatus();
  }
  function notify(message) { if (ui) ui.$('#notice').textContent = message; }
  function panelOpen(open) {
    if (!ui) return;
    if (open && document.activeElement !== ui.host) previousFocus = document.activeElement;
    ui.open = open;
    ui.panel.hidden = !open;
    ui.$('#dock').setAttribute('aria-expanded', String(open));
    if (open) { ui.$('#close').focus(); if (!previewFrame) previewFrame = requestAnimationFrame(preview); }
    else {
      cancelAnimationFrame(previewFrame); previewFrame = 0;
      ui.root.activeElement?.blur();
      if (previousFocus?.isConnected && previousFocus !== ui.host) previousFocus.focus({ preventScroll: true });
    }
  }
  function updateStatus() {
    if (!ui) return;
    const now = performance.now();
    let text = 'Waiting for a gameplay scene. Enter Training or a game when ready.';
    if (!settings.enabled) text = 'Effects off. Starblast uses its original visuals.';
    else if (suspended || fault) text = fault;
    else if (now - lastDraw < 2500 && lastDraw) text = now - lastShipDraw < 2500 ? 'Renderer connected / Your hull is styled live.' : 'Renderer connected / Waiting for your visible hull.';
    else if (!installed && now - started > 12000) text = 'Adapter unavailable in this page/build. Preview works; game visuals are unchanged.';
    ui.$('#status').textContent = text;
    ui.$('#diagnostics').textContent = `Three.js ${window.THREE?.REVISION || 'not exposed'} / adapter ${installed ? 'attached' : 'waiting'} / ${layers.size} scene(s) / ${ownEmissions} own shot emission(s) identified. No ownership is guessed. Updates to Starblast may require an adapter update.`;
    if (storageWarning) notify(storageWarning);
  }
  function download(name, content, type) {
    const objectURL = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement('a'); a.href = objectURL; a.download = name;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(objectURL), 2000);
  }

  function preview(time) {
    previewFrame = 0;
    if (disposed || !ui?.open || document.hidden) return;
    previewFrame = requestAnimationFrame(preview);
    if (time - lastPreview < 33) return;
    lastPreview = time;
    const canvas = ui.canvas;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.round(rect.width * ratio), h = Math.round(rect.height * ratio);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const c = canvas.getContext('2d');
    if (!c) return;
    c.setTransform(ratio, 0, 0, ratio, 0, 0); c.clearRect(0, 0, rect.width, rect.height);
    const t = settings.reduceMotion ? 0 : time / 1000;
    const active = settings.enabled;
    c.strokeStyle = '#54809622'; c.lineWidth = 1;
    for (let x = 0; x < rect.width; x += 26) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, rect.height); c.stroke(); }
    for (let y = 0; y < rect.height; y += 26) { c.beginPath(); c.moveTo(0, y); c.lineTo(rect.width, y); c.stroke(); }
    c.save(); c.translate(rect.width * .23, rect.height * .48); c.rotate(-.12);
    c.shadowColor = active && settings.ship ? settings.rim : '#7592aa';
    c.shadowBlur = active && settings.ship ? settings.glow * 16 : 0;
    c.beginPath(); c.moveTo(43, 0); c.lineTo(-21, -30); c.lineTo(-10, -9); c.lineTo(-35, -16);
    c.lineTo(-24, 0); c.lineTo(-35, 16); c.lineTo(-10, 9); c.lineTo(-21, 30); c.closePath();
    c.fillStyle = active && settings.ship ? settings.hull : '#b2cad5'; c.fill();
    c.strokeStyle = active && settings.ship ? settings.rim : '#dce7ee'; c.stroke(); c.shadowBlur = 0;
    c.beginPath(); c.moveTo(20, 0); c.lineTo(-13, -7); c.lineTo(-5, 0); c.lineTo(-13, 7); c.closePath(); c.fillStyle = '#183247'; c.fill(); c.restore();
    for (let i = 0; i < 4; i++) {
      const fraction = (t * .27 + i / 4) % 1;
      c.save(); c.translate(rect.width * .42 + fraction * rect.width * .5, rect.height * .48);
      c.shadowColor = active && settings.lasers ? settings.shot : '#b2e4f7'; c.shadowBlur = 8;
      c.strokeStyle = c.shadowColor; c.lineWidth = 2.5;
      c.beginPath(); c.moveTo(-10, 0); c.lineTo(8, 0); c.stroke();
      if (active && settings.lasers && settings.pattern !== 'native') {
        c.strokeStyle = settings.accent; c.lineWidth = 1 + settings.bandWidth * 8;
        c.globalAlpha = settings.patternStrength; c.beginPath();
        if (settings.pattern === 'helix') {
          for (const sign of [-1, 1]) {
            for (let x = -12; x <= 12; x++) { const y = sign * Math.sin(x * .25 - t * settings.animation * 3) * 4; if (x === -12) c.moveTo(x, y); else c.lineTo(x, y); }
          }
        } else if (settings.pattern === 'crescent') {
          c.moveTo(-10, -3); c.bezierCurveTo(6, -11, 13, -1, 0, 4); c.moveTo(-10, 3); c.bezierCurveTo(6, 11, 13, 1, 0, -4);
        } else if (settings.pattern === 'prism') { c.moveTo(-10, 0); c.lineTo(0, -7); c.lineTo(10, 0); c.lineTo(0, 7); c.closePath(); }
        else c.arc(0, 0, 5, 0, Math.PI * 2);
        c.stroke();
      }
      c.restore();
    }
  }

  function onKey(event) {
    if (event.repeat || event.isComposing || event.ctrlKey || event.metaKey) return;
    const editable = event.composedPath().some(n => n instanceof HTMLElement && (n.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(n.tagName)));
    if (editable) return;
    if (event.code === 'KeyM' && event.shiftKey && !event.altKey) {
      event.preventDefault(); event.stopImmediatePropagation(); panelOpen(!ui?.open);
    } else if (event.code === 'KeyM' && event.altKey && !event.shiftKey) {
      event.preventDefault(); event.stopImmediatePropagation(); settings.enabled = !settings.enabled; changed();
    } else if (event.code === 'Escape' && ui?.open && event.composedPath().includes(ui.host)) {
      event.preventDefault(); event.stopImmediatePropagation(); panelOpen(false);
    } else if (!event.composedPath().includes(ui?.host) ||
        (event.composedPath().includes(ui?.$('#dock')) && !['Enter', 'Space'].includes(event.code))) {
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
    if (document.hidden) { cancelAnimationFrame(previewFrame); previewFrame = 0; }
    else if (ui?.open && !previewFrame) previewFrame = requestAnimationFrame(preview);
  }
  function onFullscreen() {
    if (!ui) return;
    const target = document.fullscreenElement;
    if (target && target.tagName === 'CANVAS') return;
    (target || document.body).append(ui.host);
  }
  function dispose() {
    if (disposed) return;
    disposed = true; saveNow(); clearInterval(adapterTimer); cancelAnimationFrame(previewFrame);
    detachAdapter(); ui?.host.remove();
    window.removeEventListener('keydown', onKey, true);
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
  Object.defineProperty(window, KEY, { configurable: true, value: Object.freeze({ dispose, version: '1.0.0' }) });
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('keyup', onKeyUp, true);
  for (const type of ['mousedown', 'pointerdown']) window.addEventListener(type, onPointerPress, true);
  for (const type of ['mouseup', 'pointerup', 'pointercancel']) window.addEventListener(type, onPointerRelease, true);
  window.addEventListener('blur', onBlur);
  window.addEventListener('pagehide', saveNow);
  document.addEventListener('visibilitychange', onVisibility);
  document.addEventListener('fullscreenchange', onFullscreen);
  buildUI(); installAdapter();
})();
