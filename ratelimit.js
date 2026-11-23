'use strict';

// Rate limiting en memoria por IP y ruta (ventana fija de 1 minuto).
// En serverless cada instancia tiene su propio contador: protección parcial.
// Para protección global, añade rate limiting en tu proxy/CDN (Vercel,
// Cloudflare, etc.).
//
// La IP se toma de X-Forwarded-For (primera entrada). Vercel/Netlify lo
// fijan correctamente; si expones Node directamente a Internet, un cliente
// podría falsificar esa cabecera: pon un proxy delante.

const WINDOW_MS = 60 * 1000;
const buckets = new Map();

function clientIp(req) {
  const xff = req.headers && req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

// Consume una plaza del bucket; devuelve { ok, retryAfter }.
function take(key, limit) {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || now >= bucket.reset) {
    bucket = { count: 0, reset: now + WINDOW_MS };
    buckets.set(key, bucket);
  }
  bucket.count += 1;

  // Limpieza perezosa para no acumular claves de IPs vistas una sola vez.
  if (buckets.size > 10000) {
    for (const [k, v] of buckets) {
      if (now >= v.reset) buckets.delete(k);
    }
  }

  return { ok: bucket.count <= limit, retryAfter: Math.ceil((bucket.reset - now) / 1000) };
}

module.exports = { clientIp, take };
