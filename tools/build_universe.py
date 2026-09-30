"""전 종목 데이터 만들기: 미국(S&P 500·나스닥 100·러셀 2000·S&P 400/600 + 시가총액 1억 달러 이상 상장주) · 국내(코스피·코스닥 전 종목)

입력(모두 공개 GitHub 저장소를 git으로 받아 둔 경로):
  --us   us/snap.json                         (us_snapshots.py 결과: 날짜 확정된 미국 종가·거래량)
  --etf  /tmp/ie/tickers                      (github.com/major/index-etfs: SPY·QQQ·IWM·MDY·SPSM 보유 종목)
  --kr   /tmp/marcap/data                     (github.com/FinanceData/marcap: KRX 일별 시세, 날짜 포함)
  --krx  /tmp/fdr_krx_data_cache/data         (github.com/FinanceData/fdr_krx_data_cache: 최신 시세 스냅샷·업종)
출력:
  universe.json      요약(모든 종목 1줄씩)
  hchunks/NN.js      종목별 일봉 묶음(상세 화면에서 필요할 때 불러옴)
  universe_report.txt 검증 결과
"""
import json, os, re, csv, glob, sys, datetime as dt
from parquet_mini import read_parquet

A = dict(a.split("=", 1) for a in sys.argv[1:] if "=" in a)
US = A.get("--us", "us/snap.json"); ETF = A.get("--etf", "/tmp/ie/tickers")
KR = A.get("--kr", "/tmp/marcap/data"); KRX = A.get("--krx", "/tmp/fdr_krx_data_cache/data")
NCHUNK = 96
report = []
def log(*x): s = " ".join(str(v) for v in x); print(s); report.append(s)

def chunk_of(t):  # 앱의 JS와 같은 규칙
    h = 0
    for ch in t: h = (h * 31 + ord(ch)) % 1000003
    return h % NCHUNK

SEC_US = {"Technology": "정보기술", "Telecommunications": "커뮤니케이션서비스", "Health Care": "헬스케어", "Finance": "금융",
          "Real Estate": "부동산(리츠)", "Consumer Discretionary": "임의소비재", "Consumer Staples": "필수소비재", "Industrials": "산업재",
          "Basic Materials": "소재", "Energy": "에너지", "Utilities": "유틸리티", "Miscellaneous": "기타"}
KR_RULES = [  # (업종 이름에 들어있는 말, 섹터) — 위에서부터 먼저 맞는 것
    (("반도체",), "정보기술"), (("전자부품", "컴퓨터", "통신 및 방송 장비", "영상 및 음향기기", "측정, 시험", "소프트웨어", "정보서비스", "자료처리", "컴퓨터 프로그래밍"), "정보기술"),
    (("전기 통신", "통신업", "방송업", "영화", "오디오물", "출판업", "광고업", "창작 및 예술"), "커뮤니케이션서비스"),
    (("의약", "의료", "생물학적", "자연과학 및 공학 연구"), "헬스케어"),
    (("은행", "금융", "보험", "증권", "신탁", "투자"), "금융"),
    (("부동산",), "부동산(리츠)"),
    (("석유", "원유", "석탄", "천연가스"), "에너지"),
    (("전기업", "가스 제조", "증기", "수도"), "유틸리티"),
    (("식료품", "음료", "담배", "곡물", "도축", "수산물", "낙농", "작물", "과실", "동물용 사료", "식품"), "필수소비재"),
    (("자동차", "의복", "섬유", "신발", "가죽", "가구", "가정용", "소매업", "숙박", "음식점", "여행", "오락", "스포츠", "교육", "유원지", "악기", "귀금속", "시계"), "임의소비재"),
    (("화학", "고무", "플라스틱", "1차", "금속", "비금속", "펄프", "종이", "목재", "비료", "유리", "시멘트"), "소재"),
    (("기계", "전기장비", "전동기", "절연선", "일차전지", "축전지", "건설", "건축", "운송", "항공", "선박", "해운", "창고", "사업지원", "전문", "엔지니어링", "무기", "철도", "경비", "인력", "폐기물", "도매"), "산업재"),
    (("회사 본부", "지주"), "지주회사"),
]
def kr_sector(ind):
    for keys, sec in KR_RULES:
        if any(k in (ind or "") for k in keys): return sec
    return "기타"

rows_out = {}   # t → 요약
def avgvol(h, col):
    vs = [r[col] for r in h[-21:-1] if len(r) > col and r[col]]
    return round(sum(vs) / len(vs)) if len(vs) >= 10 else None
