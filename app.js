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
  tab: 'overview',
  bookSort: prefs.bookSort || 'profit',
  bookAll: false,
  q: '',
  betStatus: 'all',
  betLimit: 40,
  loading: false,
  error: '',
  form: { type: '', book: '', match: '', backOdds: '', amount: '', layOdds: '', over: {} },
  commission: prefs.commission != null ? prefs.commission : 0,
  saving: false
};
const savePrefs = () => store.set(PREF_KEY, JSON.stringify({ period: S.period, bookSort: S.bookSort, commission: S.commission }));

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
    layReturn: toNum(b['Lay Return']),
    stake: toNum(b['Back Stake']),
    fb: toNum(b['Free Bet Amount']),
    liability: toNum(b['Lay Liability']),
    expected: toNum(b['Expected Profit']),
    profit: toNum(b['Actual Profit']),
    status: String(b['Status'] || '').trim().toLowerCase(),
    row: Number(b['Row']) || 0
  })).filter((b) => b.book && b.date);
  bets.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.time < b.time ? 1 : a.time > b.time ? -1 : a.row - b.row));
  const gubbed = (raw.gubbed || []).map((s) => String(s).trim()).filter(Boolean);
  return { bets, gubbed, updated: raw.updated || new Date().toISOString() };
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
  $('#refresh').classList.add('spin');
  try {
    const raw = await fetchData(link);
    S.data = normalise(raw);
    S.error = '';
    store.set(CACHE_KEY, JSON.stringify(raw));
    if (manual) toast('Up to date');
  } catch (e) {
    S.error = e.message || 'Could not load your sheet';
    if (manual || !S.data) toast(S.error.length > 50 ? 'Could not load your sheet' : S.error);
  } finally {
    S.loading = false;
    $('#refresh').classList.remove('spin');
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
  renderFilters();
  const up = new Date(S.data.updated);
  $('#updated').textContent = (S.error ? 'Offline · ' : '') + 'Updated ' + up.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  $$('.tabbar button').forEach((b) => { if (b.dataset.tab === S.tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  document.body.classList.toggle('on-add', S.tab === 'add');
  const view = $('#view');
  const form = $('#addForm');
  if (S.tab === 'add' && form && form.contains(document.activeElement)) return; // don't wipe the form while typing
  if (!VIEWS[S.tab]) S.tab = 'overview';
  view.innerHTML = VIEWS[S.tab]();
  bindView();
  drawCharts();
}

function renderFilters() {
  $('#periods').innerHTML = PERIODS.map(([k, label]) => `<button class="chip" data-period="${k}" aria-pressed="${k === S.period}">${label}</button>`).join('');
  const names = Array.from(new Set(S.data.bets.map((b) => b.book))).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  const sel = $('#book');
  sel.innerHTML = `<option value="">All bookmakers</option>` + names.map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
  sel.value = S.book;
}

const VIEWS = {
  overview() {
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
      <div class="grid2">
        <section class="card"><h2>${C.P.daily ? 'Profit by day' : 'Profit by month'}</h2><p class="sub">Settled bets</p><div class="chart" id="ch-bars"></div></section>
        <section class="card"><h2>Open bets</h2><p class="sub">Waiting to settle, any date</p>${openList()}</section>
      </div>
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

  bets() {
    const statusChip = (v, l) => `<button class="chip" data-status="${v}" aria-pressed="${S.betStatus === v}">${l}</button>`;
    return `<div class="stack"><section class="card">
      <h2>Bets</h2><p class="sub">${esc(C.P.phrase.charAt(0).toUpperCase() + C.P.phrase.slice(1))}, newest first</p>
      <div class="toolbar">
        <input type="search" class="search" id="q" placeholder="Search event, bookie or type" value="${esc(S.q)}" aria-label="Search bets">
        <div class="chips">${statusChip('all', 'All')}${statusChip('open', 'Open')}${statusChip('settled', 'Settled')}</div>
      </div>
      <div class="list" id="betList">${betList()}</div>
    </section></div>`;
  }
};

function openList() {
  if (!C.open.length) return `<div class="empty">No open bets right now.</div>`;
  return `<div class="list">${C.open.map((b) => `
    <div class="row tap" data-open="${b.row}"><div class="main"><div class="title">${esc(b.match || b.book)}</div><div class="meta">${esc(b.book)} · ${esc(b.type)} · ${fmtShort(b.date)}</div></div>
    <div class="right"><div class="amt">${gbp(b.liability)}</div><div class="meta">exp. <span class="${tone(b.expected)}">${gbp(b.expected)}</span></div></div></div>`).join('')}</div><p class="hint">Tap an open bet to settle it.</p>`;
}

function filteredBets() {
  const q = S.q.trim().toLowerCase();
  return C.inPeriod.filter((b) => (S.betStatus === 'all' || b.status === S.betStatus) && (!q || (b.match + ' ' + b.book + ' ' + b.type).toLowerCase().includes(q)));
}

function betList() {
  const rows = filteredBets();
  if (!rows.length) return `<div class="empty">No bets match.</div>`;
  const shown = rows.slice(0, S.betLimit);
  return shown.map((b) => {
    const stake = b.stake ? `Stake <b>${gbp(b.stake)}</b>` : b.fb ? `Free bet <b>${gbp(b.fb)}</b>` : '';
    const profit = b.status === 'open'
      ? `<span class="profit">Expected <b class="${tone(b.expected)}">${gbp(b.expected)}</b></span>`
      : `<span class="profit"><b class="${tone(b.profit)}">${b.profit == null ? '—' : signed(b.profit)}</b></span>`;
    return `<div class="bet${b.status === 'open' ? ' tap' : ''}"${b.status === 'open' ? ` data-open="${b.row}"` : ''}>
      <div class="line1"><span>${esc(b.book)} · ${esc(b.type)}${b.status === 'open' ? '<span class="tag open">Open</span>' : ''}</span><span>${fmtDay(b.date)}</span></div>
      <div class="event">${esc(b.match || '—')}</div>
      <div class="figs">${stake ? `<span>${stake}</span>` : ''}${b.liability != null ? `<span>Liability <b>${gbp(b.liability)}</b></span>` : ''}${profit}</div>
      ${b.status === 'open' ? '<div class="settle-hint">Tap to settle</div>' : ''}
    </div>`;
  }).join('') +
    (rows.length > S.betLimit ? `<button class="more" id="more">Show more</button>` : '') +
    `<div class="count">Showing ${int(shown.length)} of ${int(rows.length)} bets</div>`;
}

function bindView() {
  $$('[data-book]').forEach((el) => el.addEventListener('click', () => {
    S.book = el.dataset.book; S.tab = 'overview'; window.scrollTo(0, 0); render(); toast('Showing ' + S.book + ' only');
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
  if (S.tab === 'add') bindAdd();
}
function bindOpen(root) {
  $$('[data-open]', root).forEach((el) => el.addEventListener('click', () => {
    const b = S.data.bets.find((x) => String(x.row) === el.dataset.open && x.status === 'open');
    if (b) openSettle(b);
  }));
}
function bindMore() { const m = $('#more'); if (m) m.onclick = () => { S.betLimit += 40; refreshBetList(); }; }
function refreshBetList() { const el = $('#betList'); if (el) { el.innerHTML = betList(); bindMore(); bindOpen(el); } }

/* ---------- add a bet ---------- */
const SNR_TYPES = ['Free Bet']; // stake not returned
const DEFAULT_TYPES = ['Qualifying', 'Free Bet', 'Price Boost', 'Risk Free', 'Money Back', '2up', 'Arb'];

function typeChoices() {
  const count = new Map();
  S.data.bets.forEach((b) => count.set(b.type, (count.get(b.type) || 0) + 1));
  const used = Array.from(count.entries()).sort((a, b) => b[1] - a[1]).map((e) => e[0]).filter((t) => t !== 'Other');
  DEFAULT_TYPES.forEach((t) => { if (!used.includes(t)) used.push(t); });
  return used.slice(0, 10);
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
  return { snr, layStake: r2(layStake), layReturn: r2(backReturn), liability: r2(liability), expected: r2(Math.min(backWins, layWins)), backWins: r2(backWins), layWins: r2(layWins) };
}

VIEWS.add = function () {
  const f = S.form;
  if (!f.type) f.type = typeChoices()[0] || 'Qualifying';
  const snr = SNR_TYPES.includes(f.type);
  return `<div class="stack"><section class="card">
    <h2>Add a bet</h2><p class="sub">Goes straight into your sheet as an open bet</p>
    <form id="addForm" class="form" autocomplete="off" novalidate>
      <div class="fl">Bet type</div>
      <div class="chips wrap" id="typeChips">${typeChoices().map((t) => `<button type="button" class="chip" data-type="${esc(t)}" aria-pressed="${f.type === t}">${esc(t)}</button>`).join('')}</div>

      <label class="fl" for="f-book">Bookmaker</label>
      <input id="f-book" class="input" list="dl-books" value="${esc(f.book)}" placeholder="e.g. Betfred" autocapitalize="words" enterkeyhint="next">
      <div class="chips wrap">${recentBooks().map((b) => `<button type="button" class="chip sm" data-pickbook="${esc(b)}">${esc(b)}</button>`).join('')}</div>

      <label class="fl" for="f-match">Event</label>
      <input id="f-match" class="input" list="dl-matches" value="${esc(f.match)}" placeholder="e.g. Arsenal vs Chelsea" autocapitalize="words" enterkeyhint="next">

      <div class="grid3">
        <div><label class="fl" for="f-bo">Back odds</label><input id="f-bo" class="input" inputmode="decimal" value="${esc(f.backOdds)}" placeholder="2.50"></div>
        <div><label class="fl" for="f-amt" id="amtLabel">${snr ? 'Free bet £' : 'Stake £'}</label><input id="f-amt" class="input" inputmode="decimal" value="${esc(f.amount)}" placeholder="10"></div>
        <div><label class="fl" for="f-lo">Lay odds</label><input id="f-lo" class="input" inputmode="decimal" value="${esc(f.layOdds)}" placeholder="2.60"></div>
      </div>

      <div class="calc" id="calc"></div>

      <details class="adjust" id="adjust"${Object.keys(f.over).length ? ' open' : ''}>
        <summary>Adjust figures</summary>
        <p class="small muted">Leave blank to use the calculated figure. Fill in to use your own, such as for a risk-free or money-back offer.</p>
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

function currentFigures() {
  const f = S.form;
  const calc = calcBet(f.type, f.backOdds, f.amount, f.layOdds, S.commission);
  const pick = (k) => (f.over[k] !== undefined && String(f.over[k]).trim() !== '' ? pnum(f.over[k]) : calc ? calc[k] : null);
  return { calc, layReturn: pick('layReturn'), liability: pick('liability'), expected: pick('expected') };
}

function renderCalc() {
  const el = $('#calc'); if (!el) return;
  const fig = currentFigures(), c = fig.calc;
  if (!c) {
    el.innerHTML = `<div class="calc-empty">Enter back odds, ${SNR_TYPES.includes(S.form.type) ? 'free bet' : 'stake'} and lay odds to work out your lay.</div>`;
    return;
  }
  el.innerHTML = `
    <div class="calc-main"><span class="muted">Lay</span> <b>${gbp(c.layStake)}</b> <span class="muted">at</span> <b>${esc(String(pnum(S.form.layOdds)))}</b></div>
    <div class="calc-grid">
      <div><span class="muted">Liability</span><b>${gbp(fig.liability)}</b></div>
      <div><span class="muted">Expected</span><b class="${tone(fig.expected)}">${signed(fig.expected)}</b></div>
      <div><span class="muted">If back wins</span><b class="${tone(c.backWins)}">${signed(c.backWins)}</b></div>
      <div><span class="muted">If lay wins</span><b class="${tone(c.layWins)}">${signed(c.layWins)}</b></div>
    </div>`;
}

function bindAdd() {
  const f = S.form;
  const amtLabel = $('#amtLabel');
  $$('#typeChips [data-type]').forEach((b) => b.addEventListener('click', () => {
    f.type = b.dataset.type;
    $$('#typeChips [data-type]').forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
    if (amtLabel) amtLabel.textContent = SNR_TYPES.includes(f.type) ? 'Free bet £' : 'Stake £';
    renderCalc();
  }));
  $$('[data-pickbook]').forEach((b) => b.addEventListener('click', () => { f.book = b.dataset.pickbook; $('#f-book').value = f.book; $('#f-match').focus(); }));
  const bindField = (id, key) => { const el = $(id); if (el) el.addEventListener('input', () => { f[key] = el.value; renderCalc(); }); };
  bindField('#f-book', 'book'); bindField('#f-match', 'match'); bindField('#f-bo', 'backOdds'); bindField('#f-amt', 'amount'); bindField('#f-lo', 'layOdds');
  $$('[data-over]').forEach((el) => el.addEventListener('input', () => {
    if (el.value.trim() === '') delete f.over[el.dataset.over]; else f.over[el.dataset.over] = el.value;
    renderCalc();
  }));
  const comm = $('#f-comm');
  if (comm) comm.addEventListener('input', () => { const v = pnum(comm.value); S.commission = v == null ? 0 : v; savePrefs(); renderCalc(); });
  $('#addForm').addEventListener('submit', (e) => { e.preventDefault(); submitBet(); });
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
  const snr = SNR_TYPES.includes(f.type);
  const amt = pnum(f.amount);
  const bet = {
    bookmaker: f.book.trim(), match: f.match.trim(), type: f.type,
    backOdds: pnum(f.backOdds), stake: snr ? 0 : amt || 0, freeBet: snr ? amt || 0 : 0,
    layOdds: pnum(f.layOdds), layReturn: fig.layReturn, liability: fig.liability, expected: fig.expected
  };
  btn.disabled = true; btn.textContent = 'Adding…'; msg.textContent = 'Sending to your sheet…'; msg.className = 'small muted';
  try {
    await postSheet({ action: 'add', bet });
    S.form = { type: f.type, book: '', match: f.match, backOdds: '', amount: '', layOdds: '', over: {} };
    toast('Bet added');
    msg.textContent = 'Added to your sheet.'; msg.className = 'small pos';
    if (document.activeElement) document.activeElement.blur();
    await load(false);
  } catch (e) {
    err(e.message);
  } finally {
    const b = $('#addBtn'); if (b) { b.disabled = false; b.textContent = 'Add bet'; }
  }
}

async function postSheet(payload) {
  const link = store.get(LINK_KEY);
  if (!link) throw new Error('Connect your sheet first (gear icon).');
  let res;
  try {
    res = await fetch(link, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload), redirect: 'follow' });
  } catch (e) {
    throw new Error(navigator.onLine === false
      ? 'You are offline. Nothing was saved.'
      : 'Your sheet would not accept it. In Apps Script, check you did Deploy > Manage deployments > edit > Version: New version > Deploy. Nothing was saved.');
  }
  let j;
  try { j = await res.json(); } catch (e) { throw new Error('Your sheet did not accept it. Check you redeployed the script as a new version.'); }
  if (!j || !j.ok) throw new Error((j && j.error) || 'Your sheet said no');
  return j;
}

/* ---------- settle an open bet ---------- */
function openSettle(b) {
  const calc = calcBet(b.type, b.backOdds, SNR_TYPES.includes(b.type) ? b.fb : b.stake, b.layOdds, S.commission);
  // Prefer the figures already in the sheet for the outcomes.
  const snr = SNR_TYPES.includes(b.type);
  let backWins = null, layWins = null;
  if (b.backOdds && b.layOdds && b.liability != null) {
    const amt = snr ? b.fb : b.stake;
    const layStake = b.liability / (b.layOdds - 1);
    backWins = r2(n0(amt) * (b.backOdds - 1) - b.liability);
    layWins = r2(layStake * (1 - (S.commission || 0) / 100) - (snr ? 0 : n0(amt)));
  } else if (calc) { backWins = calc.backWins; layWins = calc.layWins; }
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
  sheet.onclick = (e) => { if (e.target === sheet) closeSettle(); };
  $('#st-save').onclick = async () => {
    const msg = $('#st-msg'), btn = $('#st-save');
    const v = pnum(input.value.replace('−', '-'));
    if (v == null) { msg.textContent = 'Enter the profit as a number.'; msg.className = 'small err'; return; }
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
      await postSheet({ action: 'settle', row: b.row, date: b.date, bookmaker: b.book, match: b.match, profit: v });
      closeSettle();
      toast('Settled ' + signed(v));
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
  $('#periods').addEventListener('click', (e) => {
    const b = e.target.closest('[data-period]'); if (!b) return;
    S.period = b.dataset.period; savePrefs(); render();
  });
  $('#book').addEventListener('change', (e) => { S.book = e.target.value; render(); });
  $$('.tabbar button').forEach((b) => b.addEventListener('click', () => {
    if (S.tab === b.dataset.tab) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    S.tab = b.dataset.tab; window.scrollTo(0, 0); render();
  }));
  $('#refresh').addEventListener('click', () => load(true));
  $('#settings').addEventListener('click', () => showSetup(true));
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
