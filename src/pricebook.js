// The price book and the approval policy. Everything here is made up for the concept.
// All money is in cents.

export const PRICEBOOK = {
  plans: {
    starter:    { name: 'Starter',    seatMonthly: 1800, floor: 1050, includes: [] },
    team:       { name: 'Team',       seatMonthly: 3200, floor: 1900, includes: [] },
    enterprise: { name: 'Enterprise', seatMonthly: 5800, floor: 3400, includes: ['sso'] },
  },
  addons: {
    support: { name: 'Premium support', pctOfSubscription: 12 },
    sso:     { name: 'Single sign-on',  seatMonthly: 400 },
    api:     { name: 'API pack',        flatMonthly: 90000 },
  },
  // Automatic discounts. No one has to approve these.
  volumeTiers: [
    { min: 500, pct: 15 },
    { min: 200, pct: 10 },
    { min: 50,  pct: 5 },
    { min: 1,   pct: 0 },
  ],
  termDiscounts: { 12: 0, 24: 3, 36: 5 },
  // Who may sign off on a discount the rep asks for, and on slow payment terms.
  policy: {
    repMaxPct: 10,
    managerMaxPct: 20,
    vpMaxPct: 30,
    standardNetDays: 30,
  },
};

export function money(cents) {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}
