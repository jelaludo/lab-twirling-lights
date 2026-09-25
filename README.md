# Twirling Lights — attractor lab

Particles of light pulled by gravitational attractors: wormholes, yin-yang orbits, comets, galaxy mergers, supernova flashes to white, fades to dark. WebGL2, and the physics runs on the GPU (up to 2M particles).

**Live:** https://jelaludo.github.io/lab-twirling-lights/

## Run locally

ES modules need a local server:

```sh
python3 -m http.server 8917
# open http://localhost:8917
```

## Controls

- **Presets**: keys `1`–`0`
- **Events**: `E` explode · `C` collapse · `W` fade to white · `D` fade to dark · `B` big-bang loop · `R` re-form · `Space` pause
- **Mouse**: drag to attract · shift-drag or right-drag to repel · ⌥-drag to orbit the view · scroll to zoom
- `H` hide the UI · `S` save a PNG · `X` randomize · `F` fullscreen
- The URL hash keeps the current settings, so a copied link recreates the scene. Double-click a label to reset that value.
- Console: `lab.params.swirl = 1.1`, `lab.act('explode')`

## Files

- `src/params.js`: every variable (range, default) plus the presets and palettes
- `src/shaders.js`: simulation, particle rendering, event-horizon cores, bloom, tone-map
- `src/engine.js`: GPU passes · `src/director.js`: timed events · `src/ui.js`: panel · `src/main.js`: wiring
