'use strict';
// Data layer: loads every season of the league live from Sleeper's public API,
// caches finished seasons in the browser, and computes all stats.

const API = 'https://api.sleeper.app/v1';
const CACHE = 'tp2';
const FPOS = new Set(['QB', 'RB', 'WR', 'TE', 'K', 'DEF']);

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const num = (w, d) => r2((w || 0) + (d || 0) / 100);
const sum = (a) => a.reduce((x, y) => x + y, 0);
const range = (a, b) => (b < a ? [] : Array.from({ length: b - a + 1 }, (_, i) => a + i));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mean = (a) => (a.length ? sum(a) / a.length : 0);
const sd = (a) => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(sum(a.map((x) => (x - m) ** 2)) / (a.length - 1)); };

const LS = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); }
    catch { try { Object.keys(localStorage).filter((x) => x.startsWith('season:')).forEach((x) => localStorage.removeItem(x)); localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full: run uncached */ } }
  },
};

async function api(path) {
  for (let a = 1; ; a++) {
    try {
      const r = await fetch(API + path);
      if (r.ok) return await r.json();
      if (r.status === 404) return null;
      if (a >= 3) throw new Error(`Sleeper answered ${r.status} for ${path}`);
    } catch (e) { if (a >= 3) throw e; }
    await sleep(700 * a);
  }
}
async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } }));
  return out;
}

// ---------- players (names) ----------
async function loadPlayers() {
  const key = `players:${CACHE}`;
  const c = LS.get(key);
  if (c && Date.now() - c.t < 3 * 864e5) return c.d;
  try {
    const raw = (await api('/players/nfl')) || {};
    const d = {};
    for (const id in raw) {
      const p = raw[id]; if (!p) continue;
      const pos = p.position || (p.fantasy_positions || [])[0];
      if (!FPOS.has(pos)) continue;
      d[id] = [p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || id, pos, p.team || 'FA'];
    }
    LS.set(key, { t: Date.now(), d });
    return d;
  } catch { return c?.d || {}; }
}

// ---------- finding every season ----------
async function resolveLatest(startId, state) {
  let id = LS.get(`latest:${startId}`) || startId;
  let league = await api(`/league/${id}`);
  if (!league && id !== startId) league = await api(`/league/${startId}`);
  if (!league) throw new Error('The league ID in config.js was not found on Sleeper.');
  const target = Math.max(Number(state?.season) || 0, Number(state?.league_season) || 0);
  while (Number(league.season) < target) {
    const miss = LS.get(`nosucc:${league.league_id}`);
    if (miss && Date.now() - miss < 864e5) break;
    const users = (await api(`/league/${league.league_id}/users`)) || [];
    let next = null;
    for (const u of users) {
      const ls = (await api(`/user/${u.user_id}/leagues/nfl/${Number(league.season) + 1}`)) || [];
      next = ls.find((l) => l.previous_league_id === league.league_id);
      if (next) break;
    }
    if (!next) { LS.set(`nosucc:${league.league_id}`, Date.now()); break; }
    league = (await api(`/league/${next.league_id}`)) || next;
    LS.set(`latest:${startId}`, league.league_id);
  }
  return league;
}
async function walkBack(latest) {
  const chain = [latest]; const seen = new Set([latest.league_id]);
  let prev = latest.previous_league_id;
  while (prev && prev !== '0' && !seen.has(prev) && chain.length < 30) {
    seen.add(prev);
    let l = LS.get(`league:${prev}`);
    if (!l) { l = await api(`/league/${prev}`); if (l?.status === 'complete') LS.set(`league:${prev}`, l); }
    if (!l) break;
    chain.push(l); prev = l.previous_league_id;
  }
  return chain.reverse();
}

