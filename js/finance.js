// ============================================================
// Finance — Financial Accounts screen (admin only).
// Log income and expenses (including an "Owner Drawings" category
// for personal/own-use withdrawals so they stay tracked rather than
// mixed into business spend), see running totals, and export the
// currently filtered statement as PDF or Excel.
// ============================================================

const FIN_CATEGORIES = {
  income: ["Invoice Payment", "Advance Received", "Interest / Bank Income", "Other Income"],
  expense: [
    "Material Purchase", "Salary & Wages", "Rent", "Utilities (Electricity/Water)",
    "Transport & Fuel", "Office Supplies", "Equipment / Tools", "Professional Fees",
    "Owner Drawings (Personal Use)", "Other Expense"
  ]
};

let financeCache = [];      // all entries, most recent first
let editingFinanceId = null;
let financeEntryType = "income"; // which tab the add-entry form is on

// ---------------- Add-entry form: type tabs + category options ----------------

function populateFinanceCategorySelect(type) {
  const select = document.getElementById("fin_category");
  select.innerHTML = FIN_CATEGORIES[type].map(c => `<option>${escapeHtml(c)}</option>`).join("");
}

function setFinanceFormType(type) {
  financeEntryType = type;
  document.getElementById("finTypeIncomeBtn").classList.toggle("active", type === "income");
  document.getElementById("finTypeExpenseBtn").classList.toggle("active", type === "expense");
  document.getElementById("finPartyLabel").textContent = type === "income" ? "Received From" : "Paid To";
  populateFinanceCategorySelect(type);
}

function populateFinanceFilterCategoryOptions() {
  const select = document.getElementById("finFilterCategory");
  const all = FIN_CATEGORIES.income.concat(FIN_CATEGORIES.expense);
  select.innerHTML = '<option value="">All categories</option>' +
    all.map(c => `<option>${escapeHtml(c)}</option>`).join("");
}

// ---------------- Load ----------------

async function loadFinanceCache() {
  const snap = await db.collection("financeEntries").orderBy("date", "desc").get();
  financeCache = snap.docs.map(doc => Object.assign({ id: doc.id }, doc.data()));
  return financeCache;
}

async function loadFinanceEntries() {
  const body = document.getElementById("financeBody");
  const empty = document.getElementById("financeEmpty");
  try {
    await loadFinanceCache();
  } catch (err) {
    console.error(err);
    body.innerHTML = "";
    empty.style.display = "block";
    empty.querySelector("div").textContent = friendlyFirestoreError(err, "load finance entries");
    renderFinanceSummary([]);
    return;
  }
  empty.querySelector("div").textContent = "No entries yet. Add your first income or expense above.";
  applyFinanceFiltersAndRender();
}

// ---------------- Summary ----------------

function computeFinanceSummary(list) {
  let income = 0, expense = 0;
  list.forEach(e => {
    const amt = Number(e.amount) || 0;
    if (e.type === "income") income += amt; else expense += amt;
  });
  return { income, expense, net: income - expense };
}

function renderFinanceSummary(list) {
  const s = computeFinanceSummary(list);
  document.getElementById("finSummaryIncome").textContent = fmtMoney(s.income);
  document.getElementById("finSummaryExpense").textContent = fmtMoney(s.expense);
  const netEl = document.getElementById("finSummaryNet");
  netEl.textContent = fmtMoney(s.net);
  document.getElementById("finSummaryNetCard").classList.toggle("negative", s.net < 0);
  return s;
}

// ---------------- Filters + table ----------------

