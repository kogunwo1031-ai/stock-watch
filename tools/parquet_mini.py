"""아주 작은 Parquet 읽기 도구(외부 라이브러리 없이). 평평한 스키마, PLAIN/사전 인코딩, 비압축·SNAPPY·GZIP 지원.
   read_parquet(path, columns=None) -> {열이름: [값...]}
"""
import struct, zlib

# ---------- Thrift compact protocol ----------
class T:
    def __init__(self, b, p=0): self.b, self.p = b, p
    def byte(self): v = self.b[self.p]; self.p += 1; return v
    def varint(self):
        r = s = 0
        while True:
            x = self.byte(); r |= (x & 0x7F) << s; s += 7
            if not x & 0x80: return r
    def zz(self): v = self.varint(); return (v >> 1) ^ -(v & 1)
    def val(self, t):
        if t == 1: return True
        if t == 2: return False
        if t == 3: v = self.b[self.p]; self.p += 1; return v
        if t in (4, 5, 6): return self.zz()
        if t == 7: v = struct.unpack_from("<d", self.b, self.p)[0]; self.p += 8; return v
        if t == 8: n = self.varint(); v = self.b[self.p:self.p + n]; self.p += n; return v
        if t in (9, 10):
            h = self.byte(); n = h >> 4; et = h & 15
            if n == 15: n = self.varint()
            if et in (1, 2): return [self.byte() == 1 for _ in range(n)]
            return [self.val(et) for _ in range(n)]
        if t == 11:
            n = self.varint()
            if n == 0: return {}
            kv = self.byte(); kt, vt = kv >> 4, kv & 15
            return {self.val(kt): self.val(vt) for _ in range(n)}
        if t == 12: return self.struct()
        raise ValueError("thrift type %d" % t)
    def struct(self):
        out, fid = {}, 0
        while True:
            h = self.byte()
            if h == 0: return out
            t = h & 15; d = h >> 4
            fid = fid + d if d else self.zz()
            out[fid] = self.val(t)

# ---------- Snappy (raw) ----------
def snappy(b):
    p = 0; n = s = 0
    while True:
        x = b[p]; p += 1; n |= (x & 0x7F) << s; s += 7
        if not x & 0x80: break
    out = bytearray()
    L = len(b)
    while p < L:
        tag = b[p]; p += 1; k = tag & 3
        if k == 0:
            ln = tag >> 2
            if ln >= 60:
                nb = ln - 59; ln = int.from_bytes(b[p:p + nb], "little"); p += nb
            ln += 1; out += b[p:p + ln]; p += ln; continue
        if k == 1: ln = ((tag >> 2) & 7) + 4; off = ((tag >> 5) << 8) | b[p]; p += 1
        elif k == 2: ln = (tag >> 2) + 1; off = b[p] | (b[p + 1] << 8); p += 2
        else: ln = (tag >> 2) + 1; off = int.from_bytes(b[p:p + 4], "little"); p += 4
        st = len(out) - off
        if off >= ln: out += out[st:st + ln]
        else:
            for i in range(ln): out.append(out[st + i])
    if len(out) != n: raise ValueError("snappy length mismatch")
    return bytes(out)

def decompress(codec, b, n):
    if codec == 0: return b
    if codec == 1: return snappy(b)
    if codec == 2: return zlib.decompress(b, 16 + zlib.MAX_WBITS)
    raise ValueError("지원하지 않는 압축 codec=%d (0=없음,1=SNAPPY,2=GZIP)" % codec)

# ---------- 인코딩 ----------
def hybrid(b, p, end, bw, count):
    """RLE/bit-packed hybrid → 정수 목록"""
    out = []; bytew = (bw + 7) // 8
    while len(out) < count and p < end:
        h = 0; s = 0
        while True:
            x = b[p]; p += 1; h |= (x & 0x7F) << s; s += 7
            if not x & 0x80: break
        if h & 1:
            groups = h >> 1; nbytes = groups * bw
            chunk = int.from_bytes(b[p:p + nbytes], "little"); p += nbytes
            mask = (1 << bw) - 1
            for i in range(groups * 8): out.append((chunk >> (i * bw)) & mask if bw else 0)
        else:
            run = h >> 1; v = int.from_bytes(b[p:p + bytew], "little") if bytew else 0; p += bytew
            out.extend([v] * run)
    return out[:count]

