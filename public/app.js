const state = {
  user: JSON.parse(localStorage.getItem("poolUser") || "null"),
  users: [],
  settings: { openingHour: 7, closingHour: 22, slotMinutes: 15, treatmentTypes: [], holidays: [] },
  bookings: [],
  weekStart: startOfWeek(new Date()),
  selectedDate: isoDate(new Date())
};

const els = {
  loginView: document.querySelector("#loginView"),
  appView: document.querySelector("#appView"),
  loginForm: document.querySelector("#loginForm"),
  loginStatus: document.querySelector("#loginStatus"),
  appStatus: document.querySelector("#appStatus"),
  calendar: document.querySelector("#calendar"),
  calendarRange: document.querySelector("#calendarRange"),
  weekTitle: document.querySelector("#weekTitle"),
  userName: document.querySelector("#userName"),
  pendingCount: document.querySelector("#pendingCount"),
  approvedCount: document.querySelector("#approvedCount"),
  pendingList: document.querySelector("#pendingList"),
  myBookings: document.querySelector("#myBookings"),
  bookingDialog: document.querySelector("#bookingDialog"),
  bookingForm: document.querySelector("#bookingForm"),
  bookingDate: document.querySelector("#bookingDate"),
  bookingStart: document.querySelector("#bookingStart"),
  treatmentType: document.querySelector("#treatmentType"),
  bookingTherapist: document.querySelector("#bookingTherapist"),
  therapistField: document.querySelector("#therapistField"),
  approveNowField: document.querySelector("#approveNowField"),
  approveNow: document.querySelector("#approveNow"),
  userAdminPanel: document.querySelector("#userAdminPanel"),
  userForm: document.querySelector("#userForm"),
  usersAdminList: document.querySelector("#usersAdminList"),
  usersNavLink: document.querySelector("#usersNavLink"),
  usersMobileBtn: document.querySelector("#usersMobileBtn"),
  backToScheduleBtn: document.querySelector("#backToScheduleBtn"),
  scheduleScreen: document.querySelector("#scheduleScreen"),
  userAdminScreen: document.querySelector("#userAdminScreen"),
  newBookingBtn: document.querySelector("#newBookingBtn")
};

function startOfWeek(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  next.setDate(next.getDate() - next.getDay());
  return next;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function isoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(date) {
  return new Intl.DateTimeFormat("he-IL", { day: "2-digit", month: "2-digit" }).format(date);
}

function formatFullDate(date) {
  return new Intl.DateTimeFormat("he-IL", { weekday: "long", day: "2-digit", month: "long" }).format(date);
}

function formatMobileDay(date) {
  return new Intl.DateTimeFormat("he-IL", { weekday: "short", day: "2-digit", month: "2-digit" }).format(date);
}

function statusText(status) {
  return { pending: "ממתין לאישור", approved: "מאושר", cancelled: "בוטל", rejected: "נדחה" }[status] || status;
}

function treatmentClass(type = "") {
  if (type.includes("וואטסו")) return "type-watsu";
  if (type.includes("הידרו")) return "type-hydro";
  if (type.includes("קבוצ")) return "type-group";
  if (type.includes("שחייה")) return "type-swim";
  return "type-other";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function holidayFor(date) {
  const key = isoDate(date);
  return (state.settings.holidays || []).find((holiday) => holiday.date === key);
}

function blockedReasonForDay(date) {
  const holiday = holidayFor(date);
  if (date.getDay() === 5) return "יום שישי";
  if (date.getDay() === 6) return "שבת";
  return holiday?.name || "";
}

function timeSlots() {
  const slots = [];
  const step = Number(state.settings.slotMinutes || 15);
  const start = Number(state.settings.openingHour || 7) * 60;
  const end = Number(state.settings.closingHour || 22) * 60;
  for (let minutes = start; minutes + step <= end; minutes += step) {
    slots.push(`${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`);
  }
  return slots;
}

function roleText(role) {
  return { admin: "מנהל/ת", therapist: "מטפל/ת", viewer: "צפייה בלבד" }[role] || role;
}

function setStatus(message, isError = false) {
  els.appStatus.textContent = message;
  els.appStatus.classList.toggle("error", isError);
  if (message) setTimeout(() => {
    if (els.appStatus.textContent === message) els.appStatus.textContent = "";
  }, 3500);
}

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (state.user?.id) headers["X-User-Id"] = state.user.id;
  const response = await fetch(path, { ...options, headers });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "הפעולה נכשלה.");
  return data;
}

