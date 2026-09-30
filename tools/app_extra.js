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
