// ============================================================
// Employee Management — permanent & temporary workforce.
// Each employee gets:
//   - Attendance: one entry per date (Present/Absent/Half Day/Leave)
//   - Expense/Advance: a date-wise ledger (Advance, Tea Expense,
//     Petrol Charges, or any custom category) with running totals
// ============================================================

let employeesCache = [];
let editingEmployeeId = null;
let employeeFormType = "permanent";   // type selected on the Add Employee form
let employeeListFilterType = "permanent"; // which list tab is showing below

let currentEmployeeId = null;
let currentEmployeeName = "";

let employeeAttendanceCache = [];
let employeeExpenseCache = [];

// ---------------- Add-employee form: Permanent / Temporary tabs ----------------

function setEmployeeFormType(type) {
  employeeFormType = type;
  document.getElementById("empTypePermanentBtn").classList.toggle("active", type === "permanent");
  document.getElementById("empTypeTemporaryBtn").classList.toggle("active", type === "temporary");
}

function wireEmployeeFormTypeTabs() {
  document.getElementById("empTypePermanentBtn").addEventListener("click", () => setEmployeeFormType("permanent"));
  document.getElementById("empTypeTemporaryBtn").addEventListener("click", () => setEmployeeFormType("temporary"));
}

// ---------------- Role suggestions (shared style with the ID Card role field) ----------------

const EMPLOYEE_BASE_ROLES = ["Site Engineer", "Fitter", "Welder", "Helper", "Contract Labour"];

function populateEmployeeRoleDatalist() {
  const used = (employeesCache || []).map(e => (e.role || "").trim()).filter(Boolean);
  const roles = Array.from(new Set([...EMPLOYEE_BASE_ROLES, ...used]));
  document.getElementById("employeeRoleDatalist").innerHTML =
    roles.map(r => `<option value="${escapeHtml(r)}"></option>`).join("");
}

// ---------------- Form <-> record ----------------

function resetEmployeeForm() {
  editingEmployeeId = null;
  setEmployeeFormType("permanent");
  document.getElementById("emp_name").value = "";
  document.getElementById("emp_role").value = "";
  document.getElementById("emp_contact").value = "";
  document.getElementById("emp_joinDate").value = "";
  document.getElementById("employeeFormTitle").textContent = "Add an employee";
  document.getElementById("saveEmployeeBtn").textContent = "Save Employee";
  document.getElementById("cancelEmployeeEditBtn").style.display = "none";
}

function loadEmployeeIntoForm(record) {
  editingEmployeeId = record.id;
  setEmployeeFormType(record.empType || "permanent");
  document.getElementById("emp_name").value = record.name || "";
  document.getElementById("emp_role").value = record.role || "";
  document.getElementById("emp_contact").value = record.contact || "";
  document.getElementById("emp_joinDate").value = record.joinDate || "";
  document.getElementById("employeeFormTitle").textContent = `Editing ${record.name}`;
  document.getElementById("saveEmployeeBtn").textContent = "Update Employee";
  document.getElementById("cancelEmployeeEditBtn").style.display = "inline-flex";
  document.getElementById("employeeFormTitle").scrollIntoView({ behavior: "smooth", block: "center" });
}

async function saveEmployee() {
  const name = document.getElementById("emp_name").value.trim();
  const role = document.getElementById("emp_role").value.trim();
  const contact = document.getElementById("emp_contact").value.trim();
  const joinDate = document.getElementById("emp_joinDate").value;

  if (!name) { showToast("Employee name is required.", "error"); return; }

  const data = { name, empType: employeeFormType, role, contact, joinDate };
  const wasEditing = !!editingEmployeeId;
  const btn = document.getElementById("saveEmployeeBtn");
  const original = btn.textContent;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';

  try {
    const user = auth.currentUser;
    if (wasEditing) {
      await db.collection("employees").doc(editingEmployeeId).set(Object.assign({}, data, {
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedBy: user ? user.email : null
      }), { merge: true });
      showToast("Employee updated.", "success");
    } else {
      await db.collection("employees").add(Object.assign({}, data, {
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        createdBy: user ? user.email : null
      }));
      showToast("Employee added.", "success");
    }
    resetEmployeeForm();
    await loadEmployeesList();
  } catch (err) {
    console.error(err);
    showToast(friendlyFirestoreError(err, "save"), "error");
    btn.textContent = original;
  } finally {
    btn.disabled = false;
  }
}

