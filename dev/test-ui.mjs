// Headless DOM test for the MRP Lumen panel: hotkeys, big power button, tabs,
// preset highlighting, and the single-instance guard.
import { JSDOM } from 'jsdom';
import fs from 'fs';

const src = fs.readFileSync(new URL('../Starblast-MRP.user.js', import.meta.url), 'utf8');
const dom = new JSDOM('<!doctype html><html><body><div id="canvaswrapper"><canvas id="game"></canvas></div></body></html>',
  { url: 'https://starblast.io/', runScripts: 'outside-only', pretendToBeVisual: true });
const { window } = dom;
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });

const checks = [];
const check = (name, ok, extra = '') => checks.push([name, ok, extra]);
const errors = [];
window.addEventListener('error', e => errors.push(e.message));
window.eval(src);

const host = window.document.getElementById('mrp-lumen-local');
check('host element created', Boolean(host));
const sr = host.shadowRoot;
const $ = s => sr.querySelector(s);
const all = s => [...sr.querySelectorAll(s)];
const click = el => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const key = init => window.document.getElementById('game')
  .dispatchEvent(new window.KeyboardEvent('keydown', { bubbles: true, cancelable: true, composed: true, ...init }));

check('single dock + single panel', all('#dock').length === 1 && all('#panel').length === 1);
check('big EFFECTS button exists', Boolean($('#power')) && $('#power-text').textContent === 'EFFECTS ON');
check('separate preview canvas removed', !$('#preview'));
check('inline swatches present', all('canvas.mini').length === 2);
check('four tabs, ship selected', all('[data-tab]').length === 4 && $('[data-tab=ship]').getAttribute('aria-selected') === 'true');
check('only one tab panel visible', all('[data-panel]').filter(p => !p.hidden).length === 1);
check('zigzag is the default pattern', $('[data-key=pattern]').value === 'zigzag' &&
  [...$('[data-key=pattern]').options][0].value === 'zigzag');
check('experimental rim off by default', $('[data-key=rimEnabled]').checked === false);
check('stripes on by default', $('[data-key=stripes]').checked === true);
check('stripe controls exposed', ['stripeDensity', 'stripeWidth', 'stripeOpacity', 'stripeFlow']
  .every(k => sr.querySelector(`input[data-key=${k}]`)));
check('slider readouts carry units', $('output[data-value=tint]').value.endsWith('%') &&
  $('output[data-value=stripeDensity]').value.endsWith('lines'));
check('matching built-in preset highlighted', all('[data-preset].active').length > 0);

key({ code: 'KeyM', key: 'm', altKey: true });
check('Alt+M turns effects off', $('#power-text').textContent === 'EFFECTS OFF' &&
  $('#dock-status').textContent === 'EFFECTS OFF' && $('#toast').classList.contains('show'));
key({ code: 'KeyM', key: 'm', altKey: true });
check('Alt+M turns effects back on', $('#power-text').textContent === 'EFFECTS ON');

check('panel starts open', $('#panel').hidden === false);
key({ code: 'KeyM', key: 'M', shiftKey: true });
check('Shift+M closes panel from game focus', $('#panel').hidden === true);
key({ code: 'KeyM', key: 'M', shiftKey: true });
check('Shift+M reopens panel', $('#panel').hidden === false);
check('hotkey open does not steal focus', !host.contains(window.document.activeElement));

click($('[data-tab=laser]'));
check('tab switching works', $('[data-panel="laser"]').hidden === false && $('[data-panel="ship"]').hidden === true);

click($('#power'));
check('power button toggles off', $('#power-text').textContent === 'EFFECTS OFF' && $('#power').classList.contains('off'));
click($('#power'));

click($('[data-preset=Solar]'));
check('preset applies and highlights', $('[data-key=pattern]').value === 'chevron' &&
  all('[data-preset].active').every(b => b.dataset.preset === 'Solar'));

window.eval(src);
check('re-injection leaves exactly one host', window.document.querySelectorAll('#mrp-lumen-local').length === 1);

check('no runtime errors', errors.length === 0, errors.join(' | '));

window.__MRP_LUMEN_LOCAL_V1__.dispose();
check('dispose removes the UI', window.document.querySelectorAll('#mrp-lumen-local').length === 0);

let failed = 0;
for (const [name, ok, extra] of checks) {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  (' + extra + ')' : ''}`);
}
console.log(failed ? `\n${failed} check(s) failed` : `\nall ${checks.length} checks passed`);
window.close();
process.exit(failed ? 1 : 0);
