'use strict';

// Prueba de humo del servicio: challenge -> image -> verify.
// Requisitos: servidor corriendo y MISMO CAPTCHA_SECRET que el servidor
// (el test descifra el token localmente para conocer la respuesta).
//
//   node server.js            (en otra terminal)
//   npm test                  (o: node test-service.js)
//
// BASE_URL permite apuntar a otro host/puerto.

const assert = require('node:assert');
const captcha = require('./captcha');
const store = require('./store');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000';
const MAX_ATTEMPTS = Number(process.env.CAPTCHA_MAX_ATTEMPTS || 5);

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`FALLO  ${name}: ${err.message}`);
  }
}

async function api(path, options) {
  const res = await fetch(BASE + path, options);
  if (res.status === 429) {
    throw new Error('rate limit alcanzado (429); espera 1 min o sube CAPTCHA_RPM en el servidor');
  }
  return res;
}

function postVerify(token, answer, site) {
  return api('/api/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, answer, site })
  }).then((r) => r.json());
}

async function main() {
  console.log(`Smoke test contra ${BASE}`);
  console.log(`Modo anti-replay: ${store.enabled ? 'activo (Upstash)' : 'inactivo (sin estado)'}`);

  // 1. Challenge
  const challenge = await api('/api/challenge?site=demo').then((r) => r.json());
  check('challenge devuelve token, url y expiresAt', () => {
    assert.ok(challenge.token && challenge.url && challenge.expiresAt);
  });
  const payload = captcha.parse(challenge.token);
  check('el token se puede descifrar con el secreto local', () => {
    assert.ok(payload, '¿CAPTCHA_SECRET distinto al del servidor?');
  });

  // 2. Imagen: SVG con paths, sin texto legible
  const imageRes = await api(challenge.url);
  const svg = await imageRes.text();
  check('imagen responde 200 con image/svg+xml', () => {
    assert.strictEqual(imageRes.status, 200);
    assert.match(imageRes.headers.get('content-type'), /image\/svg\+xml/);
  });
  check('la imagen NO contiene <text> ni la respuesta en claro', () => {
    assert.ok(svg.includes('<path'), 'debe dibujar glifos como paths');
    assert.ok(!svg.includes('<text'), 'el SVG no debe tener elementos <text>');
    assert.ok(!svg.includes(payload.a), 'la respuesta no debe aparecer en el markup');
  });

  // 3. Verify correcto
  const ok = await postVerify(challenge.token, payload.a, 'demo');
  check('verify con respuesta correcta -> valid:true', () => {
    assert.strictEqual(ok.valid, true);
  });

  // 4. Replay del mismo token
  const replay = await postVerify(challenge.token, payload.a, 'demo');
  if (store.enabled) {
    check('replay del mismo token -> valid:false (un solo uso)', () => {
      assert.strictEqual(replay.valid, false);
    });
  } else {
    console.log('  --  replay permitido en modo sin estado (configura Upstash para un solo uso)');
  }

  // 5. Respuesta incorrecta (token nuevo)
  const c2 = await api('/api/challenge?site=demo').then((r) => r.json());
  const bad = await postVerify(c2.token, 'XXXXXX', 'demo');
  check('verify con respuesta incorrecta -> valid:false', () => {
    assert.strictEqual(bad.valid, false);
  });

  // 6. Token manipulado
  const tampered = await postVerify(c2.token + 'x', captcha.parse(c2.token).a, 'demo');
  check('verify con token manipulado -> valid:false', () => {
    assert.strictEqual(tampered.valid, false);
  });

  // 7. Sitio distinto al del token (o 403 si la allowlist lo bloquea antes)
  const wrongSiteRes = await api('/api/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: c2.token, answer: captcha.parse(c2.token).a, site: 'otro-sitio' })
  });
  const wrongSite = wrongSiteRes.status === 403 ? { valid: false } : await wrongSiteRes.json();
  check('verify con sitio distinto -> valid:false (o 403)', () => {
    assert.strictEqual(wrongSite.valid, false);
  });

  // 8. Imagen con token inválido
  const invalidImage = await api('/api/image?token=invalido');
  check('imagen con token inválido -> 404', () => {
    assert.strictEqual(invalidImage.status, 404);
  });

  // 9. Límite de intentos por token (solo con almacén configurado)
  if (store.enabled) {
    const c3 = await api('/api/challenge?site=demo').then((r) => r.json());
    const answer3 = captcha.parse(c3.token).a;
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
      await postVerify(c3.token, 'XXXXXX', 'demo');
    }
    const exhausted = await postVerify(c3.token, answer3, 'demo');
    check(`tras ${MAX_ATTEMPTS} intentos fallidos, incluso la respuesta correcta se rechaza`, () => {
      assert.strictEqual(exhausted.valid, false);
    });
  }

  console.log(`\nResultado: ${passed} ok, ${failed} fallos`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
