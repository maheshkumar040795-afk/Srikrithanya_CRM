// ============================================================
// Delivery Challan — dispatch note with item HSN/SAC, Qty × Rate,
// a GST Type (defaults to Exempted, since challans are most often
// Job Work), rounding, save to Firestore, and export as a
// formatted PDF. Reuses SELLER, BANK, PDF_OPTS, waitForImages and
// numberToWordsIndian from js/invoice.js.
// ============================================================

let currentChallanId = null;
let challanItemRows = []; // [{ id, description, hsn, unit, qty, rate }]
let allChallans = [];

// ---------------- Items table ----------------

function addChallanItemRow(prefill) {
  const row = Object.assign({
    id: uid("dcitem"),
    description: "",
    hsn: "",
    unit: "Nos",
    qty: 1,
    rate: 0
  }, prefill || {});
  challanItemRows.push(row);
  renderChallanItemsTable();
}

function removeChallanItemRow(id) {
  challanItemRows = challanItemRows.filter(r => r.id !== id);
  if (challanItemRows.length === 0) addChallanItemRow();
  else renderChallanItemsTable();
}

function renderChallanItemsTable() {
  const body = document.getElementById("challanItemsBody");
  body.innerHTML = "";
  challanItemRows.forEach((row, idx) => {
    const amount = (Number(row.qty) || 0) * (Number(row.rate) || 0);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="col-sl">${idx + 1}</td>
      <td><input type="text" value="${escapeHtml(row.description)}" placeholder="Item description" data-field="description" data-id="${row.id}" /></td>
      <td class="col-hsn"><input type="text" value="${escapeHtml(row.hsn)}" placeholder="HSN/SAC" data-field="hsn" data-id="${row.id}" /></td>
      <td class="col-unit"><input type="text" value="${escapeHtml(row.unit)}" placeholder="Nos" data-field="unit" data-id="${row.id}" /></td>
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
      const row = challanItemRows.find(r => r.id === id);
      if (!row) return;
      row[field] = (field === "qty" || field === "rate") ? Number(e.target.value) : e.target.value;
      recalcChallanTotals();
      const amountCell = e.target.closest("tr").querySelector(".col-amt");
      amountCell.textContent = fmtMoney((Number(row.qty) || 0) * (Number(row.rate) || 0));
    });
  });
  body.querySelectorAll("[data-remove]").forEach(btn => {
    btn.addEventListener("click", (e) => removeChallanItemRow(e.target.getAttribute("data-remove")));
  });

  recalcChallanTotals();
}

// ---------------- GST type (Exempted default / CGST+SGST / IGST) ----------------

function updateChallanGstTypeUI() {
  const gstType = document.getElementById("dc_gstType").value;
  document.getElementById("dc_gstInputsCgstSgst").style.display = gstType === "CGST_SGST" ? "" : "none";
  document.getElementById("dc_gstInputsIgst").style.display = gstType === "IGST" ? "" : "none";
  document.getElementById("dc_igstRow").style.display = gstType === "IGST" ? "" : "none";
  document.getElementById("dc_cgstRow").style.display = gstType === "CGST_SGST" ? "" : "none";
  document.getElementById("dc_sgstRow").style.display = gstType === "CGST_SGST" ? "" : "none";
}

function wireChallanGstTypeControls() {
  document.getElementById("dc_gstType").addEventListener("change", () => { updateChallanGstTypeUI(); recalcChallanTotals(); });
  document.getElementById("dc_cgstPercent").addEventListener("input", recalcChallanTotals);
  document.getElementById("dc_sgstPercent").addEventListener("input", recalcChallanTotals);
  document.getElementById("dc_igstPercent").addEventListener("input", recalcChallanTotals);
  updateChallanGstTypeUI();
}

