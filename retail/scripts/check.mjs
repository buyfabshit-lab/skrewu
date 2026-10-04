import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
for (const dir of ['public','server']) for (const file of readdirSync(resolve(root, dir))) {
  if (/\.(mjs|js)$/.test(file)) execFileSync(process.execPath, ['--check', resolve(root, dir, file)]);
}
for (const file of ['index.html','owner.html']) {
  const html = readFileSync(resolve(root, 'public', file), 'utf8');
  for (const [,asset] of html.matchAll(/(?:src|href)="([^"?#]+)(?:[?#][^"]*)?"/g)) {
    if (/^https?:/.test(asset)) continue;
    if (!existsSync(resolve(root, 'public', asset))) throw Error(`Missing ${asset}`);
  }
}
for (const forbidden of ['.env','preview.mjs','schema.sql','server']) if (existsSync(resolve(root, 'public', forbidden))) throw Error(`Private file published: ${forbidden}`);
const publicFiles = readdirSync(resolve(root,'public'));
const allowed = ['index.html','owner.html','shop.js','owner.js','shared.js','design-bridge.js','design-import.js','styles.css','favicon.svg','death-corps.ttf','_headers'];
if (publicFiles.some(f => !allowed.includes(f))) throw Error('Unexpected public file');
console.log('Retail scripts, page links, assets and public boundary checked.');
