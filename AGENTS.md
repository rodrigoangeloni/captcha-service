# AGENTS.md

Stateless image-CAPTCHA service: Node.js + Express, CommonJS, single dependency (`express`). No build step, no lint/typecheck config, no test framework. Comments, UI text, and README are Spanish — keep new code/docs consistent.

Releases: SemVer in `package.json` + `CHANGELOG.md` (Keep a Changelog format, Spanish). User-facing changes get a changelog entry and a version bump in the same commit.

## Commands & environment

- Run: `npm start`; dev with reload: `npm run dev` (`node --watch server.js`). Demo at http://localhost:3000.
- Requires Node >= 18 (global `fetch`, `crypto.randomInt`, `AbortSignal.timeout`).
- `.env` is NOT auto-loaded (no dotenv). Use `node --env-file=.env server.js` (Node >= 20) or export vars. See `.env.example`.
- Env is read once at module load (`captcha.js`, `store.js`, `ratelimit.js` via handlers) — restart after changing env; `--watch` does not reload on `.env` changes.
- With `NODE_ENV=production`, startup throws unless a real `CAPTCHA_SECRET` is set (no silent dev-secret fallback).

## Verification

1. Start the server.
2. `npm test` (= `node test-service.js`): assertion-based smoke test (challenge → image → verify correct/wrong/tampered/site-mismatch/replay). Override target with `BASE_URL`.
3. The test decrypts tokens locally via `captcha.parse`, so it must run with the **same `CAPTCHA_SECRET` as the server**, otherwise it fails.
4. Replay/attempt-limit assertions only run when Upstash env vars are set (`UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`); otherwise the service is stateless and replay is allowed by design.
5. Rate limit is 30 req/min per IP per route (`CAPTCHA_RPM`); repeated test runs within a minute can hit 429 — the test reports this explicitly.

## Architecture

- `captcha.js` — stateless core. Token = `b64url(iv).b64url(ciphertext).b64url(tag)`, AES-256-GCM; payload v2 `{v, s, exp, a, jti}`. `validate()` is **async** (orchestrates store checks). Site must match the token's site exactly. All randomness uses `crypto.randomInt`, never `Math.random`.
- `glyphs.js` — custom stroke font; captcha images render glyphs as `<path>`, NEVER `<text>` (the answer must not be extractable from SVG markup). Don't reintroduce `<text>` or embed the answer anywhere in the SVG.
- `store.js` — optional one-time-use (anti-replay) + per-token attempt counter via Upstash Redis REST (plain `fetch`, no SDK). Auto-enabled by env vars; fail-open on Redis errors (logged).
- `ratelimit.js` — in-memory fixed-window limiter per IP+route; per-instance in serverless. IP comes from first `X-Forwarded-For` entry.
- `handlers.js` — endpoint logic shared by local Express and serverless. Uses only raw `req`/`res` (`statusCode`, `setHeader`, `end`). Do NOT use Express-only APIs (`res.json`, `res.status`, middleware) here. `verify` is async and catches its own errors (Express 4 won't catch rejections).
- `server.js` — Express wrapper + demo page; mounts handlers via `app.all`. Demo uses site `demo` and applies honeypot (`website_url`) + time-trap (`form_ts`, <2s rejects). `GET /health` (no rate limit) is the Docker HEALTHCHECK target.
- `Dockerfile` / `docker-compose.yml` — container deploy for a own server behind Nginx Proxy Manager; compose expects an external NPM network and a host `.env` with `CAPTCHA_SECRET` (fail-fast via `${VAR:?}`). `api/` is Vercel-only and excluded from the image.
- `api/{challenge,image,verify}.js` — thin Vercel function wrappers. Keep them one-line delegations; endpoint changes belong in `handlers.js`.
- `public/widget.js` — embeddable script for consumer sites; plain browser JS (no bundler), auto-detects service URL from its own `src`, auto-inits via `data-target`. Injects captcha inputs plus honeypot (`website_url`) and timestamp (`captcha_ts`) fields — consumer backends are expected to check them (documented in README).

## Behavior gotchas

- `CAPTCHA_SITES` empty = allow ALL sites. If set, it must include `demo` or the local demo page and `npm test` break (both hardcode site `demo`).
- `/api/verify` accepts field aliases: `token`|`captcha_key`, `answer`|`captcha`; `site` is read from query or body.
- Answers: 6 chars from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no 0/O/1/I); comparison is trimmed, case-insensitive, timing-safe. Default TTL 90s.
- All responses set CORS (`CAPTCHA_ORIGIN`, default `*`) and `Cache-Control: no-store`. Rate-limited responses are 429 with `Retry-After`.
