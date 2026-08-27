// ============================================================
// BOQ — Bill of Quantities / quotations. Items with Qty × Rate,
// a user-entered GST % (split evenly into CGST + SGST), save to
// Firestore, and export as a formatted PDF. Reuses SELLER, BANK,
// PDF_OPTS and waitForImages from js/invoice.js.
// ============================================================

let currentBoqId = null;
let boqItemRows = []; // [{ id, description, unit, qty, rate }]
let allBoqs = [];

// ---------------- Items table ----------------

function addBoqItemRow(prefill) {
  const row = Object.assign({
    id: uid("boqitem"),
    description: "",
    unit: "",
    qty: 1,
    rate: 0
  }, prefill || {});
  boqItemRows.push(row);
  renderBoqItemsTable();
}

function removeBoqItemRow(id) {
  boqItemRows = boqItemRows.filter(r => r.id !== id);
  if (boqItemRows.length === 0) addBoqItemRow();
  else renderBoqItemsTable();
}

function renderBoqItemsTable() {
  const body = document.getElementById("boqItemsBody");
  body.innerHTML = "";
  boqItemRows.forEach((row, idx) => {
    const amount = (Number(row.qty) || 0) * (Number(row.rate) || 0);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="col-sl">${idx + 1}</td>
      <td><input type="text" value="${escapeHtml(row.description)}" placeholder="e.g. Supply and installation of fire hydrant piping" data-field="description" data-id="${row.id}" /></td>
      <td class="col-unit"><input type="text" value="${escapeHtml(row.unit)}" placeholder="Rmt / No / LS" data-field="unit" data-id="${row.id}" /></td>
      <td class="col-qty"><input type="number" min="0" step="1" value="${row.qty}" data-field="qty" data-id="${row.id}" /></td>
      <td class="col-rate"><input type="number" min="0" step="0.01" value="${row.rate}" data-field="rate" data-id="${row.id}" /></td>
      <td class="col-amt">${fmtMoney(amount)}</td>
      <td><button type="button" class="row-remove" data-remove="${row.id}" title="Remove item">✕</button></td>
    `;
    body.appendChild(tr);
  });

  body.querySelectorAll("input").forEach(inp => {
    inp.addEventListener("input", (e) => {
      const id = e.target.getAttribute("data-id");
      const field = e.target.getAttribute("data-field");
      const row = boqItemRows.find(r => r.id === id);
      if (!row) return;
      row[field] = (field === "qty" || field === "rate") ? Number(e.target.value) : e.target.value;
      recalcBoqTotals();
      const amountCell = e.target.closest("tr").querySelector(".col-amt");
      amountCell.textContent = fmtMoney((Number(row.qty) || 0) * (Number(row.rate) || 0));
    });
  });
  body.querySelectorAll("[data-remove]").forEach(btn => {
    btn.addEventListener("click", (e) => removeBoqItemRow(e.target.getAttribute("data-remove")));
  });

  recalcBoqTotals();
}

function recalcBoqTotals() {
  const taxable = boqItemRows.reduce((sum, r) => sum + (Number(r.qty) || 0) * (Number(r.rate) || 0), 0);
  const gstPercent = Number(document.getElementById("b_gstPercent").value) || 0;
  const half = gstPercent / 2;
  const cgst = taxable * half / 100;
  const sgst = taxable * half / 100;
  const total = taxable + cgst + sgst;

  document.getElementById("b_taxable").textContent = fmtMoney(taxable);
  document.getElementById("b_cgstLabel").textContent = `CGST @ ${half}%`;
  document.getElementById("b_sgstLabel").textContent = `SGST @ ${half}%`;
  document.getElementById("b_cgst").textContent = fmtMoney(cgst);
  document.getElementById("b_sgst").textContent = fmtMoney(sgst);
  document.getElementById("b_total").textContent = fmtMoney(total);
  document.getElementById("b_words").textContent = "Amount in words: " + numberToWordsIndian(total);

  return { taxable, cgst, sgst, total, gstPercent };
}

// ---------------- BOQ numbering ----------------

async function reserveNextBoqNumber() {
  const counterRef = db.collection("counters").doc("boqs");
  return db.runTransaction(async (tx) => {
    const doc = await tx.get(counterRef);
    const next = doc.exists ? (doc.data().value || 0) + 1 : 1;
    tx.set(counterRef, { value: next }, { merge: true });
    return "BOQ-" + String(next).padStart(3, "0");
  });
}

// ---------------- Form <-> data ----------------

function resetBoqForm(newNumber) {
  currentBoqId = null;
  boqItemRows = [];
  document.getElementById("b_boqNo").value = newNumber || "Generating…";
  document.getElementById("b_boqDate").value = todayISO();
  document.getElementById("b_projectName").value = "";
  document.getElementById("b_projectLocation").value = "";
  document.getElementById("b_clientName").value = "";
  document.getElementById("b_clientAddress").value = "";
  document.getElementById("b_clientContact").value = "";
  document.getElementById("b_clientGstin").value = "";
  document.getElementById("b_gstPercent").value = 18;
  addBoqItemRow();
}

async function startNewBoq() {
  resetBoqForm();
  try {
    const num = await reserveNextBoqNumber();
    document.getElementById("b_boqNo").value = num;
  } catch (err) {
    console.error(err);
    document.getElementById("b_boqNo").value = "BOQ-" + Date.now().toString().slice(-4);
    showToast("Couldn't reach the database for numbering — check your Firebase setup.", "error");
  }
}

function collectBoqFormData() {
  const totals = recalcBoqTotals();
  return {
    boqNo: document.getElementById("b_boqNo").value,
    boqDate: document.getElementById("b_boqDate").value,
    projectName: document.getElementById("b_projectName").value,
    projectLocation: document.getElementById("b_projectLocation").value,
    clientName: document.getElementById("b_clientName").value,
    clientAddress: document.getElementById("b_clientAddress").value,
    clientContact: document.getElementById("b_clientContact").value,
    clientGstin: document.getElementById("b_clientGstin").value,
    gstPercent: totals.gstPercent,
    items: boqItemRows.map(r => ({
      description: r.description, unit: r.unit, qty: Number(r.qty) || 0, rate: Number(r.rate) || 0,
      amount: (Number(r.qty) || 0) * (Number(r.rate) || 0)
    })),
    taxableValue: totals.taxable,
    cgstAmount: totals.cgst,
    sgstAmount: totals.sgst,
    netTotal: totals.total,
    netAmountWords: numberToWordsIndian(totals.total)
  };
}

function loadBoqIntoForm(data, docId) {
  currentBoqId = docId || null;
  document.getElementById("b_boqNo").value = data.boqNo || "";
  document.getElementById("b_boqDate").value = data.boqDate || todayISO();
  document.getElementById("b_projectName").value = data.projectName || "";
  document.getElementById("b_projectLocation").value = data.projectLocation || "";
  document.getElementById("b_clientName").value = data.clientName || "";
  document.getElementById("b_clientAddress").value = data.clientAddress || "";
  document.getElementById("b_clientContact").value = data.clientContact || "";
  document.getElementById("b_clientGstin").value = data.clientGstin || "";
  document.getElementById("b_gstPercent").value = data.gstPercent != null ? data.gstPercent : 18;
  boqItemRows = (data.items || []).map(it => Object.assign({ id: uid("boqitem") }, it));
  if (boqItemRows.length === 0) addBoqItemRow();
  else renderBoqItemsTable();
}

async function saveBoq() {
  const data = collectBoqFormData();
  if (!data.projectName.trim() && !data.clientName.trim()) {
    showToast("Add a project name or client name before saving.", "error");
    return;
  }
  if (data.items.every(i => !i.description.trim())) {
    showToast("Add at least one item.", "error");
    return;
  }

  const btn = document.getElementById("saveBoqBtn");
  const original = btn.textContent;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';

  try {
    const user = auth.currentUser;
    if (currentBoqId) {
      await db.collection("boqs").doc(currentBoqId).set(Object.assign({}, data, {
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedBy: user ? user.email : null
      }), { merge: true });
      showToast("BOQ updated.", "success");
    } else {
      const docRef = await db.collection("boqs").add(Object.assign({}, data, {
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        createdBy: user ? user.email : null
      }));
      currentBoqId = docRef.id;
      showToast("BOQ saved.", "success");
    }
    loadBoqList();
  } catch (err) {
    console.error(err);
    showToast(friendlyFirestoreError(err, "save"), "error");
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

// ---------------- Saved BOQs list ----------------

async function loadBoqList() {
  const body = document.getElementById("boqListBody");
  const empty = document.getElementById("boqListEmpty");
  try {
    const snap = await db.collection("boqs").orderBy("createdAt", "desc").limit(200).get();
    allBoqs = snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
  } catch (err) {
    console.error(err);
    body.innerHTML = "";
    empty.style.display = "block";
    empty.querySelector("div").textContent = friendlyFirestoreError(err, "load BOQs");
    return;
  }
  empty.querySelector("div").textContent = "No BOQs saved yet.";
  renderBoqList(allBoqs);
}

function renderBoqList(list) {
  const body = document.getElementById("boqListBody");
  const empty = document.getElementById("boqListEmpty");
  body.innerHTML = "";
  if (!list.length) {
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";
  list.forEach(b => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${escapeHtml(b.boqNo)}</strong></td>
      <td>${escapeHtml(b.projectName || "—")}</td>
      <td>${escapeHtml(b.clientName || "—")}</td>
      <td>${fmtDate(b.boqDate)}</td>
      <td>${fmtMoney(b.netTotal)}</td>
      <td>
        <div class="row-actions">
          <button class="icon-btn" data-action="edit" title="Edit">✎</button>
          <button class="icon-btn" data-action="download" title="Download PDF">⬇</button>
          <button class="icon-btn" data-action="delete" title="Delete">🗑</button>
        </div>
      </td>
    `;
    tr.querySelectorAll("[data-action]").forEach(btn => {
      btn.addEventListener("click", () => handleBoqListAction(btn.getAttribute("data-action"), b));
    });
    body.appendChild(tr);
  });
}

