# BIG 3D

Static portfolio site with Cloudflare backend.

## Stack

- **Frontend:** HTML, vanilla JS, Tailwind CSS
- **Hosting:** Cloudflare Pages
- **API:** Cloudflare Workers
- **Database:** Cloudflare D1
- **Storage:** Cloudflare R2

## Setup

See [CLOUDFLARE_SETUP.md](CLOUDFLARE_SETUP.md) for deployment instructions.

## Project Structure

```
├── index.html          # Main site
├── admin.html          # Admin panel
├── js/                 # Scripts
├── worker/             # Cloudflare Worker API
├── wrangler.toml       # Worker config
├── cloudflare-schema.sql
├── _headers            # Pages cache headers
└── _redirects          # Pages redirects
```
