# -*- coding: utf-8 -*-
"""帕朵菲莉丝主题挂件 · 素材工具

从角色立绘（源图不放仓库）生成：
  1. assets/avatar.webp  —— 悬浮按钮用的圆形头像（正方形，居中裁切）
  2. tools/palette-report.txt —— 配色提取报告（供 DESIGN.md 引用）

用法：
  python tools/make_avatar.py <立绘路径>

只依赖 Pillow。源立绘受角色授权约束，不随仓库发布。
"""
from __future__ import annotations

import sys
from collections import Counter
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
OUT_AVATAR = ROOT / "assets" / "avatar.webp"
OUT_REPORT = HERE / "palette-report.txt"

# 裁切窗口：以立绘尺寸为基准的比例。源立绘是 1080x2340 的竖构图，
# 头部（含猫耳与头顶饰品）位于横向约 9%~60%、纵向约 18%~47% 处，
# 取以 (0.38, 0.325) 为中心、半宽 0.296 的正方形，正好是头肩像。
# 半宽半高都以【宽度】为单位，因此切口恒为正方形。
CROP = dict(cx=0.3800, cy=0.3250, half=0.2960)

# 眼睛（虹膜）采样窗口，按画面比例给出。角色唯一的强饱和色就在这两处，
# 是整套 UI 的强调色来源。
EYE_WINDOWS = {
    "iris-left": (0.283, 0.294, 0.310, 0.322),
    "iris-right": (0.368, 0.288, 0.395, 0.316),
}

AVATAR_SIZE = 256


def crop_square(im: Image.Image) -> Image.Image:
    """按比例窗口裁出一个正方形区域。"""
    w, h = im.size
    half = CROP["half"] * w
    cx = CROP["cx"] * w
    cy = CROP["cy"] * h
    box = (round(cx - half), round(cy - half), round(cx + half), round(cy + half))
    # 夹回画面内
    box = (
        max(0, min(box[0], w - 1)),
        max(0, min(box[1], h - 1)),
        max(1, min(box[2], w)),
        max(1, min(box[3], h)),
    )
    return im.crop(box)


def palette_report(im: Image.Image) -> str:
    """提取主色，输出报告。

    中性色（近白/近黑/低饱和灰）会被跳过，因为角色的主色调本身就是低饱和的
    暖砂灰；真正的「彩色」只有眼睛那一处钴紫蓝，所以额外单独采样眼睛。
    """
    import colorsys

    flat = _flatten(im)
    w, h = flat.size
    small = flat.copy()
    small.thumbnail((200, 440))
    counts: Counter[tuple[int, int, int]] = Counter()
    for r, g, b in small.getdata():
        hue, sat, val = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
        if sat < 0.12 or val < 0.12 or val > 0.97:
            continue  # 跳过中性灰、近白、近黑
        counts[(int(hue * 360 // 15) * 15, round(sat, 1), round(val, 1))] += 1
    total = sum(counts.values()) or 1

    lines = [
        f"源图 {flat.size[0]}x{flat.size[1]}",
        f"有彩色样本 {total}（低饱和暖砂灰为主，符合角色本色）",
        "",
        "【低饱和主色簇】",
    ]
    for (hue, sat, val), n in counts.most_common(14):
        r, g, b = (int(x * 255) for x in colorsys.hsv_to_rgb(hue / 360, sat, val))
        lines.append(f"  h={hue:>3} s={sat:.1f} v={val:.1f}  {n / total * 100:5.2f}%  #{r:02X}{g:02X}{b:02X}")

    lines += ["", "【高饱和采样（眼睛等处）】"]
    for name, (x0, y0, x1, y1) in EYE_WINDOWS.items():
        box = (round(x0 * w), round(y0 * h), round(x1 * w), round(y1 * h))
        crop = flat.crop(box)
        crop = crop.resize((crop.width * 3, crop.height * 3), Image.LANCZOS)
        vivid: Counter[tuple[int, int, int]] = Counter()
        for r, g, b in crop.getdata():
            hue, sat, val = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            if sat > 0.40 and val > 0.35:
                vivid[(r // 4 * 4, g // 4 * 4, b // 4 * 4)] += 1
        if not vivid:
            lines.append(f"  {name}: 无高饱和样本（窗口可能未对准）")
            continue
        top = vivid.most_common(3)
        pretty = "  ".join(f"#{r:02X}{g:02X}{b:02X}x{n}" for (r, g, b), n in top)
        lines.append(f"  {name}: {pretty}")
    return "\n".join(lines)


def _flatten(im: Image.Image) -> Image.Image:
    """合成到白底，避免透明区域变成黑块。"""
    bg = Image.new("RGBA", im.size, (255, 255, 255, 255))
    return Image.alpha_composite(bg, im.convert("RGBA")).convert("RGB")


def main() -> int:
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT.parent / "photo" / "立绘.png"
    if not src.exists():
        print(f"找不到立绘：{src}")
        return 2

    im = Image.open(src)
    report = palette_report(im)

    flat = _flatten(im)
    square = crop_square(flat)
    avatar = square.resize((AVATAR_SIZE, AVATAR_SIZE), Image.LANCZOS)

    OUT_AVATAR.parent.mkdir(parents=True, exist_ok=True)
    avatar.save(OUT_AVATAR, "WEBP", quality=86, method=6)
    OUT_REPORT.write_text(report + "\n", encoding="utf-8")

    print(f"头像  -> {OUT_AVATAR}  ({OUT_AVATAR.stat().st_size / 1024:.1f} KiB)  {square.size}px 源裁切")
    print(f"报告  -> {OUT_REPORT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
