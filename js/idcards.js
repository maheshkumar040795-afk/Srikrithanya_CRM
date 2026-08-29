// ============================================================
// ID Cards — upload a photo (auto-compressed to passport size),
// fill in employee details, and generate a printable ID card with
// the company logo and the Director's signature. Any signed-in
// staff member can use this (not admin-only).
// ============================================================

let idCardsCache = [];
let editingIdCardId = null;
let currentPhotoDataUrl = null; // compressed passport-ratio JPEG for the card currently on screen

const PASSPORT_PHOTO_W = 350;
const PASSPORT_PHOTO_H = 450; // 35mm x 45mm passport-photo ratio, at print-quality resolution

/** Reads an uploaded image file, center-crops it to the passport-photo aspect ratio, and
 *  re-encodes it as a compressed JPEG data URL. This is what gets shown in the card
 *  preview AND what's stored — keeping it small keeps the Firestore document small too. */
function compressToPassportPhoto(file) {
  return new Promise((resolve, reject) => {
    if (!file.type || !file.type.startsWith("image/")) {
      reject(new Error("Please choose an image file."));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Couldn't read that file."));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error("That doesn't look like a valid image."));
      img.onload = () => {
        const targetRatio = PASSPORT_PHOTO_W / PASSPORT_PHOTO_H;
        const srcRatio = img.width / img.height;
        let sx, sy, sw, sh;
        if (srcRatio > targetRatio) { sh = img.height; sw = sh * targetRatio; sx = (img.width - sw) / 2; sy = 0; }
        else { sw = img.width; sh = sw / targetRatio; sx = 0; sy = (img.height - sh) / 2; }
        const canvas = document.createElement("canvas");
        canvas.width = PASSPORT_PHOTO_W;
        canvas.height = PASSPORT_PHOTO_H;
        canvas.getContext("2d").drawImage(img, sx, sy, sw, sh, 0, 0, PASSPORT_PHOTO_W, PASSPORT_PHOTO_H);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function setCardPhoto(dataUrl) {
  currentPhotoDataUrl = dataUrl || null;
  const frame = document.getElementById("idCardPhotoFrame");
  frame.innerHTML = dataUrl
    ? `<img src="${dataUrl}" alt="" />`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
  const box = document.getElementById("photoUploadBox");
  const label = document.getElementById("photoUploadLabel");
  box.classList.toggle("has-photo", !!dataUrl);
  label.textContent = dataUrl ? "Photo uploaded — click to change" : "Click to upload photo";
}

function wirePhotoUpload() {
  const input = document.getElementById("i_photoInput");
  const box = document.getElementById("photoUploadBox");
  box.addEventListener("click", () => input.click());
  input.addEventListener("change", async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    const label = document.getElementById("photoUploadLabel");
    label.textContent = "Compressing…";
    try {
      const dataUrl = await compressToPassportPhoto(file);
      setCardPhoto(dataUrl);
    } catch (err) {
      console.error(err);
      showToast(err.message || "Couldn't process that photo.", "error");
      setCardPhoto(currentPhotoDataUrl); // restore whatever was there before, with correct label text
    } finally {
      input.value = ""; // allow re-selecting the same file
    }
  });
}

// ---------------- Live preview ----------------
function updateCardPreview() {
  const name = document.getElementById("i_name").value.trim();
  const contact = document.getElementById("i_contact").value.trim();
  const code = document.getElementById("i_code").value.trim();
  const role = document.getElementById("i_role").value.trim();
  const blood = document.getElementById("i_blood").value;

  document.getElementById("idc_name").textContent = name || "Employee Name";
  document.getElementById("idc_code").textContent = code || "—";
  document.getElementById("idc_contact").textContent = contact || "—";
  document.getElementById("idc_role").textContent = role || "—";
  document.getElementById("idc_roleRow").style.display = role ? "block" : "none";
  document.getElementById("idc_blood").textContent = blood || "—";
  document.getElementById("idc_bloodRow").style.display = blood ? "block" : "none";
}

function wireLivePreview() {
  ["i_name", "i_contact", "i_code", "i_role"].forEach(id => {
    document.getElementById(id).addEventListener("input", updateCardPreview);
  });
  document.getElementById("i_blood").addEventListener("change", updateCardPreview);
}

// ---------------- Role suggestions ----------------
// Base suggestions always offered, plus any custom role a user has typed and saved
// before — so a newly-typed role becomes a future suggestion too.
const ID_CARD_BASE_ROLES = ["Site Engineer", "Fitter", "Welder", "Helper", "Contract Labour"];

function populateIdCardRoleDatalist() {
  const used = (idCardsCache || []).map(c => (c.role || "").trim()).filter(Boolean);
  const roles = Array.from(new Set([...ID_CARD_BASE_ROLES, ...used]));
  document.getElementById("idCardRoleDatalist").innerHTML =
    roles.map(r => `<option value="${escapeHtml(r)}"></option>`).join("");
}

// ---------------- Form <-> record ----------------
function applyRecordToPreview(record) {
  document.getElementById("i_name").value = record.name || "";
  document.getElementById("i_contact").value = record.contact || "";
  document.getElementById("i_code").value = record.code || "";
  document.getElementById("i_role").value = record.role || "";
  document.getElementById("i_blood").value = record.blood || "";
  setCardPhoto(record.photoDataUrl || null);
  updateCardPreview();
}

function loadIdCardIntoForm(record) {
  editingIdCardId = record.id;
  applyRecordToPreview(record);
  document.getElementById("idCardFormTitle").textContent = `Editing ${record.name}`;
  document.getElementById("saveIdCardBtn").textContent = "Update Card";
  document.getElementById("cancelIdCardEditBtn").style.display = "inline-flex";
  document.getElementById("i_name").scrollIntoView({ behavior: "smooth", block: "center" });
}

function resetIdCardForm() {
  editingIdCardId = null;
  ["i_name", "i_contact", "i_code", "i_role"].forEach(id => { document.getElementById(id).value = ""; });
  document.getElementById("i_blood").value = "";
  setCardPhoto(null);
  updateCardPreview();
  document.getElementById("idCardFormTitle").textContent = "Generate an ID card";
  document.getElementById("saveIdCardBtn").textContent = "Save & Generate";
  document.getElementById("cancelIdCardEditBtn").style.display = "none";
}

/** Wired to the topbar "+ New ID Card" button — clears any in-progress edit and blanks
 *  the form, then scrolls it into view in case the user was down in the Issued list. */
function startNewIdCard() {
  resetIdCardForm();
  document.getElementById("idCardFormTitle").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function saveIdCard() {
  const name = document.getElementById("i_name").value.trim();
  const contact = document.getElementById("i_contact").value.trim();
  const code = document.getElementById("i_code").value.trim();
  const role = document.getElementById("i_role").value.trim();
  const blood = document.getElementById("i_blood").value;

  if (!name) { showToast("Employee name is required.", "error"); return; }
  if (!contact) { showToast("Employee contact is required.", "error"); return; }
  if (!code) { showToast("Employee code is required.", "error"); return; }

  const data = { name, contact, code, role, blood, photoDataUrl: currentPhotoDataUrl || null };
  const wasEditing = !!editingIdCardId;
  const btn = document.getElementById("saveIdCardBtn");
  const original = btn.textContent;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';

  try {
    const user = auth.currentUser;
    if (wasEditing) {
      await db.collection("employeeIdCards").doc(editingIdCardId).set(Object.assign({}, data, {
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedBy: user ? user.email : null
      }), { merge: true });
      showToast("ID card updated.", "success");
    } else {
      await db.collection("employeeIdCards").add(Object.assign({}, data, {
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        createdBy: user ? user.email : null
      }));
      showToast("ID card saved.", "success");
    }
    resetIdCardForm();
    await loadIdCardsList();
  } catch (err) {
    console.error(err);
    showToast(friendlyFirestoreError(err, "save"), "error");
    btn.textContent = original;
  } finally {
    btn.disabled = false;
  }
}

// ---------------- List ----------------
async function loadIdCardsCache() {
  const snap = await db.collection("employeeIdCards").orderBy("name", "asc").get();
  idCardsCache = snap.docs.map(doc => Object.assign({ id: doc.id }, doc.data()));
  return idCardsCache;
}

async function loadIdCardsList() {
  const body = document.getElementById("idCardsBody");
  const empty = document.getElementById("idCardsEmpty");
  try {
    await loadIdCardsCache();
  } catch (err) {
    console.error(err);
    body.innerHTML = "";
    empty.style.display = "block";
    empty.querySelector("div").textContent = friendlyFirestoreError(err, "load ID cards");
    return;
  }
  empty.querySelector("div").textContent = "No ID cards generated yet. Create your first one above.";
  populateIdCardRoleDatalist();
  const search = document.getElementById("idCardSearch");
  renderIdCardsTable(filterIdCards(search ? search.value.trim().toLowerCase() : ""));
}

function filterIdCards(q) {
  if (!q) return idCardsCache;
  return idCardsCache.filter(c =>
    (c.name || "").toLowerCase().includes(q) ||
    (c.code || "").toLowerCase().includes(q) ||
    (c.role || "").toLowerCase().includes(q)
  );
}

function renderIdCardsTable(list) {
  const body = document.getElementById("idCardsBody");
  const empty = document.getElementById("idCardsEmpty");
  body.innerHTML = "";
  if (!list.length) { empty.style.display = "block"; return; }
  empty.style.display = "none";
  list.forEach(c => {
    const thumb = c.photoDataUrl
      ? `<img class="thumb" src="${c.photoDataUrl}" alt="" />`
      : `<div class="thumb-placeholder"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>`;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${thumb}</td>
      <td><strong>${escapeHtml(c.name)}</strong></td>
      <td>${escapeHtml(c.code || "—")}</td>
      <td>${escapeHtml(c.role || "—")}</td>
      <td>${escapeHtml(c.contact || "—")}</td>
      <td>${escapeHtml(c.blood || "—")}</td>
      <td>
        <div class="row-actions">
          <button class="icon-btn" data-action="edit" title="Edit">✎</button>
          <button class="icon-btn" data-action="png" title="Download PNG">⬇</button>
          <button class="icon-btn" data-action="delete" title="Delete">🗑</button>
        </div>
      </td>
    `;
    tr.querySelectorAll("[data-action]").forEach(btn => {
      btn.addEventListener("click", () => handleIdCardAction(btn.getAttribute("data-action"), c));
    });
    body.appendChild(tr);
  });
}

async function handleIdCardAction(action, record) {
  if (action === "edit") { loadIdCardIntoForm(record); return; }
  if (action === "png") {
    applyRecordToPreview(record);
    await downloadIdCardPng();
    return;
  }
  if (action === "delete") {
    if (!confirm(`Delete the ID card for "${record.name}"? This can't be undone.`)) return;
    db.collection("employeeIdCards").doc(record.id).delete().then(() => {
      showToast("ID card deleted.", "success");
      loadIdCardsList();
    }).catch(err => {
      console.error(err);
      showToast(friendlyFirestoreError(err, "delete"), "error");
    });
  }
}

function wireIdCardSearch() {
  const input = document.getElementById("idCardSearch");
  input.addEventListener("input", () => renderIdCardsTable(filterIdCards(input.value.trim().toLowerCase())));
}

// ---------------- Download (PNG / PDF), via html2pdf's own image/PDF output chain ----------------
// Note: the bundled library only exposes `html2pdf` globally, not a standalone
// `html2canvas` — so both exports go through html2pdf's .outputImg()/.save() chain.
//
// Capturing #idCardPreview directly doesn't work reliably: it lives inside the .two-col
// flex layout, and html2canvas's internal DOM cloning misreports its width when the
// element is nested inside flex/grid ancestors (same class of issue the invoice PDF
// generator hit — see the comment on #invoiceSheetPrint in dashboard.html). The fix is
// the same one used there: render into a persistent, isolated, off-screen element
// (#idCardExportSheet) and capture that instead.
function buildExportCardHTML() {
  const name = document.getElementById("idc_name").textContent;
  const code = document.getElementById("idc_code").textContent;
  const contact = document.getElementById("idc_contact").textContent;
  const role = document.getElementById("idc_role").textContent;
  const roleRowVisible = document.getElementById("idc_roleRow").style.display !== "none";
  const blood = document.getElementById("idc_blood").textContent;
  const bloodRowVisible = document.getElementById("idc_bloodRow").style.display !== "none";
  const photoImg = document.querySelector("#idCardPhotoFrame img");
  const photoHtml = photoImg
    ? `<img src="${photoImg.getAttribute("src")}" alt="" />`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;

  return `
    <div class="id-card-header">
      <img src="assets/logo.png" class="id-card-logo" alt="" />
      <div class="id-card-company-name">SRIKRITHANYA</div>
      <div class="id-card-company-sub">Private Limited</div>
    </div>
    <div class="id-card-photo-wrap">
      <div class="id-card-photo-frame">${photoHtml}</div>
    </div>
    <div class="id-card-body">
      <div class="id-card-name">${escapeHtml(name)}</div>
      <div class="id-card-row" style="display:${roleRowVisible ? "block" : "none"};"><span class="lbl">Role</span><span class="val">${escapeHtml(role)}</span></div>
      <div class="id-card-row"><span class="lbl">Emp. Code</span><span class="val">${escapeHtml(code)}</span></div>
      <div class="id-card-row"><span class="lbl">Contact</span><span class="val">${escapeHtml(contact)}</span></div>
      <div class="id-card-row" style="display:${bloodRowVisible ? "block" : "none"};"><span class="lbl">Blood Group</span><span class="val">${escapeHtml(blood)}</span></div>
    </div>
    <div class="id-card-footer">
      <img src="assets/director-signature.png" class="id-card-sign" alt="" />
      <div class="id-card-sign-label">Director</div>
    </div>
  `;
}

async function prepareExportSheet() {
  const sheet = document.getElementById("idCardExportSheet");
  sheet.innerHTML = buildExportCardHTML();
  const imgs = Array.from(sheet.querySelectorAll("img"));
  await Promise.all(imgs.map(img => {
    if (img.complete && img.naturalWidth > 0) return Promise.resolve();
    return new Promise(resolve => {
      img.addEventListener("load", resolve, { once: true });
      img.addEventListener("error", resolve, { once: true });
    });
  }));
  void sheet.offsetHeight; // force a layout flush before handing off to html2canvas
  return sheet;
}

async function downloadIdCardPng() {
  const btn = document.getElementById("downloadIdCardPngBtn");
  if (btn) btn.disabled = true;
  showToast("Preparing image…");
  try {
    const sheet = await prepareExportSheet();
    const w = sheet.offsetWidth, h = sheet.offsetHeight;
    const dataUri = await html2pdf().set({
      html2canvas: { scale: 4, width: w, height: h, windowWidth: w, windowHeight: h, useCORS: true, allowTaint: false, backgroundColor: "#ffffff" },
      image: { type: "png" }
    }).from(sheet).outputImg("datauristring");
    const name = (document.getElementById("i_name").value.trim() || "id-card").replace(/\s+/g, "_");
    downloadDataUri(dataUri, `${name}.png`);
    showToast("Image downloaded.", "success");
  } catch (err) {
    console.error(err);
    showToast(err.message || "Couldn't generate the image.", "error");
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function downloadIdCardPdf() {
  const btn = document.getElementById("downloadIdCardPdfBtn");
  if (btn) btn.disabled = true;
  showToast("Preparing PDF…");
  try {
    const sheet = await prepareExportSheet();
    const w = sheet.offsetWidth, h = sheet.offsetHeight;
    const name = (document.getElementById("i_name").value.trim() || "id-card").replace(/\s+/g, "_");
    // A tiny sub-pixel mismatch between the captured canvas ratio and the exact 54:85.6mm
    // page ratio makes html2pdf's auto-pagination overflow onto a blank second page — so
    // build up to .toPdf(), trim back to a single page via jsPDF's own API, then save.
    const worker = html2pdf().set({
      margin: 0,
      filename: `${name}.pdf`,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 4, width: w, height: h, windowWidth: w, windowHeight: h, useCORS: true, allowTaint: false },
      jsPDF: { unit: "mm", format: [54, 85.6], orientation: "portrait" }
    }).from(sheet).toPdf();
    await worker.get("pdf").then(pdf => {
      const pageCount = pdf.internal.getNumberOfPages();
      for (let i = pageCount; i > 1; i--) pdf.deletePage(i);
    });
    await worker.save();
    showToast("PDF downloaded.", "success");
  } catch (err) {
    console.error(err);
    showToast(err.message || "Couldn't generate the PDF.", "error");
  } finally {
    if (btn) btn.disabled = false;
  }
}

function downloadDataUri(dataUri, filename) {
  const a = document.createElement("a");
  a.href = dataUri;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
