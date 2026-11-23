# Servicio de CAPTCHA (serverless-ready)

Servicio de CAPTCHA de imagen **independiente**, para usar en varios sitios web
desde una sola API. Genera imágenes con texto distorsionado y valida las
respuestas mediante tokens cifrados, sin depender de proveedores externos.

## Idea clave

El token es **autocontenido y cifrado con AES-256-GCM**:

```
token = base64url(iv) . base64url(cifrado) . base64url(tag)
```

Dentro del cifrado va la respuesta, el sitio y la expiración. Por eso:

- **No hay base de datos ni sesión** → funciona en cualquier función serverless.
- Cualquier instancia puede validar un token creado por otra.
- El usuario no puede leer la respuesta decodificando el token.
- Tamper-proof: si se modifica el token, GCM falla y se rechaza.

## Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| `GET/POST` | `/api/challenge?site=mi-sitio` | Crea un captcha → `{ token, url, expiresAt }` |
| `GET` | `/api/image?token=...` | Devuelve la imagen SVG (texto distorsionado) |
| `POST` | `/api/verify` | Valida `{ token, answer, site }` → `{ valid }` |

Todas las respuestas incluyen CORS (`Access-Control-Allow-Origin` configurable) y `Cache-Control: no-store`.

## Ejecutar en local

```bash
npm install
npm start
```

Abre http://localhost:3000 — verás una demo con el formulario.

Para desarrollo con recarga: `npm run dev`.

## Integrarlo en tus sitios (lo fácil)

Añade el widget:

```html
<form action="/login" method="post">
  <input name="usuario" type="text">

  <div id="captcha"></div>
  <script src="https://TU-SERVICIO/widget.js"
          data-target="captcha"
          data-site="mi-sitio"></script>

  <button type="submit">Ingresar</button>
</form>
```

El widget inserta automáticamente:

- `<img>` con la imagen del captcha
- `<input name="captcha">` donde el usuario escribe
- `<input type="hidden" name="captcha_token">` con el token

### Validar en el backend de tu sitio (recomendado)

```js
const res = await fetch('https://TU-SERVICIO/api/verify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    token: req.body.captcha_token,
    answer: req.body.captcha,
    site: 'mi-sitio'
  })
});
const { valid } = await res.json();
if (!valid) return res.status(400).send('CAPTCHA incorrecto');
```

También se puede validar desde el navegador con `POST /api/verify`, pero la
decisión final debe tomarla tu servidor.

## Desplegar gratis (serverless)

### Opción A — Vercel (recomendado, 100% gratis)

La carpeta `api/` ya contiene las tres funciones. Solo:

1. Sube el proyecto a GitHub.
2. Importa el repo en Vercel.
3. Configura las variables de entorno de `.env.example`.
4. Deploy.

Las rutas quedarán en `https://tu-proyecto.vercel.app/api/...`.

### Opción B — Netlify

Usa `@netlify/functions` con un adaptador, o despliega el `server.js` como
función. La lógica (`captcha.js` + `handlers.js`) es la misma.

### Opción C — Cloudflare Workers

El código usa `node:crypto`; habilita `nodejs_compat` en `wrangler.toml`.
Alternativamente reescribe `captcha.js` con la API WebCrypto (`crypto.subtle`)
y AES-GCM, que es nativa del Worker.

### Opción D — Servidor propio (Node)

```bash
npm install
CAPTCHA_SECRET=... npm start
```

## Configuración

Copia `.env.example` a `.env` y ajusta:

- `CAPTCHA_SECRET`: **obligatorio en producción**. Si no se define, se usa un
  secreto de desarrollo inseguro.
- `CAPTCHA_SITES`: lista de sitios autorizados (evita que cualquiera use tu servicio).
- `CAPTCHA_TTL`: vigencia en ms (por defecto 2 min).
- `CAPTCHA_ORIGIN`: origen CORS permitido.

> Nota: este proyecto no carga `.env` automáticamente. En local exporta las
> variables o usa `node --env-file=.env server.js` (Node 20+). En Vercel/Netlify
> se configuran en el panel.

## Estructura

| Archivo | Función |
|---|---|
| `captcha.js` | Núcleo sin estado: cifrado de token, SVG, validación |
| `handlers.js` | Endpoints compartidos (Express + serverless) |
| `server.js` | Servidor Express local + demo |
| `public/widget.js` | Script embebible para tus sitios |
| `api/*.js` | Funciones serverless para Vercel |

## Seguridad y límites

- Los tokens expiran y la comparación es de tiempo constante.
- El token es cifrado, así que la respuesta no viaja en claro.
- **Replay:** al ser sin estado, un token resuelto puede reutilizarse durante su
  vigencia. Para producción estricta añade un KV/Redis con el `jti` usado y
  bórralo al validar (en Cloudflare KV o Redis gratis de Upstash).
- Añade rate limiting por IP/sitio en tu proxy o CDN.
- Usa siempre HTTPS y un `CAPTCHA_SECRET` largo y aleatorio.

## Licencia

MIT. Código propio, libre para usar y modificar.
