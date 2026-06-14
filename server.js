const http = require("http");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const ROOT = __dirname;
const DATA_DIR = process.env.POOL_DATA_DIR ? path.resolve(process.env.POOL_DATA_DIR) : path.join(ROOT, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const PUBLIC_DIR = path.join(ROOT, "public");
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

const defaultSettings = {
  poolName: "בריכה טיפולית",
  openingHour: 8,
  closingHour: 20,
  slotMinutes: 60,
  treatmentTypes: ["וואטסו", "הידרו", "קבוצות", "שחייה", "אחר"],
  holidays: [
    { date: "2026-02-02", name: "ראש השנה לאילנות" },
    { date: "2026-03-03", name: "פורים" },
    { date: "2026-03-04", name: "שושן פורים" },
    { date: "2026-04-01", name: "ערב פסח" },
    { date: "2026-04-02", name: "פסח" },
    { date: "2026-04-03", name: "חול המועד פסח" },
    { date: "2026-04-04", name: "חול המועד פסח" },
    { date: "2026-04-05", name: "חול המועד פסח" },
    { date: "2026-04-06", name: "חול המועד פסח" },
    { date: "2026-04-07", name: "חול המועד פסח" },
    { date: "2026-04-08", name: "שביעי של פסח" },
    { date: "2026-04-22", name: "יום העצמאות" },
    { date: "2026-05-05", name: "ל\"ג בעומר" },
    { date: "2026-05-21", name: "ערב שבועות" },
    { date: "2026-05-22", name: "שבועות" },
    { date: "2026-09-11", name: "ערב ראש השנה" },
    { date: "2026-09-12", name: "ראש השנה" },
    { date: "2026-09-13", name: "ראש השנה" },
    { date: "2026-09-20", name: "ערב יום כיפור" },
    { date: "2026-09-21", name: "יום כיפור" },
    { date: "2026-09-25", name: "ערב סוכות" },
    { date: "2026-09-26", name: "סוכות" },
    { date: "2026-09-27", name: "חול המועד סוכות" },
    { date: "2026-09-28", name: "חול המועד סוכות" },
    { date: "2026-09-29", name: "חול המועד סוכות" },
    { date: "2026-09-30", name: "חול המועד סוכות" },
    { date: "2026-10-01", name: "חול המועד סוכות" },
    { date: "2026-10-02", name: "הושענא רבה" },
    { date: "2026-10-03", name: "שמחת תורה" },
    { date: "2026-12-05", name: "חנוכה" },
    { date: "2026-12-06", name: "חנוכה" },
    { date: "2026-12-07", name: "חנוכה" },
    { date: "2026-12-08", name: "חנוכה" },
    { date: "2026-12-09", name: "חנוכה" },
    { date: "2026-12-10", name: "חנוכה" },
    { date: "2026-12-11", name: "חנוכה" },
    { date: "2026-12-12", name: "חנוכה" }
  ]
};

const defaultDb = {
  users: [
    { id: "admin", name: "מנהל/ת המערכת", email: "admin@pool.local", password: "admin123", role: "admin", phone: "0500000000" },
    { id: "tamar", name: "תמר לוי", email: "tamar@pool.local", password: "123456", role: "therapist", phone: "0521112233" },
    { id: "noam", name: "נועם כהן", email: "noam@pool.local", password: "123456", role: "therapist", phone: "0542223344" }
  ],
  settings: defaultSettings,
  bookings: [
    { id: "demo-approved", therapistId: "tamar", therapistName: "תמר לוי", date: "2026-06-15", start: "09:00", end: "10:00", treatmentType: "הידרו", patientName: "דוגמה", notes: "", status: "approved", createdAt: new Date().toISOString(), approvedAt: new Date().toISOString(), approvedBy: "admin" },
    { id: "demo-pending", therapistId: "noam", therapistName: "נועם כהן", date: "2026-06-16", start: "12:00", end: "13:00", treatmentType: "וואטסו", patientName: "ממתין לאישור", notes: "", status: "pending", createdAt: new Date().toISOString() }
  ]
};

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return structuredClone(fallback);
  }
}

async function writeJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2), "utf8");
}

