# -*- coding: utf-8 -*-
"""帕朵菲莉丝主题挂件 · 主题对比度审计

界面上的文字实际落在「半透明面层 压在 壁纸 之上」的合成结果上。这个脚本把
这两层合成起来，再按【文字尺度】的局部均值算对比度——单看某个像素的亮度
并不代表可读性，一行正文高约 30px，感知的是它背后那块区域的平均亮度。

只依赖 Pillow。

用法：
    python tools/contrast_audit.py
退出码为 1 表示有指标低于目标（正文 < 7:1 或 次要 < 4.5:1）。
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageFilter

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
ASSETS = ROOT / "assets"

# ── DSH 自己的文字色（从打包产物的 --dsw-alias-label-* 解析而来） ──────────
# 亮色档：--dsw-static-neutral-bluish-1000 / -700 / -600
LIGHT_TEXT = {"primary": (15, 17, 21), "secondary": (97, 102, 107), "tertiary": (129, 133, 140)}
# 暗色档：这几个静态色在 body[data-ds-dark-theme] 下被反转成浅色
DARK_TEXT = {"primary": (237, 237, 240), "secondary": (170, 174, 181), "tertiary": (150, 154, 162)}

# ── 面层的颜色与不透明度，必须与 src/runtime.js 里主题样式表的取值一致 ──────
# 结构：模式 -> [(说明, (r,g,b), alpha)]
SURFACES = {
    "light": [
        ("bg-base",              (255, 252, 250), 0.72),
        ("bg-layer-1",           (255, 251, 248), 0.78),
        ("bg-layer-2",           (253, 246, 243), 0.76),
        ("bg-layer-3",           (251, 243, 240), 0.77),
        ("specific-sidebar-fill", (250, 248, 246), 0.75),
    ],
    "dark": [
        ("bg-base",              (30, 28, 36), 0.72),
        ("bg-layer-1",           (36, 33, 42), 0.78),
        ("bg-layer-2",           (41, 38, 48), 0.76),
        ("bg-layer-3",           (46, 42, 54), 0.77),
        ("specific-sidebar-fill", (32, 30, 38), 0.75),
    ],
}

# 目标：正文按 AAA 的 7:1 要求自己，次要文字按 AA 的 4.5:1
TARGET_PRIMARY = 7.0
TARGET_SECONDARY = 4.5

# 取样口径
THUMB_DIVISOR = 16      # 1920 -> 每像素约 16px 见方
BOX_BLUR = 0.5          # 再取约 32px 见方，贴近一行正文的高度
REGIONS = [("侧栏", 0.02, 0.20), ("正文列", 0.26, 0.72)]


def channel_luminance(value: float) -> float:
    v = value / 255.0
    return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4


def luminance(pixel) -> float:
    r, g, b = pixel[:3]
    return (
        0.2126 * channel_luminance(r)
        + 0.7152 * channel_luminance(g)
        + 0.0722 * channel_luminance(b)
    )


def contrast(a, b) -> float:
    l1, l2 = luminance(a), luminance(b)
    hi, lo = (l1, l2) if l1 >= l2 else (l2, l1)
    return (hi + 0.05) / (lo + 0.05)


def composite(wallpaper: Image.Image, color, alpha: float) -> Image.Image:
    """把纯色面层按 alpha 压到壁纸上。"""
    layer = Image.new("RGB", wallpaper.size, color)
    return Image.blend(wallpaper, layer, alpha)


def text_scale(im: Image.Image) -> Image.Image:
    """压到文字尺度：先缩小，再做一次盒式平均。"""
    small = im.resize(
        (max(1, im.width // THUMB_DIVISOR), max(1, im.height // THUMB_DIVISOR)),
        Image.BOX,
    )
    return small.filter(ImageFilter.BoxBlur(BOX_BLUR))


def report(mode: str, surfaces, texts) -> bool:
    path = ASSETS / f"bg-{mode}.webp"
    if not path.exists():
        print(f"缺少壁纸：{path}")
        return False

    wallpaper = Image.open(path).convert("RGB")
    ok = True
    print(f"\n=== {mode} 档 · 壁纸 {wallpaper.width}x{wallpaper.height} ===")
    for label, color, alpha in surfaces:
        composited = text_scale(composite(wallpaper, color, alpha))
        for region, lo, hi in REGIONS:
            xs = range(int(composited.width * lo), int(composited.width * hi))
            pixels = [composited.getpixel((x, y)) for x in xs for y in range(composited.height)]
            # 亮色档怕暗块，暗色档怕亮块
            worst = min(pixels, key=luminance) if mode == "light" else max(pixels, key=luminance)

            ratios = {name: contrast(text, worst) for name, text in texts.items()}
            primary = ratios["primary"]
            secondary = ratios["secondary"]
            if primary < TARGET_PRIMARY or secondary < TARGET_SECONDARY:
                ok = False

            flag = "OK " if primary >= TARGET_PRIMARY and secondary >= TARGET_SECONDARY else "LOW"
            print(
                f"  {flag} {label:<22} {region:<4} alpha={alpha:.2f}  "
                f"底 #{worst[0]:02X}{worst[1]:02X}{worst[2]:02X}  "
                + "  ".join(f"{k}={v:5.2f}:1" for k, v in ratios.items())
            )
    return ok


def main() -> int:
    all_ok = True
    for mode, texts in (("light", LIGHT_TEXT), ("dark", DARK_TEXT)):
        all_ok &= report(mode, SURFACES[mode], texts)

    print("\n目标：正文 >= 7:1（AAA）、次要文字 >= 4.5:1（AA）")
    print("结果：" + ("全部达标" if all_ok else "有指标未达标（见上面的 LOW）"))
    return 0 if all_ok else 1


if __name__ == "__main__":
    sys.exit(main())