function showApp() {
  const loggedIn = Boolean(state.user);
  els.loginView.classList.toggle("hidden", loggedIn);
  els.appView.classList.toggle("hidden", !loggedIn);
  if (loggedIn) {
    els.userName.textContent = `${state.user.name} (${roleText(state.user.role)})`;
    els.newBookingBtn.disabled = state.user.role === "viewer";
    els.newBookingBtn.title = state.user.role === "viewer" ? "משתמש צפייה בלבד לא יכול ליצור זימון" : "";
    showScreen("schedule");
    loadData();
  }
}

async function login(event) {
  event.preventDefault();
  els.loginStatus.textContent = "";
  try {
    const data = await api("/api/login", {
      method: "POST",
      body: JSON.stringify({ email: document.querySelector("#email").value, password: document.querySelector("#password").value })
    });
    state.user = data.user;
    localStorage.setItem("poolUser", JSON.stringify(state.user));
    showApp();
  } catch (error) {
    els.loginStatus.textContent = error.message;
  }
}

async function loadData() {
  try {
    const from = isoDate(state.weekStart);
    const to = isoDate(addDays(state.weekStart, 6));
    const [schedule, users] = await Promise.all([api(`/api/schedule?from=${from}&to=${to}`), api("/api/users")]);
    state.settings = schedule.settings;
    state.bookings = schedule.bookings;
    state.users = users.users;
    renderAll();
  } catch (error) {
    setStatus(error.message, true);
  }
}

function renderAll() {
  renderTimeOptions();
  renderTreatmentTypes();
  renderTherapists();
  renderCalendar();
  renderLists();
  renderUserAdmin();
}

function showScreen(screen) {
  const isUsers = screen === "users" && state.user?.role === "admin";
  els.scheduleScreen.classList.toggle("hidden", isUsers);
  els.userAdminScreen.classList.toggle("hidden", !isUsers);
  els.newBookingBtn.classList.toggle("hidden", isUsers);
  els.usersMobileBtn.classList.toggle("hidden", isUsers || state.user?.role !== "admin");
  els.usersNavLink.classList.toggle("active", isUsers);
  document.querySelector('.workspace-nav a[href="#calendar"]')?.classList.toggle("active", !isUsers);
}

function renderTimeOptions() {
  els.bookingStart.innerHTML = "";
  timeSlots().forEach((slot) => {
    const option = document.createElement("option");
    option.value = slot;
    option.textContent = slot;
    els.bookingStart.append(option);
  });
}

function renderTreatmentTypes() {
  const types = state.settings.treatmentTypes?.length ? state.settings.treatmentTypes : ["וואטסו", "הידרו", "קבוצות", "שחייה", "אחר"];
  els.treatmentType.innerHTML = types.map((type) => `<option value="${type}">${type}</option>`).join("");
}

function renderTherapists() {
  const therapists = state.users.filter((user) => user.role === "therapist");
  els.bookingTherapist.innerHTML = therapists.map((user) => `<option value="${user.id}">${user.name}</option>`).join("");
  els.therapistField.classList.toggle("hidden", state.user.role !== "admin");
  els.approveNowField.classList.toggle("hidden", state.user.role !== "admin");
}

function bookingsForSlot(date, start) {
  return state.bookings.filter((booking) => booking.date === date && booking.start === start && ["pending", "approved"].includes(booking.status));
}

function bookingCard(booking, compact = false) {
  const item = document.createElement("article");
  item.className = `booking-card ${booking.status} ${treatmentClass(booking.treatmentType)}`;
  const patient = booking.patientName ? escapeHtml(booking.patientName) : "ללא שם מטופל";
  const therapistName = escapeHtml(booking.therapistName);
  const treatmentType = escapeHtml(booking.treatmentType || "הידרו");
  const notes = escapeHtml(booking.notes);
  item.innerHTML = compact ? `
    <div class="booking-main">
      <strong>${therapistName}</strong>
      <small>${statusText(booking.status)}</small>
    </div>
    <span class="type-badge">${treatmentType}</span>
    <span class="booking-time">${booking.start}-${booking.end}</span>
  ` : `
    <div class="booking-main">
      <strong>${therapistName}</strong>
      <small>${statusText(booking.status)}</small>
    </div>
    <span class="type-badge">${treatmentType}</span>
    <span class="booking-time">${booking.date} · ${booking.start}-${booking.end}</span>
    <span>${patient}</span>
    ${notes ? `<p>${notes}</p>` : ""}
  `;
  const actions = document.createElement("div");
  actions.className = "card-actions";
  if (state.user.role === "admin" && booking.status === "pending") {
    actions.append(actionButton("אישור", () => approveBooking(booking.id), "primary small"));
    actions.append(actionButton("דחייה", () => rejectBooking(booking.id), "small"));
  }
  if ((state.user.role === "admin" && booking.status === "approved") || (state.user.id === booking.therapistId && booking.status === "pending")) {
    actions.append(actionButton("ביטול", () => cancelBooking(booking.id), "danger small"));
  }
  if (actions.children.length && !compact) item.append(actions);
  return item;
}

