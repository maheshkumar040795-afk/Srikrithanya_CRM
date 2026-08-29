// ============================================================
// Srikrithanya CRM — Apps Script backend
// ------------------------------------------------------------
// Two features, one Web App deployment:
//   1. Client Documents  — uploads PDFs to a Drive folder (per client).
//   2. Supplier Prices   — reads/writes rows in a Google Sheet acting
//      as the shared supplier rate-comparison database.
// See README.md for full setup steps for both.
// ============================================================

// ---- Client Documents config ----
// 1. Create a folder in Google Drive (e.g. "Srikrithanya CRM Documents"),
//    open it, and copy the ID from the URL:
//    https://drive.google.com/drive/folders/PASTE_THIS_PART
var ROOT_FOLDER_ID = "1dayDgScN6FzVvz1VR1AG8cchA8Q94yfd";

// ---- Supplier Prices config ----
// 1. Create a blank Google Sheet (e.g. "Srikrithanya Supplier Prices"),
//    open it, and copy the ID from the URL:
//    https://docs.google.com/spreadsheets/d/PASTE_THIS_PART/edit
// 2. Paste that ID below, save this script, then run seedSupplierPrices()
//    ONCE from the Apps Script editor (see README.md) to load in the
//    prices read from your uploaded QUOTATION_COMPANIES_DETAILS.xlsx.
var SUPPLIER_SHEET_ID = "1Iq9TeKlOWgQ-VNXNz6sPNkCNSqMqnHJEmQEeLW7vzCI";
var SUPPLIER_SHEET_NAME = "SupplierPrices";
var SUPPLIER_HEADERS = ["ID", "Category", "Item", "Unit", "Company", "Make", "Rate", "UpdatedAt", "UpdatedBy"];

// ---- Shared secret (used by BOTH features) ----
// 2. Make up a long random password-like string and paste it here.
//    Paste the EXACT same string into js/appscript-config.js in the
//    CRM as APPSCRIPT_SHARED_SECRET. This stops anyone who finds your
//    Web App URL from using it without the secret.
var SHARED_SECRET = "azNturXYPJLa2CEUSDdP96G4VZxP7wc2xNnMMmPBhoo";

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.secret !== SHARED_SECRET) {
      return jsonOut({ success: false, error: "Unauthorized" });
    }
    if (body.action === "upload") return handleUpload(body);
    if (body.action === "delete") return handleDelete(body);
    if (body.action === "supplierList") return handleSupplierList();
    if (body.action === "supplierSave") return handleSupplierSave(body);
    if (body.action === "supplierDelete") return handleSupplierDelete(body);
    return jsonOut({ success: false, error: "Unknown action: " + body.action });
  } catch (err) {
    return jsonOut({ success: false, error: err.message });
  }
}

function doGet(e) {
  return jsonOut({ status: "Srikrithanya CRM Apps Script backend is running." });
}

// ============================================================
// Client Documents
// ============================================================

/** One subfolder per client inside the root folder, so Drive stays organized
 *  the same way the CRM organizes clients. Reuses the folder if it already exists. */
function getClientFolder(clientName) {
  var root = DriveApp.getFolderById(ROOT_FOLDER_ID);
  var name = (clientName || "Unknown Client").substring(0, 120);
  var existing = root.getFoldersByName(name);
  if (existing.hasNext()) return existing.next();
  return root.createFolder(name);
}

function handleUpload(body) {
  var folder = getClientFolder(body.clientName);
  var bytes = Utilities.base64Decode(body.base64Data);
  var blob = Utilities.newBlob(bytes, body.mimeType || "application/pdf", body.fileName || "document.pdf");
  var file = folder.createFile(blob);
  // "Anyone with the link can view" — needed so the CRM's preview iframe and
  // download links work for every signed-in staff member, not just you.
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return jsonOut({
    success: true,
    fileId: file.getId(),
    viewUrl: "https://drive.google.com/file/d/" + file.getId() + "/preview",
    downloadUrl: "https://drive.google.com/uc?export=download&id=" + file.getId(),
    sizeBytes: file.getSize()
  });
}

function handleDelete(body) {
  var file = DriveApp.getFileById(body.fileId);
  file.setTrashed(true);
  return jsonOut({ success: true });
}

// ============================================================
// Supplier Prices
// ============================================================

function getSupplierSheet() {
  var ss = SpreadsheetApp.openById(SUPPLIER_SHEET_ID);
  var sheet = ss.getSheetByName(SUPPLIER_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SUPPLIER_SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(SUPPLIER_HEADERS);
  }
  return sheet;
}

function supplierColIndex(headers, name) {
  return headers.indexOf(name);
}

function handleSupplierList() {
  var sheet = getSupplierSheet();
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var rows = [];
  for (var i = 1; i < data.length; i++) {
    if (!data[i][supplierColIndex(headers, "ID")]) continue; // skip blank rows
    var obj = {};
    for (var c = 0; c < headers.length; c++) {
      var key = headers[c];
      var val = data[i][c];
      if (key === "UpdatedAt" && val instanceof Date) val = val.toISOString();
      obj[key] = val;
    }
    rows.push(obj);
  }
  return jsonOut({ success: true, rows: rows });
}

