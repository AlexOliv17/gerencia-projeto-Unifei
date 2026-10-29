const BR_DATE = /^(\d{2})\/(\d{2})\/(\d{4})$/;

const pad = (n) => String(n).padStart(2, '0');

function toIso(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Converts "DD/MM/AAAA" to "YYYY-MM-DD"; returns null for any other format or a nonexistent date. */
function parseBrDate(value) {
  if (typeof value !== 'string') return null;
  const match = BR_DATE.exec(value.trim());
  if (!match) return null;
  const [, d, m, y] = match.map(Number);
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return toIso(date);
}

function formatBrDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function todayIso() {
  return toIso(new Date());
}

function addDaysIso(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  return toIso(new Date(y, m - 1, d + days));
}

module.exports = { parseBrDate, formatBrDate, todayIso, addDaysIso };
