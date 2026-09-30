(() => {
const DATA = window.__DATA;
/* ---------- 전 종목(미국 지수 편입·상장주, 국내 코스피·코스닥) 합치기 ---------- */
const NCHUNK = DATA.universe ? DATA.universe.nchunk : 96;
function chunkOf(t) { let h = 0; for (const ch of t) h = (h * 31 + ch.codePointAt(0)) % 1000003; return h % NCHUNK; }
(function mergeUniverse() {
  const U = DATA.universe; if (!U) return;
  const C = {}; U.cols.forEach((c, i) => C[c] = i);
  const byT = Object.fromEntries(DATA.stocks.map(s => [s.t, s]));
  const isoD = x => x ? `${x.slice(0, 4)}-${x.slice(4, 6)}-${x.slice(6, 8)}` : null;
  const COL = DATA.sector_colors || {};
  for (const r of U.rows) {
    const g = k => r[C[k]], t = g("t");
    const spv = [...(g("sp") || "")].map(ch => ch.codePointAt(0) - 48);
    const ex = byT[t];
    if (ex) {   // 이미 있는 종목(저평가·선별): 지수 편입·업종·기간 범위만 보탬
      ex.idx = g("ix") || []; ex.ind = g("i"); ex.chunk = chunkOf(t); if (!/[A-Za-z]/.test(ex.name) || ex.mkt === "US") ex.en = g("n");
      if (ex.lo == null && g("lo") != null) { ex.lo = g("lo"); ex.hi = g("hi"); ex.rd = isoD(g("rd")); }
      if (ex.mkt === "KR" && g("tv") != null && isoD(g("d")) === ex.qdate) ex.tvFixed = g("tv");
      if (ex.mkt === "KR" && ex.mcap == null && g("mc")) ex.mcap = g("mc");
      continue;
    }
    const p = g("p"), pp = g("pp"), cur = g("cur"), mc = g("mc");
    DATA.stocks.push({ t, name: g("n"), mkt: g("m"), cur, ex: g("x"), major: g("s") || "기타", sub: g("i") || g("x"), ind: g("i"),
      desc: g("prod") ? `주요 제품: ${g("prod")}` : (g("i") || ""), price: p, qdate: isoD(g("d")), ref_date: isoD(g("pd")),
      dchg: pp ? p / pp - 1 : null, diff: pp ? p - pp : null, vol: g("v"), va: g("va"), tvFixed: g("tv"),
      mcap: mc == null ? null : cur === "USD" ? mc / 1e9 : mc, hi: g("hi"), lo: g("lo"), rd: isoD(g("rd")),
      off52: g("hi") ? p / g("hi") - 1 : null, spv, idx: g("ix") || [], research: false, univ: true, grade: null, rating: "—",
      chunk: chunkOf(t), color: COL[g("s")] || "78909C", lineOnly: g("m") === "US" });
  }
  DATA.universe = { nchunk: U.nchunk, last: U.last };
})();
/* 상세 화면에서 필요할 때만 그 종목의 일봉 묶음을 불러옴 */
const HCACHE = {}, HWAIT = {};
window.__HC = (k, obj) => { HCACHE[k] = obj; (HWAIT[k] || []).forEach(f => f.ok()); delete HWAIT[k]; };
window.__loadHist = t => new Promise((ok, bad) => {
  const k = chunkOf(t), done = () => {
    const rows = (HCACHE[k] || {})[t] || [];
    ok(rows.map(r => r.length >= 5 ? r : [r[0], r[1], r[1], r[1], r[1], r[2] || 0]));
  };
  if (HCACHE[k]) return done();
  const first = !HWAIT[k]; (HWAIT[k] = HWAIT[k] || []).push({ ok: done, bad });
  if (!first) return;
  const sc = document.createElement("script"); sc.src = `hchunks/${String(k).padStart(2, "0")}.js`;
  const fail = () => { const w = HWAIT[k] || []; delete HWAIT[k]; sc.remove(); w.forEach(f => f.bad(new Error("차트 자료를 불러오지 못함"))); };
  sc.onerror = fail; setTimeout(() => { if (HWAIT[k]) fail(); }, 15000);
  document.head.appendChild(sc);
});

const $ = s => document.querySelector(s);
const S = DATA.stocks, BY = Object.fromEntries(S.map(s => [s.t, s]));
const IX = DATA.indices || [], IBY = Object.fromEntries(IX.map(x => [x.sym, x]));
const COLORS = DATA.sector_colors, SECTORS = Object.keys(COLORS).filter(k => S.some(s => s.major === k));
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};
const F0 = { up: -30, pe: 60, div: 0, off: 0 };
const state = { tab: LS.get("wl-tab", "home"), q: "", scen: "", sort: "tv", grades: new Set(["A","B","C"]), sectors: new Set(),
  view: LS.get("wl-view2", "rows"), mkt: "all", ix: "", limit: 100, hm: LS.get("wl-hm", "KR"), f: { ...F0 }, list: [], cur: null, curKind: "stock", best: LS.get("wl-best", "up"),
  range: LS.get("wl-range", "all"), ma: LS.get("wl-ma", { 5: true, 20: true, 60: true }), ctype: LS.get("wl-ctype", "candle") };
document.documentElement.dataset.updown = LS.get("wl-updown", "kr");

/* ---------- 형식 ---------- */
const iso = n => { const s = String(n); return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`; };
const md = d => d ? `${+d.slice(5,7)}/${+d.slice(8,10)}` : "";
const days = (a, b) => Math.round((new Date(a) - new Date(b)) / 864e5);
const fmtUsd = v => v == null ? "—" : (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (v, cur) => v == null ? "—" : cur === "KRW" ? (v < 0 ? "-" : "") + Math.round(Math.abs(v)).toLocaleString("ko-KR") + "원" : fmtUsd(v);
const M = (s, v) => money(v, s.cur);
const fmtBigKr = v => v == null ? "—" : v >= 1e12 ? (v / 1e12).toFixed(2) + "조원" : v >= 1e8 ? Math.round(v / 1e8).toLocaleString("ko-KR") + "억원" : Math.round(v / 1e4).toLocaleString("ko-KR") + "만원";
const tvFmt = s => s.tv == null ? '<span class="na">—</span>' : s.cur === "KRW" ? fmtBigKr(s.tv) : "$" + fmtBig(s.tv);
const fmtNum = (v, d = 2) => v == null ? "—" : v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtKrw = v => v == null ? "—" : (v < 0 ? "-" : "") + Math.round(Math.abs(v)).toLocaleString("ko-KR") + "원";
const cls = v => v == null ? "" : v > 0.00005 ? "pos" : v < -0.00005 ? "neg" : "";
const fmtPct = (v, sign = true, d = 1) => v == null ? '<span class="na">—</span>' : `<span class="${cls(v)}">${sign && v > 0 ? "+" : ""}${(v * 100).toFixed(d)}%</span>`;
const fmtChg = v => v == null ? '<span class="na">—</span>' : `<span class="${cls(v)}">${v > 0 ? "+" : ""}${(v * 100).toFixed(2)}%</span>`;
const fmtX = v => v == null ? '<span class="na">—</span>' : v.toFixed(1) + "배";
const fmtDiv = v => v == null ? '<span class="na">무배당</span>' : (v * 100).toFixed(1) + "%";
const fmtCap = (v, cur) => v == null ? "—" : cur === "KRW" ? (v >= 1e12 ? (v / 1e12).toFixed(1) + "조원" : Math.round(v / 1e8).toLocaleString("ko-KR") + "억원") : v >= 1000 ? "$" + (v / 1000).toFixed(2) + "조" : "$" + v.toFixed(1) + "B";
const fmtBig = v => v == null ? "—" : v >= 1e9 ? (v / 1e9).toFixed(2) + "B" : v >= 1e6 ? (v / 1e6).toFixed(1) + "M" : v >= 1e3 ? (v / 1e3).toFixed(0) + "K" : String(v);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 3.2l2.6 5.5 6 .7-4.4 4.1 1.1 6-5.3-3-5.3 3 1.1-6-4.4-4.1 6-.7z"/></svg>';
const STAR_O = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" d="M12 3.2l2.6 5.5 6 .7-4.4 4.1 1.1 6-5.3-3-5.3 3 1.1-6-4.4-4.1 6-.7z"/></svg>';
const latestOf = mkt => mkt === "KR" ? (DATA.kr_date || DATA.quote_date) : DATA.quote_date;
const stale = s => days(latestOf(s.mkt), s.qdate) > 3;
const refLabel = s => !s.ref_date ? "" : days(s.qdate, s.ref_date) <= 4 ? "전일 대비" : `${md(s.ref_date)} 대비`;
const krw = () => (IBY["KRW=X"] || {}).price || null;
const IXNAME = { SP500: "S&P 500", NDX: "나스닥 100", SP400: "S&P 400", SP600: "S&P 600", R1000: "러셀 1000", R2000: "러셀 2000", K200: "코스피 200", KQ150: "코스닥 150", ETF: "ETF" };
const rangeLbl = s => { const d = s.rd ? days(s.qdate, s.rd) : 365; return d >= 330 ? "52주" : `${Math.max(1, Math.round(d / 30))}개월`; };
/* 종목별 파생 값: 거래량·거래대금·평소 대비 거래량 */
S.forEach(s => {
  const h = s.h || [], last = h[h.length - 1];
  if (s.vol === undefined) s.vol = last && last.length > 5 && iso(last[0]) === s.qdate ? last[5] : null;
  s.tv = s.tvFixed != null ? s.tvFixed : s.vol != null ? s.vol * s.price : null;
  s.mkt = s.mkt || "US"; s.cur = s.cur || "USD";
  if (s.major === "ETF" && !(s.idx || []).includes("ETF")) s.idx = [...(s.idx || []), "ETF"];
  const prev = h.slice(-21, -1).map(r => r[5]).filter(v => v > 0);
  const avgv = s.va != null ? s.va : prev.length >= 10 ? prev.reduce((a, b) => a + b, 0) / prev.length : null;
  s.vratio = s.vol != null && avgv ? s.vol / avgv : null;
  s.pos52 = s.lo != null && s.hi != null && s.hi > s.lo ? (s.price - s.lo) / (s.hi - s.lo) : null;
});
S.forEach(s => { s.tvk = s.tv == null ? null : s.cur === "USD" ? s.tv * ((IBY["KRW=X"] || {}).price || 1350) : s.tv; });

/* ---------- 내 기록(관심·희망가·평단·수량·메모) ---------- */
const Store = { mode: "local", data: LS.get("wl-my", {}), pf: LS.get("wl-pf", null), col: null, timers: {}, chains: {}, pending: {}, err: "" };
async function savePf(pf) {
  Store.pf = pf; LS.set("wl-pf", pf);
  if (!Store.col) return true;
  try { await (pf ? Store.col.doc("_portfolio").set(pf) : Store.col.doc("_portfolio").delete()); return true; }
  catch (e) { return false; }
}
const my = t => Store.data[t] || {};
const isEmpty = o => !o || (!o.star && o.buy == null && o.cost == null && o.qty == null && !String(o.memo || "").trim());
const sleep = ms => new Promise(r => setTimeout(r, ms));
function setMy(t, patch) {
  Store.data[t] = { ...my(t), ...patch };
  if (isEmpty(Store.data[t])) delete Store.data[t];
  LS.set("wl-my", Store.data);
  queueWrite(t);
}
function queueWrite(t) {
  if (!Store.col) return;
  clearTimeout(Store.timers[t]);
  Store.timers[t] = setTimeout(() => {
    delete Store.timers[t];
    Store.chains[t] = (Store.chains[t] || Promise.resolve()).then(async () => {
      Store.pending[t] = true;
      const o = Store.data[t], ref = Store.col.doc(t);
      const body = o ? { star: !!o.star, buy: o.buy ?? null, cost: o.cost ?? null, qty: o.qty ?? null, memo: String(o.memo || "").slice(0, 4000), ts: Date.now() } : null;
      const run = () => body ? ref.set(body) : ref.delete();
      try { await run(); flash("저장됨"); }
      catch (e) {
        if (e && e.code === "unavailable") { await sleep(700 + Math.random() * 800); try { await run(); flash("저장됨"); return; } catch (e2) {} }
        Store.mode = "local"; Store.col = null; Store.err = "fail"; status();
      } finally { Store.pending[t] = false; }
    });
  }, 700);
}
function flash(msg) { const el = $("#savedmsg"); if (el) el.textContent = msg + " · " + new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }); }
function status() {
  const el = $("#store"); if (!el) return;
  el.className = "pill" + (Store.mode === "db" ? " ok" : "");
  el.innerHTML = `<span class="d"></span>${Store.mode === "db" ? "내 계정 (다른 기기에서도 보임)" : Store.err === "fail" ? "계정 저장 실패 · 이 기기에만 저장 중" : "이 기기에 저장"}`;
}
let savePfLater = null;
async function initDb() {
  if (!window.claude || typeof window.claude.use !== "function") return;
  try {
    const [db, user] = await Promise.all([window.claude.use("db"), window.claude.use("user")]);
    if (!db || !user) return;
    const uid = await user.id(); if (!uid) return;
    const col = db.collection("data/users/" + uid);
    let first = true;
    col.onSnapshot(snap => {
      const remote = {};
      let rpf;
      snap.docs.forEach(d => { if (!d.exists) return; const b = d.data() || {};
        if (d.id === "_portfolio") { rpf = JSON.parse(JSON.stringify(b)); return; }
        remote[d.id] = { star: !!b.star, buy: b.buy ?? null, cost: b.cost ?? null, qty: b.qty ?? null, memo: b.memo || "" }; });
      if (rpf) { Store.pf = rpf; LS.set("wl-pf", rpf); } else if (first && Store.pf) { savePfLater = Store.pf; }
      if (first) {
        first = false; Store.col = col; Store.mode = "db"; Store.err = "";
        const localOnly = Object.keys(Store.data).filter(t => !remote[t] && !isEmpty(Store.data[t]) && BY[t]);
        Store.data = { ...Store.data, ...remote };
        localOnly.forEach(queueWrite);
        if (savePfLater) { const x = savePfLater; savePfLater = null; savePf(x); }
      } else {
        for (const t in remote) if (!Store.timers[t] && !Store.pending[t]) Store.data[t] = remote[t];
        for (const t in Store.data) if (!remote[t] && !Store.timers[t] && !Store.pending[t]) delete Store.data[t];
        if (!rpf) { Store.pf = null; LS.set("wl-pf", null); }
      }
      LS.set("wl-my", Store.data);
      status(); renderAll(); syncDrawerStar();
    }, () => { Store.mode = "local"; Store.col = null; Store.err = "fail"; status(); });
  } catch (e) { /* 계정 저장을 쓸 수 없으면 기기 저장으로 계속 */ }
}

/* ---------- 공통 조각 ---------- */
function spark(h, cls2 = "spark", n = 60) {
  if (!h || h.length < 2) return "";
  const cs = (typeof h[0] === "number" ? h : h.map(r => r[4])).slice(-n), mn = Math.min(...cs), mx = Math.max(...cs), rg = mx - mn || 1, W = 100, H = 30;
  const pts = cs.map((c, i) => `${(i / (cs.length - 1) * W).toFixed(1)},${(H - 2 - (c - mn) / rg * (H - 4)).toFixed(1)}`).join(" ");
  const up = cs[cs.length - 1] >= cs[0];
  return `<svg class="${cls2}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="var(${up ? "--up" : "--down"})" stroke-width="1.8" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`;
}
function logo(s, sm) {
  const st = my(s.t).star ? '<span class="st">★</span>' : "";
  const txt = s.mkt === "KR" ? (/^[A-Za-z&]+/.test(s.name) ? s.name.match(/^[A-Za-z&]+/)[0].slice(0, 4) : s.name.slice(0, 2)) : s.t.length > 4 ? s.t.slice(0, 4) : s.t;
  return `<span class="logo${sm ? " sm" : ""}" style="background:#${s.color}" aria-hidden="true">${esc(txt)}${st}</span>`;
}
function periodRet(h) { if (!h || h.length < 2) return null; const c = x => typeof x === "number" ? x : x[4]; return c(h[h.length - 1]) / c(h[0]) - 1; }
function lateBadge(s) { return stale(s) ? `<span class="badge warn">${md(s.qdate)} 기준</span>` : ""; }
/* 종목 한 줄. right: 오른쪽 둘째 줄을 바꿀 때 사용 */
function rowItem(s, o = {}) {
  const m = my(s.t), hit = m.buy && s.price <= m.buy;
  const sub = o.sub ?? `${s.grade ? `<span class="grade g-${s.grade}">${s.grade}</span>` : `<span class="badge">${esc(s.ex || "")}</span>`}<span>${esc(s.major)}</span>${hit ? '<span class="hit">희망가 도달</span>' : ""}${s.note ? '<span class="badge alert">인수 진행</span>' : ""}${lateBadge(s)}`;
  return `<div class="rw${o.rank ? "" : " norank"}" data-open="${esc(s.t)}" role="button" tabindex="0" aria-label="${esc(s.name)} 상세">
    <span class="rk">${o.rank || ""}</span>${logo(s)}
    <div class="nm"><div class="n">${esc(s.name)}</div><div class="s">${sub}</div></div>
    <div class="rp"><span class="p">${M(s, s.price)}</span><span class="c">${o.right ?? fmtChg(s.dchg)}</span></div>
  </div>`;
}
function empty(msg, btn) { return `<div class="empty"><div>${msg}</div>${btn || ""}</div>`; }

/* ---------- 홈 ---------- */
const BEST = {
  up:   { label: "상승률", liq: true, pick: s => s.dchg, dir: -1, same: true, right: s => fmtChg(s.dchg) },
  down: { label: "하락률", liq: true, pick: s => s.dchg, dir: 1, same: true, right: s => fmtChg(s.dchg) },
  tv:   { label: "거래대금", pick: s => s.tvk, dir: -1, same: true, right: s => `<span class="na">${tvFmt(s)}</span>` },
  vol:  { label: "거래량 급증", liq: true, pick: s => s.vratio, dir: -1, same: true, right: s => `<span class="pos">평소 ${s.vratio.toFixed(1)}배</span>` },
  upside: { label: "목표가 여력", pick: s => s.note ? null : s.upside, dir: -1, right: s => fmtPct(s.upside) },
  low:  { label: "52주 저점 근처", pick: s => s.pos52, dir: 1, right: s => `<span class="na">저점 +${((s.price / s.lo - 1) * 100).toFixed(1)}%</span>` },
  div:  { label: "고배당", pick: s => s.div, dir: -1, right: s => `<span class="na">배당 ${(s.div * 100).toFixed(1)}%</span>` },
};
const pool = () => S.filter(s => s.mkt === state.hm);
const recent = s => days(latestOf(s.mkt), s.qdate) <= 4;
const bestList = (k, n) => {
  const b = BEST[k];
  return pool().filter(s => b.pick(s) != null && (!b.same || recent(s)) && (!b.liq || (s.tvk || 0) >= 1e9)).sort((a, c) => (b.pick(a) - b.pick(c)) * b.dir).slice(0, n);
};
function renderIdx() {
  $("#idx").innerHTML = IX.map(x => {
    const late = days(DATA.quote_date, x.qdate) > 3;
    return `<button type="button" class="ic" data-idx="${esc(x.sym)}">
      <span class="n">${esc(x.short)}<i>${late ? md(x.qdate) : esc(x.region)}</i></span>
      <span class="v">${fmtNum(x.price, x.price < 100 ? 2 : 2)}${x.unit === "%" ? "%" : ""}</span>
      <span class="c ${cls(x.dchg)}">${x.diff > 0 ? "+" : ""}${fmtNum(x.diff, x.price < 100 ? 3 : 2)} (${(x.dchg * 100).toFixed(2)}%)</span>
      ${spark(x.h, "spark", 60)}</button>`;
  }).join("");
}
function renderHome() {
  const same = pool().filter(s => recent(s) && s.dchg != null), ld = latestOf(state.hm);
  document.querySelectorAll("#hm button").forEach(b => b.setAttribute("aria-pressed", b.dataset.hm === state.hm));
  $("#hmsub").textContent = state.hm === "KR" ? `코스피·코스닥 ${pool().length}종목 · ${md(ld)} 종가` : `미국 ${pool().length}종목(저평가 추천 포함) · ${md(ld)} 종가`;
  const up = same.filter(s => s.dchg > 0.00005).length, dn = same.filter(s => s.dchg < -0.00005).length, fl = same.length - up - dn;
  const avg = same.reduce((a, s) => a + s.dchg, 0) / (same.length || 1);
  $("#brsub").textContent = `${md(ld)} 전후 종가 · ${same.length}종목`;
  $("#breadth").innerHTML = `<div class="blbl"><span>상승 <b class="pos">${up}</b></span><span>보합 <b>${fl}</b></span><span>하락 <b class="neg">${dn}</b></span></div>
    <div class="bbar"><i style="width:${up / (same.length || 1) * 100}%;background:var(--up)"></i><i style="width:${fl / (same.length || 1) * 100}%;background:var(--surface-3)"></i><i style="width:${dn / (same.length || 1) * 100}%;background:var(--down)"></i></div>
    <div class="blbl"><span>평균 등락 ${fmtChg(avg)}</span><span>상승 1위 ${esc(bestList("up", 1)[0]?.name || "")}</span></div>`;
  $("#bestsub").textContent = `${md(ld)} 종가 기준 · 실시간 아님`;
  $("#bestchips").innerHTML = Object.entries(BEST).map(([k, b]) => `<button type="button" class="chip" data-best="${k}" aria-pressed="${state.best === k}">${b.label}</button>`).join("");
  const bl = bestList(state.best, 10);
  $("#best").innerHTML = bl.length ? bl.map((s, i) => rowItem(s, { rank: i + 1, right: BEST[state.best].right(s) })).join("") : empty("해당하는 종목이 없습니다.");
  // 섹터 등락
  $("#secs").innerHTML = SECTORS.map(k => {
    const arr = same.filter(s => s.major === k); if (!arr.length) return "";
    const a = arr.reduce((x, s) => x + s.dchg, 0) / arr.length;
    const top = [...arr].sort((x, y) => y.dchg - x.dchg)[0];
    const pct = Math.min(60, Math.abs(a) * 100 * 18 + 8);
    const bg = a > 0.00005 ? `color-mix(in srgb, var(--up) ${pct}%, var(--surface))` : a < -0.00005 ? `color-mix(in srgb, var(--down) ${pct}%, var(--surface))` : "var(--surface-2)";
    return `<button type="button" class="sec" data-sec="${esc(k)}" style="background:${bg}"><span class="n">${esc(k)}</span><span class="c">${a > 0 ? "+" : ""}${(a * 100).toFixed(2)}%</span><span class="s">${arr.length}종목 · 1위 ${esc(top.name)}</span></button>`;
  }).join("");
  const stars = S.filter(s => my(s.t).star).sort((a, b) => (b.dchg ?? -9) - (a.dchg ?? -9));
  $("#homestar").innerHTML = stars.length ? stars.slice(0, 5).map(s => rowItem(s)).join("")
    : empty("관심 종목을 추가하면 여기서 바로 볼 수 있어요.", `<button type="button" class="btn" data-go="stocks">종목 둘러보기</button>`);
}

/* ---------- 종목 탭 ---------- */
function chips() {
  $("#chips").innerHTML = `<button type="button" class="chip" data-s="" aria-pressed="${state.sectors.size === 0}">전체</button>` +
    SECTORS.map(k => `<button type="button" class="chip" data-s="${esc(k)}" aria-pressed="${state.sectors.has(k)}"><span class="dot" style="background:#${COLORS[k]}"></span>${esc(k)}</button>`).join("");
}
function fLabels() {
  const f = state.f;
  $("#fu-v").textContent = f.up <= F0.up ? "제한 없음" : (f.up > 0 ? "+" : "") + f.up + "% 이상";
  $("#fp-v").textContent = f.pe >= F0.pe ? "제한 없음" : f.pe + "배 이하";
  $("#fd-v").textContent = f.div <= 0 ? "제한 없음" : f.div + "% 이상";
  $("#fo-v").textContent = f.off <= 0 ? "제한 없음" : "−" + f.off + "% 이상 하락";
  const n = (f.up > F0.up) + (f.pe < F0.pe) + (f.div > 0) + (f.off > 0);
  $("#fbtn").textContent = n ? `조건 필터 (${n})` : "조건 필터"; $("#fbtn").classList.toggle("on", n > 0);
}
function filtered() {
  const q = state.q.trim().toLowerCase(), f = state.f;
  const arr = S.filter(s => {
    if (state.mkt === "KR" && s.mkt !== "KR") return false;
    if (state.mkt === "US" && s.mkt !== "US") return false;
    if (state.mkt === "res" && !s.research) return false;
    if (state.ix && !(s.idx || []).includes(state.ix)) return false;
    if (s.grade ? !state.grades.has(s.grade) : state.grades.size < 3) return false;
    if (state.scen && s.scen !== state.scen) return false;
    if (state.sectors.size && !state.sectors.has(s.major)) return false;
    if (f.up > F0.up && !(s.upside != null && s.upside * 100 >= f.up)) return false;
    if (f.pe < F0.pe && !(s.fpe != null && s.fpe <= f.pe)) return false;
    if (f.div > 0 && !((s.div || 0) * 100 >= f.div)) return false;
    if (f.off > 0 && !(s.off52 != null && -s.off52 * 100 >= f.off)) return false;
    if (q && ![s.t, s.name, s.en, s.major, s.sub, s.desc, s.rev, s.thesis, my(s.t).memo].join(" ").toLowerCase().includes(q)) return false;
    return true;
  });
  const go = { A: 0, B: 1, C: 2 }, nz = (v, d) => v == null ? d : v;
  const gap = s => { const b = my(s.t).buy; return b ? s.price / b - 1 : 99; };
  const cmp = {
    grade: (a, b) => (go[a.grade] ?? 3) - (go[b.grade] ?? 3) || nz(b.upside, -9) - nz(a.upside, -9),
    upside: (a, b) => nz(b.upside, -9) - nz(a.upside, -9),
    msdisc: (a, b) => nz(b.msdisc, -9) - nz(a.msdisc, -9),
    dchg: (a, b) => nz(b.dchg, -9) - nz(a.dchg, -9),
    dchg_lo: (a, b) => nz(a.dchg, 9) - nz(b.dchg, 9),
    tv: (a, b) => nz(b.tvk, -1) - nz(a.tvk, -1),
    off52: (a, b) => nz(a.off52, 9) - nz(b.off52, 9),
    div: (a, b) => nz(b.div, -1) - nz(a.div, -1),
    fpe: (a, b) => nz(a.fpe, 9999) - nz(b.fpe, 9999),
    mcap: (a, b) => nz(b.mcap, 0) - nz(a.mcap, 0),
    chg: (a, b) => nz(b.chg, -9) - nz(a.chg, -9),
    buygap: (a, b) => gap(a) - gap(b),
  }[state.sort] || (() => 0);
  return arr.sort(cmp);
}
let obs = null;
function moreObs() {
  if (!("IntersectionObserver" in window)) return;
  if (!obs) obs = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting) && state.tab === "stocks") { state.limit += 100; renderStocks(); } }, { rootMargin: "600px" });
  obs.disconnect(); const b = $("#more"); if (b) obs.observe(b);
}
function mineLine(s) {
  const m = my(s.t), out = [];
  if (m.buy) { const g = s.price / m.buy - 1; out.push(g <= 0 ? `<span class="hit">매수 희망가 ${M(s, m.buy)} 도달</span>` : `매수 희망가 ${M(s, m.buy)}까지 <b>${(g * 100).toFixed(1)}%</b>`); }
  if (m.qty > 0 && m.cost) out.push(`보유 ${m.qty}주 · 손익 ${fmtPct(s.price / m.cost - 1)} (${M(s, (s.price - m.cost) * m.qty)})`);
  if (m.memo) out.push(`<span class="memo">메모: ${esc(m.memo)}</span>`);
  return out.length ? `<div class="mine">${out.map(x => `<div>${x}</div>`).join("")}</div>` : "";
}
function card(s) {
  const hh = s.h || s.spv || [], pr = periodRet(hh);
  return `<article class="card" data-open="${esc(s.t)}">
    <div class="chead">${logo(s)}<div style="min-width:0"><div class="n">${esc(s.name)}</div><div class="s">${esc(s.t)} · ${esc(s.sub)}</div></div>${s.grade ? `<span class="grade g-${s.grade}" title="종합등급">${s.grade}</span>` : `<span class="badge">${esc(s.ex)}</span>`}</div>
    <div class="px"><div><div class="big">${M(s, s.price)}</div><div class="chg">${fmtChg(s.dchg)} <span class="na" style="font-size:12px">${refLabel(s)}</span></div>
      <div class="asof">${md(s.qdate)} 종가 ${lateBadge(s)}${s.note ? '<span class="badge alert">인수 진행</span>' : ""}</div></div>
      <div style="display:grid;justify-items:end;gap:2px">${spark(hh)}<span class="na" style="font-size:11.5px">${hh.length}일 ${pr == null ? "" : fmtPct(pr)}</span></div></div>
    <p class="desc">${esc(s.desc)}</p>
    <div class="mets">
      <div class="m"><span class="k">목표가 여력</span><span class="v">${fmtPct(s.upside)}</span></div>
      <div class="m"><span class="k">모닝스타 할인</span><span class="v">${fmtPct(s.msdisc, false)}</span></div>
      <div class="m"><span class="k">예상 PER</span><span class="v">${fmtX(s.fpe)}</span></div>
      <div class="m"><span class="k">배당</span><span class="v">${fmtDiv(s.div)}</span></div>
      <div class="m"><span class="k">52주 고점比</span><span class="v">${fmtPct(s.off52)}</span></div>
      <div class="m"><span class="k">거래대금</span><span class="v">${tvFmt(s)}</span></div>
    </div>
    ${mineLine(s)}
  </article>`;
}
const TCOLS = [["t", "종목"], ["grade", "등급", "", "grade"], ["price", "현재가", "r"], ["dchg", "등락률", "r", "dchg"], ["tv", "거래대금", "r", "tv"],
  ["upside", "목표가 여력", "r", "upside"], ["msdisc", "모닝스타 할인", "r", "msdisc"], ["fpe", "예상 PER", "r", "fpe"], ["div", "배당", "r", "div"],
  ["off52", "52주 고점比", "r", "off52"], ["chg", "지난주 대비", "r", "chg"], ["spark", "추이"], ["scen", "시나리오"]];
