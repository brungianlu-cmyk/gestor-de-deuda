# Estructura Jurídica

Aplicación para convertir documentos de deuda en texto jurídico. El PDF se lee y procesa en el navegador. Si se incluye un ejemplo de redacción, la interfaz llama a `/api/generate`; el Worker usa la API de OpenAI con una clave privada y verifica los importes antes de devolver el texto.

## Desarrollo local

Requisitos: Node.js 22.13 o superior y npm.

1. Ejecutá `npm ci` en esta carpeta.
2. Conservá `OPENAI_API_KEY` en `.env.local` (ver `.env.example`). La clave nunca debe ir en el cliente ni en Git.
3. Ejecutá `npm run dev` y abrí `http://localhost:5173`.

`npm run build`, `npm run typecheck` y `npm run test:parsing` comprueban la compilación y el procesamiento local. `npm start` permite revisar el build con Vite Preview; `node scripts/test-api-route.mjs` prueba una llamada real con datos ficticios.

## Despliegue automático desde GitHub

Publicá el contenido de **esta carpeta** (`gestor-deuda`) en GitHub. `.env.local`, `.dev.vars*`, `node_modules` y `dist` están ignorados y no deben subirse. Este checkout todavía tiene un remoto `origin` de ChatGPT Sites: reemplazalo por la URL de tu nuevo repositorio de GitHub antes de hacer `git push`. Asegurate de incluir en el commit todos los cambios de esta migración.

En Cloudflare, abrí **Workers & Pages → Create application → Import a repository**, autorizá GitHub y seleccioná el repositorio. Configurá Workers Builds así:

| Ajuste | Valor |
| --- | --- |
| Nombre del Worker | `estructura-juridica` (igual al `name` de `wrangler.jsonc`) |
| Rama de producción | `main` |
| Directorio raíz | Dejalo vacío si `gestor-deuda` es la raíz del repositorio; escribí `gestor-deuda` si subiste la carpeta contenedora |
| Comando de compilación | `npm run build` |
| Comando de despliegue | `npx wrangler deploy` |

Cloudflare instala las dependencias antes de compilar. No pongas `OPENAI_API_KEY` en **Build variables and secrets**: esas variables solo existen durante la compilación. Después del primer despliegue, abrí el Worker → **Settings → Variables & Secrets → Add**, elegí **Secret**, usá el nombre `OPENAI_API_KEY` y cargá el valor de tu `.env.local` directamente en Cloudflare. El Worker usará ese secreto en tiempo de ejecución. El primer despliegue puede mostrar la interfaz antes de configurar la IA; la ruta API responderá que falta la clave hasta que guardes el secreto.

Los siguientes cambios enviados a `main` dispararán compilaciones y despliegues automáticos. La URL tendrá la forma `https://estructura-juridica.<TU_SUBDOMINIO>.workers.dev`.

## Despliegue manual con Wrangler

`wrangler.jsonc` configura un Worker con activos estáticos y la ruta API en el mismo origen. En una cuenta nueva, elegí el subdominio `workers.dev` en **Workers & Pages** si Cloudflare te lo solicita. Tras iniciar sesión con `npx wrangler login`, indicá tu cuenta con `CLOUDFLARE_ACCOUNT_ID` (o agregá `account_id` a `wrangler.jsonc`). En PowerShell, el primer despliegue es:

```powershell
Set-Location 'C:\Users\Administrator\Documents\ChatGPT\Lawers\gestor-deuda'
npm ci
npx wrangler login
npx wrangler whoami
$env:CLOUDFLARE_ACCOUNT_ID = '<ID_DE_TU_CUENTA>'
npm run deploy:check
npx wrangler deploy --secrets-file .env.local
```

El ID aparece en **Workers & Pages → Account Details**. `--secrets-file` carga `OPENAI_API_KEY` desde `.env.local` como secreto en el mismo despliegue; el build no incluye la clave. La URL resultante tendrá la forma `https://estructura-juridica.<TU_SUBDOMINIO>.workers.dev`. Para cambios de código posteriores usá `npm run deploy`; para renovar únicamente la clave usá `npm run cloudflare:secret`. En producción, `OPENAI_MODEL` se define en `wrangler.jsonc`.

El endpoint `/api/generate` recibe datos jurídicos y consume la API de OpenAI. Antes de compartir públicamente el subdominio de pruebas, configurá controles de acceso o límites de uso en Cloudflare para evitar llamadas no autorizadas y gastos imprevistos.
