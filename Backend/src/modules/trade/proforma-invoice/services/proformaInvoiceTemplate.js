import PDFDocument from 'pdfkit';
import {
  MARGIN, CONTENT, CONTENT_BOTTOM,
  fmt, fmtDate, fetchLogoBuffer,
  hRule, ensureSpace,
} from '../../shared/services/pdfKit.js';

const INK       = '#1a1a1a';
const INK_SOFT  = '#595959';
const INK_FAINT = '#8c8c8c';
const LINE      = '#1a1a1a';
const LINE_SOFT = '#d0d0d0';

const SANS   = 'Helvetica';
const SANS_B = 'Helvetica-Bold';

const COL_GUTTER = 18;
const SECTION_GAP = 14;

const ITEM_COLS = [
  { key: 'commodity', label: 'COMMODITY', width: 130, align: 'left'   },
  { key: 'hsnCode',   label: 'HSN CODE',  width: 55,  align: 'center' },
  { key: 'quantity',  label: 'QTY',       width: 50,  align: 'right'  },
  { key: 'unit',      label: 'UNIT',      width: 45,  align: 'center' },
  { key: 'rate',      label: 'RATE',      width: 70,  align: 'right'  },
  { key: 'amount',    label: 'AMOUNT',    width: CONTENT - (130 + 55 + 50 + 45 + 70), align: 'right' },
];

function getItemCells(item) {
  return [
    item.commodity || '—',
    item.hsnCode    || '—',
    fmt(item.quantity),
    item.unit       || '—',
    fmt(item.rate),
    fmt(item.amount),
  ];
}

function decodeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&#x2F;/g, '/')
    .replace(/&#x2f;/g, '/')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function fmtVal(v) {
  return (v === undefined || v === null || v === '') ? '—' : v;
}

function vRule(doc, x, y1, y2, color = LINE_SOFT) {
  doc.save().strokeColor(color).lineWidth(0.5)
    .moveTo(x, y1).lineTo(x, y2).stroke().restore();
}

function ensureSectionSpace(doc, height) {
  if (doc.y + height > CONTENT_BOTTOM) doc.addPage();
}

function drawLetterhead(doc, { organization, logoBuf }) {
  const orgName  = decodeHtml(organization?.organizationName || 'Organization');
  const rawAddr  = decodeHtml(organization?.contact?.address || '');
  const gstNum   = decodeHtml(organization?.kyc?.gst?.number ? `GSTIN: ${organization.kyc.gst.number}` : '');
  const phoneNum = decodeHtml(organization?.contact?.phone   ? `Ph: ${organization.contact.phone}`     : '');
  const emailAddr= decodeHtml(organization?.organizationEmail || '');

  const orgLines = [rawAddr, gstNum, phoneNum, emailAddr].filter(Boolean).join('   |   ');

  const HALF_W  = CONTENT / 2;
  const COL_GAP = 20;

  const leftX  = MARGIN;
  const leftW  = HALF_W - COL_GAP / 2;
  const textX  = MARGIN + HALF_W + COL_GAP / 2;
  const textW  = HALF_W - COL_GAP / 2;

  const LOGO_MAX_W = leftW;
  const LOGO_MAX_H = 60;

  let logoW = 0, logoH = 0;
  if (logoBuf) {
    try {
      const img = doc.openImage(logoBuf);
      if (img?.width && img?.height) {
        const scale = Math.min(LOGO_MAX_W / img.width, LOGO_MAX_H / img.height, 1);
        logoW = img.width  * scale;
        logoH = img.height * scale;
      }
    } catch (_) { logoW = 0; logoH = 0; }
  }

  doc.fontSize(13).font(SANS_B);
  const nameH = doc.heightOfString(orgName, { width: textW });

  doc.fontSize(7.5).font(SANS);
  const linesH = orgLines ? doc.heightOfString(orgLines, { width: textW, lineGap: 1 }) : 0;

  const textBlockH = nameH + (linesH ? linesH + 4 : 0);
  const blockH     = Math.max(textBlockH, logoH, 40);

  const y = doc.y;

  if (logoBuf) {
    try {
      doc.image(logoBuf, leftX, y, {
        fit: [leftW, blockH],
        align: 'left',
        valign: 'center',
      });
    } catch (_) {}
  }

  doc.fontSize(13).font(SANS_B).fillColor(INK)
    .text(orgName, textX, y, { width: textW });
  if (orgLines) {
    doc.fontSize(7.5).font(SANS).fillColor(INK_SOFT)
      .text(orgLines, textX, y + nameH + 4, { width: textW, lineGap: 1 });
  }

  doc.y = y + blockH + 14;
  hRule(doc, doc.y, LINE_SOFT);
  doc.y += 16;
}