function table(arr) {
  const th = TCOLS.map(([k, h, c, so]) => `<th class="${c || ""}" ${so ? `data-sort="${so}"` : ""} ${state.sort === so ? 'aria-sort="descending"' : ""}>${h}</th>`).join("");
  const rows = arr.map(s => `<tr data-open="${esc(s.t)}">
    <td><div style="display:flex;gap:10px;align-items:center">${logo(s, true)}<div><b>${esc(s.name)}</b><div class="na" style="font-size:12px">${esc(s.mkt === "KR" ? s.ex + " " + s.t : s.t)} · ${esc(s.major)}</div></div></div></td>
    <td>${s.grade ? `<span class="grade g-${s.grade}">${s.grade}</span>` : `<span class="badge">${esc(s.ex)}</span>`}</td>
    <td class="r"><b>${M(s, s.price)}</b><div class="na" style="font-size:11px">${md(s.qdate)}</div></td>
    <td class="r">${fmtChg(s.dchg)}</td><td class="r">${tvFmt(s)}</td><td class="r">${fmtPct(s.upside)}</td>
    <td class="r">${fmtPct(s.msdisc, false)}</td><td class="r">${fmtX(s.fpe)}</td>
    <td class="r">${s.div == null ? '<span class="na">—</span>' : (s.div * 100).toFixed(1) + "%"}</td>
    <td class="r">${fmtPct(s.off52)}</td><td class="r">${fmtPct(s.chg)}</td><td style="width:80px">${spark(s.h || s.spv, "spark", 60).replace('class="spark"', 'class="spark" style="width:72px;height:26px"')}</td><td>${esc(s.scen)}</td></tr>`).join("");
  return `<div class="tablewrap"><table><thead><tr>${th}</tr></thead><tbody>${rows}</tbody></table></div>`;
}
function renderStocks() {
  let arr = filtered();
  state.list = arr.map(s => s.t);
  const total = arr.length; arr = arr.slice(0, state.limit);
  $("#count").textContent = `${total.toLocaleString("ko-KR")}개 종목`;
  const active = state.q || state.ix || state.scen || state.sectors.size || state.grades.size < 3 || JSON.stringify(state.f) !== JSON.stringify(F0);
  $("#reset").hidden = !active;
  const rights = { tv: s => `<span class="na">${tvFmt(s)}</span>`, upside: s => fmtPct(s.upside), msdisc: s => `<span class="na">할인 ${s.msdisc == null ? "—" : (s.msdisc * 100).toFixed(1) + "%"}</span>`,
    div: s => `<span class="na">배당 ${s.div == null ? "—" : (s.div * 100).toFixed(1) + "%"}</span>`, fpe: s => `<span class="na">PER ${s.fpe == null ? "—" : s.fpe.toFixed(1)}</span>`,
    off52: s => fmtPct(s.off52), chg: s => `<span class="na">주간</span> ${fmtPct(s.chg)}`, mcap: s => `<span class="na">${fmtCap(s.mcap, s.cur)}</span>` };
  const rf = rights[state.sort];
  $("#list").innerHTML = !arr.length ? `<div class="box">${empty("조건에 맞는 종목이 없습니다. 필터를 넓혀 보세요.")}</div>`
    : state.view === "card" ? `<div class="grid">${arr.map(card).join("")}</div>`
    : state.view === "table" ? table(arr)
    : `<div class="box tight"><div class="rows">${arr.map(s => rowItem(s, rf ? { right: rf(s) } : {})).join("")}</div></div>`;
  if (total > arr.length) $("#list").insertAdjacentHTML("beforeend", `<button type="button" class="btn" id="more" style="width:100%;margin-top:10px">더 보기 (${(total - arr.length).toLocaleString("ko-KR")}개 남음)</button>`);
  moreObs();
  document.querySelectorAll("#view button").forEach(b => b.setAttribute("aria-pressed", b.dataset.v === state.view));
  document.querySelectorAll("#mkt button").forEach(b => b.setAttribute("aria-pressed", b.dataset.mk === state.mkt));
  const IXL = [["", "모든 지수"], ["SP500", "S&P 500"], ["NDX", "나스닥 100"], ["SP400", "S&P 400"], ["SP600", "S&P 600"], ["R1000", "러셀 1000"], ["R2000", "러셀 2000"], ["K200", "코스피 200"], ["KQ150", "코스닥 150"], ["ETF", "ETF"]]
    .filter(([k]) => !k || S.some(s => (s.idx || []).includes(k)));
  $("#ixchips").hidden = IXL.length < 3;
  $("#ixchips").innerHTML = IXL.map(([k, l]) => `<button type="button" class="chip" data-ixc="${k}" aria-pressed="${state.ix === k}">${l}</button>`).join("");
  $("#ixf").value = state.ix;
  const nAct = (state.ix ? 1 : 0) + (state.scen ? 1 : 0) + (state.grades.size < 3 ? 1 : 0) + (JSON.stringify(state.f) !== JSON.stringify(F0) ? 1 : 0) + (state.sort !== "tv" ? 1 : 0);
  $("#obtn").textContent = nAct ? `필터·정렬 ${nAct}` : "필터·정렬";
  $("#sort").value = state.sort;
}