function handleBoqListAction(action, b) {
  if (action === "edit") {
    loadBoqIntoForm(b, b.id);
    showToast(`Editing ${b.boqNo}`, "success");
    return;
  }
  if (action === "download") {
    downloadBoqPdf(b);
    return;
  }
  if (action === "delete") {
    if (!confirm(`Delete BOQ ${b.boqNo}? This can't be undone.`)) return;
    db.collection("boqs").doc(b.id).delete().then(() => {
      showToast("BOQ deleted.", "success");
      loadBoqList();
    }).catch(err => {
      console.error(err);
      showToast(friendlyFirestoreError(err, "delete"), "error");
    });
  }
}

function wireBoqSearch() {
  document.getElementById("boqSearch").addEventListener("input", (e) => {
    const q = e.target.value.trim().toLowerCase();
    if (!q) { renderBoqList(allBoqs); return; }
    renderBoqList(allBoqs.filter(b =>
      (b.boqNo || "").toLowerCase().includes(q) ||
      (b.projectName || "").toLowerCase().includes(q) ||
      (b.clientName || "").toLowerCase().includes(q)
    ));
  });
}

// ---------------- Client autocomplete (reuses clientsCache from js/clients.js) ----------------

function wireBoqClientAutocomplete() {
  const input = document.getElementById("b_clientName");
  const list = document.getElementById("boqClientNameSuggestions");
  let activeIndex = -1;

  const applyClient = (clientId) => {
    const client = (clientsCache || []).find(c => c.id === clientId);
    if (!client) return;
    input.value = client.name || "";
    document.getElementById("b_clientAddress").value = client.address || "";
    if (client.contact) document.getElementById("b_clientContact").value = client.contact;
    else if (client.email) document.getElementById("b_clientContact").value = client.email;
  };

  const refresh = () => {
    activeIndex = -1;
    const matches = filterClientsByField(input.value, "name");
    const hasQuery = !!input.value.trim();
    if (matches.length === 0) {
      list.innerHTML = `<div class="autocomplete-empty">${hasQuery ? "No matching client — you can enter the details manually." : "No clients onboarded yet."}</div>`;
    } else {
      list.innerHTML = matches.map(c => `
        <div class="autocomplete-item" data-id="${escapeHtml(c.id)}">
          <div class="ac-name">${escapeHtml(c.name)}</div>
          <div class="ac-sub">${escapeHtml(c.address || "No address on file")}</div>
        </div>
      `).join("");
      list.querySelectorAll(".autocomplete-item").forEach(item => {
        item.addEventListener("mousedown", (e) => {
          e.preventDefault();
          applyClient(item.getAttribute("data-id"));
          list.classList.remove("open");
        });
      });
    }
    list.classList.add("open");
  };

  input.addEventListener("focus", async () => {
    if (!clientsCache.length && typeof loadClientsCache === "function") await loadClientsCache();
    refresh();
  });
  input.addEventListener("input", refresh);
  input.addEventListener("blur", () => { setTimeout(() => list.classList.remove("open"), 150); });
}

