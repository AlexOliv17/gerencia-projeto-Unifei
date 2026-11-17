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

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** "HH:MM" (00:00–23:59) → minutes since midnight, or null. */
function parseTime(value) {
  if (typeof value !== 'string') return null;
  const match = TIME.exec(value.trim());
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function formatTime(minutes) {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/** ISO timestamp → "DD/MM/AAAA HH:MM" in the server's local time. */
function formatBrDateTime(isoTimestamp) {
  if (!isoTimestamp) return '';
  const d = new Date(isoTimestamp);
  return `${formatBrDate(toIso(d))} ${formatTime(d.getHours() * 60 + d.getMinutes())}`;
}

function todayIso() {
  return toIso(new Date());
}

function addDaysIso(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  return toIso(new Date(y, m - 1, d + days));
}

module.exports = {
  parseBrDate, formatBrDate, todayIso, addDaysIso, parseTime, formatTime, formatBrDateTime,
};