function getFilteredFinanceList() {
  const q = document.getElementById("finSearch").value.trim().toLowerCase();
  const type = document.getElementById("finFilterType").value;
  const category = document.getElementById("finFilterCategory").value;
  const month = document.getElementById("finFilterMonth").value; // "YYYY-MM"
  const from = document.getElementById("finFilterFrom").value;
  const to = document.getElementById("finFilterTo").value;

  return financeCache.filter(e => {
    if (type && e.type !== type) return false;
    if (category && e.category !== category) return false;
    if (month && (e.date || "").slice(0, 7) !== month) return false;
    if (from && e.date < from) return false;
    if (to && e.date > to) return false;
    if (q) {
      const hay = ((e.party || "") + " " + (e.notes || "")).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function applyFinanceFiltersAndRender() {
  const list = getFilteredFinanceList();
  renderFinanceTable(list);
  renderFinanceSummary(list);
}

function renderFinanceTable(list) {
  const body = document.getElementById("financeBody");
  const empty = document.getElementById("financeEmpty");
  body.innerHTML = "";
  if (!list.length) {
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";
  list.forEach(e => {
    const isIncome = e.type === "income";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${fmtDate(e.date)}</td>
      <td><span class="pill ${isIncome ? "income" : "expense"}">${isIncome ? "Income" : "Expense"}</span></td>
      <td>${escapeHtml(e.category || "—")}</td>
      <td>${escapeHtml(e.party || "—")}</td>
      <td>${escapeHtml(e.paymentMode || "—")}</td>
      <td class="${isIncome ? "amt-income" : "amt-expense"}">${isIncome ? "+" : "−"} ${fmtMoney(e.amount)}</td>
      <td>
        <div class="row-actions">
          <button class="icon-btn" data-action="edit" title="Edit">✎</button>
          <button class="icon-btn" data-action="delete" title="Delete">🗑</button>
        </div>
      </td>
    `;
    tr.querySelectorAll("[data-action]").forEach(btn => {
      btn.addEventListener("click", () => handleFinanceAction(btn.getAttribute("data-action"), e));
    });
    body.appendChild(tr);
  });
}

function handleFinanceAction(action, entry) {
  if (action === "edit") {
    loadFinanceIntoForm(entry);
    return;
  }
  if (action === "delete") {
    if (!confirm(`Delete this ${entry.type} entry of ${fmtMoney(entry.amount)}? This can't be undone.`)) return;
    db.collection("financeEntries").doc(entry.id).delete().then(() => {
      showToast("Entry deleted.", "success");
      loadFinanceEntries();
    }).catch(err => {
      console.error(err);
      showToast(friendlyFirestoreError(err, "delete"), "error");
    });
  }
}

function loadFinanceIntoForm(entry) {
  editingFinanceId = entry.id;
  setFinanceFormType(entry.type);
  document.getElementById("fin_date").value = entry.date || todayISO();
  document.getElementById("fin_category").value = entry.category || "";
  document.getElementById("fin_party").value = entry.party || "";
  document.getElementById("fin_amount").value = entry.amount != null ? entry.amount : "";
  document.getElementById("fin_paymentMode").value = entry.paymentMode || "Cash";
  document.getElementById("fin_notes").value = entry.notes || "";
  document.getElementById("financeFormTitle").textContent = `Editing ${entry.type === "income" ? "income" : "expense"} entry`;
  document.getElementById("saveFinanceBtn").textContent = "Update Entry";
  document.getElementById("cancelFinanceEditBtn").style.display = "inline-flex";
  document.getElementById("financeFormTitle").scrollIntoView({ behavior: "smooth", block: "center" });
}

function resetFinanceForm() {
  editingFinanceId = null;
  setFinanceFormType("income");
  document.getElementById("fin_date").value = todayISO();
  document.getElementById("fin_party").value = "";
  document.getElementById("fin_amount").value = "";
  document.getElementById("fin_paymentMode").value = "Cash";
  document.getElementById("fin_notes").value = "";
  document.getElementById("financeFormTitle").textContent = "Add an entry";
  document.getElementById("saveFinanceBtn").textContent = "Save Entry";
  document.getElementById("cancelFinanceEditBtn").style.display = "none";
}

async function saveFinanceEntry() {
  const date = document.getElementById("fin_date").value;
  const category = document.getElementById("fin_category").value;
  const party = document.getElementById("fin_party").value.trim();
  const amount = parseFloat(document.getElementById("fin_amount").value);
  const paymentMode = document.getElementById("fin_paymentMode").value;
  const notes = document.getElementById("fin_notes").value.trim();

  if (!date) { showToast("Date is required.", "error"); return; }
  if (!category) { showToast("Category is required.", "error"); return; }
  if (!amount || amount <= 0) { showToast("Enter an amount greater than 0.", "error"); return; }

  const data = { type: financeEntryType, date, category, party, amount, paymentMode, notes };

  const wasEditing = !!editingFinanceId;
  const btn = document.getElementById("saveFinanceBtn");
  const original = btn.textContent;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';

  try {
    const user = auth.currentUser;
    if (wasEditing) {
      await db.collection("financeEntries").doc(editingFinanceId).set(Object.assign({}, data, {
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedBy: user ? user.email : null
      }), { merge: true });
      showToast("Entry updated.", "success");
    } else {
      await db.collection("financeEntries").add(Object.assign({}, data, {
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        createdBy: user ? user.email : null
      }));
      showToast(`${financeEntryType === "income" ? "Income" : "Expense"} entry saved.`, "success");
    }
    resetFinanceForm();
    await loadFinanceEntries();
  } catch (err) {
    console.error(err);
    showToast(friendlyFirestoreError(err, "save"), "error");
    btn.textContent = original;
  } finally {
    btn.disabled = false;
  }
}

function wireFinanceFilters() {
  ["finSearch", "finFilterType", "finFilterCategory", "finFilterMonth", "finFilterFrom", "finFilterTo"].forEach(id => {
    document.getElementById(id).addEventListener("input", applyFinanceFiltersAndRender);
  });
  document.getElementById("clearFinanceFiltersBtn").addEventListener("click", () => {
    document.getElementById("finSearch").value = "";
    document.getElementById("finFilterType").value = "";
    document.getElementById("finFilterCategory").value = "";
    document.getElementById("finFilterMonth").value = "";
    document.getElementById("finFilterFrom").value = "";
    document.getElementById("finFilterTo").value = "";
    applyFinanceFiltersAndRender();
  });
}

function wireFinanceTypeTabs() {
  document.getElementById("finTypeIncomeBtn").addEventListener("click", () => setFinanceFormType("income"));
  document.getElementById("finTypeExpenseBtn").addEventListener("click", () => setFinanceFormType("expense"));
}

// ---------------- Export: PDF ----------------

function financeDateRangeLabel(from, to, month) {
  if (month) {
    const d = new Date(month + "-01T00:00:00");
    return isNaN(d) ? month : d.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  }
  if (from && to) return `${fmtDate(from)} – ${fmtDate(to)}`;
  if (from) return `From ${fmtDate(from)}`;
  if (to) return `Up to ${fmtDate(to)}`;
  return "All dates";
}

function renderFinanceStatementHTML(list, summary) {
  const from = document.getElementById("finFilterFrom").value;
  const to = document.getElementById("finFilterTo").value;
  const month = document.getElementById("finFilterMonth").value;
  const rows = list.map(e => `
    <tr>
      <td>${fmtDate(e.date)}</td>
      <td class="center">${e.type === "income" ? "Income" : "Expense"}</td>
      <td>${escapeHtml(e.category || "—")}</td>
      <td>${escapeHtml(e.party || "—")}</td>
      <td class="center">${escapeHtml(e.paymentMode || "—")}</td>
      <td>${escapeHtml(e.notes || "")}</td>
      <td class="num">${e.type === "income" ? "" : "−"}${fmtMoney(e.amount)}</td>
    </tr>
  `).join("");

  return `
    <div class="inv-title">FINANCIAL STATEMENT</div>
    <table class="inv-head-table">
      <tr>
        <td style="width:64px;"><img src="assets/logo.png" alt="" /></td>
        <td>
          <div class="inv-co-name">SRIKRITHANYA PRIVATE LIMITED</div>
          <div class="small-muted">Period: ${financeDateRangeLabel(from, to, month)} · Generated ${fmtDate(todayISO())}</div>
        </td>
      </tr>
    </table>
    <table class="items-print" style="margin-top:14px;">
      <thead>
        <tr>
          <th>Date</th><th>Type</th><th>Category</th><th>Party</th><th>Mode</th><th>Notes</th><th>Amount (₹)</th>
        </tr>
      </thead>
      <tbody>${rows || `<tr><td colspan="7" class="center">No entries in this range.</td></tr>`}</tbody>
    </table>
    <table class="totals-print" style="margin-top:0;">
      <tr><td class="lbl-cell">Total Income</td><td class="val-cell">${fmtMoney(summary.income)}</td></tr>
      <tr><td class="lbl-cell">Total Expense</td><td class="val-cell">${fmtMoney(summary.expense)}</td></tr>
      <tr><td class="lbl-cell">Net Balance</td><td class="val-cell">${fmtMoney(summary.net)}</td></tr>
    </table>
  `;
}

async function downloadFinancePdf() {
  if (typeof html2pdf === "undefined") {
    showToast("The PDF library didn't load — check your internet connection and reload the page.", "error");
    return;
  }
  const list = getFilteredFinanceList();
  const summary = computeFinanceSummary(list);
  const btn = document.getElementById("downloadFinancePdfBtn");
  btn.disabled = true;
  showToast("Preparing PDF…");
  try {
    const sheet = document.getElementById("financeSheetPrint");
    sheet.innerHTML = renderFinanceStatementHTML(list, summary);
    const imgs = Array.from(sheet.querySelectorAll("img"));
    await Promise.all(imgs.map(img => (img.complete && img.naturalWidth > 0) ? Promise.resolve() :
      new Promise(res => { img.addEventListener("load", res, { once: true }); img.addEventListener("error", res, { once: true }); })));
    void sheet.offsetHeight;
    const blob = await html2pdf().set({
      margin: [10, 8, 10, 8],
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, allowTaint: false },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" }
    }).from(sheet).outputPdf("blob");
    triggerBlobDownload(blob, `Financial-Statement-${todayISO()}.pdf`);
    showToast("PDF downloaded.", "success");
  } catch (err) {
    console.error(err);
    showToast(err.message || "Couldn't generate the PDF.", "error");
  } finally {
    btn.disabled = false;
  }
}

// ---------------- Export: Excel ----------------

function downloadFinanceExcel() {
  if (typeof XLSX === "undefined") {
    showToast("The Excel library didn't load — check your internet connection and reload the page.", "error");
    return;
  }
  const list = getFilteredFinanceList();
  if (!list.length) {
    showToast("No entries to export in the current filter.", "error");
    return;
  }
  const summary = computeFinanceSummary(list);

  const rows = [["Date", "Type", "Category", "Party", "Payment Mode", "Notes", "Amount (₹)"]];
  list.forEach(e => {
    rows.push([
      e.date || "", e.type === "income" ? "Income" : "Expense", e.category || "",
      e.party || "", e.paymentMode || "", e.notes || "",
      (e.type === "income" ? 1 : -1) * (Number(e.amount) || 0)
    ]);
  });
  rows.push([]);
  rows.push(["", "", "", "", "", "Total Income", summary.income]);
  rows.push(["", "", "", "", "", "Total Expense", -summary.expense]);
  rows.push(["", "", "", "", "", "Net Balance", summary.net]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 12 }, { wch: 10 }, { wch: 26 }, { wch: 22 }, { wch: 14 }, { wch: 28 }, { wch: 14 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Finance");
  XLSX.writeFile(wb, `Financial-Statement-${todayISO()}.xlsx`);
  showToast("Excel file downloaded.", "success");
}
