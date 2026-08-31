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
    function isAccountant() {
      return isSignedIn() &&
        exists(/databases/$(database)/documents/users/$(request.auth.uid)) &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'accountant';
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
    match /deliveryChallans/{challanId} {
      allow read, write: if isSignedIn();
    }
    match /vouchers/{voucherId} {
      allow read, write: if isSignedIn();
    }
    match /financeEntries/{entryId} {
      allow read, write: if isAdmin() || isAccountant();
    }
    match /amcFinanceEntries/{entryId} {
      allow read, write: if isSignedIn();
    }
    match /employees/{employeeId} {
      allow read, write: if isSignedIn();
    }
    match /employeeAttendance/{entryId} {
      allow read, write: if isSignedIn();
    }
    match /employeeExpenses/{entryId} {
      allow read, write: if isSignedIn();
    }
    match /clientDocuments/{docId} {
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

## 6. Client Documents via Google Drive (optional)

The **Documents** icon on each client (Clients tab) lets you upload a PDF per client —
signed agreements, PO copies, etc. Files aren't stored in Firestore (too big); instead
they're uploaded to a Google Drive folder through a small Apps Script "Web App" you
deploy once, for free, on the same Google account as anything else. Skip this section
if you don't need document uploads yet — the rest of the CRM works fine without it, and
the Documents modal will just tell you it isn't set up.

1. **Create the Drive folder.** Go to **drive.google.com** → **New → Folder** → name it
   e.g. `Srikrithanya CRM Documents` → open it → copy the ID from the address bar:
   `https://drive.google.com/drive/folders/`**`THIS_PART_IS_THE_FOLDER_ID`**.
2. **Create the Apps Script project.** Go to **script.google.com** → **New project**.
   Delete the default `Code.gs` contents and paste in the contents of
   **`apps-script/Code.gs`** from this project.
3. **Fill in the two placeholders** near the top of the script you just pasted:
   - `ROOT_FOLDER_ID` → the folder ID from step 1.
   - `SHARED_SECRET` → make up a long random string (e.g. generate one at
     [randomkeygen.com](https://randomkeygen.com)). This is a simple password that stops
     anyone who finds your Web App URL from uploading or deleting files without it.
   Save the project (e.g. name it "Srikrithanya CRM Documents").
4. **Deploy it as a Web App.** Top-right **Deploy → New deployment** → click the gear
   next to "Select type" → **Web app** → fill in:
   - Execute as: **Me** (your Google account)
   - Who has access: **Anyone**
   → **Deploy**. The first time, Google will ask you to **authorize** the script — click
   through the "unverified app" warning (it's your own script) and allow Drive access.
5. **Copy the Web app URL** shown after deploying (ends in `/exec`).
6. **Paste both values into the CRM.** Open **`js/appscript-config.js`** in this project
   and replace the two `REPLACE_ME` placeholders:
   ```js
   const APPSCRIPT_WEB_APP_URL = "https://script.google.com/macros/s/XXXXXXXX/exec";
   const APPSCRIPT_SHARED_SECRET = "the-same-long-random-string-from-step-3";
   ```
7. **Add the Firestore rule** for the new `clientDocuments` collection — it's already
   included in the rules block in step 2 above if you're setting this up fresh; if you
   copied your rules before this section existed, add:
   ```
   match /clientDocuments/{docId} {
     allow read, write: if isSignedIn();
   }
   ```

That's it — every client's **📄 Documents** icon now lets you name a document, upload a
PDF (up to 8MB), and **Preview** (opens right in the CRM), **Download**, or **Delete** it.
Each client gets its own subfolder inside your Drive folder, created automatically on
first upload. If you ever redeploy the Apps Script with code changes, choose **Deploy →
Manage deployments → edit (pencil) → New version** rather than creating a brand-new
deployment, so the Web App URL already saved in `js/appscript-config.js` keeps working.

## 7. Supplier Prices via Google Sheets (optional)

The **Suppliers** tab is a shared price-comparison list — search an item (e.g. "150mm
nominal dia") and see every company's quoted price side by side, with the lowest
highlighted. It reuses the same Apps Script Web App as Client Documents (same URL, same
secret — no separate deployment needed), but stores its data as rows in a Google Sheet
instead of a Drive file, since that's naturally tabular data you might also want to
glance at directly in Sheets.

The Apps Script already ships with all 33 prices read from your uploaded
`QUOTATION_COMPANIES_DETAILS.xlsx` (all 4 of its sheets — MS Pipe, Sprinkler, Butterfly
Valve, Fire Fighting), ready to load in with one click.

1. **Create the Google Sheet.** Go to **sheets.google.com** → **Blank spreadsheet** →
   name it e.g. `Srikrithanya Supplier Prices` → copy its ID from the URL:
   `https://docs.google.com/spreadsheets/d/`**`THIS_PART_IS_THE_SHEET_ID`**`/edit`.
2. **Paste that ID into the Apps Script.** Open your Apps Script project (the one from
   step 6 — same project, same deployment) → find `SUPPLIER_SHEET_ID` near the top →
   replace `PASTE_YOUR_SUPPLIER_SHEET_ID_HERE` with the ID from step 1 → **Save**.
3. **Run the one-time import.** In the Apps Script editor, use the function dropdown
   (top toolbar, next to Debug) to select **`seedSupplierPrices`** → click **Run** ▶. The
   first time, it'll ask you to authorize Sheets access — allow it. Check the Sheet you
   made in step 1: it should now have a `SupplierPrices` tab with 33 rows.
4. **Redeploy.** Since you edited the script, go to **Deploy → Manage deployments** →
   pencil icon → **New version** → **Deploy**. This keeps the same Web App URL that's
   already saved in `js/appscript-config.js`, so nothing else needs to change.

That's it — open the **Suppliers** tab in the CRM and search `150mm nominal dia` to see
it pull in prices from all 4 companies that quoted it. From there:
- **New item or a new company's quote on an existing item** → just fill in the Add /
  Update form and Save; it always adds a fresh row when that exact Category + Item +
  Company combination doesn't exist yet.
- **An existing company revising their price** → fill in the same Category, Item, and
  Company exactly as before (the datalist suggestions help here) with the new Rate, and
  Save — the Apps Script matches that combination and updates the price in place instead
  of duplicating the row. You can also open a row's ✎ Edit to prefill the form.

Since this lives in a real Google Sheet, you (or anyone with edit access to it) can also
open the Sheet directly in Google Sheets any time to bulk-edit, filter, or sort — the CRM
just reads/writes the same rows.

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
  their details in manually as before; nothing is required to be pre-saved. Each client
  also has a **📄 Documents** icon to upload/preview/download/delete PDFs for that
  client, stored in Google Drive via an Apps Script Web App — see section 6 above.
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
- **Suppliers tab** — a shared, searchable supplier price-comparison list (Category,
  Item, Company, Make, Unit, Rate), backed by a Google Sheet rather than Firestore — see
  section 7 above for setup. Adding a price for a Category+Item+Company that already
  exists revises it in place instead of duplicating a row, so the same form on the CRM
  side covers new items, new companies quoting an existing item, and price revisions.

## Editing the seller's fixed details

Company name, address, GSTIN, and bank details are constants at the top of
`js/invoice.js` (`SELLER` and `BANK` objects) — update them there if they ever change.

## Brand colors used

Pulled from srikrithanya.com's theme color and the logo's red-to-black gradient:
`#4a0a0d` (maroon), `#c8102e` / `#e0142f` (red), `#161616` (near-black).
