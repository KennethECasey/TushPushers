'use strict';
// Views. Every page is drawn from the model built in data.js.

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const f2 = (n) => (Number(n) || 0).toFixed(2);
const f1 = (n) => (Number(n) || 0).toFixed(1);
const rec = (o) => `${o.w}-${o.l}${o.t ? `-${o.t}` : ''}`;
const pctS = (p) => (p * 100).toFixed(1) + '%';
let M;

const mgr = (uid) => M.managers[uid] || { name: 'Unknown', uid };
const mlink = (uid) => `<a class="mgr" href="#managers/${encodeURIComponent(uid)}">${esc(mgr(uid).name)}</a>`;
const tname = (s, rid) => esc(s.teams[rid]?.team || `Team ${rid}`);
const tcell = (s, rid) => `${tname(s, rid)}<small>${mlink(s.teams[rid]?.uid)}</small>`;
function pl(id, withMeta = true) {
  const p = M.players[id];
  if (!p) return esc(id);
  const meta = [p[1], p[2]].filter(Boolean).join(', ');
  return `${esc(p[0])}${withMeta && meta ? ` <span class="pos">${esc(meta)}</span>` : ''}`;
}
const plain = (id) => M.players[id]?.[0] || id;
const seasonOf = (y) => M.seasons.find((s) => s.season === Number(y));
const cur = () => M.latest;
const lastDone = () => [...M.seasons].reverse().find((s) => s.status === 'complete');
const avatar = (a) => (a ? `<img class="av" src="https://sleepercdn.com/avatars/thumbs/${esc(a)}" alt="" loading="lazy">` : '<span class="av av-blank"></span>');
const empty = (msg) => `<p class="empty">${msg}</p>`;
const seg = (name, opts, val) => `<div class="seg" role="group" aria-label="${esc(name)}">${opts.map(([v, l]) => `<button type="button" data-v="${esc(v)}" aria-pressed="${String(v) === String(val)}">${esc(l)}</button>`).join('')}</div>`;
const RING = (label) => `<span class="ring" title="${esc(label)}"><svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="22" r="13" fill="none" stroke="currentColor" stroke-width="5"/><path d="M12 9l4-6h8l4 6-8 5z" fill="currentColor"/></svg><span>’${esc(String(label).slice(-2))}</span></span>`;
const BALL = `<svg class="ball" viewBox="0 0 34 20" aria-hidden="true"><ellipse cx="17" cy="10" rx="16" ry="9" fill="#7A3E22" stroke="#4A230F" stroke-width="1.2"/><path d="M11 10h12M13 7.5v5M15.7 7.5v5M18.3 7.5v5M21 7.5v5" stroke="#F1F3EC" stroke-width="1.2" stroke-linecap="round"/></svg>`;

// ---------- recap (template-written) ----------
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function recap(s, wk) {
  const rand = rng(s.season * 100 + wk.w); const pick = (a) => a[Math.floor(rand() * a.length)];
  const T = (rid) => s.teams[rid]?.team || `Team ${rid}`;
  const by = {}; for (const x of wk.e) if (x.mid != null) (by[x.mid] ||= []).push(x);
  const games = Object.entries(by).filter(([, p]) => p.length === 2).map(([mid, p]) => { const [w, l] = [...p].sort((a, b) => b.pts - a.pts); return { mid, w, l, m: w.pts - l.pts, tie: w.pts === l.pts }; });
  if (!games.length) return null;
  const top = [...wk.e].sort((a, b) => b.pts - a.pts)[0]; const low = [...wk.e].sort((a, b) => a.pts - b.pts)[0];
  const topLost = games.some((g) => !g.tie && g.l.rid === top.rid);
  const headline = topLost ? `${T(top.rid)} scored ${f2(top.pts)}, the most in the league, and still lost.` : pick([`${T(top.rid)} led the league with ${f2(top.pts)}.`, `${T(top.rid)} put up ${f2(top.pts)}, the best score of the week.`, `Nobody touched ${T(top.rid)} this week: ${f2(top.pts)} points.`]);
  const lines = {};
  for (const g of games) {
    const W = T(g.w.rid), L = T(g.l.rid), a = f2(g.w.pts), b = f2(g.l.pts);
    if (g.tie) { lines[g.mid] = `${W} and ${L} tied at ${a}.`; continue; }
    const best = [...g.w.st].sort((x, y) => (g.w.pp[y] || 0) - (g.w.pp[x] || 0))[0];
    const star = best ? ` ${plain(best)} led the way with ${f2(g.w.pp[best])}.` : '';
    const base = g.m < 3 ? pick([`${W} survived ${L}, ${a} to ${b}.`, `${W} edged ${L} by ${f2(g.m)}.`]) : g.m < 15 ? pick([`${W} beat ${L}, ${a} to ${b}.`, `${W} held off ${L}, ${a} to ${b}.`]) : g.m < 40 ? pick([`${W} handled ${L}, ${a} to ${b}.`, `${W} beat ${L} by ${f2(g.m)}.`]) : pick([`${W} ran ${L} off the field, ${a} to ${b}.`, `${W} beat ${L} by ${f2(g.m)}. It was over early.`]);
    lines[g.mid] = base + star;
  }
  const awards = [['Top score', `${T(top.rid)}, ${f2(top.pts)}`], ['Low score', `${T(low.rid)}, ${f2(low.pts)}`]];
  const d = games.filter((g) => !g.tie);
  if (d.length > 1) {
    const c = [...d].sort((a, b) => a.m - b.m)[0], bl = [...d].sort((a, b) => b.m - a.m)[0];
    const tb = [...d].sort((a, b) => b.l.pts - a.l.pts)[0], so = [...d].sort((a, b) => a.w.pts - b.w.pts)[0];
    awards.push(['Closest game', `${T(c.w.rid)} over ${T(c.l.rid)} by ${f2(c.m)}`], ['Biggest blowout', `${T(bl.w.rid)} over ${T(bl.l.rid)} by ${f2(bl.m)}`], ['Tough beat', `${T(tb.l.rid)} scored ${f2(tb.l.pts)} and lost`], ['Stole one', `${T(so.w.rid)} won with ${f2(so.w.pts)}`]);
  }
  const mvp = wk.e.flatMap((x) => x.st.map((id) => ({ id, p: x.pp[id] || 0, rid: x.rid }))).sort((a, b) => b.p - a.p)[0];
  if (mvp) awards.push(['Player of the week', `${plain(mvp.id)} (${T(mvp.rid)}), ${f2(mvp.p)}`]);
  const bench = wk.e.flatMap((x) => Object.entries(x.pp).filter(([id]) => !x.st.includes(id)).map(([id, p]) => ({ id, p, rid: x.rid }))).sort((a, b) => b.p - a.p)[0];
  if (bench && bench.p > 0) { const lost = d.find((g) => g.l.rid === bench.rid); awards.push(['Left on the bench', `${plain(bench.id)} scored ${f2(bench.p)} for ${T(bench.rid)}${lost && bench.p > lost.m ? ', more than their losing margin' : ''}`]); }
  return { headline, lines, awards };
}

// ---------- shared blocks ----------
function scoreboard(s, wk) {
  const r = s.isFinal(wk.w) ? recap(s, wk) : null;
  const by = {}; for (const x of wk.e) if (x.mid != null) (by[x.mid] ||= []).push(x);
  const games = Object.entries(by).map(([mid, p]) => {
    const sides = [...p].sort((a, b) => b.pts - a.pts);
    const decided = s.isFinal(wk.w) && sides.length === 2 && sides[0].pts !== sides[1].pts;
    return `<li class="game">${sides.map((x, k) => `<div class="side ${decided ? (k ? 'loss' : 'win') : ''}"><span class="nm">${tname(s, x.rid)}<span class="ow">${esc(mgr(s.uid(x.rid)).name)}</span></span><span class="sc">${f2(x.pts)}</span></div>`).join('')}${r?.lines[mid] ? `<p>${esc(r.lines[mid])}</p>` : ''}</li>`;
  }).join('');
  return { html: `<ol class="board">${games}</ol>`, recap: r };
}
const awardsHtml = (r) => (r ? `<dl class="awards">${r.awards.map(([t, x]) => `<div><dt>${esc(t)}</dt><dd>${esc(x)}</dd></div>`).join('')}</dl>` : '');
function table(head, rows, opts = {}) {
  return `<div class="scroll"><table class="${opts.cls || ''}" style="min-width:${opts.min || 560}px"><thead><tr>${head.map((h) => `<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}
