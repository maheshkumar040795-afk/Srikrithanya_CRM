# Srikrithanya CRM

A lightweight invoicing CRM for **Srikrithanya Private Limited** — staff login, GST tax invoice
builder (auto CGST/SGST @ 9% each), invoice history with edit/recreate, and
print / PDF download. No backend server — just static files +
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
    match /clients/{clientId} {
      allow read, write: if isSignedIn();
    }
    match /employeeIdCards/{cardId} {
      allow read, write: if isSignedIn();
    }
    match /counters/{counterId} {
      allow read, write: if isSignedIn();
    }
    match /amcContracts/{contractId} {
      allow read, write: if isSignedIn();
    }
    match /boqs/{boqId} {
      allow read, write: if isSignedIn();
    }
    match /financeEntries/{entryId} {
      allow read, write: if isAdmin();
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
- **Invoice History** — lists every saved invoice with search by invoice no. / buyer.
  **Download** gets you the PDF straight from a saved invoice without reopening it.
  **Edit** loads it back into the form for changes. **Recreate** copies all the details
  into a brand-new invoice with a fresh invoice number (handy for repeat orders).
- **Clients** — onboard a client once (name, address, email, contact, bank name/account,
  IFSC) and it's saved for reuse. In the invoice builder, typing into **Buyer Name** or
  **Buyer Address** suggests matching onboarded clients — picking one fills in Name,
  Address, Email and Phone automatically. If a client isn't onboarded yet, just type
  their details in manually as before; nothing is required to be pre-saved.
- **ID Cards** — upload an employee photo (auto-cropped/compressed to a passport-photo
  ratio) plus Name, Contact, Employee Code, and an optional Blood Group, and it renders
  a live preview of a print-ready badge with the company logo and the Director's
  signature (cropped from the real signature, `assets/director-signature.png`). Cards
  are saved to Firestore for later editing/reprinting, and can be exported as a
  high-resolution **PNG** or a **PDF sized to the real CR80 card dimensions**
  (54mm × 85.6mm) for professional card printing.
- **AMC tab** — track Annual Maintenance Contracts: Client Name, Contract Start/End Date,
  and a Cycle (3 Months / 6 Months / Annual). Each contract shows under its own cycle
  sub-tab. Rather than only watching the final End Date, each cycle period gets its own
  recurring due date — e.g. a 3-month cycle running Jan 1–Dec 31 is due Mar 31, Jun 30,
  Sep 30 and Dec 31, not just once at the end. Whichever due date is next is flagged red
  (row highlight + status badge showing the exact date) starting 10 days before it, or
  if it's already passed. A summary banner appears automatically on login if anything
  needs attention, with a link straight to the AMC tab, and the sidebar's AMC nav item
  shows a small red count badge. The 10-day lead time and cycle lengths are set in
  `AMC_ALERT_LEAD_DAYS` / `AMC_CYCLE_MONTHS` at the top of `js/amc.js`.
- **BOQ tab** — build a Bill of Quantities / quotation: an auto-numbered BOQ (BOQ-001,
  BOQ-002, …), project name/location, client details (autocompletes from onboarded
  Clients), and a line-item table (Description, Unit, Qty, Rate — Amount is Qty × Rate).
  GST % is a plain number field you set per BOQ (not fixed like the invoice's 18%) and
  is split evenly into CGST + SGST for the totals. BOQs save to Firestore for later
  editing, and export as a PDF styled like the company's invoices (via the same
  `html2pdf.js`).
- **Finance tab** (admin only) — log income and expense entries (date, category, party,
  payment mode, notes). Includes an **Owner Drawings (Personal Use)** expense category
  so money taken out for personal/own needs stays tracked separately from real business
  spend, rather than being invisible or lumped in with company expenses. Summary cards
  show Total Income, Total Expense, and Net Balance for whatever's currently filtered
  (search, type, category, date range). Filtered results can be exported as a **PDF
  statement** (via the same `html2pdf.js` used for invoices) or an **Excel workbook**
  (via `SheetJS`, bundled in `js/vendor/xlsx.full.min.js`, also no external CDN).

## Editing the seller's fixed details

Company name, address, GSTIN, and bank details are constants at the top of
`js/invoice.js` (`SELLER` and `BANK` objects) — update them there if they ever change.

## Brand colors used

Pulled from srikrithanya.com's theme color and the logo's red-to-black gradient:
`#4a0a0d` (maroon), `#c8102e` / `#e0142f` (red), `#161616` (near-black).
