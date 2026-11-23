'use strict';

// Almacén opcional de un solo uso (anti-replay) y contador de intentos.
// Usa la API REST de Upstash Redis (free tier) sin SDK: solo fetch.
// Se activa automáticamente si existen UPSTASH_REDIS_REST_URL y
// UPSTASH_REDIS_REST_TOKEN. Sin ellas, el servicio sigue siendo sin estado
// (con la limitación de replay documentada en el README).
//
// Ante errores de red se registra el fallo y se continúa (fail-open) para
// no dejar el servicio inutilizable si Redis se cae.

const URL = process.env.UPSTASH_REDIS_REST_URL || '';
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || '';
const enabled = Boolean(URL && TOKEN);

async function command(args) {
  const res = await fetch(URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(3000)
  });
  if (!res.ok) throw new Error(`Upstash HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.result;
}

// Incrementa el contador de intentos del token; devuelve el nº de intento.
async function registerAttempt(jti, ttlSeconds) {
  const key = `cap:att:${jti}`;
  const n = await command(['INCR', key]);
  if (n === 1) await command(['EXPIRE', key, ttlSeconds]);
  return n;
}

// Marca el token como usado. Devuelve true solo la primera vez (SET NX).
async function markUsed(jti, ttlSeconds) {
  const result = await command(['SET', `cap:used:${jti}`, '1', 'NX', 'EX', ttlSeconds]);
  return result === 'OK';
}

module.exports = { enabled, registerAttempt, markUsed };