function topList(title, items, note = '') {
  return `<section class="toplist"><h3>${esc(title)}</h3>${items.length ? `<ol>${items.map((i) => `<li><span class="v">${i.v}</span><span class="d">${i.d}</span></li>`).join('')}</ol>` : '<p class="note">Not enough games yet.</p>'}${note ? `<p class="note">${note}</p>` : ''}</section>`;
}
const gameLine = (g) => { const s = seasonOf(g.season); const [w, l] = g.win === 'b' ? [g.b, g.a] : [g.a, g.b]; return `${tname(s, w.rid)} ${f2(w.pts)}, ${tname(s, l.rid)} ${f2(l.pts)}`; };
const gameWhen = (g) => `${g.season} week ${g.week}${g.kind === 'title' ? (g.final ? ', title game' : ', playoffs') : g.kind === 'reg' ? '' : ', consolation'}`;

// ---------- HOME ----------
function viewHome() {
  const s = cur(); const done = lastDone();
  let out = '';
  if (done && done.champ) {
    const t = done.teams[done.champ]; const m = mgr(t.uid);
    const row = done.standings.find((x) => x.rid === done.champ);
    out += `<section class="spotlight"><p class="kicker">Defending champion, ${done.season}</p><h1 class="champ">${esc(t.team)}</h1><p class="champ-sub">${avatar(m.avatar)} ${mlink(t.uid)}. ${row ? `${rec(row)} in the regular season, ${f2(row.pf)} points.` : ''} ${m.titles.length > 1 ? `Title number ${m.titles.length}.` : ''}</p></section>`;
  } else {
    out += `<section class="spotlight"><p class="kicker">${s.season} season</p><h1 class="champ">The first title is still up for grabs.</h1></section>`;
  }
  const wks = s.weeks;
  if (wks.length) {
    const wk = [...wks].reverse().find((w) => s.isFinal(w.w)) || wks[wks.length - 1];
    const live = wks[wks.length - 1];
    const show = live.w > wk.w ? live : wk;
    const sb = scoreboard(s, show);
    const fr = s.isFinal(show.w) ? sb.recap : recap(s, wk);
    out += `<h2>Week ${show.w}${s.isFinal(show.w) ? '' : ', live'}</h2><p class="status">${s.isFinal(show.w) ? 'Final.' : 'In progress. Scores update every time the page loads.'}</p>${sb.html}`;
    if (fr) out += `<h2>Week ${s.isFinal(show.w) ? show.w : wk.w} game balls</h2><p class="headline">${esc(fr.headline)}</p>${awardsHtml(fr)}`;
  }
  // league pulse
  const reg = s.games.filter((g) => g.kind === 'reg');
  if (reg.length) {
    const all = reg.flatMap((g) => [g.a, g.b]);
    const hi = [...all].sort((a, b) => b.pts - a.pts)[0];
    const trades = s.tx.filter((t) => t.type === 'trade').length; const adds = s.tx.filter((t) => t.type !== 'trade').length;
    const hot = [...s.standings].filter((x) => x.streak.startsWith('W')).sort((a, b) => parseInt(b.streak.slice(1)) - parseInt(a.streak.slice(1)))[0];
    out += `<h2>League pulse</h2><dl class="facts">
      <div><dt>Average score</dt><dd>${f2(all.reduce((x, y) => x + y.pts, 0) / all.length)}</dd></div>
      <div><dt>Season high</dt><dd>${f2(hi.pts)}, ${tname(s, hi.rid)}</dd></div>
      <div><dt>Hottest team</dt><dd>${hot ? `${tname(s, hot.rid)}, ${hot.streak.slice(1)} straight wins` : 'Nobody on a win streak'}</dd></div>
      <div><dt>Trades this season</dt><dd>${trades}</dd></div><div><dt>Waiver and free-agent moves</dt><dd>${adds}</dd></div></dl>`;
  }
  out += ringBoard();
  return out;
}
function ringBoard() {
  const champs = M.seasons.filter((s) => s.champ);
  const ms = Object.values(M.managers).filter((m) => M.current.has(m.uid)).sort((a, b) => b.titles.length - a.titles.length || b.runnerUps.length - a.runnerUps.length || b.reg.pct - a.reg.pct);
  const hall = champs.length ? table(['Season', 'Champion', 'Runner-up'], [...champs].reverse().map((s) => `<tr><td>${s.season}</td><td class="tm">${tcell(s, s.champ)}</td><td class="tm">${s.runner ? tcell(s, s.runner) : ''}</td></tr>`), { min: 420, cls: 'left' }) : '<p class="note">The first champion lands here when a title game goes final.</p>';
  const board = `<div class="rings">${ms.map((m) => `<div class="ringrow"><span class="who">${avatar(m.avatar)}${mlink(m.uid)}</span><span class="set">${m.titles.map((y) => RING(y)).join('') || '<span class="none">No rings yet</span>'}</span><span class="extra">${m.runnerUps.length ? `${m.runnerUps.length} runner-up` : ''}</span></div>`).join('')}</div>`;
  return `<h2>Hall of champions</h2>${hall}<h2>Ring board</h2>${board}`;
}

// ---------- STANDINGS ----------
let standMode = 'season';
function viewStandings() {
  const s = cur();
  const toggle = seg('Standings view', [['season', `${s.season} season`], ['all', 'All-time']], standMode);
  if (standMode === 'all') return `<h1 class="page-title">Standings</h1>${toggle}${allTime()}`;
  if (!s.standings.some((x) => x.gp)) return `<h1 class="page-title">Standings</h1>${toggle}${empty('This season\'s standings start after week 1 is final.')}`;
  const faab = s.budget != null;
  const rows = s.standings.map((x) => {
    const luck = x.luck > 0 ? `<span class="up">+${f1(x.luck)}</span>` : x.luck < 0 ? `<span class="down">${f1(x.luck)}</span>` : '0.0';
    return `<tr class="${x.rank === s.pt ? 'cut' : ''}"><td class="rk">${x.rank}</td><td class="tm">${tcell(s, x.rid)}</td><td>${rec(x)}</td><td>${f2(x.pf)}</td><td>${f2(x.pa)}</td><td>${x.eff != null ? f1(x.eff) + '%' : ''}</td><td>${x.apw}-${x.apl}</td><td>${x.mw}-${x.ml}</td><td>${luck}</td><td>${esc(x.streak)}</td>${faab ? `<td>$${x.faab}</td>` : ''}</tr>`;
  });
  return `<h1 class="page-title">Standings</h1>${toggle}${table(['<span class="sr">Rank</span>', 'Team', 'Record', 'Points for', 'Against', 'Lineup efficiency', 'All-play', 'Vs median', 'Luck', 'Streak', ...(faab ? ['FAAB left'] : [])], rows, { min: 900 })}
  <p class="note">The gold line is the playoff cut: top ${s.pt} get in. Sorted by record, then points for; Sleeper's own tiebreakers can differ. All-play is your record if you played every team every week. Vs median counts weeks you scored above the league median. Luck is actual wins minus the wins your all-play record predicts. Lineup efficiency is points scored as a share of your best possible lineup.</p>`;
}
function allTime() {
  const ms = Object.values(M.managers);
  const row = (m) => `<tr><td class="tm">${avatar(m.avatar)}${mlink(m.uid)}</td><td>${m.seasons.length}</td><td>${rec(m.reg)}</td><td>${pctS(m.reg.pct)}</td><td>${f2(m.reg.pf)}</td><td>${m.reg.gp ? f2(m.reg.pf / m.reg.gp) : ''}</td><td>${m.apps}</td><td>${rec(m.post)}</td><td>${m.titles.length}</td><td>${m.best ?? ''}</td></tr>`;
  const sortF = (a, b) => b.reg.pct - a.reg.pct || b.reg.pf - a.reg.pf;
  const head = ['Manager', 'Seasons', 'Record', 'Win %', 'Points for', 'Per game', 'Playoff trips', 'Playoff record', 'Titles', 'Best finish'];
  const curr = ms.filter((m) => M.current.has(m.uid)).sort(sortF);
  const former = ms.filter((m) => !M.current.has(m.uid) && m.reg.gp).sort(sortF);
  return `${table(head, curr.map(row), { min: 860 })}<p class="note">Regular season only, except the playoff columns, which count title-bracket games. Consolation and placement games don't count.</p>${former.length ? `<h2>Former managers</h2>${table(head, former.map(row), { min: 860 })}` : ''}`;
}

