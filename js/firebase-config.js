// ============================================================
// Srikrithanya CRM — Firebase configuration
// Connected to the "srikrithanya-crm" Firebase project.
// See README.md if you ever need to point this at a different project.
// ============================================================

const firebaseConfig = {
  apiKey: "AIzaSyBrPYMcoB05_OCKx5aolNsjmsl47SJUHe4",
  authDomain: "srikrithanya-crm.firebaseapp.com",
  projectId: "srikrithanya-crm",
  storageBucket: "srikrithanya-crm.firebasestorage.app",
  messagingSenderId: "485979207474",
  appId: "1:485979207474:web:6d290e0cb1f3d73dccc92b"
};

// Primary app instance — used for the signed-in session.
firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();

// Secondary, isolated app instance — used ONLY when an admin creates
// a new staff account, so that action doesn't sign the admin out of
// their own session (Firebase Auth normally signs in whoever you just
// created). See js/staff.js.
const secondaryApp = firebase.initializeApp(firebaseConfig, "Secondary");
const secondaryAuth = secondaryApp.auth();
