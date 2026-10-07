// The agent's side: build a quote from a request.
// `mistake` makes the agent get it wrong on purpose, so you can watch the check catch it.

import { PRICEBOOK } from './pricebook.js';

export const MISTAKES = {
  none: 'No slip',
  doubleDiscount: 'Applies the discount twice',
  dropsLine: 'Leaves an add-on off',
  hidesDiscount: 'States a smaller discount than it charged',
};

export function buildQuote(request, mistake = 'none', book = PRICEBOOK) {
  const plan = book.plans[request.planKey];
  const volumePct = book.volumeTiers.find((t) => request.seats >= t.min).pct;
  const termPct = book.termDiscounts[request.termMonths] ?? 0;
  const askTenths = Math.round(request.discountPct * 10);

  // Whole-number math with one division at the end, so there is exactly one rounding.
  let top = plan.seatMonthly * (100 - volumePct) * (100 - termPct) * (1000 - askTenths);
  let bottom = 10_000_000;
  if (mistake === 'doubleDiscount') { top *= (1000 - askTenths); bottom *= 1000; }
  const netSeat = Math.round(top / bottom);

  const subscription = netSeat * request.seats;
  const lines = [{ id: 'plan', label: `${plan.name} plan`, qty: request.seats, unit: netSeat, monthly: subscription }];

  let addons = request.addons.filter((a) => !plan.includes.includes(a));
  if (mistake === 'dropsLine' && addons.length) addons = addons.slice(1);
  for (const key of addons) {
    const addon = book.addons[key];
    if (addon.seatMonthly) {
      lines.push({ id: key, label: addon.name, qty: request.seats, unit: addon.seatMonthly, monthly: addon.seatMonthly * request.seats });
    } else if (addon.flatMonthly) {
      lines.push({ id: key, label: addon.name, qty: 1, unit: addon.flatMonthly, monthly: addon.flatMonthly });
    } else {
      const amount = Math.round(subscription * addon.pctOfSubscription / 100);
      lines.push({ id: key, label: `${addon.name}, ${addon.pctOfSubscription}% of the plan`, qty: 1, unit: amount, monthly: amount });
    }
  }

  const monthlyTotal = lines.reduce((sum, l) => sum + l.monthly, 0);
  return {
    customer: request.customer,
    planKey: request.planKey,
    seats: request.seats,
    termMonths: request.termMonths,
    netDays: request.netDays,
    listSeat: plan.seatMonthly,
    volumePct,
    termPct,
    statedDiscountPct: mistake === 'hidesDiscount' ? Math.min(request.discountPct, book.policy.repMaxPct) : request.discountPct,
    lines,
    monthlyTotal,
    contractTotal: monthlyTotal * request.termMonths,
  };
}
