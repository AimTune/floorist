// Produce a single-file IIFE bundle so consumers can drop floorist into a
// page with one <script src=...>. The custom element registers itself as a
// side effect of loading; helpers live under the `Floorist` global.
//
//   <script src="dist/floorist.global.min.js"></script>
//   <floor-plan></floor-plan>
//   <script>
//     Floorist.registerType({...});            // optional
//     document.querySelector('floor-plan').load(myBuilding);
//   </script>
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { stat } from 'node:fs/promises';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = join(ROOT, 'dist', 'index.js');

const common = {
  entryPoints: [ENTRY],
  bundle: true,
  format: 'iife',
  globalName: 'Floorist',
  target: ['es2022'],
  platform: 'browser',
  // Re-export the module's exports onto window.Floorist while still running the
  // top-level customElements.define side effect.
  footer: { js: "if (typeof window !== 'undefined') { window.Floorist = Floorist; }" },
};

// No source maps for the IIFE bundles — the unminified file is the readable
// "source" version, and consumers debugging the min build can switch to it.
const outputs = [
  { outfile: join(ROOT, 'dist', 'floorist.global.js'), minify: false, sourcemap: false },
  { outfile: join(ROOT, 'dist', 'floorist.global.min.js'), minify: true, sourcemap: false },
];

const fmt = (n) => (n / 1024).toFixed(1) + ' KB';

for (const out of outputs) {
  await build({ ...common, ...out });
  const size = (await stat(out.outfile)).size;
  console.log(`bundle: ${out.outfile.replace(ROOT + '/', '')}  ${fmt(size)}${out.minify ? ' (min)' : ''}`);
}
