// ============================================================
// Authentication — login page + shared session guard
// ============================================================

function friendlyAuthError(err) {
  const code = err && err.code ? err.code : "";
  const map = {
    "auth/invalid-email": "That email address doesn't look right.",
    "auth/user-disabled": "This account has been disabled. Contact your admin.",
    "auth/user-not-found": "No account found with that email.",
    "auth/wrong-password": "Incorrect password. Try again or reset it.",
    "auth/invalid-credential": "Incorrect email or password.",
    "auth/too-many-requests": "Too many attempts. Please wait a moment and try again.",
    "auth/network-request-failed": "Network error — check your connection.",
    "auth/configuration-not-found": "Firebase Authentication isn't set up yet for this project (see README.md)."
  };
  return map[code] || (err && err.message) || "Something went wrong. Please try again.";
}

// ---------- Login page wiring ----------
(function initLoginPage() {
  const loginForm = document.getElementById("loginForm");
  if (!loginForm) return; // not on the login page

  const loginView = document.getElementById("loginView");
  const forgotView = document.getElementById("forgotView");
  const loginError = document.getElementById("loginError");
  const forgotError = document.getElementById("forgotError");
  const forgotSuccess = document.getElementById("forgotSuccess");

  document.getElementById("showForgot").addEventListener("click", () => {
    loginView.style.display = "none";
    forgotView.style.display = "block";
    loginError.style.display = "none";
  });
  document.getElementById("showLogin").addEventListener("click", () => {
    forgotView.style.display = "none";
    loginView.style.display = "block";
    forgotError.style.display = "none";
    forgotSuccess.style.display = "none";
  });

  // If already signed in, skip straight to the dashboard.
  auth.onAuthStateChanged((user) => {
    if (user) window.location.href = "dashboard.html";
  });

  if (location.protocol === "file:") {
    document.getElementById("fileProtocolWarning").style.display = "block";
  }

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    loginError.style.display = "none";
    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;
    const btn = document.getElementById("loginBtn");
    const btnText = document.getElementById("loginBtnText");

    btn.disabled = true;
    btnText.innerHTML = '<span class="spinner"></span>';

    try {
      await auth.signInWithEmailAndPassword(email, password);
      sessionStorage.setItem("justLoggedIn", "1"); // triggers the one-time welcome popup on the dashboard
      window.location.href = "dashboard.html";
    } catch (err) {
      loginError.textContent = friendlyAuthError(err);
      loginError.style.display = "block";
      btn.disabled = false;
      btnText.textContent = "Sign in";
    }
  });

  document.getElementById("forgotForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    forgotError.style.display = "none";
    forgotSuccess.style.display = "none";
    const email = document.getElementById("forgotEmail").value.trim();
    const btn = document.getElementById("forgotBtn");
    const btnText = document.getElementById("forgotBtnText");

    btn.disabled = true;
    btnText.innerHTML = '<span class="spinner"></span>';

    try {
      await auth.sendPasswordResetEmail(email);
      forgotSuccess.textContent = "Reset link sent — check the inbox for " + email + ".";
      forgotSuccess.style.display = "block";
    } catch (err) {
      forgotError.textContent = friendlyAuthError(err);
      forgotError.style.display = "block";
    } finally {
      btn.disabled = false;
      btnText.textContent = "Send reset link";
    }
  });
})();

// ---------- Session guard used by dashboard.html ----------
// Resolves with { user, profile } once we know the signed-in user AND
// have loaded their staff profile (name/role) from Firestore.
// Redirects to the login page if nobody is signed in.
function requireAuth() {
  return new Promise((resolve) => {
    auth.onAuthStateChanged(async (user) => {
      if (!user) {
        window.location.href = "index.html";
        return;
      }
      let profile = { name: user.email, role: "staff" };
      try {
        const doc = await db.collection("users").doc(user.uid).get();
        if (doc.exists) {
          profile = Object.assign(profile, doc.data());
        } else {
          // First-ever login for this account: create a basic profile.
          // The very first user in an empty system becomes admin.
          const countSnap = await db.collection("users").limit(1).get();
          const role = countSnap.empty ? "admin" : "staff";
          profile.role = role;
          await db.collection("users").doc(user.uid).set({
            name: user.email.split("@")[0],
            email: user.email,
            role: role,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });
        }
      } catch (err) {
        console.error("Failed to load staff profile:", err);
      }
      resolve({ user, profile });
    });
  });
}

function logout() {
  auth.signOut().then(() => window.location.href = "index.html");
}
