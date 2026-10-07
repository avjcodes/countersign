import { PRICEBOOK, money } from './pricebook.js';
import { readDeal } from './reader.js';
import { buildQuote, MISTAKES } from './quote.js';
import { checkQuote } from './check.js';

const EXAMPLES = [
  { label: 'Needs a manager and finance', text: 'Quote Northwind Logistics for 240 Team seats on a 2 year term with premium support and 18% off, net 60.' },
  { label: 'Small and clean', text: 'Quote 40 Starter seats for Pine Street Bakery, annual, 5% off.' },
  { label: 'Needs the VP', text: 'Quote 600 Enterprise seats for Alder Health, 3 year, 25% off, with API.' },
  { label: 'Too deep to approve', text: 'Quote 600 Team seats for Kite Freight, 3 year, 28% off.' },
  { label: 'Missing details', text: 'Harbor Dental wants a quote with SSO.' },
];

const NS = 'http://www.w3.org/2000/svg';
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
};
const names = (list) => (list.length < 3 ? list.join(' and ') : list.slice(0, -1).join(', ') + ' and ' + list.at(-1));
const svg = (tag, attrs = {}, text) => {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
};

// Everything on the page plays out over time. `speed` 0 means "show the result at once".
let speed = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1;
let runId = 0;
let state = null;
let ref = 4107;
const CANCEL = Symbol('cancel');
const sleep = (ms) => (speed === 0 ? Promise.resolve() : new Promise((r) => setTimeout(r, ms * speed)));

// ---------------------------------------------------------------- the route drawing

const R = 50; // radius of the check's ring
let G = null; // geometry of the current drawing
let wires, nodes;

function geometry(signers) {
  const vertical = window.innerWidth < 760;
  if (!vertical) {
    const ys = { 0: [], 1: [210], 2: [125, 295], 3: [80, 210, 340] }[signers];
    return { vertical, box: [860, 420], start: [0, 210], agent: [120, 210], gate: [370, 210], sent: [790, 210], signers: ys.map((y) => [610, y]) };
  }
  const xs = { 0: [], 1: [170], 2: [85, 255], 3: [55, 170, 285] }[signers];
  return { vertical, box: [340, 600], start: [170, 0], agent: [170, 70], gate: [170, 240], sent: [170, 540], signers: xs.map((x) => [x, 410]) };
}

const gateIn = () => (G.vertical ? [G.gate[0], G.gate[1] - R - 12] : [G.gate[0] - R - 12, G.gate[1]]);
const gateOut = () => (G.vertical ? [G.gate[0], G.gate[1] + R + 12] : [G.gate[0] + R + 12, G.gate[1]]);
const straight = (a, b) => `M${a[0]} ${a[1]} L${b[0]} ${b[1]}`;
function bend(a, b) {
  const k = G.vertical ? (b[1] - a[1]) / 2 : (b[0] - a[0]) / 2;
  return G.vertical
    ? `M${a[0]} ${a[1]} C${a[0]} ${a[1] + k} ${b[0]} ${b[1] - k} ${b[0]} ${b[1]}`
    : `M${a[0]} ${a[1]} C${a[0] + k} ${a[1]} ${b[0] - k} ${b[1]} ${b[0]} ${b[1]}`;
}

function wire(d, cls = '') {
  const path = svg('path', { d, class: 'wire ' + cls, pathLength: 1 });
  wires.append(path);
  path.getBoundingClientRect(); // so the draw-in transition has a starting point
  path.classList.add('drawn');
  return path;
}

function label(group, at, title, sub, side = 'below', gap = 30) {
  const [x, y] = at;
  const right = side === 'right';
  const attrs = right ? { x: x + gap, y: y - 2, 'text-anchor': 'start' } : { x, y: y + gap + 6, 'text-anchor': 'middle' };
  group.append(svg('text', { ...attrs, class: 'n-title' }, title));
  const s = svg('text', { ...attrs, y: attrs.y + 18, class: 'n-sub' }, sub);
  group.append(s);
  return s;
}