// ---------- one season ----------
async function loadSeason(league, state) {
  const key = `season:${CACHE}:${league.league_id}`;
  if (league.status === 'complete') { const c = LS.get(key); if (c) return c; }
  const id = league.league_id;
  const same = String(state?.season) === String(league.season);
  let lastWeek = 0;
  if (league.status === 'complete' || (same && state?.season_type === 'post')) lastWeek = 18;
  else if (same && state?.season_type !== 'pre' && !['pre_draft', 'drafting'].includes(league.status)) lastWeek = Math.min(18, Math.max(1, state.week || 1));
  const [users, rosters, wb, lb, drafts] = await Promise.all([
    api(`/league/${id}/users`), api(`/league/${id}/rosters`), api(`/league/${id}/winners_bracket`), api(`/league/${id}/losers_bracket`), api(`/league/${id}/drafts`),
  ]);
  const weekNums = range(1, lastWeek);
  const mRaw = await pool(weekNums, 6, (w) => api(`/league/${id}/matchups/${w}`));
  const tRaw = await pool(range(1, Math.max(1, lastWeek)), 6, (w) => api(`/league/${id}/transactions/${w}`));
  const dr = [];
  for (const d of drafts || []) {
    if (d.status !== 'complete') continue;
    const picks = (await api(`/draft/${d.draft_id}/picks`)) || [];
    dr.push({ id: d.draft_id, type: d.type, slots: d.slot_to_roster_id || {}, picks: picks.map((p) => ({ r: p.round, n: p.pick_no, ds: p.draft_slot, rid: p.roster_id, pid: p.player_id, nm: [p.metadata?.first_name, p.metadata?.last_name].filter(Boolean).join(' '), pos: p.metadata?.position || '', tm: p.metadata?.team || '' })) });
  }
  const st = league.settings || {};
  const lastScored = league.status === 'complete' ? 18 : Number.isInteger(st.last_scored_leg) ? Math.min(st.last_scored_leg, lastWeek) : Math.max(0, lastWeek - 1);
  const s = processSeason(league, users, rosters, mRaw, tRaw, wb, lb, dr, lastScored);
  if (league.status === 'complete') LS.set(key, s);
  return s;
}

function processSeason(league, users, rosters, mRaw, tRaw, wb, lb, drafts, lastScored) {
  const um = new Map((users || []).map((u) => [u.user_id, u]));
  const teams = {}; const rs = {};
  for (const r of rosters || []) {
    const u = um.get(r.owner_id);
    teams[r.roster_id] = { rid: r.roster_id, uid: r.owner_id || `open-${league.season}-${r.roster_id}`, team: (u?.metadata?.team_name || u?.display_name || `Team ${r.roster_id}`).trim(), owner: u?.display_name || 'Open team', avatar: u?.avatar || null };
    const x = r.settings || {};
    rs[r.roster_id] = { used: x.waiver_budget_used || 0, ppts: num(x.ppts, x.ppts_decimal), fpts: num(x.fpts, x.fpts_decimal) };
  }
  const weeks = [];
  mRaw.forEach((ents, i) => {
    if (!Array.isArray(ents) || !ents.length) return;
    const e = ents.map((x) => {
      const pp = {};
      for (const id of x.players || []) pp[id] = r2(x.players_points?.[id] ?? 0);
      const stIds = [];
      (x.starters || []).forEach((id, k) => { if (id && id !== '0') { stIds.push(id); pp[id] = r2(x.starters_points?.[k] ?? pp[id] ?? 0); } });
      return { rid: x.roster_id, mid: x.matchup_id, pts: r2(x.custom_points ?? x.points ?? 0), st: stIds, pp };
    });
    if (e.some((x) => x.pts > 0)) weeks.push({ w: i + 1, e });
  });
  const seen = new Set();
  const tx = tRaw.flat().filter((t) => t && t.status === 'complete' && !seen.has(t.transaction_id) && seen.add(t.transaction_id)).map((t) => ({
    id: t.transaction_id, type: t.type, wk: t.leg, at: t.status_updated || t.created, rids: t.roster_ids || [], adds: t.adds || {}, drops: t.drops || {},
    picks: (t.draft_picks || []).map((p) => ({ s: p.season, r: p.round, o: p.roster_id, f: p.previous_owner_id, to: p.owner_id })),
    faab: (t.waiver_budget || []).map((b) => ({ f: b.sender, to: b.receiver, a: b.amount })), bid: t.settings?.waiver_bid ?? null,
  })).sort((a, b) => b.at - a.at);
  const br = (b) => (Array.isArray(b) ? b.map((m) => ({ r: m.r, m: m.m, t1: typeof m.t1 === 'number' ? m.t1 : null, t2: typeof m.t2 === 'number' ? m.t2 : null, w: m.w ?? null, l: m.l ?? null, p: m.p ?? null })) : []);
  const st = league.settings || {}; const sc = league.scoring_settings || {};
  return {
    id: league.league_id, season: Number(league.season), status: league.status, name: league.name,
    ps: st.playoff_week_start || 15, pt: st.playoff_teams || 6, prt: st.playoff_round_type || 0, lastScored,
    budget: st.waiver_type === 2 ? st.waiver_budget || 0 : null, deadline: st.trade_deadline ?? null,
    rec: sc.rec ?? 0, positions: league.roster_positions || [], taxi: st.taxi_slots || 0, ir: st.reserve_slots || 0,
    teams, rs, weeks, wb: br(wb), lb: br(lb), tx, drafts,
  };
}