function drawTitleBlock(doc, { title, docNumber, date }) {
  const t = (title || 'PROFORMA INVOICE').toUpperCase();
  const titleOpts = { width: CONTENT, align: 'center', characterSpacing: 1.4 };

  doc.fontSize(18).font(SANS_B);
  const titleH = doc.heightOfString(t, titleOpts);

  const y = doc.y;
  doc.fillColor(INK).text(t, MARGIN, y, titleOpts);
  doc.y = y + titleH + 6;

  const meta = [
    docNumber ? `PI NO. ${docNumber}` : null,
    date      ? `DATE: ${date}`       : null,
  ].filter(Boolean).join('          ');

  if (meta) {
    doc.fontSize(8).font(SANS).fillColor(INK_SOFT)
      .text(meta, MARGIN, doc.y, { width: CONTENT, align: 'center', characterSpacing: 0.5 });
    doc.y += 14;
  }

  doc.y += 6;
  doc.save().strokeColor(LINE).lineWidth(1.25)
    .moveTo(MARGIN, doc.y).lineTo(MARGIN + CONTENT, doc.y).stroke().restore();
  hRule(doc, doc.y + 2.5, LINE_SOFT);
  doc.y += 18;
}

function sectionHeading(doc, number, title, contentH = 0) {
  const label = `${number}.  ${title.toUpperCase()}`;
  const opts  = { width: CONTENT, characterSpacing: 0.6 };

  doc.fontSize(9).font(SANS_B);
  const textH = doc.heightOfString(label, opts);

  ensureSectionSpace(doc, textH + 8 + contentH);
  const y = doc.y;

  doc.fillColor(INK).text(label, MARGIN, y, opts);

  doc.y = y + textH + 8;
}

function chunkRows(fields, size = 5) {
  const rows = [];
  for (let i = 0; i < fields.length; i += size) rows.push(fields.slice(i, i + size));
  return rows;
}

function fieldRowHeight(doc, row, w) {
  doc.fontSize(8.5).font(SANS);
  const cellHeights = row.map((c) =>
    doc.heightOfString(String(c.v ?? '—'), { width: w, lineGap: 1 })
  );
  return Math.max(...cellHeights, 9) + 15;
}

function measureFieldRows(doc, rows) {
  let h = 0;
  rows.forEach((row, ri) => {
    const w = (CONTENT - COL_GUTTER * (row.length - 1)) / row.length;
    h += fieldRowHeight(doc, row, w);
    if (ri < rows.length - 1) h += 8;
  });
  return h;
}

function fieldGrid(doc, rows) {
  let y = doc.y;

  rows.forEach((row, ri) => {
    const w = (CONTENT - COL_GUTTER * (row.length - 1)) / row.length;
    const rowH = fieldRowHeight(doc, row, w);

    row.forEach((c, ci) => {
      const x = MARGIN + ci * (w + COL_GUTTER);
      doc.fontSize(6.5).font(SANS).fillColor(INK_FAINT)
        .text(String(c.l).toUpperCase(), x, y, { width: w, lineBreak: false, characterSpacing: 0.3 });
      doc.fontSize(8.5).font(SANS).fillColor(INK)
        .text(String(c.v ?? '—'), x, y + 11, { width: w, lineGap: 1 });
    });

    y += rowH + (ri < rows.length - 1 ? 8 : 0);
  });

  doc.y = y + 12;
}

