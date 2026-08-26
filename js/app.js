// ============================================================
// Dashboard bootstrap
// ============================================================

function switchView(viewId) {
  ["invoiceView", "historyView", "staffView"].forEach(id => {
    document.getElementById(id).style.display = (id === viewId) ? "block" : "none";
  });
  document.querySelectorAll(".nav-item[data-view]").forEach(btn => {
    btn.classList.toggle("active", btn.getAttribute("data-view") === viewId);
  });
  const titles = {
    invoiceView: ["Create Invoice", "GST tax invoice for a client"],
    historyView: ["Invoice History", "All invoices created so far"],
    staffView: ["Staff Access", "Manage who can sign in to this CRM"]
  };
  document.getElementById("topbarTitle").textContent = titles[viewId][0];
  document.getElementById("topbarSub").textContent = titles[viewId][1];
  document.getElementById("newInvoiceBtn").style.display = (viewId === "invoiceView") ? "inline-flex" : "none";

  if (viewId === "historyView") loadHistory();
  if (viewId === "staffView") loadStaffList();
}

function closeModal(id) {
  document.getElementById(id).classList.remove("open");
}

(async function boot() {
  if (location.protocol === "file:") {
    document.getElementById("fileProtocolWarning").style.display = "block";
  }

  const { user, profile } = await requireAuth();

  document.getElementById("pageLoader").style.display = "none";
  document.getElementById("appShell").style.display = "flex";

  document.getElementById("sidebarUserName").textContent = profile.name || user.email;
  document.getElementById("sidebarUserRole").textContent = profile.role || "staff";
  if (profile.role === "admin") {
    document.getElementById("staffNavItem").style.display = "flex";
  }

  // Nav
  document.querySelectorAll(".nav-item[data-view]").forEach(btn => {
    btn.addEventListener("click", () => switchView(btn.getAttribute("data-view")));
  });
  document.getElementById("logoutBtn").addEventListener("click", logout);
  document.getElementById("newInvoiceBtn").addEventListener("click", startNewInvoice);

  // Invoice builder
  document.getElementById("addRowBtn").addEventListener("click", () => addItemRow());
  document.getElementById("saveInvoiceBtn").addEventListener("click", saveInvoice);
  document.getElementById("previewBtn").addEventListener("click", openPreview);
  document.getElementById("printBtn").addEventListener("click", printInvoice);

  // Preview modal
  document.getElementById("downloadPdfBtn").addEventListener("click", () => downloadInvoicePdf());
  document.getElementById("printFromPreviewBtn").addEventListener("click", () => {
    closeModal("previewModal");
    printInvoice();
  });

  // Modal close buttons + overlay click
  document.querySelectorAll("[data-close]").forEach(btn => {
    btn.addEventListener("click", () => closeModal(btn.getAttribute("data-close")));
  });
  document.querySelectorAll(".modal-overlay").forEach(overlay => {
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.classList.remove("open"); });
  });

  // Staff
  document.getElementById("addStaffBtn").addEventListener("click", addStaffAccount);

  // History search
  wireHistorySearch();

  // Start on a fresh invoice
  switchView("invoiceView");
  startNewInvoice();
})();