// ---------- derived stats ----------
function roundWeeks(s, r, maxR) {
  if (s.prt === 2) return [s.ps + 2 * (r - 1), s.ps + 2 * (r - 1) + 1];
  if (s.prt === 1 && r === maxR) return [s.ps + r - 1, s.ps + r];
  return [s.ps + r - 1];
}
function derive(s) {
  s.isFinal = (w) => s.status === 'complete' || w <= s.lastScored;
  s.wm = new Map(s.weeks.map((w) => [w.w, w]));
  s.entry = (rid, w) => s.wm.get(w)?.e.find((x) => x.rid === rid);
  s.uid = (rid) => s.teams[rid]?.uid;
  const mk = (week, kind, ra, pa, rb, pb, extra = {}) => ({ season: s.season, week, kind, a: { rid: ra, uid: s.uid(ra), pts: r2(pa) }, b: { rid: rb, uid: s.uid(rb), pts: r2(pb) }, margin: r2(Math.abs(pa - pb)), win: pa > pb ? 'a' : pb > pa ? 'b' : null, ...extra });
  s.games = [];
  for (const wk of s.weeks) {
    if (!s.isFinal(wk.w) || wk.w >= s.ps) continue;
    const by = {};
    for (const x of wk.e) if (x.mid != null) (by[x.mid] ||= []).push(x);
    for (const p of Object.values(by)) if (p.length === 2) s.games.push(mk(wk.w, 'reg', p[0].rid, p[0].pts, p[1].rid, p[1].pts));
  }
  for (const [bracket, side] of [[s.wb, 'win'], [s.lb, 'cons']]) {
    const maxR = Math.max(0, ...bracket.map((m) => m.r));
    for (const m of bracket) {
      if (!m.t1 || !m.t2) continue;
      const ws = roundWeeks(s, m.r, maxR);
      if (!ws.every((w) => s.isFinal(w) && s.wm.has(w))) continue;
      const pa = sum(ws.map((w) => s.entry(m.t1, w)?.pts || 0)); const pb = sum(ws.map((w) => s.entry(m.t2, w)?.pts || 0));
      const kind = side === 'cons' ? 'cons' : m.p == null || m.p === 1 ? 'title' : 'place';
      const g = mk(ws[ws.length - 1], kind, m.t1, pa, m.t2, pb, { round: m.r, p: m.p, final: m.p === 1 });
      if (m.w) g.win = m.w === m.t1 ? 'a' : 'b';
      s.games.push(g);
    }
  }
  // standings
  const rows = {};
  for (const rid in s.teams) rows[rid] = { rid: Number(rid), uid: s.teams[rid].uid, w: 0, l: 0, t: 0, pf: 0, pa: 0, apw: 0, apl: 0, apt: 0, mw: 0, ml: 0, scores: [], res: [] };
  const regWeeks = s.weeks.filter((w) => s.isFinal(w.w) && w.w < s.ps);
  for (const wk of regWeeks) {
    const sc = wk.e.filter((x) => rows[x.rid]).map((x) => [x.rid, x.pts]);
    const sorted = sc.map((x) => x[1]).sort((a, b) => a - b);
    const med = sorted.length ? (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.ceil((sorted.length - 1) / 2)]) / 2 : 0;
    for (const [rid, p] of sc) {
      const R = rows[rid]; R.scores.push(p);
      for (const [r2id, p2] of sc) { if (r2id === rid) continue; if (p > p2) R.apw++; else if (p < p2) R.apl++; else R.apt++; }
      if (p > med) R.mw++; else R.ml++;
    }
  }
  for (const g of s.games.filter((x) => x.kind === 'reg').sort((a, b) => a.week - b.week)) {
    for (const [me, op, k] of [[g.a, g.b, 'a'], [g.b, g.a, 'b']]) {
      const R = rows[me.rid]; if (!R) continue;
      R.pf += me.pts; R.pa += op.pts;
      if (!g.win) { R.t++; R.res.push('T'); } else if (g.win === k) { R.w++; R.res.push('W'); } else { R.l++; R.res.push('L'); }
    }
  }
  const list = Object.values(rows).map((R) => {
    const gp = R.w + R.l + R.t; const ap = R.apw + R.apl + R.apt;
    const apPct = ap ? (R.apw + R.apt / 2) / ap : 0;
    const last = R.res[R.res.length - 1]; let n = 0;
    for (let i = R.res.length - 1; i >= 0 && R.res[i] === last; i--) n++;
    const rsx = s.rs[R.rid] || {};
    return { ...R, pf: r2(R.pf), pa: r2(R.pa), gp, pct: gp ? (R.w + R.t / 2) / gp : 0, apPct, xw: r2(apPct * gp), luck: r2(R.w + R.t / 2 - apPct * gp), streak: last ? `${last}${n}` : '', max: rsx.ppts || null, eff: rsx.ppts ? r2((R.pf / rsx.ppts) * 100) : null, faab: s.budget != null ? s.budget - (rsx.used || 0) : null };
  });
  list.sort((a, b) => b.pct - a.pct || b.pf - a.pf);
  list.forEach((x, i) => (x.rank = i + 1));
  s.standings = list;
  // final places
  s.place = {};
  const done = new Set(); let p = 1;
  if (s.status === 'complete') {
    for (const tag of [1, 3, 5, 7]) {
      const m = s.wb.find((x) => x.p === tag && x.w);
      if (m && !done.has(m.w)) { s.place[m.w] = tag; s.place[m.l] = tag + 1; done.add(m.w); done.add(m.l); }
    }
    const fin = s.wb.find((x) => x.p === 1 && x.w);
    s.champ = fin ? fin.w : null; s.runner = fin ? fin.l : null;
    p = done.size + 1;
  }
  for (const x of list) if (!done.has(x.rid)) s.place[x.rid] = p++;
  // grades
  const n = list.length || 1;
  const byPf = [...list].sort((a, b) => b.pf - a.pf).map((x) => x.rid);
  s.grade = {};
  for (const x of list) {
    const pfS = n > 1 ? 1 - byPf.indexOf(x.rid) / (n - 1) : 1;
    const plS = n > 1 ? 1 - (s.place[x.rid] - 1) / (n - 1) : 1;
    s.grade[x.rid] = letter(0.45 * pfS + 0.3 * x.pct + 0.25 * plS);
  }
  return s;
}
function letter(v) {
  const t = [[0.9, 'A+'], [0.8, 'A'], [0.72, 'A-'], [0.65, 'B+'], [0.58, 'B'], [0.5, 'B-'], [0.43, 'C+'], [0.36, 'C'], [0.3, 'C-'], [0.2, 'D']];
  for (const [c, g] of t) if (v >= c) return g;
  return 'F';
}

