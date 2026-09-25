// Small WebGL2 toolkit: programs with reflected uniforms, float render targets.

export function createContext(canvas) {
  const gl = canvas.getContext('webgl2', {
    antialias: false,
    alpha: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
    powerPreference: 'high-performance',
  });
  if (!gl) throw new Error('WebGL2 is not available in this browser.');
  if (!gl.getExtension('EXT_color_buffer_float')) {
    throw new Error('This GPU/browser cannot render to floating-point textures (EXT_color_buffer_float).');
  }
  return gl;
}

function compile(gl, type, src, name) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    console.error(src.split('\n').map((l, i) => `${String(i + 1).padStart(4)}  ${l}`).join('\n'));
    throw new Error(`${name} (${type === gl.VERTEX_SHADER ? 'vertex' : 'fragment'}): ${log}`);
  }
  return shader;
}

export function createProgram(gl, name, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs, name));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs, name));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error(`${name} link: ${gl.getProgramInfoLog(p)}`);
  }
  const uniforms = new Map();
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i);
    uniforms.set(info.name.replace(/\[0\]$/, ''), { loc: gl.getUniformLocation(p, info.name), type: info.type });
  }
  return { gl, p, name, uniforms };
}

// Bind a program and set uniforms by name. Unknown names (optimised out) are skipped.
// Textures are assigned to texture units in the order they appear.
export function use(prog, values) {
  const { gl } = prog;
  gl.useProgram(prog.p);
  let unit = 0;
  for (const key in values) {
    const u = prog.uniforms.get(key);
    if (!u) continue;
    const v = values[key];
    switch (u.type) {
      case gl.FLOAT: typeof v === 'number' ? gl.uniform1f(u.loc, v) : gl.uniform1fv(u.loc, v); break;
      case gl.FLOAT_VEC2: gl.uniform2fv(u.loc, v); break;
      case gl.FLOAT_VEC3: gl.uniform3fv(u.loc, v); break;
      case gl.FLOAT_VEC4: gl.uniform4fv(u.loc, v); break;
      case gl.INT:
      case gl.BOOL: gl.uniform1i(u.loc, v); break;
      case gl.UNSIGNED_INT: gl.uniform1ui(u.loc, v); break;
      case gl.FLOAT_MAT4: gl.uniformMatrix4fv(u.loc, false, v); break;
      case gl.SAMPLER_2D:
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, v);
        gl.uniform1i(u.loc, unit++);
        break;
      default: throw new Error(`${prog.name}: unhandled uniform type for ${key}`);
    }
  }
}

export function createTexture(gl, w, h, internalFormat, filter = gl.NEAREST) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texStorage2D(gl.TEXTURE_2D, 1, internalFormat, w, h);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

// A framebuffer over one or more colour textures, optionally with a depth buffer.
export function createTarget(gl, w, h, textures, withDepth = false) {
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  textures.forEach((t, i) => gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0));
  let depth = null;
  if (withDepth) {
    depth = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
  }
  gl.drawBuffers(textures.map((_, i) => gl.COLOR_ATTACHMENT0 + i));
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (status !== gl.FRAMEBUFFER_COMPLETE) throw new Error(`Framebuffer incomplete (0x${status.toString(16)})`);
  return { fb, textures, tex: textures[0], depth, w, h };
}

export function destroyTarget(gl, target) {
  if (!target) return;
  gl.deleteFramebuffer(target.fb);
  target.textures.forEach((t) => gl.deleteTexture(t));
  if (target.depth) gl.deleteRenderbuffer(target.depth);
}
