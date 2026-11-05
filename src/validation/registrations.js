const { MESSAGES } = require('../constants');

const isFull = (championship, approvedInCategory) => Boolean(championship.max_slots)
  && approvedInCategory >= championship.max_slots;

/**
 * RFS15 rules for a new request. `team` is null for a street run (individual registration).
 * Returns the status the request gets, or the reason it is refused.
 */
function checkRequest({ championship, categoryIds, categoryId, user, team, approvedInCategory, hasOpen }) {
  const refuse = (error) => ({ error, status: null });
  if (championship.displayStatus !== 'open') return refuse(MESSAGES.registrationClosed);
  if (championship.organizer_id === user.id) return refuse(MESSAGES.registrationOwnChampionship);
  if (!categoryIds.includes(categoryId)) return refuse(MESSAGES.required);
  const individual = championship.sport === 'street_run';
  if (individual ? team : team?.sport !== championship.sport) return refuse(MESSAGES.registrationSportMismatch);
  if (hasOpen) return refuse(MESSAGES.registrationDuplicate);
  if (isFull(championship, approvedInCategory)) {
    return championship.allow_waitlist ? { error: null, status: 'waitlist' } : refuse(MESSAGES.registrationFull);
  }
  return { error: null, status: 'pending' };
}

/** RFS16: the organizer decides pending or waitlisted requests while the championship is active. */
function checkDecision({ championship, registration, approvedInCategory, action }) {
  if (championship.status !== 'active') return MESSAGES.registrationReviewClosed;
  if (!['pending', 'waitlist'].includes(registration.status)) return MESSAGES.registrationAlreadyDecided;
  if (action === 'approve' && isFull(championship, approvedInCategory)) return MESSAGES.registrationNoSlots;
  return null;
}

module.exports = { checkRequest, checkDecision };
