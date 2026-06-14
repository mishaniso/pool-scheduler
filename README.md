# Pool Scheduler

מערכת וובית לניהול לו"ז בריכה טיפולית.

## הפעלה מקומית

```bash
npm start
```

ואז לפתוח:

```text
http://localhost:3000
```

## משתמשים לדוגמה

- מנהל: `admin@pool.local` / `admin123`
- מטפלת: `tamar@pool.local` / `123456`
- מטפל: `noam@pool.local` / `123456`

## פרסום ב-Render

בחר `New Web Service` והגדר:

```text
Build Command: npm install
Start Command: npm start
Plan: Free
```

לא להגדיר `PORT`. Render מגדיר אותו לבד.

שים לב: בגרסה זו הנתונים נשמרים בקובץ. לפרודקשן אמיתי מומלץ להעביר בהמשך למסד נתונים כמו Supabase.
