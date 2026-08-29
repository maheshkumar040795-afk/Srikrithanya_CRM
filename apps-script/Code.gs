// ============================================================
// Srikrithanya CRM — Client Documents uploader
// ------------------------------------------------------------
// Deploy this as a Web App (see README.md → "Client Documents via
// Google Drive" for step-by-step instructions). It receives a PDF
// as base64 from the CRM, saves it into a per-client subfolder
// inside one Drive folder you choose, and returns shareable links.
// It also handles deleting a file when removed from the CRM.
// ============================================================

// 1. Create a folder in Google Drive (e.g. "Srikrithanya CRM Documents"),
//    open it, and copy the ID from the URL:
//    https://drive.google.com/drive/folders/PASTE_THIS_PART
var ROOT_FOLDER_ID = "1dayDgScN6FzVvz1VR1AG8cchA8Q94yfd";

// 2. Make up a long random password-like string and paste it here.
//    Paste the EXACT same string into js/appscript-config.js in the
//    CRM as APPSCRIPT_SHARED_SECRET. This stops anyone who finds your
//    Web App URL from uploading/deleting files without the secret.
var SHARED_SECRET = "azNturXYPJLa2CEUSDdP96G4VZxP7wc2xNnMMmPBhoo";

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.secret !== SHARED_SECRET) {
      return jsonOut({ success: false, error: "Unauthorized" });
    }
    if (body.action === "upload") return handleUpload(body);
    if (body.action === "delete") return handleDelete(body);
    return jsonOut({ success: false, error: "Unknown action: " + body.action });
  } catch (err) {
    return jsonOut({ success: false, error: err.message });
  }
}

function doGet(e) {
  return jsonOut({ status: "Srikrithanya CRM document uploader is running." });
}

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

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