// ---------- POWER ----------
function viewPower() {
  let s = cur();
  if (!s.games.some((g) => g.kind === 'reg')) s = lastDone() || s;
  const regW = s.weeks.filter((w) => s.isFinal(w.w) && w.w < s.ps).map((w) => w.w);
  if (!regW.length) return `<h1 class="page-title">Power rankings</h1>${empty('Power rankings start after week 1 is final.')}`;
  const last = Math.max(...regW);
  const now = powerAsOf(s, last); const before = Object.fromEntries(powerAsOf(s, last - 1).map((r) => [r.rid, r.rank]));
  const spot = (v) => { const y = Math.round(v); return y >= 100 ? 'Touchdown' : y === 50 ? 'Midfield' : y < 50 ? `Own ${y}` : `Opp ${100 - y}`; };
  const nums = [0, 10, 20, 30, 40, 50, 40, 30, 20, 10, 0].map((n, i) => `<span>${i === 0 || i === 10 ? 'G' : n}</span>`).join('');
  const rows = now.map((p) => {
    const ch = before[p.rid] ? before[p.rid] - p.rank : 0;
    const mv = ch > 0 ? `<span class="mv up">▲${ch}</span>` : ch < 0 ? `<span class="mv down">▼${-ch}</span>` : '<span class="mv dim">no change</span>';
    return `<div class="prow"><div class="who"><span class="rk">${p.rank}</span><span class="nm">${tname(s, p.rid)}</span>${mv}</div><div class="lane" style="--y:${p.score}" role="img" aria-label="${tname(s, p.rid)}: power score ${p.score}">${BALL}</div><div class="spot">${spot(p.score)}<small>${f1(p.score)}</small></div></div>`;
  }).join('');
  // weekly snapshot table
  const snaps = regW.map((w) => Object.fromEntries(powerAsOf(s, w).map((r) => [r.rid, r.rank])));
  const hist = table(['Team', ...regW.map((w) => `Wk ${w}`)], now.map((p) => `<tr><td class="tm">${tname(s, p.rid)}</td>${snaps.map((sn) => `<td>${sn[p.rid] ?? ''}</td>`).join('')}</tr>`), { min: 300 + regW.length * 48 });
  return `<h1 class="page-title">Power rankings</h1><p class="status">${s.season}, after week ${last}. The end zone is a perfect 100.</p>
    <div class="field pre" id="field"><div class="yardnums"><span></span><div class="nums">${nums}</div><span></span></div>${rows}</div>
    <p class="note">Power score blends all-play win rate (40%), actual win rate (30%), and scoring over the last three weeks compared with the rest of the league (30%).</p>
    <h2>Week by week</h2>${hist}`;
}

// ---------- SEASONS ----------
function viewSeasons(arg, arg2) {
  const s = seasonOf(arg) || cur();
  const pickS = seg('Season', [...M.seasons].reverse().map((x) => [x.season, x.season]), s.season);
  let out = `<h1 class="page-title">Seasons</h1>${pickS}`;
  if (s.champ) out += `<p class="headline">${tname(s, s.champ)} won the ${s.season} title, beating ${tname(s, s.runner)} in the final.</p>`;
  else if (s.status !== 'complete') out += `<p class="status">In progress.</p>`;
  // final standings
  if (s.standings.some((x) => x.gp)) {
    const ord = [...s.standings].sort((a, b) => s.place[a.rid] - s.place[b.rid]);
    out += `<h2>${s.status === 'complete' ? 'Final standings' : 'Standings'}</h2>` + table(['Finish', 'Team', 'Record', 'Points for', 'Against', 'Grade'], ord.map((x) => `<tr><td class="rk">${s.place[x.rid]}</td><td class="tm">${tcell(s, x.rid)}</td><td>${rec(x)}</td><td>${f2(x.pf)}</td><td>${f2(x.pa)}</td><td><span class="grade">${s.grade[x.rid]}</span></td></tr>`), { min: 560 }) + `<p class="note">Grades weigh points scored (45%), record (30%), and final finish (25%).</p>`;
  }
  out += bracketHtml(s);
  out += highlights(s);
  // weekly archive
  if (s.weeks.length) {
    const wk = s.weeks.find((w) => String(w.w) === String(arg2)) || [...s.weeks].reverse().find((w) => s.isFinal(w.w)) || s.weeks[s.weeks.length - 1];
    const sb = scoreboard(s, wk);
    out += `<h2 id="archive">Weekly scores</h2><div class="weekpick">${s.weeks.map((w) => `<a href="#seasons/${s.season}/${w.w}" ${w === wk ? 'aria-current="page"' : ''}>${w.w}</a>`).join('')}</div><p class="status">Week ${wk.w}${wk.w >= s.ps ? ', playoffs' : ''}. ${s.isFinal(wk.w) ? 'Final.' : 'In progress.'}</p>${sb.html}${sb.recap ? `<h3 class="sub3">Game balls</h3>${awardsHtml(sb.recap)}` : ''}`;
  }
  // draft recap
  const d = s.drafts.find((x) => x.picks.length);
  if (d) out += `<h2>Draft recap</h2>` + draftTable(s, d.picks.slice(0, 48)) + (d.picks.length > 48 ? `<p class="note"><a href="#drafts/${s.season}">See all ${d.picks.length} picks</a></p>` : '');
  return out;
}
function bracketHtml(s) {
  const b = s.wb.filter((m) => m.t1 || m.t2);
  if (!b.length) return '';
  const maxR = Math.max(...b.map((m) => m.r));
  const label = (r, p) => (p === 1 ? 'Final' : p === 3 ? 'Third place' : p === 5 ? 'Fifth place' : r === maxR ? 'Final' : r === maxR - 1 ? 'Semifinals' : `Round ${r}`);
  const cols = range(1, maxR).map((r) => {
    const ms = b.filter((m) => m.r === r).sort((a, z) => (a.p || 0) - (z.p || 0));
    return `<div class="bcol"><h3>${r === maxR ? 'Championship round' : label(r)}</h3>${ms.map((m) => {
      const ws = roundWeeks(s, m.r, maxR); const ready = ws.every((w) => s.wm.has(w));
      const pts = (rid) => (rid && ready ? f2(ws.reduce((x, w) => x + (s.entry(rid, w)?.pts || 0), 0)) : '');
      const side = (rid) => `<div class="bs ${m.w ? (m.w === rid ? 'win' : 'loss') : ''}"><span>${rid ? tname(s, rid) : 'TBD'}</span><b>${pts(rid)}</b></div>`;
      return `<div class="bm">${m.p && m.p !== 1 ? `<span class="bl">${label(m.r, m.p)}</span>` : m.p === 1 ? '<span class="bl gold">Title game</span>' : ''}${side(m.t1)}${side(m.t2)}</div>`;
    }).join('')}</div>`;
  }).join('');
  return `<h2>Playoff bracket</h2><div class="bracket">${cols}</div>`;
}
function highlights(s) {
  const g = s.games.filter((x) => x.kind === 'reg' || x.kind === 'title');
  if (!g.length) return '';
  const sides = g.flatMap((x) => [x.a, x.b]);
  const hi = [...sides].sort((a, b) => b.pts - a.pts)[0]; const lo = [...sides].sort((a, b) => a.pts - b.pts)[0];
  const bl = [...g].filter((x) => x.win).sort((a, b) => b.margin - a.margin)[0]; const cl = [...g].filter((x) => x.win).sort((a, b) => a.margin - b.margin)[0];
  const mostPf = [...s.standings].sort((a, b) => b.pf - a.pf)[0]; const luck = [...s.standings].sort((a, b) => b.luck - a.luck)[0]; const unl = [...s.standings].sort((a, b) => a.luck - b.luck)[0];
  const items = [['Highest score', `${tname(s, hi.rid)}, ${f2(hi.pts)}`], ['Lowest score', `${tname(s, lo.rid)}, ${f2(lo.pts)}`], ['Biggest blowout', bl ? `${gameLine(bl)} (${gameWhen(bl)})` : ''], ['Closest game', cl ? `${gameLine(cl)} (${gameWhen(cl)})` : ''], ['Most points', `${tname(s, mostPf.rid)}, ${f2(mostPf.pf)}`], ['Luckiest', `${tname(s, luck.rid)}, ${luck.luck > 0 ? '+' : ''}${f1(luck.luck)} wins`], ['Unluckiest', `${tname(s, unl.rid)}, ${f1(unl.luck)} wins`], ['Trades', String(s.tx.filter((t) => t.type === 'trade').length)]];
  return `<h2>Highlights</h2><dl class="awards">${items.filter((i) => i[1]).map(([t, x]) => `<div><dt>${esc(t)}</dt><dd>${x}</dd></div>`).join('')}</dl>`;
}