function resetRoute() {
  G = geometry(0);
  const root = $('route');
  root.replaceChildren();
  root.setAttribute('viewBox', `0 0 ${G.box[0]} ${G.box[1]}`);
  root.classList.toggle('vertical', G.vertical);
  wires = svg('g');
  nodes = svg('g');
  root.append(wires, nodes);

  wires.append(svg('path', { d: straight(G.start, gateIn()), class: 'ghost' }));

  const agent = svg('g', { class: 'node agent', id: 'n-agent' });
  agent.append(svg('circle', { cx: G.agent[0], cy: G.agent[1], r: 16 }));
  agent.append(svg('circle', { cx: G.agent[0], cy: G.agent[1], r: 5, class: 'core' }));
  label(agent, G.agent, 'The agent', 'drafts the quote', G.vertical ? 'right' : 'below');
  nodes.append(agent);

  const gate = svg('g', { class: 'node gate', id: 'n-gate' });
  gate.append(svg('circle', { cx: G.gate[0], cy: G.gate[1], r: R - 12, class: 'disc' }));
  for (let i = 0; i < 8; i++) {
    const a0 = (-90 + i * 45 + 5) * Math.PI / 180;
    const a1 = (-90 + (i + 1) * 45 - 5) * Math.PI / 180;
    const p = (a) => `${(G.gate[0] + R * Math.cos(a)).toFixed(1)} ${(G.gate[1] + R * Math.sin(a)).toFixed(1)}`;
    gate.append(svg('path', { d: `M${p(a0)} A${R} ${R} 0 0 1 ${p(a1)}`, class: 'seg', id: 'seg-' + i }));
  }
  gate.append(svg('text', { x: G.gate[0], y: G.gate[1] + 7, 'text-anchor': 'middle', class: 'count', id: 'count' }, '0/8'));
  const gsub = label(gate, G.gate, 'The check', 'separate code', G.vertical ? 'right' : 'below', R + 22);
  gsub.id = 'gate-sub';
  nodes.append(gate);

  const sent = svg('g', { class: 'node sent', id: 'n-sent' });
  sent.append(svg('circle', { cx: G.sent[0], cy: G.sent[1], r: 16 }));
  sent.append(svg('path', { d: `M${G.sent[0] - 6} ${G.sent[1]} l4 5 l8 -10`, class: 'mark' }));
  label(sent, G.sent, 'Ready to send', '', 'below');
  nodes.append(sent);
}

function addSigners(names) {
  const at = geometry(names.length).signers;
  state.signerAt = {};
  names.forEach((who, i) => {
    state.signerAt[who] = at[i];
    const g = svg('g', { class: 'node signer waiting', id: 'signer-' + i, tabindex: 0, role: 'button', 'aria-label': `Approve as ${who}` });
    g.append(svg('circle', { cx: at[i][0], cy: at[i][1], r: 26, class: 'hit' }));
    g.append(svg('circle', { cx: at[i][0], cy: at[i][1], r: 16 }));
    g.append(svg('path', { d: `M${at[i][0] - 6} ${at[i][1]} l4 5 l8 -10`, class: 'mark' }));
    const sub = label(g, at[i], who, 'click to sign', 'below');
    sub.classList.add('status');
    g.addEventListener('click', () => decide(who, 'approved'));
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); decide(who, 'approved'); } });
    nodes.append(g);
  });
}

// ---------------------------------------------------------------- the quote sheet

function setStamp(kind, text) {
  const old = $('stamp');
  if (!old) return;
  const stamp = el('div', 'stamp ' + kind, text);
  stamp.id = 'stamp';
  old.replaceWith(stamp);
}

function sheetShell(quote, draft) {
  const sheet = $('sheet');
  sheet.className = 'sheet';
  sheet.replaceChildren();
  const plan = PRICEBOOK.plans[quote.planKey];
  const head = el('div', 'sheet-head');
  const left = el('div');
  left.append(el('p', 'sheet-kicker', `Quote ${state.ref}` + (draft > 1 ? ` · draft ${draft}` : '')));
  left.append(el('h2', 'sheet-title', quote.customer || 'Customer not named'));
  left.append(el('p', 'sheet-meta', `${plan.name} · ${quote.seats.toLocaleString('en-US')} seats · ${quote.termMonths} months · net ${quote.netDays}`));
  const stamp = el('div', 'stamp none');
  stamp.id = 'stamp';
  head.append(left, stamp);

  const table = el('table', 'lines');
  const hr = el('tr');
  for (const h of ['Item', 'Qty', 'Each', 'A month']) hr.append(el('th', '', h));
  const thead = el('thead');
  thead.append(hr);
  const tbody = el('tbody');
  tbody.id = 'rows';
  table.append(thead, tbody);

  const how = el('p', 'sheet-how hide');
  how.id = 'how';
  how.textContent = `Seat price: ${money(quote.listSeat)} list` +
    (quote.volumePct ? `, less ${quote.volumePct}% for volume` : '') +
    (quote.termPct ? `, less ${quote.termPct}% for the term` : '') +
    (quote.statedDiscountPct ? `, less ${quote.statedDiscountPct}% the rep asked for` : '') + '.';

  const totals = el('div', 'totals hide');
  totals.id = 'totals';
  const a = el('div');
  a.append(el('span', '', 'A month'), el('b', 'num', money(quote.monthlyTotal)));
  const b = el('div', 'grand');
  const grand = el('b', 'num', money(0));
  grand.id = 'grand';
  b.append(el('span', '', `Over ${quote.termMonths} months`), grand);
  totals.append(a, b);

  const signs = el('div', 'signs');
  signs.id = 'signs';
  sheet.append(head, table, how, totals, signs);
}

