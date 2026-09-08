# MASSIVE PROMPT FOR AI - Fix and Massively Upgrade Starblast MRP Lumen

You are an expert Three.js / Tampermonkey userscript engineer. Your job is to fix and massively upgrade this local-only Starblast cosmetic pack.

## REPO
https://github.com/Tech-God12/mrp-lumen
Local: Starblast-MRP.user.js
Badge: MRP-Lumen-badge.svg
README: README.md

## CURRENT STATE (READ THESE FILES FIRST)
- Main script: Starblast-MRP.user.js (v1.0.0) - Works but has critical UX bugs shown in screenshot.
- Built for https://starblast.io/ which uses Three.js r85, WebGLRenderer, Laserticles (pooled THREE.Points for lasers), and native hull is THREE.Geometry (not BufferGeometry) with MeshLambertMaterial by default.
- Personal cosmetic overlay, NOT ECP unlock, NOT cheat, NOT network interception.

## WHAT USER REPORTED (MUST FIX ALL)
1. **Preview is misleading:** Shows a separate preview ship - user says "you created a whole new ship". REMOVE the separate preview canvas entirely. Show a tiny live inline swatch instead, or remove preview. Do NOT create new geometry; style the EXISTING hull.

2. **Ship effect is wrong:** User wants ECP-like: **little stripes and a different colour for the ship** - subtle hull recolor + thin stripes, NOT a whole new ship model, NOT big rim shell. Fix prepareShip() to:
   - Hull tint that multiplies native .color / .emissive without replacing model.
   - Thin stripe pattern via valid r85-compatible tweak. Keep it subtle like official ECP.
   - Preserve native opacity, textures. If you keep rim, make it OFF by default and label "Experimental rim".

3. **Bullets wrong:** Wants bullets with "little curves and special types of bullets" and "zigzag effect" like real ECP/ACP. Current helix/crescent patterns inside sprites are okay but must be:
   - Clearly labeled as VISUAL ONLY inside particle sprite, NOT trajectory.
   - Add a dedicated "zigzag" pattern that looks like small stripes/zigzag across the bullet sprite. Make it the DEFAULT pattern (not crescent).
   - Keep it in same pooled Points - do NOT change speed/position/lifetime/depth. Keep ownership mask (own shots default).

4. **Hotkeys broken:** Screenshot shows panel open but user says Alt+M does nothing. Fix:
   - Alt+M must visibly toggle effects ON/OFF with toast + dock status change, immediate visual update.
   - Shift+M must open/close panel reliably even when game has focus. Fix focus restoration bugs.
   - ADD A BIG VISIBLE "EFFECTS ON/OFF" BUTTON at top of panel (not just checkbox). User explicitly asked for it.

5. **Window management:** User hates 2 separate windows - wants 1 window with different tabs, not new window every time. Ensure Tampermonkey panel is SINGLE instance, not duplicated. For any launcher scripts, use `-w Freebuff` named window, not `-w new` per launch. Do not spawn duplicate docks/panels.

6. **UI is "way too small and underwhelming":** Massive UI upgrade needed:
   - Make panel 30-40% larger by default (min-width 560px), larger fonts, larger color pickers, larger sliders.
   - Premium dark theme with better spacing, card sections, and live color preview dots.
   - Live value readouts next to every slider (already partially done, make them bigger and with units).
   - Ship/laser sections should have inline mini-previews (small canvas swatches, not full ship illustration).
   - Make selected preset visually highlighted.

## TECHNICAL CONSTRAINTS (DO NOT BREAK)
- Keep Three.js r85 compatibility: no Material.version, use needsUpdate + shader preflight. Already has compileEffect() - keep it but fix hull geometry check (already fixed for Geometry vs BufferGeometry).
- Keep borrowed BufferAttribute handling: detach before dispose.
- Keep strict shipid === localId ownership, mask fill(0) on unknown.
- Keep host style fixes (all:initial + explicit font/color on host).
- Keep pointer/key release tracking for focus bugs.
- Keep storage key mrp.lumen.cosmetics.v1, validated sanitize(), max 8 customs, 64KB import limit, no eval.
- Keep @run-at document-end, @sandbox raw.
- NEVER add: ECP unlock, auth bypass, network fetch interception, ad blocking, or gameplay stat changes.

## TASK STEPS
1. Read Starblast-MRP.user.js fully. Read README. Inspect live starblast.io renderer only via source inspection (no game running needed, but you may inspect public JS).
2. Apply fixes 1-5 above with minimal diff. Remove preview canvas code and its animation frame. Simplify prepareShip to tint-only + optional subtle stripes. Add zigzag fragment pattern as first pattern option.
3. Add the big toggle button + fix hotkeys + ensure panel not duplicated (check window[KEY] guard).
4. Massively upgrade UI CSS: larger panel, better hierarchy, animated hover, bigger hit targets, clearer "Only you see this" disclaimer.
5. Test syntax: node --check Starblast-MRP.user.js (should be no errors). Do NOT launch game or Tampermonkey - user will test.
6. Commit and push to https://github.com/Tech-God12/mrp-lumen on master branch.

## ACCEPTANCE CRITERIA
- No new ship model created; existing hull recolored in-place.
- Thin stripes visible on hull when ship customization on.
- Zigzag stripe pattern visible on laser sprites, default selected.
- Alt+M and Shift+M work from gameplay focus; big toggle button works.
- Panel ~35% larger, not cramped.
- Only one dock/panel ever exists.
- Git push succeeds, README updated to reflect new controls.

DO NOT ask for clarification. Execute and push.
