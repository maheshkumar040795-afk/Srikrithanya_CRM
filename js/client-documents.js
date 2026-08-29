// ============================================================
// Client Documents — each client can have PDFs attached (signed
// agreements, PO copies, etc). Files are NOT stored in Firestore
// (too big) — they're uploaded to a Google Drive folder through a
// small Apps Script Web App (see README.md), and only the file's
// name + Drive links are saved in Firestore under "clientDocuments".
// ============================================================

const CLIENT_DOC_MAX_BYTES = 8 * 1024 * 1024; // 8MB — keeps the base64 upload comfortably under Apps Script's limits

let currentDocClientId = null;
let currentDocClientName = "";
let clientDocumentsCache = [];

function isAppScriptConfigured() {
  return APPSCRIPT_WEB_APP_URL && APPSCRIPT_WEB_APP_URL !== "REPLACE_ME" &&
    APPSCRIPT_SHARED_SECRET && APPSCRIPT_SHARED_SECRET !== "REPLACE_ME";
}

// ---------------- Open ----------------

async function openClientDocuments(client) {
  currentDocClientId = client.id;
  currentDocClientName = client.name || "";
  document.getElementById("clientDocumentsModalTitle").textContent = `Documents — ${currentDocClientName}`;
  document.getElementById("cdoc_name").value = "";
  document.getElementById("cdoc_file").value = "";
  document.getElementById("cdocUploadHint").style.display = "none";
  document.getElementById("clientDocumentsModal").classList.add("open");

  if (!isAppScriptConfigured()) {
    const hint = document.getElementById("cdocUploadHint");
    hint.style.display = "block";
    hint.textContent = "Document upload isn't set up yet — add your Apps Script Web App URL and secret to js/appscript-config.js (see README.md).";
  }

  await loadClientDocuments();
}

// ---------------- Load ----------------

async function loadClientDocuments() {
  const body = document.getElementById("clientDocumentsBody");
  const empty = document.getElementById("clientDocumentsEmpty");
  try {
    const snap = await db.collection("clientDocuments").where("clientId", "==", currentDocClientId).get();
    clientDocumentsCache = snap.docs.map(doc => Object.assign({ id: doc.id }, doc.data()));
    clientDocumentsCache.sort((a, b) => {
      const at = a.uploadedAt && a.uploadedAt.seconds ? a.uploadedAt.seconds : 0;
      const bt = b.uploadedAt && b.uploadedAt.seconds ? b.uploadedAt.seconds : 0;
      return bt - at;
    });
  } catch (err) {
    console.error(err);
    body.innerHTML = "";
    empty.style.display = "block";
    empty.querySelector("div").textContent = friendlyFirestoreError(err, "load documents");
    return;
  }
  empty.querySelector("div").textContent = "No documents uploaded yet for this client.";
  renderClientDocumentsTable(clientDocumentsCache);
}