// ---------- RECORDS ----------
function viewRecords() {
  const weeksAll = M.seasons.flatMap((s) => s.weeks.filter((w) => s.isFinal(w.w)).flatMap((w) => w.e.filter((x) => x.pts > 0).map((x) => ({ s, w: w.w, ...x }))));
  if (!weeksAll.length) return `<h1 class="page-title">Records</h1>${empty('Records start after week 1 is final.')}`;
  const wk = (x) => `${x.s.season} wk ${x.w}`;
  const teamHi = [...weeksAll].sort((a, b) => b.pts - a.pts).slice(0, 10).map((x) => ({ v: f2(x.pts), d: `${tname(x.s, x.rid)} <small>${wk(x)}</small>` }));
  const teamLo = [...weeksAll].sort((a, b) => a.pts - b.pts).slice(0, 10).map((x) => ({ v: f2(x.pts), d: `${tname(x.s, x.rid)} <small>${wk(x)}</small>` }));
  const seasRows = M.seasons.filter((s) => s.status === 'complete').flatMap((s) => s.standings.map((x) => ({ s, ...x })));
  const pfHi = [...seasRows].sort((a, b) => b.pf - a.pf).slice(0, 10).map((x) => ({ v: f2(x.pf), d: `${tname(x.s, x.rid)} <small>${x.s.season}</small>` }));
  const winHi = [...seasRows].sort((a, b) => b.w - a.w || b.pf - a.pf).slice(0, 10).map((x) => ({ v: rec(x), d: `${tname(x.s, x.rid)} <small>${x.s.season}</small>` }));
  const games = M.games.filter((g) => g.kind === 'reg' || g.kind === 'title');
  const comb = [...games].sort((a, b) => b.a.pts + b.b.pts - (a.a.pts + a.b.pts)).slice(0, 10).map((g) => ({ v: f2(g.a.pts + g.b.pts), d: `${gameLine(g)} <small>${gameWhen(g)}</small>` }));
  const blow = [...games].sort((a, b) => b.margin - a.margin).slice(0, 10).map((g) => ({ v: f2(g.margin), d: `${gameLine(g)} <small>${gameWhen(g)}</small>` }));
  const close = [...games].filter((g) => g.win).sort((a, b) => a.margin - b.margin).slice(0, 10).map((g) => ({ v: f2(g.margin), d: `${gameLine(g)} <small>${gameWhen(g)}</small>` }));
  const plW = weeksAll.flatMap((x) => x.st.map((id) => ({ id, p: x.pp[id] || 0, x }))).sort((a, b) => b.p - a.p).slice(0, 10).map((o) => ({ v: f2(o.p), d: `${pl(o.id)} for ${tname(o.x.s, o.x.rid)} <small>${wk(o.x)}</small>` }));
  const tot = {};
  for (const x of weeksAll) { if (x.w >= x.s.ps) continue; for (const id of x.st) { const k = `${x.s.season}|${x.rid}|${id}`; (tot[k] ||= { s: x.s, rid: x.rid, id, p: 0 }).p += x.pp[id] || 0; } }
  const plS = Object.values(tot).sort((a, b) => b.p - a.p).slice(0, 10).map((o) => ({ v: f2(o.p), d: `${pl(o.id)} for ${tname(o.s, o.rid)} <small>${o.s.season}</small>` }));
  return `<h1 class="page-title">Records</h1><div class="grid2">
    ${topList('Highest team scores', teamHi)}${topList('Lowest team scores', teamLo)}
    ${topList('Most points in a season', pfHi, 'Regular season, finished seasons only.')}${topList('Most wins in a season', winHi)}
    ${topList('Highest-scoring games', comb)}${topList('Biggest blowouts', blow)}
    ${topList('Closest games', close)}${topList('Best player weeks', plW, 'Starters only.')}
    ${topList('Best player seasons for one team', plS, 'Points scored while in that team\'s starting lineup, regular season.')}</div>`;
}