hist_out = {}   # t → 일봉

# ================= 미국 =================
snap = json.load(open(US))
dates = snap["dates"]; L = snap["latest"]
tags = {}
for f, tag in (("spy", "SP500"), ("qqq", "NDX"), ("iwm", "R2000"), ("mdy", "SP400"), ("spsm", "SP600")):
    for l in open(os.path.join(ETF, f + ".txt")):
        t = l.strip().upper().replace("-", ".").replace("/", ".")
        if t: tags.setdefault(t, set()).add(tag)
norm = lambda t: t.replace("/", ".").upper()
BAD = re.compile(r"\b(warrants?|rights?|units)\b|preferred (stock|shares?|securities)|series [a-z] preferred|depositary shares? representing|notes? due|debentures|subordinated|\d%", re.I)
EXN = {"nasdaq": "나스닥", "nyse": "NYSE", "amex": "NYSE American"}
splits = []
us_last = dates[-1]
for sym, meta in L.items():
    if "^" in sym: continue
    T = norm(sym); tg = tags.get(T, set()); nm = meta.get("name") or ""
    if BAD.search(nm) and "American Depositary" not in nm: continue
    mc = meta.get("mcap") or 0
    if not tg and mc < 1e8: continue
    ser = snap["data"].get(sym) or []
    pts = [(i, d, v) for i, (d, v) in enumerate(zip(dates, ser)) if v]
    h = [[int(d), v[0], v[1]] if v[1] is not None else [int(d), v[0]] for i, d, v in pts]
    if len(h) < 2: continue
    # 액면분할·병합 보정: 그날 스냅샷의 '전일 종가(조정)'가 저장된 전일 종가와 크게 다르면 그 이전 값을 비율대로 조정
    for j in range(1, len(pts)):
        i, d, v = pts[j]; pi = pts[j - 1][0]
        adj = v[2] if len(v) > 2 else None
        if adj and pi == i - 1 and h[j - 1][1] > 0:
            r = adj / h[j - 1][1]
            if r > 1.2 or r < 0.8:   # 분할·병합만(배당락 등 작은 차이는 원래 가격 유지)
                for k in range(j):
                    h[k][1] = round(h[k][1] * r, 4)
                    if len(h[k]) > 2 and h[k][2] is not None: h[k][2] = int(h[k][2] / r)
                splits.append(f"{T} {d} 비율 {r:.4f}")
    last = h[-1]; prev = h[-2]
    name = re.sub(r"\s*\((DE|MD|NV|TX|Delaware|Maryland|Nevada)\)\s*$", "", nm)
    name = re.sub(r"\s+(Class [A-Z] )?(Common Stock|Ordinary Shares?|Common Shares?|Subordinate Voting Shares|American Depositary Shares?|Depositary Shares?|Shares of Beneficial Interest|Common Units?|Units? representing).*$", "", name).strip() or T
    closes = [r[1] for r in h]
    rows_out[T] = {"t": T, "n": name, "m": "US", "x": EXN.get(meta.get("ex"), meta.get("ex")), "s": SEC_US.get(meta.get("sector") or "", "기타"),
                   "i": meta.get("industry") or "", "p": last[1], "d": str(last[0]), "pd": str(prev[0]), "pp": prev[1],
                   "v": last[2] if len(last) > 2 else None, "mc": mc or None, "hi": max(closes), "lo": min(closes), "rd": str(h[0][0]),
                   "ix": sorted(tg), "cur": "USD", "va": avgvol(h, 2)}
    hist_out[T] = h
log("미국 분할·병합 보정", len(splits), splits[:12])
log("미국 종목", sum(1 for r in rows_out.values() if r["m"] == "US"), "· 날짜", dates[0], "~", us_last)
for tag in ("SP500", "NDX", "R2000", "SP400", "SP600"):
    want = {t for t, g in tags.items() if tag in g}; got = {t for t in want if t in rows_out}
    log(f"  {tag}: 목록 {len(want)} · 수록 {len(got)} · 빠짐 {sorted(want - got)[:25]}")

