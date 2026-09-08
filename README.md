# MRP Lumen

A Tampermonkey cosmetic userscript for `https://starblast.io/`. Local to your browser, with no login or network interception. This is an original visual pack, not an ECP replacement or unlock.

## Install

1. In Tampermonkey, open **Dashboard > Utilities > Import from file** and choose `Starblast-MRP.user.js` from Downloads.
2. Confirm installation and reload Starblast. Disable older MRP or other ship-rendering userscripts to avoid competing modifications.
3. Open the **MRP** button at the bottom-left. Select a look, then adjust its controls while playing.

If Tampermonkey says scripts cannot run, follow its browser-specific instructions for enabling user scripts/site access. MRP needs page-context execution to access Three.js; it does not request account permissions.

## Controls

- **Shift+M:** show/hide the settings panel.
- **Alt+M:** enable/disable cosmetic effects immediately.
- **Hull & lighting:** your hull color, tint, rim color, brightness, spread, and pulse.
- **Laser design:** body/detail colors, five patterns, detail intensity/width, and animation.
- **Apply to:** own confirmed laser emissions by default; optionally all rendered laser particles.
- **Personal presets:** four built-in looks, eight saved looks, and JSON export/import.
- **Badge:** an original MRP SVG crest on your settings dock; the SVG can also be downloaded separately.
- **Reconnect adapter:** discard MRP render resources and reconnect after a render-settings change.

Settings are stored under `mrp.lumen.cosmetics.v1` in this browser's Starblast local storage. Export a JSON preset to keep a separate backup. Imported JSON is validated, never evaluated as code.

## What The Effects Actually Do

Hull tint and rim lighting follow the local player's actual hull mesh, rather than a guessed screen-center overlay. The adapter reacquires that mesh when your ship changes. Standard Lambert, Phong, and Standard materials are supported; incompatible/custom materials are skipped.

Laser patterns are drawn inside native laser particle sprites. The helix/crescent shapes do **not** bend the actual flight path or extend bullet range. Laser impact particles use the same rendering pool. Missiles, rockets, mines, special weapon systems and anything outside that pool are not restyled.

Own-shot styling is enabled only for render records with an explicitly matching local ship ID. Already-existing or unclassified shots keep their original appearance. Firing a new primary shot gives the adapter a chance to identify it; it never guesses ownership from position or color.

The MRP title emblem is personal UI artwork. Other players do not see it; it does not add an official badge to your public nameplate. ECP entitlements, matchmaking, gameplay, server traffic and ads are untouched.

## Compatibility And Honesty

The adapter is based on the public client inspected on 2026-09-08: Three.js r85 and its exposed `Laserticles` rendering bridge. Those obfuscated client identifiers are not an official stable API. A game update or another renderer-modifying extension can prevent integration. The panel reports that state and does not substitute a misleading whole-screen filter.

There is no claim of compatibility with every future ship, every weapon, or every game build. Laser alpha, depth testing, particle size, position, lifetime, and game simulation are preserved. The additional hull rim respects hull visibility and material opacity; its spread is a visual shell, not a changed hitbox. Scene/material substitutions are restored after each foreground rendering call.

The script checks custom shader linking before selecting those materials for live rendering. Rejected shaders keep the native effect. This is a runtime precaution, not proof of compatibility with every browser/GPU or a replacement for your own testing.

The style preview is an illustration, not a readout of the game or proof the adapter is attached. Check the panel's renderer status separately.

The script was researched and reviewed as source, but was **not run in a game or browser-tested** because you asked to handle testing yourself. Local-only does not imply official approval; follow the game's rules.

To remove it, disable/delete **Starblast MRP Lumen - Local Cosmetics** in Tampermonkey and reload the page. No other application, browser proxy, or system setting is installed.

## Sources

- Public live client and rendering schema: https://starblast.io/
- Renderer implementation for the matching revision: https://raw.githubusercontent.com/mrdoob/three.js/r85/src/renderers/WebGLRenderer.js
- Official modding documentation (separate from this local adapter): https://github.com/pmgl/starblast-modding