// ---------------- Rendering the printable BOQ sheet ----------------

function renderBoqHTML(data) {
  const half = (data.gstPercent || 0) / 2;
  const itemsHtml = (data.items || []).map((it, idx) => `
    <tr>
      <td class="center">${idx + 1}</td>
      <td>${escapeHtml(it.description)}</td>
      <td class="center">${escapeHtml(it.unit)}</td>
      <td class="center">${it.qty}</td>
      <td class="num">${Number(it.rate).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
      <td class="num">${Number(it.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
    </tr>
  `).join("");

  return `
    <div class="inv-title">BILL OF QUANTITIES (BOQ)</div>
    <table class="inv-head-table">
      <tr>
        <td style="width:70px;"><img src="assets/logo.png" alt="logo" /></td>
        <td>
          <div class="inv-co-name">${SELLER.name}</div>
          <div><strong>Office Address:</strong> ${SELLER.address}</div>
          <div><strong>E-Mail:</strong> ${SELLER.email} &nbsp;|&nbsp; <strong>Ph:</strong> ${SELLER.phone}</div>
          <div><strong>GSTIN/UIN:</strong> ${SELLER.gstin}</div>
        </td>
      </tr>
    </table>

    <table class="inv-meta-table">
      <tr>
        <td>
          <div class="lbl">BOQ / QUOTATION REF</div>
          <div><span class="lbl">BOQ No:</span> ${escapeHtml(data.boqNo)}</div>
          <div><span class="lbl">Date:</span> ${fmtDate(data.boqDate)}</div>
          <div><span class="lbl">Project Name:</span> ${escapeHtml(data.projectName || "—")}</div>
          <div><span class="lbl">Project Location:</span> ${escapeHtml(data.projectLocation || "—")}</div>
        </td>
        <td>
          <div class="lbl">CLIENT / BUYER</div>
          <div><strong>${escapeHtml(data.clientName || "—")}</strong></div>
          <div>${escapeHtml(data.clientAddress || "")}</div>
          <div><span class="lbl">Contact:</span> ${escapeHtml(data.clientContact || "—")}</div>
          <div><span class="lbl">GSTIN/UIN:</span> ${escapeHtml(data.clientGstin || "—")}</div>
        </td>
      </tr>
    </table>

    <table class="items-print">
      <thead>
        <tr>
          <th style="width:28px;">Sl No</th>
          <th>Description of Work / Item</th>
          <th style="width:60px;">Unit</th>
          <th style="width:50px;">Qty</th>
          <th style="width:80px;">Rate</th>
          <th style="width:90px;">Amount</th>
        </tr>
      </thead>
      <tbody>${itemsHtml}</tbody>
    </table>

    <table class="totals-print">
      <tr><td class="lbl-cell">Taxable Value</td><td class="val-cell">₹${Number(data.taxableValue).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td></tr>
      <tr><td class="lbl-cell">CGST @ ${half}%</td><td class="val-cell">₹${Number(data.cgstAmount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td></tr>
      <tr><td class="lbl-cell">SGST @ ${half}%</td><td class="val-cell">₹${Number(data.sgstAmount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td></tr>
      <tr><td class="lbl-cell" style="font-size:12.5px;">Total (Net Amount)</td><td class="val-cell" style="font-size:12.5px;">₹${Number(data.netTotal).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td></tr>
    </table>
    <div class="words-cell"><strong>Net Amount in Words:</strong> ${escapeHtml(data.netAmountWords)}</div>

    <table class="bank-table">
      <tr>
        <td style="width:60%;">
          <div class="lbl">Bank Details – ${SELLER.name}</div>
          <div><strong>Bank Name:</strong> ${BANK.name}</div>
          <div><strong>Account No:</strong> ${BANK.accountNo}</div>
          <div><strong>Branch:</strong> ${BANK.branch}</div>
          <div><strong>IFSC Code:</strong> ${BANK.ifsc}</div>
          <div class="small-muted">Rates exclude GST unless stated otherwise; valid for 30 days from the BOQ date.</div>
        </td>
        <td class="sig-cell">
          <img src="assets/signature.jpg" alt="Authorized signatory" />
          <div class="small-muted">Authorized Signatory</div>
        </td>
      </tr>
    </table>
  `;
}

