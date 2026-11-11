# ZEROX BYPASS Panel

Self-hosted key panel UI (TanStack Start + React 19 + Tailwind 4).
No Lovable / Cloudflare dependency — builds to a plain Node server.

> **Note:** This build has no database. Login uses local demo auth
> (owner / owner123, stored in the browser). Registration, admin user
> management, key generation and the `/api/public/connect` endpoint are
> disabled and return errors/`status:false` until a database is wired in.

## Local development

```bash
npm install
npm run dev        # http://localhost:8080
```

## Production build (Node server)

```bash
npm install
npm run build      # produces .output/server/index.mjs
node .output/server/index.mjs   # serves on $PORT (default 3000)
```

## Deploy on Render

The repo includes `render.yaml` (blueprint):

1. Push this repo to GitHub.
2. On Render: **New → Blueprint**, pick the repo.
3. It creates a free web service: build `npm install && npm run build`,
   start `node .output/server/index.mjs`, region Singapore.

Manual setup (New → Web Service): same build/start commands,
runtime Node 22+.

## Project structure

- `src/routes/` — pages (login, dashboard, keys, referral, history, settings, admin)
- `src/routes/api/public/connect.ts` — login.h connect endpoint (stubbed)
- `src/components/zx/` — panel UI shell, background, splash, themes
- `src/lib/` — auth, queries, WebAuthn (fingerprint) helpers
- `docs/CONNECT_PROTOCOL.md` — connect protocol spec for game loaders
