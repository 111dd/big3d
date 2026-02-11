# Production Deployment Checklist

## Repository (Configured)

- [x] `wrangler.toml` – production ALLOWED_ORIGINS (no pages.dev)
- [x] Frontend API URL: `https://big3d.111dordavid.workers.dev`
- [x] CORS: only `https://www.big3d.co.il` and `https://big3d.co.il`
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

## Deploy

```bash
npx wrangler deploy
```

Then add the Custom Domain in the dashboard if not using a route.
