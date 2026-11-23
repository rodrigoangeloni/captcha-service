# Servicio de CAPTCHA — imagen mínima, usuario sin privilegios.
FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

# Dependencias primero (capa cacheable). Solo express, sin devDependencies.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Código de la app (api/ es solo para Vercel, no hace falta aquí).
COPY captcha.js glyphs.js store.js ratelimit.js handlers.js server.js ./
COPY public ./public

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
