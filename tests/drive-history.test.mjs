import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DriveHistory } from '../lib/drive-history.ts';

test('archiva el PDF, cada llamada y el resultado en una carpeta del mismo procesamiento', async () => {
  const files = new Map();
  let nextId = 1;
  const json = (value, status = 200) => Response.json(value, { status });
  const create = (metadata, content = '') => {
    const id = `file-${nextId++}`;
    files.set(id, { ...metadata, id, content });
    return json({ id });
  };
  const mockFetch = async (input, init = {}) => {
    const url = new URL(input);
    if (url.hostname === 'oauth2.googleapis.com') return json({ access_token: 'test-token' });
    assert.equal(init.headers?.Authorization, 'Bearer test-token');
    if (url.pathname === '/drive/v3/files' && init.method === 'POST') {
      return create(JSON.parse(init.body));
    }
    if (url.pathname === '/upload/drive/v3/files' && init.method === 'POST') {
      const boundary = init.headers['Content-Type'].split('boundary=')[1];
      const parts = (await new Response(init.body).text()).split(`--${boundary}`);
      const metadata = JSON.parse(parts[1].split('\r\n\r\n')[1].trim());
      const content = parts[2].split('\r\n\r\n')[1].replace(/\r\n$/, '');
      return create(metadata, content);
    }
    if (url.pathname === '/drive/v3/files' && !init.method) {
      const q = url.searchParams.get('q') || '';
      const props = [...q.matchAll(/appProperties has \{ key='([^']+)' and value='([^']+)' \}/g)];
      const parent = q.match(/'([^']+)' in parents/)?.[1];
      const mime = q.match(/mimeType = '([^']+)'/)?.[1];
      const matches = [...files.values()].filter((file) =>
        props.every(([, key, value]) => file.appProperties?.[key] === value)
        && (!parent || file.parents?.includes(parent))
        && (!mime || file.mimeType === mime));
      return json({ files: matches.slice(0, Number(url.searchParams.get('pageSize'))).map(({ id, name }) => ({ id, name })) });
    }
    const id = url.pathname.split('/').at(-1);
    if (url.pathname.startsWith('/upload/drive/v3/files/') && init.method === 'PATCH') {
      files.get(id).content = init.body;
      return json({ id });
    }
    if (url.pathname.startsWith('/drive/v3/files/') && init.method === 'DELETE') {
      files.delete(id);
      return new Response(null, { status: 204 });
    }
    if (url.pathname.startsWith('/drive/v3/files/') && url.searchParams.get('alt') === 'media') {
      return new Response(files.get(id)?.content || null, { status: files.has(id) ? 200 : 404 });
    }
    throw new Error(`Unexpected request: ${url} ${init.method}`);
  };

  const store = await DriveHistory.create({ clientId: 'client', clientSecret: 'secret', refreshToken: 'refresh' }, mockFetch);
  const runId = '8209800257053-1d81e970-21fc-4af0-939c-92463d94ed49';
  const run = { id: runId, createdAt: new Date().toISOString(), fileName: 'prueba.pdf',
    fileSize: 13, pdfSha256: 'hash', status: 'processing' };
  await store.putPdf('account', runId, new TextEncoder().encode('%PDF-1.4 demo'), run.fileName);
  await store.putRun('account', run);
  const loaded = await store.getRun('account', runId);
  assert.equal(loaded?.fileName, 'prueba.pdf');
  assert.ok(loaded?.storageId);

  const call = { id: crypto.randomUUID(), runId, index: 1, createdAt: new Date().toISOString(),
    mode: 'records', status: 'processing', request: { example: 'demo' } };
  await store.putCall('account', call);
  call.status = 'completed';
  call.responseText = '{"items":[]}';
  await store.putCall('account', call);
  await store.putResult('account', runId, 'Resultado de prueba');
  loaded.status = 'completed';
  await store.putRun('account', loaded);

  const root = [...files.values()].find((file) => file.appProperties?.kind === 'root');
  const folder = [...files.values()].find((file) => file.appProperties?.kind === 'folder');
  assert.ok(root && folder);
  assert.deepEqual(folder.parents, [root.id]);
  const archived = [...files.values()].filter((file) => file.parents?.includes(folder.id));
  assert.deepEqual(archived.map((file) => file.name).sort(),
    ['prueba.pdf', 'registro.json', 'resultado.txt', `llamada-00001-${call.id}.json`].sort());
  assert.equal(archived.find((file) => file.name === 'resultado.txt').content, 'Resultado de prueba');
  assert.equal(JSON.parse(archived.find((file) => file.name.startsWith('llamada-')).content).responseText, '{"items":[]}');
  assert.equal(JSON.parse(archived.find((file) => file.name === 'registro.json').content).status, 'completed');
});