// ---------- HEAD TO HEAD ----------
let h2hKind = 'reg';
function viewH2H(a, b) {
  const ms = Object.values(M.managers).filter((m) => M.current.has(m.uid)).sort((x, y) => x.name.localeCompare(y.name));
  const all = Object.values(M.managers).sort((x, y) => x.name.localeCompare(y.name));
  const u1 = M.managers[decodeURIComponent(a || '')] ? decodeURIComponent(a) : ms[0]?.uid;
  const u2 = M.managers[decodeURIComponent(b || '')] ? decodeURIComponent(b) : ms.find((m) => m.uid !== u1)?.uid;
  const opt = (sel) => all.map((m) => `<option value="${esc(m.uid)}" ${m.uid === sel ? 'selected' : ''}>${esc(m.name)}</option>`).join('');
  let out = `<h1 class="page-title">Head-to-head</h1><div class="vs"><select id="h1" aria-label="First manager">${opt(u1)}</select><span>vs</span><select id="h2" aria-label="Second manager">${opt(u2)}</select></div>`;
  if (u1 && u2 && u1 !== u2) {
    const r = h2h(M, u1, u2); const rr = h2h(M, u1, u2, ['reg']); const rp = h2h(M, u1, u2, ['title']);
    const lead = r.w > r.l ? `${esc(mgr(u1).name)} leads` : r.l > r.w ? `${esc(mgr(u2).name)} leads` : 'Dead even';
    out += `<div class="vscard"><div><b class="big">${r.w}</b>${mlink(u1)}</div><div class="mid">${lead}<small>${r.games.length} games</small></div><div><b class="big">${r.l}</b>${mlink(u2)}</div></div>
      <dl class="facts"><div><dt>Regular season</dt><dd>${rec(rr)}</dd></div><div><dt>Playoffs</dt><dd>${rec(rp)}</dd></div><div><dt>Points for</dt><dd>${f2(r.pf)} to ${f2(r.pa)}</dd></div><div><dt>Average margin</dt><dd>${r.games.length ? f2(Math.abs(r.pf - r.pa) / r.games.length) : '0.00'}</dd></div></dl>`;
    if (r.games.length) out += table(['When', 'Result'], r.games.map((g) => `<tr><td>${gameWhen(g)}</td><td class="tm">${gameLine(g)}</td></tr>`), { min: 420 });
    else out += `<p class="note">These two haven't played yet.</p>`;
  }
  // matrix
  const kinds = { reg: ['reg'], title: ['title'], all: ['reg', 'title', 'place', 'cons'] };
  out += `<h2>Every matchup</h2>${seg('Game type', [['reg', 'Regular season'], ['title', 'Title playoffs'], ['all', 'All games']], h2hKind)}`;
  const head = ['', ...ms.map((m) => `<span class="vert" title="${esc(m.name)}">${esc(m.name)}</span>`)];
  const rows = ms.map((r) => `<tr><th scope="row" class="tm">${mlink(r.uid)}</th>${ms.map((c) => {
    if (c.uid === r.uid) return '<td class="self"></td>';
    const x = h2h(M, r.uid, c.uid, kinds[h2hKind]); const n = x.w + x.l + x.t;
    const cls = !n ? 'none' : x.w > x.l ? 'pos' : x.l > x.w ? 'neg' : 'even';
    return `<td class="${cls}"><a href="#h2h/${encodeURIComponent(r.uid)}/${encodeURIComponent(c.uid)}">${n ? rec(x) : ''}</a></td>`;
  }).join('')}</tr>`);
  out += table(head, rows, { cls: 'matrix', min: 160 + ms.length * 56 }) + `<p class="note">Read across: each row is that manager's record against the column. Tap a cell for the game list.</p>`;
  // rivalries
  const pairs = [];
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    const x = h2h(M, all[i].uid, all[j].uid); const n = x.w + x.l + x.t; if (n < 2) continue;
    const pm = x.games.filter((g) => g.kind === 'title').length;
    const score = n * (1 - Math.abs(x.w - x.l) / n) + 2 * pm + (n ? 10 / (1 + Math.abs(x.pf - x.pa) / n) : 0);
    pairs.push({ a: all[i], b: all[j], x, n, pm, score });
  }
  pairs.sort((p, q) => q.score - p.score);
  out += `<h2>Rivalry rankings</h2>${pairs.length ? table(['', 'Rivalry', 'Series', 'Games', 'Avg margin', 'Playoff meetings'], pairs.slice(0, 10).map((p, i) => `<tr><td class="rk">${i + 1}</td><td class="tm">${mlink(p.a.uid)} vs ${mlink(p.b.uid)}</td><td>${p.x.w}-${p.x.l}${p.x.t ? `-${p.x.t}` : ''}</td><td>${p.n}</td><td>${f2(Math.abs(p.x.pf - p.x.pa) / p.n)}</td><td>${p.pm}</td></tr>`), { min: 560 }) + '<p class="note">Rivalries rank higher with more games, a closer series, tighter scores, and playoff meetings.</p>' : '<p class="note">Rivalries show up once pairs have played at least twice.</p>'}`;
  return out;
}

// ---------- FUN STATS ----------
let funScope = 'all';
function viewFun() {
  const scopes = [['all', 'All-time'], ...[...M.seasons].reverse().map((s) => [String(s.season), String(s.season)])];
  const ss = funScope === 'all' ? M.seasons : [seasonOf(funScope)].filter(Boolean);
  const games = ss.flatMap((s) => s.games).filter((g) => g.kind === 'reg' || g.kind === 'title');
  let out = `<h1 class="page-title">Fun stats</h1>${seg('Scope', scopes, funScope)}`;
  if (!games.length) return out + empty('Fun stats start after week 1 is final.');
  const decided = games.filter((g) => g.win);
  const W = (g) => (g.win === 'a' ? g.a : g.b), L = (g) => (g.win === 'a' ? g.b : g.a);
  const gl = (g) => `${gameLine(g)} <small>${gameWhen(g)}</small>`;
  out += `<div class="grid2">
    ${topList('Blowouts', [...decided].sort((a, b) => b.margin - a.margin).slice(0, 8).map((g) => ({ v: f2(g.margin), d: gl(g) })))}
    ${topList('Closest games', [...decided].sort((a, b) => a.margin - b.margin).slice(0, 8).map((g) => ({ v: f2(g.margin), d: gl(g) })))}
    ${topList('Hard-luck losses', [...decided].sort((a, b) => L(b).pts - L(a).pts).slice(0, 8).map((g) => ({ v: f2(L(g).pts), d: `${mlink(L(g).uid)} lost anyway <small>${gameWhen(g)}</small>` })), 'Highest scores that still lost.')}
    ${topList('Lucky wins', [...decided].sort((a, b) => W(a).pts - W(b).pts).slice(0, 8).map((g) => ({ v: f2(W(g).pts), d: `${mlink(W(g).uid)} won anyway <small>${gameWhen(g)}</small>` })), 'Lowest scores that still won.')}
  </div>`;
  // per-manager stats in scope
  const per = {};
  const P = (uid) => (per[uid] ||= { uid, scores: [], cw: 0, cl: 0, w: 0, gp: 0, xw: 0, mw: 0, ml: 0, pf: 0, max: 0 });
  for (const s of ss) {
    for (const x of s.standings) { const p = P(x.uid); p.scores.push(...x.scores); p.w += x.w + x.t / 2; p.gp += x.gp; p.xw += x.apPct * x.gp; p.mw += x.mw; p.ml += x.ml; if (x.max) { p.pf += x.pf; p.max += x.max; } }
  }
  for (const g of decided) if (g.margin < 10) { P(W(g).uid).cw++; P(L(g).uid).cl++; }
  const list = Object.values(per).filter((p) => p.scores.length);
  const cons = list.map((p) => ({ ...p, avg: mean(p.scores), dev: sd(p.scores) })).sort((a, b) => a.dev - b.dev);
  out += `<h2>Consistency vs. volatility</h2>` + table(['Manager', 'Avg score', 'Std. dev.', 'Best week', 'Worst week', 'Type'], cons.map((p, i) => `<tr><td class="tm">${mlink(p.uid)}</td><td>${f2(p.avg)}</td><td>${f2(p.dev)}</td><td>${f2(Math.max(...p.scores))}</td><td>${f2(Math.min(...p.scores))}</td><td>${i < 3 ? 'Steady' : i >= cons.length - 3 ? 'Boom or bust' : ''}</td></tr>`), { min: 620 }) + '<p class="note">Lower standard deviation means more predictable weekly scores. Regular season.</p>';
  const clutch = list.filter((p) => p.cw + p.cl).sort((a, b) => b.cw / (b.cw + b.cl) - a.cw / (a.cw + a.cl) || b.cw - a.cw);
  out += `<h2>Clutch index</h2>` + (clutch.length ? table(['Manager', 'Record in games decided by under 10', 'Win %'], clutch.map((p) => `<tr><td class="tm">${mlink(p.uid)}</td><td>${p.cw}-${p.cl}</td><td>${pctS(p.cw / (p.cw + p.cl))}</td></tr>`), { min: 460 }) : '<p class="note">No close games yet.</p>');
  const luck = list.map((p) => ({ ...p, luck: p.w - p.xw })).sort((a, b) => b.luck - a.luck);
  out += `<h2>Luck rating</h2>` + table(['Manager', 'Actual wins', 'Expected wins', 'Luck', 'Vs median'], luck.map((p) => `<tr><td class="tm">${mlink(p.uid)}</td><td>${f1(p.w)}</td><td>${f1(p.xw)}</td><td>${p.luck > 0 ? `<span class="up">+${f1(p.luck)}</span>` : `<span class="down">${f1(p.luck)}</span>`}</td><td>${p.mw}-${p.ml}</td></tr>`), { min: 560 }) + '<p class="note">Expected wins come from the all-play record: how often you would have won against every team that week.</p>';
  const bench = list.filter((p) => p.max).map((p) => ({ ...p, left: p.max - p.pf, eff: p.pf / p.max })).sort((a, b) => b.eff - a.eff);
  out += `<h2>Benching analysis</h2>` + (bench.length ? table(['Manager', 'Points scored', 'Best possible', 'Left on bench', 'Efficiency'], bench.map((p) => `<tr><td class="tm">${mlink(p.uid)}</td><td>${f2(p.pf)}</td><td>${f2(p.max)}</td><td>${f2(p.left)}</td><td>${pctS(p.eff)}</td></tr>`), { min: 600 }) + '<p class="note">Best possible is Sleeper\'s optimal lineup total for the season.</p>' : '<p class="note">Sleeper hasn\'t reported optimal lineups yet.</p>');
  out += streaksHtml();
  return out;
}
function streaksHtml() {
  const seq = {};
  for (const g of [...M.games].filter((x) => x.kind === 'reg' || x.kind === 'title').sort((a, b) => a.season - b.season || a.week - b.week)) for (const [me, k] of [[g.a, 'a'], [g.b, 'b']]) (seq[me.uid] ||= []).push({ r: !g.win ? 'T' : g.win === k ? 'W' : 'L', g });
  const rows = [];
  for (const uid in seq) {
    const a = seq[uid]; let best = { W: 0, L: 0 }, run = 0, prev = null;
    for (const x of a) { run = x.r === prev ? run + 1 : 1; prev = x.r; if (x.r !== 'T') best[x.r] = Math.max(best[x.r], run); }
    const last = a[a.length - 1]?.r; let n = 0; for (let i = a.length - 1; i >= 0 && a[i].r === last; i--) n++;
    rows.push({ uid, cur: `${last}${n}`, curN: last === 'W' ? n : last === 'L' ? -n : 0, bw: best.W, bl: best.L });
  }
  rows.sort((a, b) => b.curN - a.curN);
  return `<h2>Streaks</h2>` + table(['Manager', 'Current', 'Longest win streak', 'Longest losing streak'], rows.filter((r) => M.current.has(r.uid)).map((r) => `<tr><td class="tm">${mlink(r.uid)}</td><td class="${r.curN > 0 ? 'up' : r.curN < 0 ? 'down' : ''}">${r.cur}</td><td>${r.bw}</td><td>${r.bl}</td></tr>`), { min: 520 }) + '<p class="note">All-time, regular season and title playoffs, carried across seasons.</p>';
}

