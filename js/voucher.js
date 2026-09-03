// ============================================================
// Voucher — a payment voucher (cash or cheque): who was paid, how
// much, what for, and how (cash or cheque details). Amount in
// words fills in automatically. Save to Firestore, export as a
// formatted PDF. Reuses SELLER, PDF_OPTS, waitForImages and
// numberToWordsIndian from js/invoice.js.
// ============================================================

let currentVoucherId = null;
let allVouchers = [];

// ---------------- Payment mode ----------------

function updateVoucherModeUI() {
  const mode = document.getElementById("v_paymentMode").value;
  document.getElementById("v_chequeFields").style.display = mode === "Cheque" ? "" : "none";
}

function wireVoucherModeControls() {
  document.getElementById("v_paymentMode").addEventListener("change", updateVoucherModeUI);
  document.getElementById("v_amount").addEventListener("input", updateVoucherAmountWords);
  updateVoucherModeUI();
}

function updateVoucherAmountWords() {
  const amount = Number(document.getElementById("v_amount").value) || 0;
  document.getElementById("v_amountWordsHint").textContent =
    "Amount in words: " + (amount > 0 ? numberToWordsIndian(amount) : "—");
}

// ---------------- Voucher numbering ----------------

async function reserveNextVoucherNumber() {
  const counterRef = db.collection("counters").doc("vouchers");
  return db.runTransaction(async (tx) => {
    const doc = await tx.get(counterRef);
    const next = doc.exists ? (doc.data().value || 0) + 1 : 1;
    tx.set(counterRef, { value: next }, { merge: true });
    return "PV-" + String(next).padStart(3, "0");
  });
}

// ---------------- Form <-> data ----------------

function resetVoucherForm(newNumber) {
  currentVoucherId = null;
  document.getElementById("v_pvNo").value = newNumber || "";
  document.getElementById("v_date").value = todayISO();
  document.getElementById("v_paidTo").value = "";
  document.getElementById("v_towards").value = "";
  document.getElementById("v_amount").value = "";
  document.getElementById("v_paymentMode").value = "Cash";
  document.getElementById("v_chequeNo").value = "";
  document.getElementById("v_bankName").value = "";
  document.getElementById("v_chequeDate").value = "";
  updateVoucherModeUI();
  updateVoucherAmountWords();
}

function startNewVoucher() {
  resetVoucherForm();
  document.getElementById("v_pvNo").focus();
}

function collectVoucherFormData() {
  const amount = Number(document.getElementById("v_amount").value) || 0;
  return {
    pvNo: document.getElementById("v_pvNo").value,
    date: document.getElementById("v_date").value,
    paidTo: document.getElementById("v_paidTo").value,
    towards: document.getElementById("v_towards").value,
    amount,
    amountWords: amount > 0 ? numberToWordsIndian(amount) : "",
    paymentMode: document.getElementById("v_paymentMode").value,
    chequeNo: document.getElementById("v_chequeNo").value,
    bankName: document.getElementById("v_bankName").value,
    chequeDate: document.getElementById("v_chequeDate").value
  };
}

function loadVoucherIntoForm(data, docId) {
  currentVoucherId = docId || null;
  document.getElementById("v_pvNo").value = data.pvNo || "";
  document.getElementById("v_date").value = data.date || todayISO();
  document.getElementById("v_paidTo").value = data.paidTo || "";
  document.getElementById("v_towards").value = data.towards || "";
  document.getElementById("v_amount").value = data.amount || "";
  document.getElementById("v_paymentMode").value = data.paymentMode || "Cash";
  document.getElementById("v_chequeNo").value = data.chequeNo || "";
  document.getElementById("v_bankName").value = data.bankName || "";
  document.getElementById("v_chequeDate").value = data.chequeDate || "";
  updateVoucherModeUI();
  updateVoucherAmountWords();
}

