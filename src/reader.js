// The reader turns a sentence about a deal into a structured request.
//
// In a production system a language model sits in this seat. In this concept it is a
// small rule-based reader, so the page runs in a browser with no server and no API key.
// The rest of the system does not care which one it is: the check never trusts the
// reader or the quote, and works everything out again from the price book.

const WORD_NUMBERS = { one: 1, two: 2, three: 3 };
const NOT_A_NAME = /^(starter|team|enterprise|quote|price|need|i|we|they|sso|api|net|premium|support|can|please|a|an|the|no|and)$/i;

export function readDeal(text) {
  const request = {
    customer: null,
    planKey: null,
    seats: null,
    termMonths: null,
    discountPct: 0,
    addons: [],
    netDays: 30,
    notes: [],      // things the reader assumed, said out loud
    questions: [],  // things it will not guess
  };

  // The customer is the first run of capitalised words that is not a word the price book owns.
  const runs = text.match(/[A-Z][\w&.'-]*(?:\s+(?:&\s+)?[A-Z][\w&.'-]*)*/g) || [];
  for (const run of runs) {
    const words = run.replace(/[.:,]+$/, '').split(/\s+/).filter((w) => !NOT_A_NAME.test(w));
    if (words.length) { request.customer = words.join(' '); break; }
  }

  const plan = text.match(/\b(starter|team|enterprise)\b/i);
  if (plan) request.planKey = plan[1].toLowerCase();

  const seats = text.match(/(\d[\d,]*)\s*(?:\w+\s+)?(?:seats?|users?|licen[sc]es?|people)\b/i);
  if (seats) request.seats = Number(seats[1].replace(/,/g, ''));

  const term = text.match(/\b(\d+|one|two|three)[\s-]*(years?|yrs?|months?|mos?)\b/i);
  if (term) {
    const n = WORD_NUMBERS[term[1].toLowerCase()] ?? Number(term[1]);
    request.termMonths = /^y/i.test(term[2]) ? n * 12 : n;
  } else if (/\bannual(ly)?\b/i.test(text)) {
    request.termMonths = 12;
  }

  const discount = text.match(/(\d+(?:\.\d+)?)\s*(?:%|percent)/i);
  if (discount) request.discountPct = Number(discount[1]);

  const net = text.match(/\bnet[\s-]*(\d+)\b/i);
  if (net) request.netDays = Number(net[1]);

  if (/\bsupport\b/i.test(text)) request.addons.push('support');
  if (/\bsso\b|single sign/i.test(text)) request.addons.push('sso');
  if (/\bapi\b/i.test(text)) request.addons.push('api');

  // Say what was assumed. Ask about what cannot be assumed.
  if (!request.planKey) request.questions.push('Which plan: Starter, Team or Enterprise?');
  if (!request.seats) request.questions.push('How many seats?');
  if (!request.termMonths) {
    request.termMonths = 12;
    request.notes.push('No term was given, so I used 12 months.');
  } else if (![12, 24, 36].includes(request.termMonths)) {
    request.questions.push(`I can quote 12, 24 or 36 months. You asked for ${request.termMonths}.`);
  }
  if (!request.customer) request.notes.push('I could not find a customer name.');

  return request;
}
