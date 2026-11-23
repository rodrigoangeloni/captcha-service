'use strict';

// Vercel / Netlify (compatible con el adaptador) — GET/POST /api/challenge
const handlers = require('../handlers');

module.exports = function (req, res) {
  return handlers.challenge(req, res);
};