/* ---------- 관심 · 내 투자 · 더보기 ---------- */
function renderStar() {
  const stars = S.filter(s => my(s.t).star).sort((a, b) => (b.dchg ?? -9) - (a.dchg ?? -9));
  $("#starsub").textContent = stars.length ? `${stars.length}개 · 등락률 순` : "";
  $("#starlist").innerHTML = stars.length ? stars.map(s => {
    const m = my(s.t); const sub = m.buy ? (s.price <= m.buy ? '<span class="hit">매수 희망가 도달</span>' : `희망가 ${M(s, m.buy)}까지 ${((s.price / m.buy - 1) * 100).toFixed(1)}%`) : m.memo ? esc(m.memo) : undefined;
    return rowItem(s, sub ? { sub } : {});
  }).join("") : empty("아직 관심 종목이 없어요.<br>종목 화면에서 ☆를 누르면 여기에 모입니다.", `<button type="button" class="btn prim" data-go="stocks">종목 둘러보기</button>`);
  if (!stars.length) state.starList = []; else state.starList = stars.map(s => s.t);
}

/* ---------- 내 투자: 캡처로 가져온 계좌 + 직접 입력 ---------- */
let SAMPLE = null, SAMPLE_IMG = null, IMP = { busy: false, ctl: null, preview: null, err: "" };
async function initSample() {
  if (!window.claude || typeof window.claude.use !== "function") return;
  try { SAMPLE = await window.claude.use("sample"); if (SAMPLE) { const lim = await SAMPLE.limits().catch(() => null); SAMPLE_IMG = lim && lim.images ? lim.images : null; } } catch (e) { SAMPLE = null; }
  renderImport();
}
const findStock = p => (p.code && BY[String(p.code).toUpperCase()]) || (p.code && BY[String(p.code).padStart(6, "0")]) || S.find(s => s.name === p.name || s.name.replace(/\s/g, "") === String(p.name || "").replace(/\s/g, ""));
function positions() {
  const fx = krw() || 1350, out = [], seen = new Set();
  const add = (o) => { const k = o.s ? o.s.t : o.name; if (seen.has(k)) return; seen.add(k); out.push(o); };
  (Store.pf && Store.pf.positions || []).forEach(p => {
    const s = findStock(p), cur = s ? s.cur : (p.currency === "USD" ? "USD" : "KRW");
    const price = s ? s.price : p.price, qty = +p.qty || 0, avg = +p.avg || null;
    if (!qty) return;
    add({ s, name: s ? s.name : p.name, code: s ? s.t : p.code, cur, qty, avg, price, src: "import", pdate: s ? s.qdate : null });
  });
  S.forEach(s => { const m = my(s.t); if (m.qty > 0 && m.cost) add({ s, name: s.name, code: s.t, cur: s.cur, qty: m.qty, avg: m.cost, price: s.price, src: "manual", pdate: s.qdate }); });
  out.forEach(o => { o.k = o.cur === "USD" ? fx : 1; o.val = o.price != null ? o.price * o.qty : null; o.cost = o.avg != null ? o.avg * o.qty : null;
    o.pl = o.val != null && o.cost != null ? o.val - o.cost : null; o.valK = o.val != null ? o.val * o.k : null; o.plK = o.pl != null ? o.pl * o.k : null; });
  return out.sort((a, b) => (b.valK || 0) - (a.valK || 0));
}
function renderHold() {
  const ps = positions(), fx = krw();
  const pf = Store.pf;
  if (!ps.length) {
    $("#holdsum").innerHTML = `<div class="bh"><h2>내 투자</h2></div>${empty("아직 보유 종목이 없어요.<br>아래에서 나무증권 잔고 화면을 캡처해 올리거나, 종목 상세의 '내 기록'에 평균단가와 수량을 적어 주세요.")}`;
    $("#holdlist").innerHTML = ""; $("#holdsub").textContent = ""; renderImport(); return;
  }
  const val = ps.reduce((a, o) => a + (o.valK || 0), 0), cost = ps.filter(o => o.cost != null).reduce((a, o) => a + o.cost * o.k, 0), pl = ps.reduce((a, o) => a + (o.plK || 0), 0);
  const krV = ps.filter(o => o.cur === "KRW").reduce((a, o) => a + (o.valK || 0), 0), usV = val - krV;
  const cash = pf && pf.account && +pf.account.cash ? +pf.account.cash : null;
  $("#holdsum").innerHTML = `<div class="sum"><span class="k">총 평가금액${cash ? " (예수금 제외)" : ""}</span><span class="v">${fmtKrw(val)}</span>
      <span class="c ${cls(pl)}">${pl > 0 ? "+" : ""}${fmtKrw(pl)} (${cost ? (pl > 0 ? "+" : "") + (pl / cost * 100).toFixed(2) : "—"}%)</span>
      <span class="na" style="font-size:12.5px">${fx ? `달러 자산은 환율 ${fmtNum(fx)}원(${md((IBY["KRW=X"] || {}).qdate)})으로 환산` : ""}</span></div>
    <div class="kv2"><div><span class="k">국내 주식</span><span class="v">${fmtKrw(krV)}</span></div><div><span class="k">해외 주식</span><span class="v">${fmtKrw(usV)}</span></div>
      ${cash ? `<div><span class="k">예수금 (캡처 기준)</span><span class="v">${fmtKrw(cash)}</span></div>` : ""}<div><span class="k">투자 원금</span><span class="v">${fmtKrw(cost)}</span></div></div>
    ${pf ? `<p class="note" style="margin:0">${esc(pf.source || "캡처")}에서 가져옴 · ${esc(pf.asOf || "")} ${pf.importedAt ? "(" + new Date(pf.importedAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) + " 가져옴)" : ""}. 가격은 앱 데이터의 최근 종가로 다시 계산하며, 앱에 없는 종목은 캡처 시점 가격을 씁니다.</p>` : ""}`;
  $("#holdsub").textContent = `${ps.length}종목 · 평가금액 순`;
  $("#holdlist").innerHTML = ps.map(o => {
    const r = o.cost ? o.pl / o.cost : null, money2 = v => money(v, o.cur);
    const logoH = o.s ? logo(o.s) : `<span class="logo" style="background:#8B95A1" aria-hidden="true">${esc(String(o.name || "?").slice(0, 2))}</span>`;
    return `<div class="rw norank" ${o.s ? `data-open="${esc(o.s.t)}" role="button" tabindex="0"` : ""}>
      <span class="rk"></span>${logoH}
      <div class="nm"><div class="n">${esc(o.name)}</div><div class="s">${o.qty.toLocaleString("ko-KR")}주 · 평단 ${o.avg != null ? money2(o.avg) : "—"}${o.src === "manual" ? ' · <span class="badge">직접 입력</span>' : ""}${o.s ? "" : ' · <span class="badge">캡처 가격</span>'}</div></div>
      <div class="rp"><span class="p">${o.val != null ? money2(o.val) : "—"}</span><span class="c ${cls(r)}">${o.pl != null ? (o.pl > 0 ? "+" : "") + money2(o.pl) : ""} ${r != null ? "(" + (r * 100).toFixed(1) + "%)" : ""}</span></div></div>`;
  }).join("");
  renderImport();
}
function renderImport() {
  const el = $("#imp"); if (!el) return;
  if (!SAMPLE) {
    el.innerHTML = `<p class="note" style="margin:0">캡처 가져오기는 claude.ai에서 이 페이지를 열었을 때 쓸 수 있습니다. 여기서는 종목 상세의 '내 기록'에 직접 입력해 주세요.</p>`; return;
  }
  if (IMP.busy) { el.innerHTML = `<div class="row"><span class="na">잔고 화면을 읽는 중입니다… (보통 20초~1분)</span><button type="button" class="btn" id="impstop">중지</button></div>`; return; }
  if (IMP.preview) {
    const pv = IMP.preview;
    el.innerHTML = `<div class="bh"><h2 style="font-size:16px">읽은 내용 확인</h2><span class="sub">${esc(pv.asOf || "")}</span></div>
      <div class="rows" style="margin:0 -20px">${pv.positions.map(p => { const s = findStock(p); return `<div class="rw norank"><span class="rk"></span>${s ? logo(s) : `<span class="logo" style="background:#8B95A1">${esc(String(p.name || "?").slice(0, 2))}</span>`}
        <div class="nm"><div class="n">${esc(p.name)}</div><div class="s">${esc(p.code || "")} · ${(+p.qty || 0).toLocaleString("ko-KR")}주 · 평단 ${money(+p.avg || null, p.currency === "USD" ? "USD" : "KRW")}${s ? "" : ' · <span class="badge warn">앱에 없는 종목</span>'}</div></div>
        <div class="rp"><span class="p">${p.value != null ? money(+p.value, p.currency === "USD" ? "USD" : "KRW") : ""}</span></div></div>`; }).join("")}</div>
      ${pv.account && pv.account.cash ? `<p class="note">예수금 ${fmtKrw(+pv.account.cash)}</p>` : ""}
      <p class="note">숫자가 캡처와 다르면 저장하지 말고 더 선명한 캡처로 다시 시도하세요. 저장하면 같은 시장(국내/해외)의 이전 가져오기 내용을 대신합니다.</p>
      <div class="row"><button type="button" class="btn" id="impcancel">취소</button><button type="button" class="btn prim" id="impsave">이대로 저장</button></div>`;
    return;
  }
  el.innerHTML = `${IMP.err ? `<p class="alertbox" style="margin:0 0 8px">${esc(IMP.err)}</p>` : ""}
    ${SAMPLE_IMG ? `<label class="btn prim" style="width:100%;cursor:pointer">잔고 화면 캡처 올리기<input type="file" id="impfile" accept="${esc((SAMPLE_IMG.mediaTypes || ["image/png", "image/jpeg"]).join(","))}" multiple hidden></label>
      <p class="note" style="margin:6px 0 0">국내·해외 잔고를 한 번에 최대 ${SAMPLE_IMG.maxCount || 4}장까지 올릴 수 있습니다. 한 번 할 때마다 내 Claude 사용량이 조금 쓰입니다.</p>` :
      `<textarea id="imptext" class="search" style="width:100%;min-height:110px;background:var(--surface-2)" placeholder="이 화면에서는 사진을 올릴 수 없어요. 잔고 화면의 글자를 복사해 붙여넣어 주세요."></textarea><button type="button" class="btn prim" id="impgo" style="width:100%;margin-top:8px">읽어서 가져오기</button>`}
    ${Store.pf ? `<button type="button" class="linkbtn" id="impclear" style="margin-top:10px">가져온 계좌 내용 지우기</button>` : ""}`;
}
async function runImport(images, text) {
  if (!SAMPLE || IMP.busy) return;
  IMP = { busy: true, ctl: new AbortController(), preview: null, err: "" }; renderImport();
  const known = S.map(s => `${s.name}=${s.t}`).join(", ");
  const prompt = `다음은 한국 증권사 앱(나무증권)의 계좌 잔고 화면${images ? " 캡처 이미지" : "에서 복사한 글자"}입니다. 화면에 보이는 보유 종목을 빠짐없이 읽어 아래 JSON 하나로만 답하세요.
{"positions":[{"name":"종목명","code":"국내 6자리 코드 또는 미국 티커, 모르면 null","market":"KR 또는 US","currency":"KRW 또는 USD","qty":보유수량,"avg":평균매입단가,"price":현재가,"value":평가금액,"pnl":평가손익,"pnlPct":수익률(%)}],"account":{"total":총평가금액 또는 null,"cash":예수금 또는 null},"asOf":"화면에 보이는 기준 날짜·시각 또는 null"}
규칙: 숫자는 쉼표·통화기호 없이 숫자로. 해외주식은 화면에 달러 금액이 있으면 달러(USD)로, 원화만 보이면 원화(KRW)로 적고 currency를 그에 맞게. 화면에 없는 값은 null. 추측하지 말 것. 보유 종목이 아닌 것(관심종목·광고·메뉴)은 넣지 말 것.
참고용 종목명=코드 목록: ${known}
${text ? "\n잔고 화면 글자:\n" + text.slice(0, 20000) : ""}`;
  try {
    const out = await SAMPLE.json(prompt, { images: images || undefined, signal: IMP.ctl.signal, cache: false });
    const pos = (out && Array.isArray(out.positions) ? out.positions : []).map(p => ({
      name: String(p.name || "").slice(0, 60), code: p.code == null ? null : String(p.code).trim().toUpperCase().slice(0, 12),
      market: p.market === "US" ? "US" : "KR", currency: p.currency === "USD" ? "USD" : "KRW",
      qty: +p.qty || 0, avg: p.avg == null ? null : +p.avg, price: p.price == null ? null : +p.price, value: p.value == null ? null : +p.value })).filter(p => p.name && p.qty > 0);
    if (!pos.length) throw { code: "empty" };
    IMP = { busy: false, ctl: null, preview: { positions: pos, account: out.account || null, asOf: out.asOf ? String(out.asOf).slice(0, 40) : null }, err: "" };
  } catch (e) {
    const msg = { cancelled: "", not_granted: "Claude 사용을 허용해야 캡처를 읽을 수 있어요.", rate_limited: "잠시 후 다시 시도해 주세요(사용량 한도).", image_rejected: "이미지를 읽을 수 없어요. PNG나 JPG 캡처로 다시 올려 주세요.",
      invalid_json: "읽은 결과를 정리하지 못했어요. 다시 시도해 주세요.", empty: "보유 종목을 찾지 못했어요. 잔고 화면이 잘 보이게 캡처했는지 확인해 주세요.", images_unavailable: "이 화면에서는 사진을 올릴 수 없어요." }[e && e.code];
    IMP = { busy: false, ctl: null, preview: null, err: msg ?? "읽는 중 문제가 생겼어요. 다시 시도해 주세요." };
  }
  renderImport();
}
document.addEventListener("change", e => { if (e.target.id === "impfile" && e.target.files.length) { const fs = [...e.target.files].slice(0, (SAMPLE_IMG && SAMPLE_IMG.maxCount) || 4); runImport(fs, null); } });
document.addEventListener("click", async e => {
  if (e.target.closest("#impstop")) { IMP.ctl && IMP.ctl.abort(); return; }
  if (e.target.closest("#impgo")) { const t = $("#imptext").value.trim(); if (t) runImport(null, t); return; }
  if (e.target.closest("#impcancel")) { IMP.preview = null; renderImport(); return; }
  if (e.target.closest("#impclear")) { if (confirm("가져온 계좌 내용을 지울까요? (직접 입력한 기록은 남습니다)")) { await savePf(null); renderHold(); } return; }
  if (e.target.closest("#impsave")) {
    const pv = IMP.preview, mk = new Set(pv.positions.map(p => p.market));
    const keep = (Store.pf && Store.pf.positions || []).filter(p => !mk.has(p.market));
    const pf = { positions: [...keep, ...pv.positions], account: pv.account || (Store.pf && Store.pf.account) || null, asOf: pv.asOf, source: "나무증권 잔고 캡처", importedAt: Date.now() };
    IMP.preview = null; const ok = await savePf(pf); if (!ok) IMP.err = "계정 저장에 실패해 이 기기에만 저장했어요.";
    renderHold(); renderAll(); return;
  }
});
function renderMore() {
  const u = document.documentElement.dataset.updown;
  document.querySelectorAll("#updown button").forEach(b => b.setAttribute("aria-pressed", b.dataset.u === u));
  status();
  const late = S.filter(stale);
  $("#datanote").innerHTML = `가격·일봉·거래량·목표가·PER·배당: StockAnalysis.com · 지수·환율·금리: Investing.com, Yahoo Finance · 모닝스타 공정가치: 공개 기사 기준.<br>
    가격은 <b>${esc(DATA.quote_date)} 종가</b>이며 실시간 시세가 아닙니다. 평일 아침마다 전날 종가로, 토요일에는 목표가·PER까지 새로 갱신됩니다(마지막 갱신 ${esc(DATA.updated)}).<br>
    장중 실시간 가격은 종목 상세의 '실시간 시세' 버튼으로 확인하세요.${late.length ? `<br>원천 페이지 갱신이 늦은 종목 ${late.length}개(${late.map(s => s.t).join(", ")})는 마지막 확인 날짜를 함께 표시합니다.` : ""}`;
  $("#guide").innerHTML = DATA.sector_guide.map(g => `<div class="gc">
    <button type="button" class="chip" data-sec="${esc(g[0])}" style="justify-self:start"><span class="dot" style="background:#${COLORS[g[0]] || "888"}"></span><b>${esc(g[0])}</b></button>
    <div>${esc(g[1])}</div><div><span class="k">돈 버는 방식 · </span>${esc(g[2])}</div>
    <div><span class="k">금리 인상기 · </span>${esc(g[3])}</div><div><span class="k">금리 인하기 · </span>${esc(g[4])}</div>
    <div><span class="k">체크할 지표 · </span>${esc(g[5])}</div></div>`).join("");
  $("#foot").innerHTML = `종합등급은 실적과 주가의 괴리, 밸류에이션, 이익 전망 방향, 재무·촉매 4가지 기준에 따른 스크리닝 분류입니다. 공개 자료를 정리한 참고용 도구이며 투자 권유나 금융 자문이 아닙니다. 매매 전에는 실시간 시세와 최신 공시를 꼭 확인하세요.`;
}
function renderAll() {
  $("#asof").textContent = `미국 ${md(DATA.quote_date)} · 국내 ${md(DATA.kr_date)} 종가 · 실시간 아님`;
  renderIdx(); renderHome(); renderStocks(); renderStar(); renderHold(); renderMore();
}
function setTab(t, scroll = true) {
  state.tab = t; LS.set("wl-tab", t);
  document.querySelectorAll(".view").forEach(v => v.hidden = v.dataset.view !== t);
  document.querySelectorAll("#tabbar button").forEach(b => b.setAttribute("aria-pressed", b.dataset.tab === t));
  if (scroll) window.scrollTo({ top: 0 });
}

