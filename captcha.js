'use strict';

const crypto = require('crypto');
const { GLYPHS, GRID_W, GRID_H } = require('./glyphs');
const store = require('./store');

// ---------------------------------------------------------------------------
// Núcleo del servicio: SIN ESTADO (con anti-replay opcional vía store.js).
// El token contiene la respuesta cifrada (AES-256-GCM), por lo que cualquier
// instancia serverless puede validarlo sin base de datos ni sesión compartida.
// ---------------------------------------------------------------------------

const SECRET = process.env.CAPTCHA_SECRET || '';

// En producción es obligatorio un secreto propio: con el valor por defecto
// cualquiera podría forjar tokens válidos.
if (process.env.NODE_ENV === 'production' && (!SECRET || SECRET === 'dev-secret-change-me')) {
  throw new Error('CAPTCHA_SECRET es obligatorio en producción (cadena larga y aleatoria)');
}

const KEY = crypto.createHash('sha256').update(SECRET || 'dev-secret-change-me').digest();
const TTL_MS = Number(process.env.CAPTCHA_TTL || 90 * 1000);
const MAX_ATTEMPTS = Number(process.env.CAPTCHA_MAX_ATTEMPTS || 5);

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0, O, 1, I
const LENGTH = 6;
const COLORS = ['#1a1a1a', '#2b3a67', '#6a1b1b', '#0b4f4a', '#3b2b66'];

function b64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function unb64url(value) {
  let s = String(value).replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64');
}

// Aleatoriedad criptográficamente segura (Math.random es predecible).
function randomInt(min, max) {
  return crypto.randomInt(min, max + 1);
}

function pick(arr) {
  return arr[randomInt(0, arr.length - 1)];
}

function generateAnswer() {
  let out = '';
  for (let i = 0; i < LENGTH; i += 1) out += pick(CHARS);
  return out;
}

function create(site) {
  const answer = generateAnswer();
  const payload = JSON.stringify({
    v: 2,
    s: String(site || ''),
    exp: Date.now() + TTL_MS,
    a: answer,
    jti: b64url(crypto.randomBytes(9)) // identificador único para anti-replay
  });

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  const token = `${b64url(iv)}.${b64url(ciphertext)}.${b64url(tag)}`;
  return { token, answer, expiresAt: Date.now() + TTL_MS };
}

function parse(token) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length !== 3) return null;

    const iv = unb64url(parts[0]);
    const ciphertext = unb64url(parts[1]);
    const tag = unb64url(parts[2]);

    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final()
    ]).toString('utf8');

    const data = JSON.parse(plaintext);
    if (data.v !== 2 || !Number.isFinite(data.exp) || data.exp < Date.now()) {
      return null;
    }
    return data;
  } catch (err) {
    return null;
  }
}

function normalize(value) {
  return String(value == null ? '' : value).trim().toUpperCase();
}

function timingEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

async function validate(token, input, site) {
  const data = parse(token);
  if (!data) return false;
  // El sitio debe coincidir exactamente con el del token (antes solo se
  // comprobaba si ambos eran no vacíos, lo que permitía saltarse el vínculo).
  if (String(data.s || '') !== String(site || '')) return false;

  const ttlLeft = Math.max(1, Math.ceil((data.exp - Date.now()) / 1000));

  // Límite de intentos por token (fuerza bruta), si hay almacén configurado.
  if (store.enabled) {
    try {
      const attempts = await store.registerAttempt(data.jti, ttlLeft);
      if (attempts > MAX_ATTEMPTS) return false;
    } catch (err) {
      console.error('[captcha] contador de intentos no disponible:', err.message);
    }
  }

  if (!timingEqual(normalize(input), normalize(data.a))) return false;

  // Un solo uso: el primer verify correcto consume el token (anti-replay).
  if (store.enabled) {
    try {
      const fresh = await store.markUsed(data.jti, ttlLeft);
      if (!fresh) return false;
    } catch (err) {
      console.error('[captcha] registro de un solo uso no disponible:', err.message);
    }
  }

  return true;
}

// Convierte un glifo (polilíneas en cuadrícula 4x6) a un path SVG absoluto,
// con escala, rotación y posición aleatorias. Nunca se emite <text>.
function glyphPath(ch, cx, cy, size) {
  const strokes = GLYPHS[ch];
  if (!strokes) return '';
  const sx = (size / GRID_H) * (randomInt(85, 110) / 100);
  const sy = (size / GRID_H) * (randomInt(90, 115) / 100);
  const angle = (randomInt(-28, 28) * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  return strokes.map((stroke) => {
    const points = stroke.map(([gx, gy], index) => {
      const px = (gx - GRID_W / 2) * sx;
      const py = (gy - GRID_H / 2) * sy;
      const x = cx + px * cos - py * sin;
      const y = cy + px * sin + py * cos;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    });
    return points.join('');
  }).join('');
}

function buildSvg(answer) {
  const width = 150;
  const height = 50;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    '<rect width="100%" height="100%" fill="#fafafa"/>'
  ];

  // Líneas de ruido de fondo.
  for (let i = 0; i < 5; i += 1) {
    parts.push(
      `<path d="M${randomInt(0, width)} ${randomInt(0, height)} ` +
      `Q${randomInt(0, width)} ${randomInt(0, height)} ${randomInt(0, width)} ${randomInt(0, height)}" ` +
      `stroke="#b9b9b9" stroke-width="${randomInt(1, 2)}" fill="none" opacity="0.7"/>`
    );
  }

  const step = (width - 16) / answer.length;
  [...answer].forEach((ch, index) => {
    const cx = 10 + index * step + randomInt(-2, 2);
    const cy = height / 2 + randomInt(-4, 4);
    const size = randomInt(21, 28);
    parts.push(
      `<path d="${glyphPath(ch, cx, cy, size)}" stroke="${pick(COLORS)}" ` +
      `stroke-width="${(randomInt(18, 26) / 10).toFixed(1)}" fill="none" ` +
      `stroke-linecap="round" stroke-linejoin="round"/>`
    );
  });

  // Trazos de ruido por encima de los glifos (dificulta la segmentación).
  for (let i = 0; i < 2; i += 1) {
    parts.push(
      `<path d="M${randomInt(0, 20)} ${randomInt(10, 40)} ` +
      `Q${randomInt(40, 110)} ${randomInt(0, 50)} ${randomInt(130, 150)} ${randomInt(10, 40)}" ` +
      `stroke="#8a8a8a" stroke-width="1.5" fill="none" opacity="0.6"/>`
    );
  }

  for (let i = 0; i < 22; i += 1) {
    parts.push(
      `<circle cx="${randomInt(0, width)}" cy="${randomInt(0, height)}" ` +
      `r="${randomInt(1, 2)}" fill="#9a9a9a" opacity="0.6"/>`
    );
  }

  parts.push('</svg>');
  return parts.join('');
}

function imageFor(token) {
  const data = parse(token);
  return data ? buildSvg(data.a) : null;
}

module.exports = { create, parse, validate, imageFor, TTL_MS };