function actionButton(text, onClick, className = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = text;
  button.className = className;
  button.addEventListener("click", onClick);
  return button;
}

function renderCalendar() {
  const days = Array.from({ length: 7 }, (_, index) => addDays(state.weekStart, index));
  const dayKeys = days.map(isoDate);
  if (!dayKeys.includes(state.selectedDate)) state.selectedDate = dayKeys[0];
  els.weekTitle.textContent = `שבוע ${formatDate(days[0])} - ${formatDate(days[6])}`;
  els.calendarRange.textContent = `ימים ${formatDate(days[0])} עד ${formatDate(days[6])}. הזימון פתוח בימים א׳-ה׳ בין 07:00 ל-22:00, במרווחים של 15 דקות.`;
  const hours = timeSlots();
  els.calendar.innerHTML = "";
  els.calendar.append(renderMobileSchedule(days, hours));
  const grid = document.createElement("div");
  grid.className = "calendar-grid";
  grid.style.setProperty("--days", String(days.length));
  grid.append(headerCell("שעה", "time-head"));
  days.forEach((day) => grid.append(dayHeader(day)));
  hours.forEach((hour) => {
    grid.append(headerCell(hour, "time-cell"));
    days.forEach((day) => {
      const date = isoDate(day);
      const blockReason = blockedReasonForDay(day);
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "slot";
      cell.setAttribute("aria-label", `${formatFullDate(day)}, שעה ${hour}`);
      const bookings = bookingsForSlot(date, hour);
      if (bookings.length) {
        cell.classList.add(bookings[0].status);
        cell.append(bookingCard(bookings[0], true));
      } else if (blockReason) {
        cell.classList.add("blocked");
        cell.disabled = true;
        cell.innerHTML = `<span>חסום</span><small>${escapeHtml(blockReason)}</small>`;
      } else {
        cell.innerHTML = "<span>פנוי</span><small>לחץ לזימון</small>";
      }
      if (!blockReason) cell.addEventListener("click", () => openBookingDialog(date, hour));
      grid.append(cell);
    });
  });
  els.calendar.append(grid);
  els.pendingCount.textContent = state.bookings.filter((booking) => booking.status === "pending").length;
  els.approvedCount.textContent = state.bookings.filter((booking) => booking.status === "approved").length;
}

function renderMobileSchedule(days, hours) {
  const shell = document.createElement("div");
  shell.className = "mobile-schedule";
  const tabs = document.createElement("div");
  tabs.className = "mobile-day-tabs";
  days.forEach((day) => {
    const date = isoDate(day);
    const blockReason = blockedReasonForDay(day);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mobile-day-tab";
    if (date === state.selectedDate) button.classList.add("active");
    if (blockReason) button.classList.add("blocked");
    button.innerHTML = `<strong>${formatMobileDay(day)}</strong>${blockReason ? `<small>${escapeHtml(blockReason)}</small>` : "<small>זמין</small>"}`;
    button.addEventListener("click", () => {
      state.selectedDate = date;
      renderCalendar();
    });
    tabs.append(button);
  });
  const selectedDay = days.find((day) => isoDate(day) === state.selectedDate) || days[0];
  const selectedDate = isoDate(selectedDay);
  const blockReason = blockedReasonForDay(selectedDay);
  const list = document.createElement("div");
  list.className = "mobile-slot-list";
  const title = document.createElement("div");
  title.className = "mobile-day-title";
  title.innerHTML = `<strong>${formatFullDate(selectedDay)}</strong><span>${blockReason ? `${escapeHtml(blockReason)} חסום לזימון` : "בחר שעה פנויה לפתיחת זימון"}</span>`;
  list.append(title);
  if (blockReason) {
    const blocked = document.createElement("div");
    blocked.className = "mobile-blocked-day";
    blocked.innerHTML = `<strong>אין זימונים ביום זה</strong><span>${escapeHtml(blockReason)} מסומן כיום חסום במערכת.</span>`;
    list.append(blocked);
  } else {
    hours.forEach((hour) => {
      const bookings = bookingsForSlot(selectedDate, hour);
      const item = document.createElement("button");
      item.type = "button";
      item.className = "mobile-slot";
      if (bookings.length) {
        item.classList.add(bookings[0].status);
        item.disabled = true;
        item.append(bookingCard(bookings[0], true));
      } else {
        item.innerHTML = `<span class="mobile-slot-time">${hour}</span><strong>פנוי</strong><small>לחץ לזימון</small>`;
        item.addEventListener("click", () => openBookingDialog(selectedDate, hour));
      }
      list.append(item);
    });
  }
  shell.append(tabs, list);
  return shell;
}