async function ensureData() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  let db = await readJson(DB_FILE, null);
  if (!db) {
    await writeJson(DB_FILE, defaultDb);
    return;
  }
  db.settings = { ...defaultSettings, ...(db.settings || {}) };
  db.settings.treatmentTypes = defaultSettings.treatmentTypes;
  const holidays = new Map((db.settings.holidays || []).map((holiday) => [holiday.date, holiday]));
  defaultSettings.holidays.forEach((holiday) => holidays.set(holiday.date, holiday));
  db.settings.holidays = [...holidays.values()].sort((a, b) => a.date.localeCompare(b.date));
  db.bookings = (db.bookings || []).map((booking) => ({ treatmentType: "הידרו", ...booking }));
  await writeJson(DB_FILE, db);
}

function send(res, status, data, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(type.startsWith("application/json") ? JSON.stringify(data) : data);
}

async function parseBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("הבקשה אינה תקינה.");
    error.status = 400;
    throw error;
  }
}

function publicUser(user) {
  const { password, ...safeUser } = user;
  return safeUser;
}

function requireUser(req, db) {
  const userId = req.headers["x-user-id"];
  const user = db.users.find((candidate) => candidate.id === userId);
  if (!user) {
    const error = new Error("יש להתחבר למערכת.");
    error.status = 401;
    throw error;
  }
  return user;
}

function requireAdmin(req, db) {
  const user = requireUser(req, db);
  if (user.role !== "admin") {
    const error = new Error("פעולה זו זמינה למנהל מערכת בלבד.");
    error.status = 403;
    throw error;
  }
  return user;
}

function normalizeDate(value) {
  const date = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const error = new Error("יש לבחור תאריך תקין.");
    error.status = 400;
    throw error;
  }
  return date;
}

function normalizeTime(value) {
  const time = String(value || "").trim();
  if (!/^\d{2}:\d{2}$/.test(time)) {
    const error = new Error("יש לבחור שעה תקינה.");
    error.status = 400;
    throw error;
  }
  return time;
}

function addMinutes(time, minutes) {
  const [hours, mins] = time.split(":").map(Number);
  const total = hours * 60 + mins + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function isActive(status) {
  return status === "pending" || status === "approved";
}

function validateSlot(db, date, start, ignoreId = "") {
  const hour = Number(start.slice(0, 2));
  const minute = Number(start.slice(3, 5));
  if (minute !== 0 || hour < db.settings.openingHour || hour >= db.settings.closingHour) {
    const error = new Error("ניתן להזמין רק שעות עגולות בתוך שעות פעילות הבריכה.");
    error.status = 400;
    throw error;
  }
  const conflict = db.bookings.find((booking) => booking.id !== ignoreId && booking.date === date && booking.start === start && isActive(booking.status));
  if (conflict) {
    const error = new Error("השעה הזו כבר תפוסה. לא ניתן להזמין שני מטפלים באותה שעה.");
    error.status = 409;
    throw error;
  }
}

async function login(body) {
  const db = await readJson(DB_FILE, defaultDb);
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const user = db.users.find((candidate) => candidate.email.toLowerCase() === email && candidate.password === password);
  if (!user) {
    const error = new Error("פרטי ההתחברות אינם נכונים.");
    error.status = 401;
    throw error;
  }
  return { user: publicUser(user) };
}

async function listUsers(req) {
  const db = await readJson(DB_FILE, defaultDb);
  requireUser(req, db);
  return { users: db.users.map(publicUser) };
}

async function listSchedule(req, url) {
  const db = await readJson(DB_FILE, defaultDb);
  const user = requireUser(req, db);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const bookings = db.bookings
    .filter((booking) => (!from || booking.date >= from) && (!to || booking.date <= to))
    .filter((booking) => user.role === "admin" || booking.therapistId === user.id || booking.status === "approved")
    .sort((a, b) => `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`));
  return { settings: db.settings, bookings };
}