function recalcChallanTotals() {
  const taxable = challanItemRows.reduce((sum, r) => sum + (Number(r.qty) || 0) * (Number(r.rate) || 0), 0);
  const gstType = document.getElementById("dc_gstType").value;

  let igstPercent = 0, cgstPercent = 0, sgstPercent = 0;
  let igst = 0, cgst = 0, sgst = 0;

  if (gstType === "IGST") {
    igstPercent = Number(document.getElementById("dc_igstPercent").value) || 0;
    igst = taxable * igstPercent / 100;
  } else if (gstType === "CGST_SGST") {
    cgstPercent = Number(document.getElementById("dc_cgstPercent").value) || 0;
    sgstPercent = Number(document.getElementById("dc_sgstPercent").value) || 0;
    cgst = taxable * cgstPercent / 100;
    sgst = taxable * sgstPercent / 100;
  }
  // EXEMPTED / Job Work — igst/cgst/sgst all stay 0

  const rawTotal = taxable + igst + cgst + sgst;
  const total = Math.round(rawTotal);
  const roundOff = total - rawTotal;

  document.getElementById("dc_taxable").textContent = fmtMoney(taxable);
  document.getElementById("dc_igstLabel").textContent = `IGST @ ${igstPercent}%`;
  document.getElementById("dc_igst").textContent = fmtMoney(igst);
  document.getElementById("dc_cgstLabel").textContent = `CGST @ ${cgstPercent}%`;
  document.getElementById("dc_cgst").textContent = fmtMoney(cgst);
  document.getElementById("dc_sgstLabel").textContent = `SGST @ ${sgstPercent}%`;
  document.getElementById("dc_sgst").textContent = fmtMoney(sgst);
  document.getElementById("dc_roundOff").textContent = (roundOff >= 0 ? "" : "-") + fmtMoney(Math.abs(roundOff));
  document.getElementById("dc_total").textContent = fmtMoney(total);
  document.getElementById("dc_words").textContent = "Amount in words: " + numberToWordsIndian(total);

  return { taxable, gstType, igstPercent, igst, cgstPercent, cgst, sgstPercent, sgst, roundOff, total };
}

// ---------------- Challan numbering ----------------

async function reserveNextChallanNumber() {
  const counterRef = db.collection("counters").doc("deliveryChallans");
  return db.runTransaction(async (tx) => {
    const doc = await tx.get(counterRef);
    const next = doc.exists ? (doc.data().value || 0) + 1 : 1;
    tx.set(counterRef, { value: next }, { merge: true });
    return "DC-" + String(next).padStart(3, "0");
  });
}

// ---------------- Form <-> data ----------------

function resetChallanForm(newNumber) {
  currentChallanId = null;
  challanItemRows = [];
  document.getElementById("dc_challanNo").value = newNumber || "Generating…";
  document.getElementById("dc_challanType").value = "Job Work";
  document.getElementById("dc_orderDate").value = todayISO();
  document.getElementById("dc_challanDate").value = todayISO();
  document.getElementById("dc_dispatchDate").value = todayISO();
  document.getElementById("dc_clientName").value = "";
  document.getElementById("dc_clientAddress").value = "";
  document.getElementById("dc_clientPhone").value = "";
  document.getElementById("dc_clientGstin").value = "";
  document.getElementById("dc_refNo").value = "";
  document.getElementById("dc_orderNo").value = "";
  document.getElementById("dc_placeOfSupply").value = "Tamil Nadu (33)";
  document.getElementById("dc_transport").value = "";
  document.getElementById("dc_notes").value = "";
  document.getElementById("dc_gstType").value = "EXEMPTED";
  document.getElementById("dc_cgstPercent").value = 9;
  document.getElementById("dc_sgstPercent").value = 9;
  document.getElementById("dc_igstPercent").value = 18;
  updateChallanGstTypeUI();
  addChallanItemRow();
}

async function startNewChallan() {
  resetChallanForm();
  try {
    const num = await reserveNextChallanNumber();
    document.getElementById("dc_challanNo").value = num;
  } catch (err) {
    console.error(err);
    document.getElementById("dc_challanNo").value = "DC-" + Date.now().toString().slice(-4);
    showToast("Couldn't reach the database for numbering — check your Firebase setup.", "error");
  }
}

function collectChallanFormData() {
  const totals = recalcChallanTotals();
  return {
    challanNo: document.getElementById("dc_challanNo").value,
    challanType: document.getElementById("dc_challanType").value,
    orderDate: document.getElementById("dc_orderDate").value,
    challanDate: document.getElementById("dc_challanDate").value,
    dispatchDate: document.getElementById("dc_dispatchDate").value,
    clientName: document.getElementById("dc_clientName").value,
    clientAddress: document.getElementById("dc_clientAddress").value,
    clientPhone: document.getElementById("dc_clientPhone").value,
    clientGstin: document.getElementById("dc_clientGstin").value,
    refNo: document.getElementById("dc_refNo").value,
    orderNo: document.getElementById("dc_orderNo").value,
    placeOfSupply: document.getElementById("dc_placeOfSupply").value,
    transport: document.getElementById("dc_transport").value,
    notes: document.getElementById("dc_notes").value,
    items: challanItemRows.map(r => ({
      description: r.description, hsn: r.hsn, unit: r.unit, qty: Number(r.qty) || 0, rate: Number(r.rate) || 0,
      amount: (Number(r.qty) || 0) * (Number(r.rate) || 0)
    })),
    taxableValue: totals.taxable,
    gstType: totals.gstType,
    igstPercent: totals.igstPercent,
    igstAmount: totals.igst,
    cgstPercent: totals.cgstPercent,
    cgstAmount: totals.cgst,
    sgstPercent: totals.sgstPercent,
    sgstAmount: totals.sgst,
    roundOff: totals.roundOff,
    netTotal: totals.total,
    netAmountWords: numberToWordsIndian(totals.total)
  };
}