// power score: all-play 40%, record 30%, last 3 weeks 30%
function powerAsOf(s, through) {
  const reg = s.weeks.filter((w) => s.isFinal(w.w) && w.w < s.ps && w.w <= through);
  if (!reg.length) return [];
  const st = {};
  for (const rid in s.teams) st[rid] = { apw: 0, apg: 0, scores: [] };
  for (const wk of reg) for (const x of wk.e) { if (!st[x.rid]) continue; st[x.rid].scores.push(x.pts); for (const y of wk.e) if (y.rid !== x.rid) { st[x.rid].apg++; st[x.rid].apw += x.pts > y.pts ? 1 : x.pts === y.pts ? 0.5 : 0; } }
  const wl = {};
  for (const g of s.games) if (g.kind === 'reg' && g.week <= through) for (const [me, k] of [[g.a, 'a'], [g.b, 'b']]) { wl[me.rid] ||= { w: 0, g: 0 }; wl[me.rid].g++; wl[me.rid].w += !g.win ? 0.5 : g.win === k ? 1 : 0; }
  const recent = Object.fromEntries(Object.keys(st).map((rid) => [rid, mean(st[rid].scores.slice(-3))]));
  const lo = Math.min(...Object.values(recent)); const hi = Math.max(...Object.values(recent));
  const rows = Object.keys(st).map((rid) => {
    const x = st[rid]; const w = wl[rid] || { w: 0, g: 0 };
    const form = hi > lo ? (recent[rid] - lo) / (hi - lo) : 0.5;
    return { rid: Number(rid), score: Math.round((40 * (x.apg ? x.apw / x.apg : 0) + 30 * (w.g ? w.w / w.g : 0) + 30 * form) * 10) / 10, recent: r2(recent[rid]) };
  }).sort((a, b) => b.score - a.score);
  rows.forEach((r, i) => (r.rank = i + 1));
  return rows;
}

