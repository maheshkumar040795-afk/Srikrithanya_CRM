// ============================================================
// Clients — onboard a client's details once (name, address, email,
// contact, bank details), then reuse them via autocomplete when
// creating an invoice. Any signed-in staff member can manage this
// (not admin-only), since anyone raising an invoice may need to
// onboard a new client.
// ============================================================

let clientsCache = [];       // shared with invoice.js for the Buyer Name/Address autocomplete
let editingClientId = null;

/** Fetches all clients from Firestore into the shared clientsCache, sorted by name.
 *  Called once on first use (either this screen or the invoice builder's autocomplete,
 *  whichever needs it first) and re-run after any add/edit/delete so both stay in sync.
 *  Errors are left to propagate — callers decide whether to surface them (the Clients
 *  screen does; the invoice builder's background prefetch stays quiet and just retries
 *  next time a buyer field is focused). */
async function loadClientsCache() {
  const snap = await db.collection("clients").orderBy("name", "asc").get();
  clientsCache = snap.docs.map(doc => Object.assign({ id: doc.id }, doc.data()));
  return clientsCache;
}

async function loadClientsList() {
  const body = document.getElementById("clientsBody");
  const empty = document.getElementById("clientsEmpty");
  try {
    await loadClientsCache();
  } catch (err) {
    console.error(err);
    body.innerHTML = "";
    empty.style.display = "block";
    empty.querySelector("div").textContent = friendlyFirestoreError(err, "load clients");
    return;
  }
  empty.querySelector("div").textContent = "No clients onboarded yet. Add your first client above.";
  const search = document.getElementById("clientSearch");
  const q = search ? search.value.trim().toLowerCase() : "";
  renderClientsTable(q ? clientsCache.filter(c => (c.name || "").toLowerCase().includes(q)) : clientsCache);
}

function renderClientsTable(list) {
  const body = document.getElementById("clientsBody");
  const empty = document.getElementById("clientsEmpty");
  body.innerHTML = "";
  if (!list.length) {
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";
  list.forEach(c => {
    const bank = [c.bankName, c.bankAccount].filter(Boolean).join(" · ");
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${escapeHtml(c.name)}</strong></td>
      <td>${escapeHtml(c.address || "—")}</td>
      <td>${escapeHtml(c.email || "—")}</td>
      <td>${escapeHtml(c.contact || "—")}</td>
      <td>${escapeHtml(bank || "—")}</td>
      <td>
        <div class="row-actions">
          <button class="icon-btn" data-action="edit" title="Edit">✎</button>
          <button class="icon-btn" data-action="delete" title="Delete">🗑</button>
        </div>
      </td>
    `;
    tr.querySelectorAll("[data-action]").forEach(btn => {
      btn.addEventListener("click", () => handleClientAction(btn.getAttribute("data-action"), c));
    });
    body.appendChild(tr);
  });
}

function handleClientAction(action, client) {
  if (action === "edit") {
    loadClientIntoForm(client);
    return;
  }
  if (action === "delete") {
    if (!confirm(`Delete client "${client.name}"? This can't be undone.`)) return;
    db.collection("clients").doc(client.id).delete().then(() => {
      showToast("Client deleted.", "success");
      loadClientsList();
    }).catch(err => {
      console.error(err);
      showToast(friendlyFirestoreError(err, "delete"), "error");
    });
    return;
  }
}

function loadClientIntoForm(client) {
  editingClientId = client.id;
  document.getElementById("c_name").value = client.name || "";
  document.getElementById("c_address").value = client.address || "";
  document.getElementById("c_email").value = client.email || "";
  document.getElementById("c_contact").value = client.contact || "";
  document.getElementById("c_bankName").value = client.bankName || "";
  document.getElementById("c_bankAccount").value = client.bankAccount || "";
  document.getElementById("c_ifsc").value = client.ifsc || "";
  document.getElementById("clientFormTitle").textContent = `Editing ${client.name}`;
  document.getElementById("saveClientBtn").textContent = "Update Client";
  document.getElementById("cancelClientEditBtn").style.display = "inline-flex";
  document.getElementById("c_name").scrollIntoView({ behavior: "smooth", block: "center" });
}

function resetClientForm() {
  editingClientId = null;
  ["c_name", "c_address", "c_email", "c_contact", "c_bankName", "c_bankAccount", "c_ifsc"].forEach(id => {
    document.getElementById(id).value = "";
  });
  document.getElementById("clientFormTitle").textContent = "Onboard a client";
  document.getElementById("saveClientBtn").textContent = "Save Client";
  document.getElementById("cancelClientEditBtn").style.display = "none";
}

async function saveClient() {
  const name = document.getElementById("c_name").value.trim();
  if (!name) { showToast("Client name is required.", "error"); return; }

  const data = {
    name,
    address: document.getElementById("c_address").value.trim(),
    email: document.getElementById("c_email").value.trim(),
    contact: document.getElementById("c_contact").value.trim(),
    bankName: document.getElementById("c_bankName").value.trim(),
    bankAccount: document.getElementById("c_bankAccount").value.trim(),
    ifsc: document.getElementById("c_ifsc").value.trim().toUpperCase()
  };

  const wasEditing = !!editingClientId;
  const btn = document.getElementById("saveClientBtn");
  const original = btn.textContent;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';

  try {
    const user = auth.currentUser;
    if (wasEditing) {
      await db.collection("clients").doc(editingClientId).set(Object.assign({}, data, {
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedBy: user ? user.email : null
      }), { merge: true });
      showToast("Client updated.", "success");
    } else {
      await db.collection("clients").add(Object.assign({}, data, {
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        createdBy: user ? user.email : null
      }));
      showToast("Client saved.", "success");
    }
    resetClientForm();
    await loadClientsList(); // refreshes clientsCache too, so the invoice builder's autocomplete picks it up
  } catch (err) {
    console.error(err);
    showToast(friendlyFirestoreError(err, "save"), "error");
    btn.textContent = original; // restore the prior label only on failure
  } finally {
    btn.disabled = false;
  }
}

function wireClientSearch() {
  const input = document.getElementById("clientSearch");
  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    renderClientsTable(q ? clientsCache.filter(c => (c.name || "").toLowerCase().includes(q)) : clientsCache);
  });
}
