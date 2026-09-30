(() => {
const DATA = window.__DATA;

const $ = s => document.querySelector(s);
const S = DATA.stocks, BY = Object.fromEntries(S.map(s => [s.t, s]));
const COLORS = DATA.sector_colors, SECTORS = Object.keys(COLORS).filter(k => S.some(s => s.major === k));
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};
const F0 = { up: -30, pe: 60, div: 0, off: 0 };
const state = { q: "", scen: "", sort: "grade", grades: new Set(["A","B","C"]), sectors: new Set(), view: LS.get("wl-view", matchMedia("(max-width: 640px)").matches ? "rows" : "card"),
  mine: "", f: { ...F0 }, list: [], cur: null, range: LS.get("wl-range", "all"), ma: LS.get("wl-ma", { 5: true, 20: true, 60: true }) };
document.documentElement.dataset.updown = LS.get("wl-updown", "kr");

/* ---------- 형식 ---------- */
const iso = n => { const s = String(n); return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`; };
const md = d => d ? `${+d.slice(5,7)}/${+d.slice(8,10)}` : "";
const days = (a, b) => Math.round((new Date(a) - new Date(b)) / 864e5);
const fmtUsd = v => v == null ? "—" : "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = (v, sign = true) => v == null ? '<span class="na">—</span>' :
  `<span class="${v > 0.0005 ? "pos" : v < -0.0005 ? "neg" : ""}">${sign && v > 0 ? "+" : ""}${(v * 100).toFixed(1)}%</span>`;
const fmtPct2 = v => v == null ? '<span class="na">—</span>' :
  `<span class="${v > 0.00005 ? "pos" : v < -0.00005 ? "neg" : ""}">${v > 0 ? "▲ " : v < 0 ? "▼ " : ""}${Math.abs(v * 100).toFixed(2)}%</span>`;
const fmtX = v => v == null ? '<span class="na">—</span>' : v.toFixed(1) + "배";
const fmtDiv = v => v == null ? '<span class="na">무배당</span>' : (v * 100).toFixed(1) + "%";
const fmtCap = v => v == null ? "—" : v >= 1000 ? "$" + (v / 1000).toFixed(2) + "조" : "$" + v.toFixed(1) + "B";
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.1l-5.7 3.2 1.2-6.4-4.7-4.4 6.4-.8z"/></svg>';
const STAR_O = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.1l-5.7 3.2 1.2-6.4-4.7-4.4 6.4-.8z"/></svg>';
const stale = s => days(DATA.updated, s.qdate) > 4;
const refLabel = s => !s.ref_date ? "" : days(s.qdate, s.ref_date) <= 4 ? "전일 대비" : `${md(s.ref_date)} 대비`;

/* ---------- 내 데이터(관심·희망가·평단·수량·메모) ---------- */
const Store = { mode: "local", data: LS.get("wl-my", {}), col: null, timers: {}, chains: {}, pending: {}, err: "" };
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
function flash(msg) { const el = $("#savedmsg"); if (el) { el.textContent = msg + " · " + new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }); } }
function status() {
  const el = $("#store"); if (!el) return;
  el.className = "pill" + (Store.mode === "db" ? " ok" : "");
  el.innerHTML = `<span class="d"></span>${Store.mode === "db" ? "관심종목·메모: 내 계정에 저장 (다른 기기에서도 보임)" :
    Store.err === "fail" ? "계정 저장 실패 · 이 브라우저에만 저장 중" : "관심종목·메모: 이 폰에 저장"}`;
}
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
      snap.docs.forEach(d => { if (d.exists) { const b = d.data() || {}; remote[d.id] = { star: !!b.star, buy: b.buy ?? null, cost: b.cost ?? null, qty: b.qty ?? null, memo: b.memo || "" }; } });
      if (first) {
        first = false; Store.col = col; Store.mode = "db"; Store.err = "";
        const localOnly = Object.keys(Store.data).filter(t => !remote[t] && !isEmpty(Store.data[t]) && BY[t]);
        Store.data = { ...Store.data, ...remote };
        localOnly.forEach(queueWrite);
      } else {
        for (const t in remote) if (!Store.timers[t] && !Store.pending[t]) Store.data[t] = remote[t];
        for (const t in Store.data) if (!remote[t] && !Store.timers[t] && !Store.pending[t]) delete Store.data[t];
      }
      LS.set("wl-my", Store.data);
      status(); stats(); render(); syncDrawerStar();
    }, () => { Store.mode = "local"; Store.col = null; Store.err = "fail"; status(); });
  } catch (e) { /* 계정 저장을 쓸 수 없으면 브라우저 저장으로 계속 */ }
}

/* ---------- 머리말·요약 ---------- */
function meta() {
  $("#meta").innerHTML = `<span>가격 기준일 <b class="num">${DATA.quote_date}</b> 종가</span><span>갱신 <b class="num">${DATA.updated}</b> · 매주 토요일 자동</span>
    <span><b>${S.length}</b>개 종목 · ${SECTORS.length}개 섹터</span><span id="store" class="pill"></span>
    <span class="seg sm" id="updown" aria-label="등락 색"><button type="button" data-u="kr">상승 빨강</button><button type="button" data-u="us">상승 초록</button></span>`;
  const late = S.filter(stale).length;
  $("#pricenote").innerHTML = `표시된 가격은 <b>기준일 종가</b>이며 실시간 시세가 아닙니다. 종목을 누르면 일봉 차트와 함께 <b>실시간 시세 바로가기</b>(야후 파이낸스·구글 등)가 있습니다.` +
    (late ? ` 원천 페이지 갱신이 늦은 ${late}개 종목은 <span class="badge warn">지연</span> 표시와 함께 마지막 확인 날짜를 보여 줍니다.` : "");
  status(); updown();
}
function updown() { const u = document.documentElement.dataset.updown; document.querySelectorAll("#updown button").forEach(b => b.setAttribute("aria-pressed", b.dataset.u === u)); }
function stats() {
  const cnt = g => S.filter(s => s.grade === g).length;
  const ups = S.map(s => s.upside).filter(v => v != null);
  const avg = ups.reduce((a, b) => a + b, 0) / ups.length;
  const top = [...S].filter(s => s.upside != null && !s.note).sort((a, b) => b.upside - a.upside)[0];
  const same = S.filter(s => s.qdate === DATA.quote_date && s.dchg != null);
  const upN = same.filter(s => s.dchg > 0).length, dnN = same.filter(s => s.dchg < 0).length;
  const stars = S.filter(s => my(s.t).star), holds = S.filter(s => my(s.t).qty > 0), hits = S.filter(s => my(s.t).buy && s.price <= my(s.t).buy);
  $("#stats").innerHTML = `
    <div class="stat"><span class="k">종합등급</span><span class="v">A ${cnt("A")} · B ${cnt("B")} · C ${cnt("C")}</span><span class="s">A = 근거가 가장 두터운 종목</span></div>
    <div class="stat"><span class="k">${md(DATA.quote_date)} 등락</span><span class="v"><span class="pos">▲${upN}</span> · <span class="neg">▼${dnN}</span></span><span class="s">같은 날짜 종가가 있는 ${same.length}개 종목</span></div>
    <div class="stat"><span class="k">평균 목표가 상승여력</span><span class="v">${fmtPct(avg)}</span><span class="s">애널리스트 평균 목표가 기준</span></div>
    <div class="stat"><span class="k">목표가 여력 1위</span><span class="v">${esc(top.t)} ${fmtPct(top.upside)}</span><span class="s">${esc(top.name)}</span></div>
    <div class="stat"><span class="k">내 관심종목</span><span class="v">★ ${stars.length} · 보유 ${holds.length}</span><span class="s">${hits.length ? `매수 희망가 도달 ${hits.length}개: ${hits.map(s => s.t).join(", ")}` : "별표·희망가는 종목 상세에서 설정"}</span></div>`;
}

/* ---------- 필터 ---------- */
function chips() {
  $("#chips").innerHTML = `<button type="button" class="chip" data-s="" aria-pressed="${state.sectors.size === 0}">전체 섹터</button>` +
    SECTORS.map(k => `<button type="button" class="chip" data-s="${esc(k)}" aria-pressed="${state.sectors.has(k)}"><span class="dot" style="background:#${COLORS[k]}"></span>${esc(k)} <span class="na">${S.filter(s => s.major === k).length}</span></button>`).join("");
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
  let arr = S.filter(s => {
    const m = my(s.t);
    if (!state.grades.has(s.grade)) return false;
    if (state.scen && s.scen !== state.scen) return false;
    if (state.sectors.size && !state.sectors.has(s.major)) return false;
    if (state.mine === "star" && !m.star) return false;
    if (state.mine === "hold" && !(m.qty > 0)) return false;
    if (f.up > F0.up && !(s.upside != null && s.upside * 100 >= f.up)) return false;
    if (f.pe < F0.pe && !(s.fpe != null && s.fpe <= f.pe)) return false;
    if (f.div > 0 && !((s.div || 0) * 100 >= f.div)) return false;
    if (f.off > 0 && !(s.off52 != null && -s.off52 * 100 >= f.off)) return false;
    if (q && ![s.t, s.name, s.major, s.sub, s.desc, s.rev, s.thesis, m.memo].join(" ").toLowerCase().includes(q)) return false;
    return true;
  });
  const go = { A: 0, B: 1, C: 2 }, nz = (v, d) => v == null ? d : v;
  const gap = s => { const b = my(s.t).buy; return b ? s.price / b - 1 : 99; };
  const cmp = {
    grade: (a, b) => go[a.grade] - go[b.grade] || nz(b.upside, -9) - nz(a.upside, -9),
    upside: (a, b) => nz(b.upside, -9) - nz(a.upside, -9),
    msdisc: (a, b) => nz(b.msdisc, -9) - nz(a.msdisc, -9),
    dchg: (a, b) => nz(b.dchg, -9) - nz(a.dchg, -9),
    dchg_lo: (a, b) => nz(a.dchg, 9) - nz(b.dchg, 9),
    off52: (a, b) => nz(a.off52, 9) - nz(b.off52, 9),
    div: (a, b) => nz(b.div, -1) - nz(a.div, -1),
    fpe: (a, b) => nz(a.fpe, 9999) - nz(b.fpe, 9999),
    mcap: (a, b) => nz(b.mcap, 0) - nz(a.mcap, 0),
    chg: (a, b) => nz(b.chg, -9) - nz(a.chg, -9),
    buygap: (a, b) => gap(a) - gap(b),
  }[state.sort] || (() => 0);
  return arr.sort(cmp);
}

/* ---------- 카드·표 ---------- */
function spark(h) {
  if (!h || h.length < 2) return "";
  const cs = h.map(r => r[4]), mn = Math.min(...cs), mx = Math.max(...cs), rg = mx - mn || 1, W = 120, H = 38;
  const pts = cs.map((c, i) => `${(i / (cs.length - 1) * W).toFixed(1)},${(H - 3 - (c - mn) / rg * (H - 6)).toFixed(1)}`).join(" ");
  const up = cs[cs.length - 1] >= cs[0];
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="var(${up ? "--up" : "--down"})" stroke-width="1.6" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`;
}
function periodRet(s) { const h = s.h; if (!h || h.length < 2) return null; return h[h.length - 1][4] / h[0][4] - 1; }
function asof(s) {
  return `<span>${md(s.qdate)} 종가</span>${stale(s) ? `<span class="badge warn" title="원천 페이지의 마지막 가격이 ${esc(s.qdate)} 기준입니다">지연 · ${md(s.qdate)}</span>` : ""}${s.note ? '<span class="badge alert">인수 진행</span>' : ""}`;
}
function starBtn(s, cls = "") {
  const on = !!my(s.t).star;
  return `<button type="button" class="star ${cls}" data-star="${esc(s.t)}" aria-pressed="${on}" aria-label="${esc(s.t)} 관심종목 ${on ? "해제" : "추가"}" title="관심종목">${on ? STAR : STAR_O}</button>`;
}
function mineLine(s) {
  const m = my(s.t), out = [];
  if (m.buy) { const g = s.price / m.buy - 1; out.push(g <= 0 ? `<span class="hit">매수 희망가 ${fmtUsd(m.buy)} 도달</span>` : `매수 희망가 ${fmtUsd(m.buy)}까지 <b class="num">${(g * 100).toFixed(1)}%</b> 남음`); }
  if (m.qty > 0 && m.cost) { const r = s.price / m.cost - 1; out.push(`보유 ${m.qty}주 · 평단 ${fmtUsd(m.cost)} · 손익 ${fmtPct(r)} (<span class="num">${fmtUsd((s.price - m.cost) * m.qty).replace("$-", "-$")}</span>)`); }
  if (m.memo) out.push(`<span class="memo">메모: ${esc(m.memo)}</span>`);
  return out.length ? `<div class="mine">${out.map(x => `<div>${x}</div>`).join("")}</div>` : "";
}
function rangeBar(s) {
  if (s.lo == null || s.hi == null || s.hi <= s.lo) return "";
  const p = Math.max(0, Math.min(1, (s.price - s.lo) / (s.hi - s.lo))) * 100;
  return `<div class="range" title="52주 범위에서 현재가 위치"><div class="lbl"><span class="num">52주 최저 ${fmtUsd(s.lo)}</span><span class="num">최고 ${fmtUsd(s.hi)}</span></div>
    <div class="track"><span class="pin" style="left:${p.toFixed(1)}%;background:#${s.color}"></span></div></div>`;
}
function card(s) {
  const pr = periodRet(s);
  return `<article class="card" data-open="${esc(s.t)}">
    <div class="head">
      <span class="tk" style="background:#${s.color}">${esc(s.t)}</span>
      <div class="nm"><div class="n">${esc(s.name)}</div><div class="sub">${esc(s.major)} · ${esc(s.sub)}</div></div>
      <span class="grade g-${s.grade}" title="종합등급 ${s.grade}">${s.grade}</span>
      ${starBtn(s)}
    </div>
    <div class="px">
      <div><div class="big">${fmtUsd(s.price)}</div>
        <div class="chgline">${fmtPct2(s.dchg)} <span class="na" style="font-size:11.5px;font-family:var(--font-body)">${refLabel(s)}</span></div>
        <div class="asof">${asof(s)}</div></div>
      <div class="sp">${spark(s.h)}<span class="na">최근 ${s.h.length}거래일 ${pr == null ? "" : fmtPct(pr)}</span></div>
    </div>
    <p class="desc">${esc(s.desc)}</p>
    <div class="mets">
      <div class="m"><span class="k">목표가 여력</span><span class="v">${fmtPct(s.upside)}</span></div>
      <div class="m"><span class="k">모닝스타 할인</span><span class="v">${fmtPct(s.msdisc, false)}</span></div>
      <div class="m"><span class="k">예상 PER</span><span class="v">${fmtX(s.fpe)}</span></div>
      <div class="m"><span class="k">배당</span><span class="v">${fmtDiv(s.div)}</span></div>
      <div class="m"><span class="k">52주 고점比</span><span class="v">${fmtPct(s.off52)}</span></div>
      <div class="m"><span class="k">주간 변동</span><span class="v">${fmtPct(s.chg)}</span></div>
    </div>
    ${rangeBar(s)}
    ${mineLine(s)}
    <div class="tags"><span class="tag">${esc(s.scen)}</span><span class="tag">애널리스트 ${esc(s.rating)}</span><span class="tag">시총 ${fmtCap(s.mcap)}</span>${s.moat !== "미확인" ? `<span class="tag">해자 ${esc(s.moat)}</span>` : ""}</div>
    <button type="button" class="more" data-open="${esc(s.t)}">차트 · 상세 · 메모 →</button>
  </article>`;
}
function rowItem(s) {
  const m = my(s.t), hit = m.buy && s.price <= m.buy;
  return `<div class="rw" data-open="${esc(s.t)}" role="button" tabindex="0" aria-label="${esc(s.name)} 상세 보기">
    <span class="tk" style="background:#${s.color}">${esc(s.t)}</span>
    <div class="nm"><div class="n">${m.star ? '<span class="mystar">★</span> ' : ""}${esc(s.name)}</div>
      <div class="sub"><span class="grade gs g-${s.grade}">${s.grade}</span><span>여력 ${fmtPct(s.upside)}</span>${hit ? '<span class="hit">희망가 도달</span>' : m.qty > 0 && m.cost ? `<span>내 손익 ${fmtPct(s.price / m.cost - 1)}</span>` : `<span>${esc(s.major)}</span>`}</div></div>
    <div class="rsp">${spark(s.h)}</div>
    <div class="rp"><span class="p">${fmtUsd(s.price)}</span><span class="chgline">${fmtPct2(s.dchg)}</span>${stale(s) ? `<span class="badge warn">${md(s.qdate)}</span>` : ""}</div>
  </div>`;
}
const TCOLS = [["star", "★"], ["t", "티커"], ["name", "회사명"], ["grade", "등급", "", "grade"], ["price", "현재가", "r"], ["dchg", "전일 대비", "r", "dchg"],
  ["upside", "목표가 여력", "r", "upside"], ["msdisc", "모닝스타 할인", "r", "msdisc"], ["fpe", "예상 PER", "r", "fpe"], ["div", "배당", "r", "div"],
  ["off52", "52주 고점 대비", "r", "off52"], ["chg", "지난 갱신", "r", "chg"], ["spark", "최근 추이"], ["scen", "시나리오"]];
function table(arr) {
  const th = TCOLS.map(([k, h, c, so]) => `<th class="${c || ""}" ${so ? `data-sort="${so}"` : ""} ${state.sort === so ? 'aria-sort="descending"' : ""}>${h}</th>`).join("");
  const rows = arr.map(s => `<tr data-open="${esc(s.t)}">
    <td>${starBtn(s)}</td>
    <td><span class="tk" style="background:#${s.color}">${esc(s.t)}</span></td>
    <td><b>${esc(s.name)}</b><div class="na" style="font-size:12px">${esc(s.major)} · ${esc(s.sub)}</div></td>
    <td><span class="grade g-${s.grade}">${s.grade}</span></td>
    <td class="r num">${fmtUsd(s.price)}<div class="na" style="font-size:11px">${md(s.qdate)}${stale(s) ? " 지연" : ""}</div></td>
    <td class="r num">${fmtPct2(s.dchg)}</td><td class="r num">${fmtPct(s.upside)}</td>
    <td class="r num">${fmtPct(s.msdisc, false)}</td><td class="r num">${fmtX(s.fpe)}</td>
    <td class="r num">${s.div == null ? '<span class="na">—</span>' : (s.div * 100).toFixed(1) + "%"}</td>
    <td class="r num">${fmtPct(s.off52)}</td><td class="r num">${fmtPct(s.chg)}</td><td>${spark(s.h)}</td><td>${esc(s.scen)}</td></tr>`).join("");
  return `<div class="tablewrap"><table><thead><tr>${th}</tr></thead><tbody>${rows}</tbody></table></div>`;
}
function render() {
  const arr = filtered();
  state.list = arr.map(s => s.t);
  $("#count").textContent = `${arr.length}개 종목 표시 중`;
  const active = state.q || state.scen || state.sectors.size || state.mine || state.grades.size < 3 || JSON.stringify(state.f) !== JSON.stringify(F0);
  $("#reset").hidden = !active;
  $("#list").innerHTML = !arr.length ? `<div class="empty">${state.mine === "star" && !S.some(s => my(s.t).star) ? "아직 관심종목이 없습니다. 카드의 ☆를 눌러 추가하세요." :
      state.mine === "hold" && !S.some(s => my(s.t).qty > 0) ? "보유 종목이 없습니다. 종목 상세의 '내 기록'에 평균 매수가와 수량을 적으면 여기에 모입니다." :
      "조건에 맞는 종목이 없습니다. 필터를 넓혀 보세요."}</div>`
    : state.view === "card" ? `<div class="grid">${arr.map(card).join("")}</div>` : state.view === "rows" ? `<div class="rows">${arr.map(rowItem).join("")}</div>` : table(arr);
  document.querySelectorAll("#tabbar button").forEach(b => b.setAttribute("aria-pressed", b.dataset.tab === state.mine));
  const nAct = (state.scen ? 1 : 0) + (state.grades.size < 3 ? 1 : 0) + (JSON.stringify(state.f) !== JSON.stringify(F0) ? 1 : 0) + (state.sort !== "grade" ? 1 : 0);
  $("#obtn").textContent = nAct ? `필터·정렬 (${nAct})` : "필터·정렬";
  document.querySelectorAll("#view button").forEach(b => b.setAttribute("aria-pressed", b.dataset.v === state.view));
  document.querySelectorAll("#mine button").forEach(b => b.setAttribute("aria-pressed", b.dataset.m === state.mine));
  $("#sort").value = state.sort;
}
function guide() {
  $("#guide").innerHTML = DATA.sector_guide.map(g => `<div class="gc">
    <button type="button" class="chip" data-s="${esc(g[0])}" data-guide="1" style="justify-self:start"><span class="dot" style="background:#${COLORS[g[0]] || "888"}"></span><b>${esc(g[0])}</b></button>
    <div>${esc(g[1])}</div><div><span class="k">돈 버는 방식 · </span>${esc(g[2])}</div>
    <div><span class="k">금리 인상기 · </span>${esc(g[3])}</div><div><span class="k">금리 인하기 · </span>${esc(g[4])}</div>
    <div><span class="k">체크할 지표 · </span>${esc(g[5])}</div></div>`).join("");
  $("#foot").innerHTML = `가격·일봉·목표가·PER·배당: StockAnalysis.com (${DATA.quote_date} 종가 기준, 매주 토요일 자동 갱신) · 모닝스타 공정가치: 공개 기사 기준(비공개 종목은 '—') · 종합등급: 실적과 주가의 괴리, 밸류에이션, 이익 전망 방향, 재무·촉매 4가지 기준에 따른 스크리닝 분류입니다.<br>공개 자료를 정리한 참고용 도구이며 투자 권유나 금융 자문이 아닙니다. 매매 전에는 실시간 시세와 최신 공시를 꼭 확인하세요.`;
}

/* ---------- 상세 패널 ---------- */
const dlg = $("#dlg");
function liveLinks(t) {
  const T = encodeURIComponent(t), tl = t.toLowerCase();
  return `<div class="links">
    <a class="pri" href="https://finance.yahoo.com/quote/${T}/" target="_blank" rel="noopener">실시간 시세 · 야후 파이낸스 ↗</a>
    <a href="https://www.google.com/search?q=${T}+stock" target="_blank" rel="noopener">구글 시세 ↗</a>
    <a href="https://www.tradingview.com/symbols/${T}/" target="_blank" rel="noopener">트레이딩뷰 차트 ↗</a>
    <a href="https://stockanalysis.com/stocks/${tl}/" target="_blank" rel="noopener">StockAnalysis ↗</a>
    <a href="https://stockanalysis.com/stocks/${tl}/financials/" target="_blank" rel="noopener">재무제표 ↗</a>
    <a href="https://stockanalysis.com/stocks/${tl}/company/" target="_blank" rel="noopener">회사 개요 ↗</a>
    <a href="https://news.google.com/search?q=${T}%20stock&hl=ko&gl=KR&ceid=KR:ko" target="_blank" rel="noopener">뉴스 ↗</a>
    <a href="https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${T}&type=&dateb=&owner=include&count=40" target="_blank" rel="noopener">SEC 공시 ↗</a>
  </div>`;
}
function detailHtml(s) {
  const m = my(s.t), i = state.list.indexOf(s.t), h = s.h || [];
  const first = h.length ? iso(h[0][0]) : null, last = h.length ? iso(h[h.length - 1][0]) : null;
  const gapNote = last && last < s.qdate ? ` 차트의 마지막 봉은 ${md(last)}이며, 그 뒤 가격 ${fmtUsd(s.price)}(${md(s.qdate)})은 점선으로 표시했습니다.` : "";
  const hi = h.length ? Math.max(...h.map(r => r[2])) : null, lo = h.length ? Math.min(...h.map(r => r[3])) : null;
  return `
  <div class="dhead">
    <span class="tk" style="background:#${s.color};font-size:15px;padding:6px 10px">${esc(s.t)}</span>
    <div class="nm"><div class="n" id="dtitle" style="font-size:17px">${esc(s.name)}</div><div class="sub">${esc(s.major)} · ${esc(s.sub)} · ${esc(s.hq)}</div></div>
    <div class="ctl"><span class="grade g-${s.grade}" title="종합등급">${s.grade}</span>${starBtn(s, "dstar")}
      <button type="button" class="icon" data-nav="-1" aria-label="이전 종목" ${i <= 0 ? "disabled" : ""}><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2"/></svg></button>
      <button type="button" class="icon" data-nav="1" aria-label="다음 종목" ${i < 0 || i >= state.list.length - 1 ? "disabled" : ""}><svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2"/></svg></button>
      <button type="button" class="icon" data-close aria-label="닫기"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2"/></svg></button></div>
  </div>
  ${s.note ? `<div class="alertbox">⚠ ${esc(s.note)}</div>` : ""}
  <section class="panel">
    <div class="dprice"><span class="big">${fmtUsd(s.price)}</span><span class="chgline">${fmtPct2(s.dchg)} <span class="na" style="font-size:12.5px;font-family:var(--font-body)">${refLabel(s)}</span></span>
      <span class="asof" style="font-size:12.5px">${asof(s)}<span>· ${s.src_price === "일봉 종가" ? "일봉 확정 종가" : "시세 페이지 가격"}</span></span></div>
    ${liveLinks(s.t)}
    <div class="note" style="margin:0">위 가격은 ${esc(s.qdate)} 종가입니다. 장중 실시간 가격은 '실시간 시세' 링크에서 확인하세요.</div>
  </section>
  <section class="panel">
    <div class="ctop"><h3>일봉 차트</h3>
      <div class="seg sm" id="rng"><button type="button" data-r="22">1개월</button><button type="button" data-r="66">3개월</button><button type="button" data-r="132">6개월</button><button type="button" data-r="all">전체</button></div></div>
    <div class="ctop"><div class="legend" id="legend"></div>
      <div class="malgd">${[[5, "--ma1"], [20, "--ma2"], [60, "--ma3"]].map(([n, c]) => `<label><input type="checkbox" data-ma="${n}" ${state.ma[n] ? "checked" : ""} ${h.length < n ? "disabled" : ""}><i style="background:var(${c})"></i>${n}일선</label>`).join("")}</div></div>
    <div id="chart" role="img" aria-label="${esc(s.t)} 일봉 캔들 차트"></div>
    <div class="cnote">일봉 ${h.length}개 (${first ? md(first) : "—"} ~ ${last ? md(last) : "—"}) · 매주 토요일 새 일봉을 이어 붙여 기간이 계속 늘어납니다.${h.length < 60 ? " 60일선은 일봉이 60개 이상 쌓이면 표시됩니다." : ""}${gapNote}
      ${m.buy || m.cost ? " 점선: " + [m.buy ? "매수 희망가" : "", m.cost ? "평균 매수가" : ""].filter(Boolean).join(", ") + "." : ""}</div>
    <div class="kv">
      <div><span class="k">차트 기간 수익률</span><span class="v">${fmtPct(periodRet(s))}</span></div>
      <div><span class="k">차트 기간 최고</span><span class="v">${fmtUsd(hi)}</span></div>
      <div><span class="k">차트 기간 최저</span><span class="v">${fmtUsd(lo)}</span></div>
      <div><span class="k">52주 고점 대비</span><span class="v">${fmtPct(s.off52)}</span></div>
    </div>
    ${rangeBar(s)}
  </section>
  <section class="panel">
    <h3>밸류에이션 · 애널리스트</h3>
    <div class="kv">
      <div><span class="k">애널리스트 의견</span><span class="v">${esc(s.rating)}</span></div>
      <div><span class="k">평균 목표가</span><span class="v">${fmtUsd(s.tgt)}</span></div>
      <div><span class="k">목표가 상승여력</span><span class="v">${fmtPct(s.upside)}</span></div>
      <div><span class="k">시가총액</span><span class="v">${fmtCap(s.mcap)}</span></div>
      <div><span class="k">모닝스타 공정가치</span><span class="v">${s.fv ? fmtUsd(s.fv) : '<span class="na">비공개</span>'}</span></div>
      <div><span class="k">모닝스타 할인율</span><span class="v">${fmtPct(s.msdisc, false)}</span></div>
      <div><span class="k">해자 · 불확실성</span><span class="v" style="font-family:var(--font-body)">${esc(s.moat)} · ${esc(s.unc)}</span></div>
      <div><span class="k">배당수익률</span><span class="v">${fmtDiv(s.div)}</span></div>
      <div><span class="k">PER</span><span class="v">${fmtX(s.pe)}</span></div>
      <div><span class="k">예상 PER</span><span class="v">${fmtX(s.fpe)}</span></div>
      <div><span class="k">지난 갱신 대비</span><span class="v">${fmtPct(s.chg)}</span></div>
      <div><span class="k">시나리오</span><span class="v" style="font-family:var(--font-body)">${esc(s.scen)}</span></div>
    </div>
  </section>
  <section class="panel">
    <h3>내 기록</h3>
    <div class="form" data-form="${esc(s.t)}">
      <label>매수 희망가 ($)<input inputmode="decimal" data-f="buy" value="${m.buy ?? ""}" placeholder="예: ${(s.price * 0.9).toFixed(2)}"></label>
      <label>평균 매수가 ($)<input inputmode="decimal" data-f="cost" value="${m.cost ?? ""}" placeholder="보유 시 입력"></label>
      <label>보유 수량 (주)<input inputmode="decimal" data-f="qty" value="${m.qty ?? ""}" placeholder="0"></label>
      <label class="full">메모<textarea data-f="memo" placeholder="매수 이유, 확인할 실적 발표일, 손절 기준 등">${esc(m.memo || "")}</textarea></label>
    </div>
    <div class="calc" id="calc"></div>
    <div class="saved" id="savedmsg">${Store.mode === "db" ? "입력하면 내 계정에 자동 저장됩니다." : "입력하면 이 폰에 자동 저장됩니다. (상단 ⋯ 메뉴에서 백업)"}</div>
  </section>
  <section class="panel">
    <h3>사업 · 투자 포인트</h3>
    <dl class="txt">
      <dt>무슨 사업을 하나</dt><dd>${esc(s.desc)}</dd>
      <dt>주요 매출원 · 대표 제품</dt><dd>${esc(s.rev)}</dd>
      <dt>저평가 근거</dt><dd>${esc(s.val)}</dd>
      <dt>핵심 투자포인트</dt><dd>${esc(s.thesis)}</dd>
      <dt>주요 리스크</dt><dd>${esc(s.risk)}</dd>
      <dt>리서치 기준일</dt><dd class="num">${esc(s.mdate)}</dd>
    </dl>
  </section>
  <p class="note" style="margin:0">참고용 정리이며 투자 권유가 아닙니다. 방향키 ←/→로 이전·다음 종목, Esc로 닫습니다.</p>`;
}
function calc() {
  const s = BY[state.cur], el = $("#calc"); if (!s || !el) return;
  const m = my(s.t), out = [];
  if (m.buy) { const g = s.price / m.buy - 1; out.push(g <= 0 ? `<span class="hit">매수 희망가 도달 (현재가가 ${Math.abs(g * 100).toFixed(1)}% 아래)</span>` : `매수 희망가까지 <b class="num">${(g * 100).toFixed(1)}%</b> 하락 필요`); }
  if (m.cost && m.qty > 0) { out.push(`평가금액 <b class="num">${fmtUsd(s.price * m.qty)}</b>`, `평가손익 <b class="num">${fmtUsd((s.price - m.cost) * m.qty).replace("$-", "-$")}</b> ${fmtPct(s.price / m.cost - 1)}`); }
  if (m.cost && s.tgt) out.push(`평단 대비 목표가 ${fmtPct(s.tgt / m.cost - 1)}`);
  el.innerHTML = out.map(x => `<span>${x}</span>`).join("");
}
function openDetail(t) {
  const s = BY[t]; if (!s) return;
  state.cur = t;
  $("#dbody").innerHTML = detailHtml(s);
  if (!dlg.open) { try { dlg.showModal(); } catch (e) { dlg.setAttribute("open", ""); } }
  $("#dbody").parentElement.scrollTop = 0; dlg.scrollTop = 0;
  rangeBtns(); calc(); drawChart(s);
}
function closeDetail() { destroyChart(); state.cur = null; if (dlg.open) dlg.close(); }
function syncDrawerStar() {
  if (!state.cur) return; const b = $("#dbody .dstar"); if (!b) return;
  const on = !!my(state.cur).star; b.setAttribute("aria-pressed", on); b.innerHTML = on ? STAR : STAR_O;
}
function rangeBtns() { document.querySelectorAll("#rng button").forEach(b => b.setAttribute("aria-pressed", b.dataset.r === String(state.range))); }

/* ---------- 차트 ---------- */
let chart = null, lwP = null, chartSeries = null, chartBars = [];
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
function destroyChart() { if (chart) { try { chart.remove(); } catch (e) {} chart = null; chartSeries = null; } }
function sma(bars, n) { const out = []; let sum = 0; bars.forEach((b, i) => { sum += b.close; if (i >= n) sum -= bars[i - n].close; if (i >= n - 1) out.push({ time: b.time, value: +(sum / n).toFixed(4) }); }); return out; }
function legend(b, prev) {
  const el = $("#legend"); if (!el || !b) return;
  const c = prev ? b.close / prev.close - 1 : null, cls = b.close >= b.open ? "pos" : "neg";
  el.innerHTML = `<span>${b.time}</span><span><span class="k">시</span> ${b.open.toFixed(2)}</span><span><span class="k">고</span> ${b.high.toFixed(2)}</span><span><span class="k">저</span> ${b.low.toFixed(2)}</span><span><span class="k">종</span> <b class="${cls}">${b.close.toFixed(2)}</b></span>${c == null ? "" : `<span>${fmtPct2(c)}</span>`}`;
}
function applyRange() {
  if (!chart || !chartBars.length) return;
  const n = chartBars.length, r = state.range;
  if (r === "all" || +r >= n) chart.timeScale().fitContent();
  else chart.timeScale().setVisibleLogicalRange({ from: n - +r - 0.5, to: n + 1.5 });
}
function svgCandles(bars, s) {
  const W = 760, H = 320, P = 10, n = bars.length;
  const hi = Math.max(...bars.map(b => b.high)), lo = Math.min(...bars.map(b => b.low)), y = v => P + (hi - v) / ((hi - lo) || 1) * (H - 2 * P), bw = (W - 2 * P) / n;
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="100%" preserveAspectRatio="none">${bars.map((b, i) => {
    const x = P + i * bw + bw / 2, c = b.close >= b.open ? "var(--up)" : "var(--down)";
    return `<line x1="${x}" x2="${x}" y1="${y(b.high)}" y2="${y(b.low)}" stroke="${c}" vector-effect="non-scaling-stroke"/><rect x="${x - bw * .35}" width="${bw * .7}" y="${y(Math.max(b.open, b.close))}" height="${Math.max(1, Math.abs(y(b.open) - y(b.close)))}" fill="${c}"/>`;
  }).join("")}</svg><div class="cnote" style="position:absolute;left:8px;top:4px;background:var(--surface);padding:0 4px;border-radius:4px">간이 차트 (차트 모듈을 불러오지 못함) · 범위 ${fmtUsd(lo)} ~ ${fmtUsd(hi)}</div>`;
}
async function drawChart(s) {
  const box = $("#chart"); if (!box) return;
  destroyChart();
  chartBars = (s.h || []).map(r => ({ time: iso(r[0]), open: r[1], high: r[2], low: r[3], close: r[4] }));
  if (!chartBars.length) { box.innerHTML = `<div class="empty">일봉 데이터가 아직 없습니다. 다음 주간 갱신 때 채워집니다.</div>`; return; }
  legend(chartBars[chartBars.length - 1], chartBars[chartBars.length - 2]);
  let L;
  try { L = await loadLW(); } catch (e) { if (state.cur === s.t) box.innerHTML = svgCandles(chartBars, s); return; }
  if (state.cur !== s.t || !document.body.contains(box)) return;
  box.innerHTML = "";
  const cs = getComputedStyle(document.documentElement), v = n => cs.getPropertyValue(n).trim();
  chart = L.createChart(box, {
    autoSize: true,
    layout: { background: { type: "solid", color: v("--surface") }, textColor: v("--muted"), fontFamily: "IBM Plex Mono, ui-monospace, monospace", fontSize: 11 },
    grid: { vertLines: { color: v("--line") }, horzLines: { color: v("--line") } },
    rightPriceScale: { borderColor: v("--line"), scaleMargins: { top: 0.08, bottom: 0.06 } },
    timeScale: { borderColor: v("--line"), rightOffset: 2, fixLeftEdge: true },
    crosshair: { mode: 0 },
    localization: { locale: "ko-KR", dateFormat: "yyyy-MM-dd", priceFormatter: p => "$" + p.toFixed(2) },
    handleScale: { axisPressedMouseMove: true }, handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false }
  });
  const up = v("--up"), dn = v("--down");
  chartSeries = chart.addCandlestickSeries({ upColor: up, downColor: dn, borderUpColor: up, borderDownColor: dn, wickUpColor: up, wickDownColor: dn, priceLineVisible: false });
  chartSeries.setData(chartBars);
  [[5, "--ma1"], [20, "--ma2"], [60, "--ma3"]].forEach(([n, c]) => {
    if (!state.ma[n] || chartBars.length < n) return;
    const ln = chart.addLineSeries({ color: v(c), lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    ln.setData(sma(chartBars, n));
  });
  const m = my(s.t), dashed = L.LineStyle ? L.LineStyle.Dashed : 2;
  const lastBar = chartBars[chartBars.length - 1];
  if (lastBar.time < s.qdate) chartSeries.createPriceLine({ price: s.price, color: v("--fg"), lineWidth: 1, lineStyle: dashed, axisLabelVisible: true, title: `${md(s.qdate)} 가격` });
  if (m.buy) chartSeries.createPriceLine({ price: m.buy, color: v("--good"), lineWidth: 2, lineStyle: dashed, axisLabelVisible: true, title: "매수 희망가" });
  if (m.cost) chartSeries.createPriceLine({ price: m.cost, color: v("--star"), lineWidth: 2, lineStyle: dashed, axisLabelVisible: true, title: "평단" });
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
document.addEventListener("click", e => {
  const st = e.target.closest("[data-star]");
  if (st) { e.stopPropagation(); const t = st.dataset.star; setMy(t, { star: !my(t).star }); stats(); render(); syncDrawerStar(); return; }
  const u = e.target.closest("#updown button");
  if (u) { document.documentElement.dataset.updown = u.dataset.u; LS.set("wl-updown", u.dataset.u); updown(); render(); if (state.cur) drawChart(BY[state.cur]); return; }
  if (e.target.closest("#dlg")) {
    if (e.target === dlg || e.target.closest("[data-close]")) { closeDetail(); return; }
    const nv = e.target.closest("[data-nav]"); if (nv) { nav(+nv.dataset.nav); return; }
    const rb = e.target.closest("#rng button"); if (rb) { state.range = rb.dataset.r; LS.set("wl-range", state.range); rangeBtns(); applyRange(); return; }
    return;
  }
  if (e.target.closest("a")) return;
  const chip = e.target.closest("[data-s]");
  if (chip) {
    const k = chip.dataset.s;
    if (!k) state.sectors.clear();
    else if (chip.dataset.guide) { state.sectors = new Set([k]); $("#list").scrollIntoView({ behavior: "smooth" }); }
    else state.sectors.has(k) ? state.sectors.delete(k) : state.sectors.add(k);
    chips(); render(); return;
  }
  const g = e.target.closest("#grades button");
  if (g) { const v = g.dataset.g; if (state.grades.has(v) && state.grades.size > 1) state.grades.delete(v); else state.grades.add(v);
    g.setAttribute("aria-pressed", state.grades.has(v)); render(); return; }
  const mb = e.target.closest("#mine button"); if (mb) { state.mine = mb.dataset.m; render(); return; }
  const v = e.target.closest("#view button");
  if (v) { state.view = v.dataset.v; LS.set("wl-view", state.view); render(); return; }
  if (e.target.closest("#fbtn")) { const f = $("#filters"); f.hidden = !f.hidden; $("#fbtn").setAttribute("aria-expanded", !f.hidden); return; }
  const tb = e.target.closest("#tabbar button");
  if (tb) {
    if (tb.dataset.tab === "guide") { $("#gh").scrollIntoView({ behavior: "smooth" }); return; }
    state.mine = tb.dataset.tab; render(); window.scrollTo({ top: listTop(), behavior: "smooth" }); return;
  }
  if (e.target.closest("#obtn")) { sheet(true); return; }
  if (e.target.closest("#cclose, #capply, #scrim")) { sheet(false); return; }
  if (e.target.closest("#reset, #reset2")) {
    Object.assign(state, { q: "", scen: "", mine: "", f: { ...F0 } }); state.grades = new Set(["A","B","C"]); state.sectors.clear();
    $("#q").value = ""; $("#scen").value = ""; ["fu","fp","fd","fo"].forEach((id, i) => $("#" + id).value = [F0.up, F0.pe, F0.div, F0.off][i]);
    document.querySelectorAll("#grades button").forEach(b => b.setAttribute("aria-pressed", "true")); fLabels(); chips(); render(); return;
  }
  const th = e.target.closest("th[data-sort]"); if (th) { state.sort = th.dataset.sort; render(); return; }
  const op = e.target.closest("[data-open]"); if (op && !e.target.closest("button:not([data-open])")) openDetail(op.dataset.open);
});
const listTop = () => { const st = $("#stats"); return st.offsetTop + st.offsetHeight + 4; };
function sheet(open) {
  $("#ctrls").classList.toggle("open", open); $("#scrim").hidden = !open; $("#obtn").setAttribute("aria-expanded", open);
  document.body.style.overflow = open ? "hidden" : ""; document.body.classList.toggle("sheet-open", open);
  if (!open) window.scrollTo({ top: Math.min(window.scrollY, listTop()), behavior: "smooth" });
}
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && $("#ctrls").classList.contains("open")) { sheet(false); return; }
  const rw = e.target.closest && e.target.closest(".rw");
  if (rw && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openDetail(rw.dataset.open); }
});
function nav(d) { const i = state.list.indexOf(state.cur), j = i + d; if (i >= 0 && j >= 0 && j < state.list.length) openDetail(state.list[j]); }
dlg.addEventListener("close", () => { destroyChart(); state.cur = null; });
dlg.addEventListener("keydown", e => {
  if (e.target.closest("input, textarea")) return;
  if (e.key === "ArrowLeft") { e.preventDefault(); nav(-1); } else if (e.key === "ArrowRight") { e.preventDefault(); nav(1); }
});
const numOf = v => { const x = parseFloat(String(v).replace(/[,$\s]/g, "")); return isFinite(x) && x > 0 ? x : null; };
let redrawT = null;
dlg.addEventListener("input", e => {
  const inp = e.target.closest("[data-f]"); if (!inp || !state.cur) return;
  const t = state.cur, f = inp.dataset.f;
  setMy(t, { [f]: f === "memo" ? inp.value : numOf(inp.value) });
  $("#savedmsg").textContent = "저장 중…"; if (Store.mode !== "db") setTimeout(() => flash("이 폰에 저장됨"), 400);
  calc(); stats(); render();
  if (f === "buy" || f === "cost") { clearTimeout(redrawT); redrawT = setTimeout(() => state.cur === t && drawChart(BY[t]), 700); }
});
dlg.addEventListener("change", e => {
  const cb = e.target.closest("[data-ma]"); if (!cb) return;
  state.ma = { ...state.ma, [cb.dataset.ma]: cb.checked }; LS.set("wl-ma", state.ma); drawChart(BY[state.cur]);
});
$("#q").addEventListener("input", e => { state.q = e.target.value; render(); });
$("#scen").addEventListener("change", e => { state.scen = e.target.value; render(); });
$("#sort").addEventListener("change", e => { state.sort = e.target.value; render(); });
[["fu", "up"], ["fp", "pe"], ["fd", "div"], ["fo", "off"]].forEach(([id, k]) => $("#" + id).addEventListener("input", e => { state.f[k] = +e.target.value; fLabels(); render(); }));

meta(); stats(); chips(); fLabels(); guide(); render(); initDb();

/* ---------- 설치형 앱 전용: 메뉴(새로고침·백업/복원·정보), 뒤로가기, 오프라인·새 데이터 알림 ---------- */
(function appExtra() {
  const css = document.createElement("style");
  css.textContent = `
  header.top { position: relative; padding-right: 48px }
  #appmenu-btn { position: absolute; right: 0; top: 0 }
  .amenu { position: absolute; right: 0; top: 42px; z-index: 60; background: var(--surface); border: 1px solid var(--line); border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,.2); min-width: 210px; padding: 6px; display: grid }
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
