# Srikrithanya CRM

A lightweight invoicing CRM for **Srikrithanya Private Limited** — staff login, GST tax invoice
builder (auto CGST/SGST @ 9% each), invoice history with edit/recreate, and
print / PDF / email-draft / WhatsApp sharing. No backend server — just static files +
Firebase (Auth + Firestore), so it deploys for free on GitHub Pages.

---

## 1. Create your Firebase project

1. Go to **console.firebase.google.com** → **Add project** → name it (e.g. `srikrithanya-crm`).
2. Once created: **Build → Authentication → Get started → Sign-in method → Email/Password → Enable → Save.**
3. **Build → Firestore Database → Create database** → start in **Production mode** → pick a region close to India (e.g. `asia-south1`) → **Enable**.
4. **Project settings (⚙️) → General → Your apps → Add app → Web (`</>`)** → give it a nickname → **Register app**.
   Firebase will show you a `firebaseConfig` object like:
   ```js
   const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "srikrithanya-crm.firebaseapp.com",
     projectId: "srikrithanya-crm",
     storageBucket: "srikrithanya-crm.appspot.com",
     messagingSenderId: "...",
     appId: "..."
   };
   ```
5. Paste those exact values into **`js/firebase-config.js`** in this project, replacing every `REPLACE_ME`.

## 2. Set Firestore security rules

In Firebase console → **Firestore Database → Rules**, replace the contents with:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isSignedIn() { return request.auth != null; }
    function isAdmin() {
      return isSignedIn() &&
        exists(/databases/$(database)/documents/users/$(request.auth.uid)) &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
    match /users/{userId} {
      allow read: if isSignedIn();
      allow create: if isSignedIn() && (request.auth.uid == userId || isAdmin());
      allow update, delete: if isAdmin();
    }
    match /invoices/{invoiceId} {
      allow read, write: if isSignedIn();
    }
    match /counters/{counterId} {
      allow read, write: if isSignedIn();
    }
  }
}
```

Click **Publish**.

## 3. Create your first (admin) login

1. Firebase console → **Authentication → Users → Add user** → enter your email + a password.
2. Open the CRM and sign in with that email/password.
3. The **first person ever to sign in** is automatically made **admin** (see `js/auth.js`).
   Every login after that defaults to the **staff** role — an admin can promote/add
   people from the **Staff Access** tab inside the CRM (no console needed after this).

## 4. Try it locally

Because this uses ES-module-free Firebase "compat" SDKs loaded from a CDN, you can just
open `index.html` in a browser — but most browsers block `fetch`/Firestore on `file://`
pages, so serve it locally instead:

```bash
cd srikrithanya-crm
python3 -m http.server 8080
# visit http://localhost:8080
```

## 5. Deploy for free on GitHub Pages

1. Create a new GitHub repo, e.g. `srikrithanya-crm`.
2. Push all these files to the `main` branch (root of the repo).
3. Repo → **Settings → Pages → Source: `main` branch, `/ (root)`** → Save.
4. Your CRM will be live at `https://<your-github-username>.github.io/srikrithanya-crm/`.
5. In Firebase console → **Authentication → Settings → Authorized domains** → add your
   GitHub Pages domain (e.g. `<your-github-username>.github.io`), otherwise sign-in will
   be blocked from that domain.

---

## How things work

- **Login** (`index.html`) — Firebase email/password auth. "Forgot password" sends a
  reset link via `auth.sendPasswordResetEmail()` — no backend needed.
- **Staff Access tab** (admin only) — creates new staff logins using a second, isolated
  Firebase Auth instance so the admin isn't signed out when a new account is created.
- **Create Invoice** — line items (description, HSN/SAC, qty, rate) auto-sum to a
  taxable value; CGST and SGST are each calculated at 9% (18% total GST) and added to
  get the net total. Invoice numbers (`SRK001`, `SRK002`, …) are reserved from a shared
  Firestore counter so two staff can't collide on the same number.
- **Preview / Print / Download PDF** — renders the invoice in the same layout as your
  sample template (`Invoice_Srikrithanya_Nazca.docx`), including the logo, bank details
  and signature block. PDF generation uses `html2pdf.js`, bundled directly in
  `js/vendor/html2pdf.bundle.min.js` (no external CDN — so it can't be broken by a
  blocked/slow CDN or an ad-blocker).
- **Email / WhatsApp — "Attach & send"** — on a phone (and most modern desktop Chrome/Edge),
  clicking this generates the PDF and opens your device's native **share sheet** with the
  file already attached — pick WhatsApp, Gmail, Mail, etc. and it's genuinely attached, not
  something you attach yourself. On a browser that doesn't support attaching files this way
  (mainly desktop Safari/Firefox), it automatically falls back to downloading the PDF and
  opening a pre-filled `mailto:` draft or `wa.me` chat instead, so you just attach the file
  that already downloaded.
- **Invoice History** — lists every saved invoice with search by invoice no. / buyer.
  **Download** gets you the PDF straight from a saved invoice without reopening it.
  **Edit** loads it back into the form for changes. **Recreate** copies all the details
  into a brand-new invoice with a fresh invoice number (handy for repeat orders).

## Editing the seller's fixed details

Company name, address, GSTIN, and bank details are constants at the top of
`js/invoice.js` (`SELLER` and `BANK` objects) — update them there if they ever change.

## Brand colors used

Pulled from srikrithanya.com's theme color and the logo's red-to-black gradient:
`#4a0a0d` (maroon), `#c8102e` / `#e0142f` (red), `#161616` (near-black).
