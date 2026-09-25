import { createContext, createProgram, use, createTexture, createTarget, destroyTarget } from './gl.js';
import * as S from './shaders.js';
import { Camera } from './camera.js';

// Owns the GPU: particle state textures, the HDR light buffer, and the bloom chain.
export class Engine {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = (this.gl = createContext(canvas));
    gl.bindVertexArray(gl.createVertexArray()); // every draw is attribute-less
    this.programs = {
      sim: createProgram(gl, 'sim', S.FULLSCREEN_VS, S.SIM_FS),
      particles: createProgram(gl, 'particles', S.PARTICLE_VS, S.PARTICLE_FS),
      glyph: createProgram(gl, 'glyph', S.GLYPH_VS, S.GLYPH_FS),
      fade: createProgram(gl, 'fade', S.FULLSCREEN_VS, S.FADE_FS),
      down: createProgram(gl, 'down', S.FULLSCREEN_VS, S.DOWN_FS),
      up: createProgram(gl, 'up', S.FULLSCREEN_VS, S.UP_FS),
      composite: createProgram(gl, 'composite', S.FULLSCREEN_VS, S.COMPOSITE_FS),
    };
    this.camera = new Camera();
    this.state = null;
    this.frame = null;
    this.stepSeed = 1;
  }

  setCount(count) {
    const { gl } = this;
    const side = Math.ceil(Math.sqrt(count));
    if (this.state?.side === side) {
      this.state.count = count;
      return;
    }
    this.state?.targets.forEach((t) => destroyTarget(gl, t));
    const make = () =>
      createTarget(gl, side, side, [createTexture(gl, side, side, gl.RGBA32F), createTexture(gl, side, side, gl.RGBA32F)]);
    this.state = { side, count, targets: [make(), make()], cur: 0 };
  }

  resize(w, h) {
    const { gl } = this;
    if (this.frame?.w === w && this.frame?.h === h) return;
    if (this.frame) {
      destroyTarget(gl, this.frame.accum);
      this.frame.bloom.forEach((t) => destroyTarget(gl, t));
    }
    const accum = createTarget(gl, w, h, [createTexture(gl, w, h, gl.RGBA16F, gl.LINEAR)], true);
    const bloom = [];
    let bw = w, bh = h;
    while (bloom.length < 7) {
      bw = Math.max(1, bw >> 1);
      bh = Math.max(1, bh >> 1);
      bloom.push(createTarget(gl, bw, bh, [createTexture(gl, bw, bh, gl.RGBA16F, gl.LINEAR)]));
      if (bw <= 8 || bh <= 8) break;
    }
    this.frame = { w, h, accum, bloom };
    this.clearLight();
  }

  clearLight() {
    const { gl } = this;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.frame.accum.fb);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  // One simulation step (or, with uReset = 1, re-form every particle at its starting shape).
  step(uniforms) {
    const { gl, state } = this;
    const src = state.targets[state.cur];
    const dst = state.targets[1 - state.cur];
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb);
    gl.viewport(0, 0, state.side, state.side);
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    use(this.programs.sim, {
      ...uniforms,
      uS0: src.textures[0],
      uS1: src.textures[1],
      uSide: state.side,
      uStepSeed: (this.stepSeed = (this.stepSeed + 1) >>> 0),
    });
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    state.cur = 1 - state.cur;
  }

  // Draw one frame of light. `accumulate: false` reuses the existing light buffer (paused).
  render(r) {
    const { gl, state, frame, programs: P } = this;
    const cur = state.targets[state.cur];
    const shared = { uNA: r.attractorCount, uA: r.attractors, uWell: r.well, uVP: this.camera.viewProj };

    if (r.accumulate) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, frame.accum.fb);
      gl.viewport(0, 0, frame.w, frame.h);
      gl.depthMask(true);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.disable(gl.DEPTH_TEST);

      if (r.decay <= 0) {
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
      } else {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ZERO, gl.SRC_COLOR); // light *= decay
        use(P.fade, { uDecay: r.decay });
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }

      const cores = r.attractorCount > 0 && r.core !== 'none' && r.horizon > 0.001;
      const voids = cores && r.core === 'void';
      const glyph = {
        ...shared,
        uHorizon: r.horizon,
        uR: r.horizon * (voids ? 2.6 : 5.5),
        uStyle: voids ? 0 : 1,
        uColor: r.coreColor,
        // Cores are redrawn every frame into the trail buffer; scale so they settle at uGlow
        // instead of piling up to uGlow / (1 - decay).
        uGlow: r.coreGlow * (r.decay > 0 ? 1 - r.decay : 1),
      };

      // Event horizons are drawn first as black, depth-writing discs so light behind them is hidden.
      if (voids) {
        gl.disable(gl.BLEND);
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LESS);
        use(P.glyph, { ...glyph, uPass: 0 });
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, r.attractorCount);
      }

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.depthMask(false);
      use(P.particles, {
        ...shared,
        ...r.particles,
        uS0: cur.textures[0],
        uS1: cur.textures[1],
        uSide: state.side,
        uCamDist: this.camera.distance,
      });
      gl.drawArrays(gl.POINTS, 0, state.count);

      gl.disable(gl.DEPTH_TEST);
      if (cores) {
        use(P.glyph, { ...glyph, uPass: 1 });
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, r.attractorCount);
      }
      gl.depthMask(true);

      // Halo: blur the light down a mip chain and back up.
      gl.disable(gl.BLEND);
      let src = frame.accum;
      for (const level of frame.bloom) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, level.fb);
        gl.viewport(0, 0, level.w, level.h);
        use(P.down, { uSrc: src.tex, uTexel: [1 / src.w, 1 / src.h] });
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        src = level;
      }
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      for (let i = frame.bloom.length - 1; i > 0; i--) {
        const from = frame.bloom[i];
        const to = frame.bloom[i - 1];
        gl.bindFramebuffer(gl.FRAMEBUFFER, to.fb);
        gl.viewport(0, 0, to.w, to.h);
        use(P.up, { uSrc: from.tex, uTexel: [1 / from.w, 1 / from.h], uWeight: r.haloSpread });
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
    }

    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    use(P.composite, { ...r.composite, uAccum: frame.accum.tex, uBloom: frame.bloom[0].tex });
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
