// ============================================================
// Invoice builder — items, totals, save, preview, print, PDF,
// email draft, WhatsApp share.
// ============================================================

// Fixed seller / bank details (from Srikrithanya's invoice format).
// Edit these constants if the company's registered details change.
const SELLER = {
  name: "SRIKRITHANYA PRIVATE LIMITED",
  address: "No. 15, Shanthipuram, 4th Street, Thirumullaivoyal, Chennai – 600062",
  phone: "93609 06464",
  email: "letsconnectsrikrithanya@gmail.com",
  gstin: "33ABNCS1923P1ZV",
  state: "Tamil Nadu",
  stateCode: "33"
};
const BANK = {
  name: "Union Bank of India",
  accountName: "SRIKRITHANYA PRIVATE LIMITED",
  accountNo: "112915140000010",
  branch: "Sathyamurthi Nagar, Thirumullaivoyal",
  ifsc: "UBIN0811297"
};

let currentInvoiceId = null; // Firestore doc id when editing; null for a brand-new invoice
let currentEditingDocRef = null;
let itemRows = []; // [{ id, description, hsn, qty, rate }]

// ---------------- Items table ----------------
function addItemRow(prefill) {
  const row = Object.assign({
    id: uid("item"),
    description: "",
    hsn: "",
    qty: 1,
    rate: 0
  }, prefill || {});
  itemRows.push(row);
  renderItemsTable();
}

function removeItemRow(id) {
  itemRows = itemRows.filter(r => r.id !== id);
  if (itemRows.length === 0) addItemRow();
  else renderItemsTable();
}

function renderItemsTable() {
  const body = document.getElementById("itemsBody");
  body.innerHTML = "";
  itemRows.forEach((row, idx) => {
    const amount = (Number(row.qty) || 0) * (Number(row.rate) || 0);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="col-sl">${idx + 1}</td>
      <td><input type="text" value="${escapeHtml(row.description)}" placeholder="e.g. Fire hydrant valve — supply &amp; installation" data-field="description" data-id="${row.id}" /></td>
      <td class="col-hsn"><input type="text" value="${escapeHtml(row.hsn)}" placeholder="HSN/SAC" data-field="hsn" data-id="${row.id}" /></td>
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
      const row = itemRows.find(r => r.id === id);
      if (!row) return;
      row[field] = (field === "qty" || field === "rate") ? Number(e.target.value) : e.target.value;
      recalcTotals();
      // only refresh the amount cell + row numbers, not the whole table (keeps focus)
      const amountCell = e.target.closest("tr").querySelector(".col-amt");
      amountCell.textContent = fmtMoney((Number(row.qty) || 0) * (Number(row.rate) || 0));
    });
  });
  body.querySelectorAll("[data-remove]").forEach(btn => {
    btn.addEventListener("click", (e) => removeItemRow(e.target.getAttribute("data-remove")));
  });

  recalcTotals();
}

function recalcTotals() {
  const taxable = itemRows.reduce((sum, r) => sum + (Number(r.qty) || 0) * (Number(r.rate) || 0), 0);
  const cgst = taxable * 0.09;
  const sgst = taxable * 0.09;
  const total = taxable + cgst + sgst;

  document.getElementById("t_taxable").textContent = fmtMoney(taxable);
  document.getElementById("t_cgst").textContent = fmtMoney(cgst);
  document.getElementById("t_sgst").textContent = fmtMoney(sgst);
  document.getElementById("t_total").textContent = fmtMoney(total);
  document.getElementById("t_words").textContent = "Amount in words: " + numberToWordsIndian(total);

  return { taxable, cgst, sgst, total };
}

// ---------------- Invoice numbering ----------------
async function reserveNextInvoiceNumber() {
  const counterRef = db.collection("counters").doc("invoices");
  return db.runTransaction(async (tx) => {
    const doc = await tx.get(counterRef);
    const next = doc.exists ? (doc.data().value || 0) + 1 : 1;
    tx.set(counterRef, { value: next }, { merge: true });
    return "SRK" + String(next).padStart(3, "0");
  });
}

