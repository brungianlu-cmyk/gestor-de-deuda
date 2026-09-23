# Estructura Jurídica

Aplicación para convertir documentos de deuda en texto jurídico. El PDF se lee y procesa en el navegador. Una copia se archiva en Google Drive junto con el resultado final y un archivo por cada llamada a la IA. Si se incluye un ejemplo de redacción, la interfaz llama a `/api/generate`; el Worker usa la API de OpenAI con una clave privada, registra cada llamada y su respuesta, y verifica los importes antes de devolver el texto.

## Desarrollo local

Requisitos: Node.js 22.13 o superior y npm.

1. Ejecutá `npm ci` en esta carpeta.
2. Conservá `OPENAI_API_KEY` en `.env.local` (ver `.env.example`). La clave nunca debe ir en el cliente ni en Git.
3. Ejecutá `npm run dev` y abrí `http://localhost:5173`.

`npm run build`, `npm run typecheck` y `npm run test:parsing` comprueban la compilación y el procesamiento local. `npm start` permite revisar el build con Vite Preview; `node scripts/test-api-route.mjs` prueba una llamada real con datos ficticios.

## Despliegue automático desde GitHub

Publicá el contenido de **esta carpeta** (`gestor-deuda`) en GitHub. `.env.local`, `.dev.vars*`, `node_modules` y `dist` están ignorados y no deben subirse. El remoto `origin` de este checkout apunta a `brungianlu-cmyk/gestor-de-deuda`.

Antes de desplegar esta versión, creá un proyecto en Google Cloud bajo la cuenta que será dueña de los archivos, habilitá la API de Google Drive y configurá una pantalla de consentimiento OAuth y un cliente OAuth de tipo aplicación de escritorio. El alcance necesario es `https://www.googleapis.com/auth/drive.file`, limitado a los archivos creados por esta aplicación. Agregá el ID y secreto del cliente a `.env.local` con los nombres de `.env.example`, ejecutá `npm run google-drive:auth` y autorizá esa cuenta. El script guarda el refresh token en `.env.google-drive.local`, que está ignorado por Git. Si la pantalla OAuth queda en modo de prueba, Google puede hacer caducar el refresh token a los siete días; para uso continuo, configurá el proyecto para producción. No hace falta activar R2.

El Worker necesitará `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET` y `GOOGLE_DRIVE_REFRESH_TOKEN` como secretos de ejecución. La conexión de Google Drive usada por Codex no entrega automáticamente estos secretos a la aplicación web. No los publiques en GitHub ni los configures como variables de compilación.

En Cloudflare, abrí **Workers & Pages → Create application → Import a repository**, autorizá GitHub y seleccioná el repositorio. Configurá Workers Builds así:

| Ajuste | Valor |
| --- | --- |
| Nombre del Worker | `estructura-juridica` (igual al `name` de `wrangler.jsonc`) |
| Rama de producción | `main` |
| Directorio raíz | Dejalo vacío si `gestor-deuda` es la raíz del repositorio; escribí `gestor-deuda` si subiste la carpeta contenedora |
| Comando de compilación | `npm run build` |
| Comando de despliegue | `npx wrangler deploy` |

Cloudflare instala las dependencias antes de compilar. No pongas `OPENAI_API_KEY` ni los secretos de Google en **Build variables and secrets**: esas variables solo existen durante la compilación. Después del primer despliegue, abrí el Worker → **Settings → Variables & Secrets → Add**, elegí **Secret** y cargá `OPENAI_API_KEY` y los tres secretos de Google directamente en Cloudflare. El Worker los usará en tiempo de ejecución. Hasta configurar Google Drive, el procesamiento devolverá un error de archivo no disponible y no llamará a la IA.

Los siguientes cambios enviados a `main` dispararán compilaciones y despliegues automáticos. La URL tendrá la forma `https://estructura-juridica.<TU_SUBDOMINIO>.workers.dev`. Configurá los secretos de Google antes de enviar esta versión a `main` para no interrumpir el procesamiento actual.

## Archivo de llamadas

Cada ejecución crea una carpeta dentro de `Estructura Jurídica - Historial` en el Google Drive de la cuenta autorizada. Allí se guardan el PDF, `registro.json`, `resultado.txt` y un JSON por llamada a la IA, incluidas las llamadas fallidas. Los archivos permanecen privados según los permisos de esa cuenta. La aplicación no muestra una pantalla de consulta; los registros se revisan directamente en Drive. Los procesamientos previos a esta versión no se pueden reconstruir automáticamente.

El límite de carga es de 20 MB por PDF. No hay eliminación automática de registros; el espacio consumido cuenta para la cuota de Google Drive de esa cuenta. El nombre del modelo no aparece en la interfaz. Los costos de la API de OpenAI son independientes del alojamiento gratuito de Cloudflare.

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

El endpoint `/api/generate` recibe datos jurídicos y consume la API de OpenAI. Antes de publicar esta versión con acceso a Drive, restringí quién puede usar la aplicación: actualmente el sitio es público, y un tercero podría consumir espacio de Drive y llamadas a OpenAI. El código no se debe enviar a `main` con las credenciales de Drive hasta definir ese control.
