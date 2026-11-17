const test = require('node:test');
const assert = require('node:assert/strict');
const {
  startOf, deadlineEnd, matchReminder, closingReminderDue,
} = require('../../src/rules/reminders');

const at = (iso) => new Date(iso);

test('jogo: lembrete de 24 h, de 2 h, e nenhum fora da janela ou depois do início', () => {
  const start = startOf('2026-12-10', '19:00');
  assert.equal(matchReminder(start, at('2026-12-09T18:00:00')), null);
  assert.equal(matchReminder(start, at('2026-12-09T19:00:00')), '24h');
  assert.equal(matchReminder(start, at('2026-12-10T16:59:00')), '24h');
  assert.equal(matchReminder(start, at('2026-12-10T17:00:00')), '2h');
  assert.equal(matchReminder(start, at('2026-12-10T19:00:00')), null);
});

test('jogo logo depois da meia-noite: o lembrete de 2 h sai no dia anterior', () => {
  assert.equal(matchReminder(startOf('2026-12-11', '00:30'), at('2026-12-10T23:00:00')), '2h');
});

test('encerramento de inscrições: 48 h antes do fim do dia do prazo', () => {
  assert.deepEqual(deadlineEnd('2026-12-31'), at('2027-01-01T00:00:00'));
  assert.equal(closingReminderDue('2026-12-05', at('2026-12-03T23:59:00')), false);
  assert.equal(closingReminderDue('2026-12-05', at('2026-12-04T00:00:00')), true);
  assert.equal(closingReminderDue('2026-12-05', at('2026-12-05T23:59:00')), true);
  assert.equal(closingReminderDue('2026-12-05', at('2026-12-06T00:00:00')), false);
});
