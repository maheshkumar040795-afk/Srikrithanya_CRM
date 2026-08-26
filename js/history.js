// ============================================================
// Invoice History — list, search, edit, recreate, per-row actions
// ============================================================

let allInvoices = []; // cached list of { id, ...data }

async function loadHistory() {
  const body = document.getElementById("historyBody");
  const empty = document.getElementById("historyEmpty");
  try {
    const snap = await db.collection("invoices").orderBy("createdAt", "desc").limit(200).get();
    allInvoices = snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
    renderHistory(allInvoices);
  } catch (err) {
    console.error(err);
    body.innerHTML = "";
    empty.style.display = "block";
    empty.querySelector("div").textContent = "Couldn't load invoices — check your Firebase setup.";
  }
}

function renderHistory(list) {
  const body = document.getElementById("historyBody");
  const empty = document.getElementById("historyEmpty");
  body.innerHTML = "";

  if (!list.length) {
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  list.forEach(inv => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${escapeHtml(inv.invoiceNo)}</strong></td>
      <td>${escapeHtml(inv.buyerName || "—")}</td>
      <td>${fmtDate(inv.invoiceDate)}</td>
      <td>${fmtMoney(inv.netTotal)}</td>
      <td>${escapeHtml((inv.createdBy || "—").split("@")[0])}</td>
      <td>
        <div class="row-actions">
          <button class="icon-btn" data-action="edit" title="Edit">✎</button>
          <button class="icon-btn" data-action="recreate" title="Recreate as new">⎘</button>
          <button class="icon-btn" data-action="download" title="Download PDF">⬇</button>
          <button class="icon-btn" data-action="print" title="Print">🖶</button>
          <button class="icon-btn" data-action="delete" title="Delete">🗑</button>
        </div>
      </td>
    `;
    tr.querySelectorAll("[data-action]").forEach(btn => {
      btn.addEventListener("click", () => handleHistoryAction(btn.getAttribute("data-action"), inv));
    });
    body.appendChild(tr);
  });
}

function handleHistoryAction(action, inv) {
  if (action === "edit") {
    loadInvoiceIntoForm(inv, inv.id);
    switchView("invoiceView");
    showToast(`Editing ${inv.invoiceNo}`, "success");
    return;
  }
  if (action === "recreate") {
    loadInvoiceIntoForm(inv, null); // copy data, but as a fresh invoice
    reserveNextInvoiceNumber().then(num => {
      document.getElementById("f_invoiceNo").value = num;
      document.getElementById("f_orderNo").value = num.replace("SRK", "");
      document.getElementById("f_salesOrderNo").value = num.replace("SRK", "");
      document.getElementById("f_invoiceDate").value = todayISO();
      document.getElementById("f_orderDate").value = todayISO();
      document.getElementById("f_salesOrderDate").value = todayISO();
    });
    switchView("invoiceView");
    showToast(`Recreating from ${inv.invoiceNo} as a new invoice`, "success");
    return;
  }
  if (action === "download") {
    downloadInvoicePdf(inv);
    return;
  }
  if (action === "print") {
    document.getElementById("invoiceSheetPrint").innerHTML = renderInvoiceHTML(inv);
    window.print();
    return;
  }
  if (action === "delete") {
    if (!confirm(`Delete invoice ${inv.invoiceNo}? This can't be undone.`)) return;
    db.collection("invoices").doc(inv.id).delete().then(() => {
      showToast("Invoice deleted.", "success");
      loadHistory();
    }).catch(err => {
      console.error(err);
      showToast("Couldn't delete invoice.", "error");
    });
  }
}

function wireHistorySearch() {
  const input = document.getElementById("historySearch");
  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    if (!q) { renderHistory(allInvoices); return; }
    renderHistory(allInvoices.filter(inv =>
      (inv.invoiceNo || "").toLowerCase().includes(q) ||
      (inv.buyerName || "").toLowerCase().includes(q)
    ));
  });
}
