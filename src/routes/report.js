const express = require('express');
const PDFDocument = require('pdfkit');
const { REGISTRATION_STATUS } = require('../constants');
const { requireActiveOrganizer } = require('../middleware/auth');
const { render403, render404 } = require('../middleware/session');
const { getChampionship, categoriesWithIds } = require('../models/championships');
const { listRegistrationsByChampionship } = require('../models/registrations');
const { groupByCategory, toCsv } = require('../rules/report');
const { formatBrDateTime } = require('../validation/dates');

const router = express.Router();

/** RFS22: any of the organizer's championships, whatever its status (the report is also history). */
function loadReport(req, res, next) {
  const { db } = req.app.locals;
  const championship = getChampionship(db, Number(req.params.id));
  if (!championship) return render404(res);
  if (championship.organizer_id !== req.user.id) return render403(res);
  const categories = categoriesWithIds(db, championship.id);
  const filters = {
    category_id: typeof req.query.category_id === 'string' ? req.query.category_id : '',
    status: typeof req.query.status === 'string' ? req.query.status : '',
  };
  const criteria = {
    categoryId: categories.some((c) => String(c.id) === filters.category_id) ? Number(filters.category_id) : null,
    status: filters.status in REGISTRATION_STATUS ? filters.status : null,
  };
  req.report = {
    championship,
    categories,
    filters,
    query: new URLSearchParams(filters).toString(),
    groups: groupByCategory(categories, listRegistrationsByChampionship(db, championship.id, criteria)),
    entryLabel: championship.sport === 'street_run' ? 'Participante' : 'Equipe',
  };
  return next();
}

const GUARDS = [requireActiveOrganizer, loadReport];

router.get('/my/championships/:id/report', ...GUARDS, (req, res) => {
  res.render('report/index', { title: `Relatório de inscrições — ${req.report.championship.name}`, ...req.report });
});

const lineOf = (group, r) => [
  group.name, r.entryName, r.user_name, REGISTRATION_STATUS[r.status], formatBrDateTime(r.created_at),
  formatBrDateTime(r.decided_at), r.refuse_reason ?? '',
];

router.get('/my/championships/:id/report.csv', ...GUARDS, (req, res) => {
  const { championship, groups, entryLabel } = req.report;
  const header = ['Categoria', entryLabel, 'Responsável', 'Status', 'Data do pedido', 'Data da decisão', 'Motivo da recusa'];
  res.type('text/csv; charset=utf-8');
  res.attachment(`inscricoes-campeonato-${championship.id}.csv`);
  res.send(toCsv(header, groups.flatMap((g) => g.rows.map((r) => lineOf(g, r)))));
});

router.get('/my/championships/:id/report.pdf', ...GUARDS, (req, res) => {
  const { championship, groups, filters, categories, entryLabel } = req.report;
  res.type('application/pdf');
  res.attachment(`inscricoes-campeonato-${championship.id}.pdf`);
  const doc = new PDFDocument({ size: 'A4', margin: 40, info: { Title: `Inscrições — ${championship.name}` } });
  doc.pipe(res);
  doc.fontSize(16).text(`Relatório de inscrições — ${championship.name}`);
  const category = categories.find((c) => String(c.id) === filters.category_id)?.name ?? 'Todas';
  const status = REGISTRATION_STATUS[filters.status] ?? 'Todos';
  doc.fontSize(9).fillColor('#555').text(`Categoria: ${category} · Status: ${status} · Gerado em ${formatBrDateTime(new Date().toISOString())}`);
  doc.fillColor('#000').moveDown();
  if (!groups.length) doc.fontSize(11).text('Nenhuma inscrição encontrada.');
  const columns = [[entryLabel, 150], ['Responsável', 120], ['Status', 70], ['Pedido', 85], ['Decisão', 85]];
  for (const group of groups) {
    const summary = Object.entries(group.totals).filter(([, n]) => n).map(([s, n]) => `${REGISTRATION_STATUS[s]}: ${n}`).join(' · ');
    doc.fontSize(12).font('Helvetica-Bold').text(group.name).font('Helvetica').fontSize(9).text(summary).moveDown(0.3);
    // Long names wrap inside their column; the row is as tall as its tallest cell, and moves whole to the next page.
    const row = (cells, bold = false) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica');
      const height = Math.max(...cells.map((cell, i) => doc.heightOfString(cell || ' ', { width: columns[i][1] - 6 }))) + 4;
      if (doc.y + height > doc.page.height - doc.page.margins.bottom) doc.addPage();
      const y = doc.y;
      let x = doc.page.margins.left;
      cells.forEach((cell, i) => {
        doc.text(cell, x, y, { width: columns[i][1] - 6 });
        x += columns[i][1];
      });
      doc.x = doc.page.margins.left;
      doc.y = y + height;
    };
    row(columns.map(([label]) => label), true);
    for (const r of group.rows) {
      row([r.entryName, r.user_name, REGISTRATION_STATUS[r.status], formatBrDateTime(r.created_at), formatBrDateTime(r.decided_at)]);
    }
    doc.moveDown();
  }
  doc.end();
});

module.exports = router;
