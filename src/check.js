// The check. It is deliberately a separate piece of code from the agent.
//
// It gets three things: the original sentence, what the reader understood, and the quote.
// It trusts none of them. It works the price out again from the price book, compares,
// and decides who has to approve. The agent has no say in that.

import { PRICEBOOK, money } from './pricebook.js';

// Checks the agent can fix by trying again. The rest are about the deal itself.
export const AGENT_FIXABLE = ['seat', 'stated', 'addons', 'totals'];

// Seat price before the rep's own discount, as a fraction: [top, bottom].
function seatBeforeAsk(request, book) {
  const plan = book.plans[request.planKey];
  let volumePct = 0;
  for (const tier of book.volumeTiers) {
    if (request.seats >= tier.min) { volumePct = tier.pct; break; }
  }
  const termPct = book.termDiscounts[request.termMonths] ?? 0;
  return [plan.seatMonthly * (100 - volumePct) * (100 - termPct), 10_000];
}

export function checkQuote(text, request, quote, book = PRICEBOOK) {
  const results = [];
  const add = (id, label, status, detail) => results.push({ id, label, status, detail });
  const plan = book.plans[request.planKey];
  const policy = book.policy;
  const approvers = [];

  // 1. Nothing in the sentence was quietly dropped.
  const mentioned = (text.match(/\d[\d,]*(?:\.\d+)?/g) || []).map((n) => Number(n.replace(/,/g, '')));
  const used = [request.seats, request.discountPct, request.netDays, request.termMonths, request.termMonths / 12];
  const dropped = mentioned.filter((n) => !used.includes(n));
  add('numbers', 'Every number in the request is used',
    dropped.length ? 'fail' : 'pass',
    dropped.length ? `Not used anywhere: ${dropped.join(', ')}.` : 'Seats, term, discount and payment terms all trace back to the request.');

  // 2. The seat price, worked out again from the price book.
  const [top, bottom] = seatBeforeAsk(request, book);
  const askTenths = Math.round(request.discountPct * 10);
  const expectedSeat = Math.round(top * (1000 - askTenths) / (bottom * 1000));
  const planLine = quote.lines.find((l) => l.id === 'plan');
  const quotedSeat = planLine ? planLine.unit : 0;
  const seatOk = quotedSeat === expectedSeat && planLine.monthly === expectedSeat * request.seats;
  add('seat', 'Seat price matches the price book',
    seatOk ? 'pass' : 'fail',
    seatOk ? `${money(expectedSeat)} a seat a month.` : `The quote says ${money(quotedSeat)}. The price book gives ${money(expectedSeat)}.`);

  // 3. The discount written on the quote is the discount actually charged.
  const charged = Math.round((1 - quotedSeat * bottom / top) * 1000) / 10;
  const honest = Math.abs(charged - quote.statedDiscountPct) < 0.2;
  add('stated', 'The discount stated is the discount charged',
    honest ? 'pass' : 'fail',
    honest ? `${quote.statedDiscountPct}% stated, ${charged}% charged.` : `The quote states ${quote.statedDiscountPct}% but the price works out to ${charged}%.`);

  // 4. Add-ons: everything asked for, nothing extra.
  const wanted = request.addons.filter((a) => !plan.includes.includes(a));
  const quoted = quote.lines.filter((l) => l.id !== 'plan').map((l) => l.id);
  const missing = wanted.filter((a) => !quoted.includes(a));
  const extra = quoted.filter((a) => !wanted.includes(a));
  add('addons', 'Add-ons match the request',
    missing.length || extra.length ? 'fail' : 'pass',
    missing.length ? `Missing: ${missing.map((a) => book.addons[a].name).join(', ')}.`
      : extra.length ? `Not asked for: ${extra.map((a) => book.addons[a].name).join(', ')}.`
      : wanted.length ? 'All there.' : 'None to add.');

  // 5. The totals add up.
  const sum = quote.lines.reduce((s, l) => s + l.monthly, 0);
  const totalsOk = sum === quote.monthlyTotal && quote.contractTotal === sum * request.termMonths;
  add('totals', 'The totals add up',
    totalsOk ? 'pass' : 'fail',
    totalsOk ? `${money(quote.monthlyTotal)} a month, ${money(quote.contractTotal)} over ${request.termMonths} months.` : 'The lines do not sum to the total.');

  // 6. Never below the floor price. Nobody can approve this one.
  const aboveFloor = expectedSeat >= plan.floor;
  const room = Math.min(Math.floor((1 - plan.floor * bottom / top) * 100), policy.vpMaxPct);
  add('floor', 'Above the floor price',
    aboveFloor ? 'pass' : 'fail',
    aboveFloor ? `The floor is ${money(plan.floor)} a seat.` : `${money(expectedSeat)} a seat is under the ${money(plan.floor)} floor. The most this deal can take is ${room}% off.`);

  // 7. Who has to sign off on the discount.
  const pct = request.discountPct;
  if (pct > policy.vpMaxPct) {
    add('discount', 'Discount is more than anyone can approve', 'fail', `${pct}% is over the ${policy.vpMaxPct}% limit. The deal has to be reworked.`);
  } else if (pct > policy.managerMaxPct) {
    approvers.push('Sales manager', 'VP of Sales');
    add('discount', 'Discount needs sign-off', 'flag', `${pct}% is over what a manager can approve alone (${policy.managerMaxPct}%). Manager and VP.`);
  } else if (pct > policy.repMaxPct) {
    approvers.push('Sales manager');
    add('discount', 'Discount needs sign-off', 'flag', `${pct}% is over the ${policy.repMaxPct}% a rep can give. Manager.`);
  } else {
    add('discount', 'Discount is within the rep limit', 'pass', pct ? `${pct}% is within the ${policy.repMaxPct}% a rep can give.` : 'No discount asked for.');
  }

  // 8. Slow payment terms go to finance.
  if (request.netDays > policy.standardNetDays) {
    approvers.push('Finance');
    add('terms', 'Payment terms need sign-off', 'flag', `Net ${request.netDays} is slower than the standard net ${policy.standardNetDays}. Finance.`);
  } else {
    add('terms', 'Payment terms are standard', 'pass', `Net ${request.netDays}.`);
  }

  const failed = results.filter((r) => r.status === 'fail');
  return {
    results,
    approvers: failed.length ? [] : approvers,
    verdict: failed.length ? 'blocked' : approvers.length ? 'needs_approval' : 'clear',
    agentCanFix: failed.length > 0 && failed.every((r) => AGENT_FIXABLE.includes(r.id)),
  };
}
