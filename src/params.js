// Every tweakable variable, its range, and the curated presets.

export const COUNT_STEPS = [
  1000, 2000, 5000, 10000, 20000, 50000, 100000, 150000, 200000, 300000, 500000, 750000, 1000000, 1500000, 2000000,
];

// Colours are sRGB stops, low → high. `lo` is where "color by shape" starts on the ramp.
export const PALETTES = {
  event:    { label: 'Event horizon', lo: 0.4, stops: ['#0a0220', '#3d1a8f', '#b03fc9', '#ff7a8a', '#ffe3b3'] },
  ember:    { label: 'Ember',         lo: 0.4, stops: ['#120200', '#6b1305', '#d9420e', '#ffa43a', '#fff0cc'] },
  glacier:  { label: 'Glacier',       lo: 0.4, stops: ['#010512', '#0b2c8c', '#1e7fe8', '#72e0ff', '#f0fdff'] },
  aurora:   { label: 'Aurora',        lo: 0.4, stops: ['#000d0b', '#05605a', '#12b89a', '#8af5ad', '#e8ddff'] },
  nebula:   { label: 'Nebula',        lo: 0.3, stops: ['#07001f', '#5c1076', '#d92f7e', '#45b8f0', '#f4f7ff'] },
  taiji:    { label: 'Taiji',         lo: 0.4, stops: ['#03061c', '#18288c', '#3f63ff', '#c2cdff', '#fff4d9'] },
  solar:    { label: 'Solar',         lo: 0.4, stops: ['#120300', '#7a1c02', '#e8590c', '#ffc53d', '#fffbea'] },
  moon:     { label: 'Moonlight',     lo: 0.5, stops: ['#020308', '#1d2536', '#57657f', '#b6c2d8', '#ffffff'] },
  spectrum: { label: 'Spectrum',      lo: 0.0, stops: ['#ff2d55', '#ffb000', '#2ee8a0', '#2e86ff', '#b44dff'] },
};

const options = (pairs) => pairs.map(([value, label]) => ({ value, label }));

export const SHAPES = options([
  ['ring', 'Ring'], ['disk', 'Disk'], ['spiral', 'Spiral'], ['galaxy', 'Galaxy'], ['cloud', 'Cloud'],
  ['comet', 'Comet'], ['line', 'Line'], ['spokes', 'Spokes'], ['square', 'Square'], ['rose', 'Rose'],
  ['taiji', 'Yin-yang'],
]);
export const LAYOUTS = options([['circle', 'Circle'], ['line', 'Line'], ['grid', 'Grid'], ['scatter', 'Scatter']]);
export const ABSORB = options([['recycle', 'Reborn at start'], ['quasar', 'Quasar jets'], ['vanish', 'Vanish to dark']]);
export const CORES = options([['void', 'Black void'], ['star', 'Star'], ['none', 'Hidden']]);
export const COLOR_BY = options([['speed', 'Speed'], ['shape', 'Shape'], ['distance', 'Distance'], ['age', 'Age']]);
export const POLARITY = options([['attract', 'All attract'], ['alternate', 'Alternate'], ['repel', 'All repel']]);
const PALETTE_OPTIONS = Object.entries(PALETTES).map(([value, p]) => ({ value, label: p.label }));

const fixed = (d) => (v) => v.toFixed(d);
const kfmt = (v) => (v >= 1e6 ? `${+(v / 1e6).toFixed(2)}M` : v >= 1000 ? `${+(v / 1000).toFixed(1)}k` : String(v));

