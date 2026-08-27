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