def plain(b, ptype, n, tlen=None):
    if ptype == 1: return list(struct.unpack_from("<%di" % n, b, 0))
    if ptype == 2: return list(struct.unpack_from("<%dq" % n, b, 0))
    if ptype == 4: return list(struct.unpack_from("<%df" % n, b, 0))
    if ptype == 5: return list(struct.unpack_from("<%dd" % n, b, 0))
    if ptype == 6:
        out = []; p = 0
        for _ in range(n):
            ln = struct.unpack_from("<i", b, p)[0]; p += 4; out.append(b[p:p + ln]); p += ln
        return out
    if ptype == 0: return [(b[i >> 3] >> (i & 7)) & 1 == 1 for i in range(n)]
    if ptype == 3: return [b[i * 12:(i + 1) * 12] for i in range(n)]
    if ptype == 7: return [b[i * tlen:(i + 1) * tlen] for i in range(n)]
    raise ValueError("type %d" % ptype)

def read_parquet(path, columns=None):
    f = open(path, "rb").read()
    assert f[:4] == b"PAR1" and f[-4:] == b"PAR1", "parquet 아님"
    n = struct.unpack_from("<i", f, len(f) - 8)[0]
    meta = T(f, len(f) - 8 - n).struct()
    schema = meta[2]
    leaves = [s for s in schema[1:] if not s.get(5)]
    info = {}
    for s in leaves:
        nm = s[4].decode()
        info[nm] = {"type": s.get(1), "tlen": s.get(2), "opt": s.get(3, 0) == 1, "conv": s.get(6), "logical": s.get(10)}
    want = columns or list(info)
    out = {c: [] for c in want}
    for rg in meta[4]:
        for cc in rg[1]:
            md = cc[3]; nm = b".".join(md[3]).decode()
            if nm not in out: continue
            ci = info[nm]; codec = md[4]; nvals = md[5]
            p = md.get(11) or md[9]
            if md.get(11) is not None: p = min(md[11], md[9])
            dictv = None; got = 0
            while got < nvals:
                t = T(f, p); ph = t.struct(); p = t.p
                csize, usize = ph[3], ph[2]
                raw = f[p:p + csize]; p += csize
                ptype = ph[1]
                if ptype == 2:
                    d = decompress(codec, raw, usize); dictv = plain(d, ci["type"], ph[7][1], ci["tlen"]); continue
                if ptype == 0:
                    d = decompress(codec, raw, usize); dh = ph[5]; nv = dh[1]; enc = dh[2]; q = 0
                    defs = None
                    if ci["opt"]:
                        ln = struct.unpack_from("<i", d, 0)[0]; defs = hybrid(d, 4, 4 + ln, 1, nv); q = 4 + ln
                    body = d[q:]
                elif ptype == 3:
                    dh = ph[8]; nv = dh[1]; enc = dh[4]; dl = dh.get(5, 0); rl = dh.get(6, 0)
                    lv = raw[:rl + dl]; rest = raw[rl + dl:]
                    comp = dh.get(7, True)
                    body = decompress(codec, rest, usize - rl - dl) if comp else rest
                    defs = hybrid(lv, rl, rl + dl, 1, nv) if ci["opt"] and dl else None
                else:
                    continue
                nn = sum(defs) if defs is not None else nv
                if enc in (2, 8):
                    bw = body[0]; idx = hybrid(body, 1, len(body), bw, nn); vals = [dictv[i] for i in idx]
                elif enc == 0:
                    vals = plain(body, ci["type"], nn, ci["tlen"])
                else:
                    raise ValueError("인코딩 %d 미지원 (%s)" % (enc, nm))
                if defs is not None:
                    it = iter(vals); vals = [next(it) if dv else None for dv in defs]
                out[nm].extend(vals); got += nv
    # 문자열 변환
    for c in out:
        if info[c]["type"] == 6: out[c] = [v.decode("utf-8", "replace") if v is not None else None for v in out[c]]
    return out, info