// ---------------- List ----------------

async function loadEmployeesCache() {
  const snap = await db.collection("employees").orderBy("name", "asc").get();
  employeesCache = snap.docs.map(doc => Object.assign({ id: doc.id }, doc.data()));
  return employeesCache;
}

async function loadEmployeesList() {
  const body = document.getElementById("employeesBody");
  const empty = document.getElementById("employeesEmpty");
  try {
    await loadEmployeesCache();
  } catch (err) {
    console.error(err);
    body.innerHTML = "";
    empty.style.display = "block";
    empty.querySelector("div").textContent = friendlyFirestoreError(err, "load employees");
    return;
  }
  empty.querySelector("div").textContent = "No employees added yet. Add your first one above.";
  populateEmployeeRoleDatalist();
  updateEmployeeListCounts();
  const search = document.getElementById("employeeSearch");
  renderEmployeesTable(filterEmployees(search ? search.value.trim().toLowerCase() : ""));
}

function updateEmployeeListCounts() {
  const permCount = employeesCache.filter(e => e.empType === "permanent").length;
  const tempCount = employeesCache.filter(e => e.empType === "temporary").length;
  const permBadge = document.getElementById("empCountPermanent");
  const tempBadge = document.getElementById("empCountTemporary");
  permBadge.textContent = permCount;
  permBadge.style.display = permCount ? "inline-flex" : "none";
  tempBadge.textContent = tempCount;
  tempBadge.style.display = tempCount ? "inline-flex" : "none";
}

function filterEmployees(q) {
  let list = employeesCache.filter(e => (e.empType || "permanent") === employeeListFilterType);
  if (q) {
    list = list.filter(e => (e.name || "").toLowerCase().includes(q) || (e.role || "").toLowerCase().includes(q));
  }
  return list;
}

