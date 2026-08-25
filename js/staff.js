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
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(u.name || "—")}</td>
        <td>${escapeHtml(u.email || "—")}</td>
        <td><span class="pill" style="${u.role === "admin" ? "background:#fdecea;color:#b3261e;" : ""}">${escapeHtml(u.role || "staff")}</span></td>
      `;
      body.appendChild(tr);
    });
  } catch (err) {
    console.error(err);
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
