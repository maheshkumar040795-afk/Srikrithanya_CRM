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
  const wrap = document.createElement("div");
  wrap.style.cssText = "padding:20px;font-family:Arial,Helvetica,sans-serif;background:#fff;";
  wrap.innerHTML = `
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
  document.body.appendChild(wrap);
  try {
    const blob = await html2pdf().set({
      margin: [10, 8, 10, 8],
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: "mm", format: "a4", orientation: orientation || "landscape" }
    }).from(wrap).outputPdf("blob");
    triggerBlobDownload(blob, filename);
    showToast("PDF downloaded.", "success");
  } catch (err) {
    console.error(err);
    showToast(err.message || "Couldn't generate the PDF.", "error");
  } finally {
    wrap.remove();
  }
}
