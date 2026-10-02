// ============================================================
// Page-aware PDF builder — shared by every PDF export in the CRM
// (Invoice, BOQ / Quotation, Delivery Challan, Voucher, Finance
// statement and the list "Download PDF" exports).
//
// Why: html2pdf on its own renders the whole document as ONE tall
// image and cuts it every 297 mm, wherever the cut happens to land.
// That split table rows in half, left page 2 without a table header,
// and broke the Bank Details / signature block across pages. On
// phones it also laid the sheet out against the narrow phone window.
//
// What this does instead:
//   1. Lays the document out off-screen at the exact A4 content width
//      (same on laptop and mobile) and measures every block / row.
//   2. Packs blocks onto real A4 pages: table rows are never split,
//      the table header row repeats on every page, column widths stay
//      identical on every page, and blocks such as Totals, Terms and
//      Bank Details + Signatory are never split across pages.
//   3. Adds a footer ("Page x of y") and a small "continued" label.
//   4. Renders each page separately and assembles the PDF.
//
// Requires html2pdf (js/vendor/html2pdf.bundle.min.js).
// ============================================================

const PDF_PAGE_GEOMETRY = {
  // CSS px at 96 dpi. A4 = 210 x 297 mm = 793.7 x 1122.5 px.
  portrait:  { w: 794,  h: 1120 },
  landscape: { w: 1122, h: 792 }
};

/** Height a block takes in the flow (includes its margins and any -1px overlap). */
function _pdfFlowHeights(children, host) {
  const hostTop = host.getBoundingClientRect().top;
  const tops = children.map(el => el.getBoundingClientRect().top - hostTop);
  const end = host.getBoundingClientRect().height;
  return children.map((el, i) => Math.max(0, (i + 1 < children.length ? tops[i + 1] : end) - tops[i]));
}

/** Pure measurement of a laid-out host — returns numbers only, so it can run inside
 *  html2canvas's cloned document (the exact environment the PDF is drawn in). */
function _pdfMeasure(host) {
  const children = Array.from(host.children);
  const heights = _pdfFlowHeights(children, host);
  return children.map((el, i) => {
    if (!_pdfIsSplittableTable(el)) return { table: false, h: heights[i] };
    const rows = Array.from(el.tBodies[0].rows);
    const rowRects = rows.map(r => r.getBoundingClientRect());
    const bodyBottom = el.tBodies[0].getBoundingClientRect().bottom;
    const rowH = rows.map((r, j) => (j + 1 < rows.length ? rowRects[j + 1].top : bodyBottom) - rowRects[j].top);
    const headH = rowRects[0].top - el.getBoundingClientRect().top;
    const extra = Math.max(0, heights[i] - headH - rowH.reduce((a, b) => a + b, 0)); // margins / borders
    const colW = Array.from(el.tHead.rows[0].cells).map(c => c.getBoundingClientRect().width);
    return { table: true, h: heights[i], rowH, headH: headH + extra, colW };
  });
}

function _pdfIsSplittableTable(el) {
  return el.tagName === "TABLE" && el.tHead && el.tBodies.length === 1 && el.tBodies[0].rows.length > 1;
}

/**
 * Builds a paginated PDF Blob from a document HTML string.
 * opts:
 *   orientation  "portrait" (default) | "landscape"
 *   sheetClass   class on each page so the document CSS applies (default "invoice-sheet")
 *   baseStyle    extra inline style for the page body (font etc.)
 *   footerLeft   text at bottom-left of every page
 *   contLabel    text shown at top-right of pages 2+ (e.g. "Quotation No: 01 — continued")
 */
