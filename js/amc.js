// ============================================================
// AMC — Annual Maintenance Contracts. Each contract has a cycle
// (3 Months / 6 Months / Annual) and shows under that cycle's own
// sub-tab. Rather than only watching the contract's final End Date,
// each cycle period gets its own recurring due date — e.g. a 3-month
// cycle running Jan 1 – Dec 31 gets due dates on Mar 31, Jun 30,
// Sep 30 and Dec 31. Whichever due date is next is flagged red once
// it's within ALERT_LEAD_DAYS, and surfaced as a banner on login.
// ============================================================

const AMC_CYCLE_LABELS = { "3m": "3 Months", "6m": "6 Months", "annual": "Annual" };
const AMC_CYCLE_MONTHS = { "3m": 3, "6m": 6, "annual": 12 };
const AMC_ALERT_LEAD_DAYS = 10; // how many days before a cycle due date the red "due soon" flag starts

let amcCache = [];
let editingAmcId = null;
let currentAmcCycleTab = "3m";

// ---------------- Cycle schedule ----------------

/** Adds `months` to a "YYYY-MM-DD" string, clamping the day into the target month
 *  (e.g. Jan 31 + 1 month -> Feb 28/29, not a rollover into March). Returns a Date. */
function addMonthsClamped(dateStr, months) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const idx = (m - 1) + months;
  const targetYear = y + Math.floor(idx / 12);
  const targetMonth = ((idx % 12) + 12) % 12;
  const daysInTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
  return new Date(targetYear, targetMonth, Math.min(d, daysInTargetMonth));
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function toISODate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Every recurring due date for a contract: the end of each cycle period (e.g. every
 *  3 months from the start date), stopping at and always including the contract's End
 *  Date as the final due point. */
function computeAmcCycleDates(startDate, endDate, cycleKey) {
  const months = AMC_CYCLE_MONTHS[cycleKey] || 3;
  const endD = new Date(endDate + "T00:00:00");
  const dates = [];
  let k = 1;
  while (k <= 40) { // safety cap — well beyond any realistic contract length
    const periodEnd = addDays(addMonthsClamped(startDate, k * months), -1);
    if (periodEnd >= endD) break;
    dates.push(toISODate(periodEnd));
    k++;
  }
  dates.push(endDate); // contract End Date always counts as the final cycle/renewal point
  return dates;
}

function fmtShortDate(iso) {
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d)) return "—";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

// ---------------- Status calculation ----------------

/** Finds whichever cycle due date is next (or today), and flags it red once it's
 *  within ALERT_LEAD_DAYS. If every due date — including the contract End Date —
 *  has already passed, the contract is overdue. */
function computeAmcStatus(entry) {
  const today = new Date(todayISO() + "T00:00:00");
  const dates = computeAmcCycleDates(entry.startDate, entry.endDate, entry.cycle);
  for (const ds of dates) {
    const d = new Date(ds + "T00:00:00");
    const daysLeft = Math.round((d - today) / 86400000);
    if (daysLeft >= 0) {
      return { status: daysLeft <= AMC_ALERT_LEAD_DAYS ? "due" : "ok", daysLeft, dueDate: ds };
    }
  }
  const lastDate = dates[dates.length - 1];
  const daysLeft = Math.round((new Date(lastDate + "T00:00:00") - today) / 86400000);
  return { status: "overdue", daysLeft, dueDate: lastDate };
}

function amcStatusLabel(s) {
  if (s.status === "overdue") return `Overdue by ${Math.abs(s.daysLeft)}d (${fmtShortDate(s.dueDate)})`;
  if (s.status === "due") return (s.daysLeft === 0 ? "Due today" : `Due in ${s.daysLeft}d`) + ` (${fmtShortDate(s.dueDate)})`;
  return "Active";
}

// ---------------- Load ----------------

async function loadAmcCache() {
  const snap = await db.collection("amcContracts").orderBy("endDate", "asc").get();
  amcCache = snap.docs.map(doc => Object.assign({ id: doc.id }, doc.data()));
  return amcCache;
}

async function loadAmcEntries() {
  const body = document.getElementById("amcBody");
  const empty = document.getElementById("amcEmpty");
  try {
    await loadAmcCache();
  } catch (err) {
    console.error(err);
    body.innerHTML = "";
    empty.style.display = "block";
    empty.querySelector("div").textContent = friendlyFirestoreError(err, "load AMC contracts");
    return;
  }
  empty.querySelector("div").textContent = "No AMC contracts in this cycle yet.";
  renderAmcSubtabCounts();
  applyAmcFiltersAndRender();
}