# ================= 국내 =================
def load_marcap(path):
    d, info = read_parquet(path, ["Code", "Name", "Market", "Open", "High", "Low", "Close", "Volume", "Amount", "Marcap", "Date", "Changes"])
    lg = info["Date"]["logical"] or {}
    unit = {1: 1e3, 2: 1e6, 3: 1e9}.get(next(iter((lg.get(8) or {}).get(2, {2: {}}))), 1e6)   # 밀리/마이크로/나노초
    if info["Date"]["type"] == 3: raise ValueError("INT96 날짜는 지원 안 함")
    out = {}
    for i in range(len(d["Code"])):
        day = (dt.datetime(1970, 1, 1) + dt.timedelta(seconds=d["Date"][i] / unit)).strftime("%Y%m%d")
        out.setdefault(d["Code"][i], []).append((day, d["Open"][i], d["High"][i], d["Low"][i], d["Close"][i], d["Volume"][i], d["Amount"][i], d["Marcap"][i], d["Name"][i], d["Market"][i], (d["Close"][i] - d["Changes"][i]) if d["Changes"][i] is not None else None))
    return out
KRD = {}
for f in sorted(glob.glob(os.path.join(KR, "marcap-20*.parquet")))[-2:]:
    for code, rs in load_marcap(f).items(): KRD.setdefault(code, []).extend(rs)
for code in KRD: KRD[code].sort()
kr_days = sorted({r[0] for rs in KRD.values() for r in rs})
kr_last = kr_days[-1]
log("국내 marcap 날짜", kr_days[0], "~", kr_last, len(kr_days), "일")

# marcap 이후 날짜: KRX 스냅샷을 '전일 종가 연결'로만 이어 붙임
def fnum(x):
    try: return float(x)
    except (TypeError, ValueError): return None
snaps = []
for f in sorted(glob.glob(os.path.join(KRX, "listing/krx/*.csv"))):
    day = os.path.basename(f)[:10].replace("-", "")
    if day <= kr_last: continue
    rs = {}
    for x in csv.DictReader(open(f, encoding="utf-8-sig")):
        c, ch = fnum(x.get("Close")), fnum(x.get("Changes"))
        if c is None: continue
        rs[x["Code"]] = {"c": c, "pc": c - ch if ch is not None else None, "o": fnum(x.get("Open")), "h": fnum(x.get("High")), "l": fnum(x.get("Low")),
                         "v": fnum(x.get("Volume")), "a": fnum(x.get("Amount")), "mc": fnum(x.get("Marcap")), "n": x.get("Name"), "mk": x.get("Market")}
    snaps.append((day, rs))
# KRX 스냅샷의 'Close'는 저녁 수집 시 시간외 단일가가 섞일 수 있어 그대로 쓰지 않는다.
# 그날의 공식 종가는 '다음 거래일 스냅샷의 전일 기준가(Close - Changes)'로 확정한다. 확정할 수 없는 가장 최근 날은 넣지 않는다.
def same_ratio(a, b, key_a, key_b, n=1500):
    tot = ok = 0
    for code, x in list(a.items())[:n]:
        y = b.get(code)
        if not y or x.get(key_a) is None or y.get(key_b) is None: continue
        tot += 1; ok += abs(x[key_a] - y[key_b]) < 0.5
    return ok / tot if tot >= 500 else 0
tsnaps = []
for day, rs in snaps:
    if dt.date(int(day[:4]), int(day[4:6]), int(day[6:])).weekday() >= 5: continue
    if tsnaps and same_ratio(tsnaps[-1][1], rs, "c", "c") > 0.9 and same_ratio(tsnaps[-1][1], rs, "pc", "pc") > 0.9: continue   # 같은 날 반복
    tsnaps.append((day, rs))
last_off = {code: {"c": rs[-1][4]} for code, rs in KRD.items() if rs[-1][0] == kr_last}
appended = []
for k, (day, rs) in enumerate(tsnaps):
    if same_ratio(last_off, rs, "c", "pc") < 0.95:
        log("  KRX 스냅샷", day, "이 앞 날짜와 이어지지 않아 중단"); break
    if k + 1 >= len(tsnaps): log("  KRX 스냅샷", day, "은 다음 날 자료로 종가를 확정할 수 없어 아직 넣지 않음"); break
    nday, nrs = tsnaps[k + 1]
    near = [abs(nrs[c]["pc"] - r["c"]) / r["c"] <= 0.1001 for c, r in list(rs.items())[:1500] if c in nrs and nrs[c]["pc"] and r["c"]]
    exact = same_ratio(rs, nrs, "c", "pc")
    log(f"  KRX {day}→{nday}: 다음날 기준가와 정확히 같은 비율 {exact:.2f}, ±10% 이내 비율 {sum(near)/max(1,len(near)):.3f}")
    if not near or sum(near) / len(near) < 0.97: log("  KRX 스냅샷", day, "다음 스냅샷과 이어지지 않아 중단"); break
    for code, r in rs.items():
        off = nrs.get(code, {}).get("pc")
        if off is None: continue
        c = off; o = r["o"] or c; hh = max(r["h"] or c, c, o); ll = min(r["l"] or c, c, o)
        KRD.setdefault(code, []).append((day, o, hh, ll, c, r["v"] or 0, r["a"] or 0, r["mc"] or 0, r["n"], r["mk"], r["pc"]))
    last_off = {code: {"c": nrs[code]["pc"]} for code in rs if code in nrs and nrs[code]["pc"] is not None}
    appended.append(day); kr_last = day