// ---------- league-wide model ----------
function buildModel(seasons, players) {
  seasons.forEach(derive);
  const latest = seasons[seasons.length - 1];
  const M = { seasons, latest, players, managers: {}, games: [], current: new Set(Object.values(latest.teams).map((t) => t.uid)) };
  for (const s of seasons) for (const d of s.drafts) for (const p of d.picks) if (p.pid && !players[p.pid] && p.nm) players[p.pid] = [p.nm, p.pos, p.tm || ''];
  M.games = seasons.flatMap((s) => s.games);
  const founders = seasons[0] ? new Set(Object.values(seasons[0].teams).map((t) => t.uid)) : new Set();
  for (const s of seasons) {
    for (const t of Object.values(s.teams)) {
      const m = (M.managers[t.uid] ||= { uid: t.uid, name: t.owner, avatar: t.avatar, names: [], seasons: [], titles: [], runnerUps: [], apps: 0, founder: founders.has(t.uid) });
      m.name = t.owner; if (t.avatar) m.avatar = t.avatar;
      const row = s.standings.find((x) => x.rid === t.rid);
      m.names.push({ season: s.season, team: t.team });
      m.seasons.push({ season: s.season, rid: t.rid, team: t.team, row, place: s.place[t.rid], grade: s.grade[t.rid], complete: s.status === 'complete' });
      if (s.champ === t.rid) m.titles.push(s.season);
      if (s.runner === t.rid) m.runnerUps.push(s.season);
      if (s.games.some((g) => g.kind === 'title' && (g.a.rid === t.rid || g.b.rid === t.rid))) m.apps++;
    }
  }
  for (const m of Object.values(M.managers)) {
    const gs = M.games.filter((g) => g.a.uid === m.uid || g.b.uid === m.uid);
    const tally = (kind) => { const o = { w: 0, l: 0, t: 0, pf: 0, pa: 0 }; for (const g of gs.filter((x) => kind(x.kind))) { const k = g.a.uid === m.uid ? 'a' : 'b'; const me = g[k], op = g[k === 'a' ? 'b' : 'a']; o.pf += me.pts; o.pa += op.pts; if (!g.win) o.t++; else if (g.win === k) o.w++; else o.l++; } o.pf = r2(o.pf); o.pa = r2(o.pa); o.gp = o.w + o.l + o.t; o.pct = o.gp ? (o.w + o.t / 2) / o.gp : 0; return o; };
    m.reg = tally((k) => k === 'reg'); m.post = tally((k) => k === 'title');
    const fin = m.seasons.filter((x) => x.complete).map((x) => x.place);
    m.best = fin.length ? Math.min(...fin) : null;
  }
  return M;
}

// head to head between two managers
function h2h(M, u1, u2, kinds = ['reg', 'title', 'place', 'cons']) {
  const gs = M.games.filter((g) => kinds.includes(g.kind) && ((g.a.uid === u1 && g.b.uid === u2) || (g.a.uid === u2 && g.b.uid === u1)));
  const o = { w: 0, l: 0, t: 0, pf: 0, pa: 0, games: gs.sort((a, b) => b.season - a.season || b.week - a.week) };
  for (const g of gs) { const k = g.a.uid === u1 ? 'a' : 'b'; o.pf += g[k].pts; o.pa += g[k === 'a' ? 'b' : 'a'].pts; if (!g.win) o.t++; else if (g.win === k) o.w++; else o.l++; }
  o.pf = r2(o.pf); o.pa = r2(o.pa);
  return o;
}

