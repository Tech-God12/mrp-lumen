// Parses every GLSL snippet the userscript injects as GLSL ES 1.0 (WebGL 1 / Three.js r85).
// A parse failure here means the shader could never link in the game.
import { parse } from '@shaderfrog/glsl-parser';
import fs from 'fs';

const src = fs.readFileSync(new URL('../Starblast-MRP.user.js', import.meta.url), 'utf8');
const grab = name => {
  const match = src.match(new RegExp('const ' + name + ' = `([\\s\\S]*?)`;'));
  return match ? match[1] : null;
};

// Stand-ins for the symbols the native Starblast shader already declares.
const FRAG_PRELUDE = 'precision highp float;\nvarying float co; varying float si;\n';
const NATIVE_FN = 'void mrpNativeFragment() { gl_FragColor = vec4(1.0); }\n';
const VERT_PRELUDE = 'precision highp float;\n';

const cases = [
  ['LASER_FRAGMENT', FRAG_PRELUDE + NATIVE_FN + grab('LASER_FRAGMENT')],
  ['STRIPE_VERTEX', VERT_PRELUDE + grab('STRIPE_VERTEX')],
  ['STRIPE_FRAGMENT', FRAG_PRELUDE + grab('STRIPE_FRAGMENT')],
];
const rim = src.match(/vertexShader: `([\s\S]*?)`,\s*\n\s*fragmentShader: `([\s\S]*?)`,/);
if (rim) {
  cases.push(['RIM_VERTEX', VERT_PRELUDE + rim[1]]);
  cases.push(['RIM_FRAGMENT', FRAG_PRELUDE + rim[2]]);
}

let failed = 0;
for (const [name, code] of cases) {
  if (!code) { failed++; console.log(`FAIL  ${name} (snippet not found)`); continue; }
  try { parse(code, { quiet: true }); console.log(`PASS  ${name}`); }
  catch (error) { failed++; console.log(`FAIL  ${name}: ${String(error.message).split('\n')[0]}`); }
}
console.log(failed ? `\n${failed} shader(s) failed` : `\nall ${cases.length} shaders parse as GLSL ES 1.0`);
process.exit(failed ? 1 : 0);
