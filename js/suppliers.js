// ============================================================
// Suppliers — a price comparison list sourced from a Google Sheet
// (not Firestore) via the same Apps Script Web App used for Client
// Documents. Search an item (e.g. "150mm nominal dia") to see every
// company's quoted price side by side. Adding a price for a
// Category+Item+Company that already exists revises that row
// instead of creating a duplicate — so new items, new company
// quotes on existing items, and price revisions all go through one
// form on the CRM side; the Apps Script decides which it is.
// ============================================================

let supplierPricesCache = [];
let editingSupplierId = null;

function isSupplierBackendConfigured() {
  return typeof APPSCRIPT_WEB_APP_URL !== "undefined" && APPSCRIPT_WEB_APP_URL && APPSCRIPT_WEB_APP_URL !== "REPLACE_ME" &&
    typeof APPSCRIPT_SHARED_SECRET !== "undefined" && APPSCRIPT_SHARED_SECRET && APPSCRIPT_SHARED_SECRET !== "REPLACE_ME";
}

async function callAppsScript(payload) {
  const resp = await fetch(APPSCRIPT_WEB_APP_URL, {
    method: "POST",
    // text/plain avoids a CORS preflight Apps Script Web Apps don't handle —
    // the Apps Script side parses e.postData.contents as JSON itself.
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(Object.assign({ secret: APPSCRIPT_SHARED_SECRET }, payload))
  });
  const rawText = await resp.text();
  let result;
  try {
    result = JSON.parse(rawText);
  } catch (parseErr) {
    throw new Error("The Apps Script Web App didn't return a valid response (got a sign-in or error page instead of JSON). Check the deployment access is \"Anyone\" and the Web App URL in js/appscript-config.js is correct.");
  }
  return result;
}

// ---------------- Load ----------------

async function loadSupplierPrices() {
  const body = document.getElementById("supplierPricesBody");
  const empty = document.getElementById("supplierPricesEmpty");

  if (!isSupplierBackendConfigured()) {
    body.innerHTML = "";
    empty.style.display = "block";
    empty.querySelector("div").textContent = "Suppliers isn't set up yet — add your Apps Script Web App URL and secret to js/appscript-config.js (see README.md).";
    return;
  }

  try {
    const result = await callAppsScript({ action: "supplierList" });
    if (!result.success) throw new Error(result.error || "Couldn't load supplier prices.");
    supplierPricesCache = result.rows || [];
  } catch (err) {
    console.error(err);
    body.innerHTML = "";
    empty.style.display = "block";
    empty.querySelector("div").textContent = err.message || "Couldn't load supplier prices.";
    return;
  }

  empty.querySelector("div").textContent = "No supplier prices yet. Add one above.";
  populateSupplierDatalists();
  applySupplierFilters();
}

function populateSupplierDatalists() {
  const categories = Array.from(new Set(supplierPricesCache.map(r => r.Category).filter(Boolean))).sort();
  const items = Array.from(new Set(supplierPricesCache.map(r => r.Item).filter(Boolean)));
  const companies = Array.from(new Set(supplierPricesCache.map(r => r.Company).filter(Boolean))).sort();
  document.getElementById("supplierCategoryDatalist").innerHTML = categories.map(c => `<option value="${escapeHtml(c)}"></option>`).join("");
  document.getElementById("supplierItemDatalist").innerHTML = items.map(i => `<option value="${escapeHtml(i)}"></option>`).join("");
  document.getElementById("supplierCompanyDatalist").innerHTML = companies.map(c => `<option value="${escapeHtml(c)}"></option>`).join("");

  // Filter dropdowns — rebuilt from the same data, keeping whatever was already selected if it still exists.
  const catSelect = document.getElementById("supplierFilterCategory");
  const compSelect = document.getElementById("supplierFilterCompany");
  const prevCat = catSelect.value;
  const prevComp = compSelect.value;
  catSelect.innerHTML = '<option value="">All Categories</option>' + categories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  compSelect.innerHTML = '<option value="">All Companies</option>' + companies.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  if (categories.includes(prevCat)) catSelect.value = prevCat;
  if (companies.includes(prevComp)) compSelect.value = prevComp;
}