// ---------- TRADES & MOVES ----------
let tradeMetric = 'wr', moveType = 'trade', moveSeason = 'all', moveMgr = 'all';
function viewTrades() {
  const all = M.seasons.flatMap((s) => s.tx.map((t) => ({ s, t })));
  let out = `<h1 class="page-title">Trades</h1>`;
  const trades = all.filter((x) => x.t.type === 'trade').map((x) => ({ ...x, sides: tradeValues(M, x.s, x.t) }));
  if (trades.length) {
    const key = tradeMetric === 'wr' ? 'netWr' : 'netSt';
    const lb = trades.flatMap((x) => x.sides.map((sd) => ({ ...x, sd }))).filter((x) => x.sd[key] > 0).sort((a, b) => b.sd[key] - a.sd[key]).slice(0, 10);
    out += `<h2>Grand Larceny</h2>${seg('Trade value', [['wr', 'While rostered'], ['st', 'Season total']], tradeMetric)}`;
    out += lb.length ? `<ol class="larceny">${lb.map((x, i) => {
      const others = x.sides.filter((o) => o !== x.sd);
      const gave = others.flatMap((o) => o.items.filter((it) => x.t.drops[it.pid] === x.sd.rid));
      const v = (it) => (tradeMetric === 'wr' ? it.wr : it.st);
      return `<li><span class="rk">${i + 1}</span><div><p><b>${mlink(x.sd.uid)}</b> won by <b class="gold">${f2(x.sd[key])}</b> points <small>${x.s.season}, week ${x.t.wk}</small></p><p class="note">Got ${x.sd.items.map((it) => `${pl(it.pid, false)} (${f2(v(it))})`).join(', ') || 'picks or FAAB only'}. Gave ${gave.map((it) => `${pl(it.pid, false)} (${f2(v(it))})`).join(', ') || 'picks or FAAB only'}${others.length ? ` to ${others.map((o) => mlink(o.uid)).join(' and ')}` : ''}.</p></div></li>`;
    }).join('')}</ol><p class="note">While rostered counts points the players scored in their new team's starting lineup after the trade, including later seasons. Season total counts everything they scored the rest of that season, on any team. Draft picks aren't scored.</p>` : '<p class="note">No trade has a clear winner yet.</p>';
  }
  // history with filters
  const seasons = [['all', 'All seasons'], ...[...M.seasons].reverse().map((s) => [String(s.season), String(s.season)])];
  const mgrs = [['all', 'Everyone'], ...Object.values(M.managers).sort((a, b) => a.name.localeCompare(b.name)).map((m) => [m.uid, m.name])];
  const list = all.filter(({ s, t }) => (moveType === 'all' || t.type === moveType) && (moveSeason === 'all' || String(s.season) === moveSeason) && (moveMgr === 'all' || t.rids.some((r) => s.uid(r) === moveMgr)));
  out += `<h2>Every move</h2><div class="filters">${seg('Move type', [['trade', 'Trades'], ['waiver', 'Waivers'], ['free_agent', 'Free agents'], ['all', 'All']], moveType)}
    <select id="mvSeason" aria-label="Season">${seasons.map(([v, l]) => `<option value="${esc(v)}" ${v === moveSeason ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
    <select id="mvMgr" aria-label="Manager">${mgrs.map(([v, l]) => `<option value="${esc(v)}" ${v === moveMgr ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`;
  out += list.length ? list.slice(0, 300).map(({ s, t }) => moveHtml(s, t)).join('') + (list.length > 300 ? `<p class="note">Showing the latest 300 of ${list.length}.</p>` : '') : empty('Nothing matches those filters.');
  return out;
}
function moveHtml(s, t) {
  const when = `${s.season}, week ${t.wk}`;
  if (t.type === 'trade') {
    const sides = t.rids.map((rid) => {
      const got = [...Object.entries(t.adds).filter(([, to]) => to === rid).map(([id]) => pl(id)), ...t.picks.filter((p) => p.to === rid).map((p) => `${esc(p.s)} round ${esc(p.r)} pick${p.o !== rid ? ` <span class="pos">(${tname(s, p.o)}'s)</span>` : ''}`), ...t.faab.filter((b) => b.to === rid).map((b) => `$${esc(b.a)} FAAB`)];
      return `<div><h3>${tname(s, rid)} gets</h3><ul>${got.length ? got.map((g) => `<li>${g}</li>`).join('') : '<li>Nothing</li>'}</ul></div>`;
    }).join('');
    return `<div class="move trade"><div class="kind">Trade<small>${when}</small></div><div class="trade-sides">${sides}</div></div>`;
  }
  const rid = t.rids[0]; const adds = Object.keys(t.adds).map((id) => pl(id)).join(', '); const drops = Object.keys(t.drops).map((id) => pl(id)).join(', ');
  let text = `<strong>${tname(s, rid)}</strong>`;
  if (adds) text += ` added ${adds}${t.type === 'waiver' && t.bid != null ? ` for $${esc(t.bid)}` : ''}`;
  if (drops) text += `${adds ? ' and' : ''} dropped ${drops}`;
  return `<div class="move"><div class="kind">${t.type === 'waiver' ? 'Waiver' : t.type === 'free_agent' ? 'Free agent' : 'Commish'}<small>${when}</small></div><div>${text}.</div></div>`;
}

// ---------- MANAGERS ----------
function viewManagers(arg) {
  const uid = decodeURIComponent(arg || '');
  if (M.managers[uid]) return profile(M.managers[uid]);
  const card = (m) => `<a class="mcard" href="#managers/${encodeURIComponent(m.uid)}">${avatar(m.avatar)}<span><b>${esc(m.name)}</b><small>${esc(m.names[m.names.length - 1]?.team || '')}</small><small>${rec(m.reg)}, ${m.titles.length} title${m.titles.length === 1 ? '' : 's'}${m.founder ? ', founder' : ''}</small></span></a>`;
  const ms = Object.values(M.managers).sort((a, b) => b.titles.length - a.titles.length || b.reg.pct - a.reg.pct);
  const curr = ms.filter((m) => M.current.has(m.uid)); const former = ms.filter((m) => !M.current.has(m.uid));
  const f = M.seasons[0]; const founders = f ? Object.values(f.teams) : [];
  return `<h1 class="page-title">Managers</h1><div class="mgrid">${curr.map(card).join('')}</div>
    ${former.length ? `<h2>Former managers</h2><div class="mgrid">${former.map(card).join('')}</div>` : ''}
    <h2>Founding members, ${f?.season ?? ''}</h2><p class="note">${founders.map((t) => `${esc(t.team)} (${mlink(t.uid)})`).join(', ')}</p>`;
}
function profile(m) {
  const others = Object.values(M.managers).filter((o) => o.uid !== m.uid).map((o) => ({ o, x: h2h(M, m.uid, o.uid) })).filter((r) => r.x.games.length);
  const n = (r) => r.x.w + r.x.l + r.x.t;
  const nemesis = [...others].filter((r) => r.x.l > r.x.w).sort((a, b) => b.x.l - b.x.w - (a.x.l - a.x.w) || b.x.l - a.x.l)[0];
  const victim = [...others].filter((r) => r.x.w > r.x.l).sort((a, b) => b.x.w - b.x.l - (a.x.w - a.x.l) || b.x.w - a.x.w)[0];
  const arch = [...others].sort((a, b) => n(b) - n(a) || Math.abs(a.x.w - a.x.l) - Math.abs(b.x.w - b.x.l))[0];
  // moves & archetype
  let adds = 0, spent = 0, trades = 0, seasonsN = 0;
  for (const s of M.seasons) {
    const rid = Object.values(s.teams).find((t) => t.uid === m.uid)?.rid; if (!rid) continue; seasonsN++;
    for (const t of s.tx) { if (!t.rids.includes(rid)) continue; if (t.type === 'trade') trades++; else { adds += Object.keys(t.adds).length; if (t.type === 'waiver' && t.bid) spent += t.bid; } }
  }
  const per = (x) => (seasonsN ? x / seasonsN : 0);
  const arche = per(trades) >= 4 ? ['Trade machine', 'Always on the phone. Averages 4+ trades a season.'] : per(spent) >= 60 ? ['Big spender', 'Burns FAAB like it\'s going out of style.'] : per(adds) >= 20 ? ['Wire hawk', 'Lives on the waiver wire.'] : per(adds) <= 5 && per(trades) <= 1 ? ['Set and forget', 'Drafts a team and lets it ride.'] : ['Balanced', 'Picks spots on the wire and in trades.'];
  // draft capital efficiency
  let picks = 0, dpts = 0;
  for (const s of M.seasons) for (const d of s.drafts) for (const p of d.picks) {
    if (s.teams[p.rid]?.uid !== m.uid) continue; picks++;
    for (const ss of M.seasons.filter((x) => x.season >= s.season)) { const myRid = Object.values(ss.teams).find((t) => t.uid === m.uid)?.rid; for (const wk of ss.weeks) { if (!ss.isFinal(wk.w)) continue; const e = wk.e.find((x) => x.rid === myRid); if (e && e.st.includes(p.pid)) dpts += e.pp[p.pid] || 0; } }
  }
  const seasons = [...m.seasons].reverse().map((x) => `<tr><td>${x.season}</td><td class="tm">${esc(x.team)}</td><td>${x.row ? rec(x.row) : ''}</td><td>${x.row ? f2(x.row.pf) : ''}</td><td>${x.complete ? ordinal(x.place) : 'In progress'}${M.seasons.find((s) => s.season === x.season)?.champ === x.rid ? ' 🏆' : ''}</td><td><span class="grade">${x.row?.gp ? x.grade : ''}</span></td></tr>`);
  const names = [...new Set(m.names.map((x) => x.team))];
  return `<p class="back"><a href="#managers">All managers</a></p>
    <div class="phead">${avatar(m.avatar)}<div><h1 class="page-title">${esc(m.name)}</h1><p class="status">${m.founder ? 'Founding member. ' : ''}${M.current.has(m.uid) ? 'Current manager.' : 'Former manager.'} Team names: ${names.map(esc).join(', ')}.</p></div></div>
    ${m.titles.length ? `<div class="rings big">${m.titles.map((y) => RING(y)).join('')}</div>` : ''}
    <dl class="facts"><div><dt>Regular season</dt><dd>${rec(m.reg)} (${pctS(m.reg.pct)})</dd></div><div><dt>Points per game</dt><dd>${m.reg.gp ? f2(m.reg.pf / m.reg.gp) : ''}</dd></div><div><dt>Titles</dt><dd>${m.titles.length ? m.titles.join(', ') : 'None yet'}</dd></div><div><dt>Runner-up</dt><dd>${m.runnerUps.length ? m.runnerUps.join(', ') : 'None'}</dd></div><div><dt>Playoff trips</dt><dd>${m.apps}</dd></div><div><dt>Playoff record</dt><dd>${rec(m.post)}</dd></div><div><dt>Best finish</dt><dd>${m.best ? ordinal(m.best) : 'None yet'}</dd></div></dl>
    <h2>Rivals</h2><dl class="awards"><div><dt>Nemesis</dt><dd>${nemesis ? `${mlink(nemesis.o.uid)}, ${rec(nemesis.x)}` : 'Nobody owns them yet'}</dd></div><div><dt>Favorite victim</dt><dd>${victim ? `${mlink(victim.o.uid)}, ${rec(victim.x)}` : 'Nobody yet'}</dd></div><div><dt>Arch-rival</dt><dd>${arch ? `${mlink(arch.o.uid)}, ${rec(arch.x)} in ${n(arch)} games` : 'Nobody yet'}</dd></div></dl>
    <h2>Style</h2><dl class="awards"><div><dt>${arche[0]}</dt><dd>${arche[1]}</dd></div><div><dt>Moves</dt><dd>${trades} trades, ${adds} pickups, $${spent} FAAB on winning bids</dd></div><div><dt>Draft capital efficiency</dt><dd>${picks ? `${f1(dpts / picks)} starter points per pick (${picks} picks)` : 'No draft picks on record'}</dd></div></dl>
    <h2>Season by season</h2>${table(['Season', 'Team', 'Record', 'Points for', 'Finish', 'Grade'], seasons, { min: 560 })}
    <p class="note"><a href="#h2h/${encodeURIComponent(m.uid)}">Compare with another manager</a></p>`;
}
const ordinal = (n) => (n ? n + (['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) ? 0 : n % 10 < 4 ? n % 10 : 0]) : '');

// ---------- DRAFTS ----------
let draftQ = '';
function draftTable(s, picks) {
  return table(['Pick', 'Round', 'Team', 'Player'], picks.map((p) => `<tr><td>${p.n}</td><td>${p.r}</td><td class="tm">${tcell(s, p.rid)}</td><td class="tm">${M.players[p.pid] ? pl(p.pid) : esc(p.nm)}</td></tr>`), { min: 520, cls: 'left' });
}
function viewDrafts(arg) {
  const withD = M.seasons.filter((s) => s.drafts.some((d) => d.picks.length));
  let out = `<h1 class="page-title">Drafts</h1>`;
  if (!withD.length) return out + empty('Draft results show up here once a draft is complete.');
  out += `<div class="search"><label for="dq">Search every draft by player or manager</label><input id="dq" type="search" value="${esc(draftQ)}" placeholder="Player or manager name" autocomplete="off"></div><div id="dres"></div>`;
  const s = seasonOf(arg) && withD.includes(seasonOf(arg)) ? seasonOf(arg) : withD[withD.length - 1];
  out += `<h2>${s.season} draft</h2>${seg('Season', [...withD].reverse().map((x) => [x.season, x.season]), s.season)}`;
  for (const d of s.drafts.filter((x) => x.picks.length)) out += draftTable(s, d.picks);
  return out;
}
function draftSearch() {
  const box = $('#dres'); if (!box) return;
  const q = draftQ.trim().toLowerCase();
  if (q.length < 2) { box.innerHTML = ''; return; }
  const hits = [];
  for (const s of M.seasons) for (const d of s.drafts) for (const p of d.picks) {
    const name = (M.players[p.pid]?.[0] || p.nm || '').toLowerCase(); const t = s.teams[p.rid]; const mn = (mgr(t?.uid).name || '').toLowerCase();
    if (name.includes(q) || mn.includes(q) || (t?.team || '').toLowerCase().includes(q)) hits.push({ s, p });
  }
  box.innerHTML = hits.length ? table(['Season', 'Pick', 'Team', 'Player'], hits.slice(0, 100).map(({ s, p }) => `<tr><td>${s.season}</td><td>${p.r}.${String(((p.n - 1) % Math.max(1, Object.keys(s.teams).length)) + 1).padStart(2, '0')}</td><td class="tm">${tcell(s, p.rid)}</td><td class="tm">${M.players[p.pid] ? pl(p.pid) : esc(p.nm)}</td></tr>`), { min: 520, cls: 'left' }) : '<p class="note">No picks match.</p>';
}

// ---------- LEAGUE ----------
function viewLeague() {
  const s = cur(); const pos = s.positions.filter((p) => !['BN', 'IR', 'TAXI'].includes(p)); const c = {}; pos.forEach((p) => (c[p] = (c[p] || 0) + 1));
  const lineup = Object.entries(c).map(([p, n]) => `${n > 1 ? n + ' ' : ''}${p === 'SUPER_FLEX' ? 'Superflex' : p === 'FLEX' ? 'Flex' : p}`).join(', ');
  const scoring = s.rec === 1 ? 'Full PPR' : s.rec === 0.5 ? 'Half PPR' : s.rec ? `${s.rec} per catch` : 'Standard';
  const facts = [['Teams', Object.keys(s.teams).length], ['Scoring', scoring], ['Starting lineup', lineup], ['Bench, IR, taxi', `${s.positions.filter((p) => p === 'BN').length}, ${s.ir}, ${s.taxi}`], ['Playoffs', `Top ${s.pt}, starting week ${s.ps}`], ['Trade deadline', s.deadline && s.deadline < 99 ? `Week ${s.deadline}` : 'None'], ['FAAB budget', s.budget != null ? `$${s.budget}` : 'Rolling waivers'], ['Seasons on Sleeper', M.seasons.map((x) => x.season).join(', ')]];
  const by = window.LEAGUE_CONFIG?.bylawsUrl;
  return `<h1 class="page-title">League</h1><h2>Rules at a glance</h2><dl class="facts">${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>${by ? `<p><a href="${esc(by)}">Read the full bylaws</a></p>` : ''}
  <h2>How this site works</h2><p class="note">Every page pulls straight from Sleeper when it loads, so scores, trades, and standings are always current. Finished seasons are saved in your browser to load faster. When Sleeper starts a new season, the site finds it automatically.</p>`;
}

// ---------- router ----------
const VIEWS = { home: viewHome, standings: viewStandings, power: viewPower, seasons: viewSeasons, records: viewRecords, h2h: viewH2H, fun: viewFun, trades: viewTrades, managers: viewManagers, drafts: viewDrafts, league: viewLeague };
function route() {
  if (!M) return;
  const [tab = 'home', a, b] = location.hash.slice(1).split('/');
  const key = VIEWS[tab] ? tab : 'home';
  document.querySelectorAll('nav a').forEach((x) => (x.dataset.tab === key ? x.setAttribute('aria-current', 'page') : x.removeAttribute('aria-current')));
  try { $('#view').innerHTML = VIEWS[key](a, b); }
  catch (e) { console.error(e); $('#view').innerHTML = empty(`This page hit an error: ${esc(e.message)}. The other pages still work.`); }
  $('nav a[aria-current]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  bind(key, a, b);
}
function bind(key, a) {
  const segs = document.querySelectorAll('#view .seg');
  const on = (i, fn) => segs[i]?.querySelectorAll('button').forEach((btn) => btn.addEventListener('click', () => fn(btn.dataset.v)));
  if (key === 'power') requestAnimationFrame(() => requestAnimationFrame(() => $('#field')?.classList.remove('pre')));
  if (key === 'standings') on(0, (v) => { standMode = v; route(); });
  if (key === 'seasons') on(0, (v) => (location.hash = `seasons/${v}`));
  if (key === 'fun') on(0, (v) => { funScope = v; route(); });
  if (key === 'drafts') { on(0, (v) => (location.hash = `drafts/${v}`)); const i = $('#dq'); i?.addEventListener('input', () => { draftQ = i.value; draftSearch(); }); draftSearch(); }
  if (key === 'h2h') {
    on(0, (v) => { h2hKind = v; route(); });
    const go = () => (location.hash = `h2h/${encodeURIComponent($('#h1').value)}/${encodeURIComponent($('#h2').value)}`);
    $('#h1')?.addEventListener('change', go); $('#h2')?.addEventListener('change', go);
  }
  if (key === 'trades') {
    const hasLb = !!$('.larceny') || segs.length > 1;
    if (segs.length > 1) { on(0, (v) => { tradeMetric = v; route(); }); on(1, (v) => { moveType = v; route(); }); }
    else on(0, (v) => { moveType = v; route(); });
    void hasLb;
    $('#mvSeason')?.addEventListener('change', (e) => { moveSeason = e.target.value; route(); });
    $('#mvMgr')?.addEventListener('change', (e) => { moveMgr = e.target.value; route(); });
  }
}
window.addEventListener('hashchange', () => { route(); $('#view').focus({ preventScroll: true }); window.scrollTo(0, 0); });

async function start() {
  const status = (t) => { $('#leagueSub').textContent = t + '…'; };
  try {
    M = await loadEverything(window.LEAGUE_CONFIG.leagueId, status);
  } catch (e) {
    $('#leagueSub').textContent = '';
    $('#view').innerHTML = empty(`Couldn't reach Sleeper: ${esc(e.message)}. Check your connection and refresh. If it keeps happening, Sleeper may be down.`);
    return;
  }
  const s = cur();
  document.title = s.name; $('#leagueName').textContent = s.name;
  const done = s.status === 'complete' ? 'Season complete.' : s.lastScored ? `Final through week ${s.lastScored}.` : s.weeks.length ? 'Week 1 in progress.' : 'Season not started.';
  $('#leagueSub').textContent = `${s.season} season. ${done} Live from Sleeper.`;
  route();
}
start();