/* ---------- 상세 화면 ---------- */
const dlg = $("#dlg");
function liveLinks(t) {
  const T = encodeURIComponent(t), tl = t.toLowerCase(), s = BY[t];
  if (s && s.mkt === "KR") {
    const y = `${t}.${s.ex === "코스닥" ? "KQ" : "KS"}`, N = encodeURIComponent(s.name);
    return `<div class="links">
    <a class="pri" href="https://finance.naver.com/item/main.naver?code=${T}" target="_blank" rel="noopener">실시간 시세 ↗</a>
    <a href="https://finance.yahoo.com/quote/${y}/" target="_blank" rel="noopener">야후 파이낸스 ↗</a>
    <a href="https://www.tradingview.com/symbols/KRX-${T}/" target="_blank" rel="noopener">트레이딩뷰 ↗</a>
    <a href="https://news.google.com/search?q=${N}&hl=ko&gl=KR&ceid=KR:ko" target="_blank" rel="noopener">뉴스 ↗</a>
    <a href="https://dart.fss.or.kr/" target="_blank" rel="noopener">공시(DART) ↗</a>
  </div>`;
  }
  return `<div class="links">
    <a class="pri" href="https://finance.yahoo.com/quote/${T}/" target="_blank" rel="noopener">실시간 시세 ↗</a>
    <a href="https://www.google.com/search?q=${T}+stock" target="_blank" rel="noopener">구글 시세 ↗</a>
    <a href="https://www.tradingview.com/symbols/${T}/" target="_blank" rel="noopener">트레이딩뷰 ↗</a>
    <a href="https://stockanalysis.com/stocks/${tl}/financials/" target="_blank" rel="noopener">재무제표 ↗</a>
    <a href="https://news.google.com/search?q=${T}%20stock&hl=ko&gl=KR&ceid=KR:ko" target="_blank" rel="noopener">뉴스 ↗</a>
    <a href="https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${T}&type=&dateb=&owner=include&count=40" target="_blank" rel="noopener">공시 ↗</a>
  </div>`;
}
const navList = () => state.tab === "star" ? (state.starList || []) : state.tab === "home" ? bestList(state.best, 10).map(s => s.t) : state.list;
function headBar(kind, key) {
  const lst = kind === "stock" ? navList() : IX.map(x => x.sym), i = lst.indexOf(key);
  return `<div class="dhead">
    <button type="button" class="icon" data-close aria-label="닫기"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
    <span class="sp"></span>
    ${kind === "stock" ? starBtn(BY[key]) : ""}
    <button type="button" class="icon" data-nav="-1" aria-label="이전" ${i <= 0 ? "disabled" : ""}><svg viewBox="0 0 24 24"><path d="M6 15l6-6 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
    <button type="button" class="icon" data-nav="1" aria-label="다음" ${i < 0 || i >= lst.length - 1 ? "disabled" : ""}><svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
  </div>`;
}
function starBtn(s) {
  const on = !!my(s.t).star;
  return `<button type="button" class="icon star dstar" data-star="${esc(s.t)}" aria-pressed="${on}" aria-label="관심 종목 ${on ? "해제" : "추가"}">${on ? STAR : STAR_O}</button>`;
}
function chartPanel(h, hasVol, lineOnly) {
  return `<section class="box">
    <div class="ctop">${lineOnly ? '<span class="na" style="font-size:12.5px">일별 종가 라인</span>' : '<div class="seg" id="ctype"><button type="button" data-c="line">라인</button><button type="button" data-c="candle">캔들</button></div>'}
      <div class="seg" id="rng"><button type="button" data-r="5">1주</button><button type="button" data-r="22">1달</button><button type="button" data-r="66">3달</button><button type="button" data-r="all">전체</button></div></div>
    <div class="legend" id="legend"></div>
    <div id="chart" role="img" aria-label="일봉 차트"></div>
    <div class="ctop"><div class="malgd">${[[5, "--ma1"], [20, "--ma2"], [60, "--ma3"]].map(([n, c]) => `<label><input type="checkbox" data-ma="${n}" ${state.ma[n] ? "checked" : ""} ${h.length < n ? "disabled" : ""}><i style="background:var(${c})"></i>${n}일선</label>`).join("")}</div>
      <span class="cnote">${hasVol ? "아래 막대 = 거래량 · " : ""}일봉 ${h.length}개 (${md(iso(h[0][0]))}~${md(iso(h[h.length - 1][0]))})</span></div>
  </section>`;
}
function detailHtml(s) {
  const m = my(s.t), h = s.h || [];
  const last = h.length ? iso(h[h.length - 1][0]) : null;
  const hi = h.length ? Math.max(...h.map(r => r[2])) : null, lo = h.length ? Math.min(...h.map(r => r[3])) : null;
  const rangeBar = s.lo != null && s.hi != null && s.hi > s.lo ? `<div class="range"><div class="lbl"><span>52주 최저 ${M(s, s.lo)}</span><span>최고 ${M(s, s.hi)}</span></div><div class="track"><span class="pin" style="left:${(Math.max(0, Math.min(1, s.pos52)) * 100).toFixed(1)}%"></span></div></div>` : "";
  return `${headBar("stock", s.t)}
  <div class="dtop">
    <div class="who">${logo(s)}<div style="min-width:0"><div class="n" id="dtitle">${esc(s.name)}</div><div class="t">${esc(s.mkt === "KR" ? s.ex + " " + s.t : s.t)} · ${esc(s.sub)}${s.grade ? ` · <span class="grade g-${s.grade}">${s.grade}</span>` : ""}</div></div></div>
    <div class="big" style="margin-top:8px">${M(s, s.price)}</div>
    <div class="chg">${refLabel(s) || "직전 대비"} <span class="${cls(s.dchg)}">${s.diff == null ? "—" : (s.diff > 0 ? "+" : "") + M(s, s.diff)} (${s.dchg == null ? "—" : (s.dchg * 100).toFixed(2) + "%"})</span></div>
    <div class="asof">${esc(s.qdate)} 종가 · 실시간 아님 ${lateBadge(s)}${krw() && s.cur === "USD" ? `<span>· 약 ${fmtKrw(s.price * krw())}</span>` : ""}</div>
  </div>
  ${s.note ? `<div class="alertbox">⚠ ${esc(s.note)}</div>` : ""}
  ${h.length ? chartPanel(h, h.some(r => r.length > 5 && r[5] > 0), s.lineOnly) : `<section class="box">${empty("차트 자료를 불러오지 못했습니다. 잠시 후 다시 열어 주세요.")}</section>`}
  <section class="box">${liveLinks(s.t)}</section>
  <section class="box">
    <div class="bh"><h2>시세 정보</h2></div>
    <div class="kv">
      <div><span class="k">거래량</span><span class="v">${s.vol ? fmtBig(s.vol) + (s.vratio ? ` <span class="na">(평소 ${s.vratio.toFixed(1)}배)</span>` : "") : "—"}</span></div>
      <div><span class="k">거래대금</span><span class="v">${tvFmt(s)}</span></div>
      <div><span class="k">시가총액</span><span class="v">${fmtCap(s.mcap, s.cur)}</span></div>
      <div><span class="k">${rangeLbl(s)} 고점 대비</span><span class="v">${fmtPct(s.off52)}</span></div>
      <div><span class="k">차트 기간 최고</span><span class="v">${M(s, hi)}</span></div>
      <div><span class="k">차트 기간 최저</span><span class="v">${M(s, lo)}</span></div>
    </div>
    ${rangeBar}
  </section>
  <section class="box">
    <div class="bh"><h2>${s.univ ? "종목 정보" : "투자 지표"}</h2><span class="sub">${s.research ? "애널리스트 · 모닝스타" : s.univ ? "" : "애널리스트"}</span></div>
    ${s.univ ? `<div class="kv">
      <div><span class="k">시장</span><span class="v">${esc(s.mkt === "KR" ? s.ex : "미국 " + s.ex)}</span></div>
      <div><span class="k">섹터</span><span class="v">${esc(s.major)}</span></div>
      <div><span class="k">편입 지수</span><span class="v">${(s.idx || []).map(k => IXNAME[k] || k).join(" · ") || "—"}</span></div>
      <div><span class="k">${rangeLbl(s)} 최고 · 최저</span><span class="v">${M(s, s.hi)} · ${M(s, s.lo)}</span></div>
    </div><p class="note">${s.ind ? "업종: " + esc(s.ind) + ". " : ""}이 종목은 전체 시장 목록에서 온 것이라 애널리스트 목표가·PER·저평가 리서치는 없습니다. 자세한 지표는 위 링크에서 보세요.</p>` : !s.research ? `<div class="kv">
      <div><span class="k">애널리스트 의견</span><span class="v">${esc(s.rating || "—")}</span></div>
      <div><span class="k">평균 목표가</span><span class="v">${s.tgt ? M(s, s.tgt) + " " + fmtPct(s.upside) : "—"}</span></div>
      <div><span class="k">PER · 예상 PER</span><span class="v">${fmtX(s.pe)} · ${fmtX(s.fpe)}</span></div>
      <div><span class="k">배당수익률</span><span class="v">${fmtDiv(s.div)}</span></div>
      <div><span class="k">52주 최고 · 최저</span><span class="v">${M(s, s.hi)} · ${M(s, s.lo)}</span></div>
      <div><span class="k">지난주 대비</span><span class="v">${fmtPct(s.chg)}</span></div>
    </div><p class="note">이 종목은 거래가 많은 시장 종목으로 넣은 것이며, 저평가 리서치(등급·모닝스타·투자포인트)는 없습니다.</p>` : `<div class="kv">
      <div><span class="k">애널리스트 의견</span><span class="v">${esc(s.rating)}</span></div>
      <div><span class="k">평균 목표가</span><span class="v">${M(s, s.tgt)} ${fmtPct(s.upside)}</span></div>
      <div><span class="k">모닝스타 공정가치</span><span class="v">${s.fv ? M(s, s.fv) : '<span class="na">비공개</span>'}</span></div>
      <div><span class="k">모닝스타 할인율</span><span class="v">${fmtPct(s.msdisc, false)}</span></div>
      <div><span class="k">PER · 예상 PER</span><span class="v">${fmtX(s.pe)} · ${fmtX(s.fpe)}</span></div>
      <div><span class="k">배당수익률</span><span class="v">${fmtDiv(s.div)}</span></div>
      <div><span class="k">해자 · 불확실성</span><span class="v">${esc(s.moat)} · ${esc(s.unc)}</span></div>
      <div><span class="k">지난주 대비</span><span class="v">${fmtPct(s.chg)}</span></div>
    </div>
    <div class="tags"><span class="tag">${esc(s.scen)}</span><span class="tag">${esc(s.major)}</span><span class="tag">본사 ${esc(s.hq)}</span></div>`}
  </section>
  <section class="box">
    <div class="bh"><h2>내 기록</h2></div>
    <div class="form" data-form="${esc(s.t)}">
      <label>매수 희망가 (${s.cur === "KRW" ? "원" : "$"})<input inputmode="decimal" data-f="buy" value="${m.buy ?? ""}" placeholder="${s.cur === "KRW" ? Math.round(s.price * 0.9) : (s.price * 0.9).toFixed(2)}"></label>
      <label>평균 매수가 (${s.cur === "KRW" ? "원" : "$"})<input inputmode="decimal" data-f="cost" value="${m.cost ?? ""}" placeholder="보유 시"></label>
      <label>보유 수량 (주)<input inputmode="decimal" data-f="qty" value="${m.qty ?? ""}" placeholder="0"></label>
      <label class="full">메모<textarea data-f="memo" placeholder="매수 이유, 확인할 실적 발표일, 손절 기준 등">${esc(m.memo || "")}</textarea></label>
    </div>
    <div class="calc" id="calc"></div>
    <div class="saved" id="savedmsg">${Store.mode === "db" ? "입력하면 내 계정에 자동 저장됩니다." : "입력하면 이 기기에 자동 저장됩니다."}</div>
  </section>
  <section class="box">
    <div class="bh"><h2>${s.research ? "기업 · 투자 포인트" : "기업 정보"}</h2></div>
    <dl class="txt">
      <dt>무슨 사업을 하나</dt><dd>${esc(s.desc)}</dd>
      ${s.research ? `<dt>주요 매출원 · 대표 제품</dt><dd>${esc(s.rev)}</dd>
      <dt>저평가 근거</dt><dd>${esc(s.val)}</dd>
      <dt>핵심 투자포인트</dt><dd>${esc(s.thesis)}</dd>
      <dt>주요 리스크</dt><dd>${esc(s.risk)}</dd>
      <dt>리서치 기준일</dt><dd>${esc(s.mdate)}</dd>` : `<dt>섹터</dt><dd>${esc(s.major)} · ${esc(s.sub)}</dd>`}
    </dl>
  </section>
  <p class="note" style="padding:0 4px">참고용 정리이며 투자 권유가 아닙니다.</p>`;
}
function indexHtml(x) {
  const h = x.h, hi = Math.max(...h.map(r => r[2])), lo = Math.min(...h.map(r => r[3]));
  const u = v => x.unit === "원" ? fmtNum(v) + "원" : x.unit === "%" ? fmtNum(v, 3) + "%" : fmtNum(v);
  return `${headBar("index", x.sym)}
  <div class="dtop">
    <div class="who"><div style="min-width:0"><div class="n" id="dtitle">${esc(x.name)}</div><div class="t">${esc(x.region)} · ${esc(x.sym)}</div></div></div>
    <div class="big" style="margin-top:8px">${u(x.price)}</div>
    <div class="chg">${md(x.ref_date)} 대비 <span class="${cls(x.dchg)}">${x.diff > 0 ? "+" : ""}${fmtNum(x.diff, x.price < 100 ? 3 : 2)} (${(x.dchg * 100).toFixed(2)}%)</span></div>
    <div class="asof">${esc(x.qdate)} 종가 · 실시간 아님</div>
  </div>
  ${chartPanel(h, false)}
  <section class="box">
    <div class="links"><a class="pri" href="${esc(x.url)}" target="_blank" rel="noopener">실시간 보기 ↗</a></div>
    <div class="kv">
      <div><span class="k">차트 기간 수익률</span><span class="v">${fmtPct(periodRet(h))}</span></div>
      <div><span class="k">차트 기간 최고 · 최저</span><span class="v">${u(hi)} · ${u(lo)}</span></div>
    </div>
    <p class="note">지수·환율·금리는 Investing.com과 Yahoo Finance의 일별 자료를 합친 것이며, 원천 사정으로 일부 날짜가 빠질 수 있습니다.</p>
  </section>`;
}
function calc() {
  const s = BY[state.cur], el = $("#calc"); if (!s || !el) return;
  const m = my(s.t), out = [], fx = krw();
  if (m.buy) { const g = s.price / m.buy - 1; out.push(g <= 0 ? `<span class="hit">매수 희망가 도달 (현재가가 ${Math.abs(g * 100).toFixed(1)}% 아래)</span>` : `매수 희망가까지 <b>${(g * 100).toFixed(1)}%</b> 하락 필요`); }
  if (m.cost && m.qty > 0) { out.push(`평가금액 <b>${M(s, s.price * m.qty)}</b>${fx && s.cur === "USD" ? ` (${fmtKrw(s.price * m.qty * fx)})` : ""}`, `평가손익 <b class="${cls(s.price - m.cost)}">${M(s, (s.price - m.cost) * m.qty)}</b> ${fmtPct(s.price / m.cost - 1)}`); }
  if (m.cost && s.tgt) out.push(`평단 대비 목표가 ${fmtPct(s.tgt / m.cost - 1)}`);
  el.innerHTML = out.map(x => `<span>${x}</span>`).join("");
}
async function openDetail(t) {
  const s = BY[t]; if (!s) return;
  state.cur = t; state.curKind = "stock";
  if (!s.h && window.__loadHist) {
    $("#dbody").innerHTML = headBar("stock", t) + `<div class="empty">${esc(s.name)} 차트 불러오는 중…</div>`;
    if (!dlg.open) { try { dlg.showModal(); } catch (e) { dlg.setAttribute("open", ""); } }
    try { s.h = await window.__loadHist(t); } catch (e) { s.h = []; }
    if (state.cur !== t) return;
  }
  $("#dbody").innerHTML = detailHtml(s);
  if (!dlg.open) { try { dlg.showModal(); } catch (e) { dlg.setAttribute("open", ""); } }
  dlg.scrollTop = 0; chartBtns(); calc(); drawChart();
}
function openIndex(sym) {
  const x = IBY[sym]; if (!x) return;
  state.cur = sym; state.curKind = "index";
  $("#dbody").innerHTML = indexHtml(x);
  if (!dlg.open) { try { dlg.showModal(); } catch (e) { dlg.setAttribute("open", ""); } }
  dlg.scrollTop = 0; chartBtns(); drawChart();
}
function closeDetail() { destroyChart(); state.cur = null; if (dlg.open) dlg.close(); }
function syncDrawerStar() {
  if (!state.cur || state.curKind !== "stock") return; const b = $("#dbody .dstar"); if (!b) return;
  const on = !!my(state.cur).star; b.setAttribute("aria-pressed", on); b.innerHTML = on ? STAR : STAR_O;
}
function chartBtns() {
  document.querySelectorAll("#rng button").forEach(b => b.setAttribute("aria-pressed", b.dataset.r === String(state.range)));
  document.querySelectorAll("#ctype button").forEach(b => b.setAttribute("aria-pressed", b.dataset.c === state.ctype));
}

