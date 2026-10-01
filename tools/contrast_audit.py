# -*- coding: utf-8 -*-
"""帕朵菲莉丝主题挂件 · 主题对比度审计

界面上的文字实际落在「若干层半透明面层 压在 壁纸 之上」的合成结果上。
这个脚本把整条层叠合成出来，再按【文字尺度】的局部均值算对比度——
单看某个像素的亮度并不代表可读性，一行正文高约 30px，感知的是背后那块
区域的平均亮度。

⚠ 为什么这里按「层叠」建模而不是单个面层：
   半透明层叠是**相乘**而不是相加。DSH 在对话区实际叠了四层
   （body -> BynINW_frame -> BynINW_centerCol -> Dc7zOa_root），
   四层各 0.72 合起来是 1-(0.28^4·0.25) ≈ 99.4%，壁纸等于被完全挡住——
   这正是 v1.1 系列一直"看不到背景"的真正原因。
   所以这里照真实层数算，而不是把某一层单独拎出来估。

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
LIGHT_TEXT = {"primary": (15, 17, 21), "secondary": (97, 102, 107), "tertiary": (129, 133, 140)}
DARK_TEXT = {"primary": (237, 237, 240), "secondary": (170, 174, 181), "tertiary": (150, 154, 162)}

# ── 真实的层叠结构 ───────────────────────────────────────────────────────
# 取自用户在真机上采到的祖先链（从输入框向上）：
#   Dc7zOa_root(bg-base) -> BynINW_centerCol(bg-base) -> BynINW_frame(侧栏令牌)
#   -> BODY(bg-base)
# 侧栏是 centerCol 的兄弟，所以只有 body + frame 两层。
# 每项是 (颜色, alpha)，按【从下到上】排列。
# 这些 alpha 必须与 src/runtime.js 主题样式表里的取值一致，verify.mjs 会核对。
LIGHT = {
    "会话区（4 层）": [
        ((255, 252, 250), 0.28),   # body          bg-base
        ((250, 248, 246), 0.65),   # BynINW_frame  侧栏令牌
        ((255, 252, 250), 0.28),   # centerCol     bg-base
        ((255, 252, 250), 0.28),   # Dc7zOa_root   bg-base
    ],
    "侧栏（2 层）": [
        ((255, 252, 250), 0.28),
        ((250, 248, 246), 0.65),
    ],
    "卡片（1 层）": [
        ((255, 251, 248), 0.70),   # bg-layer-1
    ],
}
DARK = {
    "会话区（4 层）": [
        ((30, 28, 36), 0.30),
        ((32, 30, 38), 0.65),
        ((30, 28, 36), 0.30),
        ((30, 28, 36), 0.30),
    ],
    "侧栏（2 层）": [
        ((30, 28, 36), 0.30),
        ((32, 30, 38), 0.65),
    ],
    "卡片（1 层）": [
        ((36, 33, 42), 0.30),
    ],
}

# 目标：正文按 AAA 的 7:1 要求自己，次要文字按 AA 的 4.5:1
TARGET_PRIMARY = 7.0
TARGET_SECONDARY = 4.5

# 取样口径
THUMB_DIVISOR = 16      # 1920 -> 每像素约 16px 见方
BOX_BLUR = 0.5          # 再取约 32px 见方，贴近一行正文的高度
COLUMN = (0.26, 0.72)   # 常见的正文列范围


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


def apply_stack(wallpaper: Image.Image, stack) -> Image.Image:
    """把整条层叠按顺序压到壁纸上。"""
    result = wallpaper
    for color, alpha in stack:
        result = Image.blend(result, Image.new("RGB", wallpaper.size, color), alpha)
    return result


def effective_alpha(stack) -> float:
    """整条层叠的等效不透明度：1-(1-a1)(1-a2)…"""
    remain = 1.0
    for _color, alpha in stack:
        remain *= (1.0 - alpha)
    return 1.0 - remain


def text_scale(im: Image.Image) -> Image.Image:
    small = im.resize(
        (max(1, im.width // THUMB_DIVISOR), max(1, im.height // THUMB_DIVISOR)),
        Image.BOX,
    )
    return small.filter(ImageFilter.BoxBlur(BOX_BLUR))


def report(mode: str, stacks, texts) -> bool:
    path = ASSETS / f"bg-{mode}.webp"
    if not path.exists():
        print(f"缺少壁纸：{path}")
        return False

    wallpaper = Image.open(path).convert("RGB")
    ok = True
    print(f"\n=== {mode} 档 · 壁纸 {wallpaper.width}x{wallpaper.height} ===")
    for label, stack in stacks.items():
        composited = text_scale(apply_stack(wallpaper, stack))
        xs = range(int(composited.width * COLUMN[0]), int(composited.width * COLUMN[1]))
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
            f"  {flag} {label:<14} 等效不透明={effective_alpha(stack):.3f}  "
            f"底 #{worst[0]:02X}{worst[1]:02X}{worst[2]:02X}  "
            + "  ".join(f"{k}={v:5.2f}:1" for k, v in ratios.items())
        )
    return ok


def main() -> int:
    all_ok = True
    for mode, stacks, texts in (("light", LIGHT, LIGHT_TEXT), ("dark", DARK, DARK_TEXT)):
        all_ok &= report(mode, stacks, texts)

    print("\n目标：正文 >= 7:1（AAA）、次要文字 >= 4.5:1（AA）")
    print("结果：" + ("全部达标" if all_ok else "有指标未达标（见上面的 LOW）"))
    return 0 if all_ok else 1


if __name__ == "__main__":
    sys.exit(main())
