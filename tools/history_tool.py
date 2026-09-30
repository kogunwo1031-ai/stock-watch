"""일봉 저장소(history.json) 관리.
  python3 history_tool.py merge  < blocks.txt   # '### TICKER' 다음 줄들 'YYYYMMDD,o,h,l,c' 를 날짜 기준으로 합침(새 값 우선)
  python3 history_tool.py import-csv history/   # 폴더의 <T>.csv 들을 합침
  python3 history_tool.py report                # 종목별 행 수·마지막 날짜
  --store indices.json 을 붙이면 지수 저장소에 같은 방식으로 합침
형식: {"TICKER": [[20260929, o, h, l, c, 거래량], ...]}  (오래된 날짜 → 최근 순, 거래량은 없으면 생략)
"""
import sys, json, os, re, glob
PATH = "history.json"
import sys as _s
if "--store" in _s.argv:
    i = _s.argv.index("--store"); PATH = _s.argv[i + 1]; del _s.argv[i:i + 2]
MAX_ROWS = 520   # 약 2년치

def load():
    return json.load(open(PATH)) if os.path.exists(PATH) else {}

def clean(d, o, h, l, c, v=None):
    o, h, l, c = (round(float(x), 4) for x in (o, h, l, c))
    h = max(h, o, c); l = min(l, o, c)          # 원천 데이터의 사소한 고가·저가 오류 보정
    row = [int(d), o, h, l, c]
    if v not in (None, "", "-"):
        try: row.append(int(float(v)))
        except ValueError: pass
    return row

def merge_rows(store, t, rows):
    cur = {r[0]: r for r in store.get(t, [])}
    n0 = len(cur)
    for r in rows:
        try:
            new = clean(*r[:6])
            old = cur.get(new[0])
            if old and len(old) > 5 and len(new) == 5: new.append(old[5])   # 거래량 없는 새 값이면 기존 거래량 유지
            cur[new[0]] = new
        except Exception: pass
    store[t] = sorted(cur.values())[-MAX_ROWS:]
    return len(cur) - n0

def parse_blocks(text):
    out, t = {}, None
    for line in text.splitlines():
        line = line.strip().replace("$", "")
        if line.startswith("###"): t = line[3:].strip().upper(); out[t] = []; continue
        if t and re.match(r"^\d{8},", line):
            parts = [p.replace(" ", "") for p in line.split(",")]
            if len(parts) >= 5: out[t].append(parts[:6])
    return out

if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "report"
    st = load()
    if cmd == "merge":
        for t, rows in parse_blocks(sys.stdin.read()).items():
            print(t, "추가", merge_rows(st, t, rows), "행 · 총", len(st[t]))
    elif cmd == "import-csv":
        for f in sorted(glob.glob(os.path.join(sys.argv[2], "*.csv"))):
            t = os.path.basename(f)[:-4]
            merge_rows(st, t, [l.strip().split(",") for l in open(f) if l.strip()])
    if cmd in ("merge", "import-csv"):
        json.dump(st, open(PATH, "w"), separators=(",", ":"))
    for t in sorted(st):
        if cmd == "report": print(t, len(st[t]), st[t][-1][0])
    print("종목 수", len(st), "· 파일 크기", os.path.getsize(PATH) if os.path.exists(PATH) else 0)