log("KRX 스냅샷으로 이어 붙인 날짜", appended)

desc = {}
dfiles = sorted(glob.glob(os.path.join(KRX, "listing/desc/*.csv")))
if dfiles:
    for x in csv.DictReader(open(dfiles[-1], encoding="utf-8-sig")): desc[x["Code"]] = x
KRMK = {"KOSPI": "코스피", "KOSDAQ": "코스닥", "KOSDAQ GLOBAL": "코스닥"}
kr_adj = []
nkr = 0
for code, rs in KRD.items():
    last = rs[-1]
    if last[9] not in KRMK: continue                 # 코넥스 등 제외
    if "스팩" in (last[8] or ""): continue
    if days_off := (dt.date(int(kr_last[:4]), int(kr_last[4:6]), int(kr_last[6:])) - dt.date(int(last[0][:4]), int(last[0][4:6]), int(last[0][6:]))).days > 20:
        continue                                      # 상장폐지·장기 거래정지
    rs = [list(r) for r in rs[-260:]]
    for j in range(1, len(rs)):                        # 액면분할·병합·무상증자 등 기준가 조정 반영
        adj, pc = (rs[j][10] if len(rs[j]) > 10 else None), rs[j - 1][4]
        if adj and pc:
            ratio = adj / pc
            if abs(ratio - 1) > 0.02:
                for q in range(j):
                    for col in (1, 2, 3, 4): rs[q][col] = rs[q][col] * ratio if rs[q][col] else rs[q][col]
                    rs[q][5] = (rs[q][5] or 0) / ratio
                kr_adj.append(f"{code} {last[8]} {rs[j][0]} 비율 {ratio:.4f}")
    h = []
    for r in rs[-250:]:
        o, hh, ll, c = r[1], r[2], r[3], r[4]
        if not c: continue
        if not o or not hh or not ll: o = hh = ll = c   # 거래정지일 등
        h.append([int(r[0]), round(o, 2), round(max(hh, o, c), 2), round(min(ll, o, c), 2), round(c, 2), int(r[5] or 0)])
    if len(h) < 2: continue
    y = rs[-250:]
    hi = max(r[2] or r[4] for r in y); lo = min((r[3] or r[4]) for r in y if (r[3] or r[4]))
    ds = desc.get(code, {})
    rows_out[code] = {"t": code, "n": last[8], "m": "KR", "x": KRMK[last[9]], "s": kr_sector(ds.get("Industry")), "i": ds.get("Industry") or "",
                      "p": h[-1][4], "d": str(h[-1][0]), "pd": str(h[-2][0]), "pp": h[-2][4], "v": h[-1][5], "tv": last[6] or None,
                      "mc": last[7] or None, "hi": hi, "lo": lo, "rd": y[0][0], "ix": [], "cur": "KRW", "prod": (ds.get("Products") or "")[:80], "va": avgvol(h, 5)}
    hist_out[code] = h; nkr += 1
log("국내 기준가 조정(분할·병합 등)", len(kr_adj), kr_adj[:10])
log("국내 종목", nkr, "· 마지막 날짜", kr_last)

# ================= 검증 =================
H = json.load(open("history.json")) if os.path.exists("history.json") else {}
bad = chk = 0
for t, rows in H.items():
    if t not in hist_out: continue
    mine = {r[0]: r for r in hist_out[t]}
    for r in rows:
        m = mine.get(r[0])
        if not m: continue
        c = m[4] if len(m) > 3 else m[1]
        chk += 1
        if abs(c - r[4]) > max(0.011, r[4] * 0.002): bad += 1; report.append(f"  불일치 {t} {r[0]} 기준 {r[4]} / 전체 데이터 {c}")
