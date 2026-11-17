const { REGISTRATION_STATUS } = require('../constants');

/** RFS22: registrations per category (in category order), with the count of each status. */
function groupByCategory(categories, registrations) {
  return categories.map((category) => {
    const rows = registrations.filter((r) => r.category_id === category.id);
    const totals = Object.fromEntries(Object.keys(REGISTRATION_STATUS).map((s) => [s, rows.filter((r) => r.status === s).length]));
    return { id: category.id, name: category.name, rows, totals };
  }).filter((group) => group.rows.length);
}

/**
 * One CSV field: quoted when it has the separator, quotes or line breaks; a leading = + - @ gets an apostrophe so a
 * spreadsheet does not run it as a formula.
 */
function csvField(value) {
  let text = value == null ? '' : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** UTF-8 with BOM and ";" so Excel in Portuguese opens it with accents and columns right. */
function toCsv(header, lines) {
  return `﻿${[header, ...lines].map((line) => line.map(csvField).join(';')).join('\r\n')}\r\n`;
}

module.exports = { groupByCategory, csvField, toCsv };