function renderEmployeesTable(list) {
  const body = document.getElementById("employeesBody");
  const empty = document.getElementById("employeesEmpty");
  body.innerHTML = "";
  if (!list.length) {
    empty.style.display = "block";
    empty.querySelector("div").textContent = employeesCache.length
      ? `No ${employeeListFilterType} employees yet.`
      : "No employees added yet. Add your first one above.";
    return;
  }
  empty.style.display = "none";
  list.forEach(e => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${escapeHtml(e.name)}</strong></td>
      <td>${escapeHtml(e.role || "—")}</td>
      <td>${escapeHtml(e.contact || "—")}</td>
      <td>${e.joinDate ? fmtDate(e.joinDate) : "—"}</td>
      <td>
        <div class="row-actions">
          <button class="icon-btn" data-action="attendance" title="Attendance">📅</button>
          <button class="icon-btn" data-action="expense" title="Expense / Advance">₹</button>
          <button class="icon-btn" data-action="edit" title="Edit">✎</button>
          <button class="icon-btn" data-action="delete" title="Delete">🗑</button>
        </div>
      </td>
    `;
    tr.querySelectorAll("[data-action]").forEach(btn => {
      btn.addEventListener("click", () => handleEmployeeAction(btn.getAttribute("data-action"), e));
    });
    body.appendChild(tr);
  });
}

function handleEmployeeAction(action, record) {
  if (action === "attendance") { openEmployeeAttendance(record); return; }
  if (action === "expense") { openEmployeeExpense(record); return; }
  if (action === "edit") { loadEmployeeIntoForm(record); return; }
  if (action === "delete") {
    if (!confirm(`Delete "${record.name}"? Their attendance and expense records will stay on file but won't be reachable from the list anymore. This can't be undone.`)) return;
    db.collection("employees").doc(record.id).delete().then(() => {
      showToast("Employee deleted.", "success");
      loadEmployeesList();
    }).catch(err => {
      console.error(err);
      showToast(friendlyFirestoreError(err, "delete"), "error");
    });
  }
}

function wireEmployeeListSubtabs() {
  document.querySelectorAll(".amc-subtab[data-emplist]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".amc-subtab[data-emplist]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      employeeListFilterType = btn.getAttribute("data-emplist");
      const search = document.getElementById("employeeSearch");
      renderEmployeesTable(filterEmployees(search ? search.value.trim().toLowerCase() : ""));
    });
  });
}

function wireEmployeeSearch() {
  const input = document.getElementById("employeeSearch");
  input.addEventListener("input", () => renderEmployeesTable(filterEmployees(input.value.trim().toLowerCase())));
}

// ============================================================
// Attendance — one entry per date per employee
// ============================================================

async function openEmployeeAttendance(record) {
  currentEmployeeId = record.id;
  currentEmployeeName = record.name || "";
  document.getElementById("employeeAttendanceModalTitle").textContent = `Attendance — ${currentEmployeeName}`;
  document.getElementById("empAtt_date").value = todayISO();
  document.getElementById("empAtt_status").value = "present";
  document.getElementById("empAtt_note").value = "";
  document.getElementById("employeeAttendanceModal").classList.add("open");
  await loadEmployeeAttendanceEntries();
}

async function loadEmployeeAttendanceEntries() {
  const body = document.getElementById("employeeAttendanceBody");
  const empty = document.getElementById("employeeAttendanceEmpty");
  try {
    const snap = await db.collection("employeeAttendance").where("employeeId", "==", currentEmployeeId).get();
    employeeAttendanceCache = snap.docs.map(doc => Object.assign({ id: doc.id }, doc.data()));
    employeeAttendanceCache.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  } catch (err) {
    console.error(err);
    body.innerHTML = "";
    empty.style.display = "block";
    empty.querySelector("div").textContent = friendlyFirestoreError(err, "load attendance");
    renderEmployeeAttendanceSummary([]);
    return;
  }
  empty.querySelector("div").textContent = "No attendance marked yet.";
  renderEmployeeAttendanceTable(employeeAttendanceCache);
  renderEmployeeAttendanceSummary(employeeAttendanceCache);
}

function renderEmployeeAttendanceSummary(list) {
  const present = list.filter(a => a.status === "present").length;
  const absent = list.filter(a => a.status === "absent").length;
  const other = list.filter(a => a.status === "half-day" || a.status === "leave").length;
  document.getElementById("empAttSummaryPresent").textContent = present;
  document.getElementById("empAttSummaryAbsent").textContent = absent;
  document.getElementById("empAttSummaryOther").textContent = other;
}

const ATTENDANCE_STATUS_LABELS = { present: "Present", absent: "Absent", "half-day": "Half Day", leave: "Leave" };
const ATTENDANCE_STATUS_STYLE = {
  present: "background:#eaf7ee;color:#1c7c3f;",
  absent: "background:#fdecea;color:#b3261e;",
  "half-day": "background:#fff4e0;color:#9a6300;",
  leave: "background:#eef0ff;color:#3d4bb3;"
};

function renderEmployeeAttendanceTable(list) {
  const body = document.getElementById("employeeAttendanceBody");
  const empty = document.getElementById("employeeAttendanceEmpty");
  body.innerHTML = "";
  if (!list.length) {
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";
  list.forEach(a => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${fmtDate(a.date)}</td>
      <td><span class="pill" style="${ATTENDANCE_STATUS_STYLE[a.status] || ""}">${ATTENDANCE_STATUS_LABELS[a.status] || a.status}</span></td>
      <td>${escapeHtml(a.note || "—")}</td>
      <td>
        <div class="row-actions">
          <button class="icon-btn" data-delete="${a.id}" title="Delete">🗑</button>
        </div>
      </td>
    `;
    body.appendChild(tr);
  });
  body.querySelectorAll("[data-delete]").forEach(btn => {
    btn.addEventListener("click", () => deleteEmployeeAttendanceEntry(btn.getAttribute("data-delete")));
  });
}