async function createBooking(req, body) {
  const db = await readJson(DB_FILE, defaultDb);
  const user = requireUser(req, db);
  const therapistId = user.role === "admin" && body.therapistId ? String(body.therapistId) : user.id;
  const therapist = db.users.find((candidate) => candidate.id === therapistId && candidate.role === "therapist");
  if (!therapist) {
    const error = new Error("מטפל לא נמצא.");
    error.status = 400;
    throw error;
  }
  const date = normalizeDate(body.date);
  const start = normalizeTime(body.start);
  const treatmentType = String(body.treatmentType || "").trim();
  if (!db.settings.treatmentTypes.includes(treatmentType)) {
    const error = new Error("יש לבחור סוג טיפול מתוך הרשימה.");
    error.status = 400;
    throw error;
  }
  validateSlot(db, date, start);
  const now = new Date().toISOString();
  const booking = {
    id: crypto.randomUUID(),
    therapistId: therapist.id,
    therapistName: therapist.name,
    date,
    start,
    end: addMinutes(start, db.settings.slotMinutes),
    treatmentType,
    patientName: String(body.patientName || "").trim(),
    notes: String(body.notes || "").trim(),
    status: user.role === "admin" && body.approveNow ? "approved" : "pending",
    createdAt: now,
    createdBy: user.id
  };
  if (booking.status === "approved") {
    booking.approvedAt = now;
    booking.approvedBy = user.id;
  }
  db.bookings.push(booking);
  await writeJson(DB_FILE, db);
  return { booking };
}

async function approveBooking(req, id) {
  const db = await readJson(DB_FILE, defaultDb);
  const admin = requireAdmin(req, db);
  const booking = db.bookings.find((candidate) => candidate.id === id);
  if (!booking) {
    const error = new Error("הזימון לא נמצא.");
    error.status = 404;
    throw error;
  }
  if (booking.status !== "pending") {
    const error = new Error("ניתן לאשר רק זימון שממתין לאישור.");
    error.status = 400;
    throw error;
  }
  validateSlot(db, booking.date, booking.start, booking.id);
  booking.status = "approved";
  booking.approvedAt = new Date().toISOString();
  booking.approvedBy = admin.id;
  await writeJson(DB_FILE, db);
  return { booking };
}

async function updateBookingStatus(req, id, status) {
  const db = await readJson(DB_FILE, defaultDb);
  const user = requireUser(req, db);
  const booking = db.bookings.find((candidate) => candidate.id === id);
  if (!booking) {
    const error = new Error("הזימון לא נמצא.");
    error.status = 404;
    throw error;
  }
  const ownerCancelsPending = status === "cancelled" && booking.therapistId === user.id && booking.status === "pending";
  if (user.role !== "admin" && !ownerCancelsPending) {
    const error = new Error("רק מנהל יכול לבטל זימונים מאושרים או לדחות בקשות.");
    error.status = 403;
    throw error;
  }
  booking.status = status;
  booking.updatedAt = new Date().toISOString();
  booking.updatedBy = user.id;
  await writeJson(DB_FILE, db);
  return { booking };
}

async function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const parts = url.pathname.split("/").filter(Boolean);
  if (req.method === "POST" && url.pathname === "/api/login") return send(res, 200, await login(await parseBody(req)));
  if (req.method === "GET" && url.pathname === "/api/users") return send(res, 200, await listUsers(req));
  if (req.method === "GET" && url.pathname === "/api/schedule") return send(res, 200, await listSchedule(req, url));
  if (req.method === "POST" && url.pathname === "/api/bookings") return send(res, 200, await createBooking(req, await parseBody(req)));
  if (req.method === "POST" && parts[0] === "api" && parts[1] === "bookings" && parts[2] && parts[3] === "approve") return send(res, 200, await approveBooking(req, parts[2]));
  if (req.method === "POST" && parts[0] === "api" && parts[1] === "bookings" && parts[2] && parts[3] === "cancel") return send(res, 200, await updateBookingStatus(req, parts[2], "cancelled"));
  if (req.method === "POST" && parts[0] === "api" && parts[1] === "bookings" && parts[2] && parts[3] === "reject") return send(res, 200, await updateBookingStatus(req, parts[2], "rejected"));
  return send(res, 404, { error: "נתיב לא נמצא." });
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requested = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const file = path.normalize(path.join(PUBLIC_DIR, requested));
  if (!file.startsWith(PUBLIC_DIR)) return send(res, 403, "Forbidden", "text/plain; charset=utf-8");
  try {
    send(res, 200, await fs.readFile(file), mimeTypes[path.extname(file)] || "application/octet-stream");
  } catch {
    send(res, 404, "Not found", "text/plain; charset=utf-8");
  }
}

const server = http.createServer(async (req, res) => {
  try {
    await ensureData();
    if (req.url.startsWith("/api/")) return await handleApi(req, res);
    return await serveStatic(req, res);
  } catch (error) {
    send(res, error.status || 500, { error: error.message || "שגיאה לא צפויה." });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Pool scheduler is running on port ${PORT}`);
});
