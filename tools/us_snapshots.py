"""미국 전 종목 일별 종가·거래량 만들기 (원천: github.com/rreichel3/US-Stock-Symbols 의 커밋별 나스닥 스크리너 스냅샷)

날짜를 추측하지 않는다. 각 스냅샷의 '종가 묶음'과 '전일 종가 묶음'을 날짜가 확실한 일봉(history.json, 약 120개 미국 종목)과
대조해 날짜를 확정하고, 일봉 범위보다 오래된 구간은 '앞 스냅샷의 종가 = 뒷 스냅샷의 전일 종가' 연결이 끊기지 않는 데까지만 쓴다.
장중에 찍힌 불완전한 스냅샷은 어떤 날짜의 종가와도 맞지 않으므로 자동으로 빠지고, 그 날의 확정 종가는 다음 스냅샷의 전일 종가로 채운다.

사용: python3 us_snapshots.py <저장소 경로>  →  us/snap.json
"""
import subprocess, json, sys, datetime as dt, os

REPO = sys.argv[1] if len(sys.argv) > 1 else "/tmp/uss"
HOL = {"2025-01-01","2025-01-09","2025-01-20","2025-02-17","2025-04-18","2025-05-26","2025-06-19","2025-07-04","2025-09-01","2025-11-27","2025-12-25",
       "2026-01-01","2026-01-19","2026-02-16","2026-04-03","2026-05-25","2026-06-19","2026-07-03","2026-09-07","2026-11-26","2026-12-25",
       "2027-01-01","2027-01-18","2027-02-15","2027-03-26","2027-05-31","2027-06-18","2027-07-05","2027-09-06","2027-11-25","2027-12-24"}
def is_td(d): return d.weekday() < 5 and d.isoformat() not in HOL
def prev_td(d):
    d -= dt.timedelta(days=1)
    while not is_td(d): d -= dt.timedelta(days=1)
    return d
def ymd(d): return d.strftime("%Y%m%d")
def dparse(s): return dt.date(int(s[:4]), int(s[4:6]), int(s[6:8]))
def num(s):
    try: return float(str(s).replace("$", "").replace(",", "").replace("%", "").strip())
    except ValueError: return None
TOL = lambda v: max(0.011, abs(v) * 0.0005)

# ---------- 스냅샷 읽기 ----------
commits = [l.split() for l in subprocess.run(["git", "-C", REPO, "log", "--format=%H %ct"], capture_output=True, text=True).stdout.splitlines()]
snaps = []
for h, ct in commits:
    d = {}
    for ex in ("nasdaq", "nyse", "amex"):
        raw = subprocess.run(["git", "-C", REPO, "show", f"{h}:{ex}/{ex}_full_tickers.json"], capture_output=True).stdout
        try: rows = json.loads(raw)
        except Exception: continue
        for r in rows:
            c, ch, v = num(r.get("lastsale")), num(r.get("netchange")), num(r.get("volume"))
            if c is None or c <= 0: continue
            d[r["symbol"]] = (c, round(c - ch, 4) if ch is not None else None, int(v) if v is not None else None, num(r.get("marketCap")), ex,
                              r.get("name", ""), r.get("sector", ""), r.get("industry", ""), r.get("country", ""))
    if len(d) < 3000: continue
    snaps.append({"h": h, "t": int(ct), "d": d})
snaps.sort(key=lambda s: -s["t"])
print("스냅샷", len(snaps))

# ---------- 기준 일봉 ----------
H = json.load(open("history.json"))
ref = {}
for sym, rows in H.items():
    if not sym.isalpha() or len(rows) < 30: continue
    for r in rows: ref.setdefault(str(r[0]), {})[sym] = r[4]
ref_days = sorted(ref)

def match_day(vec):
    """vec: {sym: 가격} 이 어느 기준 날짜의 종가와 맞는지. 맞는 날짜가 정확히 하나일 때만 반환"""
    hits = []
    for day in ref_days:
        rv = ref[day]; tot = ok = 0
        for sym, p in rv.items():
            v = vec.get(sym)
            if v is None: continue
            tot += 1; ok += abs(v - p) <= TOL(p)
        if tot >= 20 and ok / tot >= 0.9: hits.append(day)
    return hits[0] if len(hits) == 1 else None

