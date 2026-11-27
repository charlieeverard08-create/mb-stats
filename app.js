'use strict';

/* ---------- storage ---------- */
const LINK_KEY = 'mb.link';
const CACHE_KEY = 'mb.cache';
const PREF_KEY = 'mb.prefs';
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage full or blocked */ } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
};

/* ---------- helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ESC[c]);
const toNum = (v) => {
  if (v === '' || v == null) return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  const t = String(v).replace(/[£,\s]/g, '');
  if (t === '') return null;
  const n = Number(t);
  return isFinite(n) ? n : null;
};
const n0 = (v) => v || 0;
const r2 = (v) => Math.round(v * 100) / 100;
const sum = (arr, f) => arr.reduce((a, x) => a + n0(f(x)), 0);
const GBP = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });
const GBP0 = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });
const INT = new Intl.NumberFormat('en-GB');
const gbp = (v) => (v == null ? '—' : GBP.format(v));
const gbp0 = (v) => GBP0.format(v);
const gbpK = (v) => (Math.abs(v) >= 1000 ? (v < 0 ? '-' : '') + '£' + (Math.abs(v) / 1000).toFixed(1) + 'k' : GBP0.format(v));
const signed = (v) => (v == null ? '—' : (v > 0 ? '+' : '') + GBP.format(v));
const int = (v) => INT.format(v);
const tone = (v) => (v == null || v === 0 ? '' : v < 0 ? 'neg' : 'pos');
const pad = (x) => String(x).padStart(2, '0');
const iso = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const parseIso = (s) => { const p = String(s).split('-').map(Number); return new Date(p[0], (p[1] || 1) - 1, p[2] || 1); };
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const fmtDay = (s) => parseIso(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtShort = (s) => parseIso(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const fmtMonthLong = (s) => parseIso(s + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
const fmtMon = (s) => parseIso(s + '-01').toLocaleDateString('en-GB', { month: 'short' });
const typeOf = (t) => { t = String(t || '').trim(); if (!t) return 'Other'; return t.toLowerCase() === '2up' ? '2up' : t; };
const toIsoDate = (v) => {
  const s = String(v == null ? '' : v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return m[3] + '-' + pad(m[2]) + '-' + pad(m[1]);
  return '';
};

/* ---------- state ---------- */
const prefs = (() => { try { return JSON.parse(store.get(PREF_KEY) || '{}'); } catch (e) { return {}; } })();
const S = {
  data: null,
  period: prefs.period || 'all',
  book: '',
  tab: 'home',
  statsTab: 'overview',
  offersTab: 'balances',
  bookSort: prefs.bookSort || 'profit',
  bookAll: false,
  q: '',
  betStatus: 'all',
  betLimit: 40,
  loading: false,
  error: '',
  form: null,
  commission: prefs.commission != null ? prefs.commission : 0,
  day: null, // null = today; otherwise 'YYYY-MM-DD'
  calMonth: null, // null = this month; otherwise 'YYYY-MM'
  repMonth: null,
  theme: ['auto', 'dark', 'light', 'temple', 'party'].includes(prefs.theme) ? prefs.theme : 'auto',
  saving: false
};
function blankForm() {
  return { type: '', book: '', match: '', backOdds: '', amount: '', layOdds: '', over: {}, freeBetId: '', mode: 'standard', customLay: '', refund: '', keep: '', ewTerms: '0.25', placeLay: '' };
}
S.form = blankForm();
const savePrefs = () => store.set(PREF_KEY, JSON.stringify({ period: S.period, bookSort: S.bookSort, commission: S.commission, theme: S.theme, rtp: prefs.rtp, srtp: prefs.srtp }));

const PERIODS = [
  ['month', 'Month'],
  ['d30', '30 days'],
  ['d90', '3 months'],
  ['year', 'Year'],
  ['all', 'All time']
];

/* ---------- data ---------- */
function normalise(raw) {
  const bets = (raw.bets || []).map((b) => ({
    date: toIsoDate(b['Date']),
    time: String(b['Time'] || ''),
    book: String(b['Bookmaker'] || '').trim(),
    match: String(b['Match'] || '').trim(),
    type: typeOf(b['Bet Type']),
    backOdds: toNum(b['Back Odds']),
    layOdds: toNum(b['Lay Odds']),
    layOddsRaw: b['Lay Odds'] == null ? '' : String(b['Lay Odds']),
    rawType: String(b['Bet Type'] || '').trim(),
    layReturn: toNum(b['Lay Return']),
    stake: toNum(b['Back Stake']),
    fb: toNum(b['Free Bet Amount']),
    liability: toNum(b['Lay Liability']),
    expected: toNum(b['Expected Profit']),
    profit: toNum(b['Actual Profit']),
    status: String(b['Status'] || '').trim().toLowerCase(),
    row: Number(b['Row']) || 0
  })).filter((b) => b.book && b.date);
  // Treat "247Bet" and "247bet" (or "Net Bet"/"NetBet") as one bookie, shown with the spelling you use most.
  const keyOf = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const spellings = new Map();
  bets.forEach((b) => {
    const k = keyOf(b.book);
    const m = spellings.get(k) || new Map();
    m.set(b.book, (m.get(b.book) || 0) + 1);
    spellings.set(k, m);
  });
  const canonical = new Map();
  spellings.forEach((m, k) => canonical.set(k, Array.from(m.entries()).sort((a, b) => b[1] - a[1])[0][0]));
  bets.forEach((b) => { b.rawBook = b.book; b.book = canonical.get(keyOf(b.book)); });
  bets.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.time < b.time ? 1 : a.time > b.time ? -1 : a.row - b.row));
  const gubbed = (raw.gubbed || []).map((s) => String(s).trim()).filter(Boolean);
  const w = raw.wallet || null;
  const wallet = w ? {
    balances: (w.balances || []).map((b) => ({ bookie: String(b.bookie || ''), balance: Number(b.balance) || 0, updated: String(b.updated || '') })),
    freeBets: (w.freeBets || []).map((f) => ({ id: String(f.id), bookie: String(f.bookie || ''), amount: Number(f.amount) || 0, expiry: toIsoDate(f.expiry), note: String(f.note || '') })),
    notes: String(w.notes || ''),
    target: Number(w.target) || 0
  } : null;
  const casino = Array.isArray(raw.casino) ? raw.casino.map((c) => ({
    id: String(c.id), date: toIsoDate(c.date) || iso(new Date()), site: String(c.site || ''), type: String(c.type || ''),
    deposit: c.deposit == null ? null : Number(c.deposit), bonus: c.bonus == null ? null : Number(c.bonus),
    wagerReq: c.wagerReq == null ? null : Number(c.wagerReq), wagered: c.wagered == null ? null : Number(c.wagered),
    expected: c.expected == null ? null : Number(c.expected), result: c.result == null ? null : Number(c.result),
    status: c.status === 'Done' ? 'Done' : 'In progress', notes: String(c.notes || '')
  })) : null;
  return { bets, gubbed, wallet, casino, updated: raw.updated || new Date().toISOString() };
}

function periodInfo(bets) {
  const key = PERIODS.some((p) => p[0] === S.period) ? S.period : 'all';
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const first = bets.length ? bets[bets.length - 1].date : iso(today);
  const firstD = parseIso(first);
  let start = firstD, prevStart = null, prevEnd = null, phrase = '', prevLabel = '';
  if (key === 'month') {
    start = new Date(today.getFullYear(), today.getMonth(), 1);
    prevStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const lastLen = new Date(today.getFullYear(), today.getMonth(), 0).getDate();
    prevEnd = new Date(today.getFullYear(), today.getMonth() - 1, Math.min(today.getDate(), lastLen));
    phrase = 'this month'; prevLabel = 'the same point last month';
  } else if (key === 'd30' || key === 'd90') {
    const len = key === 'd30' ? 30 : 90;
    start = addDays(today, -(len - 1)); prevStart = addDays(start, -len); prevEnd = addDays(start, -1);
    phrase = key === 'd30' ? 'in the last 30 days' : 'in the last 3 months';
    prevLabel = key === 'd30' ? 'the 30 days before' : 'the 3 months before';
  } else if (key === 'year') {
    start = new Date(today.getFullYear(), 0, 1);
    prevStart = new Date(today.getFullYear() - 1, 0, 1);
    prevEnd = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
    phrase = 'this year'; prevLabel = 'the same point last year';
  } else {
    phrase = 'since ' + fmtDay(first);
  }
  return {
    key,
    start: key === 'all' ? '' : iso(start),
    end: iso(today),
    prevStart: prevStart ? iso(prevStart) : '',
    prevEnd: prevEnd ? iso(prevEnd) : '',
    phrase, prevLabel,
    days: Math.max(1, Math.round((today - start) / 864e5) + 1),
    daily: key === 'month' || key === 'd30' || key === 'd90'
  };
}

function compute() {
  const { bets, gubbed } = S.data;
  const P = periodInfo(bets);
  const byBook = (b) => !S.book || b.book === S.book;
  const inPeriod = bets.filter((b) => byBook(b) && (!P.start || b.date >= P.start));
  const settled = inPeriod.filter((b) => b.status === 'settled');
  const profit = sum(settled, (b) => b.profit);
  const hasPrev = !!P.prevStart;
  const prev = hasPrev ? sum(bets.filter((b) => b.status === 'settled' && byBook(b) && b.date >= P.prevStart && b.date <= P.prevEnd), (b) => b.profit) : 0;
  const fb = settled.filter((b) => b.type === 'Free Bet');
  const fbValue = sum(fb, (b) => b.fb);
  const fbProfit = sum(fb, (b) => b.profit);
  let best = null;
  settled.forEach((b) => { if (best === null || n0(b.profit) > n0(best.profit)) best = b; });
  const open = bets.filter((b) => b.status === 'open' && byBook(b));

  const k = {
    profit: r2(profit), settled: settled.length, hasPrev,
    diff: hasPrev ? r2(profit - prev) : null,
    perDay: r2(profit / P.days), days: P.days,
    fbConv: fbValue ? Math.round((fbProfit / fbValue) * 1000) / 10 : null,
    fbProfit: r2(fbProfit), fbValue: r2(fbValue),
    best, openCount: open.length, openLiability: r2(sum(open, (b) => b.liability))
  };

  // running total
  const dayMap = new Map();
  settled.forEach((b) => dayMap.set(b.date, n0(dayMap.get(b.date)) + n0(b.profit)));
  let run = 0;
  const daily = Array.from(dayMap.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([day, p]) => { run += p; return { day, profit: r2(p), cum: r2(run) }; });

  // buckets
  let buckets;
  if (P.daily) {
    buckets = [];
    for (let t = parseIso(P.start); iso(t) <= P.end; t = addDays(t, 1)) {
      const key = iso(t);
      const list = settled.filter((b) => b.date === key);
      buckets.push({ key, gran: 'day', profit: r2(sum(list, (b) => b.profit)), bets: list.length });
    }
  } else {
    const m = new Map();
    settled.forEach((b) => { const key = b.date.slice(0, 7); const o = m.get(key) || { profit: 0, bets: 0 }; o.profit += n0(b.profit); o.bets++; m.set(key, o); });
    buckets = Array.from(m.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([key, o]) => ({ key, gran: 'month', profit: r2(o.profit), bets: o.bets }));
  }

  // types
  const tm = new Map();
  settled.forEach((b) => { const o = tm.get(b.type) || { type: b.type, bets: 0, profit: 0, expected: 0 }; o.bets++; o.profit += n0(b.profit); o.expected += n0(b.expected); tm.set(b.type, o); });
  const types = Array.from(tm.values()).map((o) => ({ type: o.type, bets: o.bets, profit: r2(o.profit), expected: r2(o.expected), diff: r2(o.profit - o.expected), avg: r2(o.profit / o.bets) })).sort((a, b) => b.profit - a.profit);

  // bookies
  const gub = new Set(gubbed.map((g) => g.toLowerCase()));
  const bm = new Map();
  settled.forEach((b) => { const o = bm.get(b.book) || { book: b.book, bets: 0, profit: 0 }; o.bets++; o.profit += n0(b.profit); bm.set(b.book, o); });
  const books = Array.from(bm.values()).sort((a, b) => b.profit - a.profit).map((o, i) => ({ rank: i + 1, book: o.book, bets: o.bets, profit: r2(o.profit), avg: r2(o.profit / o.bets), gubbed: gub.has(o.book.toLowerCase()) }));

  const gubbedBooks = gubbed.map((name) => {
    const mine = bets.filter((b) => b.status === 'settled' && b.book.toLowerCase() === name.toLowerCase());
    return { book: name, bets: mine.length, profit: r2(sum(mine, (b) => b.profit)) };
  }).sort((a, b) => b.profit - a.profit);

  return { P, k, inPeriod, open, daily, buckets, types, books, gubbedBooks };
}

/* ---------- loading ---------- */
async function load(manual) {
  const link = store.get(LINK_KEY);
  if (!link) { showSetup(false); return; }
  if (S.loading) return;
  S.loading = true;
  document.body.classList.add('is-loading');
  if (S.data) $('#updated').textContent = 'Refreshing…';
  try {
    const raw = await fetchData(link);
    const unsavedNotes = notesDirty && S.data && S.data.wallet ? ($('#notesBox') || {}).value : null;
    S.data = normalise(raw);
    if (unsavedNotes != null && S.data.wallet) S.data.wallet.notes = unsavedNotes;
    S.error = '';
    store.set(CACHE_KEY, JSON.stringify(raw));
    if (manual) toast('Up to date');
    setTimeout(flushQueue, 0);
  } catch (e) {
    S.error = e.message || 'Could not load your sheet';
    if (manual || !S.data) toast(S.error.length > 50 ? 'Could not load your sheet' : S.error);
  } finally {
    S.loading = false;
    document.body.classList.remove('is-loading');
    $('#ptr').classList.remove('show', 'spin');
    render();
  }
}

async function fetchData(link) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  let res;
  try {
    res = await fetch(link, { cache: 'no-store', signal: ctrl.signal, redirect: 'follow' });
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? 'Your sheet took too long to answer' : 'No connection to your sheet');
  } finally { clearTimeout(timer); }
  let raw;
  try { raw = await res.json(); } catch (e) { throw new Error('That link did not return your bets. Check it is the Web app link with ?key= on the end.'); }
  if (!raw || raw.ok === false) throw new Error((raw && raw.error) || 'Your sheet said no');
  if (!Array.isArray(raw.bets)) throw new Error('No bets came back from your sheet');
  return raw;
}

/* ---------- rendering ---------- */
let C = null;

