import { spawn } from 'node:child_process';
import fs from 'node:fs';

const path = process.argv[2];
if (!path) throw new Error('Indicar archivo local con OPENAI_API_KEY.');
const content = fs.readFileSync(path, 'utf8');
const line = content.split(/\r?\n/).find((item) => /^\s*OPENAI_API_KEY\s*=/.test(item));
const key = line?.split('=').slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
if (!key?.startsWith('sk-')) throw new Error('No se encontró una clave válida.');
const child = spawn(process.execPath, ['scripts/run-framework.mjs', 'dev', '--port', '4181'], {
  env: { ...process.env, OPENAI_API_KEY: key },
  stdio: 'inherit',
});
child.on('exit', (code) => { process.exitCode = code ?? 1; });