// ---------- draft pick values ----------
// A traded pick is worth the player it became once the draft happens. Until then it carries
// a preset value by round: this league's own average rookie-season output for that round
// (once there are enough past picks), otherwise the defaults in config.js.
function resolvePick(M, pk) {
  const ss = M.seasons.find((x) => x.season === Number(pk.s));
  if (!ss) return null;
  for (const d of ss.drafts) {
    const hit = d.picks.find((x) => x.r === pk.r && Number(d.slots[x.ds] ?? d.slots[String(x.ds)]) === Number(pk.o));
    if (hit && hit.pid) return { ss, pid: hit.pid };
  }
  return null;
}
function seasonPoints(ss, pid, fromWeek = 0) {
  let t = 0;
  for (const wk of ss.weeks) { if (!ss.isFinal(wk.w) || wk.w <= fromWeek) continue; for (const e of wk.e) if (e.pp[pid] != null) t += e.pp[pid]; }
  return t;
}
function pickEstimate(M, round) {
  M._est ||= {};
  if (M._est[round] != null) return M._est[round];
  const vals = [];
  for (const ss of M.seasons.slice(1)) { // skip the startup draft, which was veterans
    if (ss.status !== 'complete') continue;
    for (const d of ss.drafts) for (const p of d.picks) if (p.r === round && p.pid) vals.push(seasonPoints(ss, p.pid));
  }
  const defs = (window.LEAGUE_CONFIG && window.LEAGUE_CONFIG.pickValues) || { 1: 90, 2: 40, 3: 15, 4: 5 };
  const keys = Object.keys(defs).map(Number).sort((a, b) => a - b);
  const fallback = defs[round] ?? defs[keys[keys.length - 1]] ?? 0;
  const est = vals.length >= 6 ? r2(mean(vals)) : fallback;
  M._est[round] = { v: est, source: vals.length >= 6 ? 'league' : 'default' };
  return M._est[round];
}

// trade value: "while rostered" = points the players scored in the new team's starting lineup afterward (any season);
// "season total" = everything they scored the rest of that season, on any team.
function tradeValues(M, s, t) {
  const after = (season, w) => season > s.season || (season === s.season && w > t.wk);
  const wrFor = (uid, pid) => {
    let wr = 0;
    for (const ss of M.seasons) {
      if (ss.season < s.season) continue;
      const myRid = Object.values(ss.teams).find((x) => x.uid === uid)?.rid;
      for (const wk of ss.weeks) {
        if (!ss.isFinal(wk.w) || !after(ss.season, wk.w)) continue;
        const e = wk.e.find((x) => x.rid === myRid);
        if (e && e.st.includes(pid)) wr += e.pp[pid] || 0;
      }
    }
    return r2(wr);
  };
  const sides = t.rids.map((rid) => {
    const uid = s.uid(rid);
    const items = Object.entries(t.adds).filter(([, to]) => to === rid).map(([pid]) => ({ pid, wr: wrFor(uid, pid), st: r2(seasonPoints(s, pid, t.wk)) }));
    const picks = t.picks.filter((p) => p.to === rid).map((p) => {
      const res = resolvePick(M, p);
      if (res) return { ...p, pid: res.pid, wr: wrFor(uid, res.pid), st: r2(seasonPoints(res.ss, res.pid, res.ss.season === s.season ? t.wk : 0)), pending: false };
      const e = pickEstimate(M, p.r);
      return { ...p, wr: e.v, st: e.v, pending: true, source: e.source };
    });
    const tot = (k) => r2(sum(items.map((i) => i[k])) + sum(picks.map((i) => i[k])));
    return { rid, uid, items, picks, faab: sum(t.faab.filter((b) => b.to === rid).map((b) => b.a)), wr: tot('wr'), st: tot('st') };
  });
  for (const sd of sides) {
    const others = sides.filter((x) => x !== sd);
    const gave = (k) => sum(others.map((o) => sum(o.items.filter((i) => t.drops[i.pid] === sd.rid).map((i) => i[k])) + sum(o.picks.filter((p) => p.f === sd.rid).map((p) => p[k]))));
    sd.netWr = r2(sd.wr - gave('wr')); sd.netSt = r2(sd.st - gave('st'));
    sd.hasEst = sd.picks.some((p) => p.pending) || others.some((o) => o.picks.some((p) => p.pending && p.f === sd.rid));
  }
  return sides;
}

async function loadEverything(leagueId, onStatus = () => {}) {
  onStatus('Connecting to Sleeper');
  const state = await api('/state/nfl');
  const playersP = loadPlayers();
  const latest = await resolveLatest(leagueId, state);
  onStatus('Finding past seasons');
  const chain = await walkBack(latest);
  onStatus(`Loading ${chain.length} season${chain.length > 1 ? 's' : ''}`);
  const seasons = await pool(chain, 2, (l) => loadSeason(l, state));
  onStatus('Loading player names');
  const players = await playersP;
  return buildModel(seasons.sort((a, b) => a.season - b.season), players);
}
