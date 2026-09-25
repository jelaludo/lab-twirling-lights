// GLSL sources. The simulation lives entirely on the GPU: every particle is one texel
// in two RGBA32F textures (pos.xy vel.xy | age lifeFactor spark family), ping-ponged each step.

const HEADER = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
const float TAU = 6.28318530718;
const float PI = 3.14159265359;
`;

const HASH = /* glsl */ `
uint pcg(uint v) {
  uint s = v * 747796405u + 2891336453u;
  uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
float rnd(inout uint s) { s = pcg(s); return float(s) * (1.0 / 4294967296.0); }
vec2 gauss2(inout uint s) {
  float u = max(rnd(s), 1e-7);
  float a = TAU * rnd(s);
  return sqrt(-2.0 * log(u)) * vec2(cos(a), sin(a));
}
vec2 perp(vec2 v) { return vec2(-v.y, v.x); }
vec2 rot(vec2 v, float a) { float c = cos(a), s = sin(a); return vec2(c * v.x - s * v.y, s * v.x + c * v.y); }
`;

// Ashima Arts / Stefan Gustavson 3D simplex noise (MIT).
const NOISE = /* glsl */ `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
// Divergence-free flow: the curl of a scalar noise field. Gives smoke-like, swirling paths.
vec2 curl(vec2 p, float t) {
  const float e = 0.03;
  float a = snoise(vec3(p.x, p.y + e, t)) - snoise(vec3(p.x, p.y - e, t));
  float b = snoise(vec3(p.x + e, p.y, t)) - snoise(vec3(p.x - e, p.y, t));
  return vec2(a, -b) / (2.0 * e);
}
`;

// Starting formations: where (and how fast) a particle is born.
const FORMATION = /* glsl */ `
uniform int uShape;
uniform int uShapes;
uniform int uLayout;
uniform uint uLayoutSeed;
uniform float uSpacing;
uniform float uShapeSize;
uniform float uScatter;
uniform float uOrbit;
uniform float uTwist;
uniform float uGM;
uniform float uGM1;
uniform float uEps2;

vec2 shapeCenter(int k) {
  float n = float(uShapes), fk = float(k);
  if (uLayout == 0) {                       // circle
    float a = 0.5 * PI + TAU * fk / n;
    return uSpacing * vec2(cos(a), sin(a));
  }
  if (uLayout == 1) return vec2((fk - 0.5 * (n - 1.0)) * uSpacing, 0.0);   // line
  if (uLayout == 2) {                       // grid
    float cols = ceil(sqrt(n));
    float rows = ceil(n / cols);
    float cx = mod(fk, cols), cy = floor(fk / cols);
    return vec2(cx - 0.5 * (cols - 1.0), 0.5 * (rows - 1.0) - cy) * uSpacing;
  }
  uint s = pcg(uint(k) * 7919u + uLayoutSeed);  // scatter
  float a = TAU * rnd(s);
  return uSpacing * sqrt(rnd(s)) * vec2(cos(a), sin(a));
}

// Softened circular-orbit speed around a mass gm at squared distance r2.
float kepler(float gm, float r2, float eps2) {
  return sqrt(gm * r2 / pow(r2 + eps2, 1.5));
}

struct Spawn { vec2 pos; vec2 vel; float fam; };

Spawn spawn(uint id, inout uint s, bool initial) {
  uint n = uint(uShapes);
  int k = int(id % n);
  uint j = id / n;
  vec2 c = shapeCenter(k);
  float R = uShapeSize;
  // First formation uses a low-discrepancy (R2) sequence so shapes read crisply;
  // respawns are random.
  vec2 u = initial ? vec2(uvec2(j * 3242174889u, j * 2447445414u)) * (1.0 / 4294967296.0)
                   : vec2(rnd(s), rnd(s));
  vec2 g = gauss2(s);
  float fam = float(k);
  vec2 lp = vec2(0.0);

  if (uShape == 0) {                        // ring
    float a = TAU * u.x;
    lp = vec2(cos(a), sin(a)) * R;
  } else if (uShape == 1) {                 // disk
    float a = TAU * u.x;
    lp = vec2(cos(a), sin(a)) * R * sqrt(u.y);
  } else if (uShape == 2) {                 // two-arm spiral
    float a = step(0.5, u.y) * PI + u.x * 9.0;
    lp = vec2(cos(a), sin(a)) * R * (0.05 + 0.95 * u.x) + g * R * 0.02 * (0.3 + u.x);
  } else if (uShape == 3) {                 // galaxy: bulge + four logarithmic arms
    if (u.y < 0.2) {
      lp = g * R * 0.12;
    } else {
      float arm = floor(fract(u.y * 5.0) * 4.0);
      float r = 0.1 + 0.9 * sqrt(u.x);
      float a = arm * 0.25 * TAU + 2.4 * log(r);
      lp = vec2(cos(a), sin(a)) * r * R + g * R * (0.02 + 0.05 * r);
    }
  } else if (uShape == 4) {                 // cloud
    lp = g * R * 0.4;
  } else if (uShape == 6) {                 // line (radial when arranged on a circle)
    lp = vec2((u.x * 2.0 - 1.0) * R, 0.0);
  } else if (uShape == 7) {                 // six spokes
    float a = floor(u.y * 6.0) * TAU / 6.0;
    lp = vec2(cos(a), sin(a)) * R * u.x;
  } else if (uShape == 8) {                 // square outline
    float e = u.x * 4.0, f = fract(e) * 2.0 - 1.0;
    int side = int(e);
    lp = side == 0 ? vec2(f, -1.0) : side == 1 ? vec2(1.0, f) : side == 2 ? vec2(-f, 1.0) : vec2(-1.0, -f);
    lp *= R * 0.75;
  } else if (uShape == 9) {                 // three-petal rose
    float th = u.x * PI;
    lp = vec2(cos(th), sin(th)) * cos(3.0 * th) * R;
  } else if (uShape == 10) {                // yin-yang: two families, heads at top / bottom
    float a = TAU * u.x;
    vec2 q = vec2(cos(a), sin(a)) * sqrt(u.y);
    float up = length(q - vec2(0.0, 0.5)), dn = length(q + vec2(0.0, 0.5));
    float side = q.x > 0.0 ? 0.0 : 1.0;
    if (up < 0.5) side = 0.0;
    if (dn < 0.5) side = 1.0;
    if (up < 0.13) side = 1.0;
    if (dn < 0.13) side = 0.0;
    lp = q * R;
    fam = float(k) * 2.0 + side;
  }

  lp += gauss2(s) * uScatter * R * 0.25;
  float orient = (uLayout == 0 && uShapes > 1) ? atan(c.y, c.x) : 0.0;
  vec2 pos = c + rot(lp, orient);

  // Orbit about the origin, plus spin about the shape's own centre.
  bool comet = uShape == 5;
  vec2 ref = comet ? c : pos;
  float r2 = dot(ref, ref);
  vec2 vel = vec2(0.0);
  if (r2 > 1e-8) vel += uOrbit * kepler(uGM, r2, uEps2) * perp(ref * inversesqrt(r2));
  vec2 d = pos - c;
  float d2 = dot(d, d);
  if (d2 > 1e-8) vel += uTwist * kepler(uGM1, d2, 0.004) * perp(d * inversesqrt(d2));

  if (comet) {                              // bright head, tail streaming behind the motion
    vec2 dir = dot(vel, vel) > 1e-8 ? normalize(vel) : (r2 > 1e-8 ? normalize(perp(c)) : vec2(1.0, 0.0));
    float tail = u.x * u.x;
    pos = u.y < 0.3
      ? c + g * R * 0.12
      : c - dir * tail * R * 3.0 + perp(dir) * g.x * R * (0.03 + 0.3 * tail);
  }
  vel += gauss2(s) * uScatter * 0.04;
  return Spawn(pos, vel, fam);
}
`;

export const FULLSCREEN_VS = `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

export const SIM_FS = `${HEADER}
uniform sampler2D uS0;
uniform sampler2D uS1;
uniform int uSide;
uniform int uReset;
uniform float uDt;
uniform float uTime;
uniform uint uStepSeed;

uniform int uNA;
uniform vec4 uA[8];        // xy position, z G*mass (signed), w swirl
uniform vec4 uAV[8];       // xy attractor velocity
uniform vec4 uMouse;       // xy position, z strength
uniform float uHorizon;
uniform float uSoft2;
uniform float uAffinity;
uniform float uGrip;
uniform int uAbsorb;       // 0 recycle, 1 quasar jets, 2 vanish

uniform float uTurb;
uniform float uNoiseScale;
uniform float uDrag;
uniform float uMaxSpeed;
uniform float uBound;
uniform float uLife;
uniform float uBurst;
uniform float uJet;

layout(location = 0) out vec4 o0;
layout(location = 1) out vec4 o1;

${HASH}
${NOISE}
${FORMATION}

void main() {
  ivec2 tc = ivec2(gl_FragCoord.xy);
  uint id = uint(tc.y * uSide + tc.x);

  if (uReset == 1) {
    uint s = pcg(id ^ 0x9E3779B9u);
    Spawn q = spawn(id, s, true);
    o0 = vec4(q.pos, q.vel);
    o1 = vec4(0.0, 0.5 + rnd(s), rnd(s), q.fam);
    return;
  }

  vec4 s0 = texelFetch(uS0, tc, 0);
  vec4 s1 = texelFetch(uS1, tc, 0);
  uint seed = pcg(id * 1664525u + uStepSeed);
  vec2 p = s0.xy, v = s0.zw;
  float age = s1.x, lf = s1.y, spark = s1.z, fam = s1.w;

  // Swallowed particles wait inside their attractor (lf = -(index + 1)) until an explosion.
  if (lf < 0.0) {
    if (uBurst > 0.0) {
      int ai = int(-lf + 0.5) - 1;
      vec2 a = ai < uNA ? uA[ai].xy : vec2(0.0);
      float ang = TAU * rnd(seed);
      vec2 dir = vec2(cos(ang), sin(ang));
      o0 = vec4(a + dir * max(uHorizon, 0.01) * 1.1, dir * uBurst * (0.3 + 0.9 * rnd(seed)));
      o1 = vec4(0.0, 0.5 + rnd(seed), spark, fam);
    } else {
      o0 = s0;
      o1 = s1;
    }
    return;
  }

  // Explosion: kick everything away from its nearest attractor.
  if (uBurst > 0.0) {
    vec2 a = vec2(0.0);
    float best = 1e9;
    for (int i = 0; i < uNA; i++) {
      vec2 d = p - uA[i].xy;
      float dd = dot(d, d);
      if (dd < best) { best = dd; a = uA[i].xy; }
    }
    vec2 d = p - a;
    float r = length(d);
    vec2 dir = r > 1e-4 ? d / r : vec2(1.0, 0.0);
    v += dir * uBurst * (0.35 + 0.65 * rnd(seed)) * mix(1.3, 0.5, smoothstep(0.0, 1.5, r));
  }

  vec2 acc = vec2(0.0);
  vec2 swirlAcc = vec2(0.0);
  float swirlW = 0.0;
  int own = uNA > 0 ? int(fam + 0.5) % uNA : 0;
  int swallowed = -1;
  for (int i = 0; i < uNA; i++) {
    vec4 A = uA[i];
    vec2 d = A.xy - p;
    float r2 = dot(d, d);
    float w = i == own ? 1.0 : 1.0 - uAffinity;
    float inv = inversesqrt(r2 + uSoft2);
    float inv3 = inv * inv * inv;
    acc += d * (A.z * w * inv3);                       // Plummer-softened gravity
    if (A.w != 0.0 && A.z > 0.0 && w > 0.0) {
      // Swirl steers the tangential speed toward a fraction of the local orbital speed:
      // below 1 the light spirals inward, above 1 it is flung out.
      float r = sqrt(r2) + 1e-6;
      vec2 t = perp(-d) / r;
      float vc = sqrt(A.z * r2 * inv3);
      float g = A.z * w * inv * inv;
      swirlAcc += g * (A.w * vc - dot(v - uAV[i].xy, t)) * t;
      swirlW += g;
    }
    if (A.z > 0.0 && r2 < uHorizon * uHorizon) swallowed = i;
  }
  if (swirlW > 0.0) acc += swirlAcc * (uGrip / swirlW);
  if (uMouse.z != 0.0) {
    vec2 d = uMouse.xy - p;
    float inv = inversesqrt(dot(d, d) + 0.01);
    acc += d * (uMouse.z * inv * inv * inv);
  }
  if (uTurb > 0.0) acc += curl(p * uNoiseScale, uTime * 0.05) * uTurb * 0.4;

  v += acc * uDt;
  v *= exp(-uDrag * uDt);
  float sp = length(v);
  if (sp > uMaxSpeed) v *= uMaxSpeed / sp;
  p += v * uDt;
  age += uDt;

  bool expired = uLife > 0.0 && age > uLife * lf;
  bool lost = dot(p, p) > uBound * uBound;
  if (swallowed >= 0 || lost || expired) {
    if (uAbsorb == 2 && !expired) {
      int ai = swallowed >= 0 ? swallowed : (uNA > 0 ? int(id % uint(uNA)) : 0);
      o0 = vec4(swallowed >= 0 ? uA[ai].xy : p, 0.0, 0.0);
      o1 = vec4(0.0, -float(ai + 1), spark, fam);
      return;
    }
    if (uAbsorb == 1 && swallowed >= 0) {
      // Quasar: re-emit along a slowly precessing pair of jets.
      vec2 a = uA[swallowed].xy;
      float ang = uTime * 0.2 + float(swallowed) * 2.39996 + (rnd(seed) < 0.5 ? 0.0 : PI) + gauss2(seed).x * 0.07;
      vec2 dir = vec2(cos(ang), sin(ang));
      p = a + dir * uHorizon * 1.6;
      v = dir * uJet * (0.75 + 0.5 * rnd(seed)) + uAV[swallowed].xy;
    } else {
      Spawn q = spawn(id, seed, false);
      p = q.pos;
      v = q.vel;
      fam = q.fam;
    }
    age = 0.0;
    lf = 0.5 + rnd(seed);
  }
  o0 = vec4(p, v);
  o1 = vec4(age, lf, spark, fam);
}
`;

// Gravity-well surface: the plane dips under every attractor (a rubber-sheet / Flamm funnel).
const HEIGHT = /* glsl */ `
uniform int uNA;
uniform vec4 uA[8];
uniform float uWell;
float heightAt(vec2 p) {
  if (uWell <= 0.0) return 0.0;
  float h = 0.0;
  for (int i = 0; i < uNA; i++) {
    vec2 d = p - uA[i].xy;
    h -= uA[i].z * inversesqrt(dot(d, d) + 0.03);
  }
  return h * uWell * 0.16;
}
`;

export const PARTICLE_VS = `${HEADER}
uniform sampler2D uS0;
uniform sampler2D uS1;
uniform int uSide;
uniform mat4 uVP;
uniform float uCamDist;
uniform float uSize;
uniform float uIntensity;
uniform vec3 uPal[5];
uniform int uColorBy;
uniform float uSpeedRef;
uniform float uFamilies;
uniform float uShapeLo;
uniform float uHue;
uniform float uWhiteHot;
uniform float uLife;
${HEIGHT}
out vec3 vColor;

vec3 palette(float t) {
  t = 1.0 - abs(1.0 - mod(t, 2.0));        // ping-pong so hue drift loops without seams
  float x = clamp(t, 0.0, 1.0) * 4.0;
  int i = min(int(x), 3);
  return mix(uPal[i], uPal[i + 1], smoothstep(0.0, 1.0, x - float(i)));
}

void main() {
  ivec2 tc = ivec2(gl_VertexID % uSide, gl_VertexID / uSide);
  vec4 s0 = texelFetch(uS0, tc, 0);
  vec4 s1 = texelFetch(uS1, tc, 0);
  if (s1.y < 0.0) {                          // swallowed: push outside the clip volume
    gl_Position = vec4(0.0, 0.0, -2.0, 1.0);
    gl_PointSize = 1.0;
    vColor = vec3(0.0);
    return;
  }
  vec2 p = s0.xy;
  float speed = length(s0.zw);
  vec4 clip = uVP * vec4(p, heightAt(p), 1.0);
  gl_Position = clip;

  float t;
  if (uColorBy == 0) {
    t = 0.1 + 0.9 * sqrt(clamp(speed / uSpeedRef, 0.0, 1.0));
  } else if (uColorBy == 1) {
    t = uFamilies > 1.5 ? mix(uShapeLo, 1.0, s1.w / (uFamilies - 1.0)) : 0.75;
  } else if (uColorBy == 2) {
    float md = 2.0;
    for (int i = 0; i < uNA; i++) md = min(md, length(p - uA[i].xy));
    t = 1.0 - 0.9 * smoothstep(0.0, 1.4, md);
  } else {
    t = 1.0 - 0.9 * clamp(s1.x / (uLife > 0.0 ? uLife * s1.y : 20.0), 0.0, 1.0);
  }
  vec3 col = palette(t + uHue);
  float heat = clamp(speed / (uSpeedRef * 1.5), 0.0, 1.0);
  col = mix(col, vec3(1.0), uWhiteHot * heat * heat);

  float a = smoothstep(0.0, 0.25, s1.x);
  if (uLife > 0.0) a *= 1.0 - smoothstep(0.65, 1.0, s1.x / (uLife * s1.y));
  a *= 0.5 + 1.1 * s1.z * s1.z;              // a few bright sparks among many dim motes

  float size = uSize * clamp(uCamDist / clip.w, 0.35, 3.0);
  if (size < 1.0) {                          // sub-pixel: keep the energy, not the footprint
    a *= size * size;
    size = 1.0;
  }
  gl_PointSize = size * 1.6;
  vColor = col * uIntensity * a;
}
`;

export const PARTICLE_FS = `${HEADER}
in vec3 vColor;
out vec4 o;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float d2 = dot(q, q);
  if (d2 > 1.0) discard;
  o = vec4(vColor * exp(-3.5 * d2), 0.0);
}
`;

// Attractor cores: a black event horizon with a photon ring, or a glowing star.
export const GLYPH_VS = `${HEADER}
uniform mat4 uVP;
uniform float uR;
uniform float uHorizon;
${HEIGHT}
out vec2 vLocal;
void main() {
  vec2 corner = vec2(float(gl_VertexID & 1), float((gl_VertexID >> 1) & 1)) * 2.0 - 1.0;
  vec2 c = uA[gl_InstanceID].xy;
  vLocal = corner * uR;
  float z = heightAt(c + vec2(uHorizon * 1.3, 0.0));
  gl_Position = uVP * vec4(c + vLocal, z, 1.0);
}
`;

export const GLYPH_FS = `${HEADER}
uniform int uPass;       // 0 = occluding core (writes depth), 1 = emission
uniform int uStyle;      // 0 = void, 1 = star
uniform float uR;
uniform float uHorizon;
uniform vec3 uColor;
uniform float uGlow;
in vec2 vLocal;
out vec4 o;
void main() {
  float h = max(uHorizon, 0.004);
  float x = length(vLocal) / h;
  if (uPass == 0) {
    if (x > 1.0) discard;
    o = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  vec3 e;
  if (uStyle == 0) {
    float q = (x - 1.05) / 0.07;
    float ring = exp(-q * q);
    float halo = x > 1.0 ? exp(-(x - 1.0) * 2.2) * 0.22 : 0.0;
    e = uColor * (ring * 1.4 + halo);
  } else {
    e = uColor * (exp(-x * x * 1.5) * 5.0 + 0.35 * exp(-x * 1.1));
  }
  // Reach exactly zero inside the quad, or its square edge shows once trails and the tone-map lift it.
  float edge = smoothstep(1.0, 0.6, length(vLocal) / uR);
  o = vec4(e * uGlow * edge, 0.0);
}
`;

export const FADE_FS = `${HEADER}
uniform float uDecay;
out vec4 o;
void main() { o = vec4(uDecay); }
`;

// Bloom: 13-tap downsample chain, then tent-filtered upsample back up (Jimenez 2014).
export const DOWN_FS = `${HEADER}
uniform sampler2D uSrc;
uniform vec2 uTexel;
in vec2 vUv;
out vec4 o;
vec3 at(float x, float y) { return texture(uSrc, vUv + uTexel * vec2(x, y)).rgb; }
void main() {
  vec3 c = at(0.0, 0.0) * 0.125;
  c += (at(-2.0, 2.0) + at(2.0, 2.0) + at(-2.0, -2.0) + at(2.0, -2.0)) * 0.03125;
  c += (at(0.0, 2.0) + at(-2.0, 0.0) + at(2.0, 0.0) + at(0.0, -2.0)) * 0.0625;
  c += (at(-1.0, 1.0) + at(1.0, 1.0) + at(-1.0, -1.0) + at(1.0, -1.0)) * 0.125;
  o = vec4(c, 1.0);
}
`;

export const UP_FS = `${HEADER}
uniform sampler2D uSrc;
uniform vec2 uTexel;
uniform float uWeight;
in vec2 vUv;
out vec4 o;
vec3 at(float x, float y) { return texture(uSrc, vUv + uTexel * vec2(x, y)).rgb; }
void main() {
  vec3 c = at(0.0, 0.0) * 4.0;
  c += (at(0.0, 1.0) + at(-1.0, 0.0) + at(1.0, 0.0) + at(0.0, -1.0)) * 2.0;
  c += at(-1.0, 1.0) + at(1.0, 1.0) + at(-1.0, -1.0) + at(1.0, -1.0);
  o = vec4(c * (uWeight / 16.0), 1.0);
}
`;

export const COMPOSITE_FS = `${HEADER}
uniform sampler2D uAccum;
uniform sampler2D uBloom;
uniform float uBloomStrength;
uniform float uExposure;
uniform float uWhite;
uniform float uDark;
uniform float uVignette;
uniform float uTime;
uniform vec3 uBg;
in vec2 vUv;
out vec4 o;
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
void main() {
  vec2 q = vUv - 0.5;
  vec3 hdr = texture(uAccum, vUv).rgb + texture(uBloom, vUv).rgb * uBloomStrength;
  hdr += uBg * (1.0 - smoothstep(0.0, 0.8, length(q)));
  float fade = 1.0 - uDark;
  hdr *= uExposure * fade * fade;
  // Fade to white: the brightest light blows out first, then the whole field floods.
  hdr = hdr * (1.0 + uWhite * 14.0) + vec3(uWhite * uWhite * 9.0);
  vec3 col = 1.0 - exp(-hdr);
  col *= mix(1.0 - dot(q, q) * uVignette * 1.8, 1.0, uWhite);
  col = pow(max(col, 0.0), vec3(1.0 / 2.2));
  col += (hash12(gl_FragCoord.xy + fract(uTime * 7.31) * 311.0) - 0.5) / 255.0;
  o = vec4(col, 1.0);
}
`;