// `reset: true` re-forms the starting shapes when changed; `rebuild` reallocates particle memory.
export const SCHEMA = [
  { section: 'Particles', open: true },
  { key: 'count', label: 'Particles', type: 'steps', steps: COUNT_STEPS, def: 300000, rebuild: true, fmt: kfmt },
  { key: 'size', label: 'Size', min: 0.3, max: 6, step: 0.05, def: 1.2, fmt: fixed(2) },
  { key: 'brightness', label: 'Brightness', min: 0.05, max: 4, step: 0.01, def: 1, fmt: fixed(2) },
  { key: 'lifespan', label: 'Lifespan', min: 0, max: 30, step: 0.1, def: 0,
    fmt: (v) => (v === 0 ? '∞' : `${v.toFixed(1)}s`), hint: '0 = particles live forever' },

  { section: 'Formation', open: true, hint: 'Where the light starts' },
  { key: 'shape', label: 'Shape', type: 'select', options: SHAPES, def: 'ring', reset: true },
  { key: 'shapes', label: 'Shapes', min: 1, max: 12, step: 1, def: 1, reset: true, fmt: fixed(0), hint: 'How many starting shapes' },
  { key: 'layout', label: 'Arrange', type: 'select', options: LAYOUTS, def: 'circle', reset: true },
  { key: 'spacing', label: 'Spacing', min: 0, max: 2, step: 0.01, def: 0, reset: true, fmt: fixed(2), hint: 'How far apart the shapes are' },
  { key: 'shapeSize', label: 'Shape size', min: 0.02, max: 1.5, step: 0.01, def: 1, reset: true, fmt: fixed(2) },
  { key: 'scatter', label: 'Scatter', min: 0, max: 1, step: 0.01, def: 0.1, reset: true, fmt: fixed(2) },
  { key: 'orbit', label: 'Orbit', min: -1.5, max: 1.5, step: 0.01, def: 0.8, reset: true, fmt: fixed(2),
    hint: 'Starting speed around the centre, as a fraction of orbital speed. 0 = fall straight in' },
  { key: 'twist', label: 'Shape spin', min: -1.5, max: 1.5, step: 0.01, def: 0, reset: true, fmt: fixed(2),
    hint: 'Each shape rotating about its own centre' },

  { section: 'Attractors', open: true, hint: 'Gravity wells' },
  { key: 'attractors', label: 'Attractors', min: 0, max: 8, step: 1, def: 1, fmt: fixed(0) },
  { key: 'separation', label: 'Separation', min: 0, max: 1.5, step: 0.01, def: 0, fmt: fixed(2), hint: 'How far apart the attractors are' },
  { key: 'dance', label: 'Dance', min: -2, max: 2, step: 0.01, def: 0, fmt: fixed(2), hint: 'Attractors orbiting each other' },
  { key: 'mass', label: 'Gravity', min: 0, max: 3, step: 0.01, def: 1, fmt: fixed(2) },
  { key: 'swirl', label: 'Swirl', min: -2, max: 2, step: 0.01, def: 0.8, fmt: fixed(2),
    hint: 'Steers light toward a fraction of orbital speed: below 1 spirals in, 1 orbits, above 1 flings out. 0 = off' },
  { key: 'counterSpin', label: 'Counter-spin', type: 'toggle', def: false, hint: 'Every other attractor swirls the opposite way' },
  { key: 'polarity', label: 'Polarity', type: 'select', options: POLARITY, def: 'attract' },
  { key: 'affinity', label: 'Affinity', min: 0, max: 1, step: 0.01, def: 0, fmt: fixed(2),
    hint: 'Each shape is pulled mostly by its own attractor' },
  { key: 'horizon', label: 'Horizon', min: 0, max: 0.25, step: 0.001, def: 0.04, fmt: fixed(3), hint: 'Radius where light is swallowed' },
  { key: 'softening', label: 'Softness', min: 0.005, max: 0.4, step: 0.001, def: 0.04, fmt: fixed(3), hint: 'Smooths the pull close to a core' },
  { key: 'absorb', label: 'Swallowed', type: 'select', options: ABSORB, def: 'recycle' },
  { key: 'core', label: 'Core', type: 'select', options: CORES, def: 'void' },

  { section: 'Field' },
  { key: 'turbulence', label: 'Turbulence', min: 0, max: 2, step: 0.01, def: 0.05, fmt: fixed(2) },
  { key: 'noiseScale', label: 'Noise scale', min: 0.2, max: 8, step: 0.01, def: 1.6, fmt: fixed(2) },
  { key: 'drag', label: 'Drag', min: 0, max: 3, step: 0.01, def: 0.02, fmt: fixed(2) },
  { key: 'timeScale', label: 'Time', min: 0, max: 3, step: 0.01, def: 1, fmt: fixed(2) },
  { key: 'burst', label: 'Burst', min: 0.2, max: 6, step: 0.01, def: 2.5, fmt: fixed(2), hint: 'Explosion and jet speed' },

  { section: 'Light', open: true },
  { key: 'palette', label: 'Palette', type: 'select', options: PALETTE_OPTIONS, def: 'event' },
  { key: 'colorBy', label: 'Color by', type: 'select', options: COLOR_BY, def: 'speed' },
  { key: 'hueDrift', label: 'Hue drift', min: -1, max: 1, step: 0.01, def: 0, fmt: fixed(2) },
  { key: 'whiteHot', label: 'White-hot', min: 0, max: 1, step: 0.01, def: 0.5, fmt: fixed(2), hint: 'Fast light burns white' },
  { key: 'trails', label: 'Trails', min: 0, max: 0.995, step: 0.001, def: 0.9, fmt: fixed(3) },
  { key: 'halo', label: 'Halo', min: 0, max: 3, step: 0.01, def: 1, fmt: fixed(2) },
  { key: 'haloSpread', label: 'Halo spread', min: 0.2, max: 1, step: 0.01, def: 0.75, fmt: fixed(2) },
  { key: 'exposure', label: 'Exposure', min: 0.1, max: 6, step: 0.01, def: 1.2, fmt: fixed(2) },
  { key: 'vignette', label: 'Vignette', min: 0, max: 1, step: 0.01, def: 0.5, fmt: fixed(2) },

  { section: 'View' },
  { key: 'tilt', label: 'Tilt', min: 0, max: 82, step: 0.1, def: 0, fmt: (v) => `${v.toFixed(0)}°` },
  { key: 'well', label: 'Well depth', min: 0, max: 2.5, step: 0.01, def: 0, fmt: fixed(2), hint: 'Bend space into a funnel under each attractor' },
  { key: 'zoom', label: 'Zoom', min: 0.25, max: 4, step: 0.01, def: 1, fmt: fixed(2) },
  { key: 'autoRotate', label: 'Auto-rotate', min: -1, max: 1, step: 0.01, def: 0, fmt: fixed(2) },
  { key: 'resolution', label: 'Resolution', min: 0.5, max: 1, step: 0.05, def: 1, fmt: (v) => `${Math.round(v * 100)}%` },
];

