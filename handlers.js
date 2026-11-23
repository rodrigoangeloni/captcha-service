'use strict';

const captcha = require('./captcha');

// Handlers compartidos por Express (local) y por las funciones serverless.
// Usan solo req/res crudos para funcionar en ambos entornos.

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.CAPTCHA_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
}

function json(res, status, data) {
  cors(res);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

function text(res, status, body) {
  cors(res);
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end(body);
}

function preflight(res) {
  cors(res);
  res.statusCode = 204;
  res.end();
}

function allowedSites() {
  return String(process.env.CAPTCHA_SITES || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function isSiteAllowed(site) {
  const sites = allowedSites();
  if (sites.length === 0) return true;
  return Boolean(site) && sites.includes(String(site));
}

function query(req, name) {
  if (req.query && req.query[name] != null) return req.query[name];
  if (req.body && req.body[name] != null) return req.body[name];
  return '';
}

function challenge(req, res) {
  if (req.method === 'OPTIONS') return preflight(res);

  const site = String(query(req, 'site') || '');
  if (!isSiteAllowed(site)) {
    return json(res, 403, { error: 'Sitio no autorizado' });
  }

  const data = captcha.create(site);
  const url = `/api/image?token=${encodeURIComponent(data.token)}`;

  return json(res, 200, {
    token: data.token,
    url,
    expiresAt: data.expiresAt
  });
}

function image(req, res) {
  if (req.method === 'OPTIONS') return preflight(res);

  const token = String(query(req, 'token') || '');
  const svg = captcha.imageFor(token);

  if (!svg) {
    return text(res, 404, 'CAPTCHA inválido o expirado');
  }

  cors(res);
  res.statusCode = 200;
  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
  res.end(svg);
}

function verify(req, res) {
  if (req.method === 'OPTIONS') return preflight(res);

  const body = req.body || {};
  const token = String(body.token || body.captcha_key || '');
  const answer = String(body.answer || body.captcha || '');
  const site = String(query(req, 'site') || '');

  if (!isSiteAllowed(site)) {
    return json(res, 403, { error: 'Sitio no autorizado' });
  }

  const valid = captcha.validate(token, answer, site);
  return json(res, 200, { valid });
}

module.exports = { challenge, image, verify, preflight };