function render() {
  if (!S.data) {
    $('#view').innerHTML = S.error
      ? `<div class="card"><h2>Couldn't load your bets</h2><p class="sub">${esc(S.error)}</p><button class="more" id="retry">Try again</button></div>`
      : `<div class="card"><div class="empty">Loading your sheet…</div></div>`;
    const r = $('#retry'); if (r) r.onclick = () => load(true);
    $('#updated').textContent = S.error ? 'Not connected' : 'Loading…';
    return;
  }
  C = compute();
  const up = new Date(S.data.updated);
  $('#updated').textContent = (S.error ? 'Offline · ' : '') + 'Updated ' + up.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  if (!['home', 'bets', 'add', 'offers', 'stats'].includes(S.tab)) S.tab = 'home';
  $$('.tabbar button').forEach((b) => { if (b.dataset.tab === S.tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  $('#pageTitle').textContent = { home: greeting(), bets: 'Bets', add: 'Add a bet', offers: 'Offers', stats: 'Stats' }[S.tab];
  document.body.dataset.tab = S.tab;
  const view = $('#view');
  const form = $('#addForm');
  if (S.tab === 'add' && form && form.contains(document.activeElement)) return; // don't wipe the form while typing
  if (S.tab === 'offers' && document.activeElement && document.activeElement.id === 'notesBox') return;
  view.innerHTML = VIEWS[S.tab]();
  bindView();
  drawCharts();
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

function filtersBar() {
  const names = Array.from(new Set(S.data.bets.map((b) => b.book))).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  return `<div class="filters">
    <div class="chips" role="group" aria-label="Time period">${PERIODS.map(([k, label]) => `<button class="chip" data-period="${k}" aria-pressed="${k === S.period}">${label}</button>`).join('')}</div>
    <select id="book" class="select" aria-label="Bookmaker"><option value="">All bookmakers</option>${names.map((n) => `<option value="${esc(n)}"${n === S.book ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select>
  </div>`;
}

function seg(name, current, items) {
  return `<div class="seg" role="tablist">${items.map(([k, l]) => `<button type="button" role="tab" data-${name}="${k}" aria-selected="${current === k}">${l}</button>`).join('')}</div>`;
}

// Coloured initials for a bookie, like a payee icon in a banking app.
function avatar(name) {
  const n = String(name || '?').trim();
  const words = n.replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  const ini = (words.length > 1 ? words[0][0] + words[1][0] : n.replace(/[^A-Za-z0-9]/g, '').slice(0, 2)).toUpperCase() || '?';
  let h = 0; for (const ch of n.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) % 360;
  const key = logoKey(n);
  const known = LOGO_SITES[key] && LOGO_CACHE[key] !== LOGO_SITES[key] ? undefined : LOGO_CACHE[key];
  if (known === 'none' || !key) return `<span class="av" style="--h:${h}" aria-hidden="true">${esc(ini)}</span>`;
  const cands = known ? [known] : logoCandidates(key);
  return `<span class="av${known ? ' has-logo' : ''}" style="--h:${h}" aria-hidden="true"><i>${esc(ini)}</i><img alt="" referrerpolicy="no-referrer" decoding="async" data-key="${esc(key)}" data-name="${esc(n)}" data-cands="${esc(cands.slice(1).join('|'))}" src="${logoUrl(cands[0])}"></span>`;
}

function logoBookies() {
  const seen = new Map();
  for (const b of (S.data && S.data.bets) || []) { const k = logoKey(b.book); if (k && !seen.has(k)) seen.set(k, b.book); }
  return Array.from(seen.values()).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}
// ---------- Bookie logos (automatic) ----------
// Each bookie's own site icon, fetched from Google's favicon service.
// Known names map to their real site; anything else tries name.com then name.co.uk.
// Results are remembered on this device; if nothing is found the coloured letters stay.
const LOGO_DOMAINS = {
  '247bet': '247bet.com', '32red': '32red.com', '7bet': '7bet.co.uk', '888sport': '888sport.com',
  'alfobet': 'alfobet.com', 'arrowbet': 'arrowbet.com', 'ballybet': 'ballybet.co.uk', 'barone': 'barone.co.uk',
  'betvickers': 'betvickers.com', 'bet442': 'bet442.com', 'betahoy': 'betahoy.com', 'betgoodwin': 'betgoodwin.co.uk',
  'betmgm': 'betmgm.co.uk', 'betstgeorge': 'betstgeorge.com', 'betuk': 'betuk.com', 'betvictor': 'betvictor.com',
  'betano': 'betano.co.uk', 'betfair': 'betfair.com', 'betfred': 'betfred.com', 'betfed': 'betfred.com',
  'betnero': 'betnero.com', 'betway': 'betway.com', 'boyle': 'boylesports.com', 'boylesport': 'boylesports.com',
  'boylesports': 'boylesports.com', 'coral': 'coral.co.uk', 'daznbet': 'daznbet.com|dazn.com', 'dabble': 'dabble.com',
  'dragonbet': 'dragonbet.co.uk', 'dreamvegas': 'dreamvegas.com', 'fairplay': 'fairplay.co.uk', 'fanteam': 'fanteam.com',
  'fitzwilliam': 'fitzwilliambet.com', 'grandivy': 'grandivy.com', 'grosvenor': 'grosvenorcasinos.com',
  'highbet': 'highbet.com', 'hollywood': 'hollywoodbets.co.uk', 'hollywoodbets': 'hollywoodbets.co.uk',
  'hotstreak': 'hotstreak.co.uk', 'ivybet': 'ivybet.com', 'kwiff': 'kwiff.com', 'ladbrokes': 'ladbrokes.com',
  'leovegas': 'leovegas.com', 'livescore': 'livescorebet.com', 'livescorebet': 'livescorebet.com',
  'luckymate': 'luckymate.com', 'luckytiger': 'luckytiger.co.uk', 'metabetting': 'metabetting.com',
  'midnite': 'midnite.com', 'monopolycasino': 'monopolycasino.com', 'mrben': 'mrben.co.uk', 'nrg': 'nrg.bet',
  'netbet': 'netbet.co.uk', 'paddypower': 'paddypower.com', 'parimatch': 'parimatch.co.uk', 'pricedup': 'pricedup.bet',
  'properbet': 'properbet.com', 'quickbet': 'quickbet.co.uk', 'rightbet': 'rightbet.co.uk', 'skybet': 'skybet.com',
  'smarkets': 'smarkets.com', 'starsports': 'starsports.bet', 'swiftysports': 'swiftysports.com', 'tote': 'tote.co.uk',
  'unibet': 'unibet.co.uk', 'virginbet': 'virginbet.com', 'williamhill': 'williamhill.com', 'bwin': 'bwin.com',
  'betfairexchange': 'betfair.com', 'sportingindex': 'sportingindex.com', 'spreadex': 'spreadex.com',
  'matchbook': 'matchbook.com', 'betdaq': 'betdaq.com', 'mrgreen': 'mrgreen.com', 'casumo': 'casumo.com',
  'pokerstars': 'pokerstars.uk', 'mrq': 'mrq.com', 'jackpotjoy': 'jackpotjoy.com', 'buzzbingo': 'buzzbingo.com',
};
// Bump LOGO_VER whenever the list changes so bookies that found nothing get another try.
const LOGO_VER = 3;
let LOGO_CACHE = {}, LOGO_SITES = {};
try { LOGO_CACHE = JSON.parse(localStorage.getItem('mb.logos') || '{}') || {}; } catch (e) { LOGO_CACHE = {}; }
try { LOGO_SITES = JSON.parse(localStorage.getItem('mb.logoSites') || '{}') || {}; } catch (e) { LOGO_SITES = {}; }
try {
  if (Number(localStorage.getItem('mb.logosVer')) !== LOGO_VER) {
    for (const k of Object.keys(LOGO_CACHE)) if (LOGO_CACHE[k] === 'none') delete LOGO_CACHE[k];
    localStorage.setItem('mb.logos', JSON.stringify(LOGO_CACHE)); localStorage.setItem('mb.logosVer', String(LOGO_VER));
  }
} catch (e) {}
// Turn whatever was pasted ("https://www.daznbet.com/en-gb/sports") into a bare domain.
function cleanDomain(v) {
  v = String(v || '').trim().toLowerCase();
  if (!v) return '';
  try { v = new URL(/^[a-z]+:\/\//.test(v) ? v : 'https://' + v).hostname; } catch (e) { return ''; }
  return v.replace(/^www\./, '');
}
function logoKey(name) { return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
function logoCandidates(key) {
  const out = [];
  if (LOGO_SITES[key]) out.push(LOGO_SITES[key]);
  if (LOGO_DOMAINS[key]) out.push(...LOGO_DOMAINS[key].split('|'));
  const base = key.replace(/(casino|sports?|betting|bet)$/, '') || key;
  const guesses = [key + '.com', key + '.co.uk', key + '.bet'];
  if (!/bet/.test(key)) guesses.push(key + 'bet.com', key + 'bet.co.uk');
  if (base !== key) guesses.push(base + '.com', base + '.co.uk', base + 'bet.com');
  for (const d of guesses) if (!out.includes(d)) out.push(d);
  return out;
}
function logoUrl(domain) { return 'https://www.google.com/s2/favicons?sz=128&domain=' + encodeURIComponent(domain); }
function saveLogo(key, val) {
  LOGO_CACHE[key] = val;
  try { localStorage.setItem('mb.logos', JSON.stringify(LOGO_CACHE)); } catch (e) {}
}
function domainOf(src) { try { return new URL(src).searchParams.get('domain') || ''; } catch (e) { return ''; } }
// Wikipedia's database (Wikidata) lists the official website for most brands.
// Only accept entries described as a betting/casino company, so "Coral" doesn't become the sea creature.
const WIKI_PENDING = {};
function wikiDomain(name) {
  const k = logoKey(name);
  if (!WIKI_PENDING[k]) WIKI_PENDING[k] = (async () => {
    const api = 'https://www.wikidata.org/w/api.php?origin=*&format=json&';
    const found = await fetch(api + 'action=wbsearchentities&language=en&type=item&limit=7&search=' + encodeURIComponent(name)).then((r) => r.json());
    const ok = (found.search || []).filter((e) => /bet|bookmak|gambl|casino|wager|sportsbook|bingo|poker|lotter|exchange/i.test((e.description || '') + ' ' + (e.label || '')));
    if (!ok.length) return '';
    const ents = await fetch(api + 'action=wbgetentities&props=claims&ids=' + ok.map((e) => e.id).join('|')).then((r) => r.json());
    for (const e of ok) {
      const sites = (((ents.entities || {})[e.id] || {}).claims || {}).P856 || [];
      for (const c of sites) { const d = cleanDomain(c.mainsnak && c.mainsnak.datavalue && c.mainsnak.datavalue.value); if (d) return d; }
    }
    return '';
  })().catch(() => '');
  return WIKI_PENDING[k];
}
function logoNext(img) {
  const rest = (img.dataset.cands || '').split('|').filter(Boolean);
  if (rest.length) { img.dataset.cands = rest.slice(1).join('|'); img.src = logoUrl(rest[0]); return; }
  if (!img.dataset.wiki && img.dataset.name) {
    img.dataset.wiki = '1';
    wikiDomain(img.dataset.name).then((d) => {
      if (d && img.isConnected && domainOf(img.src) !== d) img.src = logoUrl(d); else if (img.isConnected) logoNext(img);
    });
    return;
  }
  // Only give up for good when we're online (a failed load offline proves nothing).
  const had = LOGO_CACHE[img.dataset.key];
  if (navigator.onLine !== false && !had) saveLogo(img.dataset.key, 'none');
  const av = img.parentNode; img.remove(); if (av) av.classList.remove('has-logo');
}
// Google returns a tiny 16px grey globe when a site has no icon; treat that as "not found".
document.addEventListener('load', e => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement) || !img.dataset.key) return;
  if (img.naturalWidth < 32) return logoNext(img);
  img.parentNode.classList.add('has-logo');
  if (LOGO_CACHE[img.dataset.key] !== domainOf(img.src)) saveLogo(img.dataset.key, domainOf(img.src));
}, true);
document.addEventListener('error', e => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement) || !img.dataset.key) return;
  if (navigator.onLine === false) { const av = img.parentNode; img.remove(); if (av) av.classList.remove('has-logo'); return; }
  logoNext(img);
}, true);

function txnRow(b) {
  const issue = checkBet(b);
  const right = b.status === 'open'
    ? `<div class="amt"><span class="pill open">Open</span></div><div class="meta">exp. ${signed(b.expected)}</div>`
    : `<div class="amt ${tone(b.profit)}">${b.profit == null ? '—' : signed(b.profit)}</div>${b.expected != null ? `<div class="meta">exp. ${signed(b.expected)}</div>` : ''}`;
  return `<div class="txn tap${issue ? ' flagged' : ''}" data-open="${b.row}">
    ${avatar(b.book)}
    <div class="main"><div class="title">${esc(b.match || b.book)}</div><div class="meta">${esc(b.book)} · ${esc(b.type)}${issue ? ' · <span class="warn">⚠ check</span>' : ''}</div></div>
    <div class="right">${right}</div>
  </div>`;
}

function dayLabel(d) {
  const today = iso(new Date()), yest = iso(addDays(new Date(), -1));
  if (d === today) return 'Today';
  if (d === yest) return 'Yesterday';
  const dt = parseIso(d);
  return dt.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: dt.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}

const VIEWS = {
  statsOverview() {
    const { k, P } = C;
    const cmp = k.hasPrev ? ` That's <b class="${k.diff >= 0 ? 'pos' : 'neg'}">${gbp(Math.abs(k.diff))}</b> ${k.diff >= 0 ? 'more than' : 'less than'} ${P.prevLabel}.` : '';
    const where = S.book ? ` at <b>${esc(S.book)}</b>` : '';
    return `<div class="stack">
      <p class="lede"><b>${gbp(k.profit)}</b> profit from <b>${int(k.settled)}</b> settled bets ${esc(P.phrase)}${where}.${cmp}</p>
      <div class="kpis">
        <div class="kpi hero"><div class="label">Profit</div><div class="big ${tone(k.profit)}">${gbp(k.profit)}</div><div class="foot">${int(k.settled)} settled bets ${esc(P.phrase)}</div></div>
        <div class="kpi"><div class="label">vs before</div><div class="big ${tone(k.diff)}">${k.hasPrev ? signed(k.diff) : '—'}</div><div class="foot">${k.hasPrev ? 'vs ' + esc(P.prevLabel) : 'Pick a time period'}</div></div>
        <div class="kpi"><div class="label">Per day</div><div class="big">${gbp(k.perDay)}</div><div class="foot">over ${int(k.days)} days</div></div>
        <div class="kpi"><div class="label">Free bet conversion</div><div class="big">${k.fbConv == null ? '—' : k.fbConv.toFixed(1) + '%'}</div><div class="foot">${gbp(k.fbProfit)} of ${gbp(k.fbValue)}</div></div>
        <div class="kpi"><div class="label">Best bet</div><div class="big">${k.best ? gbp(k.best.profit) : '—'}</div><div class="foot">${k.best ? esc(k.best.book + ' · ' + k.best.type) : 'No settled bets'}</div></div>
        <div class="kpi"><div class="label">Open bets</div><div class="big">${int(k.openCount)}</div><div class="foot">${gbp(k.openLiability)} liability</div></div>
      </div>
      <section class="card"><h2>Running total</h2><p class="sub">Settled profit added up day by day</p><div class="chart" id="ch-cum" style="min-height:230px"></div></section>
      <section class="card"><h2>${C.P.daily ? 'Profit by day' : 'Profit by month'}</h2><p class="sub">Settled bets</p><div class="chart" id="ch-bars"></div></section>
    </div>`;
  },

  bookies() {
    let rows = C.books.slice();
    if (S.bookSort === 'bets') rows.sort((a, b) => b.bets - a.bets);
    if (S.bookSort === 'name') rows.sort((a, b) => a.book.toLowerCase().localeCompare(b.book.toLowerCase()));
    const total = rows.length;
    if (!S.bookAll) rows = rows.slice(0, 15);
    const max = Math.max(1, ...C.books.map((r) => Math.abs(r.profit)));
    const sortChip = (v, l) => `<button class="chip" data-sort="${v}" aria-pressed="${S.bookSort === v}">${l}</button>`;
    const list = rows.length ? rows.map((r) => `
      <div class="row tap" data-book="${esc(r.book)}">
        <div class="rank">${r.rank}</div>
        <div class="main">
          <div class="title">${esc(r.book)}${r.gubbed ? '<span class="tag">Gubbed</span>' : ''}</div>
          <div class="meta">${int(r.bets)} ${r.bets === 1 ? 'bet' : 'bets'} · ${gbp(r.avg)} per bet</div>
          <div class="bar"><i class="${r.profit < 0 ? 'neg' : ''}" style="width:${(Math.abs(r.profit) / max) * 100}%"></i></div>
        </div>
        <div class="right"><div class="amt ${tone(r.profit)}">${gbp(r.profit)}</div></div>
      </div>`).join('') : `<div class="empty">No settled bets in this period.</div>`;
    const gl = C.gubbedBooks.length ? C.gubbedBooks.map((r) => `
      <div class="row"><div class="main"><div class="title">${esc(r.book)}</div><div class="meta">${int(r.bets)} ${r.bets === 1 ? 'bet' : 'bets'}</div></div><div class="right"><div class="amt ${tone(r.profit)}">${gbp(r.profit)}</div></div></div>`).join('') : `<div class="empty">Your Gubbed sheet is empty.</div>`;
    return `<div class="stack">
      <section class="card">
        <h2>Leaderboard</h2><p class="sub">Settled profit ${esc(C.P.phrase)}. Tap a bookie to filter everything to them.</p>
        <div class="toolbar"><div class="chips">${sortChip('profit', 'Profit')}${sortChip('bets', 'Most bets')}${sortChip('name', 'A–Z')}</div></div>
        <div class="list">${list}</div>
        ${total > 15 ? `<button class="more" id="bookAll">${S.bookAll ? 'Show top 15' : 'Show all ' + total}</button>` : ''}
      </section>
      <section class="card"><h2>Gubbed accounts</h2><p class="sub">From your Gubbed sheet, all-time profit</p><div class="list">${gl}</div></section>
    </div>`;
  },

  types() {
    const rows = C.types;
    const table = rows.length ? `<div class="compare">
        <div class="h">Type</div><div class="h r">Expected</div><div class="h r">Actual</div><div class="h r">Diff</div>
        ${rows.map((r) => `<div>${esc(r.type)} <span class="muted small">· ${int(r.bets)}</span></div><div class="r">${gbp0(r.expected)}</div><div class="r ${tone(r.profit)}">${gbp0(r.profit)}</div><div class="r ${tone(r.diff)}">${signed(r.diff)}</div>`).join('')}
      </div>` : `<div class="empty">No settled bets in this period.</div>`;
    return `<div class="stack">
      <section class="card"><h2>Profit by bet type</h2><p class="sub">Settled bets ${esc(C.P.phrase)}</p><div class="chart" id="ch-types"></div></section>
      <section class="card"><h2>Expected vs actual</h2><p class="sub">What each bet type paid compared with the expected profit you logged</p>${table}</section>
    </div>`;
  },

};

// Daily overview: bets placed on one day (follows the bookmaker filter, ignores the time buttons).
function dayCard() {
  const savedBook = S.book; S.book = '';
  try { return dayCardInner(); } finally { S.book = savedBook; }
}
function dayCardInner() {
  const today = iso(new Date());
  const day = S.day || today;
  const yesterday = iso(addDays(new Date(), -1));
  const title = day === today ? 'Today' : day === yesterday ? 'Yesterday' : parseIso(day).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
  const bets = S.data.bets.filter((b) => b.date === day && (!S.book || b.book === S.book));
  const settled = bets.filter((b) => b.status === 'settled');
  const open = bets.filter((b) => b.status === 'open');
  const expected = r2(sum(bets, (b) => b.expected));
  const actual = r2(sum(settled, (b) => b.profit));
  const settledExp = r2(sum(settled, (b) => b.expected));
  const diff = r2(actual - settledExp);
  const openExp = r2(sum(open, (b) => b.expected));
  const pct = bets.length ? Math.round((settled.length / bets.length) * 100) : 0;
  const list = bets.map((b) => `
    <div class="row tap" data-open="${b.row}">
      <div class="main"><div class="title">${esc(b.match || b.book)}</div><div class="meta">${esc(b.book)} · ${esc(b.type)}${b.time && b.time !== '00:00' ? ' · ' + esc(b.time) : ''}</div></div>
      <div class="right"><div class="amt ${b.status === 'open' ? '' : tone(b.profit)}">${b.status === 'open' ? '<span class="tag open">Open</span>' : signed(b.profit)}</div><div class="meta">exp. ${signed(b.expected)}</div></div>
    </div>`).join('');
  return `<section class="card day-card" id="day">
    <div class="day-head">
      <button type="button" class="icon-btn day-nav" data-day="-1" aria-label="Previous day">‹</button>
      <div class="day-title"><h2>${esc(title)}</h2><p class="sub">${fmtDay(day)} · ${int(bets.length)} ${bets.length === 1 ? 'bet' : 'bets'}${S.book ? ' at ' + esc(S.book) : ''}</p></div>
      <button type="button" class="icon-btn day-nav" data-day="1" aria-label="Next day"${day === today ? ' disabled' : ''}>›</button>
    </div>
    ${bets.length ? `
    <div class="day-grid">
      <div><span>Expected</span><b class="${tone(expected)}">${signed(expected)}</b></div>
      <div><span>Actual</span><b class="${tone(actual)}">${signed(actual)}</b></div>
      <div><span>vs expected</span><b class="${tone(diff)}">${settled.length ? signed(diff) : '—'}</b></div>
    </div>
    <div class="day-progress"><i style="width:${pct}%"></i></div>
    <p class="day-note">${int(settled.length)} of ${int(bets.length)} settled${open.length ? ` · ${signed(openExp)} still to come from ${int(open.length)} open` : ''}</p>
    <details class="day-bets"><summary>See ${bets.length === 1 ? 'the bet' : 'all ' + int(bets.length) + ' bets'}</summary><div class="list">${list}</div></details>`
    : `<div class="empty">No bets placed ${day === today ? 'yet today' : 'on this day'}.</div>`}
    ${S.day ? '<button type="button" class="text-btn day-back" id="dayToday">Back to today</button>' : ''}
  </section>`;
}

function openList() {
  if (!C.open.length) return `<div class="empty">No open bets right now.</div>`;
  return `<div class="list">${C.open.map((b) => `
    <div class="row tap" data-open="${b.row}"><div class="main"><div class="title">${esc(b.match || b.book)}</div><div class="meta">${esc(b.book)} · ${esc(b.type)} · ${fmtShort(b.date)}</div></div>
    <div class="right"><div class="amt">${gbp(b.liability)}</div><div class="meta">exp. <span class="${tone(b.expected)}">${gbp(b.expected)}</span></div></div></div>`).join('')}</div><p class="hint">Tap an open bet to settle it.</p>`;
}

function filteredBets() {
  const q = S.q.trim().toLowerCase();
  return C.inPeriod.filter((b) => (S.betStatus === 'all' || (S.betStatus === 'check' ? !!checkBet(b) : b.status === S.betStatus)) && (!q || (b.match + ' ' + b.book + ' ' + b.type).toLowerCase().includes(q)));
}

function filteredBetsAll() {
  const q = S.q.trim().toLowerCase();
  return S.data.bets.filter((b) => (S.betStatus === 'all' || (S.betStatus === 'check' ? !!checkBet(b) : b.status === S.betStatus)) && (!q || (b.match + ' ' + b.book + ' ' + b.type).toLowerCase().includes(q)));
}

function betList() {
  const rows = filteredBetsAll();
  if (!rows.length) return `<div class="card"><div class="empty">No bets match.</div></div>`;
  const shown = rows.slice(0, S.betLimit);
  const groups = [];
  shown.forEach((b) => { const g = groups[groups.length - 1]; if (g && g.date === b.date) g.bets.push(b); else groups.push({ date: b.date, bets: [b] }); });
  return groups.map((g) => {
    const dayAll = S.data.bets.filter((b) => b.date === g.date && b.status === 'settled');
    const tot = r2(sum(dayAll, (b) => b.profit));
    return `<div class="day-group"><div class="group-head"><span>${esc(dayLabel(g.date))}</span><span class="${tone(tot)}">${dayAll.length ? signed(tot) : ''}</span></div>
      <section class="card list-card">${g.bets.map(txnRow).join('')}</section></div>`;
  }).join('') +
    (rows.length > S.betLimit ? `<button class="more" id="more">Show more</button>` : '') +
    `<div class="count">Showing ${int(shown.length)} of ${int(rows.length)} bets</div>`;
}

function bindView() {
  $$('[data-book]').forEach((el) => el.addEventListener('click', () => {
    S.book = el.dataset.book; S.tab = 'stats'; S.statsTab = 'overview'; window.scrollTo(0, 0); render(); toast('Showing ' + S.book + ' only');
  }));
  $$('[data-sort]').forEach((el) => el.addEventListener('click', () => { S.bookSort = el.dataset.sort; savePrefs(); render(); }));
  const all = $('#bookAll'); if (all) all.onclick = () => { S.bookAll = !S.bookAll; render(); };
  $$('[data-status]').forEach((el) => el.addEventListener('click', () => {
    S.betStatus = el.dataset.status; S.betLimit = 40;
    $$('[data-status]').forEach((o) => o.setAttribute('aria-pressed', String(o === el)));
    refreshBetList();
  }));
  const q = $('#q');
  if (q) q.addEventListener('input', () => { S.q = q.value; S.betLimit = 40; refreshBetList(); });
  bindMore();
  bindOpen(document);
  $$('[data-day]').forEach((b) => b.addEventListener('click', () => {
    const today = iso(new Date());
    const next = iso(addDays(parseIso(S.day || today), Number(b.dataset.day)));
    S.day = next >= today ? null : next;
    render();
  }));
  const dt = $('#dayToday'); if (dt) dt.onclick = () => { S.day = null; render(); };
  $$('[data-stats]').forEach((b) => b.addEventListener('click', () => { S.statsTab = b.dataset.stats; render(); }));
  $$('[data-offers]').forEach((b) => b.addEventListener('click', () => { S.offersTab = b.dataset.offers; render(); }));
  $$('[data-go]').forEach((b) => b.addEventListener('click', () => {
    const [tab, sub] = b.dataset.go.split(':');
    S.tab = tab;
    if (tab === 'stats' && sub) S.statsTab = sub;
    if (tab === 'offers' && sub) S.offersTab = sub;
    if (tab === 'bets' && sub) { S.betStatus = sub; S.betLimit = 40; }
    window.scrollTo(0, 0); render();
  }));
  const tt = $('#tileToday'); if (tt) tt.onclick = () => { if (S.day) { S.day = null; render(); } const d = $('#day'); if (d) d.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  const bk = $('#book'); if (bk) bk.addEventListener('change', () => { S.book = bk.value; render(); });
  $$('[data-period]').forEach((b) => b.addEventListener('click', () => { S.period = b.dataset.period; savePrefs(); render(); }));
  if (S.tab === 'add') bindAdd();
  if (S.tab === 'offers') { bindWallet(); bindCasino(); }
  if (S.tab === 'stats' && S.statsTab === 'report') bindReport();
  bindOverviewExtras();
}
function bindOpen(root) {
  $$('[data-open]', root).forEach((el) => el.addEventListener('click', () => {
    const b = S.data.bets.find((x) => String(x.row) === el.dataset.open);
    if (!b) return;
    if (b.status === 'open') openSettle(b); else openEdit(b);
  }));
}
function bindMore() { const m = $('#more'); if (m) m.onclick = () => { S.betLimit += 40; refreshBetList(); }; }
function refreshBetList() { const el = $('#betList'); if (el) { el.innerHTML = betList(); bindMore(); bindOpen(el); } }

/* ---------- Home ---------- */
VIEWS.home = function () {
  const now = new Date();
  const key = monthKey(now);
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevKey = monthKey(prev);
  const dom = now.getDate();
  const settled = S.data.bets.filter((b) => b.status === 'settled');
  const month = r2(sum(settled.filter((b) => b.date.slice(0, 7) === key), (b) => b.profit));
  const lastSame = r2(sum(settled.filter((b) => b.date.slice(0, 7) === prevKey && Number(b.date.slice(8, 10)) <= dom), (b) => b.profit));
  const diff = r2(month - lastSame);
  const allTime = r2(sum(settled, (b) => b.profit));
  const today = iso(now);
  const todayBets = S.data.bets.filter((b) => b.date === today);
  const todayProfit = r2(sum(todayBets.filter((b) => b.status === 'settled'), (b) => b.profit));
  const open = S.data.bets.filter((b) => b.status === 'open');
  const liability = r2(sum(open, (b) => b.liability));
  const w = S.data.wallet;
  const soon = w ? w.freeBets.filter((f) => f.expiry && f.expiry <= iso(addDays(now, 3))).sort((a, b) => (a.expiry < b.expiry ? -1 : 1)) : [];
  const cas = S.data.casino ? S.data.casino.filter((c) => c.status !== 'Done') : [];
  const monthName = now.toLocaleDateString('en-GB', { month: 'long' });
  return `<div class="stack">
    <section class="hero">
      <div class="hero-label">${esc(monthName)} profit</div>
      <div class="hero-num">${gbp(month)}</div>
      <div class="hero-sub"><span class="delta ${tone(diff)}">${diff >= 0 ? '▲' : '▼'} ${gbp(Math.abs(diff))}</span> vs this point last month</div>
      <div class="hero-foot">All time ${gbp(allTime)}</div>
    </section>
    <div class="tiles">
      <button type="button" class="tile" id="tileToday"><span class="tile-label">Today</span><span class="tile-num ${tone(todayProfit)}">${signed(todayProfit)}</span><span class="tile-foot">${int(todayBets.length)} ${todayBets.length === 1 ? 'bet' : 'bets'} placed</span></button>
      <button type="button" class="tile" data-go="bets:open"><span class="tile-label">Open bets</span><span class="tile-num">${int(open.length)}</span><span class="tile-foot">${gbp(liability)} liability</span></button>
    </div>
    ${checkBanner()}
    ${targetCard()}
    ${dayCard()}
    ${open.length ? `<section class="card">
      <div class="card-head"><div><h2>Open bets</h2><p class="sub">Tap to settle</p></div><button type="button" class="chip" data-go="bets:open">See all</button></div>
      <div class="list">${open.slice(0, 5).map(txnRow).join('')}</div>
    </section>` : ''}
    ${soon.length ? `<section class="card">
      <div class="card-head"><div><h2>Free bets expiring soon</h2><p class="sub">Next 3 days</p></div><button type="button" class="chip" data-go="offers:freebets">Wallet</button></div>
      <div class="list">${soon.map((f) => { const e = expiryText(f.expiry); return `<div class="row tap" data-go="offers:freebets">${avatar(f.bookie)}<div class="main"><div class="title">${esc(f.bookie)} ${gbp(f.amount)}</div><div class="meta"><span class="${e.cls}">${esc(e.text)}</span>${f.note ? ' · ' + esc(f.note) : ''}</div></div></div>`; }).join('')}</div>
    </section>` : ''}
    ${cas.length ? `<button type="button" class="tile wide" data-go="offers:casino"><span class="tile-label">Casino offers in progress</span><span class="tile-num">${int(cas.length)}</span><span class="tile-foot">${signed(r2(sum(cas, (c) => c.expected)))} expected</span></button>` : ''}
  </div>`;
};

/* ---------- Bets ---------- */
VIEWS.bets = function () {
  const statusChip = (v, l) => `<button class="chip" data-status="${v}" aria-pressed="${S.betStatus === v}">${l}</button>`;
  const nCheck = S.data.bets.filter((b) => checkBet(b)).length;
  return `<div class="stack">
    <div class="toolbar sticky-tools">
      <input type="search" class="search" id="q" placeholder="Search event, bookie or type" value="${esc(S.q)}" aria-label="Search bets">
      <div class="chips">${statusChip('all', 'All')}${statusChip('open', 'Open')}${statusChip('settled', 'Settled')}${nCheck ? statusChip('check', '⚠ Check (' + int(nCheck) + ')') : ''}</div>
    </div>
    <div id="betList">${betList()}</div>
  </div>`;
};

/* ---------- Offers ---------- */
VIEWS.offers = function () {
  const t = walletTotals();
  const cas = S.data.casino;
  const casMonth = cas ? r2(sum(cas.filter((c) => c.status === 'Done' && c.date.slice(0, 7) === monthKey(new Date())), (c) => c.result)) : 0;
  const body = S.offersTab === 'casino' ? VIEWS.casino()
    : !S.data.wallet ? VIEWS.wallet()
    : `<div class="stack">${VIEWS.wallet(S.offersTab)}</div>`;
  return `<div class="stack">
    <section class="hero">
      <div class="hero-label">In your accounts</div>
      <div class="hero-num">${t ? gbp(t.balance) : '—'}</div>
      <div class="hero-sub">${t ? `${gbp(t.freeValue)} in ${int(t.freeBets)} free ${t.freeBets === 1 ? 'bet' : 'bets'}${t.expiringSoon ? ` · <span class="warn">${t.expiringSoon} expiring soon</span>` : ''}` : 'Update your sheet script to use the wallet'}</div>
      ${cas ? `<div class="hero-foot">Casino this month ${signed(casMonth)}</div>` : ''}
    </section>
    ${seg('offers', S.offersTab, [['balances', 'Balances'], ['freebets', 'Free bets'], ['casino', 'Casino'], ['notes', 'Notes']])}
    ${body}
  </div>`;
};

/* ---------- Stats ---------- */
VIEWS.stats = function () {
  const tab = S.statsTab;
  const withFilters = ['overview', 'bookies', 'types'].includes(tab);
  const body = tab === 'calendar' ? `<div class="stack">${calendarCard(S.calMonth, 'cal')}</div>`
    : tab === 'bookies' ? VIEWS.bookies()
    : tab === 'types' ? VIEWS.types()
    : tab === 'report' ? VIEWS.report()
    : VIEWS.statsOverview();
  return `<div class="stack">
    ${seg('stats', tab, [['overview', 'Overview'], ['calendar', 'Calendar'], ['bookies', 'Bookies'], ['types', 'Types'], ['report', 'Report']])}
    ${withFilters ? filtersBar() : ''}
    ${body}
  </div>`;
};

/* ---------- add a bet ---------- */
const SNR_TYPES = ['Free Bet']; // stake not returned
const DEFAULT_TYPES = ['Qualifying', 'Free Bet', 'Price Boost', 'Risk Free', 'Money Back', '2up', 'Each Way', 'Arb'];

function typeChoices() {
  const count = new Map();
  S.data.bets.forEach((b) => count.set(b.type, (count.get(b.type) || 0) + 1));
  const used = Array.from(count.entries()).sort((a, b) => b[1] - a[1]).map((e) => e[0]).filter((t) => t !== 'Other');
  DEFAULT_TYPES.forEach((t) => { if (!used.includes(t)) used.push(t); });
  const out = used.slice(0, 10);
  DEFAULT_TYPES.forEach((t) => { if (!out.includes(t)) out.push(t); });
  return out;
}
function recentBooks() {
  const out = [];
  for (const b of S.data.bets) { if (!out.includes(b.book)) out.push(b.book); if (out.length >= 8) break; }
  return out;
}
function recentMatches() {
  const out = [];
  for (const b of S.data.bets) { if (b.match && !out.includes(b.match)) out.push(b.match); if (out.length >= 30) break; }
  return out;
}
const pnum = (v) => { const n = parseFloat(String(v).replace(/[£,\s]/g, '')); return isFinite(n) ? n : null; };

// Matched betting calculator: lay stake that gives the same profit whichever side wins.
function calcBet(type, backOdds, amount, layOdds, commissionPct) {
  const bo = pnum(backOdds), amt = pnum(amount), lo = pnum(layOdds);
  if (!bo || !amt || !lo || bo <= 1 || lo <= 1) return null;
  const c = (pnum(commissionPct) || 0) / 100;
  const snr = SNR_TYPES.includes(type);
  const backReturn = snr ? amt * (bo - 1) : amt * bo;
  const layStake = backReturn / (lo - c);
  const liability = layStake * (lo - 1);
  const backWins = (snr ? amt * (bo - 1) : amt * (bo - 1)) - liability;
  const layWins = layStake * (1 - c) - (snr ? 0 : amt);
  return { snr, layStake: r2(layStake), layReturn: r2(layStake * lo), liability: r2(liability), expected: r2(Math.min(backWins, layWins)), backWins: r2(backWins), layWins: r2(layWins) };
}

VIEWS.add = function () {
  const f = S.form;
  if (!f.type) f.type = typeChoices()[0] || 'Qualifying';
  return `<div class="stack"><section class="card">
    <p class="sub add-sub">Goes straight into your sheet as an open bet</p>
    ${f.freeBetId ? `<div class="fb-banner">Using your ${esc(f.book)} free bet. It comes off your Wallet when you add this. <button type="button" class="text-btn" id="fbCancel">Don't use it</button></div>` : ''}
    <form id="addForm" class="form" autocomplete="off" novalidate>
      <div class="fl">Bet type</div>
      <div class="chips wrap" id="typeChips">${typeChoices().map((t) => `<button type="button" class="chip" data-type="${esc(t)}" aria-pressed="${f.type === t}">${esc(t)}</button>`).join('')}</div>

      <label class="fl" for="f-book">Bookmaker</label>
      <input id="f-book" class="input" list="dl-books" value="${esc(f.book)}" placeholder="e.g. Betfred" autocapitalize="words" enterkeyhint="next">
      <div class="chips wrap">${recentBooks().map((b) => `<button type="button" class="chip sm" data-pickbook="${esc(b)}">${esc(b)}</button>`).join('')}</div>

      <label class="fl" for="f-match">Event</label>
      <input id="f-match" class="input" list="dl-matches" value="${esc(f.match)}" placeholder="e.g. Arsenal vs Chelsea" autocapitalize="words" enterkeyhint="next">

      <div id="calcFields">${calcFields()}</div>

      <div class="calc" id="calc"></div>

      <details class="adjust" id="adjust"${Object.keys(f.over).length ? ' open' : ''}>
        <summary>Adjust figures</summary>
        <p class="small muted">Leave blank to use the calculated figure, or fill in your own.</p>
        <div class="grid3">
          <div><label class="fl" for="o-lr">Lay return £</label><input id="o-lr" class="input" inputmode="decimal" data-over="layReturn" value="${esc(f.over.layReturn || '')}"></div>
          <div><label class="fl" for="o-li">Liability £</label><input id="o-li" class="input" inputmode="decimal" data-over="liability" value="${esc(f.over.liability || '')}"></div>
          <div><label class="fl" for="o-ex">Expected £</label><input id="o-ex" class="input" inputmode="text" data-over="expected" value="${esc(f.over.expected || '')}"></div>
        </div>
        <label class="fl" for="f-comm">Exchange commission %</label>
        <input id="f-comm" class="input narrow" inputmode="decimal" value="${esc(S.commission)}">
      </details>

      <button type="submit" class="primary" id="addBtn">Add bet</button>
      <p class="small" id="addMsg" role="status"></p>
    </form>
    <datalist id="dl-books">${Array.from(new Set(S.data.bets.map((b) => b.book))).sort().map((b) => `<option value="${esc(b)}">`).join('')}</datalist>
    <datalist id="dl-matches">${recentMatches().map((m) => `<option value="${esc(m)}">`).join('')}</datalist>
  </section></div>`;
};

/* Which calculator a bet type uses */
function calcKind(type) {
  const t = String(type || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (t === 'freebet' || t === 'snr') return 'snr';
  if (t.includes('riskfree') || t.includes('moneyback') || t.includes('refund')) return 'refund';
  if (t.includes('eachway') || t === 'ew') return 'ew';
  if (t === '2up' || t.includes('earlypayout')) return '2up';
  return 'normal';
}

// Your own free bet conversion, used as the default for what a refunded free bet is worth.
function myKeepRate() {
  const fb = S.data.bets.filter((b) => b.status === 'settled' && calcKind(b.type) === 'snr' && b.fb);
  const v = sum(fb, (b) => b.fb);
  return v ? Math.round((sum(fb, (b) => b.profit) / v) * 100) : 75;
}

function calcFields() {
  const f = S.form, kind = calcKind(f.type);
  const modeChip = (v, l) => `<button type="button" class="chip sm" data-mode="${v}" aria-pressed="${f.mode === v}">${l}</button>`;
  const termsChip = (v, l) => `<button type="button" class="chip sm" data-terms="${v}" aria-pressed="${f.ewTerms === v}">${l}</button>`;
  const amtLabel = kind === 'snr' ? 'Free bet £' : kind === 'ew' ? 'Stake each way £' : 'Stake £';
  return `
    <div class="grid3">
      <div><label class="fl" for="f-bo">Back odds</label><input id="f-bo" class="input" inputmode="decimal" value="${esc(f.backOdds)}" placeholder="2.50"></div>
      <div><label class="fl" for="f-amt">${amtLabel}</label><input id="f-amt" class="input" inputmode="decimal" value="${esc(f.amount)}" placeholder="10"></div>
      <div><label class="fl" for="f-lo">${kind === 'ew' ? 'Win lay odds' : 'Lay odds'}</label><input id="f-lo" class="input" inputmode="decimal" value="${esc(f.layOdds)}" placeholder="2.60"></div>
    </div>
    ${kind === 'refund' ? `
    <div class="grid2f">
      <div><label class="fl" for="f-ref">Refund if it loses £</label><input id="f-ref" class="input" inputmode="decimal" value="${esc(f.refund)}" placeholder="Same as stake"></div>
      <div><label class="fl" for="f-keep">Free bet worth %</label><input id="f-keep" class="input" inputmode="decimal" value="${esc(f.keep)}" placeholder="${myKeepRate()}"></div>
    </div>
    <p class="small muted">The refund usually comes as a free bet. ${myKeepRate()}% is what you've kept from free bets so far.</p>` : ''}
    ${kind === 'ew' ? `
    <div class="fl">Place terms</div>
    <div class="chips wrap">${termsChip('0.25', '1/4 odds')}${termsChip('0.2', '1/5 odds')}${termsChip('0.1667', '1/6 odds')}${termsChip('0.125', '1/8 odds')}</div>
    <label class="fl" for="f-plo">Place lay odds</label><input id="f-plo" class="input" inputmode="decimal" value="${esc(f.placeLay)}" placeholder="e.g. 3.1">` : ''}
    ${kind === 'normal' || kind === '2up' ? `
    <div class="fl">Lay type</div>
    <div class="chips wrap" id="modeChips">${modeChip('standard', 'Standard')}${modeChip('under', 'Underlay')}${modeChip('over', 'Overlay')}${modeChip('custom', 'Custom')}</div>
    ${f.mode === 'custom' ? `<label class="fl" for="f-cl">Your lay stake £</label><input id="f-cl" class="input narrow" inputmode="decimal" value="${esc(f.customLay)}">` : ''}` : ''}`;
}

// Works out the lay for every kind of offer. Lay Return is saved as lay stake x lay odds, like your sheet.
function calcAdd() {
  const f = S.form, kind = calcKind(f.type);
  const bo = pnum(f.backOdds), amt = pnum(f.amount), lo = pnum(f.layOdds);
  const c = (pnum(S.commission) || 0) / 100;
  if (!bo || !amt || !lo || bo <= 1 || lo <= 1) return null;
  const outcomes = [];
  let lays, expected;
  if (kind === 'snr') {
    const L = (amt * (bo - 1)) / (lo - c);
    const backWins = amt * (bo - 1) - L * (lo - 1), layWins = L * (1 - c);
    outcomes.push(['If back wins', backWins], ['If lay wins', layWins]);
    lays = [[L, lo]]; expected = Math.min(backWins, layWins);
  } else if (kind === 'refund') {
    const R = pnum(f.refund) != null ? pnum(f.refund) : amt;
    const k = (pnum(f.keep) != null ? pnum(f.keep) : myKeepRate()) / 100;
    const L = Math.max(0, (amt * bo - R * k) / (lo - c));
    const backWins = amt * (bo - 1) - L * (lo - 1), layWins = L * (1 - c) - amt + R * k;
    outcomes.push(['If back wins', backWins], ['If lay wins (incl. refund)', layWins]);
    lays = [[L, lo]]; expected = Math.min(backWins, layWins);
  } else if (kind === 'ew') {
    const frac = Number(f.ewTerms) || 0.25, po = 1 + (bo - 1) * frac, plo = pnum(f.placeLay);
    if (!plo || plo <= 1) return { need: 'Enter the place lay odds too.' };
    const Lw = (amt * bo) / (lo - c), Lp = (amt * po) / (plo - c);
    const wins = amt * (bo - 1) + amt * (po - 1) - Lw * (lo - 1) - Lp * (plo - 1);
    const places = -amt + amt * (po - 1) + Lw * (1 - c) - Lp * (plo - 1);
    const loses = -2 * amt + Lw * (1 - c) + Lp * (1 - c);
    outcomes.push(['If it wins', wins], ['If it only places', places], ['If it loses', loses]);
    lays = [[Lw, lo, 'win'], [Lp, plo, 'place']]; expected = Math.min(wins, places, loses);
  } else {
    let L;
    if (f.mode === 'under') L = amt / (1 - c);
    else if (f.mode === 'over') L = (amt * (bo - 1)) / (lo - 1);
    else if (f.mode === 'custom') L = pnum(f.customLay);
    else L = (amt * bo) / (lo - c);
    if (L == null || L < 0) return { need: 'Enter your lay stake.' };
    const backWins = amt * (bo - 1) - L * (lo - 1), layWins = L * (1 - c) - amt;
    outcomes.push(['If back wins', backWins], ['If lay wins', layWins]);
    if (kind === '2up') outcomes.push(['Paid out early, then lay wins', amt * (bo - 1) + L * (1 - c)]);
    lays = [[L, lo]]; expected = Math.min(backWins, layWins);
  }
  const layReturn = lays.reduce((a, [L, o]) => a + L * o, 0);
  const liability = lays.reduce((a, [L, o]) => a + L * (o - 1), 0);
  return {
    kind, lays: lays.map(([L, o, m]) => ({ stake: r2(L), odds: o, market: m || '' })),
    layReturn: r2(layReturn), liability: r2(liability), expected: r2(expected),
    outcomes: outcomes.map(([l, v]) => [l, r2(v)]), stakeTotal: kind === 'ew' ? amt * 2 : amt
  };
}

function currentFigures() {
  const f = S.form;
  const calc = calcAdd();
  const ok = calc && !calc.need;
  const pick = (k) => (f.over[k] !== undefined && String(f.over[k]).trim() !== '' ? pnum(f.over[k]) : ok ? calc[k] : null);
  return { calc: ok ? calc : null, need: calc && calc.need, layReturn: pick('layReturn'), liability: pick('liability'), expected: pick('expected') };
}

function renderCalc() {
  const el = $('#calc'); if (!el) return;
  const fig = currentFigures(), c = fig.calc;
  if (!c) {
    el.innerHTML = `<div class="calc-empty">${esc(fig.need || 'Enter back odds, ' + (calcKind(S.form.type) === 'snr' ? 'free bet' : 'stake') + ' and lay odds to work out your lay.')}</div>`;
    return;
  }
  el.innerHTML = `
    ${c.lays.map((l) => `<div class="calc-main"><span class="muted">Lay${l.market ? ' ' + l.market : ''}</span> <b>${gbp(l.stake)}</b> <span class="muted">at</span> <b>${esc(String(l.odds))}</b></div>`).join('')}
    <div class="calc-grid">
      <div><span class="muted">Liability</span><b>${gbp(fig.liability)}</b></div>
      <div><span class="muted">Expected</span><b class="${tone(fig.expected)}">${signed(fig.expected)}</b></div>
      ${c.outcomes.map(([l, v]) => `<div><span class="muted">${esc(l)}</span><b class="${tone(v)}">${signed(v)}</b></div>`).join('')}
    </div>
    ${c.kind === 'normal' || c.kind === '2up' ? `<p class="small muted calc-note">${S.form.mode === 'under' ? 'Underlay: you break even if the lay wins and profit if the back wins.' : S.form.mode === 'over' ? 'Overlay: you break even if the back wins and profit if the lay wins.' : S.form.mode === 'custom' ? 'Expected is the worse of the two outcomes.' : 'Standard: the same result whichever side wins.'}</p>` : ''}`;
}

function bindAdd() {
  const f = S.form;
  const refreshFields = () => { const w = $('#calcFields'); if (w) { w.innerHTML = calcFields(); bindCalcFields(); } renderCalc(); };
  $$('#typeChips [data-type]').forEach((b) => b.addEventListener('click', () => {
    f.type = b.dataset.type;
    $$('#typeChips [data-type]').forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
    refreshFields();
  }));
  $$('[data-pickbook]').forEach((b) => b.addEventListener('click', () => { f.book = b.dataset.pickbook; $('#f-book').value = f.book; $('#f-match').focus(); }));
  const bindField = (id, key) => { const el = $(id); if (el) el.addEventListener('input', () => { f[key] = el.value; renderCalc(); }); };
  bindField('#f-book', 'book'); bindField('#f-match', 'match');
  function bindCalcFields() {
    bindField('#f-bo', 'backOdds'); bindField('#f-amt', 'amount'); bindField('#f-lo', 'layOdds');
    bindField('#f-ref', 'refund'); bindField('#f-keep', 'keep'); bindField('#f-plo', 'placeLay'); bindField('#f-cl', 'customLay');
    $$('[data-mode]').forEach((b) => b.addEventListener('click', () => { f.mode = b.dataset.mode; refreshFields(); }));
    $$('[data-terms]').forEach((b) => b.addEventListener('click', () => { f.ewTerms = b.dataset.terms; refreshFields(); }));
  }
  bindCalcFields();
  $$('[data-over]').forEach((el) => el.addEventListener('input', () => {
    if (el.value.trim() === '') delete f.over[el.dataset.over]; else f.over[el.dataset.over] = el.value;
    renderCalc();
  }));
  const comm = $('#f-comm');
  if (comm) comm.addEventListener('input', () => { const v = pnum(comm.value); S.commission = v == null ? 0 : v; savePrefs(); renderCalc(); });
  $('#addForm').addEventListener('submit', (e) => { e.preventDefault(); submitBet(); });
  const fbc = $('#fbCancel'); if (fbc) fbc.onclick = () => { f.freeBetId = ''; render(); };
  renderCalc();
}

async function submitBet() {
  const f = S.form, msg = $('#addMsg'), btn = $('#addBtn');
  const err = (t) => { msg.textContent = t; msg.className = 'small err'; msg.scrollIntoView({ block: 'center', behavior: 'smooth' }); toast(t.length > 40 ? 'Not saved, see message' : t); };
  if (!f.book.trim()) return err('Add the bookmaker.');
  if (!f.type) return err('Pick a bet type.');
  for (const [k, label] of [['backOdds', 'Back odds'], ['amount', 'Stake'], ['layOdds', 'Lay odds']]) {
    if (String(f[k]).trim() !== '' && pnum(f[k]) == null) return err(label + ' must be a number.');
  }
  for (const k of Object.keys(f.over)) if (pnum(f.over[k]) == null) return err('Adjusted figures must be numbers.');
  const fig = currentFigures();
  const kind = calcKind(f.type);
  const snr = kind === 'snr';
  const amt = pnum(f.amount);
  const bet = {
    bookmaker: f.book.trim(), match: f.match.trim(), type: f.type,
    backOdds: pnum(f.backOdds), stake: snr ? 0 : (kind === 'ew' ? (amt || 0) * 2 : amt || 0), freeBet: snr ? amt || 0 : 0,
    layOdds: pnum(f.layOdds), layReturn: fig.layReturn, liability: fig.liability, expected: fig.expected
  };
  btn.disabled = true; btn.textContent = 'Adding…'; msg.textContent = 'Sending to your sheet…'; msg.className = 'small muted';
  try {
    const j = await postSheet({ action: 'add', bet, useFreeBet: f.freeBetId || undefined }, true);
    S.form = Object.assign(blankForm(), { type: f.type, match: f.match, mode: f.mode, ewTerms: f.ewTerms, keep: f.keep });
    if (j.queued) {
      toast('Saved on your phone');
      if (document.activeElement) document.activeElement.blur();
      render();
      const m = $('#addMsg'); if (m) { m.textContent = 'No signal: saved on your phone. It sends to your sheet automatically when you are back online.'; m.className = 'small warn'; }
      return;
    }
    toast('Bet added');
    confetti();
    msg.textContent = 'Added to your sheet.'; msg.className = 'small pos';
    if (document.activeElement) document.activeElement.blur();
    await load(false);
  } catch (e) {
    err(e.message);
  } finally {
    const b = $('#addBtn'); if (b) { b.disabled = false; b.textContent = 'Add bet'; }
  }
}

/* ---------- talking to the sheet, with an offline queue ---------- */
const QUEUE_KEY = 'mb.queue';
const QUEUEABLE = ['add', 'settle', 'edit', 'setBalance', 'addFreeBet', 'removeFreeBet', 'setTarget', 'casinoAdd', 'casinoUpdate', 'casinoDelete'];
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const getQueue = () => { try { return JSON.parse(store.get(QUEUE_KEY) || '[]'); } catch (e) { return []; } };
const setQueue = (q) => { store.set(QUEUE_KEY, JSON.stringify(q)); showQueueState(); };

async function sendToSheet(payload) {
  const link = store.get(LINK_KEY);
  if (!link) throw new Error('Connect your sheet first (Menu > Settings).');
  let res;
  try {
    res = await fetch(link, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload), redirect: 'follow' });
  } catch (e) {
    const err = new Error('Your sheet would not accept it. In Apps Script, check you did Deploy > Manage deployments > edit > Version: New version > Deploy.');
    err.network = true; throw err;
  }
  let j;
  try { j = await res.json(); } catch (e) { throw new Error('Your sheet did not accept it. Check you redeployed the script as a new version.'); }
  if (!j || !j.ok) throw new Error((j && j.error) || 'Your sheet said no');
  return j;
}

// Is the phone actually offline? (A failed request alone could also mean the script isn't deployed.)
async function reallyOffline() {
  if (navigator.onLine === false) return true;
  try { await fetch('manifest.webmanifest?ping=' + Date.now(), { cache: 'no-store' }); return false; } catch (e) { return true; }
}

async function postSheet(payload, queueable) {
  const p = Object.assign({ clientId: newId() }, payload);
  try {
    return await sendToSheet(p);
  } catch (e) {
    if (queueable && QUEUEABLE.includes(p.action) && e.network && await reallyOffline()) {
      const q = getQueue();
      q.push({ id: p.clientId, payload: p, label: queueLabel(p), at: new Date().toISOString() });
      setQueue(q);
      return { ok: true, queued: true };
    }
    if (e.network && navigator.onLine === false) throw new Error('You are offline. Nothing was saved.');
    throw e;
  }
}

function queueLabel(p) {
  if (p.action === 'add') return 'Add ' + p.bet.bookmaker + (p.bet.match ? ' · ' + p.bet.match : '');
  if (p.action === 'settle') return 'Settle ' + p.bookmaker + (p.match ? ' · ' + p.match : '') + ' (' + signed(p.profit) + ')';
  if (p.action === 'edit') return 'Edit ' + p.bookmaker + (p.match ? ' · ' + p.match : '');
  if (p.action === 'setBalance') return (p.remove ? 'Remove balance ' : 'Balance ') + p.bookie + (p.remove ? '' : ' ' + gbp(p.balance));
  if (p.action === 'addFreeBet') return 'Free bet ' + p.bookie + ' ' + gbp(p.amount);
  if (p.action === 'removeFreeBet') return 'Remove a free bet';
  if (p.action === 'setTarget') return 'Monthly target ' + gbp(p.target);
  if (p.action === 'casinoAdd') return 'Casino: add ' + p.offer.site;
  if (p.action === 'casinoUpdate') return 'Casino: update ' + p.offer.site;
  if (p.action === 'casinoDelete') return 'Casino: delete an offer';
  return p.action;
}

let flushing = false;
async function flushQueue() {
  if (flushing || !getQueue().length || navigator.onLine === false) return;
  flushing = true;
  let sent = 0;
  try {
    for (const item of getQueue()) {
      try {
        await sendToSheet(item.payload);
        setQueue(getQueue().filter((x) => x.id !== item.id));
        sent++;
      } catch (e) {
        if (e.network) break; // still no connection: try again later
        setQueue(getQueue().map((x) => (x.id === item.id ? Object.assign({}, x, { error: e.message }) : x)));
      }
    }
  } finally { flushing = false; }
  if (sent) { toast('Sent ' + sent + ' saved ' + (sent === 1 ? 'change' : 'changes') + ' to your sheet'); load(false); }
}

function showQueueState() {
  const q = getQueue();
  let el = $('#queueBar');
  if (!q.length) { if (el) el.remove(); return; }
  if (!el) {
    el = document.createElement('button');
    el.type = 'button'; el.id = 'queueBar'; el.className = 'queue-bar';
    el.onclick = openQueue;
    const top = $('.top'); top.parentNode.insertBefore(el, top.nextSibling);
  }
  const failed = q.filter((x) => x.error).length;
  el.classList.toggle('bad', failed > 0);
  el.textContent = failed ? `⚠ ${failed} saved ${failed === 1 ? 'change' : 'changes'} couldn't be sent. Tap to see.` : `⏳ ${q.length} ${q.length === 1 ? 'change' : 'changes'} waiting to send when you're back online`;
}

function openQueue() {
  const q = getQueue();
  const sheet = openSheet(`
    <h2>Waiting to send</h2><p class="sub">Saved on this phone while you had no signal</p>
    <div class="list">${q.map((x) => `<div class="row"><div class="main"><div class="title">${esc(x.label)}</div><div class="meta">${esc(agoText(x.at))}${x.error ? ` · <span class="neg">${esc(x.error)}</span>` : ''}</div></div>
      <button type="button" class="icon-btn fb-del" data-qdel="${esc(x.id)}" aria-label="Discard">✕</button></div>`).join('')}</div>
    <button type="button" class="primary" id="q-send">Send now</button>
    <button type="button" class="text-btn" id="q-close">Close</button>`);
  $$('[data-qdel]', sheet).forEach((b) => b.addEventListener('click', () => { setQueue(getQueue().filter((x) => x.id !== b.dataset.qdel)); closeSettle(); if (getQueue().length) setTimeout(openQueue, 220); }));
  $('#q-send').onclick = async () => {
    setQueue(getQueue().map((x) => Object.assign({}, x, { error: undefined })));
    closeSettle(); await flushQueue();
    if (getQueue().length) toast(navigator.onLine === false ? 'Still offline' : 'Some could not be sent');
  };
  $('#q-close').onclick = closeSettle;
}

/* ---------- number checker ---------- */
// Flags a bet whose figures don't add up. Uses your sheet's convention: lay stake = Lay Return - Lay Liability.
function checkBet(b) {
  if (b._check !== undefined) return b._check;
  let issue = '';
  const kind = calcKind(b.rawType || b.type);
  const lo = b.layOdds, LR = b.layReturn, L = b.liability;
  if (kind !== 'refund' && kind !== 'ew' && lo > 1 && LR != null && L != null && LR > 0) {
    const layStake = LR - L;
    const should = layStake * (lo - 1);
    if (layStake <= 0) issue = 'Lay return is less than the liability';
    else if (Math.abs(L - should) > Math.max(0.1, 0.02 * L)) issue = `Liability should be ${gbp(r2(should))} for a ${gbp(r2(layStake))} lay at ${lo}`;
    else if (b.expected != null && b.backOdds > 1 && (kind === 'normal' || kind === 'snr')) {
      const amt = n0(kind === 'snr' ? b.fb : b.stake);
      const c = (S.commission || 0) / 100;
      const layWins = layStake * (1 - c) - (kind === 'snr' ? 0 : amt), backWins = amt * (b.backOdds - 1) - L;
      if (Math.abs(b.expected - layWins) > 0.15 && Math.abs(b.expected - backWins) > 0.15) issue = `Expected profit should be about ${signed(r2(Math.min(layWins, backWins)))}`;
    }
  }
  b._check = issue;
  return issue;
}

function checkBanner() {
  const flagged = S.data.bets.filter((b) => b.status === 'open' && checkBet(b) && (!S.book || b.book === S.book));
  if (!flagged.length) return '';
  return `<button type="button" class="check-banner" id="checkBanner">⚠ ${flagged.length === 1 ? 'An open bet doesn’t' : flagged.length + ' open bets don’t'} add up: ${esc(flagged[0].book)}${flagged[0].match ? ' · ' + esc(flagged[0].match) : ''}. Tap to fix.</button>`;
}

/* ---------- edit a bet ---------- */
function openEdit(b) {
  const types = typeChoices();
  if (!types.includes(b.rawType || b.type)) types.push(b.rawType || b.type);
  const v = (x) => (x == null ? '' : esc(String(x)));
  const issue = checkBet(b);
  const sheet = openSheet(`
    <h2>Edit bet</h2><p class="sub">${esc(b.book)} · ${fmtDay(b.date)}${b.time && b.time !== '00:00' ? ' ' + esc(b.time) : ''}</p>
    ${issue ? `<div class="check-hint">⚠ ${esc(issue)}</div>` : ''}
    <div class="edit-grid">
      <div class="full"><label class="fl" for="e-book">Bookmaker</label><input id="e-book" class="input" value="${v(b.rawBook || b.book)}" autocapitalize="words"></div>
      <div class="full"><label class="fl" for="e-match">Event</label><input id="e-match" class="input" value="${v(b.match)}" autocapitalize="words"></div>
      <div class="full"><label class="fl" for="e-type">Bet type</label><input id="e-type" class="input" list="dl-types" value="${v(b.rawType || b.type)}"><datalist id="dl-types">${types.map((t) => `<option value="${esc(t)}">`).join('')}</datalist></div>
      <div><label class="fl" for="e-bo">Back odds</label><input id="e-bo" class="input" inputmode="decimal" value="${v(b.backOdds)}"></div>
      <div><label class="fl" for="e-lo">Lay odds</label><input id="e-lo" class="input" inputmode="decimal" value="${v(b.layOddsRaw || b.layOdds)}"></div>
      <div><label class="fl" for="e-st">Stake £</label><input id="e-st" class="input" inputmode="decimal" value="${v(b.stake)}"></div>
      <div><label class="fl" for="e-fb">Free bet £</label><input id="e-fb" class="input" inputmode="decimal" value="${v(b.fb)}"></div>
      <div><label class="fl" for="e-lr">Lay return £</label><input id="e-lr" class="input" inputmode="decimal" value="${v(b.layReturn)}"></div>
      <div><label class="fl" for="e-li">Liability £</label><input id="e-li" class="input" inputmode="decimal" value="${v(b.liability)}"></div>
      <div><label class="fl" for="e-ex">Expected £</label><input id="e-ex" class="input" inputmode="text" value="${v(b.expected)}"></div>
      <div><label class="fl" for="e-pr">Actual profit £</label><input id="e-pr" class="input" inputmode="text" value="${v(b.profit)}" ${b.status === 'open' ? 'placeholder="When settled"' : ''}></div>
    </div>
    <div class="fl">Status</div>
    <div class="chips" id="e-status"><button type="button" class="chip" data-st="Open" aria-pressed="${b.status === 'open'}">Open</button><button type="button" class="chip" data-st="Settled" aria-pressed="${b.status === 'settled'}">Settled</button></div>
    <button type="button" class="wide-btn" id="e-recalc">Recalculate lay return, liability and expected from the odds</button>
    <button type="button" class="primary" id="e-save">Save changes</button>
    <button type="button" class="text-btn" id="e-cancel">Cancel</button>
    <p class="small" id="e-msg" role="status"></p>`);
  let status = b.status === 'settled' ? 'Settled' : 'Open';
  $$('#e-status [data-st]', sheet).forEach((c) => c.addEventListener('click', () => { status = c.dataset.st; $$('#e-status [data-st]', sheet).forEach((o) => o.setAttribute('aria-pressed', String(o === c))); }));
  const msg = $('#e-msg', sheet);
  const fail = (t) => { msg.textContent = t; msg.className = 'small err'; };
  $('#e-recalc').onclick = () => {
    const type = $('#e-type').value, kind = calcKind(type);
    const amt = kind === 'snr' ? $('#e-fb').value : $('#e-st').value;
    const c = calcBet(kind === 'snr' ? 'Free Bet' : type, $('#e-bo').value, amt, $('#e-lo').value, S.commission);
    if (!c) return fail('Fill in back odds, lay odds and the stake or free bet first.');
    $('#e-lr').value = c.layReturn; $('#e-li').value = c.liability; $('#e-ex').value = c.expected;
    msg.textContent = 'Recalculated for a standard lay. Check, then save.'; msg.className = 'small muted';
  };
  $('#e-cancel').onclick = closeSettle;
  $('#e-save').onclick = async () => {
    const book = $('#e-book').value.trim();
    if (!book) return fail('Bookmaker is missing.');
    const numIds = { 'e-bo': 'Back odds', 'e-st': 'Stake', 'e-fb': 'Free bet', 'e-lr': 'Lay return', 'e-li': 'Liability', 'e-ex': 'Expected', 'e-pr': 'Actual profit' };
    for (const id of Object.keys(numIds)) { const x = $('#' + id).value.trim(); if (x !== '' && pnum(x.replace('−', '-')) == null) return fail(numIds[id] + ' must be a number.'); }
    const num = (id) => { const x = $('#' + id).value.trim(); return x === '' ? '' : pnum(x.replace('−', '-')); };
    if (status === 'Settled' && num('e-pr') === '') return fail('Add the actual profit, or set the status to Open.');
    const lay = $('#e-lo').value.trim();
    const fields = {
      bookmaker: book, match: $('#e-match').value.trim(), type: $('#e-type').value.trim(),
      backOdds: num('e-bo'), stake: num('e-st'), freeBet: num('e-fb'), layOdds: pnum(lay) != null && /^[0-9.]+$/.test(lay) ? pnum(lay) : lay,
      layReturn: num('e-lr'), liability: num('e-li'), expected: num('e-ex'), profit: num('e-pr'), status
    };
    const btn = $('#e-save'); btn.disabled = true; btn.textContent = 'Saving…';
    try {
      const j = await postSheet({ action: 'edit', row: b.row, date: b.date, bookmaker: b.rawBook || b.book, match: b.match, fields }, true);
      closeSettle();
      if (j.queued) { toast('No signal: saved on your phone, sends automatically'); return; }
      toast('Bet updated');
      await load(false);
    } catch (e) { fail(e.message); btn.disabled = false; btn.textContent = 'Save changes'; }
  };
}

/* ---------- monthly target ---------- */
function monthKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1); }
function monthProfit(key) { return r2(sum(S.data.bets.filter((b) => b.status === 'settled' && b.date.slice(0, 7) === key), (b) => b.profit)); }

function targetCard() {
  const w = S.data.wallet;
  if (!w) return '';
  const now = new Date(), key = monthKey(now);
  const name = now.toLocaleDateString('en-GB', { month: 'long' });
  if (!w.target) return `<button type="button" class="target-set" id="targetEdit">🎯 Set a monthly profit target</button>`;
  const made = monthProfit(key), target = w.target;
  const pct = Math.max(0, Math.min(100, (made / target) * 100));
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysLeft = daysInMonth - now.getDate() + 1;
  const left = r2(target - made);
  const expectedPace = (target * (now.getDate() - 1 + 0.5)) / daysInMonth;
  return `<section class="card target-card" id="targetEdit" role="button" tabindex="0">
    <div class="card-head"><div><h2>${esc(name)} target</h2><p class="sub">${gbp(made)} of ${gbp(target)} · tap to change</p></div><b class="target-pct">${Math.round(pct)}%</b></div>
    <div class="day-progress target-bar"><i style="width:${pct}%"></i><span class="pace" style="left:${Math.min(100, (expectedPace / target) * 100)}%"></span></div>
    <p class="day-note">${left <= 0 ? `🎉 Target hit, ${gbp(-left)} over` : `${gbp(left)} to go · <b>${gbp(r2(left / daysLeft))}</b> a day for the ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left${made >= expectedPace ? ' · ahead of pace' : ' · behind pace'}`}</p>
  </section>`;
}

function openTarget() {
  const cur = S.data.wallet ? S.data.wallet.target : 0;
  const sheet = openSheet(`
    <h2>Monthly target</h2><p class="sub">Profit you're aiming for each month. Saved in your sheet.</p>
    <label class="fl" for="t-amt">Target £</label>
    <input id="t-amt" class="input" inputmode="decimal" value="${cur || ''}" placeholder="e.g. 600">
    <button type="button" class="primary" id="t-save">Save</button>
    ${cur ? '<button type="button" class="text-btn neg" id="t-clear">Remove target</button>' : ''}
    <button type="button" class="text-btn" id="t-cancel">Cancel</button>
    <p class="small" id="t-msg"></p>`);
  setTimeout(() => $('#t-amt', sheet).focus(), 250);
  const save = async (val) => {
    try { await walletPost({ action: 'setTarget', target: val }); closeSettle(); toast(val ? 'Target set to ' + gbp(val) : 'Target removed'); render(); }
    catch (e) { const m = $('#t-msg'); m.textContent = e.message; m.className = 'small err'; }
  };
  $('#t-save').onclick = () => { const v = pnum($('#t-amt').value); if (v == null || v <= 0) { const m = $('#t-msg'); m.textContent = 'Enter an amount.'; m.className = 'small err'; return; } save(v); };
  const clr = $('#t-clear'); if (clr) clr.onclick = () => save(0);
  $('#t-cancel').onclick = closeSettle;
}

/* ---------- profit calendar ---------- */
function calendarCard(monthIso, id) {
  const now = new Date();
  const key = monthIso || monthKey(now);
  const [y, m] = key.split('-').map(Number);
  const first = new Date(y, m - 1, 1), days = new Date(y, m, 0).getDate();
  const offset = (first.getDay() + 6) % 7; // Monday first
  const byDay = new Map();
  S.data.bets.forEach((b) => {
    if (b.status !== 'settled' || b.date.slice(0, 7) !== key || (S.book && b.book !== S.book)) return;
    byDay.set(b.date, r2(n0(byDay.get(b.date)) + n0(b.profit)));
  });
  const vals = Array.from(byDay.values());
  const maxAbs = Math.max(1, ...vals.map(Math.abs));
  const total = r2(vals.reduce((a, v) => a + v, 0));
  const today = iso(now);
  const cells = [];
  for (let i = 0; i < offset; i++) cells.push('<div class="cal-cell empty"></div>');
  for (let d = 1; d <= days; d++) {
    const ds = key + '-' + pad(d), v = byDay.get(ds);
    const a = v == null ? 0 : 0.18 + 0.82 * Math.min(1, Math.abs(v) / maxAbs);
    const bg = v == null ? '' : `style="--a:${a.toFixed(2)}"`;
    cells.push(`<button type="button" class="cal-cell${v == null ? '' : v < 0 ? ' neg' : ' pos'}${ds === today ? ' today' : ''}${ds > today ? ' future' : ''}" data-calday="${ds}" ${bg} aria-label="${fmtDay(ds)}${v == null ? '' : ' ' + signed(v)}"><span class="d">${d}</span>${v == null ? '' : `<span class="v">${esc(Math.abs(v) >= 100 ? gbp0(v) : signed(v).replace('£', ''))}</span>`}</button>`);
  }
  const prevKey = monthKey(new Date(y, m - 2, 1)), nextKey = monthKey(new Date(y, m, 1));
  return `<section class="card cal-card" id="${id}">
    <div class="day-head">
      <button type="button" class="icon-btn day-nav" data-cal="${prevKey}" data-calid="${id}" aria-label="Previous month">‹</button>
      <div class="day-title"><h2>${esc(fmtMonthLong(key))}</h2><p class="sub">${byDay.size ? `${signed(total)} over ${byDay.size} ${byDay.size === 1 ? 'day' : 'days'}` : 'No settled bets'}${S.book ? ' at ' + esc(S.book) : ''}</p></div>
      <button type="button" class="icon-btn day-nav" data-cal="${nextKey}" data-calid="${id}" aria-label="Next month"${nextKey > monthKey(now) ? ' disabled' : ''}>›</button>
    </div>
    <div class="cal-grid">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d) => `<div class="cal-dow">${d}</div>`).join('')}${cells.join('')}</div>
    <p class="day-note no-print">Tap a day to see its bets.</p>
  </section>`;
}

function bindOverviewExtras() {
  const t = $('#targetEdit'); if (t) t.onclick = openTarget;
  const cb = $('#checkBanner');
  if (cb) cb.onclick = () => { const b = S.data.bets.find((x) => x.status === 'open' && checkBet(x) && (!S.book || x.book === S.book)); if (b) openEdit(b); };
  $$('[data-cal]').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.calid === 'rep-cal') S.repMonth = b.dataset.cal; else S.calMonth = b.dataset.cal === monthKey(new Date()) ? null : b.dataset.cal;
    render();
  }));
  $$('[data-calday]').forEach((b) => b.addEventListener('click', () => {
    if (b.classList.contains('future')) return;
    S.day = b.dataset.calday === iso(new Date()) ? null : b.dataset.calday;
    S.tab = 'home'; window.scrollTo(0, 0); render();
    const d = $('#day'); if (d) d.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
}

/* ---------- monthly report ---------- */
function reportData(key) {
  const [y, m] = key.split('-').map(Number);
  const prevKey = monthKey(new Date(y, m - 2, 1));
  const bets = S.data.bets.filter((b) => b.date.slice(0, 7) === key);
  const settled = bets.filter((b) => b.status === 'settled');
  const profit = r2(sum(settled, (b) => b.profit));
  const prev = monthProfit(prevKey);
  const exp = r2(sum(settled, (b) => b.expected));
  const fb = settled.filter((b) => calcKind(b.type) === 'snr');
  const fbV = sum(fb, (b) => b.fb), fbP = sum(fb, (b) => b.profit);
  const days = new Map(); settled.forEach((b) => days.set(b.date, n0(days.get(b.date)) + n0(b.profit)));
  const dayList = Array.from(days.entries()).sort((a, b) => b[1] - a[1]);
  const group = (keyFn) => { const g = new Map(); settled.forEach((b) => { const k = keyFn(b); const o = g.get(k) || { name: k, bets: 0, profit: 0 }; o.bets++; o.profit += n0(b.profit); g.set(k, o); }); return Array.from(g.values()).map((o) => Object.assign(o, { profit: r2(o.profit) })).sort((a, b) => b.profit - a.profit); };
  return {
    key, prevKey, bets: bets.length, settled: settled.length, open: bets.length - settled.length, profit, prev, diff: r2(profit - prev),
    exp, vsExp: r2(profit - exp), fbConv: fbV ? Math.round((fbP / fbV) * 1000) / 10 : null, fbValue: r2(fbV),
    best: dayList[0], worst: dayList.length > 1 ? dayList[dayList.length - 1] : null, daysBet: days.size,
    perDay: days.size ? r2(profit / days.size) : 0,
    books: group((b) => b.book), types: group((b) => b.type),
    target: S.data.wallet && S.data.wallet.target ? S.data.wallet.target : 0,
    casino: S.data.casino ? r2(sum(S.data.casino.filter((c) => c.status === 'Done' && c.date.slice(0, 7) === key), (c) => c.result)) : null,
    casinoCount: S.data.casino ? S.data.casino.filter((c) => c.status === 'Done' && c.date.slice(0, 7) === key).length : 0
  };
}

VIEWS.report = function () {
  const now = new Date();
  const key = S.repMonth || monthKey(now);
  const r = reportData(key);
  const name = fmtMonthLong(key);
  const isThis = key === monthKey(now);
  const top = r.books.slice(0, 5), worst = r.books.length > 5 ? r.books.slice(-3).reverse().filter((b) => b.profit < 0) : [];
  return `<div class="stack report" id="report">
    <h1 class="print-only">Matched betting · ${esc(name)}</h1>
    ${calendarCard(key, 'rep-cal')}
    <div class="kpis">
      <div class="kpi hero"><div class="label">Profit</div><div class="big ${tone(r.profit)}">${gbp(r.profit)}</div><div class="foot">${isThis ? 'So far · ' : ''}${int(r.settled)} settled bets over ${int(r.daysBet)} days${r.open ? ` · ${int(r.open)} still open` : ''}</div></div>
      <div class="kpi"><div class="label">vs ${esc(fmtMonthLong(r.prevKey).split(' ')[0])}</div><div class="big ${tone(r.diff)}">${signed(r.diff)}</div><div class="foot">${gbp(r.prev)} last month</div></div>
      <div class="kpi"><div class="label">vs expected</div><div class="big ${tone(r.vsExp)}">${signed(r.vsExp)}</div><div class="foot">${gbp(r.exp)} expected</div></div>
      <div class="kpi"><div class="label">Per betting day</div><div class="big">${gbp(r.perDay)}</div><div class="foot">${int(r.daysBet)} days with bets</div></div>
      <div class="kpi"><div class="label">Free bet conversion</div><div class="big">${r.fbConv == null ? '—' : r.fbConv.toFixed(1) + '%'}</div><div class="foot">from ${gbp(r.fbValue)} of free bets</div></div>
      ${r.casinoCount ? `<div class="kpi"><div class="label">Casino</div><div class="big ${tone(r.casino)}">${signed(r.casino)}</div><div class="foot">${int(r.casinoCount)} ${r.casinoCount === 1 ? "offer" : "offers"} · total ${gbp(r2(r.profit + r.casino))}</div></div>` : ''}
      ${r.target ? `<div class="kpi"><div class="label">Target</div><div class="big ${r.profit >= r.target ? 'pos' : ''}">${Math.round((r.profit / r.target) * 100)}%</div><div class="foot">${r.profit >= r.target ? 'Hit' : 'Of'} ${gbp(r.target)}</div></div>` : ''}
    </div>
    <div class="grid2">
      <section class="card"><h2>Best and worst days</h2>
        <div class="list">
          ${r.best ? `<div class="row"><div class="main"><div class="title">Best: ${esc(fmtDay(r.best[0]))}</div></div><div class="right"><div class="amt ${tone(r.best[1])}">${signed(r2(r.best[1]))}</div></div></div>` : '<div class="empty">No settled bets.</div>'}
          ${r.worst ? `<div class="row"><div class="main"><div class="title">Worst: ${esc(fmtDay(r.worst[0]))}</div></div><div class="right"><div class="amt ${tone(r.worst[1])}">${signed(r2(r.worst[1]))}</div></div></div>` : ''}
        </div></section>
      <section class="card"><h2>Top bookies</h2>
        <div class="list">${top.length ? top.map((b) => `<div class="row"><div class="main"><div class="title">${esc(b.name)}</div><div class="meta">${int(b.bets)} bets</div></div><div class="right"><div class="amt ${tone(b.profit)}">${signed(b.profit)}</div></div></div>`).join('') : '<div class="empty">No settled bets.</div>'}
        ${worst.map((b) => `<div class="row"><div class="main"><div class="title">${esc(b.name)}</div><div class="meta">${int(b.bets)} bets</div></div><div class="right"><div class="amt neg">${signed(b.profit)}</div></div></div>`).join('')}</div></section>
    </div>
    <section class="card"><h2>By bet type</h2>
      <div class="list">${r.types.length ? r.types.map((t) => `<div class="row"><div class="main"><div class="title">${esc(t.name)}</div><div class="meta">${int(t.bets)} bets</div></div><div class="right"><div class="amt ${tone(t.profit)}">${signed(t.profit)}</div></div></div>`).join('') : '<div class="empty">No settled bets.</div>'}</div></section>
    <div class="report-actions no-print">
      <button type="button" class="primary" id="repShare">Share summary</button>
      <button type="button" class="wide-btn" id="repPdf">Save as PDF</button>
    </div>
  </div>`;
};

function reportText(r) {
  const name = fmtMonthLong(r.key);
  const lines = [
    `Matched betting · ${name}`,
    `Profit: ${gbp(r.profit)} from ${r.settled} settled bets (${signed(r.diff)} vs last month)`,
    `Expected: ${gbp(r.exp)} (${signed(r.vsExp)})`,
    r.fbConv != null ? `Free bet conversion: ${r.fbConv.toFixed(1)}%` : '',
    r.casinoCount ? `Casino: ${signed(r.casino)} from ${r.casinoCount} offers (total ${gbp(r2(r.profit + r.casino))})` : '',
    r.target ? `Target: ${gbp(r.target)} (${Math.round((r.profit / r.target) * 100)}%)` : '',
    r.best ? `Best day: ${fmtDay(r.best[0])} ${signed(r2(r.best[1]))}` : '',
    r.books.length ? `Top bookie: ${r.books[0].name} ${signed(r.books[0].profit)}` : ''
  ];
  return lines.filter(Boolean).join('\n');
}

function bindReport() {
  const back = $('#repBack'); if (back) back.onclick = () => { S.tab = 'overview'; render(); };
  $$('[data-rep]').forEach((b) => b.addEventListener('click', () => { S.repMonth = b.dataset.rep; render(); }));
  const key = S.repMonth || monthKey(new Date());
  const share = $('#repShare');
  if (share) share.onclick = async () => {
    const text = reportText(reportData(key));
    try {
      if (navigator.share) await navigator.share({ title: 'Matched betting · ' + fmtMonthLong(key), text });
      else { await navigator.clipboard.writeText(text); toast('Summary copied'); }
    } catch (e) { /* share cancelled */ }
  };
  const pdf = $('#repPdf'); if (pdf) pdf.onclick = () => window.print();
}

/* ---------- settle an open bet ---------- */
function openSettle(b) {
  const calc = calcBet(b.type, b.backOdds, SNR_TYPES.includes(b.type) ? b.fb : b.stake, b.layOdds, S.commission);
  // Prefer the figures already in the sheet for the outcomes.
  const snr = SNR_TYPES.includes(b.type);
  let backWins = null, layWins = null;
  // Uses the figures in your sheet: lay stake = Lay Return - Lay Liability.
  const amt = n0(snr ? b.fb : b.stake);
  const layStake = b.layReturn != null && b.liability != null ? b.layReturn - b.liability
    : b.liability != null && b.layOdds > 1 ? b.liability / (b.layOdds - 1) : null;
  if (b.backOdds && b.liability != null) backWins = r2(amt * (b.backOdds - 1) - b.liability);
  if (layStake != null) layWins = r2(layStake * (1 - (S.commission || 0) / 100) - (snr ? 0 : amt));
  if (backWins == null && calc) backWins = calc.backWins;
  if (layWins == null && calc) layWins = calc.layWins;
  const start = b.expected != null ? b.expected : '';
  const sheet = $('#sheet');
  sheet.innerHTML = `<div class="sheet-card" role="dialog" aria-modal="true" aria-labelledby="st-title">
    <div class="grab"></div>
    <h2 id="st-title">${esc(b.match || b.book)}</h2>
    <p class="sub">${esc(b.book)} · ${esc(b.type)} · ${fmtDay(b.date)}</p>
    <div class="outcomes">
      ${backWins != null ? `<button type="button" class="outcome" data-val="${backWins}"><span>Back won</span><b class="${tone(backWins)}">${signed(backWins)}</b></button>` : ''}
      ${layWins != null ? `<button type="button" class="outcome" data-val="${layWins}"><span>Lay won</span><b class="${tone(layWins)}">${signed(layWins)}</b></button>` : ''}
    </div>
    <label class="fl" for="st-profit">Actual profit £</label>
    <input id="st-profit" class="input" inputmode="text" value="${esc(start)}">
    <p class="small muted">Use a minus sign for a loss, e.g. -0.45</p>
    <button type="button" class="primary" id="st-save">Settle bet</button>
    <button type="button" class="wide-btn" id="st-edit">Edit bet details</button>
    <button type="button" class="text-btn" id="st-cancel">Cancel</button>
    <p class="small" id="st-msg" role="status"></p>
  </div>`;
  sheet.hidden = false;
  requestAnimationFrame(() => sheet.classList.add('show'));
  const input = $('#st-profit');
  $$('.outcome', sheet).forEach((o) => o.addEventListener('click', () => {
    input.value = o.dataset.val;
    $$('.outcome', sheet).forEach((x) => x.classList.toggle('on', x === o));
  }));
  $('#st-cancel').onclick = closeSettle;
  $('#st-edit').onclick = () => { closeSettle(); setTimeout(() => openEdit(b), 220); };
  sheet.onclick = (e) => { if (e.target === sheet) closeSettle(); };
  $('#st-save').onclick = async () => {
    const msg = $('#st-msg'), btn = $('#st-save');
    const v = pnum(input.value.replace('−', '-'));
    if (v == null) { msg.textContent = 'Enter the profit as a number.'; msg.className = 'small err'; return; }
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
      const j = await postSheet({ action: 'settle', row: b.row, date: b.date, bookmaker: b.rawBook || b.book, match: b.match, profit: v }, true);
      closeSettle();
      if (j.queued) { toast('No signal: saved on your phone, sends automatically'); return; }
      toast('Settled ' + signed(v));
      if (v > 0) confetti();
      await load(false);
    } catch (e) {
      msg.textContent = e.message; msg.className = 'small err';
      btn.disabled = false; btn.textContent = 'Settle bet';
    }
  };
}
function closeSettle() {
  const sheet = $('#sheet');
  sheet.classList.remove('show');
  setTimeout(() => { sheet.hidden = true; sheet.innerHTML = ''; }, 200);
}

/* ---------- menu ---------- */
function openSheet(html) {
  const sheet = $('#sheet');
  sheet.innerHTML = `<div class="sheet-card" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div>`;
  sheet.hidden = false;
  requestAnimationFrame(() => sheet.classList.add('show'));
  sheet.onclick = (e) => { if (e.target === sheet) closeSettle(); };
  return sheet;
}

function walletTotals() {
  const w = S.data && S.data.wallet;
  if (!w) return null;
  const today = iso(new Date());
  return {
    balance: r2(w.balances.reduce((a, b) => a + b.balance, 0)),
    freeBets: w.freeBets.length,
    freeValue: r2(w.freeBets.reduce((a, f) => a + f.amount, 0)),
    expiringSoon: w.freeBets.filter((f) => f.expiry && f.expiry <= iso(addDays(new Date(), 1)) && f.expiry >= today).length
  };
}

function openMenu() {
  const sheet = openSheet(`
    <h2>Menu</h2>
    <div class="menu-list">
      <button type="button" class="menu-item" data-menu="report">
        <span class="mi-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l5 5v13H7zM14 3v5h5M10 17v-3M13 17v-5M16 17v-2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
        <span class="mi-text"><b>Monthly report</b><span>A month's summary to save or share</span></span>
      </button>
      <button type="button" class="menu-item" data-menu="refresh">
        <span class="mi-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
        <span class="mi-text"><b>Refresh</b><span>Or pull down on any page</span></span>
      </button>
      <button type="button" class="menu-item" data-menu="settings">
        <span class="mi-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span>
        <span class="mi-text"><b>Settings</b><span>Theme, commission, sheet link</span></span>
      </button>
    </div>
    <button type="button" class="text-btn" id="menu-close">Close</button>`);
  $$('[data-menu]', sheet).forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.menu;
    closeSettle();
    if (k === 'report') { S.tab = 'stats'; S.statsTab = 'report'; S.repMonth = null; window.scrollTo(0, 0); render(); }
    if (k === 'refresh') load(true);
    if (k === 'settings') setTimeout(openSettings, 220);
  }));
  $('#menu-close').onclick = closeSettle;
}

/* ---------- wallet & notes ---------- */
const NOTES_LIMIT = 50000; // Google Sheets' limit for one cell
let notesTimer = null, notesSaving = false, notesDirty = false;

function expiryText(d) {
  if (!d) return { text: 'No expiry', cls: '' };
  const today = iso(new Date());
  const days = Math.round((parseIso(d) - parseIso(today)) / 864e5);
  if (days < 0) return { text: 'Expired ' + fmtShort(d), cls: 'neg' };
  if (days === 0) return { text: 'Expires today', cls: 'warn' };
  if (days === 1) return { text: 'Expires tomorrow', cls: 'warn' };
  return { text: (days <= 7 ? 'Expires in ' + days + ' days · ' : 'Expires ') + fmtShort(d), cls: days <= 3 ? 'warn' : '' };
}

function agoText(s) {
  if (!s) return '';
  const t = new Date(s.length === 16 ? s + ':00' : s);
  if (isNaN(t)) return '';
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 2) return 'just now';
  if (mins < 60) return mins + ' min ago';
  const h = Math.round(mins / 60); if (h < 24) return h + 'h ago';
  const d = Math.round(h / 24); return d === 1 ? 'yesterday' : d + ' days ago';
}

VIEWS.wallet = function (part) {
  const w = S.data.wallet;
  if (!w) {
    return `<div class="stack"><section class="card"><h2>Wallet & notes</h2>
      <p class="sub">Your sheet's script needs updating before the wallet can be used. Replace your DashboardData script with the new one, then Deploy > Manage deployments > edit > New version > Deploy.</p>
      <button type="button" class="more" id="walletBack">Back</button></section></div>`;
  }
  const t = walletTotals();
  const bal = w.balances.slice().sort((a, b) => b.balance - a.balance);
  const fbs = w.freeBets.slice().sort((a, b) => (a.expiry || '9999') < (b.expiry || '9999') ? -1 : 1);
  const balList = bal.length ? bal.map((b) => `
    <div class="row tap" data-bal="${esc(b.bookie)}">
      ${avatar(b.bookie)}
      <div class="main"><div class="title">${esc(b.bookie)}</div><div class="meta">Updated ${esc(agoText(b.updated) || '—')}</div></div>
      <div class="right"><div class="amt">${gbp(b.balance)}</div></div>
    </div>`).join('') : `<div class="empty">No balances yet. Add your bookies and exchanges.</div>`;
  const fbList = fbs.length ? fbs.map((f) => {
    const e = expiryText(f.expiry);
    return `<div class="fb">
      <div class="main"><div class="title">${esc(f.bookie)} <span class="fb-amt">${gbp(f.amount)}</span></div>
        <div class="meta"><span class="${e.cls}">${esc(e.text)}</span>${f.note ? ' · ' + esc(f.note) : ''}</div></div>
      <div class="fb-actions">
        <button type="button" class="chip fb-use" data-fbuse="${esc(f.id)}">Use</button>
        <button type="button" class="icon-btn fb-del" data-fbdel="${esc(f.id)}" aria-label="Remove free bet">✕</button>
      </div>
    </div>`;
  }).join('') : `<div class="empty">No free bets. Add them as you get them.</div>`;
  if (part === 'balances') return `
    <section class="card" id="balances">
      <div class="card-head"><div><h2>Balances</h2><p class="sub">Tap one to update it</p></div><button type="button" class="chip" id="balAdd">+ Add</button></div>
      <div class="list">${balList}</div>
    </section>`;
  if (part === 'freebets') return `
    <section class="card" id="freebets">
      <div class="card-head"><div><h2>Free bets</h2><p class="sub">Soonest to expire first</p></div><button type="button" class="chip" id="fbAdd">+ Add</button></div>
      <div class="list">${fbList}</div>
    </section>`;
  return `
    <section class="card" id="notes">
      <h2>Notes</h2><p class="sub">Saved to the Notes tab in your sheet</p>
      <textarea id="notesBox" class="input notes" maxlength="${NOTES_LIMIT}" placeholder="Offers to come back to, promo codes, reminders…">${esc(w.notes)}</textarea>
      <div class="notes-foot"><span id="notesCount" class="small muted"></span><span id="notesStatus" class="small muted">Saved</span></div>
    </section>`;
};

function bindWallet() {
  const back = $('#walletBack'); if (back) back.onclick = () => { S.tab = 'overview'; render(); };
  if (!S.data.wallet) return;
  $$('[data-bal]').forEach((el) => el.addEventListener('click', () => openBalance(el.dataset.bal)));
  const ba = $('#balAdd'); if (ba) ba.onclick = () => openBalance('');
  const fa = $('#fbAdd'); if (fa) fa.onclick = openFreeBetForm;
  $$('[data-fbuse]').forEach((el) => el.addEventListener('click', () => {
    const f = S.data.wallet.freeBets.find((x) => x.id === el.dataset.fbuse); if (!f) return;
    S.form = Object.assign(blankForm(), { type: 'Free Bet', book: f.bookie, amount: String(f.amount), freeBetId: f.id });
    S.tab = 'add'; window.scrollTo(0, 0); render();
  }));
  if (!$('#notesBox')) return;
  $$('[data-fbdel]').forEach((el) => el.addEventListener('click', async () => {
    const f = S.data.wallet.freeBets.find((x) => x.id === el.dataset.fbdel); if (!f) return;
    el.disabled = true;
    try { await walletPost({ action: 'removeFreeBet', id: f.id }); toast('Removed ' + f.bookie + ' free bet'); }
    catch (e) { toast('Not removed: ' + e.message.slice(0, 40)); el.disabled = false; }
  }));
  const box = $('#notesBox'), count = $('#notesCount'), status = $('#notesStatus');
  const showCount = () => { count.textContent = int(box.value.length) + ' / ' + int(NOTES_LIMIT); count.classList.toggle('neg', box.value.length >= NOTES_LIMIT); };
  showCount();
  box.addEventListener('input', () => {
    showCount(); notesDirty = true; status.textContent = 'Not saved yet';
    clearTimeout(notesTimer); notesTimer = setTimeout(saveNotes, 1500);
  });
  box.addEventListener('blur', () => { if (notesDirty) { clearTimeout(notesTimer); saveNotes(); } });
}

async function saveNotes() {
  const box = $('#notesBox'), status = $('#notesStatus');
  if (!box || notesSaving) return;
  const text = box.value.slice(0, NOTES_LIMIT);
  notesSaving = true; notesDirty = false; status.textContent = 'Saving…';
  try {
    const j = await postSheet({ action: 'saveNotes', text });
    if (j.wallet) S.data.wallet.notes = j.wallet.notes;
    const st = $('#notesStatus'); if (st) st.textContent = notesDirty ? 'Not saved yet' : 'Saved';
  } catch (e) {
    notesDirty = true;
    const st = $('#notesStatus'); if (st) { st.textContent = 'Not saved: ' + e.message.slice(0, 60); st.classList.add('neg'); }
  } finally { notesSaving = false; if (notesDirty) { clearTimeout(notesTimer); notesTimer = setTimeout(saveNotes, 3000); } }
}

// Sends a wallet change and redraws with the wallet the sheet sends back.
async function walletPost(payload) {
  const j = await postSheet(payload, true);
  if (j.queued) { toast('No signal: saved on your phone, sends automatically'); return j; }
  if (j.wallet) {
    const keepNotes = S.data.wallet ? S.data.wallet.notes : '';
    S.data.wallet = normalise({ bets: [], wallet: j.wallet }).wallet;
    if (notesDirty) S.data.wallet.notes = keepNotes;
    store.set(CACHE_KEY, JSON.stringify(Object.assign(JSON.parse(store.get(CACHE_KEY) || '{}'), { wallet: j.wallet })));
  }
  if (S.tab === 'offers') render();
  return j;
}

function bookieOptions() {
  const names = new Set(S.data.bets.map((b) => b.book));
  if (S.data.wallet) S.data.wallet.balances.forEach((b) => names.add(b.bookie));
  return `<datalist id="dl-wallet">${Array.from(names).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())).map((n) => `<option value="${esc(n)}">`).join('')}</datalist>`;
}

function openBalance(name) {
  const cur = name ? S.data.wallet.balances.find((b) => b.bookie === name) : null;
  const sheet = openSheet(`
    <h2>${cur ? esc(cur.bookie) : 'Add a balance'}</h2>
    <p class="sub">${cur ? 'Last updated ' + esc(agoText(cur.updated) || '—') : 'A bookie or exchange account'}</p>
    ${cur ? '' : `<label class="fl" for="bal-name">Bookie or exchange</label><input id="bal-name" class="input" list="dl-wallet" autocapitalize="words" placeholder="e.g. Smarkets">${bookieOptions()}`}
    <label class="fl" for="bal-amt">Balance £</label>
    <input id="bal-amt" class="input" inputmode="decimal" value="${cur ? esc(cur.balance) : ''}" placeholder="0.00">
    <button type="button" class="primary" id="bal-save">Save</button>
    ${cur ? '<button type="button" class="text-btn neg" id="bal-del">Remove this account</button>' : ''}
    <button type="button" class="text-btn" id="bal-cancel">Cancel</button>
    <p class="small" id="bal-msg" role="status"></p>`);
  const amt = $('#bal-amt', sheet); setTimeout(() => (cur ? amt : $('#bal-name', sheet)).focus(), 250);
  const msg = $('#bal-msg', sheet);
  const fail = (t) => { msg.textContent = t; msg.className = 'small err'; };
  $('#bal-cancel').onclick = closeSettle;
  $('#bal-save').onclick = async () => {
    const bookie = cur ? cur.bookie : $('#bal-name').value.trim();
    const v = pnum(amt.value);
    if (!bookie) return fail('Add the bookie or exchange name.');
    if (v == null) return fail('Balance must be a number.');
    const btn = $('#bal-save'); btn.disabled = true; btn.textContent = 'Saving…';
    try { await walletPost({ action: 'setBalance', bookie, balance: v }); closeSettle(); toast(bookie + ' ' + gbp(v)); }
    catch (e) { fail(e.message); btn.disabled = false; btn.textContent = 'Save'; }
  };
  const del = $('#bal-del');
  if (del) del.onclick = async () => {
    del.disabled = true;
    try { await walletPost({ action: 'setBalance', bookie: cur.bookie, remove: true }); closeSettle(); toast('Removed ' + cur.bookie); }
    catch (e) { fail(e.message); del.disabled = false; }
  };
}

function openFreeBetForm() {
  const sheet = openSheet(`
    <h2>Add a free bet</h2><p class="sub">It stays in your wallet until you use or remove it</p>
    <label class="fl" for="fb-book">Bookie</label>
    <input id="fb-book" class="input" list="dl-wallet" autocapitalize="words" placeholder="e.g. Betfred">${bookieOptions()}
    <div class="grid2f">
      <div><label class="fl" for="fb-amt">Amount £</label><input id="fb-amt" class="input" inputmode="decimal" placeholder="10"></div>
      <div><label class="fl" for="fb-exp">Expires</label><input id="fb-exp" class="input" type="date" min="${iso(new Date())}"></div>
    </div>
    <label class="fl" for="fb-note">Note (optional)</label>
    <input id="fb-note" class="input" maxlength="200" placeholder="e.g. min odds 2.0, football only">
    <button type="button" class="primary" id="fb-save">Add free bet</button>
    <button type="button" class="text-btn" id="fb-cancel">Cancel</button>
    <p class="small" id="fb-msg" role="status"></p>`);
  setTimeout(() => $('#fb-book', sheet).focus(), 250);
  const msg = $('#fb-msg', sheet);
  const fail = (t) => { msg.textContent = t; msg.className = 'small err'; };
  $('#fb-cancel').onclick = closeSettle;
  $('#fb-save').onclick = async () => {
    const bookie = $('#fb-book').value.trim(), amount = pnum($('#fb-amt').value), expEl = $('#fb-exp');
    if (!bookie) return fail('Add the bookie.');
    if (!amount || amount <= 0) return fail('Amount must be a number.');
    if (expEl.value && !expEl.validity.valid) return fail('Check the expiry date.');
    const btn = $('#fb-save'); btn.disabled = true; btn.textContent = 'Adding…';
    try { await walletPost({ action: 'addFreeBet', bookie, amount, expiry: expEl.value, note: $('#fb-note').value.trim() }); closeSettle(); toast('Free bet added'); }
    catch (e) { fail(e.message); btn.disabled = false; btn.textContent = 'Add free bet'; }
  };
}

/* ---------- casino offers ---------- */
const CASINO_TYPES = ['Free spins', 'Deposit bonus', 'Wager & get', 'Cashback', 'Other'];

function casinoMenuLine() {
  const c = S.data && S.data.casino;
  if (!c) return 'Free spins, bonuses and wagering';
  const open = c.filter((x) => x.status !== 'Done').length;
  const month = r2(sum(c.filter((x) => x.status === 'Done' && x.date.slice(0, 7) === monthKey(new Date())), (x) => x.result));
  return `${open} in progress · ${signed(month)} this month`;
}

// Expected value of a casino offer.
// Free spins pay back their value x RTP on average; any amount you have to play (to qualify or to clear a bonus)
// costs that amount x house edge on average. Bonus cash and cashback count at face value.
// play: amount you have to play; playRtp: RTP of that game; spinsRtp: RTP of the free spins game.
function casinoEVParts(bonus, play, playRtp, type, spinsRtp) {
  const b = n0(bonus), w = n0(play);
  const pr = (playRtp == null ? 96 : playRtp) / 100;
  const sr = (spinsRtp == null ? (playRtp == null ? 96 : playRtp) : spinsRtp) / 100;
  const spins = type === 'Free spins';
  const back = w * pr; // what playing returns on average
  const value = spins ? b * sr : b;
  return { spins, pr, sr, play: r2(w), back: r2(back), playLoss: r2(back - w), value: r2(value), ev: r2(value + back - w) };
}
function casinoEV(bonus, play, playRtp, deposit, type, spinsRtp) {
  if (!n0(bonus) && !n0(play)) return null;
  return casinoEVParts(bonus, play, playRtp, type, spinsRtp).ev;
}

VIEWS.casino = function () {
  const c = S.data.casino;
  if (!c) {
    return `<div class="stack"><section class="card"><h2>Casino offers</h2>
      <p class="sub">Your sheet's script needs updating first. Replace your DashboardData script with the new one, then Deploy > Manage deployments > edit > New version > Deploy.</p>
      <button type="button" class="more" id="casBack">Back</button></section></div>`;
  }
  const done = c.filter((x) => x.status === 'Done');
  const open = c.filter((x) => x.status !== 'Done');
  const all = r2(sum(done, (x) => x.result));
  const mk = monthKey(new Date());
  const month = r2(sum(done.filter((x) => x.date.slice(0, 7) === mk), (x) => x.result));
  const openExp = r2(sum(open, (x) => x.expected));
  const byMonth = new Map();
  done.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).forEach((x) => { const k = x.date.slice(0, 7); if (!byMonth.has(k)) byMonth.set(k, []); byMonth.get(k).push(x); });
  const openList = open.length ? open.map((x) => {
    const pct = x.wagerReq ? Math.min(100, (n0(x.wagered) / x.wagerReq) * 100) : null;
    return `<div class="cas tap" data-cas="${esc(x.id)}">
      <div class="cas-top"><div class="main"><div class="title">${esc(x.site)}</div><div class="meta">${esc(x.type || 'Offer')} · ${fmtShort(x.date)}${x.deposit ? ' · deposit ' + gbp(x.deposit) : ''}${x.bonus ? ' · bonus ' + gbp(x.bonus) : ''}</div></div>
      <div class="right"><div class="amt ${tone(x.expected)}">${x.expected == null ? '—' : signed(x.expected)}</div><div class="meta">expected</div></div></div>
      ${pct != null ? `<div class="day-progress"><i style="width:${pct}%"></i></div><div class="meta cas-w">${gbp(n0(x.wagered))} of ${gbp(x.wagerReq)} wagered · ${gbp(r2(Math.max(0, x.wagerReq - n0(x.wagered))))} to go</div>` : ''}
      ${x.notes ? `<div class="meta cas-note">${esc(x.notes)}</div>` : ''}
    </div>`;
  }).join('') : `<div class="empty">Nothing in progress. Tap + Add when you start an offer.</div>`;
  const doneList = byMonth.size ? Array.from(byMonth.entries()).map(([k, list]) => `
    <div class="cas-month"><span>${esc(fmtMonthLong(k))}</span><b class="${tone(r2(sum(list, (x) => x.result)))}">${signed(r2(sum(list, (x) => x.result)))}</b></div>
    ${list.map((x) => `<div class="row tap" data-cas="${esc(x.id)}"><div class="main"><div class="title">${esc(x.site)}</div><div class="meta">${esc(x.type || 'Offer')} · ${fmtShort(x.date)}${x.expected != null ? ' · exp. ' + signed(x.expected) : ''}</div></div>
      <div class="right"><div class="amt ${tone(x.result)}">${signed(x.result)}</div></div></div>`).join('')}`).join('') : `<div class="empty">Finished offers will show here.</div>`;
  return `<div class="stack">
    <div class="kpis">
      <div class="kpi hero"><div class="label">Casino profit</div><div class="big ${tone(all)}">${gbp(all)}</div><div class="foot">${int(done.length)} finished ${done.length === 1 ? 'offer' : 'offers'}</div></div>
      <div class="kpi"><div class="label">This month</div><div class="big ${tone(month)}">${signed(month)}</div><div class="foot">finished offers</div></div>
      <div class="kpi"><div class="label">In progress</div><div class="big">${int(open.length)}</div><div class="foot">${signed(openExp)} expected</div></div>
    </div>
    <section class="card">
      <div class="card-head"><div><h2>In progress</h2><p class="sub">Tap one to update wagering or finish it</p></div><button type="button" class="chip" id="casAdd">+ Add</button></div>
      <div class="list">${openList}</div>
    </section>
    <section class="card"><h2>Finished</h2><p class="sub">Grouped by month started</p><div class="list">${doneList}</div></section>
  </div>`;
};

function bindCasino() {
  const back = $('#casBack'); if (back) back.onclick = () => { S.tab = 'overview'; render(); };
  if (!S.data.casino) return;
  const ca = $('#casAdd'); if (ca) ca.onclick = () => openCasinoForm(null);
  $$('[data-cas]').forEach((el) => el.addEventListener('click', () => {
    const x = S.data.casino.find((o) => o.id === el.dataset.cas);
    if (x) (x.status === 'Done' ? openCasinoForm(x) : openCasinoActions(x));
  }));
}

async function casinoPost(payload) {
  const j = await postSheet(payload, true);
  if (j.queued) { toast('No signal: saved on your phone, sends automatically'); return j; }
  if (j.casino) {
    S.data.casino = normalise({ bets: [], casino: j.casino }).casino;
    store.set(CACHE_KEY, JSON.stringify(Object.assign(JSON.parse(store.get(CACHE_KEY) || '{}'), { casino: j.casino })));
  }
  if (S.tab === 'offers') render();
  return j;
}

function offerPayload(x, changes) {
  return Object.assign({ site: x.site, type: x.type, deposit: x.deposit, bonus: x.bonus, wagerReq: x.wagerReq, wagered: x.wagered, expected: x.expected, result: x.result, status: x.status, notes: x.notes }, changes);
}

function openCasinoActions(x) {
  const sheet = openSheet(`
    <h2>${esc(x.site)}</h2><p class="sub">${esc(x.type || 'Offer')} · started ${fmtDay(x.date)}${x.expected != null ? ' · expected ' + signed(x.expected) : ''}</p>
    ${x.wagerReq ? `<label class="fl" for="c-wag">Wagered so far £ <span class="muted">(of ${gbp(x.wagerReq)})</span></label>
    <div class="inline-row"><input id="c-wag" class="input" inputmode="decimal" value="${x.wagered == null ? '' : esc(x.wagered)}" placeholder="0"><button type="button" class="chip" id="c-wag-save">Save</button></div>` : ''}
    <label class="fl" for="c-res">Finished? Your profit or loss £</label>
    <div class="inline-row"><input id="c-res" class="input" inputmode="text" placeholder="e.g. 18.40 or -3.20"><button type="button" class="chip fb-use" id="c-done">Finish</button></div>
    <p class="small muted">Profit = what you withdrew (or have left) minus what you deposited.</p>
    <button type="button" class="wide-btn" id="c-edit">Edit details</button>
    <button type="button" class="text-btn neg" id="c-del">Delete offer</button>
    <button type="button" class="text-btn" id="c-close">Close</button>
    <p class="small" id="c-msg"></p>`);
  const msg = $('#c-msg', sheet);
  const fail = (t) => { msg.textContent = t; msg.className = 'small err'; };
  const go = async (changes, done) => {
    try { await casinoPost({ action: 'casinoUpdate', id: x.id, offer: offerPayload(x, changes) }); closeSettle(); toast(done); }
    catch (e) { fail(e.message); }
  };
  const ws = $('#c-wag-save');
  if (ws) ws.onclick = () => { const v = pnum($('#c-wag').value); if (v == null || v < 0) return fail('Wagered must be a number.'); go({ wagered: v }, 'Wagering updated'); };
  $('#c-done').onclick = () => {
    const v = pnum($('#c-res').value.replace('−', '-'));
    if (v == null) return fail('Enter your profit or loss.');
    go({ status: 'Done', result: v, wagered: x.wagerReq || x.wagered }, 'Finished ' + signed(v)).then(() => { if (v > 0) confetti(); });
  };
  $('#c-edit').onclick = () => { closeSettle(); setTimeout(() => openCasinoForm(x), 220); };
  $('#c-del').onclick = async () => {
    if ($('#c-del').dataset.sure !== '1') { $('#c-del').dataset.sure = '1'; $('#c-del').textContent = 'Tap again to delete'; return; }
    try { await casinoPost({ action: 'casinoDelete', id: x.id }); closeSettle(); toast('Offer deleted'); } catch (e) { fail(e.message); }
  };
  $('#c-close').onclick = closeSettle;
}

function openCasinoForm(x) {
  const editing = !!x;
  const o = x || { site: '', type: 'Free spins', deposit: null, bonus: null, wagerReq: null, wagered: null, expected: null, result: null, status: 'In progress', notes: '' };
  const rtp = prefs.rtp != null ? prefs.rtp : 96;
  const sites = Array.from(new Set([...(S.data.casino || []).map((c) => c.site), ...S.data.bets.map((b) => b.book)])).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  const v = (n) => (n == null ? '' : esc(n));
  const sheet = openSheet(`
    <h2>${editing ? 'Edit casino offer' : 'Add a casino offer'}</h2><p class="sub">Saved to the Casino tab in your sheet</p>
    <label class="fl" for="cf-site">Site</label>
    <input id="cf-site" class="input" list="dl-sites" value="${esc(o.site)}" autocapitalize="words" placeholder="e.g. Grosvenor"><datalist id="dl-sites">${sites.map((s) => `<option value="${esc(s)}">`).join('')}</datalist>
    <div class="fl">Offer type</div>
    <div class="chips wrap" id="cf-types">${CASINO_TYPES.map((t) => `<button type="button" class="chip sm" data-ctype="${esc(t)}" aria-pressed="${o.type === t}">${esc(t)}</button>`).join('')}</div>
    <div class="edit-grid">
      <div><label class="fl" for="cf-dep">Deposit £</label><input id="cf-dep" class="input" inputmode="decimal" value="${v(o.deposit)}" placeholder="0"></div>
      <div><label class="fl" for="cf-wr">Amount to play £</label><input id="cf-wr" class="input" inputmode="decimal" value="${v(o.wagerReq)}" placeholder="0 if none"></div>
      <div class="spins-only"><label class="fl" for="cf-spn">Number of spins</label><input id="cf-spn" class="input" inputmode="numeric" placeholder="e.g. 30"></div>
      <div class="spins-only"><label class="fl" for="cf-spv">Value per spin £</label><input id="cf-spv" class="input" inputmode="decimal" placeholder="e.g. 0.10"></div>
      <div><label class="fl" for="cf-bon" id="cf-bon-l">Bonus / spins value £</label><input id="cf-bon" class="input" inputmode="decimal" value="${v(o.bonus)}" placeholder="e.g. 10"></div>
      <div class="not-spins"><label class="fl" for="cf-x">Play × bonus</label><input id="cf-x" class="input" inputmode="decimal" placeholder="e.g. 10"></div>
      <div><label class="fl" for="cf-rtp" id="cf-rtp-l">Game RTP %</label><input id="cf-rtp" class="input" inputmode="decimal" value="${esc(rtp)}"></div>
      <div class="spins-only"><label class="fl" for="cf-srtp">Spins game RTP %</label><input id="cf-srtp" class="input" inputmode="decimal" value="${esc(prefs.srtp != null ? prefs.srtp : rtp)}"></div>
      <div class="full"><label class="fl" for="cf-exp">Expected £</label><input id="cf-exp" class="input" inputmode="text" value="${v(o.expected)}"></div>
    </div>
    <p class="small muted" id="cf-ev"></p>
    <p class="small muted">Amount to play: everything you have to stake, e.g. the £10 in "bet £10 get 30 spins", plus any wagering. It copies your deposit for spins and wager & get offers unless you change it.</p>
    ${editing ? `<div class="edit-grid">
      <div><label class="fl" for="cf-wag">Wagered so far £</label><input id="cf-wag" class="input" inputmode="decimal" value="${v(o.wagered)}"></div>
      <div><label class="fl" for="cf-res">Result £</label><input id="cf-res" class="input" inputmode="text" value="${v(o.result)}" placeholder="When finished"></div>
    </div>
    <div class="fl">Status</div>
    <div class="chips" id="cf-status"><button type="button" class="chip" data-cst="In progress" aria-pressed="${o.status !== 'Done'}">In progress</button><button type="button" class="chip" data-cst="Done" aria-pressed="${o.status === 'Done'}">Finished</button></div>` : ''}
    <label class="fl" for="cf-notes">Notes</label>
    <input id="cf-notes" class="input" maxlength="300" value="${esc(o.notes)}" placeholder="e.g. Big Bass only, 7 days to wager">
    <button type="button" class="primary" id="cf-save">${editing ? 'Save changes' : 'Add offer'}</button>
    ${editing ? '<button type="button" class="text-btn neg" id="cf-del">Delete offer</button>' : ''}
    <button type="button" class="text-btn" id="cf-cancel">Cancel</button>
    <p class="small" id="cf-msg"></p>`);
  let type = o.type || 'Free spins', status = o.status, expTouched = o.expected != null, playTouched = o.wagerReq != null;
  const msg = $('#cf-msg', sheet);
  const fail = (t) => { msg.textContent = t; msg.className = 'small err'; };
  const pct = (x) => Math.round(x * 1000) / 10 + '%';
  const showType = () => {
    const spins = type === 'Free spins';
    $$('.spins-only', sheet).forEach((e) => { e.hidden = !spins; });
    $$('.not-spins', sheet).forEach((e) => { e.hidden = spins; });
    $('#cf-bon-l').textContent = spins ? 'Spins value £' : type === 'Cashback' ? 'Cashback £' : 'Bonus £';
    $('#cf-rtp-l').textContent = spins ? 'Play game RTP %' : 'Game RTP %';
  };
  const updateEV = () => {
    const bon = pnum($('#cf-bon').value), wr = pnum($('#cf-wr').value), rtpv = pnum($('#cf-rtp').value), srtp = pnum($('#cf-srtp').value);
    const ev = casinoEV(bon, wr, rtpv, pnum($('#cf-dep').value), type, srtp);
    const p = casinoEVParts(bon, wr, rtpv, type, srtp);
    const parts = [];
    if (p.play) parts.push(`Play ${gbp(p.play)} × ${pct(p.pr)} = ${gbp(p.back)} back (${signed(p.playLoss)})`);
    if (n0(bon)) parts.push(p.spins ? `Spins ${gbp(n0(bon))} × ${pct(p.sr)} = ${gbp(p.value)}` : `${type === 'Cashback' ? 'Cashback' : 'Bonus'} ${gbp(p.value)}`);
    $('#cf-ev').innerHTML = ev == null
      ? 'Expected = what you get back from playing, plus what the spins or bonus are worth, minus what you staked.'
      : `${parts.map(esc).join('<br>')}<br><b>Expected profit ${esc(signed(ev))}</b>`;
    if (!expTouched && ev != null) $('#cf-exp').value = ev;
  };
  const fillPlay = () => {
    if (playTouched || !(type === 'Free spins' || type === 'Wager & get')) return;
    const d = pnum($('#cf-dep').value); $('#cf-wr').value = d == null ? '' : d; updateEV();
  };
  const fillSpins = () => {
    const n = pnum($('#cf-spn').value), val = pnum($('#cf-spv').value);
    if (n != null && val != null) { $('#cf-bon').value = r2(n * val); updateEV(); }
  };
  $$('[data-ctype]', sheet).forEach((b) => b.addEventListener('click', () => { type = b.dataset.ctype; $$('[data-ctype]', sheet).forEach((x2) => x2.setAttribute('aria-pressed', String(x2 === b))); showType(); fillPlay(); updateEV(); }));
  $$('[data-cst]', sheet).forEach((b) => b.addEventListener('click', () => { status = b.dataset.cst; $$('[data-cst]', sheet).forEach((x2) => x2.setAttribute('aria-pressed', String(x2 === b))); }));
  ['#cf-bon', '#cf-wr', '#cf-rtp', '#cf-srtp', '#cf-dep'].forEach((id) => $(id).addEventListener('input', updateEV));
  $('#cf-dep').addEventListener('input', fillPlay);
  $('#cf-wr').addEventListener('input', () => { playTouched = $('#cf-wr').value.trim() !== ''; });
  ['#cf-spn', '#cf-spv'].forEach((id) => $(id).addEventListener('input', fillSpins));
  $('#cf-srtp').addEventListener('change', () => { const r = pnum($('#cf-srtp').value); if (r != null) { prefs.srtp = r; savePrefs(); } });
  $('#cf-x').addEventListener('input', () => { const m = pnum($('#cf-x').value), b = pnum($('#cf-bon').value); if (m != null && b != null) { $('#cf-wr').value = r2(m * b); updateEV(); } });
  $('#cf-exp').addEventListener('input', () => { expTouched = $('#cf-exp').value.trim() !== ''; });
  $('#cf-rtp').addEventListener('change', () => { const r = pnum($('#cf-rtp').value); if (r != null) { prefs.rtp = r; store.set(PREF_KEY, JSON.stringify(Object.assign(JSON.parse(store.get(PREF_KEY) || '{}'), { rtp: r }))); } });
  showType();
  updateEV();
  $('#cf-cancel').onclick = closeSettle;
  const del = $('#cf-del');
  if (del) del.onclick = async () => {
    if (del.dataset.sure !== '1') { del.dataset.sure = '1'; del.textContent = 'Tap again to delete'; return; }
    try { await casinoPost({ action: 'casinoDelete', id: x.id }); closeSettle(); toast('Offer deleted'); } catch (e) { fail(e.message); }
  };
  $('#cf-save').onclick = async () => {
    const site = $('#cf-site').value.trim();
    if (!site) return fail('Add the site.');
    const num = (id) => { const el = $(id); if (!el) return undefined; const t = el.value.trim().replace('−', '-'); return t === '' ? null : pnum(t); };
    for (const [id, label] of [['#cf-dep', 'Deposit'], ['#cf-bon', 'Bonus'], ['#cf-wr', 'Wagering'], ['#cf-exp', 'Expected'], ['#cf-wag', 'Wagered'], ['#cf-res', 'Result']]) {
      const el = $(id); if (el && el.value.trim() !== '' && pnum(el.value.replace('−', '-')) == null) return fail(label + ' must be a number.');
    }
    if (status === 'Done' && num('#cf-res') == null) return fail('Add the result, or set it back to In progress.');
    const offer = { site, type, deposit: num('#cf-dep'), bonus: num('#cf-bon'), wagerReq: num('#cf-wr'), expected: num('#cf-exp'), notes: $('#cf-notes').value.trim(),
      wagered: editing ? num('#cf-wag') : null, result: editing ? num('#cf-res') : null, status: editing ? status : 'In progress' };
    const btn = $('#cf-save'); btn.disabled = true; btn.textContent = 'Saving…';
    try {
      await casinoPost(editing ? { action: 'casinoUpdate', id: x.id, offer } : { action: 'casinoAdd', offer });
      closeSettle(); toast(editing ? 'Offer updated' : 'Casino offer added');
    } catch (e) { fail(e.message); btn.disabled = false; btn.textContent = editing ? 'Save changes' : 'Add offer'; }
  };
}

/* ---------- pull to refresh ---------- */
function setupPullToRefresh() {
  const ptr = $('#ptr');
  let startY = null, pulling = false;
  window.addEventListener('touchstart', (e) => {
    if (window.scrollY > 0 || !$('#sheet').hidden || !$('#setup').hidden || e.touches.length !== 1) { startY = null; return; }
    startY = e.touches[0].clientY; pulling = false;
  }, { passive: true });
  window.addEventListener('touchmove', (e) => {
    if (startY == null) return;
    const dy = e.touches[0].clientY - startY;
    if (dy > 10 && window.scrollY <= 0) {
      pulling = true;
      const p = Math.min(dy, 120);
      ptr.classList.add('show');
      ptr.style.transform = `translate(-50%, ${p * 0.6}px) rotate(${p * 3}deg)`;
      ptr.classList.toggle('ready', p >= 80);
    }
  }, { passive: true });
  window.addEventListener('touchend', () => {
    if (startY == null) return;
    const ready = ptr.classList.contains('ready');
    startY = null; ptr.classList.remove('ready'); ptr.style.transform = '';
    if (pulling && ready) { ptr.classList.add('spin'); load(true); } else ptr.classList.remove('show');
    pulling = false;
  });
}

/* ---------- settings & themes ---------- */
const THEMES = [['auto', 'Auto'], ['dark', 'Dark'], ['light', 'Light'], ['temple', 'Temple'], ['party', 'Party']];
const THEME_BAR = { dark: '#0e1116', light: '#f5f6f8', party: '#ff3cac', temple: '#123524' };

function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  const light = t === 'light' || (t === 'auto' && window.matchMedia('(prefers-color-scheme: light)').matches);
  const bar = THEME_BAR[t] && t !== 'dark' && t !== 'light' ? THEME_BAR[t] : light ? THEME_BAR.light : THEME_BAR.dark;
  const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.setAttribute('content', bar);
  if (S.data) drawCharts(); // charts read colours at draw time
}

function openSettings() {
  const sheet = $('#sheet');
  sheet.innerHTML = `<div class="sheet-card" role="dialog" aria-modal="true" aria-labelledby="set-title">
    <div class="grab"></div>
    <h2 id="set-title">Settings</h2>
    <p class="sub">Saved on this device</p>
    <div class="fl">Theme</div>
    <div class="themes">${THEMES.map(([k, l]) => `<button type="button" class="theme-opt" data-theme-pick="${k}" aria-pressed="${S.theme === k}"><span class="swatch sw-${k}"></span>${l}</button>`).join('')}</div>
    <div class="set-row" style="margin-top:12px"><label for="set-comm">Exchange commission %</label><input id="set-comm" class="input" inputmode="decimal" value="${esc(S.commission)}"></div>
    <div class="fl" style="margin-top:14px">Bookie logo</div>
    <p class="muted small" style="margin:0 0 8px">Wrong or missing logo? Pick the bookie and paste its website.</p>
    <div class="logo-fix">
      <select id="lg-book" class="select" aria-label="Bookie">${logoBookies().map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join('')}</select>
      <input id="lg-site" class="input" placeholder="e.g. daznbet.com" inputmode="url" autocapitalize="off" autocorrect="off" spellcheck="false" aria-label="Website">
      <button type="button" class="chip fb-use" id="lg-save">Save</button>
    </div>
    <p class="muted small" id="lg-msg" style="margin:6px 0 0;min-height:1.2em" aria-live="polite"></p>
    <div class="set-row"><span>Sheet link</span><span class="muted small">${store.get(LINK_KEY) ? 'Connected' : 'Not connected'}</span></div>
    <button type="button" class="wide-btn" id="set-link">Change sheet link</button>
    <button type="button" class="text-btn" id="set-close">Done</button>
  </div>`;
  sheet.hidden = false;
  requestAnimationFrame(() => sheet.classList.add('show'));
  $$('[data-theme-pick]', sheet).forEach((b) => b.addEventListener('click', () => {
    S.theme = b.dataset.themePick; savePrefs(); applyTheme(S.theme);
    $$('[data-theme-pick]', sheet).forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
    if (S.theme === 'party' || S.theme === 'temple') confetti();
  }));
  const comm = $('#set-comm');
  comm.addEventListener('input', () => { const v = pnum(comm.value); S.commission = v == null ? 0 : v; savePrefs(); if (S.tab === 'add') renderCalc(); });
  $('#set-link').onclick = () => { closeSettle(); setTimeout(() => showSetup(true), 220); };
  $('#set-close').onclick = closeSettle;
  const lgBook = $('#lg-book'), lgSite = $('#lg-site'), lgMsg = $('#lg-msg');
  const showSite = () => { const k = logoKey(lgBook.value); lgSite.value = LOGO_SITES[k] || ''; };
  if (lgBook) { lgBook.onchange = showSite; showSite(); }
  $('#lg-save') && ($('#lg-save').onclick = () => {
    const key = logoKey(lgBook.value); if (!key) return;
    const d = cleanDomain(lgSite.value);
    if (lgSite.value.trim() && !d) { lgMsg.textContent = "That doesn't look like a website."; return; }
    if (d) LOGO_SITES[key] = d; else delete LOGO_SITES[key];
    delete LOGO_CACHE[key];
    try { localStorage.setItem('mb.logoSites', JSON.stringify(LOGO_SITES)); localStorage.setItem('mb.logos', JSON.stringify(LOGO_CACHE)); } catch (e) {}
    lgSite.value = d;
    lgMsg.innerHTML = d ? `Saved. ${avatar(lgBook.value)}` : 'Cleared, back to automatic.';
    render();
  });
  sheet.onclick = (e) => { if (e.target === sheet) closeSettle(); };
}

function confetti() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (S.theme === 'temple') { rockfall(); return; }
  if (S.theme !== 'party') return;
  const colours = ['#ff3cac', '#ffe53b', '#00f5ff', '#00f5a0', '#ff9a3c', '#b388ff', '#ffffff'];
  for (let i = 0; i < 80; i++) {
    const c = document.createElement('div');
    c.className = 'confetti';
    c.style.left = Math.random() * 100 + 'vw';
    c.style.background = colours[i % colours.length];
    c.style.animationDuration = 1.6 + Math.random() * 1.6 + 's';
    c.style.animationDelay = Math.random() * 0.4 + 's';
    c.style.transform = 'rotate(' + Math.random() * 360 + 'deg)';
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 3800);
  }
}

// Temple mode: carved stone blocks tumble down the screen.
function rockfall() {
  for (let i = 0; i < 26; i++) {
    const r = document.createElement('div');
    const size = 18 + Math.random() * 26;
    r.className = 'rock';
    r.style.width = size + 'px'; r.style.height = size * (0.8 + Math.random() * 0.4) + 'px';
    r.style.left = Math.random() * 100 + 'vw';
    r.style.setProperty('--spin', (Math.random() * 120 - 60) + 'deg');
    r.style.animationDuration = 1.1 + Math.random() * 0.9 + 's';
    r.style.animationDelay = Math.random() * 0.5 + 's';
    document.body.appendChild(r);
    setTimeout(() => r.remove(), 2800);
  }
}

/* ---------- charts (plain SVG) ---------- */
const measureCtx = document.createElement('canvas').getContext('2d');
function textW(s) { measureCtx.font = '11px ' + getComputedStyle(document.body).fontFamily; return measureCtx.measureText(s).width; }
function niceTicks(lo, hi, count) {
  if (lo === hi) hi = lo + 1;
  const span = hi - lo;
  let step = Math.pow(10, Math.floor(Math.log10(span / count)));
  const err = span / count / step;
  if (err >= 7.5) step *= 10; else if (err >= 3.5) step *= 5; else if (err >= 1.5) step *= 2;
  const a = Math.floor(lo / step) * step, b = Math.ceil(hi / step) * step;
  const ticks = [];
  for (let v = a; v <= b + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return { ticks, lo: a, hi: b };
}
function tipFor(el) { const t = document.createElement('div'); t.className = 'tip'; el.appendChild(t); return t; }
function showTip(tip, el, x, y, title, lines) {
  tip.innerHTML = `<b>${esc(title)}</b>` + lines.map(([k, v]) => `<div><span class="k">${esc(k)}</span> ${esc(v)}</div>`).join('');
  tip.style.display = 'block';
  const w = tip.offsetWidth, W = el.clientWidth;
  tip.style.left = Math.max(0, Math.min(W - w, x - w / 2)) + 'px';
  tip.style.top = Math.max(0, y - tip.offsetHeight - 12) + 'px';
}
function onPoint(target, fn, leave) {
  const handler = (e) => { const r = target.getBoundingClientRect(); fn(e.clientX - r.left, e.clientY - r.top); };
  target.addEventListener('pointermove', handler);
  target.addEventListener('pointerdown', handler);
  target.addEventListener('pointerleave', leave);
}
const ACCENT = 'var(--accent)', BAD = 'var(--bad)';

function drawCharts() {
  const cum = $('#ch-cum'); if (cum) lineChart(cum, C.daily);
  const bars = $('#ch-bars'); if (bars) barChart(bars, C.buckets);
  const types = $('#ch-types'); if (types) hbarChart(types, C.types);
}

function lineChart(el, rows) {
  if (!rows.length) { el.innerHTML = `<div class="empty">No settled bets in this period.</div>`; return; }
  const W = el.clientWidth || 320, H = 230, mt = 12, mb = 26, mr = 12;
  const lo = Math.min(0, ...rows.map((r) => r.cum)), hi = Math.max(1, ...rows.map((r) => r.cum));
  const yt = niceTicks(lo, hi, 4);
  const ml = Math.max(...yt.ticks.map((t) => textW(gbp0(t)))) + 10;
  const t0 = parseIso(rows[0].day).getTime(), t1 = Math.max(t0 + 864e5, parseIso(rows[rows.length - 1].day).getTime());
  const X = (day) => ml + ((parseIso(day).getTime() - t0) / (t1 - t0)) * (W - ml - mr);
  const Y = (v) => mt + (1 - (v - yt.lo) / (yt.hi - yt.lo)) * (H - mt - mb);
  const spanDays = (t1 - t0) / 864e5;
  // x ticks
  const xt = [];
  const maxTicks = Math.max(2, Math.floor((W - ml) / 70));
  if (spanDays > 75) {
    const d0 = parseIso(rows[0].day);
    let m = new Date(d0.getFullYear(), d0.getMonth() + 1, 1);
    const months = [];
    while (m.getTime() <= t1) { months.push(iso(m)); m = new Date(m.getFullYear(), m.getMonth() + 1, 1); }
    const every = Math.ceil(months.length / maxTicks) || 1;
    months.forEach((d, i) => { if (i % every === 0) xt.push([d, parseIso(d).toLocaleDateString('en-GB', { month: 'short' })]); });
  } else {
    const n = Math.min(maxTicks, Math.max(2, Math.round(spanDays) + 1));
    for (let i = 0; i < n; i++) { const d = iso(new Date(t0 + ((t1 - t0) * i) / (n - 1))); xt.push([d, fmtShort(d)]); }
  }
  const pts = rows.map((r) => [X(r.day), Y(r.cum)]);
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('');
  const area = line + `L${pts[pts.length - 1][0].toFixed(1)},${Y(0).toFixed(1)}L${pts[0][0].toFixed(1)},${Y(0).toFixed(1)}Z`;
  el.innerHTML = `<svg width="${W}" height="${H}" role="img" aria-label="Line chart of running total profit">
    <defs><linearGradient id="g-area" x1="0" x2="0" y1="0" y2="1"><stop offset="0" style="stop-color:${ACCENT};stop-opacity:0.28"/><stop offset="1" style="stop-color:${ACCENT};stop-opacity:0"/></linearGradient></defs>
    ${yt.ticks.map((t) => `<line class="grid" x1="${ml}" x2="${W - mr}" y1="${Y(t)}" y2="${Y(t)}"/><text class="tick" x="${ml - 8}" y="${Y(t) + 4}" text-anchor="end">${esc(gbp0(t))}</text>`).join('')}
    ${xt.map(([d, l]) => `<text class="tick" x="${Math.min(W - mr - textW(l) / 2, Math.max(ml + textW(l) / 2, X(d)))}" y="${H - 6}" text-anchor="middle">${esc(l)}</text>`).join('')}
    <path d="${area}" fill="url(#g-area)"/>
    <path d="${line}" style="fill:none;stroke:${ACCENT}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>
    <line class="cursor" x1="0" x2="0" y1="${mt}" y2="${H - mb}" stroke-dasharray="3 3" style="display:none;stroke:var(--muted)"/>
    <circle class="dot" r="4.5" stroke-width="2" style="display:none;fill:${ACCENT};stroke:var(--panel)"/>
  </svg>`;
  const svg = el.querySelector('svg'), dot = svg.querySelector('.dot'), cur = svg.querySelector('.cursor');
  const tip = tipFor(el);
  onPoint(svg, (px) => {
    let best = 0, bd = Infinity;
    pts.forEach((p, i) => { const d = Math.abs(p[0] - px); if (d < bd) { bd = d; best = i; } });
    const r = rows[best], p = pts[best];
    dot.style.display = ''; dot.setAttribute('cx', p[0]); dot.setAttribute('cy', p[1]);
    cur.style.display = ''; cur.setAttribute('x1', p[0]); cur.setAttribute('x2', p[0]);
    showTip(tip, el, p[0], p[1], fmtDay(r.day), [['Total', gbp(r.cum)], ['That day', signed(r.profit)]]);
  }, () => { tip.style.display = 'none'; dot.style.display = 'none'; cur.style.display = 'none'; });
}

function barChart(el, rows) {
  if (!rows.length || !rows.some((r) => r.bets)) { el.innerHTML = `<div class="empty">No settled bets in this period.</div>`; return; }
  const daily = rows[0].gran === 'day';
  const W = el.clientWidth || 320, H = 210, mt = 20, mb = 24;
  const lo = Math.min(0, ...rows.map((r) => r.profit)), hi = Math.max(1, ...rows.map((r) => r.profit));
  const Y = (v) => mt + (1 - (v - lo) / (hi - lo)) * (H - mt - mb);
  const step = (W - 4) / rows.length, bw = Math.max(1, step * (daily ? 0.78 : 0.7));
  const xOf = (i) => 2 + i * step + (step - bw) / 2;
  const every = Math.max(1, Math.ceil((daily ? 44 : 30) / step));
  const label = (r) => (daily ? fmtShort(r.key) : fmtMon(r.key));
  el.innerHTML = `<svg width="${W}" height="${H}" role="img" aria-label="Bar chart of profit by ${daily ? 'day' : 'month'}">
    ${rows.map((r, i) => r.profit ? `<rect x="${xOf(i)}" width="${bw}" y="${Y(Math.max(0, r.profit))}" height="${Math.max(1, Math.abs(Y(r.profit) - Y(0)))}" rx="${Math.min(4, bw / 3)}" style="fill:${r.profit < 0 ? BAD : ACCENT}"/>` : '').join('')}
    <line class="axis" x1="2" x2="${W - 2}" y1="${Y(0)}" y2="${Y(0)}"/>
    ${bw >= 30 ? rows.map((r, i) => r.bets ? `<text class="val" x="${xOf(i) + bw / 2}" y="${r.profit >= 0 ? Y(r.profit) - 6 : Y(r.profit) + 14}" text-anchor="middle">${esc(gbpK(r.profit))}</text>` : '').join('') : ''}
    ${rows.map((r, i) => i % every === 0 ? `<text class="tick" x="${Math.min(W - textW(label(r)) / 2, Math.max(textW(label(r)) / 2, xOf(i) + bw / 2))}" y="${H - 6}" text-anchor="middle">${esc(label(r))}</text>` : '').join('')}
  </svg>`;
  const svg = el.querySelector('svg'), tip = tipFor(el);
  onPoint(svg, (px) => {
    const i = Math.max(0, Math.min(rows.length - 1, Math.floor((px - 2) / step)));
    const r = rows[i];
    showTip(tip, el, xOf(i) + bw / 2, Y(Math.max(0, r.profit)), daily ? fmtDay(r.key) : fmtMonthLong(r.key), [['Profit', gbp(r.profit)], ['Bets', int(r.bets)]]);
  }, () => { tip.style.display = 'none'; });
}

function hbarChart(el, rows) {
  if (!rows.length) { el.innerHTML = `<div class="empty">No settled bets in this period.</div>`; return; }
  const W = el.clientWidth || 320, rh = 34, H = rows.length * rh;
  const lw = Math.max(...rows.map((r) => textW(r.type))) + 12;
  const vw = Math.max(...rows.map((r) => textW(gbp0(r.profit)))) + 10;
  const lo = Math.min(0, ...rows.map((r) => r.profit)), hi = Math.max(0, ...rows.map((r) => r.profit));
  const x0 = lw, x1 = Math.max(lw + 60, W - vw);
  const X = (v) => x0 + ((v - lo) / ((hi - lo) || 1)) * (x1 - x0);
  el.style.minHeight = H + 'px';
  el.innerHTML = `<svg width="${W}" height="${H}" role="img" aria-label="Bar chart of profit by bet type">
    ${rows.map((r, i) => {
      const y = i * rh;
      const a = X(Math.min(0, r.profit)), w = Math.max(1, Math.abs(X(r.profit) - X(0)));
      return `<text class="tick" x="0" y="${y + rh / 2 + 4}" style="fill:var(--fg)">${esc(r.type)}</text>
        <rect x="${a}" y="${y + rh / 2 - 9}" width="${w}" height="18" rx="4" style="fill:${r.profit < 0 ? BAD : ACCENT}"/>
        <text class="val" x="${X(Math.max(0, r.profit)) + 6}" y="${y + rh / 2 + 4}">${esc(gbp0(r.profit))}</text>`;
    }).join('')}
    <line class="axis" x1="${X(0)}" x2="${X(0)}" y1="0" y2="${H}"/>
  </svg>`;
  const svg = el.querySelector('svg'), tip = tipFor(el);
  onPoint(svg, (px, py) => {
    const i = Math.max(0, Math.min(rows.length - 1, Math.floor(py / rh)));
    const r = rows[i];
    showTip(tip, el, px, i * rh + 4, r.type, [['Profit', gbp(r.profit)], ['Expected', gbp(r.expected)], ['Bets', int(r.bets)]]);
  }, () => { tip.style.display = 'none'; });
}

/* ---------- setup ---------- */
function showSetup(canCancel) {
  $('#setup').hidden = false;
  $('#cancelSetup').hidden = !canCancel;
  $('#link').value = store.get(LINK_KEY) || '';
  $('#setupMsg').textContent = '';
  $('#setupMsg').className = 'small';
}
async function saveLink() {
  const link = $('#link').value.trim();
  const msg = $('#setupMsg');
  if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(link)) {
    msg.textContent = 'That doesn’t look like an Apps Script link. It should start with https://script.google.com/';
    msg.className = 'small err'; return;
  }
  if (!/[?&]key=/.test(link)) {
    msg.textContent = 'Add ?key= and your key (from the top of DashboardData.gs) to the end of the link.';
    msg.className = 'small err'; return;
  }
  const btn = $('#save'); btn.disabled = true; msg.className = 'small muted'; msg.textContent = 'Checking your sheet…';
  try {
    const raw = await fetchData(link);
    store.set(LINK_KEY, link);
    store.set(CACHE_KEY, JSON.stringify(raw));
    S.data = normalise(raw); S.error = '';
    $('#setup').hidden = true;
    render();
    toast('Connected · ' + int(S.data.bets.length) + ' bets');
  } catch (e) {
    msg.textContent = e.message; msg.className = 'small err';
  } finally { btn.disabled = false; }
}

/* ---------- misc ---------- */
let toastTimer;
function toast(text) {
  const t = $('#toast'); t.textContent = text; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

function init() {
  $$('.tabbar button').forEach((b) => b.addEventListener('click', () => {
    if (S.tab === b.dataset.tab) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    S.tab = b.dataset.tab; window.scrollTo(0, 0); render();
  }));
  $('#menu').addEventListener('click', openMenu);
  window.addEventListener('online', flushQueue);
  showQueueState();
  setupPullToRefresh();
  applyTheme(S.theme);
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => applyTheme(S.theme));
  $('#save').addEventListener('click', saveLink);
  $('#link').addEventListener('keydown', (e) => { if (e.key === 'Enter') saveLink(); });
  $('#cancelSetup').addEventListener('click', () => { $('#setup').hidden = true; });

  let rt;
  let lastW = window.innerWidth;
  window.addEventListener('resize', () => {
    if (window.innerWidth === lastW) return; lastW = window.innerWidth;
    clearTimeout(rt); rt = setTimeout(() => { if (S.data) drawCharts(); }, 150);
  });
  let lastLoad = Date.now();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - lastLoad > 60000) { lastLoad = Date.now(); load(false); }
  });

  const cached = store.get(CACHE_KEY);
  if (cached && store.get(LINK_KEY)) {
    try { S.data = normalise(JSON.parse(cached)); } catch (e) { S.data = null; }
  }
  render();
  load(false);

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

init();