function measureAddressBlock(doc, value) {
  const text = (value || '').toString().trim();
  if (!text) return 0;
  doc.fontSize(8.5).font(SANS);
  const textH = doc.heightOfString(text, { width: CONTENT, lineGap: 1 });
  return 10 + textH + 8;
}

function addressBlock(doc, label, value) {
  const text = (value || '').toString().trim();
  if (!text) return;

  doc.fontSize(8.5).font(SANS);
  const textH = doc.heightOfString(text, { width: CONTENT, lineGap: 1 });

  const y = doc.y;
  doc.fontSize(6.5).font(SANS_B).fillColor(INK_SOFT)
    .text(label.toUpperCase(), MARGIN, y, { width: CONTENT, characterSpacing: 0.5, lineBreak: false });

  const textY = y + 10;
  doc.fontSize(8.5).font(SANS).fillColor(INK)
    .text(text, MARGIN, textY, { width: CONTENT, lineGap: 1 });

  doc.y = textY + textH + 8;
}

function measureItemsTableHeaderHeight(doc) {
  const PAD_X = 6;
  const PAD_Y = 6;
  doc.fontSize(7.5).font(SANS_B);
  let headerH = 0;
  ITEM_COLS.forEach((c) => {
    const h = doc.heightOfString(c.label, { width: c.width - PAD_X * 2, align: c.align, lineGap: 1 });
    if (h > headerH) headerH = h;
  });
  return headerH + PAD_Y * 2;
}

function itemsTable(doc, items) {
  const PAD_X = 6;
  const PAD_Y = 6;
  const xs = [];
  let acc = MARGIN;
  ITEM_COLS.forEach((c) => { xs.push(acc); acc += c.width; });
  xs.push(acc);

  function drawGridLines(y1, y2) {
    xs.forEach((x) => vRule(doc, x, y1, y2, LINE));
  }

  function drawHeader() {
    doc.fontSize(7.5).font(SANS_B);
    let headerH = 0;
    ITEM_COLS.forEach((c) => {
      const h = doc.heightOfString(c.label, { width: c.width - PAD_X * 2, align: c.align, lineGap: 1 });
      if (h > headerH) headerH = h;
    });
    headerH += PAD_Y * 2;

    ensureSpace(doc, headerH + 24);
    const y = doc.y;

    hRule(doc, y, LINE, MARGIN, MARGIN + CONTENT);
    let x = MARGIN;
    ITEM_COLS.forEach((c) => {
      doc.fontSize(7.5).font(SANS_B).fillColor(INK)
        .text(c.label, x + PAD_X, y + PAD_Y, { width: c.width - PAD_X * 2, align: c.align, lineGap: 1, characterSpacing: 0.3 });
      x += c.width;
    });
    drawGridLines(y, y + headerH);
    hRule(doc, y + headerH, LINE, MARGIN, MARGIN + CONTENT);

    doc.y = y + headerH;
  }

  ensureSectionSpace(doc, 60);
  drawHeader();

  items.forEach((item) => {
    const cells = getItemCells(item);
    doc.fontSize(8).font(SANS);
    let rowH = 0;
    cells.forEach((cell, ci) => {
      const h = doc.heightOfString(String(cell), { width: ITEM_COLS[ci].width - PAD_X * 2, lineGap: 1 });
      if (h > rowH) rowH = h;
    });
    rowH = Math.max(rowH, 9) + PAD_Y * 2;

    if (doc.y + rowH > CONTENT_BOTTOM) {
      doc.addPage();
      drawHeader();
    }

    const y = doc.y;
    let x = MARGIN;
    cells.forEach((cell, ci) => {
      doc.fontSize(8).font(SANS).fillColor(INK)
        .text(String(cell), x + PAD_X, y + PAD_Y, { width: ITEM_COLS[ci].width - PAD_X * 2, align: ITEM_COLS[ci].align, lineGap: 1 });
      x += ITEM_COLS[ci].width;
    });

    drawGridLines(y, y + rowH);
    doc.y = y + rowH;
    hRule(doc, doc.y, LINE_SOFT, MARGIN, MARGIN + CONTENT);
  });

  doc.y += 12;
}

