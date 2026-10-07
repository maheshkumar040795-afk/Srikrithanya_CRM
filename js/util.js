// ============================================================
// Shared helpers used across the CRM
// ============================================================

function fmtMoney(n) {
  n = Number(n) || 0;
  return "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d) {
  if (!d) return "—";
  const date = (d instanceof Date) ? d : new Date(d);
  if (isNaN(date)) return "—";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/** Indian numbering system (lakh/crore) number-to-words, for whole rupees + paise. */
function numberToWordsIndian(amount) {
  const num = Math.round((Number(amount) || 0) * 100) / 100;
  const rupees = Math.floor(num);
  const paise = Math.round((num - rupees) * 100);

  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  function twoDigits(n) {
    if (n < 20) return ones[n];
    return tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "");
  }
  function threeDigits(n) {
    if (n >= 100) return ones[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + twoDigits(n % 100) : "");
    return twoDigits(n);
  }

  function convert(n) {
    if (n === 0) return "Zero";
    let str = "";
    const crore = Math.floor(n / 10000000); n %= 10000000;
    const lakh = Math.floor(n / 100000); n %= 100000;
    const thousand = Math.floor(n / 1000); n %= 1000;
    const rest = n;
    if (crore) str += threeDigits(crore) + " Crore ";
    if (lakh) str += threeDigits(lakh) + " Lakh ";
    if (thousand) str += threeDigits(thousand) + " Thousand ";
    if (rest) str += threeDigits(rest);
    return str.trim();
  }

  let words = convert(rupees) + " Rupees";
  if (paise > 0) words += " and " + convert(paise) + " Paise";
  return words + " Only";
}

// ---------------- Item tables: insert-row helper ----------------
// Used by Invoice, BOQ / Quotation and Delivery Challan after a row is
// inserted in the middle of the list: briefly highlights the new row and
// puts the cursor in its Description box so the user can type straight away.
function focusNewItemRow(bodyId, index) {
  const body = document.getElementById(bodyId);
  const tr = body && body.children[index];
  if (!tr) return;
  tr.classList.add("row-inserted");
  const input = tr.querySelector('input[data-field="description"]');
  if (input) input.focus();
  setTimeout(() => tr.classList.remove("row-inserted"), 1400);
}

function showToast(message, type) {
  const stack = document.getElementById("toastStack");
  if (!stack) return;
  const el = document.createElement("div");
  el.className = "toast" + (type ? " " + type : "");
  el.textContent = message;
  stack.appendChild(el);
  setTimeout(() => el.remove(), 3800);
}

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function uid(prefix) {
  return (prefix || "id") + "_" + Math.random().toString(36).slice(2, 9);
}

/** Turns a raw Firestore/Firebase error into a short, specific message instead of a
 *  generic "check your Firebase setup" — Firestore's own error code almost always
 *  points straight at the actual fix, so surface it instead of hiding it. */
function friendlyFirestoreError(err, action) {
  const code = err && err.code;
  if (code === "permission-denied") {
    return `Couldn't ${action} — Firestore security rules are blocking this. In Firebase console → Firestore Database → Rules, make sure the rules from README.md are pasted in and published.`;
  }
  if (code === "unavailable") {
    return `Couldn't ${action} — Firestore looks unreachable. Check your internet connection.`;
  }
  return `Couldn't ${action}${err && err.message ? ": " + err.message : " — check your Firebase setup."}`;
}

// ---------------- Generic table exports (Excel + PDF) ----------------
// Reused by AMC, AMC Finance, Suppliers, and Employee Attendance/Expense —
// anywhere a simple table of rows needs to leave the app as a file.
// `rows` is an array of arrays already formatted for display (strings/numbers).