async function countUp(node, cents, wait) {
  const steps = speed === 0 ? 1 : 22;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    node.textContent = money(Math.round(cents * (1 - Math.pow(1 - t, 3))));
    if (i < steps) await wait(26);
  }
}

function renderSigns() {
  const signs = $('signs');
  if (!signs) return;
  signs.replaceChildren();
  for (const who of Object.keys(state.approvals)) {
    const status = state.approvals[who];
    const row = el('div', 'sign ' + status);
    row.append(el('span', 'sign-who', who));
    if (status === 'waiting') {
      const yes = el('button', 'btn small', 'Approve');
      yes.type = 'button';
      yes.setAttribute('aria-label', `Approve as ${who}`);
      yes.addEventListener('click', () => decide(who, 'approved'));
      const no = el('button', 'btn small ghost', 'Send back');
      no.type = 'button';
      no.setAttribute('aria-label', `Send back as ${who}`);
      no.addEventListener('click', () => decide(who, 'returned'));
      const acts = el('span', 'sign-acts');
      acts.append(yes, no);
      row.append(acts);
    } else {
      row.append(el('span', 'sign-mark', status === 'approved' ? 'Signed' : 'Sent back'));
    }
    signs.append(row);
  }
}

// ---------------------------------------------------------------- captions and the trail

function say(kind, title, sub = '') {
  const c = $('caption');
  c.className = 'caption ' + kind;
  c.textContent = title;
  $('subcaption').textContent = sub;
}

function log(who, what) {
  state.trail.push({ who, what, at: new Date() });
  const trail = $('trail');
  const entry = state.trail.at(-1);
  const li = el('li', 'who-' + who.toLowerCase().split(' ')[0]);
  li.append(el('time', '', entry.at.toLocaleTimeString('en-US', { hour12: false })), el('b', '', who), el('span', '', what));
  trail.append(li);
}

// ---------------------------------------------------------------- one run, start to finish

async function runChecks(check, wait) {
  let done = 0;
  for (const [i, r] of check.results.entries()) {
    $('seg-' + i).setAttribute('class', 'seg ' + r.status);
    done++;
    $('count').textContent = `${done}/8`;
    say(r.status === 'fail' ? 'fail' : 'work', r.label, r.detail);
    await wait(r.status === 'pass' ? 230 : 950);
  }
}

async function writeSheet(quote, draft, wait) {
  sheetShell(quote, draft);
  for (const line of quote.lines) {
    const tr = el('tr', 'row-in');
    tr.append(el('td', '', line.label), el('td', 'num', line.qty.toLocaleString('en-US')), el('td', 'num', money(line.unit)), el('td', 'num', money(line.monthly)));
    $('rows').append(tr);
    await wait(260);
  }
  $('how').classList.remove('hide');
  $('totals').classList.remove('hide');
  await countUp($('grand'), quote.contractTotal, wait);
}

