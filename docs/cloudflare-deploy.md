# Cloudflare Deployment Runbook (mikotoba.app)

## 1) Prerequisites

- Cloudflare account and Workers enabled
- `mikotoba.app` already added to Cloudflare DNS
- `npm install` completed
- Convex production deployment already active:
  - `https://compassionate-penguin-753.convex.cloud`

## 2) Required environment variables

Set these in Cloudflare Workers Build/Runtime settings (Production):

- `NEXT_PUBLIC_CONVEX_URL`
- `NEXT_PUBLIC_CONVEX_SITE_URL`
- `GEMINI_API_KEY`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `CLERK_JWT_ISSUER_DOMAIN`
- `NEXT_PUBLIC_CLERK_SIGN_IN_URL`
- `NEXT_PUBLIC_CLERK_SIGN_UP_URL`

Also ensure `.dev.vars` is set for production deploy behavior:

- `NEXTJS_ENV=production`

## 3) Local verification

```bash
npm run build
npm run preview
```

## 4) Deploy

```bash
npm run deploy
```

This uses `wrangler.jsonc` and deploys Worker `mikotoba-app`.

## 5) Custom domain attach

In Cloudflare Dashboard:

1. Workers & Pages -> `mikotoba-app` -> Settings -> Domains & Routes
2. Add:
   - `mikotoba.app`
   - `www.mikotoba.app` (optional)
3. Ensure DNS records are proxied (orange cloud).

## 6) Post-deploy checks

- Open `https://mikotoba.app/`
- Sign in with Clerk
- Confirm profile and chat read/write works
- Confirm Convex writes appear in prod tables
