// ============================================================
// Invoice Payments — a small per-invoice ledger opened from the
// ₹ icon on an Invoice History row. Log "Amount Received" entries
// (date + amount); Pending = Invoice Total − sum(Amount Received).
// Entries are stored in Firestore under "invoicePayments", linked
// to the invoice's own doc id (invoiceId). Supports multiple
// partial payments per invoice (e.g. advance + balance).
// ============================================================

let currentInvoicePayment = null;   // the invoice object the modal is open for
let invoicePaymentsCache = [];      // entries for the currently open invoice
let invoicePaymentTotalsMap = {};   // invoiceId -> total received (feeds the history table columns)

// ---------------- Totals for the history table ----------------

async function loadInvoicePaymentTotals() {
  try {
    const snap = await db.collection("invoicePayments").get();
    const map = {};
    snap.docs.forEach(doc => {
      const d = doc.data();
      if (!d.invoiceId) return;
      map[d.invoiceId] = (map[d.invoiceId] || 0) + (Number(d.amount) || 0);
    });
    invoicePaymentTotalsMap = map;
  } catch (err) {
    console.error(err);
    invoicePaymentTotalsMap = {};
  }
  return invoicePaymentTotalsMap;
}

// ---------------- Open / close ----------------

async function openInvoicePayment(inv) {
  currentInvoicePayment = inv;
  document.getElementById("invoicePaymentModalTitle").textContent = `Payment — ${inv.invoiceNo}`;
  document.getElementById("invPay_totalAmount").textContent = fmtMoney(inv.netTotal);
  resetInvoicePaymentForm();
  document.getElementById("invoicePaymentModal").classList.add("open");
  await loadInvoicePaymentEntries();
}

function resetInvoicePaymentForm() {
  document.getElementById("invPay_date").value = todayISO();
  document.getElementById("invPay_amount").value = "";
}

// ---------------- Load ----------------

async function loadInvoicePaymentEntries() {
  const body = document.getElementById("invoicePaymentBody");
  const empty = document.getElementById("invoicePaymentEmpty");
  try {
    // Filtered by invoiceId only (no orderBy) to avoid needing a composite
    // Firestore index — sorted client-side by date instead.
    const snap = await db.collection("invoicePayments").where("invoiceId", "==", currentInvoicePayment.id).get();
    invoicePaymentsCache = snap.docs.map(doc => Object.assign({ id: doc.id }, doc.data()));
    invoicePaymentsCache.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  } catch (err) {
    console.error(err);
    body.innerHTML = "";
    empty.style.display = "block";
    empty.querySelector("div").textContent = friendlyFirestoreError(err, "load payment entries");
    renderInvoicePaymentSummary([]);
    return;
  }
  empty.querySelector("div").textContent = "No payments recorded yet for this invoice.";
  renderInvoicePaymentTable(invoicePaymentsCache);
  renderInvoicePaymentSummary(invoicePaymentsCache);
}

// ---------------- Summary ----------------

function computeInvoicePaymentSummary(list) {
  const received = list.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const total = Number(currentInvoicePayment.netTotal) || 0;
  return { total, received, pending: total - received };
}

function renderInvoicePaymentSummary(list) {
  const s = computeInvoicePaymentSummary(list);
  document.getElementById("invPaySummaryReceived").textContent = fmtMoney(s.received);
  const pendingEl = document.getElementById("invPaySummaryPending");
  const pendingCard = document.getElementById("invPaySummaryPendingCard");
  if (s.pending < 0) {
    pendingEl.textContent = `Overpaid by ${fmtMoney(Math.abs(s.pending))}`;
  } else {
    pendingEl.textContent = fmtMoney(s.pending);
  }
  pendingCard.classList.toggle("negative", s.pending < 0);
  return s;
}

// ---------------- Table ----------------

function renderInvoicePaymentTable(list) {
  const body = document.getElementById("invoicePaymentBody");
  const empty = document.getElementById("invoicePaymentEmpty");
  body.innerHTML = "";
  if (!list.length) {
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";
  list.forEach(e => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${fmtDate(e.date)}</td>
      <td class="amt-income">+ ${fmtMoney(e.amount)}</td>
      <td>
        <div class="row-actions">
          <button class="icon-btn" data-delete="${e.id}" title="Delete">🗑</button>
        </div>
      </td>
    `;
    body.appendChild(tr);
  });
  body.querySelectorAll("[data-delete]").forEach(btn => {
    btn.addEventListener("click", () => deleteInvoicePaymentEntry(btn.getAttribute("data-delete")));
  });
}

// ---------------- Save / delete ----------------

async function saveInvoicePaymentEntry() {
  const date = document.getElementById("invPay_date").value;
  const amount = Number(document.getElementById("invPay_amount").value) || 0;

  if (!date) { showToast("Pick a date.", "error"); return; }
  if (amount <= 0) { showToast("Enter an amount greater than 0.", "error"); return; }

  const btn = document.getElementById("saveInvoicePaymentBtn");
  const original = btn.textContent;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';

  try {
    const user = auth.currentUser;
    await db.collection("invoicePayments").add({
      invoiceId: currentInvoicePayment.id,
      invoiceNo: currentInvoicePayment.invoiceNo || "",
      buyerName: currentInvoicePayment.buyerName || "",
      date,
      amount,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdBy: user ? user.email : null
    });
    showToast("Payment recorded.", "success");
    document.getElementById("invPay_amount").value = "";
    await loadInvoicePaymentEntries();
    await loadInvoicePaymentTotals();
    renderHistory(allInvoices); // refresh the Received / Pending columns in the background list
  } catch (err) {
    console.error(err);
    showToast(friendlyFirestoreError(err, "save"), "error");
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

async function deleteInvoicePaymentEntry(id) {
  if (!confirm("Delete this payment entry? This can't be undone.")) return;
  try {
    await db.collection("invoicePayments").doc(id).delete();
    showToast("Entry deleted.", "success");
    await loadInvoicePaymentEntries();
    await loadInvoicePaymentTotals();
    renderHistory(allInvoices);
  } catch (err) {
    console.error(err);
    showToast(friendlyFirestoreError(err, "delete"), "error");
  }
}