// ---------------- Search ----------------
// Matches on a plain substring first (covers company/category/exact-phrase
// searches). Falls back to "same leading number, and both mention 'dia' if
// the search does" so differently-phrased sizes still match — e.g. searching
// "150mm nominal dia" also finds an item saved as just "150dia".
function matchesSupplierSearch(row, q) {
  if (!q) return true;
  const hay = `${row.Category || ""} ${row.Item || ""} ${row.Company || ""} ${row.Make || ""}`.toString().toLowerCase();
  const qLower = q.toLowerCase().trim();
  if (hay.includes(qLower)) return true;
  const qNum = (qLower.match(/\d+/) || [])[0];
  if (qNum && hay.includes(qNum)) {
    if (qLower.includes("dia")) return hay.includes("dia");
    return true;
  }
  return false;
}

// Combines the free-text search with the Category and Company dropdown filters (all AND'd together),
// so you can e.g. pick "MS Pipe" to compare just that category, or add a company on top of that.
function filterSupplierPrices(q) {
  const category = document.getElementById("supplierFilterCategory").value;
  const company = document.getElementById("supplierFilterCompany").value;
  return supplierPricesCache.filter(r => {
    if (category && r.Category !== category) return false;
    if (company && r.Company !== company) return false;
    return matchesSupplierSearch(r, q);
  });
}

function applySupplierFilters() {
  const search = document.getElementById("supplierSearch");
  renderSupplierPricesTable(filterSupplierPrices(search ? search.value.trim() : ""));
}

function wireSupplierSearch() {
  document.getElementById("supplierSearch").addEventListener("input", applySupplierFilters);
  document.getElementById("supplierFilterCategory").addEventListener("change", applySupplierFilters);
  document.getElementById("supplierFilterCompany").addEventListener("change", applySupplierFilters);
}

// ---------------- Table ----------------

