import { Engine } from './engine.js';
import {
  SCHEMA, SPECS, DEFAULTS, PRESETS, PRESET_KEYS, PALETTES, SHAPES, LAYOUTS, ABSORB, COLOR_BY,
  presetParams, randomParams,
} from './params.js';
import { Director } from './director.js';
import { Panel, toast } from './ui.js';

const G = 0.35; // gravitational constant in lab units (screen height ≈ 2.2)
const TAU = Math.PI * 2;
const FIRST_PRESET = 'wormhole';

const indexOf = (list) => Object.fromEntries(list.map((o, i) => [o.value, i]));
const SHAPE_INDEX = indexOf(SHAPES);
const LAYOUT_INDEX = indexOf(LAYOUTS);
const ABSORB_INDEX = indexOf(ABSORB);
const COLOR_INDEX = indexOf(COLOR_BY);

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const hexToLinear = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => srgbToLinear(v / 255));
};
const PALETTE_LINEAR = Object.fromEntries(
  Object.entries(PALETTES).map(([name, p]) => [name, p.stops.map(hexToLinear)]),
);
const mixWhite = (c, t) => c.map((v) => v + (1 - v) * t);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const kfmt = SPECS.count.fmt;

const canvas = document.getElementById('stage');
let engine;
try {
  engine = new Engine(canvas);
} catch (err) {
  fail(err);
  throw err;
}

// ---------------------------------------------------------------- state

const fromHash = readHash();
let presetName = fromHash.preset ?? (Object.keys(fromHash.params).length ? null : FIRST_PRESET);
const params = { ...(presetName ? presetParams(presetName) : DEFAULTS), ...fromHash.params };
let layoutSeed = fromHash.seed ?? 1;

const director = new Director();
const mouse = { active: false, x: 0, y: 0, sign: 1 };
let paused = false;
let needsReform = true;
let viewDirty = false;
let captureNext = false;
let simTime = 0;
let dancePhase = 0;
let hueTime = 0;
let yaw = 0;
let pixelRatio = 1;

const panel = new Panel({
  schema: SCHEMA,
  specs: SPECS,
  defaults: DEFAULTS,
  presets: PRESETS,
  params,
  onChange,
  onPreset: applyPreset,
  onAction: act,
});
panel.setPreset(presetName);
if (presetName && PRESETS[presetName].cycle) panel.setActive('cycle', director.startCycle(true));

engine.setCount(params.count);
resize();

// ---------------------------------------------------------------- physics inputs

function attractorData(gravity) {
  const n = params.attractors;
  const A = new Float32Array(32);
  const V = new Float32Array(32);
  const swirlScale = 1 / Math.sqrt(Math.max(1, gravity)); // collapsing: swirl lets go, light falls in
  for (let i = 0; i < n; i++) {
    const a = Math.PI / 2 + (TAU * i) / n + dancePhase;
    const x = params.separation * Math.cos(a);
    const y = params.separation * Math.sin(a);
    const sign = params.polarity === 'repel' || (params.polarity === 'alternate' && i % 2) ? -1 : 1;
    const spin = params.counterSpin && i % 2 ? -1 : 1;
    A.set([x, y, G * params.mass * sign * gravity, params.swirl * spin * swirlScale], i * 4);
    V.set([-y * params.dance, x * params.dance, 0, 0], i * 4);
  }
  return { A, V, n };
}

