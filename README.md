# Servicio de CAPTCHA (serverless-ready)

Servicio de CAPTCHA de imagen **independiente**, para usar en varios sitios web
desde una sola API. Genera imágenes con texto distorsionado y valida las
respuestas mediante tokens cifrados, sin depender de proveedores externos.

## Idea clave

El token es **autocontenido y cifrado con AES-256-GCM**:

```
token = base64url(iv) . base64url(cifrado) . base64url(tag)
```

Dentro del cifrado va la respuesta, el sitio, la expiración y un identificador
único (`jti`). Por eso:

- **No hay base de datos ni sesión** → funciona en cualquier función serverless.
- Cualquier instancia puede validar un token creado por otra.
- El usuario no puede leer la respuesta decodificando el token.
- Tamper-proof: si se modifica el token, GCM falla y se rechaza.
- La imagen dibuja los caracteres como trazos `<path>` (nunca `<text>`):
  la respuesta no puede extraerse leyendo el markup del SVG.
- **Anti-replay opcional:** conectando un Redis gratuito (Upstash) cada token
  se consume al primer verify correcto y se limitan los intentos por token.

## Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| `GET/POST` | `/api/challenge?site=mi-sitio` | Crea un captcha → `{ token, url, expiresAt }` |
| `GET` | `/api/image?token=...` | Devuelve la imagen SVG (texto distorsionado) |
| `POST` | `/api/verify` | Valida `{ token, answer, site }` → `{ valid }` |

Todas las respuestas incluyen CORS (`Access-Control-Allow-Origin` configurable) y `Cache-Control: no-store`.
Hay rate limiting por IP y ruta (`CAPTCHA_RPM`, por defecto 30/min → `429` con `Retry-After`).

## Probar

Con el servidor corriendo:

```bash
npm test
```

Es una prueba de humo con aserciones (challenge → imagen → verify correcto,
incorrecto, manipulado, sitio distinto y replay). El test descifra el token
localmente, así que debe ejecutarse con el **mismo `CAPTCHA_SECRET`** que el
servidor. `BASE_URL` permite apuntar a otro host/puerto.

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
- `<input name="website_url">` honeypot: invisible para personas, los bots lo rellenan
- `<input type="hidden" name="captcha_ts">` marca de tiempo de carga del captcha

### Validar en el backend de tu sitio (recomendado)

```js
// 1. Filtros anti-bots baratos (honeypot + trampa de tiempo)
const ts = Number(req.body.captcha_ts);
if (String(req.body.website_url || '').trim()) return res.status(400).send('Bot');
if (!Number.isFinite(ts) || Date.now() - ts < 2000) return res.status(400).send('Bot');

// 2. CAPTCHA
const res2 = await fetch('https://TU-SERVICIO/api/verify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    token: req.body.captcha_token,
    answer: req.body.captcha,
    site: 'mi-sitio'
  })
});
const { valid } = await res2.json();
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

### Opción D — Docker en servidor propio (p. ej. Debian + Nginx Proxy Manager)

```bash
cp .env.example .env   # define CAPTCHA_SECRET: openssl rand -hex 32
docker network ls      # localiza la red de NPM y ajusta `name:` en docker-compose.yml
docker compose up -d --build
```

En Nginx Proxy Manager: **Proxy Host** → dominio `captcha.tudominio.com`,
scheme `http`, forward hostname `captcha` (nombre del contenedor), puerto `3000`,
SSL Let's Encrypt + Force SSL. No hace falta publicar puertos: NPM llega al
contenedor por la red Docker compartida. NPM envía `X-Forwarded-For`, así que
el rate limiting ve la IP real del cliente.

El contenedor incluye `HEALTHCHECK` contra `GET /health`. Comprueba el estado
con `docker ps` (columna STATUS) o `docker inspect captcha`.

Sin NPM/red compartida: descomenta `ports` en `docker-compose.yml` y apunta
el proxy a la IP del host.

### Opción E — Servidor propio (Node directo)

```bash
npm install
CAPTCHA_SECRET=... npm start
```

## Configuración

Copia `.env.example` a `.env` y ajusta:

- `CAPTCHA_SECRET`: **obligatorio en producción** (`NODE_ENV=production`):
  sin secreto propio el servicio no arranca. En desarrollo se usa un secreto
  inseguro si no se define.
- `CAPTCHA_SITES`: lista de sitios autorizados (evita que cualquiera use tu servicio).
- `CAPTCHA_TTL`: vigencia en ms (por defecto 90 s).
- `CAPTCHA_ORIGIN`: origen CORS permitido.
- `CAPTCHA_MAX_ATTEMPTS`: intentos máximos de verify por token (defecto 5, requiere Upstash).
- `CAPTCHA_RPM`: peticiones por minuto por IP y ruta (defecto 30).
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`: activan el modo
  anti-replay (un solo uso) y el límite de intentos. Crea una base Redis
  gratis en [upstash.com](https://upstash.com) y copia sus credenciales REST.
  Sin ellas el servicio sigue funcionando sin estado.

> Nota: este proyecto no carga `.env` automáticamente. En local exporta las
> variables o usa `node --env-file=.env server.js` (Node 20+). En Vercel/Netlify
> se configuran en el panel.

## Estructura

| Archivo | Función |
|---|---|
| `captcha.js` | Núcleo sin estado: cifrado de token, SVG, validación |
| `glyphs.js` | Fuente de trazos propia (glifos como paths, sin dependencias) |
| `store.js` | Anti-replay y contador de intentos vía Upstash Redis REST (opcional) |
| `ratelimit.js` | Rate limiting en memoria por IP y ruta |
| `handlers.js` | Endpoints compartidos (Express + serverless) |
| `server.js` | Servidor Express local + demo (con honeypot y trampa de tiempo) |
| `public/widget.js` | Script embebible para tus sitios |
| `api/*.js` | Funciones serverless para Vercel |
| `test-service.js` | Prueba de humo con aserciones (`npm test`) |

## Seguridad y límites

- Los tokens expiran (90 s por defecto) y la comparación es de tiempo constante.
- El token es cifrado, así que la respuesta no viaja en claro.
- La respuesta y el ruido se generan con `crypto.randomInt` (no `Math.random`).
- La imagen usa trazos `<path>`, no `<text>`: no se puede leer la respuesta
  del markup. Aun así, un OCR/ML determinado puede resolver captchas de
  texto; para mayor seguridad combina con honeypot, trampa de tiempo y
  rate limiting, o usa un captcha de proof-of-work como
  [ALTCHA](https://altcha.org) (open source, autoalojable).
- **Replay:** con Upstash configurado, cada token se consume al primer verify
  correcto (`SET NX`) y se rechaza tras `CAPTCHA_MAX_ATTEMPTS` intentos.
  Sin Upstash, un token resuelto puede reutilizarse durante su vigencia.
  Si Redis se cae, el servicio sigue funcionando (fail-open) y lo registra.
- Rate limiting por IP/ruta incluido (`429`); en serverless es por instancia:
  añade también rate limiting global en tu proxy o CDN.
- El sitio del token debe coincidir exactamente con el del verify.
- Usa siempre HTTPS y un `CAPTCHA_SECRET` largo y aleatorio.
- Accesibilidad: el captcha es solo visual. Ofrece una alternativa (p. ej.
  ALTCHA o un canal de contacto) si necesitas cumplir requisitos de accesibilidad.

## Licencia

MIT. Código propio, libre para usar y modificar.