function renderClientDocumentsTable(list) {
  const body = document.getElementById("clientDocumentsBody");
  const empty = document.getElementById("clientDocumentsEmpty");
  body.innerHTML = "";
  if (!list.length) {
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";
  list.forEach(d => {
    const uploadedDate = d.uploadedAt && d.uploadedAt.seconds
      ? new Date(d.uploadedAt.seconds * 1000).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
      : "—";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${escapeHtml(d.name)}</strong></td>
      <td>${escapeHtml(d.fileName || "—")}</td>
      <td>${uploadedDate}</td>
      <td>
        <div class="row-actions">
          <button class="icon-btn" data-action="preview" title="Preview">👁</button>
          <button class="icon-btn" data-action="download" title="Download">⬇</button>
          <button class="icon-btn" data-action="delete" title="Delete">🗑</button>
        </div>
      </td>
    `;
    tr.querySelectorAll("[data-action]").forEach(btn => {
      btn.addEventListener("click", () => handleClientDocumentAction(btn.getAttribute("data-action"), d));
    });
    body.appendChild(tr);
  });
}

function handleClientDocumentAction(action, doc) {
  if (action === "preview") {
    document.getElementById("documentPreviewModalTitle").textContent = doc.name || "Preview";
    document.getElementById("documentPreviewFrame").src = doc.viewUrl || "";
    document.getElementById("documentPreviewModal").classList.add("open");
    return;
  }
  if (action === "download") {
    window.open(doc.downloadUrl || doc.viewUrl, "_blank", "noopener");
    return;
  }
  if (action === "delete") {
    deleteClientDocument(doc);
  }
}

// ---------------- Upload ----------------

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Couldn't read that file."));
    reader.onload = () => {
      // reader.result is "data:application/pdf;base64,XXXX" — Apps Script only needs the part after the comma.
      resolve(reader.result.split(",")[1]);
    };
    reader.readAsDataURL(file);
  });
}

async function uploadClientDocument() {
  const name = document.getElementById("cdoc_name").value.trim();
  const fileInput = document.getElementById("cdoc_file");
  const file = fileInput.files && fileInput.files[0];
  const hint = document.getElementById("cdocUploadHint");

  if (!isAppScriptConfigured()) {
    showToast("Document upload isn't set up yet — see README.md → \"Client Documents via Google Drive\".", "error");
    return;
  }
  if (!name) { showToast("Give the document a name.", "error"); return; }
  if (!file) { showToast("Choose a PDF to upload.", "error"); return; }
  if (file.type !== "application/pdf") { showToast("Only PDF files are supported right now.", "error"); return; }
  if (file.size > CLIENT_DOC_MAX_BYTES) { showToast("That file is over 8MB — please upload a smaller PDF.", "error"); return; }

  const btn = document.getElementById("uploadClientDocumentBtn");
  const original = btn.textContent;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';
  hint.style.display = "block";
  hint.textContent = "Uploading to Google Drive — this can take a few seconds for larger files…";

  try {
    const base64Data = await readFileAsBase64(file);
    const resp = await fetch(APPSCRIPT_WEB_APP_URL, {
      method: "POST",
      // text/plain avoids a CORS preflight that Apps Script Web Apps don't handle —
      // the Apps Script side parses e.postData.contents as JSON itself.
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "upload",
        secret: APPSCRIPT_SHARED_SECRET,
        clientName: currentDocClientName,
        fileName: file.name,
        mimeType: file.type,
        base64Data
      })
    });
    const result = await resp.json();
    if (!result.success) throw new Error(result.error || "Upload failed.");

    const user = auth.currentUser;
    await db.collection("clientDocuments").add({
      clientId: currentDocClientId,
      clientName: currentDocClientName,
      name,
      fileName: file.name,
      driveFileId: result.fileId,
      viewUrl: result.viewUrl,
      downloadUrl: result.downloadUrl,
      sizeBytes: result.sizeBytes || file.size,
      uploadedAt: firebase.firestore.FieldValue.serverTimestamp(),
      uploadedBy: user ? user.email : null
    });

    showToast("Document uploaded.", "success");
    document.getElementById("cdoc_name").value = "";
    document.getElementById("cdoc_file").value = "";
    hint.style.display = "none";
    await loadClientDocuments();
  } catch (err) {
    console.error(err);
    hint.style.display = "block";
    hint.textContent = "Upload failed — check your internet connection and that the Apps Script Web App is deployed and reachable.";
    showToast(err.message || "Couldn't upload that document.", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

// ---------------- Delete ----------------

async function deleteClientDocument(doc) {
  if (!confirm(`Delete "${doc.name}"? This removes it from Google Drive too and can't be undone.`)) return;
  try {
    if (isAppScriptConfigured() && doc.driveFileId) {
      const resp = await fetch(APPSCRIPT_WEB_APP_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: "delete", secret: APPSCRIPT_SHARED_SECRET, fileId: doc.driveFileId })
      });
      const result = await resp.json();
      if (!result.success) throw new Error(result.error || "Couldn't delete the file from Drive.");
    }
    await db.collection("clientDocuments").doc(doc.id).delete();
    showToast("Document deleted.", "success");
    await loadClientDocuments();
  } catch (err) {
    console.error(err);
    showToast(err.message || "Couldn't delete that document.", "error");
  }
}