export const SPECS = Object.fromEntries(SCHEMA.filter((s) => s.key).map((s) => [s.key, s]));
export const DEFAULTS = Object.fromEntries(SCHEMA.filter((s) => s.key).map((s) => [s.key, s.def]));

// Presets override the defaults. `cycle` starts the collapse → flash → explode → fade loop.
export const PRESETS = {
  wormhole: {
    label: 'Wormhole',
    params: {
      count: 500000, size: 1, attractors: 1, mass: 1.2, swirl: 0.82, drag: 0.02, horizon: 0.05, softening: 0.03,
      shape: 'ring', shapes: 1, shapeSize: 1.3, scatter: 0.35, orbit: 0.85, turbulence: 0.04,
      palette: 'event', colorBy: 'speed', whiteHot: 0.6, trails: 0.9, halo: 1.1, exposure: 1.3,
      tilt: 62, well: 1.2, zoom: 1.1, autoRotate: 0.08,
    },
  },
  yinyang: {
    label: 'Yin-yang',
    params: {
      count: 400000, size: 1, attractors: 2, separation: 0.3, dance: 0.5, mass: 0.8, swirl: 0.9, affinity: 0.85,
      horizon: 0.03, softening: 0.035, drag: 0.03, core: 'void',
      shape: 'taiji', shapes: 1, spacing: 0, shapeSize: 0.9, scatter: 0.05, orbit: 0.3, twist: 0,
      palette: 'taiji', colorBy: 'shape', whiteHot: 0.35, trails: 0.93, halo: 1, turbulence: 0.03,
    },
  },
  gravity: {
    label: 'Gravity',
    params: {
      count: 200000, size: 1.2, attractors: 3, separation: 0.3, dance: 0.8, mass: 0.8, swirl: 0, drag: 0,
      horizon: 0.02, softening: 0.05, core: 'star', turbulence: 0,
      shape: 'disk', shapes: 6, layout: 'circle', spacing: 1.05, shapeSize: 0.16, scatter: 0.1, orbit: 1, twist: 0,
      palette: 'solar', colorBy: 'speed', trails: 0.9, halo: 1.1, tilt: 28, well: 0.6,
    },
  },
  comets: {
    label: 'Comets',
    params: {
      count: 60000, size: 1.6, attractors: 1, mass: 1.5, swirl: 0, drag: 0, horizon: 0.035, softening: 0.05,
      core: 'star', turbulence: 0, shape: 'comet', shapes: 7, layout: 'circle', spacing: 1.25, shapeSize: 0.1,
      scatter: 0.1, orbit: 0.35, palette: 'glacier', colorBy: 'speed', whiteHot: 0.7, trails: 0.965, halo: 1.4,
    },
  },
  galaxies: {
    label: 'Galaxies',
    params: {
      count: 500000, size: 0.8, attractors: 2, separation: 0.55, dance: 0.35, mass: 0.9, swirl: 0, drag: 0,
      horizon: 0.02, softening: 0.03, core: 'star', turbulence: 0,
      shape: 'galaxy', shapes: 2, layout: 'circle', spacing: 0.55, shapeSize: 0.45, scatter: 0.05, orbit: 0.25, twist: 1,
      palette: 'nebula', colorBy: 'shape', trails: 0.85, halo: 1.1, tilt: 35, well: 0.5,
    },
  },
  supernova: {
    label: 'Supernova',
    cycle: true,
    params: {
      count: 600000, size: 0.9, attractors: 1, mass: 1, swirl: 0.9, drag: 0.03, horizon: 0.05, softening: 0.03,
      absorb: 'vanish', core: 'void', shape: 'cloud', shapes: 1, shapeSize: 0.9, scatter: 0, orbit: 0.6,
      palette: 'solar', colorBy: 'speed', whiteHot: 0.6, trails: 0.9, halo: 1.5, burst: 2.2, turbulence: 0.08,
    },
  },
  quasar: {
    label: 'Quasar',
    params: {
      count: 400000, size: 1, attractors: 1, mass: 1.2, swirl: 0.85, drag: 0.02, horizon: 0.06, softening: 0.03,
      absorb: 'quasar', burst: 2.2, core: 'void', shape: 'disk', shapes: 1, shapeSize: 1.1, scatter: 0.1, orbit: 0.85,
      palette: 'glacier', colorBy: 'speed', whiteHot: 0.6, trails: 0.93, halo: 1.2, tilt: 55, well: 1, turbulence: 0.04,
    },
  },
  silk: {
    label: 'Silk',
    params: {
      count: 1000000, size: 0.7, attractors: 4, separation: 0.55, dance: 0.15, mass: 0.5, swirl: 0.9, counterSpin: true,
      drag: 0.15, turbulence: 0.5, noiseScale: 1.2, horizon: 0.02, core: 'none', lifespan: 12,
      shape: 'spokes', shapes: 1, shapeSize: 1.3, scatter: 0.05, orbit: 0.3,
      palette: 'aurora', colorBy: 'distance', trails: 0.975, halo: 0.7,
    },
  },
  mandala: {
    label: 'Mandala',
    params: {
      count: 400000, size: 0.9, attractors: 6, separation: 0.62, dance: 0.25, mass: 0.5, swirl: 1, counterSpin: true,
      affinity: 0.6, drag: 0.05, horizon: 0.02, core: 'none', turbulence: 0,
      shape: 'rose', shapes: 6, layout: 'circle', spacing: 0.62, shapeSize: 0.3, scatter: 0.03, orbit: 0,
      palette: 'nebula', colorBy: 'shape', trails: 0.95, halo: 1,
    },
  },
  lattice: {
    label: 'Lattice',
    params: {
      count: 300000, size: 1, attractors: 4, separation: 0.45, mass: 0.7, polarity: 'alternate', swirl: 0.6,
      counterSpin: true, drag: 0.08, horizon: 0.03, core: 'star', turbulence: 0,
      shape: 'square', shapes: 9, layout: 'grid', spacing: 0.6, shapeSize: 0.22, scatter: 0.02, orbit: 0,
      palette: 'spectrum', colorBy: 'shape', trails: 0.88, halo: 1,
    },
  },
};