function renderSupplierPricesTable(list) {
  const body = document.getElementById("supplierPricesBody");
  const empty = document.getElementById("supplierPricesEmpty");
  body.innerHTML = "";
  if (!list.length) {
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  // Lowest rate per Category+Item group, so the cheapest quote for each item stands out.
  const minByGroup = {};
  list.forEach(r => {
    const key = `${String(r.Category || "").toLowerCase()}|${String(r.Item || "").toLowerCase()}`;
    const rate = Number(r.Rate) || 0;
    if (!(key in minByGroup) || rate < minByGroup[key]) minByGroup[key] = rate;
  });

  const sorted = [...list].sort((a, b) => String(a.Item || "").localeCompare(String(b.Item || "")) || (Number(a.Rate) || 0) - (Number(b.Rate) || 0));

  sorted.forEach(r => {
    const key = `${String(r.Category || "").toLowerCase()}|${String(r.Item || "").toLowerCase()}`;
    const isLowest = (Number(r.Rate) || 0) === minByGroup[key];
    const updated = r.UpdatedAt ? new Date(r.UpdatedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(r.Category || "—")}</td>
      <td>${escapeHtml(r.Item || "—")}</td>
      <td>${escapeHtml(r.Company || "—")}</td>
      <td>${escapeHtml(r.Make || "—")}</td>
      <td>${escapeHtml(r.Unit || "—")}</td>
      <td class="${isLowest ? "amt-income" : ""}">${isLowest ? "✓ " : ""}${fmtMoney(r.Rate)}</td>
      <td>${updated}</td>
      <td>
        <div class="row-actions">
          <button class="icon-btn" data-action="edit" title="Edit">✎</button>
          <button class="icon-btn" data-action="delete" title="Delete">🗑</button>
        </div>
      </td>
    `;
    tr.querySelectorAll("[data-action]").forEach(btn => {
      btn.addEventListener("click", () => handleSupplierPriceAction(btn.getAttribute("data-action"), r));
    });
    body.appendChild(tr);
  });
}

function handleSupplierPriceAction(action, row) {
  if (action === "edit") { loadSupplierPriceIntoForm(row); return; }
  if (action === "delete") { deleteSupplierPrice(row); }
}

// ---------------- Form ----------------

function resetSupplierPriceForm() {
  editingSupplierId = null;
  ["sp_category", "sp_item", "sp_company", "sp_make", "sp_unit", "sp_rate"].forEach(id => {
    document.getElementById(id).value = "";
  });
  document.getElementById("supplierFormTitle").textContent = "Add / update a price";
  document.getElementById("saveSupplierPriceBtn").textContent = "Save Price";
  document.getElementById("cancelSupplierEditBtn").style.display = "none";
  document.getElementById("supplierFormHint").style.display = "none";
}

function loadSupplierPriceIntoForm(row) {
  editingSupplierId = row.ID;
  document.getElementById("sp_category").value = row.Category || "";
  document.getElementById("sp_item").value = row.Item || "";
  document.getElementById("sp_company").value = row.Company || "";
  document.getElementById("sp_make").value = row.Make || "";
  document.getElementById("sp_unit").value = row.Unit || "";
  document.getElementById("sp_rate").value = row.Rate != null ? row.Rate : "";
  document.getElementById("supplierFormTitle").textContent = `Editing ${row.Company} — ${row.Item}`;
  document.getElementById("saveSupplierPriceBtn").textContent = "Update Price";
  document.getElementById("cancelSupplierEditBtn").style.display = "inline-flex";
  document.getElementById("supplierFormTitle").scrollIntoView({ behavior: "smooth", block: "center" });
}

async function saveSupplierPrice() {
  const category = document.getElementById("sp_category").value.trim();
  const item = document.getElementById("sp_item").value.trim();
  const company = document.getElementById("sp_company").value.trim();
  const make = document.getElementById("sp_make").value.trim();
  const unit = document.getElementById("sp_unit").value.trim();
  const rate = Number(document.getElementById("sp_rate").value);

  const hint = document.getElementById("supplierFormHint");

  if (!isSupplierBackendConfigured()) {
    showToast("Suppliers isn't set up yet — see README.md → \"Supplier Prices via Google Sheets\".", "error");
    return;
  }
  if (!category) { showToast("Category is required.", "error"); return; }
  if (!item) { showToast("Item description is required.", "error"); return; }
  if (!company) { showToast("Company is required.", "error"); return; }
  if (!rate || rate <= 0) { showToast("Enter a rate greater than 0.", "error"); return; }

  const btn = document.getElementById("saveSupplierPriceBtn");
  const original = btn.textContent;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';
  hint.style.display = "none";

  try {
    const user = auth.currentUser;
    const result = await callAppsScript({
      action: "supplierSave",
      id: editingSupplierId || undefined,
      category, item, company, make, unit, rate,
      updatedBy: user ? user.email : null
    });
    if (!result.success) throw new Error(result.error || "Couldn't save that price.");
    showToast(result.updated ? "Price updated." : "New price added.", "success");
    resetSupplierPriceForm();
    await loadSupplierPrices();
  } catch (err) {
    console.error(err);
    hint.style.display = "block";
    hint.textContent = `Save failed: ${err.message || "Unknown error"}`;
    showToast(err.message || "Couldn't save that price.", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

async function deleteSupplierPrice(row) {
  if (!confirm(`Delete ${row.Company}'s price for "${row.Item}"? This can't be undone.`)) return;
  try {
    const result = await callAppsScript({ action: "supplierDelete", id: row.ID });
    if (!result.success) throw new Error(result.error || "Couldn't delete that row.");
    showToast("Price deleted.", "success");
    await loadSupplierPrices();
  } catch (err) {
    console.error(err);
    showToast(err.message || "Couldn't delete that row.", "error");
  }
}