function loadChallanIntoForm(data, docId) {
  currentChallanId = docId || null;
  document.getElementById("dc_challanNo").value = data.challanNo || "";
  document.getElementById("dc_challanType").value = data.challanType || "Job Work";
  document.getElementById("dc_orderDate").value = data.orderDate || todayISO();
  document.getElementById("dc_challanDate").value = data.challanDate || todayISO();
  document.getElementById("dc_dispatchDate").value = data.dispatchDate || todayISO();
  document.getElementById("dc_clientName").value = data.clientName || "";
  document.getElementById("dc_clientAddress").value = data.clientAddress || "";
  document.getElementById("dc_clientPhone").value = data.clientPhone || "";
  document.getElementById("dc_clientGstin").value = data.clientGstin || "";
  document.getElementById("dc_refNo").value = data.refNo || "";
  document.getElementById("dc_orderNo").value = data.orderNo || "";
  document.getElementById("dc_placeOfSupply").value = data.placeOfSupply || "Tamil Nadu (33)";
  document.getElementById("dc_transport").value = data.transport || "";
  document.getElementById("dc_notes").value = data.notes || "";
  document.getElementById("dc_gstType").value = data.gstType || "EXEMPTED";
  document.getElementById("dc_cgstPercent").value = data.cgstPercent != null ? data.cgstPercent : 9;
  document.getElementById("dc_sgstPercent").value = data.sgstPercent != null ? data.sgstPercent : 9;
  document.getElementById("dc_igstPercent").value = data.igstPercent != null ? data.igstPercent : 18;
  updateChallanGstTypeUI();
  challanItemRows = (data.items || []).map(it => Object.assign({ id: uid("dcitem") }, it));
  if (challanItemRows.length === 0) addChallanItemRow();
  else renderChallanItemsTable();
}

