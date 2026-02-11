# הגדרת Backend ב-Cloudflare – BIG 3D

ה-Backend הועבר מ-Supabase ל-Cloudflare Workers + D1 + R2.

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
wrangler d1 create big3d-db
```

פלט לדוגמה:
```
✅ Successfully created DB 'big3d-db'
[[d1_databases]]
binding = "DB"
database_name = "big3d-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

העתק את `database_id` ל-`wrangler.toml`.

### 3. יצירת R2 Bucket

```bash
wrangler r2 bucket create big3d-images
```

### 4. עדכון wrangler.toml

ערוך את `wrangler.toml`:

- החלף `YOUR_D1_DATABASE_ID` ב-`database_id` מהשלב הקודם.

### 5. הרצת סכמת DB

```bash
wrangler d1 execute big3d-db --remote --file=./cloudflare-schema.sql
```

### 6. הגדרת Admin API Key

```bash
wrangler secret put ADMIN_API_KEY
```

הזן סיסמה חזקה (למשל מ־`openssl rand -base64 32`).

### 7. פריסת Worker

```bash
wrangler deploy
```

הפלט יכיל URL כמו:  
`https://big3d-api.<your-subdomain>.workers.dev`

### 8. עדכון ה-URL בקוד

ב־`js/cloudflare-config.js` (ובמידת הצורך גם ב־`js/portfolio-loader.js`):

```javascript
window.CLOUDFLARE_API_URL = 'https://big3d-api.<your-subdomain>.workers.dev';
```

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
| GET | `/storage/:path` | לא | שירות קבצים מ-R2 |

## התחברות ל-Admin

1. היכנס ל־`admin.html`
2. הזן את ה־Admin API Key (מה־secret)
3. הפרויקטים ייטענו מ־Cloudflare

## ייבוא פרויקטים קיימים

ב־Admin לחץ על **"ייבא פרויקטים קיימים"** – הפרויקטים מהאתר ייובאו ל־D1 עם קישורים לתמונות הקיימות.

## מבנה הפרויקט

```
worker/
  index.js          # Cloudflare Worker
wrangler.toml       # תצורת Cloudflare
cloudflare-schema.sql   # סכמת D1
js/
  cloudflare-config.js  # תצורה ו־API client
  admin.js              # פאנל ניהול
  portfolio-loader.js   # טעינת פרויקטים באתר הראשי
```
