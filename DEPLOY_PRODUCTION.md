# Production Deployment Checklist

## Repository (Configured)

- [x] `worker/wrangler.toml` – production ALLOWED_ORIGINS (no pages.dev)
- [x] Frontend API URL: `https://big3d.111dordavid.workers.dev`
- [x] CORS: `https://big3d.pages.dev`, `https://www.big3d.co.il`, `https://big3d.co.il`
- [x] Protected routes require X-Admin-Key

## Cloudflare Dashboard (Manual)

1. **Worker URL (optional custom domain)**
   - Workers & Pages → big3d → Settings → Domains
   - Default Workers URL: `https://big3d.111dordavid.workers.dev`
   - Optional: Add Custom Domain `api.big3d.co.il` for shorter URL

2. **Secrets**
   - Workers & Pages → big3d → Settings → Secrets
   - Add `ADMIN_API_KEY`

3. **SSL**
   - SSL/TLS → Overview: Full (strict)

4. **Rate Limiting (WAF)**
   - Security → WAF → Rate limiting rules
   - e.g. 100 req/min for API, 10/min for POST/PUT/DELETE

5. **DNS** (only if using Custom Domain)
   - Add A/AAAA or CNAME for `api.big3d.co.il` as needed

## Build (required before deploy)

```bash
npm install
npm run build
```

This compiles Tailwind CSS to `css/tailwind.css`. Run before deploying Pages.

## Deploy Worker

```bash
cd worker && npx wrangler deploy
```

Then add the Custom Domain in the dashboard if not using a route.

## Deploy Pages (static only)

Pages is separate from the Worker. Deploy the project as a static site.

- **Build/Deploy command:** `npm run deploy` (בונה dist ומפריס ב־wrangler)
- **הערה:** אם משתמשים ב־wrangler deploy, אין צורך ב־Build output directory – wrangler מפריס את התיקייה dist

- **No wrangler.toml at root** – Worker config lives in `worker/` so Pages won't treat this as a Workers/Pages hybrid
- **No _redirects** – Removed to avoid SPA fallback infinite loop (site uses hash routing)
- **No Pages Functions** – In Cloudflare Dashboard: Pages → your project → Settings → Functions → **Disable** if enabled

### אם sitemap.xml מחזיר 404
וודא ש־**Build output directory** ב־Cloudflare Pages מוגדר ל־`dist`. אם השדה ריק או מפנה לתיקייה אחרת, sitemap.xml לא יישלח.