async function saveVoucher() {
  const data = collectVoucherFormData();
  if (!data.pvNo.trim()) { showToast("Enter a voucher number before saving.", "error"); return; }
  if (!data.paidTo.trim()) {
    showToast("Add who this was paid to before saving.", "error");
    return;
  }
  if (!data.amount || data.amount <= 0) {
    showToast("Enter an amount greater than 0.", "error");
    return;
  }

  const btn = document.getElementById("saveVoucherBtn");
  const original = btn.textContent;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';

  try {
    const user = auth.currentUser;
    if (currentVoucherId) {
      await db.collection("vouchers").doc(currentVoucherId).set(Object.assign({}, data, {
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedBy: user ? user.email : null
      }), { merge: true });
      showToast("Voucher updated.", "success");
    } else {
      const docRef = await db.collection("vouchers").add(Object.assign({}, data, {
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        createdBy: user ? user.email : null
      }));
      currentVoucherId = docRef.id;
      showToast("Voucher saved.", "success");
    }
    loadVoucherList();
  } catch (err) {
    console.error(err);
    showToast(friendlyFirestoreError(err, "save"), "error");
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

// ---------------- Saved Vouchers list ----------------

async function loadVoucherList() {
  const body = document.getElementById("voucherListBody");
  const empty = document.getElementById("voucherListEmpty");
  try {
    const snap = await db.collection("vouchers").orderBy("createdAt", "desc").limit(200).get();
    allVouchers = snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
  } catch (err) {
    console.error(err);
    body.innerHTML = "";
    empty.style.display = "block";
    empty.querySelector("div").textContent = friendlyFirestoreError(err, "load vouchers");
    return;
  }
  empty.querySelector("div").textContent = "No vouchers saved yet.";
  renderVoucherList(allVouchers);
}

function renderVoucherList(list) {
  const body = document.getElementById("voucherListBody");
  const empty = document.getElementById("voucherListEmpty");
  body.innerHTML = "";
  if (!list.length) {
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";
  list.forEach(v => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${escapeHtml(v.pvNo)}</strong></td>
      <td>${escapeHtml(v.paidTo || "—")}</td>
      <td>${fmtDate(v.date)}</td>
      <td>${fmtMoney(v.amount)}</td>
      <td>${escapeHtml(v.paymentMode || "—")}</td>
      <td>${escapeHtml(v.createdBy || "—")}</td>
      <td>
        <div class="row-actions">
          <button class="icon-btn" data-action="preview" title="Preview">👁</button>
          <button class="icon-btn" data-action="edit" title="Edit">✎</button>
          <button class="icon-btn" data-action="download" title="Download PDF">⬇</button>
          <button class="icon-btn" data-action="delete" title="Delete">🗑</button>
        </div>
      </td>
    `;
    tr.querySelectorAll("[data-action]").forEach(btn => {
      btn.addEventListener("click", () => handleVoucherListAction(btn.getAttribute("data-action"), v));
    });
    body.appendChild(tr);
  });
}

function handleVoucherListAction(action, v) {
  if (action === "preview") {
    openVoucherPreview(v);
    return;
  }
  if (action === "edit") {
    loadVoucherIntoForm(v, v.id);
    showToast(`Editing ${v.pvNo}`, "success");
    return;
  }
  if (action === "download") {
    downloadVoucherPdf(v);
    return;
  }
  if (action === "delete") {
    if (!confirm(`Delete Voucher ${v.pvNo}? This can't be undone.`)) return;
    db.collection("vouchers").doc(v.id).delete().then(() => {
      showToast("Voucher deleted.", "success");
      loadVoucherList();
    }).catch(err => {
      console.error(err);
      showToast(friendlyFirestoreError(err, "delete"), "error");
    });
  }
}

function wireVoucherSearch() {
  document.getElementById("voucherSearch").addEventListener("input", (e) => {
    const q = e.target.value.trim().toLowerCase();
    if (!q) { renderVoucherList(allVouchers); return; }
    renderVoucherList(allVouchers.filter(v =>
      (v.pvNo || "").toLowerCase().includes(q) ||
      (v.paidTo || "").toLowerCase().includes(q)
    ));
  });
}

// ---------------- Rendering the printable Voucher sheet ----------------

function renderVoucherHTML(data) {
  const isCheque = data.paymentMode === "Cheque";
  const chequeLine = isCheque
    ? `<div><span class="lbl">Cheque No:</span> ${escapeHtml(data.chequeNo || "—")} &nbsp;|&nbsp; <span class="lbl">Bank/Branch:</span> ${escapeHtml(data.bankName || "—")} &nbsp;|&nbsp; <span class="lbl">Dated:</span> ${data.chequeDate ? fmtDate(data.chequeDate) : "—"}</div>`
    : "";

  return `
    <div class="inv-title">${isCheque ? "CHEQUE" : "CASH"} VOUCHER</div>
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
          <div class="lbl">VOUCHER DETAILS</div>
          <div><span class="lbl">PV No:</span> ${escapeHtml(data.pvNo)}</div>
          <div><span class="lbl">Date:</span> ${fmtDate(data.date)}</div>
          <div><span class="lbl">Paid By:</span> ${escapeHtml(data.paymentMode || "Cash")}</div>
          ${chequeLine}
        </td>
        <td>
          <div class="lbl">PAID TO</div>
          <div><strong>${escapeHtml(data.paidTo || "—")}</strong></div>
          <div><span class="lbl">Towards:</span> ${escapeHtml(data.towards || "—")}</div>
        </td>
      </tr>
    </table>

    <div class="words-cell"><strong>Rupees (in words):</strong> ${escapeHtml(data.amountWords || "—")}</div>

    <table class="totals-print">
      <tr><td class="lbl-cell" style="font-size:14px;">Amount</td><td class="val-cell" style="font-size:14px;">₹${Number(data.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td></tr>
    </table>

    <table class="bank-table">
      <tr>
        <td style="width:60%;">
          <div class="small-muted">Received the above amount in good order.</div>
        </td>
        <td class="sig-cell">
          <div class="sig-stamp-wrap">
            <img src="assets/company-seal.png" class="sig-seal" alt="Company seal" />
            <img src="assets/director-signature-block.png" class="sig-block" alt="Authorized signatory" />
          </div>
          <div class="small-muted">Manager / Accountant</div>
        </td>
      </tr>
    </table>
  `;
}

// ---------------- Preview ----------------

function openVoucherPreview(data) {
  data = data || collectVoucherFormData();
  document.getElementById("voucherSheetPreview").innerHTML = renderVoucherHTML(data);
  document.getElementById("voucherPreviewModal").classList.add("open");
}

// ---------------- PDF export (reuses PDF_OPTS + waitForImages from js/invoice.js) ----------------

async function buildVoucherPdfFile(data) {
  if (typeof html2pdf === "undefined") {
    throw new Error("The PDF library didn't load — check your internet connection and reload the page.");
  }
  data = data || collectVoucherFormData();
  const sheet = document.getElementById("voucherSheetPrint");
  sheet.innerHTML = renderVoucherHTML(data);
  await waitForImages(sheet);
  void sheet.offsetHeight; // force layout flush before html2canvas, same fix as the invoice sheet
  const blob = await html2pdf().set(PDF_OPTS).from(sheet).outputPdf("blob");
  const filename = (data.pvNo || "Voucher") + ".pdf";
  return { blob, filename, data };
}

async function downloadVoucherPdf(data) {
  const btn = document.getElementById("downloadVoucherPdfBtn");
  if (btn) btn.disabled = true;
  showToast("Preparing PDF…");
  try {
    const { blob, filename } = await buildVoucherPdfFile(data);
    triggerBlobDownload(blob, filename);
    showToast("PDF downloaded.", "success");
  } catch (err) {
    console.error(err);
    showToast(err.message || "Couldn't generate the PDF.", "error");
  } finally {
    if (btn) btn.disabled = false;
  }
}