function headerCell(text, className) {
  const cell = document.createElement("div");
  cell.className = className;
  cell.textContent = text;
  return cell;
}

function dayHeader(day) {
  const holiday = holidayFor(day);
  const isFriday = day.getDay() === 5;
  const isSaturday = day.getDay() === 6;
  const cell = document.createElement("div");
  cell.className = "day-head";
  if (isFriday || isSaturday) cell.classList.add("weekend");
  if (holiday) cell.classList.add("holiday");
  cell.innerHTML = `<span>${formatFullDate(day)}</span>${isFriday ? "<small>שישי</small>" : ""}${isSaturday ? "<small>שבת</small>" : ""}${holiday ? `<small>${holiday.name}</small>` : ""}`;
  return cell;
}

function renderLists() {
  renderBookingList(els.pendingList, state.bookings.filter((booking) => booking.status === "pending"), "אין בקשות שממתינות לאישור.");
  const mine = state.bookings.filter((booking) => booking.therapistId === state.user.id || state.user.role === "admin");
  renderBookingList(els.myBookings, mine, "אין זימונים לשבוע הזה.");
}

function renderBookingList(target, bookings, emptyText) {
  target.innerHTML = "";
  if (!bookings.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.innerHTML = `<strong>${emptyText}</strong><span>זימונים חדשים יופיעו כאן לאחר שליחה או אישור.</span>`;
    target.append(empty);
    return;
  }
  bookings.forEach((booking) => target.append(bookingCard(booking)));
}

function renderUserAdmin() {
  const isAdmin = state.user?.role === "admin";
  els.userAdminPanel.classList.toggle("hidden", !isAdmin);
  els.userAdminScreen.classList.toggle("admin-locked", !isAdmin);
  els.usersNavLink.classList.toggle("hidden", !isAdmin);
  els.usersMobileBtn.classList.toggle("hidden", !isAdmin || !els.userAdminScreen.classList.contains("hidden"));
  if (!isAdmin) return;
  els.usersAdminList.innerHTML = "";
  state.users.forEach((user) => {
    const row = document.createElement("article");
    row.className = "user-row";
    row.innerHTML = `
      <div class="user-row-main">
        <strong>${escapeHtml(user.name)}</strong>
        <span>${escapeHtml(user.email)}</span>
        ${user.phone ? `<small>${escapeHtml(user.phone)}</small>` : ""}
      </div>
      <label>הרשאה
        <select data-role-for="${user.id}">
          <option value="therapist" ${user.role === "therapist" ? "selected" : ""}>מטפל/ת</option>
          <option value="viewer" ${user.role === "viewer" ? "selected" : ""}>צפייה בלבד</option>
          <option value="admin" ${user.role === "admin" ? "selected" : ""}>מנהל/ת</option>
        </select>
      </label>
      <div class="user-row-actions">
        <button type="button" class="small" data-save-user="${user.id}">שמירה</button>
        <button type="button" class="danger small" data-delete-user="${user.id}">מחיקה</button>
      </div>
    `;
    els.usersAdminList.append(row);
  });
}