const SUMMARY_TOTAL_W = 260;
const SUMMARY_LABEL_W = 140;
const SUMMARY_PAD_X   = 8;
const SUMMARY_PAD_Y   = 5;

function summaryRowHeight(doc, r) {
  const valueText = `${r.currency} ${fmt(r.v)}`;
  doc.fontSize(r.highlight ? 9.5 : 8.5).font(r.highlight || r.bold ? SANS_B : SANS);
  return Math.max(
    doc.heightOfString(r.l, { width: SUMMARY_LABEL_W - SUMMARY_PAD_X }),
    doc.heightOfString(valueText, { width: SUMMARY_TOTAL_W - SUMMARY_LABEL_W - SUMMARY_PAD_X }),
    9
  ) + SUMMARY_PAD_Y * 2;
}

function measureFinancialSummary(doc, rows, currency) {
  return rows.reduce((s, r) => s + summaryRowHeight(doc, { ...r, currency }), 0);
}

function financialSummary(doc, rows, currency) {
  const totalX = MARGIN + CONTENT - SUMMARY_TOTAL_W;
  const valueW = SUMMARY_TOTAL_W - SUMMARY_LABEL_W;

  const computed = rows.map((r) => ({ ...r, h: summaryRowHeight(doc, { ...r, currency }), valueText: `${currency} ${fmt(r.v)}` }));

  const top = doc.y;
  let y = top;

  hRule(doc, y, LINE, totalX, totalX + SUMMARY_TOTAL_W);
  computed.forEach((r) => {
    const emphFont   = r.highlight || r.bold ? SANS_B : SANS;
    const labelSize  = r.highlight ? 9.5 : 8.5;
    const labelColor = r.highlight || r.bold ? INK : INK_SOFT;

    doc.fontSize(labelSize).font(emphFont).fillColor(labelColor)
      .text(r.l, totalX + SUMMARY_PAD_X, y + SUMMARY_PAD_Y, { width: SUMMARY_LABEL_W - SUMMARY_PAD_X });
    doc.fontSize(labelSize).font(emphFont).fillColor(INK)
      .text(r.valueText, totalX + SUMMARY_LABEL_W, y + SUMMARY_PAD_Y, { width: valueW - SUMMARY_PAD_X, align: 'right' });
    y += r.h;
    hRule(doc, y, r.highlight ? LINE : LINE_SOFT, totalX, totalX + SUMMARY_TOTAL_W);
  });

  vRule(doc, totalX, top, y, LINE);
  vRule(doc, totalX + SUMMARY_LABEL_W, top, y, LINE_SOFT);
  vRule(doc, totalX + SUMMARY_TOTAL_W, top, y, LINE);

  doc.y = y + 14;
}

function measureTextBlock(doc, text) {
  const t = (text || '').toString().trim();
  if (!t) return 0;
  doc.fontSize(8.5).font(SANS);
  return doc.heightOfString(t, { width: CONTENT, align: 'justify', lineGap: 2 });
}

function textBlock(doc, text) {
  const t = (text || '').toString().trim();
  if (!t) return;

  doc.fontSize(8.5).font(SANS);
  const textH = doc.heightOfString(t, { width: CONTENT, align: 'justify', lineGap: 2 });

  const y = doc.y;
  doc.fontSize(8.5).font(SANS).fillColor(INK)
    .text(t, MARGIN, y, { width: CONTENT, align: 'justify', lineGap: 2 });

  doc.y = y + textH + 12;
}