log(f"검증(기존 일봉과 대조): {chk}개 값 중 불일치 {bad}")
# 값 점검
for t, r in rows_out.items():
    assert r["p"] > 0 and r["pp"] > 0, t
    assert r["d"] > r["pd"], t
    ch = r["p"] / r["pp"] - 1
    if abs(ch) > 0.6: report.append(f"  큰 등락 확인 필요: {t} {r['n']} {ch:+.1%}")

# ================= 저장 =================
# 골라보기용 지표(서버에서 미리 계산): 기간 수익률, RSI(14), 이동평균 교차, 연속 상승·하락 일수
def stats(h):
    cs = [(r[4] if len(r) > 3 else r[1]) for r in h]
    n = len(cs); out = {}
    for k, lb in (("r5", 5), ("r20", 20), ("r60", 60), ("r120", 120), ("r250", 245)):
        out[k] = round(cs[-1] / cs[-1 - lb] - 1, 4) if n > lb and cs[-1 - lb] else None
    if n > 15:
        g = l = 0.0
        for i in range(1, 15): d = cs[i] - cs[i - 1]; g += max(d, 0); l += max(-d, 0)
        g /= 14; l /= 14
        for i in range(15, n): d = cs[i] - cs[i - 1]; g = (g * 13 + max(d, 0)) / 14; l = (l * 13 + max(-d, 0)) / 14
        out["rsi"] = round(100 - 100 / (1 + g / l), 1) if l else 100.0
    def ma(k, end): return sum(cs[end - k:end]) / k if end >= k else None
    gc = dc = 0
    for back in range(0, 3):
        e = n - back
        a5, a20, p5, p20 = ma(5, e), ma(20, e), ma(5, e - 1), ma(20, e - 1)
        if None not in (a5, a20, p5, p20):
            if p5 <= p20 and a5 > a20: gc = 1
            if p5 >= p20 and a5 < a20: dc = 1
    out["gc"], out["dc"] = gc, dc
    stk = 0
    for i in range(n - 1, 0, -1):
        d = cs[i] - cs[i - 1]
        if d > 0 and stk >= 0: stk += 1
        elif d < 0 and stk <= 0: stk -= 1
        else: break
    out["stk"] = stk
    a60 = ma(60, n); out["m60"] = round(cs[-1] / a60 - 1, 4) if a60 else None
    return out
for t, r in rows_out.items(): r.update(stats(hist_out[t]))
cols = ["t", "n", "m", "x", "s", "i", "p", "d", "pd", "pp", "v", "tv", "mc", "hi", "lo", "rd", "ix", "cur", "prod", "va",
        "r5", "r20", "r60", "r120", "r250", "rsi", "gc", "dc", "stk", "m60"]
def spark(h):
    cs = [(r[4] if len(r) > 3 else r[1]) for r in h[-40:]]
    mn, mx = min(cs), max(cs); rg = (mx - mn) or 1
    return "".join(chr(48 + round((c - mn) / rg * 40)) for c in cs)   # '0'~'X' 41단계
# 선별 종목(market.json·research)의 일봉을 build.py가 쓰도록 따로 저장
sel = set()
if os.path.exists("market.json"): sel |= {m["t"] for m in json.load(open("market.json", encoding="utf-8"))}
json.dump({t: hist_out[t] for t in sel if t in hist_out}, open("uhist_sel.json", "w"), separators=(",", ":"))
uni = {"cols": cols + ["sp"], "rows": [[r.get(c) for c in cols] + [spark(hist_out[t])] for t, r in sorted(rows_out.items())],
       "last": {"US": us_last, "KR": kr_last}, "nchunk": NCHUNK}
json.dump(uni, open("universe.json", "w"), ensure_ascii=False, separators=(",", ":"))
os.makedirs("hchunks", exist_ok=True)
for f in glob.glob("hchunks/*.js"): os.remove(f)
chunks = {}
for t, h in hist_out.items(): chunks.setdefault(chunk_of(t), {})[t] = h
for k, v in chunks.items():
    open(f"hchunks/{k:02d}.js", "w").write("window.__HC&&window.__HC(%d,%s);" % (k, json.dumps(v, separators=(",", ":"))))
sz = sum(os.path.getsize(f) for f in glob.glob("hchunks/*.js"))
log("저장: universe.json", os.path.getsize("universe.json"), "bytes · 일봉 묶음", len(chunks), "개", sz, "bytes")
open("universe_report.txt", "w").write("\n".join(report) + "\n")