/** Loads AMC contracts in the background (called once at boot, like the client cache
 *  warm-up) purely to power the login notification banner — doesn't touch the AMC
 *  screen's own table, which loads fresh whenever that tab is opened. */
async function checkAmcNotificationsOnBoot() {
  try {
    await loadAmcCache();
  } catch (err) {
    console.error(err);
    return; // stay quiet — the AMC tab itself will surface the error when opened
  }
  const flagged = amcCache.filter(e => {
    const s = computeAmcStatus(e);
    return s.status === "due" || s.status === "overdue";
  });
  updateAmcNavBadge(flagged.length);
  if (!flagged.length) return;

  const overdueCount = flagged.filter(e => computeAmcStatus(e).status === "overdue").length;
  const names = flagged.slice(0, 3).map(e => e.clientName).join(", ");
  const more = flagged.length > 3 ? ` and ${flagged.length - 3} more` : "";
  const text = `${flagged.length} AMC contract${flagged.length > 1 ? "s" : ""} need${flagged.length > 1 ? "" : "s"} attention` +
    (overdueCount ? ` (${overdueCount} overdue)` : "") + `: ${names}${more}.`;

  document.getElementById("amcNotifyText").textContent = text;
  document.getElementById("amcNotifyBanner").style.display = "flex";
}

function updateAmcNavBadge(count) {
  const badge = document.getElementById("amcNavBadge");
  if (count > 0) {
    badge.textContent = count;
    badge.style.display = "inline-flex";
  } else {
    badge.style.display = "none";
  }
}

// ---------------- Sub-tabs + table ----------------

function renderAmcSubtabCounts() {
  ["3m", "6m", "annual"].forEach(cycle => {
    const count = amcCache.filter(e => e.cycle === cycle && ["due", "overdue"].includes(computeAmcStatus(e).status)).length;
    const badgeId = cycle === "annual" ? "amcCountAnnual" : `amcCount${cycle}`;
    const badge = document.getElementById(badgeId);
    if (count > 0) {
      badge.textContent = count;
      badge.style.display = "inline-flex";
    } else {
      badge.style.display = "none";
    }
  });
}

function switchAmcSubtab(cycle) {
  currentAmcCycleTab = cycle;
  document.querySelectorAll(".amc-subtab").forEach(btn => {
    btn.classList.toggle("active", btn.getAttribute("data-cycle") === cycle);
  });
  applyAmcFiltersAndRender();
}

function getFilteredAmcList() {
  const q = document.getElementById("amcSearch").value.trim().toLowerCase();
  return amcCache
    .filter(e => e.cycle === currentAmcCycleTab)
    .filter(e => !q || (e.clientName || "").toLowerCase().includes(q));
}

function applyAmcFiltersAndRender() {
  renderAmcTable(getFilteredAmcList());
}

