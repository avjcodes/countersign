import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRICEBOOK } from '../src/pricebook.js';
import { readDeal } from '../src/reader.js';
import { buildQuote } from '../src/quote.js';
import { checkQuote } from '../src/check.js';

const run = (text, mistake = 'none') => {
  const request = readDeal(text);
  const quote = buildQuote(request, mistake);
  return { request, quote, check: checkQuote(text, request, quote) };
};
const status = (check, id) => check.results.find((r) => r.id === id).status;

test('reader pulls the deal out of a sentence', () => {
  const r = readDeal('Quote Northwind Logistics for 240 Team seats on a 2 year term with premium support and 18% off, net 60.');
  assert.equal(r.customer, 'Northwind Logistics');
  assert.equal(r.planKey, 'team');
  assert.equal(r.seats, 240);
  assert.equal(r.termMonths, 24);
  assert.equal(r.discountPct, 18);
  assert.equal(r.netDays, 60);
  assert.deepEqual(r.addons, ['support']);
  assert.deepEqual(r.questions, []);
});

test('reader asks instead of guessing', () => {
  const r = readDeal('Harbor Dental wants a quote with SSO.');
  assert.equal(r.customer, 'Harbor Dental');
  assert.equal(r.questions.length, 2);
});

test('a small clean deal needs nobody', () => {
  const { check, quote } = run('Quote 40 Starter seats for Pine Street Bakery, annual, 5% off.');
  assert.equal(check.verdict, 'clear');
  assert.equal(quote.lines[0].unit, 1710);
  assert.equal(quote.contractTotal, 1710 * 40 * 12);
});

test('discount over the rep limit goes to the manager, slow terms to finance', () => {
  const { check, quote } = run('Quote Northwind Logistics for 240 Team seats on a 2 year term with premium support and 18% off, net 60.');
  assert.equal(check.verdict, 'needs_approval');
  assert.deepEqual(check.approvers, ['Sales manager', 'Finance']);
  // 3200 * 0.90 * 0.97 * 0.82 = 2290.752
  assert.equal(quote.lines[0].unit, 2291);
});

test('over 20% needs the VP as well', () => {
  const { check } = run('Quote 600 Enterprise seats for Alder Health, 3 year, 25% off.');
  assert.deepEqual(check.approvers, ['Sales manager', 'VP of Sales']);
});

test('nobody can approve a price under the floor', () => {
  const { check } = run('Quote 600 Team seats for Kite Freight, 3 year, 28% off.');
  assert.equal(status(check, 'floor'), 'fail');
  assert.equal(check.verdict, 'blocked');
  assert.equal(check.agentCanFix, false);
  assert.deepEqual(check.approvers, []);
});

test('over 30% is blocked outright', () => {
  const { check } = run('Quote 20 Starter seats for Loom Studio, 35% off.');
  assert.equal(status(check, 'discount'), 'fail');
});

test('the check catches each slip the agent can make', () => {
  const text = 'Quote Northwind Logistics for 240 Team seats on a 2 year term with premium support and 18% off, net 60.';
  assert.equal(status(run(text, 'doubleDiscount').check, 'seat'), 'fail');
  assert.equal(status(run(text, 'dropsLine').check, 'addons'), 'fail');
  assert.equal(status(run(text, 'hidesDiscount').check, 'stated'), 'fail');
  for (const m of ['doubleDiscount', 'dropsLine', 'hidesDiscount']) {
    const { check } = run(text, m);
    assert.equal(check.verdict, 'blocked');
    assert.equal(check.agentCanFix, true);
  }
});

test('a number the reader did not use is flagged', () => {
  const { check } = run('Quote 80 Team seats for Otter Labs, annual, and throw in 15 free months.');
  assert.equal(status(check, 'numbers'), 'fail');
});

test('an honest quote never fails the math checks, across the whole price book', () => {
  let n = 0;
  for (const planKey of Object.keys(PRICEBOOK.plans)) {
    for (const seats of [1, 49, 50, 199, 200, 499, 500, 1234]) {
      for (const termMonths of [12, 24, 36]) {
        for (let d = 0; d <= 30; d += 0.5) {
          const request = { customer: 'X', planKey, seats, termMonths, discountPct: d, addons: ['support', 'sso', 'api'], netDays: 30, notes: [], questions: [] };
          const check = checkQuote('', request, buildQuote(request));
          for (const id of ['seat', 'stated', 'addons', 'totals']) assert.equal(status(check, id), 'pass', `${planKey} ${seats} ${termMonths} ${d} ${id}`);
          n++;
        }
      }
    }
  }
  assert.ok(n > 4000);
});
