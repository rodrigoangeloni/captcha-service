# Changelog

Todos los cambios notables de este proyecto se documentan aquí.
Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/);
versiones según [SemVer](https://semver.org/lang/es/).

## [1.2.0] - 2026-11-23

### Añadido

- Despliegue en Docker: `Dockerfile` (node:22-alpine, dependencias solo de
  producción, usuario sin privilegios, `HEALTHCHECK`) y `docker-compose.yml`
  pensado para Nginx Proxy Manager (red Docker compartida, sin puertos
  publicados, arranque fallido si falta `CAPTCHA_SECRET`).
- Endpoint `GET /health` (sin rate limiting) para healthchecks.
- Guía de despliegue Docker + NPM en el README (opción D).

## [1.1.0] - 2026-11-23

### Seguridad

- La imagen dibuja los caracteres como trazos `<path>` (nueva fuente propia
  en `glyphs.js`): la respuesta ya no puede extraerse del markup del SVG.
- Toda la aleatoriedad usa `crypto.randomInt` en vez de `Math.random`.
- Un solo uso (anti-replay) y límite de intentos por token
  (`CAPTCHA_MAX_ATTEMPTS`, defecto 5) opcionales vía Upstash Redis REST
  (`store.js`); si Redis falla, el servicio sigue funcionando (fail-open).
- Rate limiting por IP y ruta (`CAPTCHA_RPM`, defecto 30/min → `429` con
  `Retry-After`).
- `CAPTCHA_SECRET` obligatorio con `NODE_ENV=production`: sin secreto propio
  el servicio no arranca.
- El sitio del verify debe coincidir exactamente con el del token.
- Honeypot (`website_url`) y trampa de tiempo (`captcha_ts` / `form_ts`,
  envíos en <2 s se rechazan) en el widget y en la demo.

### Cambiado

- Payload del token a v2 con identificador único `jti` (los tokens de la
  versión anterior quedan invalidados; expiran en minutos).
- TTL por defecto: 90 s (antes 120 s).
- `npm test`: prueba de humo con aserciones y código de salida (antes solo
  imprimía resultados).
- Widget: etiquetas `aria` para accesibilidad.

## [1.0.0] - 2026-11-23

### Añadido

- Servicio de CAPTCHA de imagen sin estado: tokens cifrados AES-256-GCM con
  respuesta, sitio y expiración; imagen SVG con texto distorsionado.
- Endpoints `/api/challenge`, `/api/image` y `/api/verify` con CORS y
  `Cache-Control: no-store`.
- Servidor Express local con demo de integración.
- Widget embebible (`public/widget.js`) para sitios de terceros.
- Funciones serverless para Vercel (`api/*.js`).
