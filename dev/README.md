# dev/ - local checks and UI harness

Nothing in this folder ships with the userscript. `Starblast-MRP.user.js` stays a single
dependency-free file; these helpers only make it reviewable without a game session.

## Panel harness

```
python3 dev/serve.py 8000     # open http://localhost:8000/
```

Renders the dock, panel, tabs and live swatches on a plain starfield page. There is no
Three.js renderer there, so the adapter reports "waiting" by design and hull/laser effects
cannot be demonstrated - only the interface.

## Headless checks

They need two dev-only packages, installed wherever you like:

```
npm install jsdom @shaderfrog/glsl-parser
node --check Starblast-MRP.user.js   # syntax
node dev/test-glsl.mjs               # every injected shader parses as GLSL ES 1.0
node dev/test-ui.mjs                 # panel, hotkeys, tabs, single-instance guard
node dev/test-adapter.mjs            # render hook against a mocked r85 / Laserticles
```

`test-adapter.mjs` fakes only the slice of the client the script inspects, and asserts the
important safety property: the game's hull material, scene graph, laser material and laser
geometry are all restored after every frame, and after `dispose()`.

These are smoke tests against mocks. They are not a substitute for testing in the real
client with Tampermonkey.