async function play(text, mistake) {
  const id = ++runId;
  const wait = async (ms) => { await sleep(ms); if (id !== runId) throw CANCEL; };
  state = { text, trail: [], approvals: {}, ref: 'Q-' + (++ref) };
  document.body.classList.add('has-run');
  $('trail').replaceChildren();
  $('read').replaceChildren();
  resetRoute();
  const sheet = $('sheet');
  sheet.className = 'sheet waiting';
  sheet.replaceChildren(el('div', 'placeholder', 'Reading the deal'));

  log('Rep', text);
  const request = readDeal(text);
  state.request = request;

  // What the reader understood, shown before anything is priced.
  say('work', 'Reading the deal', 'Pulling out the customer, the plan, the seats, the term and the ask.');
  const plan = PRICEBOOK.plans[request.planKey];
  const facts = [
    request.customer,
    plan && plan.name + ' plan',
    request.seats && request.seats.toLocaleString('en-US') + ' seats',
    request.termMonths + ' months',
    request.discountPct ? request.discountPct + '% off' : null,
    'net ' + request.netDays,
    ...request.addons.map((a) => PRICEBOOK.addons[a].name),
  ].filter(Boolean);
  for (const fact of facts) {
    $('read').append(el('span', 'fact', fact));
    await wait(110);
  }
  for (const note of request.notes) $('read').append(el('span', 'fact note', note));
  wire(straight(G.start, G.agent));
  await wait(450);
  $('n-agent').classList.add('on');

  if (request.questions.length) {
    $('n-agent').classList.add('asking');
    log('Agent', 'Stopped before quoting. ' + request.questions.join(' '));
    sheet.className = 'sheet ask';
    sheet.replaceChildren(el('p', 'sheet-kicker', 'No quote yet'), el('h2', 'sheet-title', request.customer || 'Customer not named'));
    const ul = el('ul', 'questions');
    for (const q of request.questions) ul.append(el('li', '', q));
    sheet.append(ul, el('p', 'sheet-note', 'Answer in the box and run it again. A wrong guess here would become a wrong price.'));
    say('flag', 'The agent stopped to ask.', 'It will not guess a plan or a seat count.');
    return;
  }
  log('Agent', `Read it as ${request.seats} ${plan.name} seats, ${request.termMonths} months, ${request.discountPct}% off, net ${request.netDays}.` + (request.notes.length ? ' ' + request.notes.join(' ') : ''));

  let check;
  for (let draft = 1; draft <= 2; draft++) {
    const quote = buildQuote(request, draft === 1 ? mistake : 'none');
    say('work', draft === 1 ? 'The agent drafts the quote' : 'The agent tries again', 'Prices come from the price book.');
    await writeSheet(quote, draft, wait);
    log('Agent', `Draft ${draft}: ${money(quote.contractTotal)} over ${quote.termMonths} months.`);
    await wait(350);

    say('work', 'A separate check works the price out again', 'It does not reuse the agent\'s numbers.');
    if (draft === 1) wire(straight(G.agent, gateIn()));
    await wait(650);
    $('n-gate').classList.add('on');
    for (let i = 0; i < 8; i++) $('seg-' + i).setAttribute('class', 'seg');
    check = checkQuote(text, request, quote);
    await runChecks(check, wait);
    const failed = check.results.filter((r) => r.status === 'fail');
    if (failed.length) for (const r of failed) log('Check', 'Failed: ' + r.detail);
    else log('Check', 'All 8 checks ran. Nothing failed.');

    if (!(check.verdict === 'blocked' && check.agentCanFix && draft === 1)) break;

    // Caught: the draft goes back to the agent.
    setStamp('fail', 'Caught');
    $('sheet').classList.add('caught');
    say('fail', 'Caught. Sent back to the agent.', failed[0].detail);
    log('Check', 'Sent the draft back to the agent with the failed checks.');
    const [ax, ay] = G.agent, [gx, gy] = G.gate;
    wire(G.vertical
      ? `M${gx - R - 12} ${gy} C${gx - 150} ${gy} ${ax - 150} ${ay} ${ax - 22} ${ay}`
      : `M${gx} ${gy - R - 12} C${gx} ${gy - 150} ${ax} ${ay - 150} ${ax} ${ay - 22}`, 'back');
    nodes.append(svg('text', G.vertical ? { x: 4, y: ay - 26, class: 'back-label' } : { x: (ax + gx) / 2, y: gy - 126, 'text-anchor': 'middle', class: 'back-label' }, 'sent back'));
    await wait(2100);
  }

  $('gate-sub').textContent = check.verdict === 'blocked' ? 'stopped it' : '8 of 8 ran';

  if (check.verdict === 'blocked') {
    $('n-gate').classList.add('blocked');
    setStamp('fail', 'Blocked');
    const why = check.results.find((r) => r.status === 'fail');
    say('fail', 'Blocked. Nobody is asked to approve this.', why.detail);
    $('signs').append(el('p', 'sheet-note', 'No signature lines. A blocked quote is not offered to anyone to sign.'));
    return;
  }

  $('n-gate').classList.add('passed');
  if (check.verdict === 'clear') {
    wire(straight(gateOut(), G.sent), 'ok');
    await wait(600);
    $('n-sent').classList.add('on');
    setStamp('pass', 'Cleared');
    log('Check', 'Inside every limit. No approval needed. Ready to send.');
    say('pass', 'Cleared. Nobody had to sign.', 'Inside every limit, so the rep can send it now.');
    $('signs').append(el('p', 'sheet-note', 'No signatures needed. The rep can send this.'));
    return;
  }

  addSigners(check.approvers);
  for (const who of check.approvers) {
    state.approvals[who] = 'waiting';
    wire(bend(gateOut(), state.signerAt[who]), 'hold');
    await wait(260);
  }
  setStamp('flag', 'Held');
  renderSigns();
  log('Check', 'Routed to ' + names(check.approvers) + '.');
  say('flag', 'Held for ' + names(check.approvers) + '.', 'The quote cannot be sent until they sign. The agent cannot sign for them.');
}