/** Upserts a price row. If body.id is given, that exact row is updated.
 *  Otherwise, Category+Item+Company is matched (case-insensitive) — this is
 *  what makes "an existing company revises their price for an existing item"
 *  just work from the CRM's Add/Update form without the user needing to find
 *  and open that exact row first. No match on either → a brand-new row is
 *  appended (covers a new item, or a new company quoting an existing item). */
function handleSupplierSave(body) {
  var sheet = getSupplierSheet();
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var idIdx = supplierColIndex(headers, "ID");
  var catIdx = supplierColIndex(headers, "Category");
  var itemIdx = supplierColIndex(headers, "Item");
  var unitIdx = supplierColIndex(headers, "Unit");
  var companyIdx = supplierColIndex(headers, "Company");
  var makeIdx = supplierColIndex(headers, "Make");
  var rateIdx = supplierColIndex(headers, "Rate");
  var updatedAtIdx = supplierColIndex(headers, "UpdatedAt");
  var updatedByIdx = supplierColIndex(headers, "UpdatedBy");

  var targetRow = -1; // 1-indexed sheet row number
  if (body.id) {
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][idIdx]) === String(body.id)) { targetRow = i + 1; break; }
    }
  }
  if (targetRow === -1) {
    for (var j = 1; j < data.length; j++) {
      if (String(data[j][catIdx]).trim().toLowerCase() === String(body.category || "").trim().toLowerCase() &&
          String(data[j][itemIdx]).trim().toLowerCase() === String(body.item || "").trim().toLowerCase() &&
          String(data[j][companyIdx]).trim().toLowerCase() === String(body.company || "").trim().toLowerCase()) {
        targetRow = j + 1;
        break;
      }
    }
  }

  var now = new Date();
  if (targetRow > -1) {
    sheet.getRange(targetRow, unitIdx + 1).setValue(body.unit || "");
    sheet.getRange(targetRow, makeIdx + 1).setValue(body.make || "");
    sheet.getRange(targetRow, rateIdx + 1).setValue(Number(body.rate));
    sheet.getRange(targetRow, updatedAtIdx + 1).setValue(now);
    sheet.getRange(targetRow, updatedByIdx + 1).setValue(body.updatedBy || "");
    return jsonOut({ success: true, id: data[targetRow - 1][idIdx], updated: true });
  }

  var newId = Utilities.getUuid();
  var row = new Array(headers.length);
  row[idIdx] = newId;
  row[catIdx] = body.category || "";
  row[itemIdx] = body.item || "";
  row[unitIdx] = body.unit || "";
  row[companyIdx] = body.company || "";
  row[makeIdx] = body.make || "";
  row[rateIdx] = Number(body.rate);
  row[updatedAtIdx] = now;
  row[updatedByIdx] = body.updatedBy || "";
  sheet.appendRow(row);
  return jsonOut({ success: true, id: newId, updated: false });
}

function handleSupplierDelete(body) {
  var sheet = getSupplierSheet();
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var idIdx = supplierColIndex(headers, "ID");
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][idIdx]) === String(body.id)) {
      sheet.deleteRow(i + 1);
      return jsonOut({ success: true });
    }
  }
  return jsonOut({ success: false, error: "Row not found (already deleted?)." });
}

/** ONE-TIME SETUP: run this once from the Apps Script editor (select
 *  seedSupplierPrices in the function dropdown, then Run) after you've set
 *  SUPPLIER_SHEET_ID above. It loads in every price read from all 4 sheets
 *  of your uploaded QUOTATION_COMPANIES_DETAILS.xlsx (MS Pipe, Sprinkler,
 *  Butterfly Valve, Fire Fighting — 33 rows total) so the CRM has data to
 *  show immediately. Safe to run only once — running it again would add
 *  duplicate rows, since it always appends. */