function simUniforms(att, dt, burst) {
  const attractive = params.polarity === 'repel' ? 0 : params.polarity === 'alternate' ? Math.ceil(params.attractors / 2) : params.attractors;
  return {
    uReset: 0,
    uDt: dt,
    uTime: simTime,
    uNA: att.n,
    uA: att.A,
    uAV: att.V,
    uMouse: mouse.active ? [mouse.x, mouse.y, mouse.sign * G * Math.max(0.6, params.mass) * 2.5, 0] : [0, 0, 0, 0],
    uHorizon: params.horizon,
    uSoft2: params.softening ** 2,
    uAffinity: params.affinity,
    uGrip: 1.5 * Math.min(1, Math.abs(params.swirl) * 3),
    uAbsorb: ABSORB_INDEX[params.absorb],
    uTurb: params.turbulence,
    uNoiseScale: params.noiseScale,
    uDrag: params.drag,
    uMaxSpeed: 7,
    uBound: 5,
    uLife: params.lifespan,
    uBurst: burst,
    uJet: params.burst,
    // formation
    uShape: SHAPE_INDEX[params.shape],
    uShapes: params.shapes,
    uLayout: LAYOUT_INDEX[params.layout],
    uLayoutSeed: layoutSeed >>> 0,
    uSpacing: params.spacing,
    uShapeSize: params.shapeSize,
    uScatter: params.scatter,
    uOrbit: params.orbit,
    uTwist: params.twist,
    uGM: G * params.mass * Math.max(1, attractive),
    uGM1: G * params.mass,
    uEps2: params.softening ** 2 + (params.attractors > 1 ? 0.5 * params.separation ** 2 : 0),
  };
}

// Mirrors heightAt() in the shaders, so the camera can aim partway down the well.
function wellDepthAtCentre() {
  const n = params.attractors;
  let h = 0;
  for (let i = 0; i < n; i++) {
    const sign = params.polarity === 'repel' || (params.polarity === 'alternate' && i % 2) ? -1 : 1;
    h -= (G * params.mass * sign) / Math.sqrt(params.separation ** 2 + 0.03);
  }
  return h * params.well * 0.16;
}

function reform() {
  dancePhase = 0;
  engine.step({ ...simUniforms(attractorData(1), 0, 0), uReset: 1 });
  engine.clearLight();
}

function renderInputs(att, ev, dt, accumulate) {
  const pal = PALETTE_LINEAR[params.palette];
  const families = params.shape === 'taiji' ? params.shapes * 2 : params.shapes;
  const trailGain = (1 - params.trails) ** 0.3;
  const countGain = Math.sqrt(200000 / params.count);
  const voids = params.core === 'void';
  return {
    accumulate,
    decay: paused ? 0 : params.trails ** (dt * 60),
    attractorCount: att.n,
    attractors: att.A,
    well: params.well,
    horizon: params.horizon,
    core: params.core,
    coreColor: voids ? mixWhite(pal[3], 0.45) : mixWhite(pal[4], 0.35),
    coreGlow: params.brightness * (voids ? 0.9 : 1.2) * Math.min(3, Math.sqrt(Math.max(0.2, ev.gravity))),
    haloSpread: params.haloSpread,
    particles: {
      uSize: params.size * pixelRatio,
      uIntensity: params.brightness * 0.18 * countGain * trailGain,
      uPal: pal.flat(),
      uColorBy: COLOR_INDEX[params.colorBy],
      uSpeedRef: 0.3 + Math.sqrt(params.mass * Math.max(1, params.attractors)),
      uFamilies: families,
      uShapeLo: PALETTES[params.palette].lo,
      uHue: hueTime,
      uWhiteHot: params.whiteHot,
      uLife: params.lifespan,
    },
    composite: {
      uBloomStrength: params.halo * 0.18,
      uExposure: params.exposure,
      uWhite: ev.white,
      uDark: ev.dark,
      uVignette: params.vignette,
      uTime: simTime,
      uBg: pal[1].map((v) => v * 0.004),
    },
  };
}

// ---------------------------------------------------------------- loop

