import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  throw new Error('Configurá GOOGLE_DRIVE_CLIENT_ID y GOOGLE_DRIVE_CLIENT_SECRET en .env.local.');
}

const redirectUri = 'http://127.0.0.1:8788/callback';
const state = randomBytes(24).toString('hex');
const authorization = new URL('https://accounts.google.com/o/oauth2/v2/auth');
authorization.search = new URLSearchParams({
  client_id: clientId,
  redirect_uri: redirectUri,
  response_type: 'code',
  scope: 'https://www.googleapis.com/auth/drive.file',
  access_type: 'offline',
  prompt: 'consent',
  state,
}).toString();

const server = createServer(async (request, response) => {
  const url = new URL(request.url || '/', redirectUri);
  if (url.pathname !== '/callback' || url.searchParams.get('state') !== state) {
    response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Solicitud inválida.');
    return;
  }
  const code = url.searchParams.get('code');
  if (!code) {
    response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Google no devolvió un código de autorización.');
    server.close();
    return;
  }
  try {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: clientId,
        client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
    });
    if (!tokenResponse.ok) throw new Error('Google rechazó el código de autorización.');
    const token = await tokenResponse.json();
    if (!token.refresh_token) throw new Error('Google no devolvió un refresh token.');
    await writeFile(new URL('../.env.google-drive.local', import.meta.url),
      `GOOGLE_DRIVE_REFRESH_TOKEN=${token.refresh_token}\n`, { mode: 0o600, flag: 'wx' });
    response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Autorización completada. Podés cerrar esta pestaña.');
    console.log('Refresh token guardado en .env.google-drive.local. No lo publiques en GitHub.');
  } catch (error) {
    response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end(error instanceof Error ? error.message : 'Falló la autorización.');
    console.error(error instanceof Error ? error.message : error);
  } finally {
    server.close();
  }
});

server.listen(8788, '127.0.0.1', () => {
  console.log('Abrí esta URL en el navegador para autorizar Google Drive:');
  console.log(authorization.toString());
});
