# -*- coding: utf-8 -*-
"""帕朵菲莉丝主题挂件 · 壁纸素材工具

把角色立绘（源图随仓库发布在 photo/ 下）合成为整幅壁纸：

    assets/bg-light.webp   亮色界面用
    assets/bg-dark.webp    暗色界面用
    assets/bg-figure.webp  角色本体（保留透明通道），备用

为什么预合成成一张整幅图，而不是在 CSS 里叠两层：
    分层（模糊底 + 透明角色）在真实界面里有两个问题——模糊底自身的明暗色斑
    会跟角色抢注意力；而角色层一旦放大到有存在感，就会被 DSH 自己的不透明
    内容面盖掉大半，露出来的那部分又正好落在文字后面。合成成一张之后，
    「底 + 色域 + 角色」的相互关系在图片里就定死了，界面里只铺这一张图，
    稳定、可预测，事后调参也只需重新生成。

构图（按用户要求）：
    角色【偏左】放，不贴最左边；从顶部开始，脚部出画面。
    亮色档角色更淡（不压正文），暗色档整体压暗，角色可以稍明显一点。

用法：
    python tools/make_wallpaper.py
只依赖 Pillow。
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
PHOTO = ROOT / "photo"
OUT_DIR = ROOT / "assets"

# 壁纸尺寸：够 2K 屏铺满，再大只是徒增体积
SIZE = (1920, 1080)

# ── 柔和色域层：整幅立绘压成小图再放大铺满，重模糊后以低不透明度叠在底色上 ──
WASH_THUMB = (48, 104)         # 压缩后的分辨率：只保留整体色域，丢掉细节
WASH_BLUR_RATIO = 0.07         # 相对短边
WASH_SATURATION = 0.85

# ── 角色层 ───────────────────────────────────────────────────────────────
FIGURE_HEIGHT_RATIO = 1.15     # 相对壁纸高度；脚部出画面（放大以补回降低的不透明度）
FIGURE_CENTER_X = 0.27         # 0.5 为正中央，0.30 即「偏左、但不贴边」
# 左侧满强度 0.65：正文列那半边由 FIGURE_FADE 单独压淡，见下。
FIGURE_OPACITY = {"light": 0.65, "dark": 0.70}
# 横向渐隐控制点：(x 比例, 不透明度系数)，按 x 递增，用来把角色局部压淡。
# 现在设成「整幅都不衰减」：试过让右半边渐隐以保住正文底子，但那样角色的
# 右半身被擦掉，只剩一条竖片，看着不像一个角色。改成整体压低不透明度，
# 角色完整，辨识度靠下面的轻微锐化来找。
# 关键：渐隐只压淡【落进正文列的那半边】，左侧保持满强度。
# 之前试过两条极端路线都不好：整体压低不透明度，角色太淡；整幅加渐隐擦掉右半身，
# 只剩一条竖片不像角色。现在这样分配——左侧（侧栏那侧）可见度约 16%，
# 正文列那侧约 3.4%，而正文列的对比度仍有 4.85:1。
# 控制点是【角色自身宽度】上的比例，不是视口比例：角色横向占视口 0.126~0.414，
# 所以 ratio 0.30 约对应视口 x=0.21（侧栏右缘），ratio 0.44 约对应 x=0.25。
FIGURE_FADE = [(0.00, 1.00), (0.30, 1.00), (0.44, 0.36), (1.00, 0.28)]

# 角色层的轻微锐化。人眼判断"这是不是一个角色"靠的是轮廓边缘，而细边缘在
# 【文字尺度的局部均值】上几乎不占对比度预算——所以拿锐化换辨识度，
# 比单纯提高不透明度划算得多。
FIGURE_UNSHARP = dict(radius=2.0, percent=90, threshold=2)

# ── 底色与压暗 ───────────────────────────────────────────────────────────
BASE_COLOR = {"light": (255, 252, 250), "dark": (30, 28, 36)}
# 暗色档的色域要压过亮度、并降低不透明度再用，否则一层亮色薄雾会把暗底提灰，
# 深色底上的浅色文字对比度会掉下来（正文对比度目标是 AAA，≥7:1）。
#
# 色域只给 0.10 / 0.12：它会在正文列里**均匀**压暗，是最占对比度预算的一项；
# 而角色只压暗局部。实测在次要文字 4.5:1 的红线下，低色域 + 高角色
# 能把角色的有效可见度做到约 10%，比高色域 + 低角色明显得多。
WASH_OPACITY = {"light": 0.10, "dark": 0.12}
WASH_DARK_BRIGHTNESS = 0.3
DARK_BRIGHTNESS = 0.42         # 暗色档对角色本身的亮度压制（压暗，不是反相）

WEBP_QUALITY = 84
WEBP_METHOD = 6


def resolve_source(name: str) -> Path:
    """定位源图：优先仓库内的 photo/，其次仓库上一级目录。"""
    in_repo = PHOTO / name
    if in_repo.exists():
        return in_repo
    return ROOT.parent / "photo" / name


def flatten(im: Image.Image, background: tuple[int, int, int] = (255, 255, 255)) -> Image.Image:
    """把带透明通道的图合成到指定底色上。"""
    canvas = Image.new("RGBA", im.size, (*background, 255))
    return Image.alpha_composite(canvas, im.convert("RGBA")).convert("RGB")


def cover(im: Image.Image, size: tuple[int, int], zoom: float = 1.0, focus_y: float = 0.5) -> Image.Image:
    """按 cover 语义缩放并裁切到目标尺寸。zoom > 1 继续放大，focus_y 决定纵向取哪一段。"""
    target_w, target_h = size
    scale = max(target_w / im.width, target_h / im.height) * zoom
    resized = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.LANCZOS)
    left = (resized.width - target_w) // 2
    span = resized.height - target_h
    top = round(span * min(1.0, max(0.0, focus_y)))
    return resized.crop((left, top, left + target_w, top + target_h))


def trim_figure(im: Image.Image) -> Image.Image:
    """按不透明像素裁紧角色本体，去掉四周空白。"""
    rgba = im.convert("RGBA")
    bbox = rgba.getchannel("A").getbbox()
    if bbox is None:
        raise SystemExit("立绘没有不透明像素，无法裁出角色层")
    return rgba.crop(bbox)


def scaled_figure(figure: Image.Image, height: int) -> Image.Image:
    """把角色缩放到指定高度，保持宽高比。"""
    width = max(1, round(figure.width * height / figure.height))
    return figure.resize((width, height), Image.LANCZOS)


def apply_horizontal_fade(alpha: Image.Image, stops: list[tuple[float, float]]) -> Image.Image:
    """把 alpha 通道按横向控制点做渐隐。

    用逐列缩放实现：列数不多（角色层宽约 900），逐列合成代价可以忽略。
    """
    width, height = alpha.size
    columns: list[Image.Image] = []
    for x in range(width):
        ratio = x / max(1, width - 1)
        # 在控制点之间线性插值
        factor = stops[-1][1]
        for i in range(len(stops) - 1):
            x0, f0 = stops[i]
            x1, f1 = stops[i + 1]
            if x0 <= ratio <= x1:
                t = 0 if x1 == x0 else (ratio - x0) / (x1 - x0)
                factor = f0 + (f1 - f0) * t
                break
        column = alpha.crop((x, 0, x + 1, height))
        columns.append(column.point(lambda v, f=factor: round(v * f)))
    result = Image.new("L", (width, height))
    for x, column in enumerate(columns):
        result.paste(column, (x, 0))
    return result


def wash_layer(illustration: Image.Image, mode: str) -> Image.Image:
    """整幅立绘 -> 压成小图 -> 放大到大图 -> 重模糊 -> 压到低不透明度。

    为什么要绕「缩小再放大」这一圈，而不是直接放大裁切：
      放大裁切只会取到画面的局部（实测取到腰腹那一段），那一大块深色衣料
      会变成一道横向暗带，把正文底子拖暗到 4.0:1。
      另外 zoom < 1 时裁切框会落到图像外，Pillow 补黑，左右各出现一条暗边。
    缩小再放大则把**整幅**画的色域均匀铺满画布：没有暗带、没有补黑、
    也不会有越界采样。
    """
    small = illustration.convert("RGBA")
    small.thumbnail(WASH_THUMB, Image.LANCZOS)          # 保住整幅内容
    small = flatten(small)
    wash = small.resize(SIZE, Image.LANCZOS)            # 满幅铺开
    wash = wash.filter(ImageFilter.GaussianBlur(radius=min(SIZE) * WASH_BLUR_RATIO))
    wash = ImageEnhance.Color(wash).enhance(WASH_SATURATION)
    if mode == "dark":
        # 暗色档先把色域压暗，否则一层亮雾会把暗底提灰
        wash = ImageEnhance.Brightness(wash).enhance(WASH_DARK_BRIGHTNESS)
    wash = wash.convert("RGBA")
    wash.putalpha(wash.getchannel("A").point(lambda _: round(WASH_OPACITY[mode] * 255)))
    return wash


def compose(mode: str, illustration: Image.Image, figure: Image.Image) -> Image.Image:
    """合成一张壁纸：底色 -> 柔和色域 -> 角色。"""
    base = Image.new("RGBA", SIZE, (*BASE_COLOR[mode], 255))

    # 1. 柔和色域
    wash = wash_layer(illustration, mode)
    base.alpha_composite(wash)

    # 2. 角色。顺序很重要：
    #    缩放 -> 锐化 -> （暗色档压暗）-> 按不透明度压 alpha -> 渐变 -> 合成。
    #    注意不能对已经压过亮度的图取 alpha 通道当遮罩，那样会拿压过的像素用错。
    fig = scaled_figure(figure, round(SIZE[1] * FIGURE_HEIGHT_RATIO))
    if FIGURE_UNSHARP is not None:
        sharpened = fig.convert("RGB").filter(ImageFilter.UnsharpMask(**FIGURE_UNSHARP)).convert("RGBA")
        sharpened.putalpha(fig.getchannel("A"))
        fig = sharpened
    if mode == "dark":
        brightness_adjusted = ImageEnhance.Brightness(fig.convert("RGB")).enhance(DARK_BRIGHTNESS).convert("RGBA")
        brightness_adjusted.putalpha(fig.getchannel("A"))
        fig = brightness_adjusted
    fig.putalpha(fig.getchannel("A").point(lambda v: round(v * FIGURE_OPACITY[mode])))
    fig.putalpha(apply_horizontal_fade(fig.getchannel("A"), FIGURE_FADE))
    base.alpha_composite(fig, (round(SIZE[0] * FIGURE_CENTER_X) - fig.width // 2, 0))

    return base.convert("RGB")


def main() -> int:
    src = resolve_source("立绘.png")
    if not src.exists():
        print(f"找不到立绘：{src}")
        return 2
    print(f"立绘  <- {src}")

    illustration = Image.open(src)
    figure = trim_figure(illustration)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    for mode in ("light", "dark"):
        image = compose(mode, illustration, figure)
        path = OUT_DIR / f"bg-{mode}.webp"
        image.save(path, "WEBP", quality=WEBP_QUALITY, method=WEBP_METHOD)
        print(f"bg-{mode}.webp    {image.width}x{image.height}  {path.stat().st_size / 1024:7.1f} KiB")

    # 角色本体单独留一份：界面里若想换一种叠法，不必重新裁切
    figure_path = OUT_DIR / "bg-figure.webp"
    figure.save(figure_path, "WEBP", quality=WEBP_QUALITY, method=WEBP_METHOD)
    print(f"bg-figure.webp  {figure.width}x{figure.height}  {figure_path.stat().st_size / 1024:7.1f} KiB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