/* ---------- 차트 ---------- */
let chart = null, lwP = null, chartMain = null, chartBars = [];
function loadLW() {
  if (window.LightweightCharts) return Promise.resolve(window.LightweightCharts);
  const srcs = window.LW_SRCS || ["https://cdn.jsdelivr.net/npm/lightweight-charts@4.2.0/dist/lightweight-charts.standalone.production.js"];
  const one = src => new Promise((res, rej) => {
    const sc = document.createElement("script"); sc.src = src;
    sc.onload = () => window.LightweightCharts ? res(window.LightweightCharts) : rej(new Error("no lib"));
    sc.onerror = () => { sc.remove(); rej(new Error("load failed")); };
    document.head.appendChild(sc); setTimeout(() => rej(new Error("timeout")), 9000);
  });
  if (!lwP) lwP = srcs.reduce((p, src) => p.catch(() => one(src)), Promise.reject(new Error("start")));
  return lwP;
}
function destroyChart() { if (chart) { try { chart.remove(); } catch (e) {} chart = null; chartMain = null; } }
function sma(bars, n) { const out = []; let sum = 0; bars.forEach((b, i) => { sum += b.close; if (i >= n) sum -= bars[i - n].close; if (i >= n - 1) out.push({ time: b.time, value: +(sum / n).toFixed(4) }); }); return out; }
const pfmt = p => state.curKind === "index" ? fmtNum(p, Math.abs(p) < 100 ? 3 : 2) : (BY[state.cur] || {}).cur === "KRW" ? Math.round(p).toLocaleString("ko-KR") + "원" : "$" + p.toFixed(2);
function legend(b, prev) {
  const el = $("#legend"); if (!el || !b) return;
  const c = prev ? b.close / prev.close - 1 : null;
  el.innerHTML = `<span>${b.time}</span><span><span class="k">시</span> ${pfmt(b.open)}</span><span><span class="k">고</span> ${pfmt(b.high)}</span><span><span class="k">저</span> ${pfmt(b.low)}</span><span><span class="k">종</span> <b class="${b.close >= b.open ? "pos" : "neg"}">${pfmt(b.close)}</b></span>${c == null ? "" : `<span>${fmtChg(c)}</span>`}${b.vol ? `<span><span class="k">거래량</span> ${fmtBig(b.vol)}</span>` : ""}`;
}
function applyRange() {
  if (!chart || !chartBars.length) return;
  const n = chartBars.length, r = state.range;
  if (r === "all" || +r >= n) chart.timeScale().fitContent();
  else chart.timeScale().setVisibleLogicalRange({ from: n - +r - 0.5, to: n - 0.5 + 0.8 });
}
function svgFallback(bars) {
  const W = 760, H = 300, P = 10, n = bars.length;
  const hi = Math.max(...bars.map(b => b.high)), lo = Math.min(...bars.map(b => b.low)), y = v => P + (hi - v) / ((hi - lo) || 1) * (H - 2 * P), bw = (W - 2 * P) / n;
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="100%" preserveAspectRatio="none">${bars.map((b, i) => {
    const x = P + i * bw + bw / 2, c = b.close >= b.open ? "var(--up)" : "var(--down)";
    return `<line x1="${x}" x2="${x}" y1="${y(b.high)}" y2="${y(b.low)}" stroke="${c}" vector-effect="non-scaling-stroke"/><rect x="${x - bw * .35}" width="${bw * .7}" y="${y(Math.max(b.open, b.close))}" height="${Math.max(1, Math.abs(y(b.open) - y(b.close)))}" fill="${c}"/>`;
  }).join("")}</svg>`;
}
async function drawChart() {
  const box = $("#chart"); if (!box) return;
  const key = state.cur, kind = state.curKind, obj = kind === "stock" ? BY[key] : IBY[key];
  destroyChart();
  chartBars = (obj.h || []).map(r => ({ time: iso(r[0]), open: r[1], high: r[2], low: r[3], close: r[4], vol: r[5] || 0 }));
  if (!chartBars.length) { box.innerHTML = empty("일봉 데이터가 아직 없습니다."); return; }
  const lastBar = chartBars[chartBars.length - 1], hasVol = kind === "stock" && chartBars.some(b => b.vol > 0);
  legend(lastBar, chartBars[chartBars.length - 2]);
  let L;
  try { L = await loadLW(); } catch (e) { if (state.cur === key) box.innerHTML = svgFallback(chartBars); return; }
  if (state.cur !== key || !document.body.contains(box)) return;
  box.innerHTML = "";
  const cs = getComputedStyle(document.documentElement), v = n => cs.getPropertyValue(n).trim();
  const up = v("--up"), dn = v("--down");
  chart = L.createChart(box, {
    autoSize: true,
    layout: { background: { type: "solid", color: v("--surface") }, textColor: v("--muted"), fontFamily: "Noto Sans KR, system-ui, sans-serif", fontSize: 11 },
    grid: { vertLines: { visible: false }, horzLines: { color: v("--line") } },
    rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.08, bottom: hasVol ? 0.24 : 0.06 } },
    timeScale: { borderVisible: false, rightOffset: 1, fixLeftEdge: true, fixRightEdge: true },
    crosshair: { mode: 0 },
    localization: { locale: "ko-KR", dateFormat: "yyyy-MM-dd", priceFormatter: pfmt },
    handleScale: { axisPressedMouseMove: true }, handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false }
  });
  const ret = lastBar.close >= chartBars[0].close;
  if (state.ctype === "line" || obj.lineOnly) {
    const lc = ret ? up : dn;
    chartMain = chart.addAreaSeries({ lineColor: lc, lineWidth: 2, topColor: lc + "33", bottomColor: lc + "00", priceLineVisible: false, lastValueVisible: true, crosshairMarkerRadius: 4 });
    chartMain.setData(chartBars.map(b => ({ time: b.time, value: b.close })));
  } else {
    chartMain = chart.addCandlestickSeries({ upColor: up, downColor: dn, borderUpColor: up, borderDownColor: dn, wickUpColor: up, wickDownColor: dn, priceLineVisible: false });
    chartMain.setData(chartBars.map(({ vol, ...b }) => b));
    [[5, "--ma1"], [20, "--ma2"], [60, "--ma3"]].forEach(([n, c]) => {
      if (!state.ma[n] || chartBars.length < n) return;
      const ln = chart.addLineSeries({ color: v(c), lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      ln.setData(sma(chartBars, n));
    });
  }
  if (hasVol) {
    const vs = chart.addHistogramSeries({ priceFormat: { type: "volume" }, priceScaleId: "vol", lastValueVisible: false, priceLineVisible: false });
    vs.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    vs.setData(chartBars.map(b => ({ time: b.time, value: b.vol, color: (b.close >= b.open ? up : dn) + "66" })));
  }
  if (kind === "stock") {
    const m = my(key), s = obj, dashed = L.LineStyle ? L.LineStyle.Dashed : 2;
    if (lastBar.time < s.qdate) chartMain.createPriceLine({ price: s.price, color: v("--fg"), lineWidth: 1, lineStyle: dashed, axisLabelVisible: true, title: `${md(s.qdate)} 가격` });
    if (m.buy) chartMain.createPriceLine({ price: m.buy, color: v("--good"), lineWidth: 2, lineStyle: dashed, axisLabelVisible: true, title: "매수 희망가" });
    if (m.cost) chartMain.createPriceLine({ price: m.cost, color: v("--star"), lineWidth: 2, lineStyle: dashed, axisLabelVisible: true, title: "평단" });
  }
  const idx = Object.fromEntries(chartBars.map((b, i) => [b.time, i]));
  const pad = x => String(x).padStart(2, "0");
  const tstr = x => typeof x === "string" ? x : x && x.year ? `${x.year}-${pad(x.month)}-${pad(x.day)}` : typeof x === "number" ? new Date(x * 1000).toISOString().slice(0, 10) : "";
  chart.subscribeCrosshairMove(p => {
    const i = p && p.time != null ? idx[tstr(p.time)] : undefined;
    if (i != null) legend(chartBars[i], i > 0 ? chartBars[i - 1] : null);
    else legend(lastBar, chartBars[chartBars.length - 2]);
  });
  applyRange();
}

/* ---------- 이벤트 ---------- */
function goSector(k) { state.sectors = new Set([k]); if (state.tab === "home") state.mkt = state.hm; chips(); renderStocks(); setTab("stocks"); }
document.addEventListener("click", e => {
  const st = e.target.closest("[data-star]");
  if (st) { e.stopPropagation(); const t = st.dataset.star; setMy(t, { star: !my(t).star }); renderAll(); syncDrawerStar(); return; }
  if (e.target.closest("#dlg")) {
    if (e.target === dlg || e.target.closest("[data-close]")) { closeDetail(); return; }
    const nv = e.target.closest("[data-nav]"); if (nv) { nav(+nv.dataset.nav); return; }
    const rb = e.target.closest("#rng button"); if (rb) { state.range = rb.dataset.r; LS.set("wl-range", state.range); chartBtns(); applyRange(); return; }
    const cb = e.target.closest("#ctype button"); if (cb) { state.ctype = cb.dataset.c; LS.set("wl-ctype", state.ctype); chartBtns(); drawChart(); return; }
    return;
  }
  if (e.target.closest("a")) return;
  const tb = e.target.closest("#tabbar button"); if (tb) { setTab(tb.dataset.tab); return; }
  const go = e.target.closest("[data-go]"); if (go) { setTab(go.dataset.go); return; }
  const ic = e.target.closest("[data-idx]"); if (ic) { openIndex(ic.dataset.idx); return; }
  const hmb = e.target.closest("#hm button"); if (hmb) { state.hm = hmb.dataset.hm; LS.set("wl-hm", state.hm); renderHome(); return; }
  const mkb = e.target.closest("#mkt button"); if (mkb) { state.mkt = mkb.dataset.mk; if (state.mkt === "res" && state.sort === "tv") state.sort = "grade"; renderStocks(); return; }
  const bc = e.target.closest("[data-best]"); if (bc) { state.best = bc.dataset.best; LS.set("wl-best", state.best); renderHome(); return; }
  if (e.target.closest("#bestmore")) {
    const map = { up: "dchg", down: "dchg_lo", tv: "tv", vol: "dchg", upside: "upside", low: "off52", div: "div" };
    state.sort = map[state.best] || "tv"; state.mkt = state.hm; state.sectors.clear(); chips(); renderStocks(); setTab("stocks"); return;
  }
  const sc = e.target.closest("[data-sec]"); if (sc) { goSector(sc.dataset.sec); return; }
  const u = e.target.closest("#updown button");
  if (u) { document.documentElement.dataset.updown = u.dataset.u; LS.set("wl-updown", u.dataset.u); renderAll(); return; }
  const chip = e.target.closest("[data-s]");
  if (chip) { const k = chip.dataset.s; if (!k) state.sectors.clear(); else state.sectors.has(k) ? state.sectors.delete(k) : state.sectors.add(k); chips(); renderStocks(); return; }
  const g = e.target.closest("#grades button");
  if (g) { const v = g.dataset.g; if (state.grades.has(v) && state.grades.size > 1) state.grades.delete(v); else state.grades.add(v);
    g.setAttribute("aria-pressed", state.grades.has(v)); renderStocks(); return; }
  const v = e.target.closest("#view button"); if (v) { state.view = v.dataset.v; LS.set("wl-view2", state.view); renderStocks(); return; }
  const ixc = e.target.closest("[data-ixc]"); if (ixc) { state.ix = ixc.dataset.ixc; state.limit = 100; renderStocks(); return; }
  if (e.target.closest("#more")) { state.limit += 200; renderStocks(); return; }
  if (e.target.closest("#fbtn")) { const f = $("#filters"); f.hidden = !f.hidden; $("#fbtn").setAttribute("aria-expanded", !f.hidden); return; }
  if (e.target.closest("#obtn")) { sheet(true); return; }
  if (e.target.closest("#cclose, #capply, #scrim")) { sheet(false); return; }
  if (e.target.closest("#reset, #reset2")) {
    Object.assign(state, { q: "", scen: "", ix: "", sort: "tv", f: { ...F0 }, limit: 100 }); $("#ixf").value = ""; state.grades = new Set(["A","B","C"]); state.sectors.clear();
    $("#q").value = ""; $("#scen").value = ""; ["fu","fp","fd","fo"].forEach((id, i) => $("#" + id).value = [F0.up, F0.pe, F0.div, F0.off][i]);
    document.querySelectorAll("#grades button").forEach(b => b.setAttribute("aria-pressed", "true")); fLabels(); chips(); renderStocks(); return;
  }
  const th = e.target.closest("th[data-sort]"); if (th) { state.sort = th.dataset.sort; renderStocks(); return; }
  const op = e.target.closest("[data-open]"); if (op) openDetail(op.dataset.open);
});
function sheet(open) {
  $("#ctrls").classList.toggle("open", open); $("#scrim").hidden = !open; $("#obtn").setAttribute("aria-expanded", open);
  document.body.style.overflow = open ? "hidden" : ""; document.body.classList.toggle("sheet-open", open);
}
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && $("#ctrls").classList.contains("open")) { sheet(false); return; }
  const rw = e.target.closest && e.target.closest(".rw");
  if (rw && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openDetail(rw.dataset.open); }
});
function nav(d) {
  const lst = state.curKind === "stock" ? navList() : IX.map(x => x.sym);
  const i = lst.indexOf(state.cur), j = i + d;
  if (i >= 0 && j >= 0 && j < lst.length) state.curKind === "stock" ? openDetail(lst[j]) : openIndex(lst[j]);
}
dlg.addEventListener("close", () => { destroyChart(); state.cur = null; });
dlg.addEventListener("keydown", e => {
  if (e.target.closest("input, textarea")) return;
  if (e.key === "ArrowUp" || e.key === "ArrowLeft") { e.preventDefault(); nav(-1); } else if (e.key === "ArrowDown" || e.key === "ArrowRight") { e.preventDefault(); nav(1); }
});
const numOf = v => { const x = parseFloat(String(v).replace(/[,$\s]/g, "")); return isFinite(x) && x > 0 ? x : null; };
let redrawT = null, renderT = null;
dlg.addEventListener("input", e => {
  const inp = e.target.closest("[data-f]"); if (!inp || !state.cur) return;
  const t = state.cur, f = inp.dataset.f;
  setMy(t, { [f]: f === "memo" ? inp.value : numOf(inp.value) });
  $("#savedmsg").textContent = "저장 중…"; if (Store.mode !== "db") setTimeout(() => flash("이 기기에 저장됨"), 400);
  calc(); clearTimeout(renderT); renderT = setTimeout(renderAll, 300);
  if (f === "buy" || f === "cost") { clearTimeout(redrawT); redrawT = setTimeout(() => state.cur === t && drawChart(), 700); }
});
dlg.addEventListener("change", e => {
  const cb = e.target.closest("[data-ma]"); if (!cb) return;
  state.ma = { ...state.ma, [cb.dataset.ma]: cb.checked }; LS.set("wl-ma", state.ma); drawChart();
});
$("#q").addEventListener("input", e => { state.q = e.target.value; state.limit = 100; renderStocks(); });
$("#scen").addEventListener("change", e => { state.scen = e.target.value; state.limit = 100; renderStocks(); });
$("#ixf").addEventListener("change", e => { state.ix = e.target.value; state.limit = 100; renderStocks(); });
$("#sort").addEventListener("change", e => { state.sort = e.target.value; state.limit = 100; renderStocks(); });
[["fu", "up"], ["fp", "pe"], ["fd", "div"], ["fo", "off"]].forEach(([id, k]) => $("#" + id).addEventListener("input", e => { state.f[k] = +e.target.value; fLabels(); renderStocks(); }));

[...$("#ixf").options].forEach(o => { if (o.value && !S.some(x => (x.idx || []).includes(o.value))) o.remove(); });
chips(); fLabels(); renderAll(); setTab(state.tab, false); initDb(); initSample();

/* ---------- 설치형 앱 전용: 메뉴(새로고침·백업/복원·정보), 뒤로가기, 오프라인·새 데이터 알림 ---------- */
(function appExtra() {
  const css = document.createElement("style");
  css.textContent = `
  #appmenu-btn { justify-self: end }
  .amenu { position: fixed; right: 12px; top: calc(56px + env(safe-area-inset-top)); z-index: 60; background: var(--surface); border: 1px solid var(--line); border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,.2); min-width: 210px; padding: 6px; display: grid }
  .amenu[hidden] { display: none }
  .amenu button { text-align: left; border: 0; background: none; padding: 11px 12px; border-radius: 8px; font-size: 14px }
  .amenu button:hover { background: var(--surface-2) }
  .toast { position: fixed; left: 50%; transform: translateX(-50%); bottom: calc(76px + env(safe-area-inset-bottom)); z-index: 70; background: var(--fg); color: var(--bg); border: 0;
    padding: 11px 16px; border-radius: 999px; font-size: 13.5px; box-shadow: 0 6px 20px rgba(0,0,0,.25); max-width: calc(100vw - 32px) }
  .toast[hidden] { display: none }
  dialog.app-dlg { border: 0; border-radius: 14px; padding: 0; width: min(520px, calc(100vw - 24px)); background: var(--bg); color: var(--fg) }
  dialog.app-dlg::backdrop { background: rgba(10,15,20,.45) }
  .app-dlg .in { padding: 16px; display: grid; gap: 10px }
  .app-dlg h3 { margin: 0; font-size: 16px }
  .app-dlg textarea { width: 100%; min-height: 160px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); color: var(--fg); padding: 10px; font-family: var(--font-num); font-size: 12px }
  .app-dlg .btns { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end }
  .app-dlg p { margin: 0; font-size: 13px; color: var(--muted); line-height: 1.6 }`;
  document.head.appendChild(css);

  const header = document.querySelector("header.top");
  header.insertAdjacentHTML("beforeend", `
    <button type="button" class="icon" id="appmenu-btn" aria-label="메뉴" aria-expanded="false"><svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.8" fill="currentColor"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/><circle cx="19" cy="12" r="1.8" fill="currentColor"/></svg></button>
    <div class="amenu" id="amenu" hidden>
      <button type="button" data-act="reload">데이터 새로고침</button>
      <button type="button" data-act="backup">내 기록 백업 · 복원</button>
      <button type="button" data-act="about">앱 정보</button>
    </div>`);
  document.body.insertAdjacentHTML("beforeend", `
    <button type="button" class="toast" id="toast" hidden></button>
    <dialog class="app-dlg" id="bk"><div class="in">
      <h3>내 기록 백업 · 복원</h3>
      <p>관심종목·매수 희망가·평단·수량·메모는 이 폰에만 저장됩니다. 앱을 지우기 전에 아래 내용을 복사해 메모 앱 등에 보관하고, 새로 설치한 뒤 붙여넣어 복원하세요.</p>
      <textarea id="bk-text" spellcheck="false"></textarea>
      <div class="btns"><button type="button" class="btn" data-bk="close">닫기</button><button type="button" class="btn" data-bk="copy">복사</button><button type="button" class="btn prim" data-bk="restore">붙여넣은 내용으로 복원</button></div>
      <p id="bk-msg"></p>
    </div></dialog>
    <dialog class="app-dlg" id="about"><div class="in">
      <h3>저평가 우량주 워치리스트</h3>
      <p id="about-text"></p>
      <div class="btns"><button type="button" class="btn prim" data-about="close">닫기</button></div>
    </div></dialog>`);

  const menu = $("#amenu"), mbtn = $("#appmenu-btn"), toast = $("#toast");
  const showMenu = on => { menu.hidden = !on; mbtn.setAttribute("aria-expanded", on); };
  let toastAct = null;
  function say(msg, act, ms = 4000) {
    toast.textContent = msg; toast.hidden = false; toastAct = act || null;
    clearTimeout(say.t); if (!act) say.t = setTimeout(() => toast.hidden = true, ms);
  }
  toast.addEventListener("click", () => { toast.hidden = true; if (toastAct) toastAct(); });

  document.addEventListener("click", e => {
    if (e.target.closest("#appmenu-btn")) { showMenu(menu.hidden); return; }
    const a = e.target.closest("#amenu [data-act]");
    if (!e.target.closest("#amenu")) showMenu(false);
    if (!a) return;
    showMenu(false);
    if (a.dataset.act === "reload") location.reload();
    if (a.dataset.act === "backup") { $("#bk-text").value = JSON.stringify(Store.data, null, 1); $("#bk-msg").textContent = `저장된 종목 ${Object.keys(Store.data).length}개`; $("#bk").showModal(); }
    if (a.dataset.act === "about") {
      $("#about-text").innerHTML = `가격 기준일 ${esc(DATA.quote_date)} · 데이터 갱신 ${esc(DATA.updated)}<br>매주 토요일 아침 새 시세와 일봉이 자동으로 들어옵니다. 인터넷이 없을 때는 마지막으로 받은 데이터를 보여 줍니다.<br>앱 버전 ${esc(window.APP_VERSION || "")}<br><br>공개 자료를 정리한 참고용 도구이며 투자 권유나 금융 자문이 아닙니다.`;
      $("#about").showModal();
    }
  }, true);
  document.addEventListener("click", async e => {
    const b = e.target.closest("[data-bk]"); if (b) {
      const k = b.dataset.bk, msg = $("#bk-msg");
      if (k === "close") $("#bk").close();
      if (k === "copy") {
        const ta = $("#bk-text"); ta.select();
        try { await navigator.clipboard.writeText(ta.value); msg.textContent = "복사했습니다. 메모 앱 등에 붙여넣어 보관하세요."; }
        catch (err) { try { document.execCommand("copy"); msg.textContent = "복사했습니다."; } catch (e2) { msg.textContent = "자동 복사가 안 됩니다. 글자를 길게 눌러 직접 복사하세요."; } }
      }
      if (k === "restore") {
        try {
          const obj = JSON.parse($("#bk-text").value);
          if (!obj || typeof obj !== "object" || Array.isArray(obj)) throw new Error("형식");
          let n = 0;
          for (const [t, v] of Object.entries(obj)) {
            if (!BY[t] || !v || typeof v !== "object") continue;
            Store.data[t] = { star: !!v.star, buy: typeof v.buy === "number" ? v.buy : null, cost: typeof v.cost === "number" ? v.cost : null,
              qty: typeof v.qty === "number" ? v.qty : null, memo: String(v.memo || "").slice(0, 4000) }; n++;
          }
          LS.set("wl-my", Store.data); stats(); render();
          msg.textContent = `${n}개 종목 기록을 복원했습니다.`;
        } catch (err) { msg.textContent = "복원할 수 없는 내용입니다. 백업할 때 복사한 글자를 그대로 붙여넣어 주세요."; }
      }
      return;
    }
    if (e.target.closest("[data-about]")) $("#about").close();
  });

  /* 안드로이드 뒤로 가기: 열린 화면부터 닫기 (앱 셸이 호출) */
  window.__back = () => {
    for (const d of [$("#bk"), $("#about")]) if (d.open) { d.close(); return true; }
    if (!menu.hidden) { showMenu(false); return true; }
    if (dlg.open) { closeDetail(); return true; }
    const c = $("#ctrls"); if (c && c.classList.contains("open")) { sheet(false); return true; }
    return false;
  };

  /* 오프라인 알림 */
  const net = () => { if (!navigator.onLine) say("오프라인입니다 · 마지막으로 받은 데이터를 보여 줍니다", null, 5000); };
  window.addEventListener("offline", net); net();

  /* 앱을 다시 켰을 때 새 데이터가 있으면 알림 */
  let lastCheck = Date.now();
  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState !== "visible" || Date.now() - lastCheck < 30 * 60e3) return;
    lastCheck = Date.now();
    try {
      const r = await fetch("data.json", { cache: "no-cache" }); const d = await r.json();
      if (d.updated !== DATA.updated) say(`새 데이터(${d.updated})가 있습니다 · 눌러서 반영`, () => location.reload());
    } catch (e) {}
  });
})();

})();