def chained(older, newer):
    ok = tot = 0
    for k, v in newer["d"].items():
        o = older["d"].get(k)
        if not o or v[1] is None: continue
        tot += 1; ok += abs(o[0] - v[1]) <= TOL(v[1])
        if tot >= 600: break
    return tot >= 200 and ok / tot > 0.95

days = {}      # 날짜 → {sym: (종가, 거래량)}
src = {}       # 날짜 → 'close'|'prev'
for s in snaps:
    cd = match_day({k: v[0] for k, v in s["d"].items()})
    pd_ = match_day({k: v[1] for k, v in s["d"].items() if v[1] is not None})
    s["cd"], s["pd"] = cd, pd_
    if cd and src.get(cd) != "close":
        days[cd] = {k: (v[0], v[2], v[1]) for k, v in s["d"].items()}; src[cd] = "close"
    if pd_ and pd_ not in days:
        days[pd_] = {k: (v[1], None, None) for k, v in s["d"].items() if v[1] is not None}; src[pd_] = "prev"
dated = [s for s in snaps if s["cd"]]
print("기준 일봉으로 날짜 확정:", len(dated), "개 스냅샷 · 날짜", len(days), "일")

# ---------- 기준 범위보다 오래된 구간: 연결이 이어지는 데까지만 ----------
oldest = min(dated, key=lambda s: s["cd"])
cur, cur_date = oldest, dparse(oldest["cd"])
older = [s for s in snaps if s["t"] < oldest["t"]]
extended = 0
for s in older:
    if chained(s, cur):
        nd = prev_td(cur_date)
        if ymd(nd) not in days:
            days[ymd(nd)] = {k: (v[0], v[2], v[1]) for k, v in s["d"].items()}; src[ymd(nd)] = "chain"; extended += 1
        cur, cur_date = s, nd
    elif s["d"].get("AAPL", (None,))[0] == cur["d"].get("AAPL", (None,))[0]:
        continue                                     # 같은 내용의 중복 스냅샷
    else:
        # 장중 스냅샷일 수 있음: 전일 종가 묶음이 cur의 전일 종가와 같으면(같은 날의 다른 시각) 건너뜀
        same_day = sum(1 for k, v in list(s["d"].items())[:400] if cur["d"].get(k) and v[1] is not None and cur["d"][k][1] is not None and abs(v[1] - cur["d"][k][1]) <= TOL(v[1]))
        if same_day > 300: continue
        print("연결 끊김 →", ymd(cur_date), "이전은 사용하지 않음"); break
print("연결로 늘린 날짜", extended)

# ---------- 검증 ----------
bad = chk = 0
for day, rv in ref.items():
    if day not in days: continue
    for sym, p in rv.items():
        v = days[day].get(sym)
        if v: chk += 1; bad += abs(v[0] - p) > TOL(p)
print(f"검증: 기준 일봉과 {chk}개 값 대조, 불일치 {bad}")
assert bad <= chk * 0.002, "불일치가 너무 많음"

dates = sorted(days)
for a, b in zip(dates, dates[1:]):
    assert dparse(a) < dparse(b)
syms = set().union(*[days[d].keys() for d in dates])
out = {"dates": dates, "src": [src[d] for d in dates], "data": {}}
for sym in syms:
    out["data"][sym] = [list(days[d][sym]) if sym in days[d] else None for d in dates]
latest = snaps[0]["d"]
out["latest"] = {k: {"mcap": v[3], "ex": v[4], "name": v[5], "sector": v[6], "industry": v[7], "country": v[8]} for k, v in latest.items()}
os.makedirs("us", exist_ok=True)
json.dump(out, open("us/snap.json", "w"), separators=(",", ":"))
print("저장:", dates[0], "~", dates[-1], len(dates), "일 ·", len(syms), "종목")