function drawFooter(doc) {
  const range = doc.bufferedPageRange();
  const total = range.count;
  const timestamp = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

  for (let i = range.start; i < range.start + total; i++) {
    doc.switchToPage(i);

    hRule(doc, CONTENT_BOTTOM + 3, LINE_SOFT);

    doc.fontSize(7).font(SANS).fillColor(INK_FAINT)
      .text('Generated by Blinkus.AI', MARGIN, CONTENT_BOTTOM + 8, { width: CONTENT / 3, lineBreak: false });

    doc.fontSize(7).font(SANS).fillColor(INK_FAINT)
      .text(`Generated on ${timestamp}`, MARGIN, CONTENT_BOTTOM + 8, { width: CONTENT, align: 'center', lineBreak: false });

    doc.fontSize(7).font(SANS).fillColor(INK_FAINT)
      .text(`Page ${i - range.start + 1} of ${total}`, MARGIN, CONTENT_BOTTOM + 8, { width: CONTENT, align: 'right', lineBreak: false });
  }
}

export async function buildProformaInvoicePdf(pi, organization, logoUrl) {
  const logoBuf = await fetchLogoBuffer(logoUrl);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
      bufferPages: true,
    });
    const chunks = [];
    doc.on('data',  (c) => chunks.push(c));
    doc.on('end',   () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const ii        = pi.invoiceInfo       || {};
    const exp       = pi.exporterDetails   || {};
    const buyer     = pi.buyerDetails      || {};
    const notify    = pi.notifyParty       || {};
    const consignee = pi.consignee         || {};
    const ship      = pi.shippingInfo      || {};
    const fin       = pi.financialInfo     || {};
    const bank      = pi.bankInfo          || {};
    const items     = pi.commercialDetails || [];
    const currency  = ii.currency || 'USD';

    const totalAmount = items.reduce((s, it) => s + (parseFloat(it.amount) || 0), 0);

    drawLetterhead(doc, { organization, logoBuf });
    drawTitleBlock(doc, {
      title:     'PROFORMA INVOICE',
      docNumber: pi.proformaInvoiceNumber,
      date:      fmtDate(ii.invoiceDate),
    });

    let n = 0;
    const nextNum = () => ++n;

    const infoFields = [
      { l: 'PI Number',       v: pi.proformaInvoiceNumber },
      { l: 'Invoice Date',    v: fmtDate(ii.invoiceDate) },
      { l: 'Currency',        v: ii.currency },
      { l: 'Contract Number', v: pi.contractNumber },
      { l: 'Status',          v: pi.status },
    ].filter((f) => f.v);
    const infoRows = chunkRows(infoFields);
    sectionHeading(doc, nextNum(), 'Proforma Invoice Information', measureFieldRows(doc, infoRows));
    fieldGrid(doc, infoRows);

    const expFields = [
      { l: 'Company Name', v: exp.companyName },
      { l: 'Country',      v: exp.country },
      { l: 'Tax Number',   v: exp.taxNumber },
      { l: 'Email',        v: exp.email },
      { l: 'Phone',        v: exp.phone },
    ].filter((f) => f.v);
    const expRows = chunkRows(expFields);
    doc.y += SECTION_GAP;
    sectionHeading(
      doc, nextNum(), 'Exporter Details',
      measureFieldRows(doc, expRows) + measureAddressBlock(doc, exp.address)
    );
    fieldGrid(doc, expRows);
    addressBlock(doc, 'Address', exp.address);

    const buyerFields = [
      { l: 'Company Name',   v: buyer.companyName },
      { l: 'Contact Person', v: buyer.contactPerson },
      { l: 'Country',        v: buyer.country },
      { l: 'Email',          v: buyer.email },
      { l: 'Phone',          v: buyer.phone },
      { l: 'Tax Number',     v: buyer.taxNumber },
    ].filter((f) => f.v);
    const buyerRows = chunkRows(buyerFields);
    doc.y += SECTION_GAP;
    sectionHeading(
      doc, nextNum(), 'Buyer Details',
      measureFieldRows(doc, buyerRows) + measureAddressBlock(doc, buyer.address)
    );
    fieldGrid(doc, buyerRows);
    addressBlock(doc, 'Address', buyer.address);

    const notifyFields = [
      { l: 'Name',    v: notify.name },
      { l: 'Country', v: notify.country },
      { l: 'Phone',   v: notify.phone },
      { l: 'Email',   v: notify.email },
    ].filter((f) => f.v);
    const notifyRows = chunkRows(notifyFields);
    doc.y += SECTION_GAP;
    sectionHeading(
      doc, nextNum(), 'Notify Party',
      measureFieldRows(doc, notifyRows) + measureAddressBlock(doc, notify.address)
    );
    fieldGrid(doc, notifyRows);
    addressBlock(doc, 'Address', notify.address);

    const consFields = [
      { l: 'Name',    v: consignee.name },
      { l: 'Country', v: consignee.country },
      { l: 'Phone',   v: consignee.phone },
      { l: 'Email',   v: consignee.email },
    ].filter((f) => f.v);
    const consRows = chunkRows(consFields);
    doc.y += SECTION_GAP;
    sectionHeading(
      doc, nextNum(), 'Consignee Details',
      measureFieldRows(doc, consRows) + measureAddressBlock(doc, consignee.address)
    );
    fieldGrid(doc, consRows);
    addressBlock(doc, 'Address', consignee.address);

    const shipFields = [
      { l: 'Port of Loading',    v: ship.portOfLoading },
      { l: 'Port of Discharge',  v: ship.portOfDischarge },
      { l: 'Final Destination',  v: ship.finalDestination },
      { l: 'Country of Origin',  v: ship.countryOfOrigin },
    ].filter((f) => f.v);
    const shipRows = chunkRows(shipFields);
    doc.y += SECTION_GAP;
    sectionHeading(doc, nextNum(), 'Shipping Information', measureFieldRows(doc, shipRows));
    fieldGrid(doc, shipRows);

    doc.y += SECTION_GAP;
    sectionHeading(doc, nextNum(), 'Commercial Details', Math.max(60, measureItemsTableHeaderHeight(doc) + 24));
    itemsTable(doc, items);

    const summaryRows = [
      { l: 'Total Amount', v: totalAmount },
      { l: `Advance (${fmt(fin.advancePercent)}%)`, v: fin.advanceAmount },
      { l: 'Balance Amount', v: fin.balanceAmount, highlight: true },
    ];
    doc.y += SECTION_GAP;
    sectionHeading(doc, nextNum(), 'Financial Summary', measureFinancialSummary(doc, summaryRows, currency));
    financialSummary(doc, summaryRows, currency);

    const bankFields = [
      { l: 'Bank Name',      v: bank.bankName },
      { l: 'Account Number', v: bank.accountNumber },
      { l: 'IFSC',           v: bank.ifsc },
      { l: 'SWIFT',          v: bank.swift },
    ].filter((f) => f.v);
    const bankRows = chunkRows(bankFields);
    doc.y += SECTION_GAP;
    sectionHeading(doc, nextNum(), 'Bank Details', measureFieldRows(doc, bankRows));
    fieldGrid(doc, bankRows);

    if ((pi.notes || '').toString().trim()) {
      doc.y += SECTION_GAP;
      sectionHeading(doc, nextNum(), 'Notes', measureTextBlock(doc, pi.notes));
      textBlock(doc, pi.notes);
    }

    if ((pi.termsAndConditions || '').toString().trim()) {
      doc.y += SECTION_GAP;
      sectionHeading(doc, nextNum(), 'Terms & Conditions', measureTextBlock(doc, pi.termsAndConditions));
      textBlock(doc, pi.termsAndConditions);
    }

    drawFooter(doc);
    doc.flushPages();
    doc.end();
  });
}