// ---------------- Preview ----------------

function openBoqPreview() {
  const data = collectBoqFormData();
  document.getElementById("boqSheetPreview").innerHTML = renderBoqHTML(data);
  document.getElementById("boqPreviewModal").classList.add("open");
}

// ---------------- PDF export (reuses PDF_OPTS + waitForImages from js/invoice.js) ----------------

async function buildBoqPdfFile(data) {
  if (typeof html2pdf === "undefined") {
    throw new Error("The PDF library didn't load — check your internet connection and reload the page.");
  }
  data = data || collectBoqFormData();
  const sheet = document.getElementById("boqSheetPrint");
  sheet.innerHTML = renderBoqHTML(data);
  await waitForImages(sheet);
  void sheet.offsetHeight; // force layout flush before html2canvas, same fix as the invoice sheet
  const blob = await html2pdf().set(PDF_OPTS).from(sheet).outputPdf("blob");
  const filename = (data.boqNo || "BOQ") + ".pdf";
  return { blob, filename, data };
}

async function downloadBoqPdf(data) {
  const btn = document.getElementById("downloadBoqPdfBtn");
  if (btn) btn.disabled = true;
  showToast("Preparing PDF…");
  try {
    const { blob, filename } = await buildBoqPdfFile(data);
    triggerBlobDownload(blob, filename);
    showToast("PDF downloaded.", "success");
  } catch (err) {
    console.error(err);
    showToast(err.message || "Couldn't generate the PDF.", "error");
  } finally {
    if (btn) btn.disabled = false;
  }
}
