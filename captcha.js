'use strict';

const crypto = require('crypto');

// ---------------------------------------------------------------------------
// Núcleo del servicio: SIN ESTADO.
// El token contiene la respuesta cifrada (AES-256-GCM), por lo que cualquier
// instancia serverless puede validarlo sin base de datos ni sesión compartida.
// ---------------------------------------------------------------------------

const SECRET = process.env.CAPTCHA_SECRET || 'dev-secret-change-me';
const KEY = crypto.createHash('sha256').update(SECRET).digest();
const TTL_MS = Number(process.env.CAPTCHA_TTL || 2 * 60 * 1000);

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0, O, 1, I
const LENGTH = 6;
const FONTS = ['Arial', 'Verdana', 'Georgia', 'Courier New', 'Tahoma', 'Times New Roman'];
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

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(arr) {
  return arr[randomInt(0, arr.length - 1)];
}

function escapeXml(value) {
  return String(value).replace(/[<>&"']/g, (ch) => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;'
  }[ch]));
}

function generateAnswer() {
  let out = '';
  for (let i = 0; i < LENGTH; i += 1) out += pick(CHARS);
  return out;
}

function create(site) {
  const answer = generateAnswer();
  const payload = JSON.stringify({
    v: 1,
    s: String(site || ''),
    exp: Date.now() + TTL_MS,
    a: answer
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
    if (data.v !== 1 || !Number.isFinite(data.exp) || data.exp < Date.now()) {
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

function validate(token, input, site) {
  const data = parse(token);
  if (!data) return false;
  if (site && data.s && data.s !== String(site)) return false;
  return timingEqual(normalize(input), normalize(data.a));
}

function buildSvg(answer) {
  const width = 150;
  const height = 50;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    '<rect width="100%" height="100%" fill="#fafafa"/>'
  ];

  for (let i = 0; i < 5; i += 1) {
    parts.push(
      `<line x1="${randomInt(0, width)}" y1="${randomInt(0, height)}" ` +
      `x2="${randomInt(0, width)}" y2="${randomInt(0, height)}" ` +
      `stroke="#b9b9b9" stroke-width="${randomInt(1, 2)}" opacity="0.7"/>`
    );
  }

  const step = (width - 16) / answer.length;
  [...answer].forEach((ch, index) => {
    const x = 8 + index * step + randomInt(-2, 2);
    const y = 34 + randomInt(-4, 4);
    const rotation = randomInt(-28, 28);
    const size = randomInt(22, 30);
    parts.push(
      `<text x="${x}" y="${y}" font-family="${pick(FONTS)}" ` +
      `font-size="${size}" font-weight="bold" fill="${pick(COLORS)}" ` +
      `transform="rotate(${rotation} ${x} ${y})">${escapeXml(ch)}</text>`
    );
  });

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
