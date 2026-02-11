# Production Verification Checklist – BIG 3D

## ✅ 1. CORS & ALLOWED_ORIGINS

| Item | Status |
|------|--------|
| https://big3d.co.il | ✅ In wrangler.toml |
| https://www.big3d.co.il | ✅ In wrangler.toml |
| Dynamic CORS from Origin | ✅ Worker uses `getCorsHeaders(origin, env)` |
| CORS on success responses | ✅ All handlers pass `cors` |
| CORS on error responses | ✅ `errorResponse()` includes cors |
| OPTIONS preflight | ✅ Returns 204 with cors headers |

## ✅ 2. Worker Bindings & Secrets

| Item | Status |
|------|--------|
| ADMIN_API_KEY | Secret via `wrangler secret put` (not in wrangler.toml) |
| D1 binding: DB | ✅ In wrangler.toml |
| R2 binding: BUCKET | ✅ In wrangler.toml |
| compatibility_date | ✅ `2024-01-01` |

**Note:** Set `database_id` in wrangler.toml after `wrangler d1 create big3d-db`.

## ✅ 3. Headers & Security

| Item | Status |
|------|--------|
| _headers in project root | ✅ Same level as index.html |
| Strict-Transport-Security | ✅ max-age=31536000; includeSubDomains; preload |
| X-Content-Type-Options | ✅ nosniff |
| X-Frame-Options | ✅ DENY |
| Referrer-Policy | ✅ strict-origin-when-cross-origin |
| Cache-Control (static) | ✅ JS, images: max-age=31536000 |
| Cache-Control (HTML) | ✅ max-age=0, must-revalidate |

## ✅ 4. Admin Security

| Item | Status |
|------|--------|
| ADMIN_API_KEY in frontend | ✅ Never – only in Worker env |
| Key hardcoded in JS | ✅ No |
| Key sent via X-Admin-Key header | ✅ Yes |
| Admin routes protected in Worker | ✅ `isAuthenticated()` before POST/PUT/DELETE |
| robots.txt Disallow: /admin | ✅ Yes |

## ✅ 5. File Upload Hardening

| Item | Status |
|------|--------|
| Max file size 10MB | ✅ Enforced in Worker |
| MIME validation | ✅ Strict allowlist: image/jpeg, image/jpg, image/png, image/gif, image/webp |
| 413 for oversized | ✅ Yes |
| 400 for invalid type | ✅ Yes |
| SVG/risky types blocked | ✅ Not in allowlist |

## ✅ 6. Frontend Verification

| Item | Status |
|------|--------|
| console.log/error removed | ✅ No matches |
| External scripts use defer | ✅ tailwind, lucide, cloudflare-config, admin, portfolio-loader |
| Images loading="lazy" | ✅ Thumbnails |
| CLOUDFLARE_API_URL | ✅ Set to `https://big3d.111dordavid.workers.dev` |
| Supabase/Netlify refs | ✅ None in code (only in docs as “removed”) |

## ✅ 7. Performance & Caching

| Item | Status |
|------|--------|
| Static assets cache | ✅ _headers |
| HTML not cached aggressively | ✅ max-age=0 |
| R2 objects caching | ✅ Cache-Control: public, max-age=31536000 |

## ✅ 8. SEO & Cleanliness

| Item | Status |
|------|--------|
| sitemap.xml | ✅ Valid XML, main sections |
| robots.txt Disallow /admin.html | ✅ Yes |
| Meta tags (title, description, og, twitter) | ✅ Present |
| Canonical URL | ✅ Set |

## 9. Pre-Deploy Actions

1. Run `wrangler d1 create big3d-db` and set `database_id` in wrangler.toml
2. Run `wrangler d1 execute big3d-db --remote --file=./cloudflare-schema.sql`
3. Run `wrangler secret put ADMIN_API_KEY`
4. Add your Pages URL to `ALLOWED_ORIGINS` in wrangler.toml
5. CLOUDFLARE_API_URL: `https://big3d.111dordavid.workers.dev` (already set in cloudflare-config.js and portfolio-loader.js)
6. Deploy Worker: `wrangler deploy`
7. Deploy Pages: connect Git or `wrangler pages deploy`

## Production Risks (Low)

- **CLOUDFLARE_API_URL:** Set to `https://big3d.111dordavid.workers.dev` in cloudflare-config.js and portfolio-loader.js
- **og-image.jpg:** ⚠️ Referenced in meta tags but file **missing** – add `/og-image.jpg` (1200×630px recommended) or update meta tags
- **Rate limiting:** Configure in Cloudflare Dashboard for extra protection
