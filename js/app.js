// ============================================================
// Dashboard bootstrap
// ============================================================

function switchView(viewId) {
  ["invoiceView", "historyView", "clientsView", "idCardsView", "boqView", "amcView", "employeesView", "financeView", "staffView"].forEach(id => {
    document.getElementById(id).style.display = (id === viewId) ? "block" : "none";
  });
  document.querySelectorAll(".nav-item[data-view]").forEach(btn => {
    btn.classList.toggle("active", btn.getAttribute("data-view") === viewId);
  });
  const titles = {
    invoiceView: ["Create Invoice", "GST tax invoice for a client"],
    historyView: ["Invoice History", "All invoices created so far"],
    clientsView: ["Clients", "Onboard clients and manage their saved details"],
    idCardsView: ["ID Cards", "Generate and manage employee ID cards"],
    boqView: ["BOQ", "Bill of quantities / quotations, with GST and PDF export"],
    amcView: ["AMC", "Annual maintenance contracts, by renewal cycle"],
    employeesView: ["Employee Management", "Permanent & temporary staff, attendance and expenses"],
    financeView: ["Finance", "Track income, expenses, and company cash flow"],
    staffView: ["Staff Access", "Manage who can sign in to this CRM"]
  };
  document.getElementById("topbarTitle").textContent = titles[viewId][0];
  document.getElementById("topbarSub").textContent = titles[viewId][1];
  document.getElementById("newInvoiceBtn").style.display = (viewId === "invoiceView") ? "inline-flex" : "none";
  document.getElementById("newIdCardBtn").style.display = (viewId === "idCardsView") ? "inline-flex" : "none";

  if (viewId === "historyView") loadHistory();
  if (viewId === "clientsView") loadClientsList();
  if (viewId === "idCardsView") loadIdCardsList();
  if (viewId === "boqView") loadBoqList();
  if (viewId === "amcView") loadAmcEntries();
  if (viewId === "employeesView") loadEmployeesList();
  if (viewId === "financeView") loadFinanceEntries();
  if (viewId === "staffView") loadStaffList();
}

function closeModal(id) {
  document.getElementById(id).classList.remove("open");
}

// Mobile off-canvas sidebar (hamburger menu). The .open class only has any visual
// effect inside the <=860px media query — harmless to toggle on desktop too.
function toggleSidebar() {
  document.querySelector(".sidebar").classList.toggle("open");
  document.getElementById("sidebarBackdrop").classList.toggle("open");
}
function closeSidebar() {
  document.querySelector(".sidebar").classList.remove("open");
  document.getElementById("sidebarBackdrop").classList.remove("open");
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
    document.getElementById("financeNavItem").style.display = "flex";
  }

  // Nav
  document.querySelectorAll(".nav-item[data-view]").forEach(btn => {
    btn.addEventListener("click", () => {
      switchView(btn.getAttribute("data-view"));
      closeSidebar();
    });
  });
  document.getElementById("sidebarToggleBtn").addEventListener("click", toggleSidebar);
  document.getElementById("sidebarBackdrop").addEventListener("click", closeSidebar);
  document.getElementById("logoutBtn").addEventListener("click", logout);
  document.getElementById("newInvoiceBtn").addEventListener("click", startNewInvoice);

  // Invoice builder
  document.getElementById("addRowBtn").addEventListener("click", () => addItemRow());
  document.getElementById("saveInvoiceBtn").addEventListener("click", saveInvoice);
  document.getElementById("previewBtn").addEventListener("click", openPreview);
  document.getElementById("printBtn").addEventListener("click", printInvoice);
  wireBuyerAutocomplete();
  wireInvoiceGstTypeControls();

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

  // Clients
  document.getElementById("saveClientBtn").addEventListener("click", saveClient);
  document.getElementById("cancelClientEditBtn").addEventListener("click", resetClientForm);
  wireClientSearch();
  document.getElementById("uploadClientDocumentBtn").addEventListener("click", uploadClientDocument);
  loadClientsCache().then(populateAmcClientDatalist).catch(() => {}); // warms the cache early so the invoice/AMC autocompletes are instant

  // ID Cards
  document.getElementById("newIdCardBtn").addEventListener("click", startNewIdCard);
  document.getElementById("saveIdCardBtn").addEventListener("click", saveIdCard);
  document.getElementById("cancelIdCardEditBtn").addEventListener("click", resetIdCardForm);
  document.getElementById("downloadIdCardPngBtn").addEventListener("click", downloadIdCardPng);
  document.getElementById("downloadIdCardPdfBtn").addEventListener("click", downloadIdCardPdf);
  wirePhotoUpload();
  wireLivePreview();
  wireIdCardSearch();

  // AMC
  document.getElementById("saveAmcBtn").addEventListener("click", saveAmcContract);
  document.getElementById("cancelAmcEditBtn").addEventListener("click", resetAmcForm);
  wireAmcSubtabs();
  wireAmcSearch();
  wireAmcNotifyBanner();
  checkAmcNotificationsOnBoot(); // shows the red "due/overdue" banner on login, if any
  document.getElementById("saveAmcFinanceBtn").addEventListener("click", saveAmcFinanceEntry);
  wireAmcFinanceTypeTabs();

  // Employee Management
  document.getElementById("saveEmployeeBtn").addEventListener("click", saveEmployee);
  document.getElementById("cancelEmployeeEditBtn").addEventListener("click", resetEmployeeForm);
  wireEmployeeFormTypeTabs();
  wireEmployeeListSubtabs();
  wireEmployeeSearch();
  document.getElementById("saveEmployeeAttendanceBtn").addEventListener("click", saveEmployeeAttendanceEntry);
  document.getElementById("saveEmployeeExpenseBtn").addEventListener("click", saveEmployeeExpenseEntry);
  document.getElementById("downloadEmployeeAttendanceExcelBtn").addEventListener("click", downloadEmployeeAttendanceExcel);
  document.getElementById("downloadEmployeeExpenseExcelBtn").addEventListener("click", downloadEmployeeExpenseExcel);
  resetEmployeeForm();

  // BOQ
  document.getElementById("addBoqRowBtn").addEventListener("click", () => addBoqItemRow());
  document.getElementById("saveBoqBtn").addEventListener("click", saveBoq);
  document.getElementById("previewBoqBtn").addEventListener("click", openBoqPreview);
  document.getElementById("downloadBoqPdfFromPreviewBtn").addEventListener("click", () => downloadBoqPdf());
  document.getElementById("newBoqBtn").addEventListener("click", startNewBoq);
  document.getElementById("downloadBoqPdfBtn").addEventListener("click", () => downloadBoqPdf());
  wireBoqGstTypeControls();
  wireBoqClientAutocomplete();
  wireBoqSearch();
  startNewBoq();

  // Finance
  populateFinanceFilterCategoryOptions();
  setFinanceFormType("income");
  document.getElementById("fin_date").value = todayISO();
  wireFinanceTypeTabs();
  document.getElementById("saveFinanceBtn").addEventListener("click", saveFinanceEntry);
  document.getElementById("cancelFinanceEditBtn").addEventListener("click", resetFinanceForm);
  wireFinanceFilters();
  document.getElementById("downloadFinancePdfBtn").addEventListener("click", downloadFinancePdf);
  document.getElementById("downloadFinanceExcelBtn").addEventListener("click", downloadFinanceExcel);

  // Staff
  document.getElementById("addStaffBtn").addEventListener("click", addStaffAccount);

  // History search
  wireHistorySearch();

  // Start on a fresh invoice
  switchView("invoiceView");
  startNewInvoice();
})();