async function saveEmployeeAttendanceEntry() {
  const date = document.getElementById("empAtt_date").value;
  const status = document.getElementById("empAtt_status").value;
  const note = document.getElementById("empAtt_note").value.trim();

  if (!date) { showToast("Pick a date.", "error"); return; }

  // One entry per date: if this employee already has an entry for this date, update it instead of duplicating.
  const existing = employeeAttendanceCache.find(a => a.date === date);
  const data = { employeeId: currentEmployeeId, employeeName: currentEmployeeName, date, status, note };

  const btn = document.getElementById("saveEmployeeAttendanceBtn");
  const original = btn.textContent;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';

  try {
    const user = auth.currentUser;
    if (existing) {
      await db.collection("employeeAttendance").doc(existing.id).set(Object.assign({}, data, {
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedBy: user ? user.email : null
      }), { merge: true });
      showToast("Attendance updated for that date.", "success");
    } else {
      await db.collection("employeeAttendance").add(Object.assign({}, data, {
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        createdBy: user ? user.email : null
      }));
      showToast("Attendance marked.", "success");
    }
    document.getElementById("empAtt_note").value = "";
    await loadEmployeeAttendanceEntries();
  } catch (err) {
    console.error(err);
    showToast(friendlyFirestoreError(err, "save"), "error");
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

async function deleteEmployeeAttendanceEntry(id) {
  if (!confirm("Delete this attendance entry? This can't be undone.")) return;
  try {
    await db.collection("employeeAttendance").doc(id).delete();
    showToast("Entry deleted.", "success");
    await loadEmployeeAttendanceEntries();
  } catch (err) {
    console.error(err);
    showToast(friendlyFirestoreError(err, "delete"), "error");
  }
}

// ---------------- Attendance: Excel export ----------------

function downloadEmployeeAttendanceExcel() {
  if (typeof XLSX === "undefined") {
    showToast("The Excel library didn't load — check your internet connection and reload the page.", "error");
    return;
  }
  if (!employeeAttendanceCache.length) {
    showToast("No attendance entries to export yet.", "error");
    return;
  }
  const rows = [["Employee", currentEmployeeName], ["Date", "Status", "Note"]];
  // sort oldest -> newest for a readable report, independent of the on-screen (newest-first) order
  const sorted = [...employeeAttendanceCache].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  sorted.forEach(a => {
    rows.push([a.date || "", ATTENDANCE_STATUS_LABELS[a.status] || a.status || "", a.note || ""]);
  });
  rows.push([]);
  rows.push(["Present", sorted.filter(a => a.status === "present").length]);
  rows.push(["Absent", sorted.filter(a => a.status === "absent").length]);
  rows.push(["Half Day / Leave", sorted.filter(a => a.status === "half-day" || a.status === "leave").length]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 14 }, { wch: 16 }, { wch: 34 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Attendance");
  const safeName = (currentEmployeeName || "employee").replace(/\s+/g, "_");
  XLSX.writeFile(wb, `Attendance-${safeName}-${todayISO()}.xlsx`);
  showToast("Excel file downloaded.", "success");
}

// ============================================================
// Expense / Advance — date-wise ledger, any number of entries per date
// ============================================================

function populateEmployeeExpenseCategoryDatalist() {
  const base = ["Advance", "Tea Expense", "Petrol Charges", "Food", "Other"];
  const used = (employeeExpenseCache || []).map(x => (x.category || "").trim()).filter(Boolean);
  const categories = Array.from(new Set([...base, ...used]));
  document.getElementById("employeeExpenseCategoryDatalist").innerHTML =
    categories.map(c => `<option value="${escapeHtml(c)}"></option>`).join("");
}

async function openEmployeeExpense(record) {
  currentEmployeeId = record.id;
  currentEmployeeName = record.name || "";
  document.getElementById("employeeExpenseModalTitle").textContent = `Expense / Advance — ${currentEmployeeName}`;
  document.getElementById("empExp_date").value = todayISO();
  document.getElementById("empExp_category").value = "";
  document.getElementById("empExp_description").value = "";
  document.getElementById("empExp_amount").value = "";
  document.getElementById("employeeExpenseModal").classList.add("open");
  await loadEmployeeExpenseEntries();
}

async function loadEmployeeExpenseEntries() {
  const body = document.getElementById("employeeExpenseBody");
  const empty = document.getElementById("employeeExpenseEmpty");
  try {
    const snap = await db.collection("employeeExpenses").where("employeeId", "==", currentEmployeeId).get();
    employeeExpenseCache = snap.docs.map(doc => Object.assign({ id: doc.id }, doc.data()));
    employeeExpenseCache.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  } catch (err) {
    console.error(err);
    body.innerHTML = "";
    empty.style.display = "block";
    empty.querySelector("div").textContent = friendlyFirestoreError(err, "load expenses");
    renderEmployeeExpenseSummary([]);
    return;
  }
  empty.querySelector("div").textContent = "No expenses recorded yet.";
  populateEmployeeExpenseCategoryDatalist();
  renderEmployeeExpenseTable(employeeExpenseCache);
  renderEmployeeExpenseSummary(employeeExpenseCache);
}

function renderEmployeeExpenseSummary(list) {
  let advance = 0, other = 0;
  list.forEach(x => {
    const amt = Number(x.amount) || 0;
    if ((x.category || "").trim().toLowerCase() === "advance") advance += amt; else other += amt;
  });
  document.getElementById("empExpSummaryAdvance").textContent = fmtMoney(advance);
  document.getElementById("empExpSummaryOther").textContent = fmtMoney(other);
  document.getElementById("empExpSummaryTotal").textContent = fmtMoney(advance + other);
}

function renderEmployeeExpenseTable(list) {
  const body = document.getElementById("employeeExpenseBody");
  const empty = document.getElementById("employeeExpenseEmpty");
  body.innerHTML = "";
  if (!list.length) {
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";
  list.forEach(x => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${fmtDate(x.date)}</td>
      <td><span class="pill">${escapeHtml(x.category || "—")}</span></td>
      <td>${escapeHtml(x.description || "—")}</td>
      <td class="amt-expense">${fmtMoney(x.amount)}</td>
      <td>
        <div class="row-actions">
          <button class="icon-btn" data-delete="${x.id}" title="Delete">🗑</button>
        </div>
      </td>
    `;
    body.appendChild(tr);
  });
  body.querySelectorAll("[data-delete]").forEach(btn => {
    btn.addEventListener("click", () => deleteEmployeeExpenseEntry(btn.getAttribute("data-delete")));
  });
}

async function saveEmployeeExpenseEntry() {
  const date = document.getElementById("empExp_date").value;
  const category = document.getElementById("empExp_category").value.trim();
  const description = document.getElementById("empExp_description").value.trim();
  const amount = Number(document.getElementById("empExp_amount").value) || 0;

  if (!date) { showToast("Pick a date.", "error"); return; }
  if (!category) { showToast("Pick or type a category.", "error"); return; }
  if (amount <= 0) { showToast("Enter an amount greater than 0.", "error"); return; }

  const data = { employeeId: currentEmployeeId, employeeName: currentEmployeeName, date, category, description, amount };

  const btn = document.getElementById("saveEmployeeExpenseBtn");
  const original = btn.textContent;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';

  try {
    const user = auth.currentUser;
    await db.collection("employeeExpenses").add(Object.assign({}, data, {
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdBy: user ? user.email : null
    }));
    showToast("Entry saved.", "success");
    document.getElementById("empExp_category").value = "";
    document.getElementById("empExp_description").value = "";
    document.getElementById("empExp_amount").value = "";
    await loadEmployeeExpenseEntries();
  } catch (err) {
    console.error(err);
    showToast(friendlyFirestoreError(err, "save"), "error");
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

async function deleteEmployeeExpenseEntry(id) {
  if (!confirm("Delete this entry? This can't be undone.")) return;
  try {
    await db.collection("employeeExpenses").doc(id).delete();
    showToast("Entry deleted.", "success");
    await loadEmployeeExpenseEntries();
  } catch (err) {
    console.error(err);
    showToast(friendlyFirestoreError(err, "delete"), "error");
  }
}

// ---------------- Expense / Advance: Excel export ----------------

function downloadEmployeeExpenseExcel() {
  if (typeof XLSX === "undefined") {
    showToast("The Excel library didn't load — check your internet connection and reload the page.", "error");
    return;
  }
  if (!employeeExpenseCache.length) {
    showToast("No expense entries to export yet.", "error");
    return;
  }
  const rows = [["Employee", currentEmployeeName], ["Date", "Category", "Description", "Amount (₹)"]];
  const sorted = [...employeeExpenseCache].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  let advance = 0, other = 0;
  sorted.forEach(x => {
    const amt = Number(x.amount) || 0;
    if ((x.category || "").trim().toLowerCase() === "advance") advance += amt; else other += amt;
    rows.push([x.date || "", x.category || "", x.description || "", amt]);
  });
  rows.push([]);
  rows.push(["", "", "Advance Given", advance]);
  rows.push(["", "", "Other Expenses", other]);
  rows.push(["", "", "Total", advance + other]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 14 }, { wch: 18 }, { wch: 30 }, { wch: 14 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Expense-Advance");
  const safeName = (currentEmployeeName || "employee").replace(/\s+/g, "_");
  XLSX.writeFile(wb, `Expense-${safeName}-${todayISO()}.xlsx`);
  showToast("Excel file downloaded.", "success");
}
