"""설치형 앱(PWA) 만들기: tools/dashboard_template.html + tools/data.json → site/
   사용: cd tools && python3 build.py <날짜> && python3 build_app.py
   - site/index.html  : 화면 틀(스타일·마크업) + 데이터 로더
   - site/app.js      : 대시보드 로직(템플릿의 스크립트) + 앱 전용 기능
   - site/data.json   : 시세·리서치·일봉 (매주 이 파일만 바뀌면 앱 내용이 갱신됨)
   - site/sw.js       : 오프라인 캐시(서비스 워커)
"""
import json, os, re, shutil, hashlib
HERE = os.path.dirname(os.path.abspath(__file__)); SITE = os.path.join(HERE, "..", "site")
tpl = open(os.path.join(HERE, "dashboard_template.html"), encoding="utf-8").read()
data = json.load(open(os.path.join(HERE, "data.json"), encoding="utf-8"))

m = re.search(r"^<script>\n(.*)^</script>", tpl, re.S | re.M)
js, markup = m.group(1), tpl[:m.start()]
title = re.search(r"<title>(.*?)</title>", markup).group(1)
markup = re.sub(r"<title>.*?</title>\n", "", markup)
assert "const DATA = __DATA__;" in js
js = js.replace("const DATA = __DATA__;", "const DATA = window.__DATA;")
js = js.replace('"관심종목·메모: 이 브라우저에 저장"', '"관심종목·메모: 이 폰에 저장"').replace('flash("이 브라우저에 저장됨")', 'flash("이 폰에 저장됨")')
js = js.replace('"입력하면 이 브라우저에 자동 저장됩니다."', '"입력하면 이 폰에 자동 저장됩니다. (상단 ⋯ 메뉴에서 백업)"')
extra = open(os.path.join(HERE, "app_extra.js"), encoding="utf-8").read()
app_js = "(() => {\n" + js + "\n" + extra + "\n})();\n"
open(os.path.join(SITE, "app.js"), "w", encoding="utf-8").write(app_js)
json.dump(data, open(os.path.join(SITE, "data.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
# 종목별 일봉 묶음(상세 화면에서 필요할 때 불러옴)
dst = os.path.join(SITE, "hchunks"); os.makedirs(dst, exist_ok=True)
for f in os.listdir(dst): os.remove(os.path.join(dst, f))
src = os.path.join(HERE, "hchunks")
if os.path.isdir(src):
    for f in os.listdir(src): shutil.copy(os.path.join(src, f), os.path.join(dst, f))

ver = hashlib.sha1((app_js + markup).encode()).hexdigest()[:10]
index = f"""<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#1F3864">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="저평가 워치">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icons/icon-192.png">
<link rel="apple-touch-icon" href="icons/apple-180.png">
<title>{title}</title>
</head>
<body>
{markup}
<div id="boot" style="position:fixed;inset:0;display:grid;place-items:center;background:var(--bg);color:var(--muted);font-size:14px;z-index:100">불러오는 중…</div>
<script>
window.LW_SRCS = ["vendor/lightweight-charts.js", "https://cdn.jsdelivr.net/npm/lightweight-charts@4.2.0/dist/lightweight-charts.standalone.production.js"];
window.APP_VERSION = "{ver}";
(async () => {{
  const boot = document.getElementById("boot");
  try {{
    const r = await fetch("data.json", {{ cache: "no-cache" }});
    if (!r.ok) throw new Error(r.status);
    window.__DATA = await r.json();
  }} catch (e) {{
    boot.textContent = "데이터를 불러오지 못했습니다. 인터넷 연결을 확인한 뒤 다시 열어 주세요.";
    return;
  }}
  const s = document.createElement("script"); s.src = "app.js?v={ver}";
  s.onload = () => boot.remove();
  s.onerror = () => boot.textContent = "앱 파일을 불러오지 못했습니다. 다시 열어 주세요.";
  document.body.appendChild(s);
}})();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {{}});
</script>
</body>
</html>
"""
open(os.path.join(SITE, "index.html"), "w", encoding="utf-8").write(index)

manifest = {"name": "저평가 우량주 워치리스트", "short_name": "저평가 워치", "lang": "ko", "start_url": "./", "scope": "./",
            "display": "standalone", "orientation": "portrait", "background_color": "#F3F5F7", "theme_color": "#1F3864",
            "description": "저평가 우량주 86종목 · 일봉 차트 · 관심종목과 메모",
            "icons": [{"src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png"},
                      {"src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png"},
                      {"src": "icons/maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"}]}
json.dump(manifest, open(os.path.join(SITE, "manifest.webmanifest"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)

sw = f"""// 오프라인 캐시: 앱 틀은 캐시 우선, data.json은 네트워크 우선(실패 시 마지막 데이터)
const CACHE = "sw-{ver}";
const SHELL = ["./", "index.html", "app.js?v={ver}", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "vendor/lightweight-charts.js"];
self.addEventListener("install", e => {{
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {{}})))).then(() => self.skipWaiting()));
}});
self.addEventListener("activate", e => {{
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
}});
self.addEventListener("fetch", e => {{
  const req = e.request; if (req.method !== "GET") return;
  const url = new URL(req.url);
  const netFirst = url.origin === location.origin && (url.pathname.endsWith("/data.json") || req.mode === "navigate");
  if (netFirst) {{
    e.respondWith(fetch(req).then(r => {{ const cp = r.clone(); caches.open(CACHE).then(c => c.put(req, cp)); return r; }})
      .catch(() => caches.match(req, {{ ignoreSearch: true }}).then(r => r || caches.match("index.html"))));
    return;
  }}
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {{
    if (r.ok && (url.origin === location.origin || url.hostname.endsWith("jsdelivr.net") || url.hostname.endsWith("gstatic.com") || url.hostname.endsWith("googleapis.com"))) {{
      const cp = r.clone(); caches.open(CACHE).then(c => c.put(req, cp));
    }}
    return r;
  }})));
}});
"""
open(os.path.join(SITE, "sw.js"), "w", encoding="utf-8").write(sw)
print("site 생성 · 버전", ver, "· data.json", os.path.getsize(os.path.join(SITE, "data.json")), "bytes")
