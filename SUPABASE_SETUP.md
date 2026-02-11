# הגדרת Supabase ל-BIG 3D Admin Panel

## שלב 1: יצירת פרויקט ב-Supabase

1. היכנס ל-https://supabase.com
2. צור פרויקט חדש
3. שמור את ה-URL וה-anon key

## שלב 2: הגדרת Database

1. ב-Supabase Dashboard, לך ל-SQL Editor
2. העתק והרץ את כל הקוד מ-`supabase-setup.sql`
3. ודא שהטבלאות נוצרו:
   - `projects`
   - `images`
   - Storage bucket: `project-images`

## שלב 3: הגדרת Authentication

1. ב-Supabase Dashboard, לך ל-Authentication → Users
2. לחץ על "Add user" או "Invite user"
3. צור משתמש admin עם אימייל וסיסמה
4. שמור את האימייל והסיסמה (תצטרך אותם להתחברות)

## שלב 4: עדכון הקבצים

### עדכן `js/supabase-config.js`:
```javascript
const SUPABASE_URL = 'https://xxxxx.supabase.co'; // ה-URL שלך
const SUPABASE_ANON_KEY = 'eyJhbGc...'; // ה-anon key שלך
```

### עדכן `index.html` (שורה ~1199):
```javascript
const SUPABASE_URL = 'https://xxxxx.supabase.co'; // אותו URL
const SUPABASE_ANON_KEY = 'eyJhbGc...'; // אותו anon key
```

## שלב 5: העלאת תמונות קיימות (אופציונלי)

אם אתה רוצה להעביר את התמונות הקיימות ל-Supabase:

1. פתח את `admin.html` בדפדפן
2. התחבר עם האימייל והסיסמה שיצרת
3. הוסף כל פרויקט מחדש דרך ממשק ה-admin
4. העלה את התמונות דרך הממשק

או השתמש ב-Supabase Storage Dashboard להעלות ידנית.

## שלב 6: בדיקה

1. פתח את `admin.html` - אמור לראות מסך התחברות
2. התחבר עם האימייל והסיסמה
3. נסה להוסיף פרויקט חדש
4. בדוק שהפרויקט מופיע ב-`index.html`

## הערות חשובות:

- **אבטחה**: ה-anon key בטוח לשימוש ב-frontend, אבל יש Row Level Security (RLS) שמגן על הנתונים
- **Storage**: התמונות נשמרות ב-Supabase Storage, לא ב-Database
- **Fallback**: אם Supabase לא מוגדר, האתר ישתמש בנתונים הקיימים (hardcoded)
- **Netlify**: אחרי העלאה ל-Netlify, ודא שה-URLs נכונים

## פתרון בעיות:

- אם התמונות לא נטענות: בדוק את ה-Storage policies ב-Supabase
- אם לא יכול להתחבר: ודא שיצרת משתמש ב-Authentication
- אם לא יכול להעלות תמונות: בדוק את ה-Storage bucket policies
