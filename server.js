'use strict';

const express = require('express');
const path = require('path');
const handlers = require('./handlers');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: false }));
app.use(express.json({ limit: '32kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// API del servicio
app.all('/api/challenge', handlers.challenge);
app.all('/api/image', handlers.image);
app.all('/api/verify', handlers.verify);

function renderPage({ message, ok } = {}) {
  const notice = message
    ? `<div class="notice ${ok ? 'ok' : 'error'}">${message}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Servicio de CAPTCHA</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <main class="card">
    <h1>Servicio de CAPTCHA</h1>
    <p class="subtitle">Demo del servicio + ejemplo de integración</p>

    ${notice}

    <form action="/demo/verify" method="post" id="login-form">
      <input type="text" name="website_url" class="hp-field" tabindex="-1" autocomplete="off" aria-hidden="true">
      <input type="hidden" name="form_ts" value="${Date.now()}">

      <label for="documento">N&deg; Documento</label>
      <input id="documento" name="documento" type="text" autocomplete="off" required>

      <label for="password">Contrase&ntilde;a</label>
      <input id="password" name="password" type="password" required>

      <fieldset class="captcha-box">
        <legend>Verificaci&oacute;n</legend>
        <div class="captcha-row">
          <img id="captcha-img" alt="captcha" width="150" height="50">
          <input id="captcha" name="captcha" type="text"
                 placeholder="Escriba el texto aqu&iacute;"
                 autocomplete="off" autocapitalize="off" autocorrect="off" required>
          <input id="captcha_token" name="captcha_token" type="hidden">
        </div>
        <button type="button" id="captcha-refresh" class="link-button">
          Actualizar código
        </button>
      </fieldset>

      <button type="submit" class="primary">Ingresar</button>
    </form>

    <section class="api-note">
      <h2>Endpoints del servicio</h2>
      <code>GET /api/challenge?site=mi-sitio</code><br>
      <code>GET /api/image?token=...</code><br>
      <code>POST /api/verify &rarr; { token, answer, site }</code>
    </section>
  </main>

  <script>
    (async function loadCaptcha() {
      const response = await fetch('/api/challenge?site=demo');
      const data = await response.json();
      document.getElementById('captcha-img').src = data.url;
      document.getElementById('captcha_token').value = data.token;
    })();

    document.getElementById('captcha-refresh').addEventListener('click', async function () {
      const response = await fetch('/api/challenge?site=demo');
      const data = await response.json();
      document.getElementById('captcha-img').src = data.url + '&t=' + Date.now();
      document.getElementById('captcha_token').value = data.token;
      document.getElementById('captcha').value = '';
      document.getElementById('captcha').focus();
    });
  </script>
</body>
</html>`;
}

// Demo: el "backend del otro sitio" llama a /api/verify.
// Además aplica honeypot + trampa de tiempo (defensa en capas barata).
app.post('/demo/verify', async (req, res) => {
  const honeypot = String(req.body.website_url || '').trim();
  const ts = Number(req.body.form_ts);
  const tooFast = !Number.isFinite(ts) || Date.now() - ts < 2000;

  if (honeypot || tooFast) {
    return res.status(400).send(renderPage({
      message: 'Solicitud rechazada por los filtros anti-bots.'
    }));
  }

  const verifyRes = await fetch(`${req.protocol}://${req.get('host')}/api/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token: req.body.captcha_token,
      answer: req.body.captcha,
      site: 'demo'
    })
  });
  const result = await verifyRes.json();

  res.status(result.valid ? 200 : 400).send(renderPage({
    ok: result.valid,
    message: result.valid
      ? 'CAPTCHA correcto. Login de demostración exitoso.'
      : 'El texto del CAPTCHA es incorrecto o expiró. Intente de nuevo.'
  }));
});

app.get('/', (req, res) => {
  res.send(renderPage());
});

// Healthcheck para Docker/orquestadores (no pasa por rate limiting).
app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Servicio de CAPTCHA corriendo en http://localhost:${PORT}`);
});
