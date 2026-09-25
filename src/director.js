// Timed events layered over the simulation: explosions, collapse, fades, and the big-bang cycle.

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const approach = (value, target, rate, dt) => value + (target - value) * (1 - Math.exp(-rate * dt));

// Big-bang cycle timeline, in seconds.
const CYCLE = { form: 2, collapse: 9, ignite: 14, fade: 25, end: 28.5 };
const CHARGE = 0.22; // white bloom before the blast

export class Director {
  constructor() {
    this.collapse = false;
    this.whiteHold = false;
    this.darkHold = false;
    this.cycle = false;
    this.white = 0;
    this.dark = 0;
    this.boost = 1;       // gravity multiplier while collapsing
    this.gate = 1;        // gravity eases back in after an explosion
    this.flash = 0;
    this.charge = -1;     // seconds since an explosion was triggered; -1 when idle
    this.cycleT = 0;
    this.cycleIgnited = false;
  }

  explode() {
    if (this.charge < 0) this.charge = 0;
  }

  // Joins the loop just after the fade-in; each later lap re-forms the shapes from darkness.
  startCycle(on = !this.cycle) {
    this.cycle = on;
    this.cycleT = CYCLE.form;
    this.cycleIgnited = false;
    return on;
  }

  // Returns what this frame needs: envelopes for the renderer, gravity scale, and one-shot events.
  update(dt) {
    const out = { burst: false, reset: false };

    let cycleBoost = 1;
    let cycleDark = 0;
    if (this.cycle) {
      if (this.cycleT === 0) out.reset = true;
      this.cycleT += dt;
      const t = this.cycleT;
      cycleDark = 1 - smooth(0, CYCLE.form, t);
      cycleBoost = 1 + 5 * smooth(CYCLE.collapse, CYCLE.ignite, t) * (t < CYCLE.ignite + CHARGE ? 1 : 0);
      if (t >= CYCLE.ignite && !this.cycleIgnited) {
        this.cycleIgnited = true;
        this.explode();
      }
      cycleDark = Math.max(cycleDark, smooth(CYCLE.fade, CYCLE.end, t));
      if (t >= CYCLE.end) {
        this.cycleT = 0;
        this.cycleIgnited = false;
      }
    }

    if (this.charge >= 0) {
      this.charge += dt;
      this.flash = Math.max(this.flash, smooth(0, CHARGE, this.charge));
      if (this.charge >= CHARGE) {
        out.burst = true;
        this.charge = -1;
        this.gate = 0.12;
      }
    } else {
      this.flash *= Math.exp(-dt * 1.3);
    }

    this.gate = approach(this.gate, 1, 0.45, dt);
    this.boost = approach(this.boost, this.collapse ? 6 : 1, 1.2, dt);
    this.white = approach(this.white, this.whiteHold ? 1 : 0, 1.1, dt);
    this.dark = approach(this.dark, this.darkHold ? 1 : 0, 1.1, dt);

    out.white = Math.min(1, Math.max(this.white, this.flash));
    out.dark = Math.max(this.dark, cycleDark);
    out.gravity = this.boost * cycleBoost * this.gate;
    out.collapsing = this.boost * cycleBoost > 1.05;
    return out;
  }
}