function openBookingDialog(date = isoDate(new Date()), start = "08:00") {
  if (state.user.role === "viewer") {
    setStatus("משתמש צפייה בלבד לא יכול ליצור זימון.", true);
    return;
  }
  const day = new Date(`${date}T12:00:00`);
  const blockReason = blockedReasonForDay(day);
  if (blockReason) {
    setStatus(`${blockReason} חסום לזימון.`, true);
    return;
  }
  if (bookingsForSlot(date, start).length) {
    setStatus("השעה הזו כבר תפוסה או ממתינה לאישור.", true);
    return;
  }
  els.bookingForm.reset();
  els.bookingDate.value = date;
  els.bookingStart.value = start;
  if (state.user.role === "admin") {
    const firstTherapist = state.users.find((user) => user.role === "therapist");
    els.bookingTherapist.value = firstTherapist?.id || "";
  }
  els.bookingDialog.showModal();
}

async function submitBooking(event) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(els.bookingForm).entries());
  payload.approveNow = els.approveNow.checked;
  try {
    await api("/api/bookings", { method: "POST", body: JSON.stringify(payload) });
    els.bookingDialog.close();
    await loadData();
    setStatus(payload.approveNow ? "הזימון נשמר ואושר." : "בקשת הזימון נשלחה לאישור מנהל.");
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function approveBooking(id) {
  await api(`/api/bookings/${id}/approve`, { method: "POST" });
  await loadData();
  setStatus("הזימון אושר.");
}

async function rejectBooking(id) {
  await api(`/api/bookings/${id}/reject`, { method: "POST" });
  await loadData();
  setStatus("הבקשה נדחתה.");
}

async function cancelBooking(id) {
  await api(`/api/bookings/${id}/cancel`, { method: "POST" });
  await loadData();
  setStatus("הזימון בוטל.");
}

async function submitUser(event) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(els.userForm).entries());
  try {
    await api("/api/users", { method: "POST", body: JSON.stringify(payload) });
    els.userForm.reset();
    await loadData();
    setStatus("המשתמש הוקם בהצלחה.");
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function saveUserRole(id) {
  const user = state.users.find((candidate) => candidate.id === id);
  const role = document.querySelector(`[data-role-for="${CSS.escape(id)}"]`)?.value;
  if (!user || !role) return;
  try {
    await api(`/api/users/${id}`, {
      method: "PUT",
      body: JSON.stringify({ name: user.name, email: user.email, phone: user.phone, role })
    });
    await loadData();
    setStatus("רמת ההרשאה עודכנה.");
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function deleteUser(id) {
  const user = state.users.find((candidate) => candidate.id === id);
  if (!user || !confirm(`למחוק את ${user.name}?`)) return;
  try {
    await api(`/api/users/${id}`, { method: "DELETE" });
    await loadData();
    setStatus("המשתמש נמחק.");
  } catch (error) {
    setStatus(error.message, true);
  }
}

function handleUsersListClick(event) {
  const saveButton = event.target.closest("[data-save-user]");
  const deleteButton = event.target.closest("[data-delete-user]");
  if (saveButton) saveUserRole(saveButton.dataset.saveUser);
  if (deleteButton) deleteUser(deleteButton.dataset.deleteUser);
}

document.querySelector("#prevWeekBtn").addEventListener("click", () => {
  state.weekStart = addDays(state.weekStart, -7);
  state.selectedDate = isoDate(state.weekStart);
  loadData();
});
document.querySelector("#nextWeekBtn").addEventListener("click", () => {
  state.weekStart = addDays(state.weekStart, 7);
  state.selectedDate = isoDate(state.weekStart);
  loadData();
});
document.querySelector("#todayBtn").addEventListener("click", () => {
  const today = new Date();
  state.weekStart = startOfWeek(today);
  state.selectedDate = isoDate(today);
  loadData();
});
els.newBookingBtn.addEventListener("click", () => openBookingDialog());
els.usersNavLink.addEventListener("click", (event) => {
  event.preventDefault();
  showScreen("users");
});
els.usersMobileBtn.addEventListener("click", () => showScreen("users"));
els.backToScheduleBtn.addEventListener("click", () => showScreen("schedule"));
document.querySelector("#logoutBtn").addEventListener("click", () => { localStorage.removeItem("poolUser"); state.user = null; showApp(); });
document.querySelector("#closeDialogBtn").addEventListener("click", () => els.bookingDialog.close());
els.loginForm.addEventListener("submit", login);
els.bookingForm.addEventListener("submit", submitBooking);
els.userForm.addEventListener("submit", submitUser);
els.usersAdminList.addEventListener("click", handleUsersListClick);
showApp();
