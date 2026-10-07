# Twirling Lights — cosmic beauty lab

Seven experiments share a fascination with cosmic beauty, from abstract light and motion to astronomical forms. Switch between **Attractor**, **Cosmos**, **Accretion**, **Veil Nebula**, **Stellar Bloom**, **Ring Worlds**, and **Binary Stars** using the top tabs. Each tab keeps its controls and state while you explore another; inactive scenes stop rendering.

Particles of light pulled by gravitational attractors: wormholes, yin-yang orbits, comets, galaxy mergers, supernova flashes to white, fades to dark. WebGL2, and the physics runs on the GPU (up to 2M particles).

**Live:** https://jelaludo.github.io/lab-twirling-lights/

## Run locally

ES modules need a local server:

```sh
python3 -m http.server 8917
# open http://localhost:8917
```

## Scenes and code export

- **Attractor:** the original GPU particle lab, with its presets, physics, palettes, and camera controls.
- **Cosmos:** Pillars of Creation, Butterfly Nebula, Ring Nebula, Oort Cloud, and Crab Pulsar from the supplied Cosmos sketch.
- **Accretion:** the supplied black-hole sketch with photon bending, disk emission, and edge-on, tilted, and top views.
- **Veil Nebula:** torn, luminous shells with amethyst, jade, and ember variations.
- **Stellar Bloom:** spiral gas petals in rose, blue iris, and golden palettes.
- **Ring Worlds:** banded gas giants with rings, atmospheric glow, and ring shadows.
- **Binary Stars:** orbiting suns with glowing coronas and a twisting gas stream.
- The four new tabs each have three presets plus primary/secondary color pickers, texture scale, density, shape variation, and the standard camera, motion, and exposure controls. Copy/export embeds all current values, the chosen preset, camera, and animation time.
- Cosmos and Accretion expose time speed, exposure, zoom, starlight, render quality, and pause/resume. Drag to change the camera. Reduced-motion preferences start these scenes paused.
- **Copy code** copies the active experiment as standalone HTML. If clipboard access is unavailable, a selectable code dialog opens.
- **Export HTML** downloads the same standalone file. Current controls and camera are included, along with the selected Cosmos scene. Cosmos and Accretion also preserve animation time. Attractor reconstructs the selected particle setup rather than saving every live particle position.
- Exports include all scripts, shaders, and styles; they open directly from disk without a server or external dependencies. The lab itself needs the local server below (or static hosting).
- These are artistic visualizations inspired by astronomy, not scientific prediction tools.

## Attractor controls

- **Presets**: keys `1`–`0`
- **Events**: `E` explode · `C` collapse · `W` fade to white · `D` fade to dark · `B` big-bang loop · `R` re-form · `Space` pause
- **Mouse**: drag to attract · shift-drag or right-drag to repel · ⌥-drag to orbit the view · scroll to zoom
- `H` hide the UI · `S` save a PNG · `X` randomize · `F` fullscreen
- The URL hash keeps the current settings, so a copied link recreates the scene. Double-click a label to reset that value.
- Console: `lab.params.swirl = 1.1`, `lab.act('explode')`

## Files

- `index.html`, `lab.css`, `src/lab.js`: shared tabs and standalone code export
- `veil.html`, `bloom.html`, `worlds.html`, `binary.html`: new procedural shaders and scene presets
- `src/celestial.js`, `celestial.css`: shared controls and rendering for the new scenes (inlined into standalone exports)
- `attractor.html`: original particle experiment
- `cosmos.html`, `accretion.html`: self-contained astronomical experiments and controls

- `src/params.js`: every variable (range, default) plus the presets and palettes
- `src/shaders.js`: simulation, particle rendering, event-horizon cores, bloom, tone-map
- `src/engine.js`: GPU passes · `src/director.js`: timed events · `src/ui.js`: panel · `src/main.js`: wiring
