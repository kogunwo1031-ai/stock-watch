"""앱 아이콘 생성: 남색 바탕에 캔들 3개와 상승 추세선(독자 디자인)."""
from PIL import Image, ImageDraw
import os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NAVY, WHITE, RED, SKY = (31, 56, 100), (255, 255, 255), (255, 107, 107), (140, 190, 255)

def art(size, full_bleed):
    S = 1024
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if full_bleed: d.rectangle([0, 0, S, S], fill=NAVY)
    else: d.rounded_rectangle([0, 0, S - 1, S - 1], radius=220, fill=NAVY)
    k = 0.78 if full_bleed else 1.0          # 마스커블은 안전 영역 안쪽으로
    def T(x, y): return (S / 2 + (x - S / 2) * k, S / 2 + (y - S / 2) * k)
    def rect(x0, y0, x1, y1, c): d.rectangle([*T(x0, y0), *T(x1, y1)], fill=c)
    def line(x0, y0, x1, y1, c, w): d.line([T(x0, y0), T(x1, y1)], fill=c, width=int(w * k))
    candles = [(300, 560, 700, 470, 640, SKY), (512, 430, 640, 360, 700, WHITE), (724, 300, 480, 250, 540, RED)]
    for x, top, bot, hi, lo, c in candles:
        line(x, hi, x, lo if lo > bot else bot + 40, c, 16)
        rect(x - 62, top, x + 62, bot, c)
    line(200, 780, 480, 640, WHITE, 26); line(480, 640, 640, 690, WHITE, 26); line(640, 690, 840, 520, WHITE, 26)
    return im.resize((size, size), Image.LANCZOS)

out = os.path.join(ROOT, "site", "icons")
for n in (192, 512): art(n, False).save(f"{out}/icon-{n}.png")
art(512, True).save(f"{out}/maskable-512.png")
art(180, True).convert("RGB").save(f"{out}/apple-180.png")
res = os.path.join(ROOT, "android", "app", "src", "main", "res")
for dpi, n in (("mdpi", 48), ("hdpi", 72), ("xhdpi", 96), ("xxhdpi", 144), ("xxxhdpi", 192)):
    os.makedirs(f"{res}/mipmap-{dpi}", exist_ok=True)
    art(n, False).save(f"{res}/mipmap-{dpi}/ic_launcher.png")
print("icons ok")