// ---------------- Form <-> data ----------------
function resetInvoiceForm(newNumber) {
  currentInvoiceId = null;
  itemRows = [];
  document.getElementById("f_invoiceNo").value = newNumber || "Generating…";
  document.getElementById("f_invoiceDate").value = todayISO();
  document.getElementById("f_orderNo").value = "";
  document.getElementById("f_orderDate").value = todayISO();
  document.getElementById("f_clientPoNo").value = "";
  document.getElementById("f_clientPoDate").value = "";
  document.getElementById("f_lrNo").value = "";
  document.getElementById("f_transport").value = "";
  document.getElementById("f_salesOrderNo").value = "";
  document.getElementById("f_salesOrderDate").value = todayISO();
  document.getElementById("f_buyerName").value = "";
  document.getElementById("f_buyerAddress").value = "";
  document.getElementById("f_buyerGstin").value = "";
  document.getElementById("f_buyerEmail").value = "";
  document.getElementById("f_buyerPhone").value = "";
  addItemRow();
}

async function startNewInvoice() {
  resetInvoiceForm();
  try {
    const num = await reserveNextInvoiceNumber();
    document.getElementById("f_invoiceNo").value = num;
    document.getElementById("f_orderNo").value = num.replace("SRK", "");
    document.getElementById("f_salesOrderNo").value = num.replace("SRK", "");
  } catch (err) {
    console.error(err);
    document.getElementById("f_invoiceNo").value = "SRK" + Date.now().toString().slice(-4);
    showToast("Couldn't reach the database for numbering — check your Firebase setup.", "error");
  }
}

function collectFormData() {
  const totals = recalcTotals();
  return {
    invoiceNo: document.getElementById("f_invoiceNo").value,
    invoiceDate: document.getElementById("f_invoiceDate").value,
    orderNo: document.getElementById("f_orderNo").value,
    orderDate: document.getElementById("f_orderDate").value,
    clientPoNo: document.getElementById("f_clientPoNo").value,
    clientPoDate: document.getElementById("f_clientPoDate").value,
    lrNo: document.getElementById("f_lrNo").value,
    transport: document.getElementById("f_transport").value,
    salesOrderNo: document.getElementById("f_salesOrderNo").value,
    salesOrderDate: document.getElementById("f_salesOrderDate").value,
    buyerName: document.getElementById("f_buyerName").value,
    buyerAddress: document.getElementById("f_buyerAddress").value,
    buyerGstin: document.getElementById("f_buyerGstin").value,
    buyerEmail: document.getElementById("f_buyerEmail").value,
    buyerPhone: document.getElementById("f_buyerPhone").value,
    items: itemRows.map(r => ({
      description: r.description, hsn: r.hsn, qty: Number(r.qty) || 0, rate: Number(r.rate) || 0,
      amount: (Number(r.qty) || 0) * (Number(r.rate) || 0)
    })),
    taxableValue: totals.taxable,
    cgstAmount: totals.cgst,
    sgstAmount: totals.sgst,
    netTotal: totals.total,
    netAmountWords: numberToWordsIndian(totals.total)
  };
}

function loadInvoiceIntoForm(data, docId) {
  currentInvoiceId = docId || null;
  document.getElementById("f_invoiceNo").value = data.invoiceNo || "";
  document.getElementById("f_invoiceDate").value = data.invoiceDate || todayISO();
  document.getElementById("f_orderNo").value = data.orderNo || "";
  document.getElementById("f_orderDate").value = data.orderDate || "";
  document.getElementById("f_clientPoNo").value = data.clientPoNo || "";
  document.getElementById("f_clientPoDate").value = data.clientPoDate || "";
  document.getElementById("f_lrNo").value = data.lrNo || "";
  document.getElementById("f_transport").value = data.transport || "";
  document.getElementById("f_salesOrderNo").value = data.salesOrderNo || "";
  document.getElementById("f_salesOrderDate").value = data.salesOrderDate || "";
  document.getElementById("f_buyerName").value = data.buyerName || "";
  document.getElementById("f_buyerAddress").value = data.buyerAddress || "";
  document.getElementById("f_buyerGstin").value = data.buyerGstin || "";
  document.getElementById("f_buyerEmail").value = data.buyerEmail || "";
  document.getElementById("f_buyerPhone").value = data.buyerPhone || "";
  itemRows = (data.items || []).map(it => Object.assign({ id: uid("item") }, it));
  if (itemRows.length === 0) addItemRow();
  else renderItemsTable();
}

