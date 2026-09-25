// Control panel built from the parameter schema, plus the action dock and HUD.

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

const storage = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v == null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* private mode: preferences simply are not remembered */
    }
  },
};

export const DOCK = [
  { action: 'explode', label: 'Explode', key: 'E', hint: 'Flash to white and blast outward' },
  { action: 'collapse', label: 'Collapse', key: 'C', toggle: true, hint: 'Crank gravity until everything falls in' },
  { action: 'white', label: 'White', key: 'W', toggle: true, hint: 'Fade to pure white' },
  { action: 'dark', label: 'Dark', key: 'D', toggle: true, hint: 'Fade to darkness' },
  { action: 'cycle', label: 'Big bang', key: 'B', toggle: true, hint: 'Loop: form → collapse → explode → fade' },
  { action: 'reset', label: 'Reset', key: 'R', hint: 'Re-form the starting shapes' },
  { action: 'pause', label: 'Pause', key: 'Space', toggle: true },
];

export class Panel {
  constructor({ schema, specs, defaults, presets, params, onChange, onPreset, onAction }) {
    this.specs = specs;
    this.defaults = defaults;
    this.onChange = onChange;
    this.controls = new Map();
    this.dockButtons = new Map();
    this.presetChips = new Map();

    this.root = document.getElementById('panel');
    this.buildPresets(presets, onPreset);
    this.buildSections(schema);
    this.buildDock(onAction);

    this.root.querySelectorAll('[data-action]').forEach((b) =>
      b.addEventListener('click', () => onAction(b.dataset.action)),
    );
    this.hud = document.getElementById('hud-stats');
    this.set(params);
  }

  buildPresets(presets, onPreset) {
    const wrap = this.root.querySelector('.presets');
    Object.entries(presets).forEach(([name, preset], i) => {
      const chip = el('button', 'chip');
      chip.type = 'button';
      chip.append(el('span', null, preset.label), el('kbd', null, String((i + 1) % 10)));
      chip.title = `${preset.label} (${(i + 1) % 10})`;
      chip.addEventListener('click', () => onPreset(name));
      wrap.append(chip);
      this.presetChips.set(name, chip);
    });
  }

  buildSections(schema) {
    const scroll = this.root.querySelector('.scroll');
    const openState = storage.get('tl.sections', {});
    let rows = null;
    for (const spec of schema) {
      if (spec.section) {
        const details = el('details', 'section');
        details.open = openState[spec.section] ?? !!spec.open;
        const summary = el('summary', null, spec.section);
        if (spec.hint) summary.append(el('span', 'section-hint', spec.hint));
        details.append(summary);
        rows = el('div', 'rows');
        details.append(rows);
        details.addEventListener('toggle', () => {
          openState[spec.section] = details.open;
          storage.set('tl.sections', openState);
        });
        scroll.append(details);
        continue;
      }
      rows.append(this.buildRow(spec));
    }
  }

  buildRow(spec) {
    const row = el('div', `row row-${spec.type ?? 'range'}`);
    const id = `p-${spec.key}`;
    const label = el('label', null, spec.label);
    label.htmlFor = id;
    label.title = spec.hint ? `${spec.hint}\n(double-click to reset)` : 'Double-click to reset';
    label.addEventListener('dblclick', () => this.commit(spec, this.defaults[spec.key]));
    row.append(label);

    let control;
    if (spec.type === 'select') {
      const select = el('select');
      select.id = id;
      spec.options.forEach((o) => {
        const opt = el('option', null, o.label);
        opt.value = o.value;
        select.append(opt);
      });
      select.addEventListener('change', () => this.commit(spec, select.value));
      row.append(select);
      control = { set: (v) => (select.value = v) };
    } else if (spec.type === 'toggle') {
      const box = el('input', 'switch');
      box.type = 'checkbox';
      box.id = id;
      box.addEventListener('change', () => this.commit(spec, box.checked));
      row.append(box);
      control = { set: (v) => (box.checked = !!v) };
    } else {
      const range = el('input');
      range.type = 'range';
      range.id = id;
      const steps = spec.type === 'steps' ? spec.steps : null;
      range.min = steps ? 0 : spec.min;
      range.max = steps ? steps.length - 1 : spec.max;
      range.step = steps ? 1 : spec.step;
      const out = el('output');
      const show = (v) => {
        out.textContent = spec.fmt ? spec.fmt(v) : String(v);
        const pos = steps ? steps.indexOf(v) : v;
        const pct = ((pos - range.min) / (range.max - range.min)) * 100;
        range.style.setProperty('--fill', `${Math.min(100, Math.max(0, pct))}%`);
      };
      const read = () => (steps ? steps[+range.value] : +range.value);
      range.addEventListener('input', () => {
        show(read());
        this.commit(spec, read(), true);
      });
      range.addEventListener('change', () => this.commit(spec, read()));
      row.append(range, out);
      control = {
        set: (v) => {
          range.value = steps ? Math.max(0, nearestIndex(steps, v)) : v;
          show(steps ? steps[+range.value] : v);
        },
      };
    }
    if (spec.hint) row.title = spec.hint;
    this.controls.set(spec.key, control);
    return row;
  }

  // `live` = mid-drag; heavy changes (particle count) wait for the release.
  commit(spec, value, live = false) {
    if (live && spec.rebuild) return;
    this.controls.get(spec.key)?.set(value);
    this.onChange(spec.key, value);
  }

  set(params) {
    for (const [key, control] of this.controls) control.set(params[key]);
  }

  setValue(key, value) {
    this.controls.get(key)?.set(value);
  }

  setPreset(name) {
    for (const [n, chip] of this.presetChips) chip.classList.toggle('active', n === name);
  }

  buildDock(onAction) {
    const dock = document.getElementById('dock');
    for (const item of DOCK) {
      const b = el('button', 'dock-btn');
      b.type = 'button';
      b.append(el('span', null, item.label), el('kbd', null, item.key === 'Space' ? '␣' : item.key));
      b.title = item.hint ? `${item.hint} (${item.key})` : `${item.label} (${item.key})`;
      b.addEventListener('click', () => onAction(item.action));
      dock.append(b);
      this.dockButtons.set(item.action, b);
    }
  }

  setActive(action, on) {
    this.dockButtons.get(action)?.classList.toggle('active', !!on);
  }

  setStats(text) {
    this.hud.textContent = text;
  }
}

function nearestIndex(steps, v) {
  let best = 0;
  for (let i = 1; i < steps.length; i++) if (Math.abs(steps[i] - v) < Math.abs(steps[best] - v)) best = i;
  return best;
}

export function toast(message) {
  const t = document.getElementById('toast');
  t.textContent = message;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 1600);
}