export const PRESET_KEYS = Object.keys(PRESETS);

export function presetParams(name) {
  return { ...DEFAULTS, ...(PRESETS[name]?.params ?? {}) };
}

// Parameters that look good together, for the dice button.
export function randomParams(rand = Math.random) {
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const range = (a, b, d = 2) => +(a + (b - a) * rand()).toFixed(d);
  const attractors = pick([1, 1, 2, 2, 3, 4, 5, 6]);
  const shapes = pick([1, 1, 2, 3, 4, 5, 6, 7, 8]);
  return {
    ...DEFAULTS,
    count: pick([200000, 300000, 500000, 750000]),
    size: range(0.7, 1.5),
    shape: pick(SHAPES).value,
    shapes,
    layout: pick(['circle', 'circle', 'circle', 'grid', 'line', 'scatter']),
    spacing: shapes === 1 ? pick([0, 0, 0.4]) : range(0.4, 1.2),
    shapeSize: shapes === 1 ? range(0.5, 1.2) : range(0.1, 0.4),
    scatter: range(0, 0.3),
    orbit: range(-0.2, 1),
    twist: pick([0, 0, range(-1, 1)]),
    attractors,
    separation: attractors === 1 ? pick([0, 0, 0.3]) : range(0.2, 0.8),
    dance: attractors === 1 ? 0 : range(-0.8, 0.8),
    mass: range(0.5, 1.4),
    swirl: pick([0, range(0.6, 1.05), range(0.6, 1.05)]),
    counterSpin: rand() < 0.35,
    polarity: pick(['attract', 'attract', 'attract', 'alternate']),
    affinity: pick([0, 0, range(0.3, 0.9)]),
    horizon: range(0.015, 0.06, 3),
    core: pick(['void', 'star', 'none']),
    absorb: pick(['recycle', 'recycle', 'quasar']),
    turbulence: pick([0, 0.05, range(0.1, 0.6)]),
    drag: range(0, 0.15),
    palette: pick(PALETTE_OPTIONS).value,
    colorBy: pick(['speed', 'speed', 'shape', 'distance']),
    trails: range(0.85, 0.97, 3),
    halo: range(0.7, 1.5),
    tilt: pick([0, 0, range(20, 65, 0)]),
    well: range(0, 1.2),
  };
}
