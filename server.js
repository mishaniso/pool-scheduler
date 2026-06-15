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

function hebrewDateParts(date) {
  const formatter = new Intl.DateTimeFormat("en-u-ca-hebrew", { day: "numeric", month: "long" });
  const parts = formatter.formatToParts(date);
  return {
    day: Number(parts.find((part) => part.type === "day")?.value),
    month: parts.find((part) => part.type === "month")?.value || ""
  };
}

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateKeyInTimeZone(date = new Date(), timeZone = "Asia/Jerusalem") {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

function holidayNameForHebrewDate(month, day) {
  const normalizedMonth = month === "Adar II" ? "Adar" : month;
  const holidays = {
    Tishri: {
      1: "ראש השנה",
      2: "ראש השנה",
      9: "ערב יום כיפור",
      10: "יום כיפור",
      14: "ערב סוכות",
      15: "סוכות",
      16: "חול המועד סוכות",
      17: "חול המועד סוכות",
      18: "חול המועד סוכות",
      19: "חול המועד סוכות",
      20: "חול המועד סוכות",
      21: "הושענא רבה",
      22: "שמחת תורה"
    },
    Kislev: { 25: "חנוכה", 26: "חנוכה", 27: "חנוכה", 28: "חנוכה", 29: "חנוכה", 30: "חנוכה" },
    Tevet: { 1: "חנוכה", 2: "חנוכה", 3: "חנוכה" },
    Shevat: { 15: "ט\"ו בשבט" },
    Adar: { 14: "פורים", 15: "שושן פורים" },
    Nisan: {
      14: "ערב פסח",
      15: "פסח",
      16: "חול המועד פסח",
      17: "חול המועד פסח",
      18: "חול המועד פסח",
      19: "חול המועד פסח",
      20: "חול המועד פסח",
      21: "שביעי של פסח"
    },
    Iyar: { 18: "ל\"ג בעומר" },
    Sivan: { 5: "ערב שבועות", 6: "שבועות" }
  };
  return holidays[normalizedMonth]?.[day] || "";
}

function buildIsraeliHolidays(years = [new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1]) {
  const holidays = [];
  years.forEach((year) => {
    const cursor = new Date(`${year}-01-01T12:00:00`);
    while (cursor.getFullYear() === year) {
      const { month, day } = hebrewDateParts(cursor);
      const name = holidayNameForHebrewDate(month, day);
      if (name) holidays.push({ date: localDateKey(cursor), name, source: "2net calendar reference" });
      cursor.setDate(cursor.getDate() + 1);
    }
  });
  return holidays;
}

const defaultSettings = {
  poolName: "בריכה טיפולית",
  openingHour: 7,
  closingHour: 22,
  slotMinutes: 15,
  holidaySourceUrl: "https://calendar.2net.co.il/",
  treatmentTypes: ["וואטסו", "הידרו", "קבוצות", "שחייה", "אחר"],
  holidays: [
    ...buildIsraeliHolidays([2026, 2027, 2028]),
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
  db.settings.openingHour = defaultSettings.openingHour;
  db.settings.closingHour = defaultSettings.closingHour;
  db.settings.slotMinutes = defaultSettings.slotMinutes;
  db.settings.holidaySourceUrl = defaultSettings.holidaySourceUrl;
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

function timeToMinutes(time) {
  const [hours, mins] = String(time || "00:00").split(":").map(Number);
  return hours * 60 + mins;
}

function bookingEndMinutes(booking, fallbackMinutes) {
  return booking.end ? timeToMinutes(booking.end) : timeToMinutes(booking.start) + fallbackMinutes;
}

function rangesOverlap(startA, endA, startB, endB) {
  return startA < endB && startB < endA;
}

function isActive(status) {
  return status === "pending" || status === "approved";
}

function blockedReason(db, date) {
  const day = new Date(`${date}T12:00:00`).getDay();
  if (day === 5) return "יום שישי חסום לזימון.";
  if (day === 6) return "שבת חסומה לזימון.";
  const holiday = (db.settings.holidays || []).find((item) => item.date === date);
  return holiday ? `${holiday.name} חסום לזימון.` : "";
}

function validateSlot(db, date, start, ignoreId = "", requestedEnd = "") {
  const hour = Number(start.slice(0, 2));
  const minute = Number(start.slice(3, 5));
  const reason = blockedReason(db, date);
  if (reason) {
    const error = new Error(reason);
    error.status = 400;
    throw error;
  }
  if (date < dateKeyInTimeZone()) {
    const error = new Error("לא ניתן להזמין תאריך שכבר עבר.");
    error.status = 400;
    throw error;
  }
  const startTotal = hour * 60 + minute;
  const endTotal = requestedEnd ? timeToMinutes(requestedEnd) : startTotal + db.settings.slotMinutes;
  const openTotal = db.settings.openingHour * 60;
  const closeTotal = db.settings.closingHour * 60;
  if (minute % db.settings.slotMinutes !== 0 || endTotal % db.settings.slotMinutes !== 0 || startTotal < openTotal || endTotal > closeTotal || endTotal <= startTotal) {
    const error = new Error("ניתן להזמין רק בין 07:00 ל-22:00 ובמרווחים של 15 דקות.");
    error.status = 400;
    throw error;
  }
  const conflict = db.bookings.find((booking) => {
    if (booking.id === ignoreId || booking.date !== date || !isActive(booking.status)) return false;
    const bookingStart = timeToMinutes(booking.start);
    const bookingEnd = bookingEndMinutes(booking, db.settings.slotMinutes);
    return rangesOverlap(startTotal, endTotal, bookingStart, bookingEnd);
  });
  if (conflict) {
    const error = new Error(`השעה הזו חופפת לזימון קיים (${conflict.start}-${conflict.end}). לא ניתן להזמין שני מטפלים באותו טווח זמן.`);
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

function normalizeRole(role) {
  const nextRole = String(role || "therapist").trim();
  if (!["admin", "therapist", "viewer"].includes(nextRole)) {
    const error = new Error("יש לבחור רמת הרשאה תקינה.");
    error.status = 400;
    throw error;
  }
  return nextRole;
}

function normalizeUserInput(body, existing = null) {
  const name = String(body.name ?? existing?.name ?? "").trim();
  const email = String(body.email ?? existing?.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "").trim();
  if (!name) {
    const error = new Error("יש להזין שם משתמש.");
    error.status = 400;
    throw error;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const error = new Error("יש להזין אימייל תקין.");
    error.status = 400;
    throw error;
  }
  if (!existing && password.length < 4) {
    const error = new Error("יש להזין סיסמה באורך 4 תווים לפחות.");
    error.status = 400;
    throw error;
  }
  return {
    name,
    email,
    password,
    role: normalizeRole(body.role ?? existing?.role),
    phone: String(body.phone ?? existing?.phone ?? "").trim()
  };
}

function assertCanChangeAdmin(db, targetUser, nextRole = targetUser.role) {
  const activeAdmins = db.users.filter((user) => user.role === "admin" && user.id !== targetUser.id);
  if (targetUser.role === "admin" && nextRole !== "admin" && activeAdmins.length === 0) {
    const error = new Error("לא ניתן להסיר את מנהל המערכת האחרון.");
    error.status = 400;
    throw error;
  }
}

async function createUser(req, body) {
  const db = await readJson(DB_FILE, defaultDb);
  requireAdmin(req, db);
  const input = normalizeUserInput(body);
  if (db.users.some((user) => user.email.toLowerCase() === input.email)) {
    const error = new Error("כבר קיים משתמש עם האימייל הזה.");
    error.status = 409;
    throw error;
  }
  const user = { id: crypto.randomUUID(), ...input };
  db.users.push(user);
  await writeJson(DB_FILE, db);
  return { user: publicUser(user) };
}

async function updateUser(req, id, body) {
  const db = await readJson(DB_FILE, defaultDb);
  requireAdmin(req, db);
  const user = db.users.find((candidate) => candidate.id === id);
  if (!user) {
    const error = new Error("משתמש לא נמצא.");
    error.status = 404;
    throw error;
  }
  const input = normalizeUserInput(body, user);
  assertCanChangeAdmin(db, user, input.role);
  if (db.users.some((candidate) => candidate.id !== id && candidate.email.toLowerCase() === input.email)) {
    const error = new Error("כבר קיים משתמש עם האימייל הזה.");
    error.status = 409;
    throw error;
  }
  user.name = input.name;
  user.email = input.email;
  user.role = input.role;
  user.phone = input.phone;
  if (input.password) user.password = input.password;
  await writeJson(DB_FILE, db);
  return { user: publicUser(user) };
}

async function deleteUser(req, id) {
  const db = await readJson(DB_FILE, defaultDb);
  requireAdmin(req, db);
  const index = db.users.findIndex((candidate) => candidate.id === id);
  if (index === -1) {
    const error = new Error("משתמש לא נמצא.");
    error.status = 404;
    throw error;
  }
  assertCanChangeAdmin(db, db.users[index], "deleted");
  const [user] = db.users.splice(index, 1);
  await writeJson(DB_FILE, db);
  return { user: publicUser(user) };
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

async function therapistReport(req, url) {
  const db = await readJson(DB_FILE, defaultDb);
  requireAdmin(req, db);
  const from = url.searchParams.get("from") || "";
  const to = url.searchParams.get("to") || "";
  const therapists = db.users.filter((user) => user.role === "therapist");
  const rows = therapists.map((therapist) => {
    const entries = db.bookings
      .filter((booking) => booking.therapistId === therapist.id && booking.status === "approved")
      .filter((booking) => (!from || booking.date >= from) && (!to || booking.date <= to))
      .sort((a, b) => `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`))
      .map((booking) => ({
        id: booking.id,
        date: booking.date,
        start: booking.start,
        end: booking.end,
        treatmentType: booking.treatmentType,
        patientName: booking.patientName,
        minutes: bookingEndMinutes(booking, db.settings.slotMinutes) - timeToMinutes(booking.start)
      }));
    const totalMinutes = entries.reduce((sum, entry) => sum + entry.minutes, 0);
    return {
      therapistId: therapist.id,
      therapistName: therapist.name,
      totalMinutes,
      totalHours: Number((totalMinutes / 60).toFixed(2)),
      bookingCount: entries.length,
      entries
    };
  }).sort((a, b) => b.totalMinutes - a.totalMinutes);
  return { from, to, rows };
}

async function createBooking(req, body) {
  const db = await readJson(DB_FILE, defaultDb);
  const user = requireUser(req, db);
  if (user.role === "viewer") {
    const error = new Error("משתמש צפייה בלבד לא יכול ליצור זימונים.");
    error.status = 403;
    throw error;
  }
  const therapistId = user.role === "admin" && body.therapistId ? String(body.therapistId) : user.id;
  const therapist = db.users.find((candidate) => candidate.id === therapistId && candidate.role === "therapist");
  if (!therapist) {
    const error = new Error("מטפל לא נמצא.");
    error.status = 400;
    throw error;
  }
  const date = normalizeDate(body.date);
  const start = normalizeTime(body.start);
  const end = body.end ? normalizeTime(body.end) : addMinutes(start, db.settings.slotMinutes);
  const treatmentType = String(body.treatmentType || "").trim();
  if (!db.settings.treatmentTypes.includes(treatmentType)) {
    const error = new Error("יש לבחור סוג טיפול מתוך הרשימה.");
    error.status = 400;
    throw error;
  }
  validateSlot(db, date, start, "", end);
  const now = new Date().toISOString();
  const booking = {
    id: crypto.randomUUID(),
    therapistId: therapist.id,
    therapistName: therapist.name,
    date,
    start,
    end,
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
  validateSlot(db, booking.date, booking.start, booking.id, booking.end);
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
  if (req.method === "POST" && url.pathname === "/api/users") return send(res, 200, await createUser(req, await parseBody(req)));
  if (req.method === "PUT" && parts[0] === "api" && parts[1] === "users" && parts[2]) return send(res, 200, await updateUser(req, parts[2], await parseBody(req)));
  if (req.method === "DELETE" && parts[0] === "api" && parts[1] === "users" && parts[2]) return send(res, 200, await deleteUser(req, parts[2]));
  if (req.method === "GET" && url.pathname === "/api/schedule") return send(res, 200, await listSchedule(req, url));
  if (req.method === "GET" && url.pathname === "/api/reports/therapists") return send(res, 200, await therapistReport(req, url));
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
