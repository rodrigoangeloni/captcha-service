'use strict';

// Vercel — GET /api/image?token=...
const handlers = require('../handlers');

module.exports = function (req, res) {
  return handlers.image(req, res);
};