function renderAmcTable(list) {
  const body = document.getElementById("amcBody");
  const empty = document.getElementById("amcEmpty");
  body.innerHTML = "";
  if (!list.length) {
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";
  list.forEach(e => {
    const s = computeAmcStatus(e);
    const tr = document.createElement("tr");
    if (s.status === "due" || s.status === "overdue") tr.classList.add("amc-row-alert");
    tr.innerHTML = `
      <td><strong>${escapeHtml(e.clientName)}</strong></td>
      <td>${fmtDate(e.startDate)}</td>
      <td>${fmtDate(e.endDate)}</td>
      <td>${fmtDate(s.dueDate)}</td>
      <td><span class="pill status-${s.status}">${amcStatusLabel(s)}</span></td>
      <td>
        <div class="row-actions">
          <button class="icon-btn" data-action="finance" title="Finance">₹</button>
          <button class="icon-btn" data-action="edit" title="Edit">✎</button>
          <button class="icon-btn" data-action="delete" title="Delete">🗑</button>
        </div>
      </td>
    `;
    tr.querySelectorAll("[data-action]").forEach(btn => {
      btn.addEventListener("click", () => handleAmcAction(btn.getAttribute("data-action"), e));
    });
    body.appendChild(tr);
  });
}

function handleAmcAction(action, entry) {
  if (action === "finance") {
    openAmcFinance(entry);
    return;
  }
  if (action === "edit") {
    loadAmcIntoForm(entry);
    return;
  }
  if (action === "delete") {
    if (!confirm(`Delete the AMC contract for "${entry.clientName}"? This can't be undone.`)) return;
    db.collection("amcContracts").doc(entry.id).delete().then(() => {
      showToast("Contract deleted.", "success");
      loadAmcEntries();
    }).catch(err => {
      console.error(err);
      showToast(friendlyFirestoreError(err, "delete"), "error");
    });
  }
}

function loadAmcIntoForm(entry) {
  editingAmcId = entry.id;
  document.getElementById("amc_clientName").value = entry.clientName || "";
  document.getElementById("amc_cycle").value = entry.cycle || "3m";
  document.getElementById("amc_startDate").value = entry.startDate || "";
  document.getElementById("amc_endDate").value = entry.endDate || "";
  document.getElementById("amcFormTitle").textContent = `Editing ${entry.clientName}`;
  document.getElementById("saveAmcBtn").textContent = "Update Contract";
  document.getElementById("cancelAmcEditBtn").style.display = "inline-flex";
  document.getElementById("amcFormTitle").scrollIntoView({ behavior: "smooth", block: "center" });
}

function resetAmcForm() {
  editingAmcId = null;
  document.getElementById("amc_clientName").value = "";
  document.getElementById("amc_cycle").value = "3m";
  document.getElementById("amc_startDate").value = "";
  document.getElementById("amc_endDate").value = "";
  document.getElementById("amcFormTitle").textContent = "Add an AMC contract";
  document.getElementById("saveAmcBtn").textContent = "Save Contract";
  document.getElementById("cancelAmcEditBtn").style.display = "none";
}

async function saveAmcContract() {
  const clientName = document.getElementById("amc_clientName").value.trim();
  const cycle = document.getElementById("amc_cycle").value;
  const startDate = document.getElementById("amc_startDate").value;
  const endDate = document.getElementById("amc_endDate").value;

  if (!clientName) { showToast("Client name is required.", "error"); return; }
  if (!startDate || !endDate) { showToast("Both start and end dates are required.", "error"); return; }
  if (endDate < startDate) { showToast("End date can't be before the start date.", "error"); return; }

  const data = { clientName, cycle, startDate, endDate };
  const wasEditing = !!editingAmcId;
  const btn = document.getElementById("saveAmcBtn");
  const original = btn.textContent;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';

  try {
    const user = auth.currentUser;
    if (wasEditing) {
      await db.collection("amcContracts").doc(editingAmcId).set(Object.assign({}, data, {
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedBy: user ? user.email : null
      }), { merge: true });
      showToast("Contract updated.", "success");
    } else {
      await db.collection("amcContracts").add(Object.assign({}, data, {
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        createdBy: user ? user.email : null
      }));
      showToast("AMC contract saved.", "success");
    }
    const savedCycle = cycle;
    resetAmcForm();
    switchAmcSubtab(savedCycle); // jump to the sub-tab it now lives under
    await loadAmcEntries();
  } catch (err) {
    console.error(err);
    showToast(friendlyFirestoreError(err, "save"), "error");
    btn.textContent = original;
  } finally {
    btn.disabled = false;
  }
}

// ---------------- Wiring ----------------

function wireAmcSubtabs() {
  document.querySelectorAll(".amc-subtab").forEach(btn => {
    btn.addEventListener("click", () => switchAmcSubtab(btn.getAttribute("data-cycle")));
  });
}

function wireAmcSearch() {
  document.getElementById("amcSearch").addEventListener("input", applyAmcFiltersAndRender);
}

function populateAmcClientDatalist() {
  const list = document.getElementById("amcClientDatalist");
  list.innerHTML = (clientsCache || []).map(c => `<option value="${escapeHtml(c.name)}"></option>`).join("");
}

function wireAmcNotifyBanner() {
  document.getElementById("amcNotifyCloseBtn").addEventListener("click", () => {
    document.getElementById("amcNotifyBanner").style.display = "none";
  });
  document.getElementById("amcNotifyViewBtn").addEventListener("click", () => {
    document.getElementById("amcNotifyBanner").style.display = "none";
    switchView("amcView");
  });
}