function downloadRowsAsExcel(sheetName, headers, rows, filename, colWidths) {
  if (typeof XLSX === "undefined") {
    showToast("The Excel library didn't load — check your internet connection and reload the page.", "error");
    return;
  }
  if (!rows.length) {
    showToast("Nothing to export.", "error");
    return;
  }
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  if (colWidths) ws["!cols"] = colWidths.map(w => ({ wch: w }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, (sheetName || "Sheet1").slice(0, 31));
  XLSX.writeFile(wb, filename);
  showToast("Excel file downloaded.", "success");
}

async function downloadRowsAsPdf(title, headers, rows, filename, orientation) {
  if (typeof html2pdf === "undefined") {
    showToast("The PDF library didn't load — check your internet connection and reload the page.", "error");
    return;
  }
  if (!rows.length) {
    showToast("Nothing to export.", "error");
    return;
  }
  const html = `
    <div style="font-size:16px;font-weight:700;margin-bottom:2px;">${escapeHtml(title)}</div>
    <div style="font-size:10.5px;color:#777;margin-bottom:12px;">Generated ${fmtDate(todayISO())}</div>
    <table style="width:100%;border-collapse:collapse;font-size:10.5px;">
      <thead>
        <tr>${headers.map(h => `<th style="border:1px solid #ccc;padding:6px 8px;background:#f4f0ee;text-align:left;white-space:nowrap;">${escapeHtml(h)}</th>`).join("")}</tr>
      </thead>
      <tbody>
        ${rows.map(r => `<tr>${r.map(c => `<td style="border:1px solid #ddd;padding:5px 8px;">${escapeHtml(c === null || c === undefined || c === "" ? "—" : String(c))}</td>`).join("")}</tr>`).join("")}
      </tbody>
    </table>
  `;
  showToast("Preparing PDF…");
  try {
    // Page-aware export (js/pdf-pages.js): header row on every page, rows never split.
    const blob = await buildPagedPdfBlob(html, {
      orientation: orientation || "landscape",
      sheetClass: "",
      baseStyle: "font-family:Arial,Helvetica,sans-serif;color:#111;",
      footerLeft: "SRIKRITHANYA PRIVATE LIMITED · " + title,
      contLabel: title + " — continued"
    });
    triggerBlobDownload(blob, filename);
    showToast("PDF downloaded.", "success");
  } catch (err) {
    console.error(err);
    showToast(err.message || "Couldn't generate the PDF.", "error");
  }
}


// ---------------- Terms & Conditions (shared by Invoice and BOQ/Quotation) ----------------
// prefix: "f" (invoice) or "b" (BOQ). getLastTerms: async fn returning last-used terms text (optional).
function setTermsState(prefix, enabled, text) {
  const field = document.getElementById(prefix + "_termsField");
  const btn = document.getElementById(prefix + "_termsToggleBtn");
  const ta = document.getElementById(prefix + "_termsText");
  if (text !== undefined) ta.value = text || "";
  field.style.display = enabled ? "" : "none";
  btn.dataset.enabled = enabled ? "1" : "";
  btn.textContent = enabled ? "✕ Remove Terms & Conditions" : "+ Add Terms & Conditions";
  btn.classList.toggle("active", !!enabled);
}

function isTermsEnabled(prefix) {
  return document.getElementById(prefix + "_termsToggleBtn").dataset.enabled === "1";
}

function getTermsData(prefix) {
  const enabled = isTermsEnabled(prefix);
  const text = document.getElementById(prefix + "_termsText").value.trim();
  return { termsEnabled: enabled && !!text, termsText: enabled ? text : "" };
}

function wireTermsToggle(prefix, getLastTerms) {
  const btn = document.getElementById(prefix + "_termsToggleBtn");
  const ta = document.getElementById(prefix + "_termsText");
  btn.addEventListener("click", async () => {
    if (isTermsEnabled(prefix)) { setTermsState(prefix, false); return; }
    setTermsState(prefix, true);
    if (!ta.value.trim() && typeof getLastTerms === "function") {
      try {
        const last = await getLastTerms();
        if (last && !ta.value.trim()) ta.value = last;
      } catch (err) { /* prefill is best-effort */ }
    }
    ta.focus();
  });
}

// Looks up the most recent saved doc in a collection that had terms (optionally matching a filter fn).
async function fetchLastTermsFrom(collectionName, matchFn) {
  const snap = await db.collection(collectionName).orderBy("createdAt", "desc").limit(30).get();
  for (const d of snap.docs) {
    const x = d.data();
    if (x.termsEnabled && x.termsText && (!matchFn || matchFn(x))) return x.termsText;
  }
  return "";
}

// ---------------- Discount (shared by Invoice and BOQ/Quotation) ----------------
/** Sub Total → less Discount % → Taxable Value. Percent is clamped to 0–100. */
function computeDiscount(subTotal, percentRaw) {
  let pct = Number(percentRaw) || 0;
  if (pct < 0) pct = 0;
  if (pct > 100) pct = 100;
  const discount = Math.round(subTotal * pct) / 100;   // rounded to paise
  return { subTotal, discountPercent: pct, discount, taxable: subTotal - discount };
}

/** Printed rows above "Taxable Value" — only when a discount was applied, so
 *  older invoices / quotations (no discount fields) print exactly as before. */
function renderDiscountPrintRowsHtml(data) {
  const amt = Number(data && data.discountAmount) || 0;
  if (amt <= 0) return "";
  const money = v => Number(v || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sub = data.subTotal != null ? data.subTotal : (Number(data.taxableValue) || 0) + amt;
  return `
      <tr><td class="lbl-cell">Sub Total</td><td class="val-cell">₹${money(sub)}</td></tr>
      <tr><td class="lbl-cell">Less: Discount @ ${Number(data.discountPercent) || 0}%</td><td class="val-cell">− ₹${money(amt)}</td></tr>`;
}

function renderTermsPrintHtml(data) {
  if (!data || !data.termsEnabled || !data.termsText || !String(data.termsText).trim()) return "";
  const lines = String(data.termsText).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  // Numbers are written out explicitly (not <ol> markers) — the PDF renderer
  // drops list markers, which is why the numbering vanished in laptop PDFs.
  const body = lines.length > 1
    ? lines.map((l, i) => `<div class="term-row"><span class="term-no">${i + 1}.</span><span class="term-text">${escapeHtml(l.replace(/^(\d+[.)]|[-•*])\s*/, ""))}</span></div>`).join("")
    : `<div>${escapeHtml(lines[0])}</div>`;
  return `<div class="terms-cell"><div class="terms-title">Terms &amp; Conditions</div>${body}</div>`;
}
