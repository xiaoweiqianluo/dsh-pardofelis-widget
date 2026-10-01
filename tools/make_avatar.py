# -*- coding: utf-8 -*-
"""帕朵菲莉丝主题挂件 · 头像与取色工具

从两张源图生成挂件要用的素材：

    photo/头像.jpg   ->  assets/avatar.webp        悬浮球与面板头部用的圆形头像
    photo/立绘.png   ->  tools/palette-report.txt  配色取样报告（供 DESIGN.md 引用）

两张源图随仓库发布在 photo/ 下，本脚本可从它们重新生成全部产物。

用法：
    python tools/make_avatar.py
只依赖 Pillow。
"""
from __future__ import annotations

import colorsys
from collections import Counter
from pathlib import Path

from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
ASSETS = ROOT / "assets"
PHOTO = ROOT / "photo"

OUT_AVATAR = ASSETS / "avatar.webp"
OUT_REPORT = HERE / "palette-report.txt"

AVATAR_SIZE = 256
AVATAR_WEBP_QUALITY = 88

# 眼睛（虹膜）采样窗口，按立绘画幅比例给出。
# 角色身上唯一的强饱和色就在这里，是整套 UI 强调色的来源。
EYE_WINDOWS = {
    "iris-left": (0.283, 0.294, 0.310, 0.322),
    "iris-right": (0.368, 0.288, 0.395, 0.316),
}


def flatten(im: Image.Image, background: tuple[int, int, int] = (255, 255, 255)) -> Image.Image:
    """合成到白底，避免透明区域变成黑块。"""
    canvas = Image.new("RGBA", im.size, (*background, 255))
    return Image.alpha_composite(canvas, im.convert("RGBA")).convert("RGB")


def make_avatar(src: Path) -> Path:
    """居中裁成正方形 -> 圆形遮罩 -> 输出 webp。

    加圆形遮罩的原因：头像在界面上按圆形显示，源图若不是正圆（或四角不是纯色），
    裁成圆形后四角会露出底色。
    """
    im = Image.open(src).convert("RGB")
    side = min(im.size)
    left = (im.width - side) // 2
    top = (im.height - side) // 2
    square = im.crop((left, top, left + side, top + side)).resize(
        (AVATAR_SIZE * 4, AVATAR_SIZE * 4), Image.LANCZOS,
    )

    # 4 倍超采样画遮罩再缩回目标尺寸，边缘不会有锯齿
    mask = Image.new("L", square.size, 0)
    ImageDraw.Draw(mask).ellipse((0, 0, square.size[0] - 1, square.size[1] - 1), fill=255)
    square.putalpha(mask)

    avatar = square.resize((AVATAR_SIZE, AVATAR_SIZE), Image.LANCZOS)
    ASSETS.mkdir(parents=True, exist_ok=True)
    avatar.save(OUT_AVATAR, "WEBP", quality=AVATAR_WEBP_QUALITY, method=6)
    return OUT_AVATAR


def sample_clusters(title: str, im: Image.Image) -> list[str]:
    """跳过中性色，统计有彩色像素的色簇。"""
    small = im.copy()
    small.thumbnail((200, 440))
    counts: Counter[tuple[int, int, int]] = Counter()
    for r, g, b in small.getdata():
        hue, sat, val = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
        if sat < 0.12 or val < 0.12 or val > 0.97:
            continue  # 中性灰、近白、近黑不计入
        counts[(int(hue * 360 // 15) * 15, round(sat, 1), round(val, 1))] += 1

    total = sum(counts.values()) or 1
    out = [f"【{title}】有彩色样本 {total}"]
    for (hue, sat, val), n in counts.most_common(10):
        r, g, b = (int(x * 255) for x in colorsys.hsv_to_rgb(hue / 360, sat, val))
        out.append(f"  h={hue:>3} s={sat:.1f} v={val:.1f}  {n / total * 100:5.2f}%  #{r:02X}{g:02X}{b:02X}")
    return out


def sample_vivid(im: Image.Image, windows: dict[str, tuple[float, float, float, float]]) -> list[str]:
    """在给定窗口里挑高饱和像素，用于取虹膜色。"""
    w, h = im.size
    out: list[str] = []
    for name, (x0, y0, x1, y1) in windows.items():
        box = (round(x0 * w), round(y0 * h), round(x1 * w), round(y1 * h))
        crop = im.crop(box)
        crop = crop.resize((crop.width * 3, crop.height * 3), Image.LANCZOS)
        vivid: Counter[tuple[int, int, int]] = Counter()
        for r, g, b in crop.getdata():
            hue, sat, val = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            if sat > 0.40 and val > 0.35:
                vivid[(r // 4 * 4, g // 4 * 4, b // 4 * 4)] += 1
        if not vivid:
            out.append(f"  {name}: 无高饱和样本（窗口可能未对准）")
            continue
        pretty = "  ".join(f"#{r:02X}{g:02X}{b:02X}x{n}" for (r, g, b), n in vivid.most_common(3))
        out.append(f"  {name}: {pretty}")
    return out


def palette_report(illustration: Path, avatar_src: Path) -> str:
    """输出配色取样报告。

    立绘本身几乎全是低饱和暖灰（直接聚类出来是白与黑），真正的彩色只有眼睛
    那一处；头像那张的倾向又偏玫粉。两份都采，分开写清楚。
    """
    lines: list[str] = []

    flat = flatten(Image.open(illustration))
    lines += sample_clusters("立绘 photo/立绘.png 低饱和主色簇", flat)
    lines += ["", "【立绘高饱和采样（虹膜）】"]
    lines += sample_vivid(flat, EYE_WINDOWS)

    if avatar_src.exists():
        lines += ["", *sample_clusters("头像 photo/头像.jpg 低饱和主色簇",
                                       Image.open(avatar_src).convert("RGB"))]

    lines += [
        "",
        "【结论】",
        "  背景与界面色调取自立绘：暖砂棕 #988479、猫耳藕粉 #D4B2A6、",
        "  以及全图唯一的强饱和色——虹膜青蓝 #7CDCF4（作为强调色）。",
        "  头像那张偏玫粉（#CCA3A3 / #CCADA3 / #E5B7B7），用于细节点缀。",
    ]
    return "\n".join(lines)


def resolve_source(name: str) -> Path:
    """定位源图。

    优先用仓库内的 photo/（源图随仓库发布），找不到再退回仓库的上一级目录——
    开发时源图常放在项目外层，两种布局都要能用。
    """
    in_repo = PHOTO / name
    if in_repo.exists():
        return in_repo
    return ROOT.parent / "photo" / name


def main() -> int:
    illustration = resolve_source("立绘.png")
    avatar_src = resolve_source("头像.jpg")
    if not illustration.exists():
        print(f"找不到立绘：{illustration}")
        return 2
    if not avatar_src.exists():
        print(f"找不到头像：{avatar_src}")
        return 2

    print(f"立绘  <- {illustration}")
    print(f"头像  <- {avatar_src}")
    avatar_path = make_avatar(avatar_src)
    report = palette_report(illustration, avatar_src)
    OUT_REPORT.write_text(report + "\n", encoding="utf-8")

    print(f"头像  -> {avatar_path}  ({avatar_path.stat().st_size / 1024:.1f} KiB)")
    print(f"报告  -> {OUT_REPORT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
