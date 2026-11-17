// Bundles the «ثروة» 3D dice (three + cannon-es) into one lazy-loaded file for the old client:
//   node web/scripts/build-tharwa-dice.mjs   →   public/tharwa/dice3d.js
import { build } from 'rolldown';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = resolve(dirname(fileURLToPath(import.meta.url)), '..');
await build({
  input: resolve(web, 'src/games/tharwa3d/dice3d.ts'),
  output: { file: resolve(web, '..', 'public', 'tharwa', 'dice3d.js'), format: 'iife', minify: true },
  logLevel: 'warn',
});
console.log('built public/tharwa/dice3d.js');
