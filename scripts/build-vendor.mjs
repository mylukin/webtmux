import * as esbuild from 'esbuild';
import { copyFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const entriesDir = join(__dirname, 'entries');
const outDir = join(rootDir, 'resources', 'js', 'vendor');

// Ensure output directory exists
if (!existsSync(outDir)) {
  mkdirSync(outDir, { recursive: true });
}

// Bundle configurations using wrapper entry files to preserve named exports
const bundles = [
  {
    entryPoints: [join(entriesDir, 'lit.js')],
    outfile: join(outDir, 'lit.js'),
  },
  {
    entryPoints: [join(entriesDir, 'lit-decorators.js')],
    outfile: join(outDir, 'lit-decorators.js'),
  },
  {
    entryPoints: [join(entriesDir, 'xterm.js')],
    outfile: join(outDir, 'xterm.js'),
  },
  {
    entryPoints: [join(entriesDir, 'xterm-addon-fit.js')],
    outfile: join(outDir, 'xterm-addon-fit.js'),
  },
  {
    entryPoints: [join(entriesDir, 'xterm-addon-webgl.js')],
    outfile: join(outDir, 'xterm-addon-webgl.js'),
  },
  {
    entryPoints: [join(entriesDir, 'xterm-addon-unicode11.js')],
    outfile: join(outDir, 'xterm-addon-unicode11.js'),
  },
];

console.log('Building vendor bundles...');

for (const config of bundles) {
  await esbuild.build({
    entryPoints: config.entryPoints,
    bundle: true,
    format: 'esm',
    minify: true,
    outfile: config.outfile,
  });
  console.log(`  Built: ${config.outfile.replace(rootDir, '.')}`);
}

// Copy xterm CSS
const xtermCssSrc = join(rootDir, 'node_modules', '@xterm', 'xterm', 'css', 'xterm.css');
const xtermCssDest = join(rootDir, 'resources', 'css', 'xterm.css');
copyFileSync(xtermCssSrc, xtermCssDest);
console.log(`  Copied: ./resources/css/xterm.css`);

console.log('Done!');
