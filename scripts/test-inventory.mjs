import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.filter(e => !['node_modules','.next','.git'].includes(e.name)).map(async e => e.isDirectory() ? walk(path.join(dir,e.name)) : [path.join(dir,e.name)]));
  return nested.flat();
}
const files = (await walk(root)).filter(file => /\.test\.(ts|tsx)$/.test(file));
const cases = [];
for (const file of files) {
  const text = await readFile(file, 'utf8');
  for (const match of text.matchAll(/\b(?:test|it)\s*\(\s*(['"`])([^'"`]+)\1/g)) cases.push({ file: path.relative(root,file).replaceAll('\\','/'), name: match[2] });
}
const inventory = { generatedAt: new Date().toISOString(), discoveredTestCount: cases.length, tests: cases };
await writeFile(path.join(root,'tmp-test-inventory.json'), JSON.stringify(inventory,null,2));
console.log(JSON.stringify({ discoveredTestCount: cases.length, inventory: 'tmp-test-inventory.json' }));
