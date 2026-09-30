"""미국 종목 일봉(시가·고가·저가·종가·거래량) 받기 — GitHub Actions에서 실행 (인터넷 제한 없는 환경)

site/data.json 의 전 종목 목록 중 미국 종목의 최근 13개월 일봉을 Yahoo Finance(yfinance)로 받아
ohlc/us.json.gz 로 저장한다. 값은 액면분할만 반영한 원래 가격(배당 조정 없음)이다.
이 파일은 build_universe.py 가 받아서, 날짜가 확정된 기존 종가와 날마다 대조해 맞을 때만 사용한다.
"""
import json, gzip, os, sys, time, math
import yfinance as yf

d = json.load(open(sys.argv[1] if len(sys.argv) > 1 else "site/data.json", encoding="utf-8"))
U = d["universe"]; c = U["cols"]; it, im = c.index("t"), c.index("m")
syms = sorted({r[it].strip() for r in U["rows"] if r[im] == "US"})
print("미국 종목", len(syms))
ysym = lambda t: t.replace(".", "-").replace("/", "-")
out, fail = {}, []
B = 80
for i in range(0, len(syms), B):
    part = syms[i:i + B]
    for attempt in range(3):
        try:
            df = yf.download([ysym(t) for t in part], period="13mo", interval="1d", auto_adjust=False, actions=False,
                             group_by="ticker", threads=True, progress=False)
            break
        except Exception as e:
            print("재시도", i, e); time.sleep(10 * (attempt + 1)); df = None
    if df is None: fail += part; continue
    for t in part:
        try: sub = df[ysym(t)] if len(part) > 1 else df
        except KeyError: fail.append(t); continue
        rows = []
        for idx, r in sub.iterrows():
            o, h, l, cl, v = (r.get("Open"), r.get("High"), r.get("Low"), r.get("Close"), r.get("Volume"))
            if any(x is None or (isinstance(x, float) and math.isnan(x)) for x in (o, h, l, cl)) or cl <= 0: continue
            rows.append([int(idx.strftime("%Y%m%d")), round(float(o), 4), round(float(h), 4), round(float(l), 4), round(float(cl), 4),
                         int(v) if v is not None and not (isinstance(v, float) and math.isnan(v)) else 0])
        if rows: out[t] = rows[-270:]
        else: fail.append(t)
    time.sleep(1.5)
    print(f"{min(i + B, len(syms))}/{len(syms)} · 받음 {len(out)} · 실패 {len(fail)}", flush=True)
os.makedirs("ohlc", exist_ok=True)
meta = {"generated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "count": len(out), "failed": fail[:500], "nfailed": len(fail)}
with gzip.open("ohlc/us.json.gz", "wt", encoding="utf-8") as f: json.dump({"meta": meta, "data": out}, f, separators=(",", ":"))
print("저장", len(out), "종목 · 실패", len(fail), "·", os.path.getsize("ohlc/us.json.gz"), "bytes")
if len(out) < len(syms) * 0.8: sys.exit("받은 종목이 너무 적음")
