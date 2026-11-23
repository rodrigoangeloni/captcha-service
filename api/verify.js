'use strict';

// Vercel — POST /api/verify { token, answer, site }
const handlers = require('../handlers');

module.exports = function (req, res) {
  return handlers.verify(req, res);
};