function seedSupplierPrices() {
  var sheet = getSupplierSheet();
  // Clear out anything below the header row first, so re-running this
  // intentionally (e.g. after fixing SUPPLIER_SHEET_ID) doesn't duplicate rows.
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
  }
  var seedRows = [
    ['MS Pipe', '200mm nominal dia  (hydrant & sprinkler)', 'Mtrs', 'RAJ PIPE INDUSTRIES', 'C class Jindal', 2101.0],
    ['MS Pipe', '150mm nominal dia  (hydrant & sprinkler)', 'Mtrs', 'RAJ PIPE INDUSTRIES', 'C class Jindal', 1316.0],
    ['MS Pipe', '100mm nominal dia', 'Mtrs', 'RAJ PIPE INDUSTRIES', 'C class Jindal', 905.0],
    ['MS Pipe', '80mm nominal dia', 'Mtrs', 'RAJ PIPE INDUSTRIES', 'C class Jindal', 432.0],
    ['MS Pipe', '200mm nominal dia  (hydrant & sprinkler)', 'Mtrs', 'Kinglax Fire Safety And Fire Equipments', 'C class heavy Jindal', 2995.0],
    ['MS Pipe', '150mm nominal dia  (hydrant & sprinkler)', 'Mtrs', 'Kinglax Fire Safety And Fire Equipments', 'C class heavy Jindal', 1995.0],
    ['MS Pipe', '100mm nominal dia', 'Mtrs', 'Kinglax Fire Safety And Fire Equipments', 'C class heavy Jindal', 1295.0],
    ['MS Pipe', '80mm nominal dia', 'Mtrs', 'Kinglax Fire Safety And Fire Equipments', 'C class heavy Jindal', 895.0],
    ['MS Pipe', '200mm nominal dia  (hydrant & sprinkler)', 'Mtrs', 'Everest Steel Tubes', 'C class Jindal', 2215.0],
    ['MS Pipe', '150mm nominal dia  (hydrant & sprinkler)', 'Mtrs', 'Everest Steel Tubes', 'C class Jindal', 1335.0],
    ['MS Pipe', '100mm nominal dia', 'Mtrs', 'Everest Steel Tubes', 'C class Jindal', 911.0],
    ['MS Pipe', '80mm nominal dia', 'Mtrs', 'Everest Steel Tubes', 'C class Jindal', 625.0],
    ['MS Pipe', '200mm nominal dia  (hydrant & sprinkler)', 'Mtrs', 'Aura Safety And Fire Equipments', 'C class heavy Jindal', 2840.0],
    ['MS Pipe', '150mm nominal dia  (hydrant & sprinkler)', 'Mtrs', 'Aura Safety And Fire Equipments', 'C class heavy Jindal', 2550.0],
    ['MS Pipe', '100mm nominal dia', 'Mtrs', 'Aura Safety And Fire Equipments', 'C class heavy Jindal', 2160.0],
    ['MS Pipe', '80mm nominal dia', 'Mtrs', 'Aura Safety And Fire Equipments', 'C class heavy Jindal', 1820.0],
    ['Sprinkler', '150mm nominal dia', 'No', 'Global Fire Solution', '', 4600.0],
    ['Sprinkler', '100mm nominal dia', 'No', 'Global Fire Solution', '', 1500.0],
    ['Sprinkler', '80mm nominal dia', 'No', 'Global Fire Solution', '', 420.83],
    ['Sprinkler', '150dia', 'Nos', 'Global Fire Solution', '', 3175.0],
    ['Sprinkler', 'Hose reel drum of  swinging type with 19mm  dia thermo  plastic braided  hose of 30M. length with Gate valve (upstream) and Shut off Nozzle, complete.', 'No', 'Global Fire Solution', 'Newage', 1587.5],
    ['Butterfly Valve', '150mm nominal dia', 'No', 'Meena Fire Safety', 'Normex', 4800.0],
    ['Butterfly Valve', '100mm nominal dia', 'No', 'Meena Fire Safety', 'Normex', 3100.0],
    ['Butterfly Valve', '80mm nominal dia', 'Mtr', 'Meena Fire Safety', 'Normex', 2300.0],
    ['Butterfly Valve', '150mm nominal dia', 'Nos', 'Hindustan Hydraulics& Pneumatics', 'Normex', 6100.0],
    ['Butterfly Valve', '100mm nominal dia', 'Nos', 'Hindustan Hydraulics& Pneumatics', 'Normex', 5350.0],
    ['Butterfly Valve', '80mm nominal dia', 'Nos', 'Hindustan Hydraulics& Pneumatics', 'Normex', 2850.0],
    ['Fire Fighting', 'Single headed SS hydrant valve as per IS: 5290 (Type A). The valves should be complete with hand wheels, quick coupling connections, springs and blank caps.', 'No', 'Reactra Engineering Pvt Ltd', 'NEWAGE', 4600.0],
    ['Fire Fighting', '2 lengths of 15 M long, 63mm dia RRL hose with couplings and Hoses shall be rolled & hung to suitable M.S. structural support fixed inside the Fire duct wall. RRL', 'No', 'Reactra Engineering Pvt Ltd', 'NEWAGE', 3800.0],
    ['Fire Fighting', '1 no. SS branch pipe with nozzle, As per IS: 903', 'No', 'Reactra Engineering Pvt Ltd', 'NEWAGE', 1600.0],
    ['Fire Fighting', 'M.S. cabinet - 18 Gauge with powder coated finish of 750mm x 600mm x 250mm in size and mounted on structural support.', 'No', 'Reactra Engineering Pvt Ltd', 'FABRICATED', 3900.0],
    ['Fire Fighting', '150dia', 'Nos', 'Reactra Engineering Pvt Ltd', 'TYCO', 58500.0],
    ['Fire Fighting', 'Hose reel drum of swinging type with 19mm dia thermo plastic braided hose of 30M length with Gate valve (upstream) and Shut off Nozzle, complete.', 'No', 'Reactra Engineering Pvt Ltd', 'NEWAGE', 6000.0]
  ];
  var now = new Date();
  seedRows.forEach(function (r) {
    sheet.appendRow([Utilities.getUuid(), r[0], r[1], r[2], r[3], r[4], r[5], now, "seed-import"]);
  });
  Logger.log("Seeded " + seedRows.length + " supplier price rows.");
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
