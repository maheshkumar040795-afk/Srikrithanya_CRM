// ============================================================
// AMC Finance — a small per-contract ledger opened from the ₹
// icon on an AMC row. Log the AMC amount received (date + amount)
// and expenses against that AMC (date + description + amount),
// and see a running Balance = Amount Received − Expenses.
// Entries are stored in Firestore under "amcFinanceEntries",
// linked to the AMC contract's own doc id (amcId).
// ============================================================

let currentAmcFinanceId = null;
let currentAmcFinanceClientName = "";
let amcFinanceCache = [];
let amcFinanceEntryType = "amount"; // "amount" (AMC amount received) or "expense"

// ---------------- Open / close ----------------

async function openAmcFinance(entry) {
  currentAmcFinanceId = entry.id;
  currentAmcFinanceClientName = entry.clientName || "";
  document.getElementById("amcFinanceModalTitle").textContent = `Finance — ${currentAmcFinanceClientName}`;
  resetAmcFinanceForm();
  document.getElementById("amcFinanceModal").classList.add("open");
  await loadAmcFinanceEntries();
}

function resetAmcFinanceForm() {
  document.getElementById("amcFin_date").value = todayISO();
  document.getElementById("amcFin_amount").value = "";
  document.getElementById("amcFin_description").value = "";
  setAmcFinanceEntryType("amount");
}

// ---------------- Type tabs (AMC Amount vs Expense) ----------------

function setAmcFinanceEntryType(type) {
  amcFinanceEntryType = type;
  document.getElementById("amcFinTypeAmountBtn").classList.toggle("active", type === "amount");
  document.getElementById("amcFinTypeExpenseBtn").classList.toggle("active", type === "expense");
  // AMC amount received only needs a date + amount; expenses also need a description.
  document.getElementById("amcFin_descriptionField").style.display = type === "expense" ? "" : "none";
}

function wireAmcFinanceTypeTabs() {
  document.getElementById("amcFinTypeAmountBtn").addEventListener("click", () => setAmcFinanceEntryType("amount"));
  document.getElementById("amcFinTypeExpenseBtn").addEventListener("click", () => setAmcFinanceEntryType("expense"));
}

// ---------------- Load ----------------

async function loadAmcFinanceEntries() {
  const body = document.getElementById("amcFinanceBody");
  const empty = document.getElementById("amcFinanceEmpty");
  try {
    // Filtered by amcId only (no orderBy) to avoid needing a composite Firestore index —
    // sorted client-side by date instead.
    const snap = await db.collection("amcFinanceEntries").where("amcId", "==", currentAmcFinanceId).get();
    amcFinanceCache = snap.docs.map(doc => Object.assign({ id: doc.id }, doc.data()));
    amcFinanceCache.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  } catch (err) {
    console.error(err);
    body.innerHTML = "";
    empty.style.display = "block";
    empty.querySelector("div").textContent = friendlyFirestoreError(err, "load finance entries");
    renderAmcFinanceSummary([]);
    return;
  }
  empty.querySelector("div").textContent = "No entries yet for this AMC.";
  renderAmcFinanceTable(amcFinanceCache);
  renderAmcFinanceSummary(amcFinanceCache);
}

// ---------------- Summary ----------------

function computeAmcFinanceSummary(list) {
  let amount = 0, expense = 0;
  list.forEach(e => {
    const amt = Number(e.amount) || 0;
    if (e.type === "amount") amount += amt; else expense += amt;
  });
  return { amount, expense, balance: amount - expense };
}

function renderAmcFinanceSummary(list) {
  const s = computeAmcFinanceSummary(list);
  document.getElementById("amcFinSummaryAmount").textContent = fmtMoney(s.amount);
  document.getElementById("amcFinSummaryExpense").textContent = fmtMoney(s.expense);
  const balEl = document.getElementById("amcFinSummaryBalance");
  balEl.textContent = fmtMoney(s.balance);
  document.getElementById("amcFinSummaryBalanceCard").classList.toggle("negative", s.balance < 0);
  return s;
}

// ---------------- Table ----------------

function renderAmcFinanceTable(list) {
  const body = document.getElementById("amcFinanceBody");
  const empty = document.getElementById("amcFinanceEmpty");
  body.innerHTML = "";
  if (!list.length) {
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";
  list.forEach(e => {
    const isAmount = e.type === "amount";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${fmtDate(e.date)}</td>
      <td><span class="pill ${isAmount ? "income" : "expense"}">${isAmount ? "AMC Amount" : "Expense"}</span></td>
      <td>${escapeHtml(e.description || "—")}</td>
      <td class="${isAmount ? "amt-income" : "amt-expense"}">${isAmount ? "+" : "−"} ${fmtMoney(e.amount)}</td>
      <td>
        <div class="row-actions">
          <button class="icon-btn" data-delete="${e.id}" title="Delete">🗑</button>
        </div>
      </td>
    `;
    body.appendChild(tr);
  });
  body.querySelectorAll("[data-delete]").forEach(btn => {
    btn.addEventListener("click", () => deleteAmcFinanceEntry(btn.getAttribute("data-delete")));
  });
}

// ---------------- Save / delete ----------------

async function saveAmcFinanceEntry() {
  const date = document.getElementById("amcFin_date").value;
  const amount = Number(document.getElementById("amcFin_amount").value) || 0;
  const description = document.getElementById("amcFin_description").value.trim();

  if (!date) { showToast("Pick a date.", "error"); return; }
  if (amount <= 0) { showToast("Enter an amount greater than 0.", "error"); return; }
  if (amcFinanceEntryType === "expense" && !description) {
    showToast("Add a description for the expense.", "error");
    return;
  }

  const data = {
    amcId: currentAmcFinanceId,
    clientName: currentAmcFinanceClientName,
    type: amcFinanceEntryType,
    date,
    description,
    amount
  };

  const btn = document.getElementById("saveAmcFinanceBtn");
  const original = btn.textContent;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';

  try {
    const user = auth.currentUser;
    await db.collection("amcFinanceEntries").add(Object.assign({}, data, {
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdBy: user ? user.email : null
    }));
    showToast(amcFinanceEntryType === "amount" ? "AMC amount recorded." : "Expense recorded.", "success");
    document.getElementById("amcFin_amount").value = "";
    document.getElementById("amcFin_description").value = "";
    await loadAmcFinanceEntries();
  } catch (err) {
    console.error(err);
    showToast(friendlyFirestoreError(err, "save"), "error");
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

async function deleteAmcFinanceEntry(id) {
  if (!confirm("Delete this entry? This can't be undone.")) return;
  try {
    await db.collection("amcFinanceEntries").doc(id).delete();
    showToast("Entry deleted.", "success");
    await loadAmcFinanceEntries();
  } catch (err) {
    console.error(err);
    showToast(friendlyFirestoreError(err, "delete"), "error");
  }
}
