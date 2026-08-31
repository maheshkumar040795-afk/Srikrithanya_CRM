// ============================================================
// Staff Access (admin only) — add staff logins, list existing staff
// ============================================================

async function loadStaffList() {
  const body = document.getElementById("staffBody");
  try {
    const snap = await db.collection("users").orderBy("createdAt", "asc").get();
    body.innerHTML = "";
    snap.forEach(doc => {
      const u = doc.data();
      const uid = doc.id;
      const roleStyle = u.role === "admin" ? "background:#fdecea;color:#b3261e;"
        : u.role === "accountant" ? "background:#eef0ff;color:#3d4bb3;" : "";
      const isSelf = auth.currentUser && auth.currentUser.uid === uid;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(u.name || "—")}</td>
        <td>${escapeHtml(u.email || "—")}</td>
        <td><span class="pill" style="${roleStyle}">${escapeHtml(u.role || "staff")}</span></td>
        <td>
          <div class="row-actions">
            <button class="icon-btn" data-delete-uid="${escapeHtml(uid)}" data-delete-email="${escapeHtml(u.email || "")}" title="${isSelf ? "You can't delete your own account" : "Delete"}" ${isSelf ? "disabled" : ""}>🗑</button>
          </div>
        </td>
      `;
      body.appendChild(tr);
    });
    body.querySelectorAll("[data-delete-uid]").forEach(btn => {
      btn.addEventListener("click", () => deleteStaffAccount(btn.getAttribute("data-delete-uid"), btn.getAttribute("data-delete-email")));
    });
  } catch (err) {
    console.error(err);
  }
}

/** Removes the staff member's profile/role from the CRM (Firestore). Firebase
 *  Authentication has no client-side API for deleting ANOTHER user's login —
 *  that requires either the Firebase console or a backend with the Admin SDK,
 *  neither of which this project has (Spark plan, no Cloud Functions). So this
 *  revokes their CRM access and removes them from this list, but to fully stop
 *  them from ever signing in again, the underlying login also needs deleting
 *  from Firebase console → Authentication → Users — the confirm dialog below
 *  spells that out rather than implying this button does it all. */
async function deleteStaffAccount(uid, email) {
  if (auth.currentUser && auth.currentUser.uid === uid) {
    showToast("You can't delete your own account while signed in as it.", "error");
    return;
  }
  const confirmed = confirm(
    `Remove ${email} from Staff Access?\n\n` +
    `This deletes their profile and role here, so they lose access to the CRM's data and permissions immediately.\n\n` +
    `Note: this does NOT delete their underlying login. To fully stop "${email}" from ever signing in again, also go to ` +
    `Firebase console → Authentication → Users → find them → Delete user.\n\n` +
    `Continue removing their CRM profile now?`
  );
  if (!confirmed) return;
  try {
    await db.collection("users").doc(uid).delete();
    showToast("Staff profile removed. Also delete their login in Firebase console to fully revoke access.", "success");
    loadStaffList();
  } catch (err) {
    console.error(err);
    showToast(friendlyFirestoreError(err, "delete"), "error");
  }
}

async function addStaffAccount() {
  const name = document.getElementById("s_name").value.trim();
  const role = document.getElementById("s_role").value;
  const email = document.getElementById("s_email").value.trim();
  const password = document.getElementById("s_password").value;
  const btn = document.getElementById("addStaffBtn");

  if (!name || !email || password.length < 6) {
    showToast("Fill in name, email and a password of at least 6 characters.", "error");
    return;
  }

  btn.disabled = true;
  const original = btn.textContent;
  btn.innerHTML = '<span class="spinner"></span>';

  try {
    // Create the auth account on the SECONDARY app instance so it doesn't
    // sign the current admin out of their own session.
    const cred = await secondaryAuth.createUserWithEmailAndPassword(email, password);
    await db.collection("users").doc(cred.user.uid).set({
      name, email, role,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdBy: auth.currentUser ? auth.currentUser.email : null
    });
    await secondaryAuth.signOut();
    showToast(`Account created for ${email}.`, "success");
    document.getElementById("staffCreatedEmail").value = email;
    document.getElementById("staffCreatedPassword").value = password;
    document.getElementById("staffCreatedPanel").style.display = "block";
    document.getElementById("staffCreatedPanel").scrollIntoView({ behavior: "smooth", block: "center" });
    document.getElementById("s_name").value = "";
    document.getElementById("s_email").value = "";
    document.getElementById("s_password").value = "";
    loadStaffList();
  } catch (err) {
    console.error(err);
    showToast(friendlyAuthError(err), "error");
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

function wireStaffCreatedPanel() {
  document.getElementById("dismissStaffCreatedBtn").addEventListener("click", () => {
    document.getElementById("staffCreatedPanel").style.display = "none";
    document.getElementById("staffCreatedPassword").value = "";
  });
  document.getElementById("copyStaffCredentialsBtn").addEventListener("click", async () => {
    const email = document.getElementById("staffCreatedEmail").value;
    const password = document.getElementById("staffCreatedPassword").value;
    const text = `Email: ${email}\nPassword: ${password}`;
    try {
      await navigator.clipboard.writeText(text);
      showToast("Credentials copied.", "success");
    } catch (err) {
      showToast("Couldn't copy automatically — select and copy the fields manually.", "error");
    }
  });
}