async function buildPagedPdfBlob(html, opts) {
  if (typeof html2pdf === "undefined") {
    throw new Error("The PDF library didn't load — check your internet connection and reload the page.");
  }
  opts = opts || {};
  const orientation = opts.orientation === "landscape" ? "landscape" : "portrait";
  const geo = PDF_PAGE_GEOMETRY[orientation];
  const sheetClass = opts.sheetClass === undefined ? "invoice-sheet" : opts.sheetClass;
  const baseStyle = opts.baseStyle || "";
  const PAD_X = orientation === "portrait" ? 34 : 30;
  const PAD_TOP = 30;
  const PAD_BOTTOM = 46;       // room for the page footer
  const CONT_H = 20;           // "continued" label height on pages 2+
  const contentW = geo.w - PAD_X * 2;
  const SAFE = 8;              // small safety gap above the footer
  const availFirst = geo.h - PAD_TOP - PAD_BOTTOM - SAFE;
  const availNext = availFirst - (opts.contLabel ? CONT_H : 0);

  // Off-screen stage. Fixed widths everywhere, so layout never depends on the
  // phone / laptop window size. text-size-adjust stops iOS from inflating text.
  const stage = document.createElement("div");
  stage.className = "pdf-stage";
  stage.style.cssText = "position:absolute;left:-12000px;top:0;width:" + geo.w + "px;";
  document.body.appendChild(stage);

  try {
    const pageMm = orientation === "portrait" ? { w: 210, h: 297 } : { w: 297, h: 210 };
    const workerOpts = {
      margin: 0,
      image: { type: "jpeg", quality: 0.96 },
      html2canvas: {
        scale: 2, useCORS: true, allowTaint: false, backgroundColor: "#ffffff",
        scrollX: 0, scrollY: 0,
        width: geo.w, height: geo.h,
        windowWidth: 1280, windowHeight: 1600   // render as a desktop browser, even on phones
      },
      jsPDF: { unit: "mm", format: "a4", orientation: orientation }
    };

    // ---------- 1. Measure ----------
    const host = document.createElement("div");
    host.className = (sheetClass + " pdf-measure").trim();
    host.style.cssText = baseStyle + ";width:" + contentW + "px;padding:0;border:0;margin:0;max-width:none;box-shadow:none;";
    host.innerHTML = html;
    stage.appendChild(host);
    await waitForImages(host);
    if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (e) {} }
    void host.offsetHeight;

    // Measure inside html2canvas's own cloned document — the same window width,
    // fonts (e.g. Inter) and CSS the pages are later drawn with. Measuring in the live
    // page could disagree (font not yet loaded, browser zoom), which pushed the last
    // rows of a page under the footer on laptops. Falls back to the live page.
    let measured = null;
    try {
      await html2pdf().set(Object.assign({}, workerOpts, {
        html2canvas: Object.assign({}, workerOpts.html2canvas, {
          scale: 1, width: contentW, height: 4,
          onclone: (doc) => {
            const cloneHost = doc.querySelector(".html2pdf__container .pdf-measure") || doc.querySelector(".pdf-measure");
            if (cloneHost) measured = _pdfMeasure(cloneHost);
          }
        })
      })).from(host).toCanvas();
    } catch (e) { console.warn("PDF clone measure failed, using live layout", e); }
    const children = Array.from(host.children);
    if (!measured || measured.length !== children.length) measured = _pdfMeasure(host);

    // Units to pack: atomic blocks, or splittable tables (rows measured individually).
    const units = children.map((el, i) => {
      const m = measured[i];
      if (!m.table || !_pdfIsSplittableTable(el)) return { kind: "block", els: [el], h: m.h };
      return { kind: "table", el, rows: Array.from(el.tBodies[0].rows), rowH: m.rowH, headH: m.headH, colW: m.colW };
    });

    // Keep "amount in words" / certification / notes lines glued to the totals above them.
    for (let i = units.length - 1; i > 0; i--) {
      const u = units[i], prev = units[i - 1];
      const glue = u.kind === "block" && prev.kind === "block" &&
        u.els[0].classList && (u.els[0].classList.contains("words-cell") || u.els[0].classList.contains("cert-cell"));
      if (glue) { prev.els = prev.els.concat(u.els); prev.h += u.h; units.splice(i, 1); }
    }

    // ---------- 2. Paginate ----------
    const pages = [[]];
    let used = 0;
    const avail = () => (pages.length === 1 ? availFirst : availNext);
    const newPage = () => { pages.push([]); used = 0; };

    units.forEach((u, ui) => {
      if (u.kind === "block") {
        if (used > 0 && used + u.h > avail()) {
          // Keep the last couple of item rows together with a totals block, so a
          // page never starts with the totals alone.
          const cur = pages[pages.length - 1];
          const last = cur[cur.length - 1];
          let carried = null;
          if (last && last.kind === "rows" && last.to - last.from >= 4 && ui > 0 && units[ui - 1] === last.unit) {
            const take = 2;
            carried = { kind: "rows", unit: last.unit, from: last.to - take, to: last.to };
            last.to -= take;
          }
          newPage();
          if (carried) {
            pages[pages.length - 1].push(carried);
            used += carried.unit.headH + carried.unit.rowH.slice(carried.from, carried.to).reduce((a, b) => a + b, 0);
          }
        }
        pages[pages.length - 1].push({ kind: "block", unit: u });
        used += u.h;
        return;
      }
      // Splittable table: fill rows page by page, header repeated on each chunk.
      let r = 0;
      while (r < u.rows.length) {
        // Need room for the header + at least one row, otherwise start a new page.
        if (used > 0 && used + u.headH + u.rowH[r] > avail()) newPage();
        const chunk = { kind: "rows", unit: u, from: r, to: r };
        used += u.headH;
        while (r < u.rows.length && (chunk.to === chunk.from || used + u.rowH[r] <= avail())) {
          used += u.rowH[r];
          r++;
          chunk.to = r;
        }
        pages[pages.length - 1].push(chunk);
        if (r < u.rows.length) newPage();
      }
    });

    // ---------- 3. Build page elements ----------
    const total = pages.length;
    const pageEls = pages.map((items, pi) => {
      const page = document.createElement("div");
      page.className = (sheetClass + " pdf-page").trim();
      page.style.cssText = baseStyle +
        ";position:relative;box-sizing:border-box;overflow:hidden;background:#fff;" +
        "width:" + geo.w + "px;height:" + geo.h + "px;max-width:none;margin:0;border:0;box-shadow:none;" +
        "padding:" + PAD_TOP + "px " + PAD_X + "px " + PAD_BOTTOM + "px;";

      if (pi > 0 && opts.contLabel) {
        const c = document.createElement("div");
        c.className = "pdf-cont-label";
        c.style.cssText = "height:" + CONT_H + "px;font:600 10px/1 Inter,Arial,sans-serif;color:#777;text-align:right;letter-spacing:0.02em;";
        c.textContent = opts.contLabel;
        page.appendChild(c);
      }

      items.forEach(it => {
        if (it.kind === "block") { it.unit.els.forEach(el => page.appendChild(el.cloneNode(true))); return; }
        const u = it.unit;
        const t = u.el.cloneNode(false);
        t.style.tableLayout = "fixed";
        t.style.width = contentW + "px";
        const cg = document.createElement("colgroup");
        u.colW.forEach(w => { const col = document.createElement("col"); col.style.width = w + "px"; cg.appendChild(col); });
        t.appendChild(cg);
        t.appendChild(u.el.tHead.cloneNode(true));
        const tb = document.createElement("tbody");
        for (let k = it.from; k < it.to; k++) tb.appendChild(u.rows[k].cloneNode(true));
        t.appendChild(tb);
        page.appendChild(t);
      });

      const foot = document.createElement("div");
      foot.className = "pdf-page-foot";
      foot.style.cssText = "position:absolute;left:" + PAD_X + "px;right:" + PAD_X + "px;bottom:18px;" +
        "display:flex;justify-content:space-between;gap:12px;border-top:1px solid #ddd;padding-top:6px;" +
        "font:500 9.5px/1.2 Inter,Arial,sans-serif;color:#777;";
      const l = document.createElement("span"); l.textContent = opts.footerLeft || "";
      const rgt = document.createElement("span"); rgt.textContent = "Page " + (pi + 1) + " of " + total;
      foot.appendChild(l); foot.appendChild(rgt);
      page.appendChild(foot);
      return page;
    });

    stage.removeChild(host);
    pageEls.forEach(p => stage.appendChild(p));
    await waitForImages(stage);
    void stage.offsetHeight;

    // ---------- 4. Render each page and assemble ----------
    let pdf = null;
    for (let i = 0; i < pageEls.length; i++) {
      if (i === 0) {
        // html2pdf doesn't expose jsPDF globally — page 1 goes through its own toPdf(),
        // which also gives us the jsPDF instance. The page element is slightly shorter
        // than A4, so html2pdf places it as exactly one page.
        pdf = await html2pdf().set(workerOpts).from(pageEls[0]).toPdf().get("pdf");
        while (pdf.internal.getNumberOfPages() > 1) pdf.deletePage(pdf.internal.getNumberOfPages());
        continue;
      }
      const canvas = await html2pdf().set(workerOpts).from(pageEls[i]).toCanvas().get("canvas");
      const img = canvas.toDataURL("image/jpeg", 0.96);
      const imgH = Math.min(pageMm.h, pageMm.w * canvas.height / canvas.width);
      pdf.addPage("a4", orientation);
      pdf.addImage(img, "JPEG", 0, 0, pageMm.w, imgH);
    }
    return pdf.output("blob");
  } finally {
    stage.remove();
  }
}
