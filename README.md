# MRP Lumen

A Tampermonkey cosmetic userscript for `https://starblast.io/`. Local to your browser, with no login or network interception. This is an original visual pack, not an ECP replacement or unlock.

Version 2.0.0 replaces the old "whole new ship" preview and heavy rim shell with an ECP-style look: a subtle recolour of your **existing** hull plus thin stripes, zigzag-patterned laser sprites, and a much larger tabbed panel.

## Install

1. In Tampermonkey, open **Dashboard > Utilities > Import from file** and choose `Starblast-MRP.user.js` from Downloads.
2. Confirm installation and reload Starblast. Disable older MRP or other ship-rendering userscripts to avoid competing modifications.
3. Open the **MRP** dock at the bottom-left, or press **Shift+M**. Select a look, then adjust its controls while playing.

If Tampermonkey says scripts cannot run, follow its browser-specific instructions for enabling user scripts/site access. MRP needs page-context execution to access Three.js; it does not request account permissions.

Upgrading from 1.0.0 needs no cleanup: the storage key is unchanged, old settings are re-validated, and any new option falls back to its default.

## Controls

- **Big EFFECTS ON / OFF button** at the top of the panel - the same switch as Alt+M, with a live status line under it.
- **Alt+M:** enable/disable cosmetic effects immediately. A toast appears and the dock label switches between `EFFECTS ON` and `EFFECTS OFF`.
- **Shift+M:** show/hide the panel. Opening by hotkey deliberately does **not** steal keyboard focus from the game; closing returns focus to the game canvas.
- **Esc:** close the panel while it has focus.
- **One window, four tabs** - Ship, Lasers, Presets, System. MRP never opens a second window, and only one dock/panel can exist per page: a reload or reinstall disposes the previous instance first.

### Ship tab

- **Hull finish + tint strength:** multiplies the colour of your real hull material. No replacement model is created; textures, shape and opacity stay native.
- **Stripes:** thin racing stripes painted on the game's own hull geometry - colour, count, thickness, opacity, drift and direction (auto/X/Y/Z).
- **Pulse speed / amount:** slow breathing of the tint and stripes.
- **Experimental rim (off by default):** the old additive rim shell, kept as an opt-in. It is a visual shell only; hitboxes are untouched.
- **Live swatch:** a small colour chip showing hull tint and stripe spacing. It is a swatch, not a ship illustration and not a game readout.

### Lasers tab

- **Patterns:** `zigzag` (default), `chevron`, `crescent`, `helix`, `prism`, `plasma`, or `native` tint only.
- **Body/detail colours**, detail intensity, detail width and pattern motion.
- **Apply to:** own confirmed laser emissions by default; optionally all rendered laser particles.
- Every pattern is drawn **inside the native particle sprite**. Speed, direction, range, lifetime, damage, depth and hitboxes are never modified - nothing bends an actual flight path.

### Presets and System tabs

- Four built-in looks (the matching one is highlighted), eight saved looks, and JSON export/import.
- Badge toggle, SVG badge download, **Reconnect adapter** after a render-settings change, reset, and diagnostics.

Settings are stored under `mrp.lumen.cosmetics.v1` in this browser's Starblast local storage. Export a JSON preset to keep a separate backup. Imported JSON is validated, never evaluated as code.

## What The Effects Actually Do

Hull tint and stripes follow the local player's actual hull mesh, rather than a guessed screen-center overlay. The adapter reacquires that mesh when your ship changes. Standard Lambert, Phong, and Standard materials are supported; incompatible/custom materials are skipped.

The stripe pass reuses the game's own hull geometry, draws thin lines along the model's longest axis (or the axis you pick), and is removed from the scene graph again at the end of every frame. Nothing is added to the ship permanently and no new geometry is allocated for it.

Laser patterns are drawn inside native laser particle sprites. The zigzag, chevron, helix and crescent shapes do **not** bend the actual flight path or extend bullet range. Laser impact particles use the same rendering pool. Missiles, rockets, mines, special weapon systems and anything outside that pool are not restyled.

Own-shot styling is enabled only for render records with an explicitly matching local ship ID. Already-existing or unclassified shots keep their original appearance. Firing a new primary shot gives the adapter a chance to identify it; it never guesses ownership from position or color.

The MRP title emblem is personal UI artwork. Other players do not see it; it does not add an official badge to your public nameplate. ECP entitlements, matchmaking, gameplay, server traffic and ads are untouched.

## Compatibility And Honesty

The adapter is based on the public client inspected on 2026-09-08: Three.js r85 and its exposed `Laserticles` rendering bridge. Those obfuscated client identifiers are not an official stable API. A game update or another renderer-modifying extension can prevent integration. The panel reports that state and does not substitute a misleading whole-screen filter.

There is no claim of compatibility with every future ship, every weapon, or every game build. Laser alpha, depth testing, particle size, position, lifetime, and game simulation are preserved. Scene/material substitutions are restored after each foreground rendering call, including when rendering throws.

The script checks custom shader linking before selecting those materials for live rendering. Rejected shaders keep the native effect - the stripe pass and the experimental rim are each gated separately. This is a runtime precaution, not proof of compatibility with every browser/GPU or a replacement for your own testing.

The inline swatches are indicative colour chips, not a readout of the game and not proof the adapter is attached. Check the panel's renderer status separately.

The script was researched and reviewed as source, and was syntax-checked plus exercised headlessly (DOM behaviour of the panel, hotkeys, single-instance guard, and GLSL ES 1.0 parsing of every shader). It was **not** run in a live game or Tampermonkey, because you asked to handle that testing yourself. Local-only does not imply official approval; follow the game's rules.

To remove it, disable/delete **Starblast MRP Lumen - Local Cosmetics** in Tampermonkey and reload the page. No other application, browser proxy, or system setting is installed.

## Developer Preview (optional)

`dev/panel-preview.html` renders the panel and dock on a plain starfield page so the UI can be reviewed without installing the userscript:

```
python3 dev/serve.py 8000      # then open http://localhost:8000/
```

There is no Three.js renderer on that page, so the adapter stays in "waiting" state by design; only the interface and swatches are exercised. The harness is a single page - MRP itself never spawns extra windows, and any launcher you wrap around it should reuse one named window rather than opening a new one per launch.

## Sources

- Public live client and rendering schema: https://starblast.io/
- Renderer implementation for the matching revision: https://raw.githubusercontent.com/mrdoob/three.js/r85/src/renderers/WebGLRenderer.js
- Official modding documentation (separate from this local adapter): https://github.com/pmgl/starblast-modding
