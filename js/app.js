// ============================================================
// Dashboard bootstrap
// ============================================================

function switchView(viewId) {
  const restrictedForAccountant = ["clientsView", "boqView", "amcView", "staffView"];
  if (window.currentUserRole === "accountant" && restrictedForAccountant.includes(viewId)) {
    viewId = "invoiceView"; // guards direct calls too, not just the hidden nav buttons
  }
  ["invoiceView", "historyView", "clientsView", "idCardsView", "boqView", "challanView", "voucherView", "amcView", "employeesView", "suppliersView", "financeView", "staffView"].forEach(id => {
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
    challanView: ["Delivery Challan", "Dispatch notes with items, GST, and PDF export"],
    voucherView: ["Voucher", "Cash / cheque payment vouchers, with PDF export"],
    amcView: ["AMC", "Annual maintenance contracts, by renewal cycle"],
    employeesView: ["Employee Management", "Permanent & temporary staff, attendance and expenses"],
    suppliersView: ["Suppliers", "Compare supplier prices by item, synced to Google Sheets"],
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
  if (viewId === "challanView") loadChallanList();
  if (viewId === "voucherView") loadVoucherList();
  if (viewId === "amcView") loadAmcEntries();
  if (viewId === "employeesView") loadEmployeesList();
  if (viewId === "suppliersView") loadSupplierPrices();
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
  if (profile.role === "accountant") {
    // Accountant gets Finance (it's their screen) but not Clients/BOQ/AMC/Staff Access.
    document.getElementById("financeNavItem").style.display = "flex";
    ["clientsView", "boqView", "amcView"].forEach(viewId => {
      const navBtn = document.querySelector(`.nav-item[data-view="${viewId}"]`);
      if (navBtn) navBtn.style.display = "none";
    });
  }
  window.currentUserRole = profile.role || "staff"; // used by switchView's guard below

  // One-time welcome popup right after a fresh login (not on every page refresh).
  if (sessionStorage.getItem("justLoggedIn") === "1") {
    sessionStorage.removeItem("justLoggedIn");
    document.getElementById("welcomeUserName").textContent = profile.name || user.email;
    document.getElementById("welcomeUserRole").textContent =
      profile.role === "admin" ? "Signed in as Admin." : "Signed in as Staff.";
    document.getElementById("welcomeModal").classList.add("open");
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
  document.getElementById("welcomeModalOkBtn").addEventListener("click", () => closeModal("welcomeModal"));
  document.getElementById("newInvoiceBtn").addEventListener("click", startNewInvoice);

  // Invoice builder
  document.getElementById("addRowBtn").addEventListener("click", () => addItemRow());
  document.getElementById("saveInvoiceBtn").addEventListener("click", saveInvoice);
  document.getElementById("previewBtn").addEventListener("click", () => openPreview());
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
  wireAmcNextCycleAutoSuggest();
  wireAmcSearch();
  wireAmcNotifyBanner();
  checkAmcNotificationsOnBoot(); // shows the red "due/overdue" banner on login, if any
  document.getElementById("downloadAmcPdfBtn").addEventListener("click", downloadAmcPdf);
  document.getElementById("downloadAmcExcelBtn").addEventListener("click", downloadAmcExcel);
  document.getElementById("saveAmcFinanceBtn").addEventListener("click", saveAmcFinanceEntry);
  document.getElementById("downloadAmcFinanceExcelBtn").addEventListener("click", downloadAmcFinanceExcel);
  document.getElementById("downloadAmcFinancePdfBtn").addEventListener("click", downloadAmcFinancePdf);
  wireAmcFinanceTypeTabs();

  // Employee Management
  document.getElementById("saveEmployeeBtn").addEventListener("click", saveEmployee);
  document.getElementById("cancelEmployeeEditBtn").addEventListener("click", resetEmployeeForm);
  wireEmployeeFormTypeTabs();
  wireEmployeeListSubtabs();
  wireEmployeeSearch();
  document.getElementById("saveEmployeeAttendanceBtn").addEventListener("click", saveEmployeeAttendanceEntry);
  document.getElementById("saveEmployeeExpenseBtn").addEventListener("click", saveEmployeeExpenseEntry);
  document.getElementById("cancelEmployeeExpenseEditBtn").addEventListener("click", resetEmployeeExpenseForm);
  document.getElementById("downloadEmployeeAttendanceExcelBtn").addEventListener("click", downloadEmployeeAttendanceExcel);
  document.getElementById("downloadEmployeeExpenseExcelBtn").addEventListener("click", downloadEmployeeExpenseExcel);
  document.getElementById("downloadEmployeeAttendancePdfBtn").addEventListener("click", downloadEmployeeAttendancePdf);
  document.getElementById("downloadEmployeeExpensePdfBtn").addEventListener("click", downloadEmployeeExpensePdf);
  document.getElementById("downloadEmployeesPdfBtn").addEventListener("click", downloadEmployeesPdf);
  document.getElementById("downloadEmployeesExcelBtn").addEventListener("click", downloadEmployeesExcel);
  resetEmployeeForm();

  // Suppliers
  document.getElementById("saveSupplierPriceBtn").addEventListener("click", saveSupplierPrice);
  document.getElementById("cancelSupplierEditBtn").addEventListener("click", resetSupplierPriceForm);
  document.getElementById("refreshSupplierPricesBtn").addEventListener("click", loadSupplierPrices);
  document.getElementById("downloadSupplierPdfBtn").addEventListener("click", downloadSupplierPricesPdf);
  document.getElementById("downloadSupplierExcelBtn").addEventListener("click", downloadSupplierPricesExcel);
  wireSupplierSearch();

  // BOQ
  document.getElementById("addBoqRowBtn").addEventListener("click", () => addBoqItemRow());
  document.getElementById("saveBoqBtn").addEventListener("click", saveBoq);
  document.getElementById("previewBoqBtn").addEventListener("click", () => openBoqPreview());
  document.getElementById("downloadBoqPdfFromPreviewBtn").addEventListener("click", () => downloadBoqPdf());
  document.getElementById("newBoqBtn").addEventListener("click", startNewBoq);
  document.getElementById("downloadBoqPdfBtn").addEventListener("click", () => downloadBoqPdf());
  wireBoqGstTypeControls();
  wireBoqClientAutocomplete();
  wireBoqSearch();
  startNewBoq();

  // Delivery Challan
  document.getElementById("addChallanRowBtn").addEventListener("click", () => addChallanItemRow());
  document.getElementById("saveChallanBtn").addEventListener("click", saveChallan);
  document.getElementById("previewChallanBtn").addEventListener("click", () => openChallanPreview());
  document.getElementById("downloadChallanPdfFromPreviewBtn").addEventListener("click", () => downloadChallanPdf());
  document.getElementById("newChallanBtn").addEventListener("click", startNewChallan);
  document.getElementById("downloadChallanPdfBtn").addEventListener("click", () => downloadChallanPdf());
  wireChallanGstTypeControls();
  wireChallanClientAutocomplete();
  wireChallanSearch();
  startNewChallan();

  // Voucher
  document.getElementById("saveVoucherBtn").addEventListener("click", saveVoucher);
  document.getElementById("previewVoucherBtn").addEventListener("click", () => openVoucherPreview());
  document.getElementById("downloadVoucherPdfFromPreviewBtn").addEventListener("click", () => downloadVoucherPdf());
  document.getElementById("newVoucherBtn").addEventListener("click", startNewVoucher);
  document.getElementById("downloadVoucherPdfBtn").addEventListener("click", () => downloadVoucherPdf());
  wireVoucherModeControls();
  wireVoucherSearch();
  startNewVoucher();

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
  wireStaffCreatedPanel();

  // History search
  wireHistorySearch();

  // Start on a fresh invoice
  switchView("invoiceView");
  startNewInvoice();
})();
