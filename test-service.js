'use strict';

// Prueba de humo del servicio: challenge -> image -> verify (correcto e incorrecto)
const captcha = require('./captcha');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000';

async function main() {
  const challenge = await fetch(`${BASE}/api/challenge?site=demo`).then((r) => r.json());
  console.log('challenge:', { token: challenge.token.slice(0, 24) + '...', url: challenge.url });

  const imageRes = await fetch(BASE + challenge.url);
  const svg = await imageRes.text();
  console.log('image:', imageRes.status, imageRes.headers.get('content-type'),
    'contiene <text>:', svg.includes('<text'));

  // Solo para la prueba: leer la respuesta del token cifrado
  const payload = captcha.parse(challenge.token);
  console.log('respuesta esperada (test):', payload.a);

  const ok = await fetch(`${BASE}/api/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: challenge.token, answer: payload.a, site: 'demo' })
  }).then((r) => r.json());
  console.log('verify correcto:', ok);

  const bad = await fetch(`${BASE}/api/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: challenge.token, answer: 'XXXXXX', site: 'demo' })
  }).then((r) => r.json());
  console.log('verify incorrecto:', bad);

  const tampered = await fetch(`${BASE}/api/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: challenge.token + 'x', answer: payload.a, site: 'demo' })
  }).then((r) => r.json());
  console.log('verify token manipulado:', tampered);

  const expiredImage = await fetch(`${BASE}/api/image?token=invalido`);
  console.log('imagen con token inválido:', expiredImage.status);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
