const names = [...document.querySelectorAll('[role=tab]')].map(button => button.dataset.scene);
const frames = new Map();
const buttons = [...document.querySelectorAll('[role=tab]')];
let current;
let statusTimer;
function status(message) {
  document.querySelector('#status').textContent = message;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => document.querySelector('#status').textContent = '', 4000);
}
function select(name) {
  if (!names.includes(name)) name = 'attractor';
  current = name;
  if (!frames.has(name)) {
    const frame = document.createElement('iframe');
    frame.id = `scene-${name}`;
    frame.title = `${name[0].toUpperCase() + name.slice(1)} experiment`;
    frame.setAttribute('role', 'tabpanel');
    frame.setAttribute('aria-labelledby', `tab-${name}`);
    frame.src = `${name}.html${name === 'attractor' ? location.hash : ''}`;
    frame.addEventListener('load', () => frame.contentWindow.postMessage({type:'lab-active', active:current === name}, location.origin));
    frames.set(name, frame);
    document.querySelector('#experiments').append(frame);
  }
  for (const [id, frame] of frames) {
    frame.hidden = id !== name;
    frame.contentWindow.postMessage({type:'lab-active', active:id === name}, location.origin);
  }
  for (const button of buttons) {
    const selected = button.dataset.scene === name;
    button.setAttribute('aria-selected', String(selected));
    button.tabIndex = selected ? 0 : -1;
  }
  const url = new URL(location.href);
  url.searchParams.set('tab', name);
  history.replaceState(null, '', url);
}
buttons.forEach((button, i) => {
  button.onclick = () => select(button.dataset.scene);
  button.onkeydown = event => {
    let next;
    if (event.key === 'ArrowRight') next = (i + 1) % names.length;
    if (event.key === 'ArrowLeft') next = (i + names.length - 1) % names.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = names.length - 1;
    if (next === undefined) return;
    event.preventDefault(); buttons[next].focus(); select(names[next]);
  };
});
addEventListener('message', event => {
  if (event.source !== frames.get('attractor')?.contentWindow || event.data?.type !== 'lab-hash') return;
  const url = new URL(location.href); url.hash = event.data.hash;
  history.replaceState(null, '', url);
});
select(new URLSearchParams(location.search).get('tab') || 'attractor');

async function read(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Could not read ${path}`);
  return response.text();
}
const safeScript = code => code.replace(/<\/script/gi, '<\\/script');
async function sceneCode(name, state) {
  let html = await read(`${name}.html`);
  if (html.includes('src="src/celestial.js"')) {
    const [css, script] = await Promise.all([read('celestial.css'), read('src/celestial.js')]);
    html = html.replace('<link rel="stylesheet" href="celestial.css">', () => `<style>${css}</style>`)
      .replace('<script src="src/celestial.js"></script>', () => `<script>${safeScript(script)}</script>`);
  }
  if (name !== 'attractor') {
    return html.replace(/(<script id="scene-settings" type="application\/json">)[\s\S]*?(<\/script>)/,
      (_, start, end) => start + JSON.stringify(state).replace(/</g, '\\u003c') + end);
  }
  const files = ['gl', 'shaders', 'camera', 'engine', 'params', 'director', 'ui', 'main'];
  const sources = await Promise.all(files.map(file => read(`src/${file}.js`)));
  // Bundle this lab's named ES modules into isolated scopes; no server or dependencies needed.
  const bundled = sources.map((source, i) => {
    const exports = [...source.matchAll(/export (?:const|class|function) (\w+)/g)].map(match => match[1]);
    source = source.replace(/import\s+\{([\s\S]*?)\}\s+from '\.\/(\w+)\.js';/g,
      (_, members, module) => `const {${members}} = modules.${module};`)
      .replace(/import \* as (\w+) from '\.\/(\w+)\.js';/g, 'const $1 = modules.$2;')
      .replace(/\bexport (?=const|class|function)/g, '');
    return `modules.${files[i]} = (() => {\n${source}\nreturn {${exports.join(',')}};\n})();`;
  }).join('\n');
  html = html.replace('<link rel="stylesheet" href="styles.css">', () => `<style>${state.css}</style>`);
  return html.replace('<script type="module" src="src/main.js"></script>', () =>
    `<script>window.__LAB_INITIAL_HASH__=${JSON.stringify(state.hash)};window.__LAB_INITIAL_YAW__=${JSON.stringify(state.yaw??0)};\nconst modules={};\n${safeScript(bundled)}\n</script>`);
}
async function exportCode(copy) {
  const name = current;
  const lab = frames.get(name)?.contentWindow.lab;
  if (!lab) { status('The scene is still starting. Try again in a moment.'); return; }
  const state = name === 'attractor' ? {hash:lab.getHash(),yaw:lab.getYaw()} : lab.getSettings();
  try {
    status('Preparing standalone HTML…');
    if (name === 'attractor') state.css = await read('styles.css');
    const code = await sceneCode(name, state);
    if (copy) {
      try { await navigator.clipboard.writeText(code); status('Code copied — save as an .html file.'); }
      catch {
        const dialog = document.querySelector('#code-dialog');
        dialog.querySelector('textarea').value = code;
        dialog.showModal(); dialog.querySelector('textarea').select();
        status('Select and copy the code below.');
      }
    } else {
      const url = URL.createObjectURL(new Blob([code], {type:'text/html'}));
      const link = document.createElement('a'); link.href = url; link.download = `twirling-lights-${name}.html`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      status('Standalone HTML exported with your settings.');
    }
  } catch (error) { status(`Export failed: ${error.message}`); }
}
document.querySelector('#copy').onclick = () => exportCode(true);
document.querySelector('#download').onclick = () => exportCode(false);
document.querySelector('#select-code').onclick = () => document.querySelector('textarea').select();
