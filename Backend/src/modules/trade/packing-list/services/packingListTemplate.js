import PDFDocument from 'pdfkit';
import {
  MARGIN, CONTENT, CONTENT_BOTTOM,
  fmt, fmtNum, fmtDate, fetchLogoBuffer,
  hRule, ensureSpace,
} from '../../shared/services/pdfKit.js';
import { prepareLogoForPdf } from '../../contracts/services/logoProcessor.js';

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
  { key: 'marks', label: 'MARKS & NOS',          width: 70,  align: 'left'   },
  { key: 'goods', label: 'DESCRIPTION OF GOODS', width: 125, align: 'left'   },
  { key: 'hsn',   label: 'HSN CODE',             width: 50,  align: 'center' },
  { key: 'pkgs',  label: 'NO. & TYPE OF PKGS',   width: 68,  align: 'center' },
  { key: 'net',   label: 'NET WT (KG)',          width: 60,  align: 'right'  },
  { key: 'gross', label: 'GROSS WT (KG)',        width: 60,  align: 'right'  },
  { key: 'qty',   label: 'QUANTITY',             width: CONTENT - (70 + 125 + 50 + 68 + 60 + 60), align: 'right' },
];

function getItemCells(item) {
  const goodsText = item.description
    ? `${item.commodity || '—'} — ${item.description}`
    : (item.commodity || '—');

  return [
    item.marksAndNumbers || '—',
    goodsText,
    item.hsnCode || '—',
    `${fmtNum(item.numberOfPackages)} ${item.packagingType || ''}`.trim(),
    fmt(item.netWeight),
    fmt(item.grossWeight),
    `${fmtNum(item.quantity)} ${item.unit || ''}`.trim(),
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
  const t = (title || 'PACKING LIST').toUpperCase();
  const titleOpts = { width: CONTENT, align: 'center', characterSpacing: 1.4 };

  doc.fontSize(18).font(SANS_B);
  const titleH = doc.heightOfString(t, titleOpts);

  const y = doc.y;
  doc.fillColor(INK).text(t, MARGIN, y, titleOpts);
  doc.y = y + titleH + 6;

  const meta = [
    docNumber ? `PL NO. ${docNumber}` : null,
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

function itemsTable(doc, items, totals) {
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

  if (totals) {
    const rowH = 22;
    if (doc.y + rowH > CONTENT_BOTTOM) {
      doc.addPage();
      drawHeader();
    }

    const y = doc.y;
    const labelW = ITEM_COLS[0].width + ITEM_COLS[1].width + ITEM_COLS[2].width;

    doc.fontSize(8).font(SANS_B).fillColor(INK)
      .text('TOTAL', MARGIN + PAD_X, y + PAD_Y, { width: labelW - PAD_X * 2, align: 'left', lineBreak: false });

    const cells = [
      fmtNum(totals.numberOfPackages),
      fmt(totals.netWeight),
      fmt(totals.grossWeight),
      fmtNum(totals.quantity),
    ];

    let x = MARGIN + labelW;
    [ITEM_COLS[3], ITEM_COLS[4], ITEM_COLS[5], ITEM_COLS[6]].forEach((c, ci) => {
      doc.fontSize(8).font(SANS_B).fillColor(INK)
        .text(cells[ci], x + PAD_X, y + PAD_Y, { width: c.width - PAD_X * 2, align: c.align, lineBreak: false });
      x += c.width;
    });

    drawGridLines(y, y + rowH);
    doc.y = y + rowH;
    hRule(doc, doc.y, LINE, MARGIN, MARGIN + CONTENT);
  }

  doc.y += 12;
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

export async function buildPackingListPdf(pl, organization, logoUrl) {
  const logoBuf = await prepareLogoForPdf(await fetchLogoBuffer(logoUrl));

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

    const pli       = pl.packingListInfo || {};
    const exp        = pl.exporterDetails || {};
    const buyer       = pl.buyerDetails    || {};
    const consignee  = pl.consignee       || {};
    const ship       = pl.shippingDetails || {};
    const items      = pl.packingItems    || [];

    const totals = items.reduce((acc, it) => ({
      numberOfPackages: acc.numberOfPackages + (parseFloat(it.numberOfPackages) || 0),
      netWeight:        acc.netWeight        + (parseFloat(it.netWeight)        || 0),
      grossWeight:      acc.grossWeight      + (parseFloat(it.grossWeight)      || 0),
      quantity:         acc.quantity         + (parseFloat(it.quantity)         || 0),
    }), { numberOfPackages: 0, netWeight: 0, grossWeight: 0, quantity: 0 });

    drawLetterhead(doc, { organization, logoBuf });
    drawTitleBlock(doc, {
      title:     'PACKING LIST',
      docNumber: pl.packingListNumber,
      date:      fmtDate(pli.date),
    });

    let n = 0;
    const nextNum = () => ++n;

    const infoFields = [
      { l: 'PL Number',       v: pl.packingListNumber },
      { l: 'Date',            v: fmtDate(pli.date) },
      { l: 'Contract Number', v: pl.contractNumber },
      { l: 'Status',          v: pl.status },
    ].filter((f) => f.v);
    const infoRows = chunkRows(infoFields);
    sectionHeading(doc, nextNum(), 'Packing List Information', measureFieldRows(doc, infoRows));
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
      { l: 'Port of Loading',   v: ship.portOfLoading },
      { l: 'Port of Discharge', v: ship.portOfDischarge },
      { l: 'Vessel',            v: ship.vessel },
      { l: 'Container Number',  v: ship.containerNumber },
      { l: 'Seal Number',       v: ship.sealNumber },
    ].filter((f) => f.v);
    const shipRows = chunkRows(shipFields);
    doc.y += SECTION_GAP;
    sectionHeading(doc, nextNum(), 'Shipping Details', measureFieldRows(doc, shipRows));
    fieldGrid(doc, shipRows);

    doc.y += SECTION_GAP;
    sectionHeading(doc, nextNum(), 'Item Details', Math.max(60, measureItemsTableHeaderHeight(doc) + 24));
    itemsTable(doc, items, totals);

    if ((pl.remarks || '').toString().trim()) {
      doc.y += SECTION_GAP;
      sectionHeading(doc, nextNum(), 'Remarks', measureTextBlock(doc, pl.remarks));
      textBlock(doc, pl.remarks);
    }

    if ((pl.termsAndConditions || '').toString().trim()) {
      doc.y += SECTION_GAP;
      sectionHeading(doc, nextNum(), 'Terms & Conditions', measureTextBlock(doc, pl.termsAndConditions));
      textBlock(doc, pl.termsAndConditions);
    }

    drawFooter(doc);
    doc.flushPages();
    doc.end();
  });
}