async function saveChallan() {
  const data = collectChallanFormData();
  if (!data.clientName.trim()) {
    showToast("Add a client / site name before saving.", "error");
    return;
  }
  if (data.items.every(i => !i.description.trim())) {
    showToast("Add at least one item.", "error");
    return;
  }

  const btn = document.getElementById("saveChallanBtn");
  const original = btn.textContent;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';

  try {
    const user = auth.currentUser;
    if (currentChallanId) {
      await db.collection("deliveryChallans").doc(currentChallanId).set(Object.assign({}, data, {
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedBy: user ? user.email : null
      }), { merge: true });
      showToast("Delivery Challan updated.", "success");
    } else {
      const docRef = await db.collection("deliveryChallans").add(Object.assign({}, data, {
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        createdBy: user ? user.email : null
      }));
      currentChallanId = docRef.id;
      showToast("Delivery Challan saved.", "success");
    }
    loadChallanList();
  } catch (err) {
    console.error(err);
    showToast(friendlyFirestoreError(err, "save"), "error");
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

// ---------------- Saved Challans list ----------------

async function loadChallanList() {
  const body = document.getElementById("challanListBody");
  const empty = document.getElementById("challanListEmpty");
  try {
    const snap = await db.collection("deliveryChallans").orderBy("createdAt", "desc").limit(200).get();
    allChallans = snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
  } catch (err) {
    console.error(err);
    body.innerHTML = "";
    empty.style.display = "block";
    empty.querySelector("div").textContent = friendlyFirestoreError(err, "load delivery challans");
    return;
  }
  empty.querySelector("div").textContent = "No delivery challans saved yet.";
  renderChallanList(allChallans);
}

function renderChallanList(list) {
  const body = document.getElementById("challanListBody");
  const empty = document.getElementById("challanListEmpty");
  body.innerHTML = "";
  if (!list.length) {
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";
  list.forEach(c => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${escapeHtml(c.challanNo)}</strong></td>
      <td>${escapeHtml(c.challanType || "—")}</td>
      <td>${escapeHtml(c.clientName || "—")}</td>
      <td>${fmtDate(c.challanDate)}</td>
      <td>${fmtMoney(c.netTotal)}</td>
      <td>${escapeHtml(c.createdBy || "—")}</td>
      <td>
        <div class="row-actions">
          <button class="icon-btn" data-action="edit" title="Edit">✎</button>
          <button class="icon-btn" data-action="download" title="Download PDF">⬇</button>
          <button class="icon-btn" data-action="delete" title="Delete">🗑</button>
        </div>
      </td>
    `;
    tr.querySelectorAll("[data-action]").forEach(btn => {
      btn.addEventListener("click", () => handleChallanListAction(btn.getAttribute("data-action"), c));
    });
    body.appendChild(tr);
  });
}

function handleChallanListAction(action, c) {
  if (action === "edit") {
    loadChallanIntoForm(c, c.id);
    showToast(`Editing ${c.challanNo}`, "success");
    return;
  }
  if (action === "download") {
    downloadChallanPdf(c);
    return;
  }
  if (action === "delete") {
    if (!confirm(`Delete Delivery Challan ${c.challanNo}? This can't be undone.`)) return;
    db.collection("deliveryChallans").doc(c.id).delete().then(() => {
      showToast("Delivery Challan deleted.", "success");
      loadChallanList();
    }).catch(err => {
      console.error(err);
      showToast(friendlyFirestoreError(err, "delete"), "error");
    });
  }
}

function wireChallanSearch() {
  document.getElementById("challanSearch").addEventListener("input", (e) => {
    const q = e.target.value.trim().toLowerCase();
    if (!q) { renderChallanList(allChallans); return; }
    renderChallanList(allChallans.filter(c =>
      (c.challanNo || "").toLowerCase().includes(q) ||
      (c.clientName || "").toLowerCase().includes(q) ||
      (c.orderNo || "").toLowerCase().includes(q)
    ));
  });
}

// ---------------- Client autocomplete (reuses clientsCache from js/clients.js) ----------------

function wireChallanClientAutocomplete() {
  const input = document.getElementById("dc_clientName");
  const list = document.getElementById("challanClientNameSuggestions");

  const applyClient = (clientId) => {
    const client = (clientsCache || []).find(c => c.id === clientId);
    if (!client) return;
    input.value = client.name || "";
    document.getElementById("dc_clientAddress").value = client.address || "";
    if (client.contact) document.getElementById("dc_clientPhone").value = client.contact;
    else if (client.email) document.getElementById("dc_clientPhone").value = client.email;
  };

  const refresh = () => {
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

// ---------------- Rendering the printable Delivery Challan sheet ----------------

function renderChallanGstRowsHtml(data) {
  const gstType = data.gstType || "EXEMPTED";
  const fmt = (n) => Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 });
  if (gstType === "IGST") {
    return `<tr><td class="lbl-cell">IGST @ ${data.igstPercent != null ? data.igstPercent : 0}%</td><td class="val-cell">₹${fmt(data.igstAmount)}</td></tr>`;
  }
  if (gstType === "CGST_SGST") {
    const cgstPercent = data.cgstPercent != null ? data.cgstPercent : 9;
    const sgstPercent = data.sgstPercent != null ? data.sgstPercent : 9;
    return `
      <tr><td class="lbl-cell">CGST @ ${cgstPercent}%</td><td class="val-cell">₹${fmt(data.cgstAmount)}</td></tr>
      <tr><td class="lbl-cell">SGST @ ${sgstPercent}%</td><td class="val-cell">₹${fmt(data.sgstAmount)}</td></tr>
    `;
  }
  return `<tr><td class="lbl-cell">GST</td><td class="val-cell">Exempted / Job Work (₹0.00)</td></tr>`;
}

function renderChallanHTML(data) {
  const itemsHtml = (data.items || []).map((it, idx) => `
    <tr>
      <td class="center">${idx + 1}</td>
      <td>${escapeHtml(it.description)}</td>
      <td class="center">${escapeHtml(it.hsn || "—")}</td>
      <td class="center">${escapeHtml(it.unit)}</td>
      <td class="center">${it.qty}</td>
      <td class="num">${Number(it.rate).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
      <td class="num">${Number(it.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
    </tr>
  `).join("");

  return `
    <div class="inv-title">DELIVERY CHALLAN</div>
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
          <div class="lbl">CHALLAN DETAILS</div>
          <div><span class="lbl">Challan No:</span> ${escapeHtml(data.challanNo)}</div>
          <div><span class="lbl">Challan Type:</span> ${escapeHtml(data.challanType || "—")}</div>
          <div><span class="lbl">Order Date:</span> ${fmtDate(data.orderDate)}</div>
          <div><span class="lbl">Challan Date:</span> ${fmtDate(data.challanDate)}</div>
          <div><span class="lbl">Dispatch Date:</span> ${fmtDate(data.dispatchDate)}</div>
        </td>
        <td>
          <div class="lbl">BILL TO / SHIP TO</div>
          <div><strong>${escapeHtml(data.clientName || "—")}</strong></div>
          <div>${escapeHtml(data.clientAddress || "")}</div>
          <div><span class="lbl">Phone:</span> ${escapeHtml(data.clientPhone || "—")}</div>
          <div><span class="lbl">GSTIN/UIN:</span> ${escapeHtml(data.clientGstin || "—")}</div>
        </td>
      </tr>
      <tr>
        <td colspan="2">
          <div class="lbl">REFERENCE</div>
          <div><span class="lbl">Ref #:</span> ${escapeHtml(data.refNo || "—")} &nbsp;|&nbsp; <span class="lbl">Order No:</span> ${escapeHtml(data.orderNo || "—")}</div>
          <div><span class="lbl">Place of Supply:</span> ${escapeHtml(data.placeOfSupply || "—")} &nbsp;|&nbsp; <span class="lbl">Transport/Vehicle No:</span> ${escapeHtml(data.transport || "—")}</div>
        </td>
      </tr>
    </table>

    <table class="items-print">
      <thead>
        <tr>
          <th style="width:28px;">Sl No</th>
          <th>Item Description</th>
          <th style="width:70px;">HSN/SAC</th>
          <th style="width:50px;">Unit</th>
          <th style="width:40px;">Qty</th>
          <th style="width:70px;">Rate</th>
          <th style="width:80px;">Amount</th>
        </tr>
      </thead>
      <tbody>${itemsHtml}</tbody>
    </table>

    <table class="totals-print">
      <tr><td class="lbl-cell">Sub Total</td><td class="val-cell">₹${Number(data.taxableValue).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td></tr>
      ${renderChallanGstRowsHtml(data)}
      <tr><td class="lbl-cell">Rounded Off</td><td class="val-cell">${(data.roundOff >= 0 ? "" : "-")}₹${Math.abs(Number(data.roundOff || 0)).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td></tr>
      <tr><td class="lbl-cell" style="font-size:12.5px;">Grand Total</td><td class="val-cell" style="font-size:12.5px;">₹${Number(data.netTotal).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td></tr>
    </table>
    <div class="words-cell"><strong>Amount in Words:</strong> ${escapeHtml(data.netAmountWords)}</div>
    ${data.notes ? `<div class="words-cell"><strong>Notes:</strong> ${escapeHtml(data.notes)}</div>` : ""}

    <table class="bank-table">
      <tr>
        <td style="width:60%;">
          <div class="small-muted">Goods dispatched as per the details above. Please verify quantity and condition on receipt.</div>
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

function openChallanPreview() {
  const data = collectChallanFormData();
  document.getElementById("challanSheetPreview").innerHTML = renderChallanHTML(data);
  document.getElementById("challanPreviewModal").classList.add("open");
}

// ---------------- PDF export (reuses PDF_OPTS + waitForImages from js/invoice.js) ----------------

async function buildChallanPdfFile(data) {
  if (typeof html2pdf === "undefined") {
    throw new Error("The PDF library didn't load — check your internet connection and reload the page.");
  }
  data = data || collectChallanFormData();
  const sheet = document.getElementById("challanSheetPrint");
  sheet.innerHTML = renderChallanHTML(data);
  await waitForImages(sheet);
  void sheet.offsetHeight; // force layout flush before html2canvas, same fix as the invoice sheet
  const blob = await html2pdf().set(PDF_OPTS).from(sheet).outputPdf("blob");
  const filename = (data.challanNo || "Delivery-Challan") + ".pdf";
  return { blob, filename, data };
}

async function downloadChallanPdf(data) {
  const btn = document.getElementById("downloadChallanPdfBtn");
  if (btn) btn.disabled = true;
  showToast("Preparing PDF…");
  try {
    const { blob, filename } = await buildChallanPdfFile(data);
    triggerBlobDownload(blob, filename);
    showToast("PDF downloaded.", "success");
  } catch (err) {
    console.error(err);
    showToast(err.message || "Couldn't generate the PDF.", "error");
  } finally {
    if (btn) btn.disabled = false;
  }
}
