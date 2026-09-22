# AIBAY

AIBAY es una plataforma de inteligencia artificial independiente. La interfaz vive en el navegador y las respuestas se generan en tiempo real a través de GroqCloud, siempre desde el servidor.

## Tecnologías

- Next.js (App Router)
- TypeScript
- React
- Tailwind CSS
- Groq SDK oficial (`groq-sdk`)
- Vercel

Las conversaciones se guardan en `localStorage` de este navegador. No hay base de datos.

## Instalación

```bash
npm install
```

## Configuración de GroqCloud

1. Crea una cuenta en [GroqCloud Console](https://console.groq.com/).
2. Genera una API key.
3. Copia el archivo de ejemplo:

```bash
cp .env.example .env.local
```

En Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
```

4. Abre `.env.local` y completa los valores. No compartas ese archivo y no lo subas a GitHub.

## Variables de entorno

| Variable | Obligatoria | Descripción |
| --- | --- | --- |
| `GROQ_API_KEY` | Sí | Clave de GroqCloud. Solo existe en el servidor. |
| `GROQ_MODEL` | No | ID de modelo de chat. Si se omite, AIBAY usa `openai/gpt-oss-120b`. |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | No | Configuración pública de Firebase. Sin estas variables, AIBAY funciona como invitado. |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | No | Dominio de autenticación de Firebase. |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | No | ID del proyecto de Firebase. |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | No | Bucket de Firebase. |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | No | Sender ID de Firebase. |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | No | App ID de Firebase. |

`.env.example` documenta los nombres. No contiene secretos.

`.env.local` está en `.gitignore`.

## Cuentas opcionales con Firebase

Se puede chatear sin cuenta. La cuenta guarda las conversaciones en Firestore, ligadas a ese usuario.

1. Entra en [Firebase console](https://console.firebase.google.com/) y crea un proyecto.
2. Añade una app web y copia la configuración.
3. En Authentication, activa **Email/Password**.
4. Crea una base Firestore.
5. En Firestore, abre **Rules** y pega el contenido de `firestore.rules`.
6. Añade los valores `NEXT_PUBLIC_FIREBASE_*` en `.env.local` y vuelve a arrancar AIBAY.
7. En el chat, **Create account** es opcional. Sin pulsarla, el chat sigue en este dispositivo.

La clave de Groq no forma parte de Firebase y no se guarda en la cuenta.

## Desarrollo local

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

## Build

```bash
npm run build
```

## Producción local

```bash
npm run start
```

Ejecuta este comando después de `npm run build`.

## Lint

```bash
npm run lint
```

## Deploy en Vercel

El proyecto está preparado para el flujo GitHub → Vercel → GroqCloud.

1. Crea un repositorio vacío en GitHub.
2. En la raíz del proyecto:

```bash
git init
git add .
git commit -m "Initial AIBAY platform"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/aibay.git
git push -u origin main
```

Si el repositorio ya existe, omite `git init` y usa el remoto que ya tengas.

3. En [Vercel](https://vercel.com/new), importa el repositorio de GitHub.
4. Framework: Next.js. Vercel lo detecta solo. No hace falta un comando de build personalizado.
5. Antes de desplegar, añade las variables de entorno del proyecto:
   - `GROQ_API_KEY` con la clave real
   - `GROQ_MODEL` solo si quieres un modelo distinto del predeterminado
6. Despliega. Cada push a la rama de producción vuelve a publicar el sitio.

La clave se lee únicamente en `app/api/chat/route.ts` a través de `process.env`. El navegador llama a `/api/chat` y nunca recibe `GROQ_API_KEY`.

## Logo

El archivo oficial es `public/aibay-logo.png`. La interfaz lo usa tal cual. `app/icon.png` y `app/apple-icon.png` son recortes técnicos del mismo archivo para el favicon, sin cambiar colores ni tipografía.

## Seguridad

- La API key solo existe en el servidor.
- `localStorage` guarda conversaciones, no secretos.
- `/api/chat` valida roles, tamaño y número de mensajes.
- El markdown se renderiza sin HTML arbitrario.