let last = performance.now();
let fpsAvg = 60;
let statsAt = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = clamp((now - last) / 1000, 0, 0.05);
  last = now;
  resize();

  const ev = director.update(paused ? 0 : dt);
  if (ev.reset || needsReform) {
    reform();
    needsReform = false;
  }

  const sdt = paused ? 0 : dt * params.timeScale;
  dancePhase += params.dance * sdt;
  hueTime += params.hueDrift * 0.08 * sdt;
  if (!paused) yaw += params.autoRotate * 0.25 * dt;
  engine.camera.update({
    aspect: canvas.width / canvas.height,
    tilt: (params.tilt * Math.PI) / 180,
    yaw,
    zoom: params.zoom,
    targetZ: 0.4 * wellDepthAtCentre(),
  });

  const att = attractorData(ev.gravity);
  if (sdt > 0 || ev.burst) {
    const steps = clamp(Math.ceil(sdt / (1 / 100)), 1, 4);
    for (let i = 0; i < steps; i++) {
      engine.step(simUniforms(att, sdt / steps, ev.burst && i === 0 ? params.burst : 0));
      simTime += sdt / steps;
    }
  }

  engine.render(renderInputs(att, ev, dt, !paused || viewDirty));
  viewDirty = false;

  if (captureNext) {
    captureNext = false;
    canvas.toBlob((blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `twirling-lights-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    });
  }

  if (dt > 0) fpsAvg += (1 / dt - fpsAvg) * 0.05;
  if (now - statsAt > 500) {
    statsAt = now;
    const state = paused ? ' · paused' : ev.collapsing ? ' · collapsing' : '';
    panel.setStats(`${Math.round(fpsAvg)} fps · ${kfmt(params.count)} particles${state}`);
  }
}

function resize() {
  pixelRatio = Math.min(window.devicePixelRatio || 1, 2) * params.resolution;
  const w = Math.max(1, Math.round(canvas.clientWidth * pixelRatio));
  const h = Math.max(1, Math.round(canvas.clientHeight * pixelRatio));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
    viewDirty = true;
  }
  engine.resize(w, h);
}

// ---------------------------------------------------------------- params & presets

function onChange(key, value) {
  params[key] = value;
  const spec = SPECS[key];
  if (spec.rebuild) {
    engine.setCount(value);
    needsReform = true;
  } else if (spec.reset) {
    needsReform = true;
  }
  viewDirty = true;
  writeHashSoon();
}

function replaceParams(next, name) {
  presetName = name;
  Object.assign(params, next);
  engine.setCount(params.count);
  panel.set(params);
  panel.setPreset(name);
  director.collapse = director.whiteHold = director.darkHold = false;
  ['collapse', 'white', 'dark'].forEach((a) => panel.setActive(a, false));
  panel.setActive('cycle', director.startCycle(!!(name && PRESETS[name].cycle)));
  needsReform = true;
  writeHashSoon();
}

function applyPreset(name) {
  replaceParams(presetParams(name), name);
  toast(PRESETS[name].label);
}

function act(action) {
  switch (action) {
    case 'explode':
      director.explode();
      break;
    case 'collapse':
      director.collapse = !director.collapse;
      panel.setActive('collapse', director.collapse);
      break;
    case 'white':
      director.whiteHold = !director.whiteHold;
      if (director.whiteHold) director.darkHold = false;
      panel.setActive('white', director.whiteHold);
      panel.setActive('dark', director.darkHold);
      break;
    case 'dark':
      director.darkHold = !director.darkHold;
      if (director.darkHold) director.whiteHold = false;
      panel.setActive('dark', director.darkHold);
      panel.setActive('white', director.whiteHold);
      break;
    case 'cycle':
      panel.setActive('cycle', director.startCycle());
      break;
    case 'reset':
      needsReform = true;
      break;
    case 'pause':
      paused = !paused;
      panel.setActive('pause', paused);
      break;
    case 'hide':
      document.body.classList.toggle('ui-hidden');
      break;
    case 'random':
      layoutSeed = (Math.random() * 2 ** 32) >>> 0;
      replaceParams(randomParams(), null);
      toast('Randomized');
      break;
    case 'revert':
      if (presetName) applyPreset(presetName);
      else replaceParams({ ...DEFAULTS }, null);
      break;
    case 'link':
      writeHash();
      navigator.clipboard?.writeText(location.href).then(
        () => toast('Link copied'),
        () => toast('Copy failed — the address bar has the link'),
      );
      break;
    case 'snapshot':
      captureNext = true;
      toast('Snapshot saved');
      break;
    case 'fullscreen':
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen?.();
      break;
  }
}

// ---------------------------------------------------------------- URL state

function readHash() {
  const out = { preset: null, params: {}, seed: null };
  const q = new URLSearchParams(location.hash.slice(1));
  if (PRESETS[q.get('preset')]) out.preset = q.get('preset');
  if (q.has('seed')) out.seed = Number(q.get('seed')) >>> 0;
  for (const [key, raw] of q) {
    const spec = SPECS[key];
    if (!spec) continue;
    if (spec.type === 'select') {
      if (spec.options.some((o) => o.value === raw)) out.params[key] = raw;
    } else if (spec.type === 'toggle') {
      out.params[key] = raw === '1';
    } else {
      const v = Number(raw);
      if (!Number.isFinite(v)) continue;
      out.params[key] = spec.type === 'steps' ? v : clamp(v, spec.min, spec.max);
    }
  }
  return out;
}

let hashTimer = 0;
function writeHashSoon() {
  clearTimeout(hashTimer);
  hashTimer = setTimeout(writeHash, 300);
}

function writeHash() {
  const base = presetName ? presetParams(presetName) : DEFAULTS;
  const q = new URLSearchParams();
  if (presetName) q.set('preset', presetName);
  if (layoutSeed !== 1) q.set('seed', String(layoutSeed));
  for (const key in params) {
    const v = params[key];
    if (v !== base[key]) q.set(key, typeof v === 'boolean' ? (v ? '1' : '0') : String(v));
  }
  history.replaceState(null, '', `#${q}`);
}

// ---------------------------------------------------------------- input

let orbitDrag = null;

function pointerToPlane(e) {
  const r = canvas.getBoundingClientRect();
  const p = engine.camera.pick(((e.clientX - r.left) / r.width) * 2 - 1, 1 - ((e.clientY - r.top) / r.height) * 2);
  if (p) {
    mouse.x = p[0];
    mouse.y = p[1];
  }
}

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  if (e.altKey || e.button === 1) {
    orbitDrag = { x: e.clientX, y: e.clientY };
    return;
  }
  mouse.active = true;
  mouse.sign = e.shiftKey || e.button === 2 ? -1 : 1;
  pointerToPlane(e);
});
canvas.addEventListener('pointermove', (e) => {
  if (orbitDrag) {
    yaw -= (e.clientX - orbitDrag.x) * 0.006;
    params.tilt = clamp(params.tilt + (e.clientY - orbitDrag.y) * 0.25, 0, 82);
    orbitDrag = { x: e.clientX, y: e.clientY };
    panel.setValue('tilt', params.tilt);
    viewDirty = true;
    writeHashSoon();
  } else if (mouse.active) {
    pointerToPlane(e);
  }
});
const release = () => {
  mouse.active = false;
  orbitDrag = null;
};
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    params.zoom = clamp(params.zoom * Math.exp(-e.deltaY * 0.0015), 0.25, 4);
    panel.setValue('zoom', params.zoom);
    viewDirty = true;
    writeHashSoon();
  },
  { passive: false },
);

const KEYS = {
  ' ': 'pause', e: 'explode', c: 'collapse', w: 'white', d: 'dark', b: 'cycle', r: 'reset',
  h: 'hide', s: 'snapshot', x: 'random', f: 'fullscreen',
};
window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
  if (e.target.closest?.('select, textarea, input:not([type=range]):not([type=checkbox])')) return;
  const key = e.key.toLowerCase();
  if (/^[0-9]$/.test(key)) {
    const name = PRESET_KEYS[(Number(key) + 9) % 10];
    if (name) applyPreset(name);
    return;
  }
  const action = KEYS[key];
  if (!action) return;
  e.preventDefault();
  act(action);
});
document.getElementById('show-ui').addEventListener('click', () => act('hide'));
window.addEventListener('resize', () => (viewDirty = true));

function fail(err) {
  const box = document.getElementById('error');
  box.hidden = false;
  box.textContent = `Twirling Lights could not start.\n\n${err.message ?? err}`;
}

// Console access for experiments: lab.params.swirl = 1.2, lab.act('explode'), …
window.lab = { params, act, applyPreset, director, engine };

requestAnimationFrame(frame);
