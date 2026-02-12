# הגדרת Backend ב-Cloudflare – BIG 3D

Backend: Cloudflare Workers + D1 + R2.

## דרישות

- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)
- חשבון Cloudflare

## התקנה ופריסה

### 1. התקנת Wrangler

```bash
npm install -g wrangler
wrangler login
```

### 2. יצירת D1 Database

```bash
cd worker && wrangler d1 create big3d-db
```

פלט לדוגמה:
```
✅ Successfully created DB 'big3d-db'
[[d1_databases]]
binding = "DB"
database_name = "big3d-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

העתק את `database_id` ל-`worker/wrangler.toml`.

### 3. יצירת R2 Bucket

```bash
cd worker && wrangler r2 bucket create big3d-images
```

### 4. עדכון wrangler.toml

ערוך את `worker/wrangler.toml`:

- החלף `YOUR_D1_DATABASE_ID` ב-`database_id` מהשלב הקודם.

### 5. הרצת סכמת DB

```bash
cd worker
wrangler d1 execute big3d-db --remote --file=./cloudflare-schema.sql
```

### 6. הגדרת Admin API Key

```bash
cd worker && wrangler secret put ADMIN_API_KEY
```

הזן סיסמה חזקה (למשל מ־`openssl rand -base64 32`).

### 7. פריסת Worker

```bash
cd worker
wrangler deploy
```

הפלט יכיל URL כמו:  
`https://big3d.111dordavid.workers.dev`

### 7a. פריסת האתר הסטטי (Cloudflare)

הפרויקט מוגדר עם `wrangler.toml` בשורש שמפריס את `dist/`. 

**Build command ב־Cloudflare Dashboard:** `npm run deploy`

זה מריץ:
1. `npm run build` – בונה CSS ומכין dist/
2. `npx wrangler deploy` – מפריס את dist כ־static assets

**Worker ה־API (worker/)** מפריסים בנפרד: `cd worker && wrangler deploy`

### 8. עדכון ה-URL בקוד

בפרודקשן משתמשים ב־`https://big3d.111dordavid.workers.dev` (Workers URL).

## API Endpoints

| Method | Path | Auth | תיאור |
|--------|------|------|-------|
| GET | `/projects` | לא | רשימת פרויקטים |
| GET | `/projects/:id` | כן | פרויקט בודד |
| POST | `/projects` | כן | יצירת פרויקט |
| PUT | `/projects/:id` | כן | עדכון פרויקט |
| DELETE | `/projects/:id` | כן | מחיקת פרויקט |
| POST | `/projects/:id/images` | כן | העלאת תמונה (FormData) |
| GET | `/site-logos` | לא | לוגו פעיל |
| POST | `/site-logos` | כן | העלאת לוגו (FormData) |
| GET | `/storage/:path` | לא | שירות קבצים מ-R2 (תמיכה ב־`?w=400` לצמצום thumbnails) |

**Image Resizing:** תמונות מ-R2 תומכות ב־`?w=400` (או `?width=400`) – Cloudflare מקטין אותן אוטומטית. ודא ש־**Image Resizing** מופעל ב־Dashboard → Speed → Optimization → Image Resizing. (חינמי עד 5,000 טרנספורמציות/חודש.)

## Rate Limiting (Production)

מומלץ להגדיר **Rate limiting** ב-Cloudflare Dashboard:

1. דף ה-Worker → Settings → Add trigger
2. או: Security → WAF → Rate limiting rules
3. הגדר למשל: 100 requests/minute ל-API, 10/min ל-POST/PUT/DELETE

זה מגן מפני brute-force והתקפות DDoS.

## התחברות ל-Admin

1. היכנס ל־`admin.html`
2. הזן את ה־Admin API Key (מה־secret)
3. הפרויקטים ייטענו מ־Cloudflare

## ייבוא פרויקטים קיימים

ב־Admin לחץ על **"ייבא פרויקטים קיימים"** – הפרויקטים מהאתר ייובאו ל־D1 עם קישורים לתמונות הקיימות.

## CORS – ALLOWED_ORIGINS

ב־`worker/wrangler.toml` (פרודקשן): `https://big3d.pages.dev`, `https://big3d.co.il`, `https://www.big3d.co.il`.

## רשימת בדיקה לפני Deploy

1. **Worker:** `cd worker && wrangler deploy`
2. **Pages:** פריסת התיקייה דרך Git או `wrangler pages deploy`
3. **עדכון URL:** וודא ש־`CLOUDFLARE_API_URL` ב־`js/cloudflare-config.js` ו־`js/portfolio-loader.js` מצביע ל־`https://big3d.111dordavid.workers.dev`
4. **בדיקות:** גלריה נטענת, Admin login, העלאת תמונות, API מחזיר JSON תקין

## מבנה הפרויקט

```
worker/
  index.js          # Cloudflare Worker
  wrangler.toml     # תצורת Cloudflare
  cloudflare-schema.sql   # סכמת D1
js/
  cloudflare-config.js  # תצורה ו־API client
  admin.js              # פאנל ניהול
  portfolio-loader.js   # טעינת פרויקטים באתר הראשי
```