async function saveInvoice() {
  const data = collectFormData();
  if (!data.buyerName.trim()) { showToast("Add a buyer name before saving.", "error"); return; }
  if (data.items.every(i => !i.description.trim())) { showToast("Add at least one item.", "error"); return; }

  const btn = document.getElementById("saveInvoiceBtn");
  btn.disabled = true;
  const originalText = btn.textContent;
  btn.innerHTML = '<span class="spinner"></span>';

  try {
    const user = auth.currentUser;
    if (currentInvoiceId) {
      await db.collection("invoices").doc(currentInvoiceId).set(Object.assign({}, data, {
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedBy: user ? user.email : null
      }), { merge: true });
      showToast("Invoice updated.", "success");
    } else {
      const docRef = await db.collection("invoices").add(Object.assign({}, data, {
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        createdBy: user ? user.email : null
      }));
      currentInvoiceId = docRef.id;
      showToast("Invoice saved.", "success");
    }
    if (typeof loadHistory === "function") loadHistory();
  } catch (err) {
    console.error(err);
    showToast("Couldn't save — check your Firebase setup.", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

// ---------------- Rendering the printable invoice sheet ----------------
function renderInvoiceHTML(data) {
  const itemsHtml = (data.items || []).map((it, idx) => `
    <tr>
      <td class="center">${idx + 1}</td>
      <td>${escapeHtml(it.description)}</td>
      <td class="center">${escapeHtml(it.hsn)}</td>
      <td class="center">${it.qty}</td>
      <td class="num">${Number(it.rate).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
      <td class="num">${Number(it.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
    </tr>
  `).join("");

  return `
    <div class="inv-title">TAX INVOICE</div>
    <table class="inv-head-table">
      <tr>
        <td style="width:70px;"><img src="assets/logo.png" alt="logo" /></td>
        <td>
          <div class="inv-co-name">${SELLER.name}</div>
          <div><strong>Office Address:</strong> ${SELLER.address}</div>
          <div><strong>E-Mail:</strong> ${SELLER.email}</div>
          <div><strong>GSTIN/UIN:</strong> ${SELLER.gstin}</div>
          <div><strong>Reference No (IRN):</strong> ${escapeHtml(data.invoiceNo)}</div>
        </td>
      </tr>
    </table>

    <table class="inv-meta-table">
      <tr>
        <td>
          <div class="lbl">SELLER</div>
          <div><strong>${SELLER.name}</strong></div>
          <div>${SELLER.address}</div>
          <div>Ph: ${SELLER.phone}</div>
          <div><strong>GSTIN/UIN:</strong> ${SELLER.gstin}</div>
          <div><strong>State:</strong> ${SELLER.state}, Code: ${SELLER.stateCode}</div>
        </td>
        <td>
          <div><span class="lbl">Order No:</span> ${escapeHtml(data.orderNo || "—")}</div>
          <div><span class="lbl">Order Date:</span> ${fmtDate(data.orderDate)}</div>
          <div><span class="lbl">Client P.O. No:</span> ${escapeHtml(data.clientPoNo || "—")}</div>
          <div><span class="lbl">Client P.O. Date:</span> ${data.clientPoDate ? fmtDate(data.clientPoDate) : "—"}</div>
          <div><span class="lbl">L.R. No:</span> ${escapeHtml(data.lrNo || "—")}</div>
          <div><span class="lbl">Transport:</span> ${escapeHtml(data.transport || "—")}</div>
        </td>
      </tr>
      <tr>
        <td>
          <div class="lbl">BUYER</div>
          <div><strong>${escapeHtml(data.buyerName || "—")}</strong></div>
          <div>${escapeHtml(data.buyerAddress || "")}</div>
          <div><strong>GSTIN/UIN:</strong> ${escapeHtml(data.buyerGstin || "—")}</div>
        </td>
        <td>
          <div><span class="lbl">Sales Order No:</span> ${escapeHtml(data.salesOrderNo || "—")}</div>
          <div><span class="lbl">Sales Order Date:</span> ${data.salesOrderDate ? fmtDate(data.salesOrderDate) : "—"}</div>
          <div style="margin-top:6px;"><span class="lbl">Invoice Date:</span> ${fmtDate(data.invoiceDate)}</div>
        </td>
      </tr>
    </table>

    <table class="items-print">
      <thead>
        <tr>
          <th style="width:28px;">SI No</th>
          <th>Description of Goods / Services</th>
          <th style="width:100px;">HSN / SAC</th>
          <th style="width:50px;">Qty</th>
          <th style="width:80px;">Rate</th>
          <th style="width:90px;">Amount</th>
        </tr>
      </thead>
      <tbody>${itemsHtml}</tbody>
    </table>

    <table class="totals-print">
      <tr><td class="lbl-cell">Taxable Value</td><td class="val-cell">₹${Number(data.taxableValue).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td></tr>
      <tr><td class="lbl-cell">CGST Amount @ 9%</td><td class="val-cell">₹${Number(data.cgstAmount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td></tr>
      <tr><td class="lbl-cell">SGST Amount @ 9%</td><td class="val-cell">₹${Number(data.sgstAmount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td></tr>
      <tr><td class="lbl-cell" style="font-size:12.5px;">Total (Net Amount)</td><td class="val-cell" style="font-size:12.5px;">₹${Number(data.netTotal).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td></tr>
    </table>
    <div class="words-cell"><strong>Net Amount in Words:</strong> ${escapeHtml(data.netAmountWords)}</div>
    <div class="cert-cell">Certified that the particulars given above are true and correct, and the amount indicated represents the price actually charged.</div>

    <table class="bank-table">
      <tr>
        <td style="width:60%;">
          <div class="lbl">Bank Details – ${SELLER.name}</div>
          <div><strong>Bank Name:</strong> ${BANK.name}</div>
          <div><strong>Account No:</strong> ${BANK.accountNo}</div>
          <div><strong>Branch:</strong> ${BANK.branch}</div>
          <div><strong>IFSC Code:</strong> ${BANK.ifsc}</div>
          <div class="small-muted">We accept payments by Cheque / DD / NEFT.</div>
        </td>
        <td class="sig-cell">
          <img src="assets/signature.jpg" alt="Authorized signatory" />
          <div class="small-muted">Authorized Signatory</div>
        </td>
      </tr>
    </table>
  `;
}

function currentInvoiceDataOrNull() {
  const data = collectFormData();
  if (!data.buyerName.trim() && data.items.every(i => !i.description.trim())) return null;
  return data;
}

// ---------------- Buyer autocomplete (suggests onboarded clients from js/clients.js) ----------------
// Purely a convenience — the Buyer Name/Address fields stay plain free-text inputs, so
// anyone not yet onboarded as a client can still be typed in manually.
let buyerAutocompleteActiveIndex = -1;

function filterClientsByField(query, field) {
  const q = (query || "").trim().toLowerCase();
  const source = clientsCache || [];
  if (!q) return source.slice(0, 8);
  return source.filter(c => (c[field] || "").toLowerCase().includes(q)).slice(0, 8);
}

function renderAutocompleteList(listEl, matches, hasQuery) {
  buyerAutocompleteActiveIndex = -1;
  if (matches.length === 0) {
    listEl.innerHTML = `<div class="autocomplete-empty">${
      hasQuery ? "No matching client — you can enter the details manually." : "No clients onboarded yet."
    }</div>`;
  } else {
    listEl.innerHTML = matches.map(c => `
      <div class="autocomplete-item" data-id="${escapeHtml(c.id)}">
        <div class="ac-name">${escapeHtml(c.name)}</div>
        <div class="ac-sub">${escapeHtml(c.address || "No address on file")}</div>
      </div>
    `).join("");
    listEl.querySelectorAll(".autocomplete-item").forEach(item => {
      // mousedown (not click) + preventDefault fires before the input's blur, so the
      // selection registers before the dropdown would otherwise close on focus loss.
      item.addEventListener("mousedown", (e) => {
        e.preventDefault();
        applyClientToBuyerFields(item.getAttribute("data-id"));
        closeAutocomplete(listEl);
      });
    });
  }
  listEl.classList.add("open");
}

function closeAutocomplete(listEl) {
  listEl.classList.remove("open");
  buyerAutocompleteActiveIndex = -1;
}

function applyClientToBuyerFields(clientId) {
  const client = (clientsCache || []).find(c => c.id === clientId);
  if (!client) return;
  document.getElementById("f_buyerName").value = client.name || "";
  document.getElementById("f_buyerAddress").value = client.address || "";
  if (client.email) document.getElementById("f_buyerEmail").value = client.email;
  if (client.contact) document.getElementById("f_buyerPhone").value = client.contact;
}

function wireBuyerAutocomplete() {
  const nameInput = document.getElementById("f_buyerName");
  const addressInput = document.getElementById("f_buyerAddress");
  const nameList = document.getElementById("buyerNameSuggestions");
  const addressList = document.getElementById("buyerAddressSuggestions");
  const pairs = [[nameInput, nameList, "name"], [addressInput, addressList, "address"]];

  async function ensureClientsLoaded() {
    if (!clientsCache.length && typeof loadClientsCache === "function") {
      await loadClientsCache();
    }
  }

  pairs.forEach(([input, list, field]) => {
    const refresh = () => renderAutocompleteList(list, filterClientsByField(input.value, field), !!input.value.trim());
    input.addEventListener("focus", async () => { await ensureClientsLoaded(); refresh(); });
    input.addEventListener("input", refresh);
    input.addEventListener("blur", () => { setTimeout(() => closeAutocomplete(list), 150); });

    input.addEventListener("keydown", (e) => {
      if (!list.classList.contains("open")) return;
      const items = Array.from(list.querySelectorAll(".autocomplete-item"));
      if (!items.length) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        buyerAutocompleteActiveIndex = Math.min(buyerAutocompleteActiveIndex + 1, items.length - 1);
        items.forEach((it, i) => it.classList.toggle("active", i === buyerAutocompleteActiveIndex));
        items[buyerAutocompleteActiveIndex].scrollIntoView({ block: "nearest" });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        buyerAutocompleteActiveIndex = Math.max(buyerAutocompleteActiveIndex - 1, 0);
        items.forEach((it, i) => it.classList.toggle("active", i === buyerAutocompleteActiveIndex));
        items[buyerAutocompleteActiveIndex].scrollIntoView({ block: "nearest" });
      } else if (e.key === "Enter") {
        if (buyerAutocompleteActiveIndex >= 0) {
          e.preventDefault();
          applyClientToBuyerFields(items[buyerAutocompleteActiveIndex].getAttribute("data-id"));
          closeAutocomplete(list);
        }
      } else if (e.key === "Escape") {
        closeAutocomplete(list);
      }
    });
  });
}

// ---------------- Preview / Print ----------------
function openPreview() {
  const data = collectFormData();
  document.getElementById("invoiceSheetPreview").innerHTML = renderInvoiceHTML(data);
  document.getElementById("previewModal").classList.add("open");
}

function printInvoice() {
  const data = collectFormData();
  document.getElementById("invoiceSheetPrint").innerHTML = renderInvoiceHTML(data);
  window.print();
}

// ---------------- PDF generation (shared by download + share) ----------------
const PDF_OPTS = {
  margin: 8,
  image: { type: "jpeg", quality: 0.98 },
  html2canvas: { scale: 2, useCORS: true, allowTaint: false },
  jsPDF: { unit: "mm", format: "a4", orientation: "portrait" }
};

function waitForImages(container) {
  const imgs = Array.from(container.querySelectorAll("img"));
  return Promise.all(imgs.map(img => {
    if (img.complete && img.naturalWidth > 0) return Promise.resolve();
    return new Promise(resolve => {
      img.addEventListener("load", resolve, { once: true });
      img.addEventListener("error", resolve, { once: true });
    });
  }));
}

/** Renders `data` into the persistent off-screen sheet (#invoiceSheetPrint), waits for
 *  images, and resolves a PDF Blob. Reusing this always-in-DOM element (rather than an
 *  ephemeral appended div) avoids a html2canvas quirk where a freshly-created off-screen
 *  element sometimes measures as zero height. */
async function buildInvoicePdfFile(data) {
  if (typeof html2pdf === "undefined") {
    throw new Error("The PDF library didn't load — check your internet connection and reload the page.");
  }
  data = data || collectFormData();
  const sheet = document.getElementById("invoiceSheetPrint");
  sheet.innerHTML = renderInvoiceHTML(data);
  await waitForImages(sheet);
  // Force a layout flush before handing off to html2canvas.
  void sheet.offsetHeight;

  const blob = await html2pdf().set(PDF_OPTS).from(sheet).outputPdf("blob");
  const filename = (data.invoiceNo || "invoice") + ".pdf";
  return { blob, filename, data };
}

// ---------------- Download ----------------
async function downloadInvoicePdf(data) {
  const btn = document.getElementById("downloadPdfBtn");
  if (btn) btn.disabled = true;
  showToast("Preparing PDF…");
  try {
    const { blob, filename } = await buildInvoicePdfFile(data);
    triggerBlobDownload(blob, filename);
    showToast("PDF downloaded.", "success");
  } catch (err) {
    console.error(err);
    showToast(err.message || "Couldn't generate the PDF.", "error");
  } finally {
    if (btn) btn.disabled = false;
  }
}

function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