function decide(who, decision) {
  if (!state || state.approvals[who] !== 'waiting') return;
  state.approvals[who] = decision;
  const i = Object.keys(state.approvals).indexOf(who);
  const node = $('signer-' + i);
  node.setAttribute('class', 'node signer ' + decision);
  node.removeAttribute('tabindex');
  node.querySelector('.status').textContent = decision === 'approved' ? 'signed' : 'sent back';
  log(who, decision === 'approved' ? 'Approved.' : 'Sent back to the rep.');
  if (decision === 'approved') wire(bend(state.signerAt[who], G.sent), 'ok');
  renderSigns();

  const all = Object.values(state.approvals);
  const waiting = Object.keys(state.approvals).filter((k) => state.approvals[k] === 'waiting');
  if (all.includes('returned')) {
    setStamp('fail', 'Sent back');
    log('Check', 'Not sent. The rep has to change the deal.');
    say('fail', 'Sent back.', 'An approver said no. The rep has to change the deal.');
  } else if (!waiting.length) {
    $('n-sent').classList.add('on');
    setStamp('pass', 'Cleared');
    log('Check', 'Every approval is in. Ready to send.');
    say('pass', 'Signed. Ready to send.', 'Every approval is in, and every step is on the trail.');
  } else {
    say('flag', 'Still held for ' + names(waiting) + '.', 'The quote cannot be sent until they sign.');
  }
}

function run() {
  const text = $('ask').value.trim();
  if (!text) return;
  return play(text, $('slip').value).catch((e) => { if (e !== CANCEL) throw e; });
}

function setup() {
  const slip = $('slip');
  for (const [key, text] of Object.entries(MISTAKES)) {
    const opt = el('option', '', text);
    opt.value = key;
    slip.append(opt);
  }
  for (const ex of EXAMPLES) {
    const b = el('button', 'chip', ex.label);
    b.type = 'button';
    b.addEventListener('click', () => { $('ask').value = ex.text; run(); });
    $('examples').append(b);
  }
  $('form').addEventListener('submit', (e) => { e.preventDefault(); run(); });
  $('ask').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); run(); } });
  slip.addEventListener('change', () => { if (state) run(); });

  // The rules, printed from the same price book the code uses.
  const p = PRICEBOOK.policy;
  const list = (title, items) => {
    const box = el('div');
    const ul = el('ul');
    for (const item of items) ul.append(el('li', '', item));
    box.append(el('h3', '', title), ul);
    return box;
  };
  $('rules').append(
    list('Prices', Object.values(PRICEBOOK.plans).map((pl) => `${pl.name}: ${money(pl.seatMonthly)} a seat a month, never under ${money(pl.floor)}.`)),
    list('Automatic discounts', ['Volume: 5% from 50 seats, 10% from 200, 15% from 500.', 'Term: 3% for 24 months, 5% for 36.']),
    list('Who signs', [
      `A rep can give up to ${p.repMaxPct}% alone.`,
      `Up to ${p.managerMaxPct}% needs the sales manager.`,
      `Up to ${p.vpMaxPct}% needs the manager and the VP of Sales.`,
      `Over ${p.vpMaxPct}%, or under the floor price, nobody can approve.`,
      `Slower than net ${p.standardNetDays} needs finance.`,
    ]),
  );

  $('ask').value = EXAMPLES[0].text;
  resetRoute();
}

setup();

// For the film script and for poking at it from the console.
window.countersign = {
  run: (text, mistake = 'none') => { $('ask').value = text; $('slip').value = mistake; return run(); },
  decide,
  setSpeed: (s) => { speed = s; },
};
