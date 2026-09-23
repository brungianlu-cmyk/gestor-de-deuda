import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const source = fs.readFileSync(path.join(root, '.env.local'), 'utf8');
const line = source.split(/\r?\n/).find((item) => /^\s*OPENAI_API_KEY\s*=/.test(item));
const key = line?.split('=').slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
if (!key?.startsWith('sk-')) throw new Error('Falta la clave local para la verificación.');
const bytes = Buffer.from(key, 'utf8');
const build = path.join(root, 'dist');
let scanned = 0;
const found = [];
function visit(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) visit(filename);
    else if (entry.isFile()) {
      scanned++;
      if (fs.readFileSync(filename).includes(bytes)) found.push(path.relative(root, filename));
    }
  }
}
visit(build);
console.log(JSON.stringify({ scanned, secretOccurrences: found.length, files: found }));
if (found.length) process.exitCode = 1;
