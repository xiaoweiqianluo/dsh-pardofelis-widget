// ══════════════════════════════════════════════════════════════════════════
//  帕朵菲莉丝主题挂件 · 浏览器半边（dsh-pardofelis-widget）
//
//  构建产物请勿直接编辑：本文件由 tools/build.mjs 生成。
//  源文件：src/client.js（模块外壳）+ src/runtime.js（全部逻辑）
//
//  交付内容：
//    1. 对话页右下角的悬浮按钮（角色头像 + 猫耳），点击展开 / 收起音乐面板
//    2. 本地音频导入（多选，File API）与播放：上 / 下一首、进度、时间、音量
//    3. 三种播放模式：顺序 / 单曲循环 / 随机；播放列表可点击切换、可移除
//    4. 全部样式封装在 Shadow DOM 内，宿主只占一个 fixed 容器，不参与文档流
//
//  ── 隐私 ─────────────────────────────────────────────────────────────────
//  音频只以 URL.createObjectURL(file) 的 blob: 地址存在内存里。没有 fetch、
//  XMLHttpRequest、WebSocket、sendBeacon，没有外部接口调用，不上传任何字节。
//
//  ── 不改变原布局（硬约束）────────────────────────────────────────────────
//  唯一插入文档的是一个 fixed 容器：
//      <div style="position:fixed; right:24px; bottom:120px; pointer-events:none">
//  容器本身没有内容尺寸（内容溢出可见），按钮与面板是它的子元素，
//  各自 pointer-events:auto。因此：
//    · 不触碰原 DOM 的任何 style / class，不覆盖 display/flex/grid/position
//    · 不插入任何影响文档流的元素（无 static 定位节点）
//    · 容器之外的一切点击直接穿透，不拦截页面交互
//
//  ── 选择器策略（维护须知）────────────────────────────────────────────────
//  DSH 组件样式表用 CSS Modules（类名形如 <哈希>_<局部名>，哈希随构建变化）。
//  因此本文件只依赖稳定锚点：data-composer-card / data-composer-input /
//  data-composer-placeholder。绝不硬编码类名哈希。
// ══════════════════════════════════════════════════════════════════════════

const PLUGIN_ID = 'dsh-pardofelis-widget';
const PLUGIN_VERSION = '1.2.7';

/** localStorage 键。插件自己的偏好，与 DSH 的设置互不干扰。 */
const LS_KEY = 'dsh-pardofelis-widget:v1';

/** 宿主节点的稳定标记，用于幂等挂载与外部自定义样式。 */
const HOST_ID = 'dsh-pardofelis-widget-host';
const HOST_ATTR = 'data-dsh-pardofelis';

/** 对话页锚点（DSH 输入区的稳定 data-* 属性）。 */
const COMPOSER_SELECTORS = [
  '[data-composer-card]',
  '[data-composer-input]',
  '[data-composer-placeholder]',
  '[data-conversation-composer-overlay]',
];

/** 悬浮按钮的几何。移动端由样式表覆盖。 */
const LAUNCHER = { right: 24, bottom: 120 };

const PLAY_MODES = ['sequence', 'repeat-one', 'shuffle'];
const PLAY_MODE_LABEL = {
  sequence: '顺序播放',
  'repeat-one': '单曲循环',
  shuffle: '随机播放',
};

const DEFAULTS = { volume: 0.8, mode: 'sequence', open: false };

/** 头像：由 tools/build.mjs 把 assets/avatar.webp 内联成 data: URL。
 *  内联而不是走 HTTP 路由，是为了「零请求」——挂件不产生任何网络流量。 */
const AVATAR_URL = '__DSH_PARDOFELIS_AVATAR__';

/** 主题壁纸：同样由构建脚本内联，避免为两张图新增网络请求。
 *  两档各一张，按明暗切换；尺寸与压缩见 tools/make_wallpaper.py。 */
const WALLPAPER_LIGHT_URL = '__DSH_PARDOFELIS_BG_LIGHT__';
const WALLPAPER_DARK_URL = '__DSH_PARDOFELIS_BG_DARK__';

// ══════════════════════════════════════════════════════════════════════════
//  调色板
// ══════════════════════════════════════════════════════════════════════════
//
//  取自角色立绘（tools/make_avatar.py 的采样报告，见 tools/palette-report.txt）：
//    头发暖砂   #988479 · #B2978E · #CCADA3
//    猫耳藕粉   #D4B2A6 · #E5B7B7
//    虹膜青蓝   #7CDCF4（唯一强饱和色，作为强调色）
//    裙装靛紫   #4F5A90 · #10245F
//    近白奶色   #FDECE5
//
//  立绘本色偏低饱和，直接铺满会让对话区发灰；因此界面用色是「本色提亮后的
//  淡彩」：壳层是近白 / 近墨的低彩度面，彩色只出现在描边、头像光环、进度条
//  这类装饰位置。文字一律交给 DSH 自己的 token（--dsh-text-*），不覆盖正文
//  颜色，从而保证任何主题下对比度都不下降。

const PALETTE = {
  hair: '#988479',
  hairLight: '#CCADA3',
  ear: '#D4B2A6',
  iris: '#7CDCF4',
  irisDeep: '#4FA8D8',
  cloth: '#4F5A90',
  cream: '#FDECE5',
};

/** 每个调色板的 CSS 自定义属性。 */
const THEMES = {
  light: `
    --pw-shell: rgba(255, 252, 250, 0.9);
    --pw-shell-solid: #FFFCFA;
    --pw-border: rgba(152, 132, 121, 0.26);
    --pw-border-strong: rgba(124, 106, 96, 0.42);
    --pw-text: #3A3330;
    --pw-text-dim: #7A6C64;
    --pw-accent: ${PALETTE.cloth};
    --pw-accent-soft: rgba(79, 90, 144, 0.14);
    --pw-glow: rgba(124, 220, 244, 0.5);
    --pw-hover: rgba(152, 132, 121, 0.1);
    --pw-shadow: 0 10px 30px rgba(74, 58, 52, 0.18), 0 2px 8px rgba(74, 58, 52, 0.1);
    --pw-focus: #3F6EA8;
  `,
  dark: `
    --pw-shell: rgba(30, 28, 36, 0.88);
    --pw-shell-solid: #1E1C24;
    --pw-border: rgba(212, 178, 166, 0.22);
    --pw-border-strong: rgba(212, 178, 166, 0.38);
    --pw-text: #F0E8E4;
    --pw-text-dim: #B3A49C;
    --pw-accent: #B9C2F0;
    --pw-accent-soft: rgba(185, 194, 240, 0.16);
    --pw-glow: rgba(124, 220, 244, 0.42);
    --pw-hover: rgba(212, 178, 166, 0.12);
    --pw-shadow: 0 10px 30px rgba(0, 0, 0, 0.45), 0 2px 8px rgba(0, 0, 0, 0.3);
    --pw-focus: #8FD8F4;
  `,
};

// ══════════════════════════════════════════════════════════════════════════
//  样式表
// ══════════════════════════════════════════════════════════════════════════
//
//  全部选择器都在 Shadow Root 内：不会影响挂件之外的任何元素。
//  :host 只声明固定定位与穿透，不涉及 display / flex / grid / 宽高。

const STYLES = `
:host {
  position: fixed;
  right: ${LAUNCHER.right}px;
  bottom: ${LAUNCHER.bottom}px;
  z-index: 2147482000;
  pointer-events: none;
  font-family: inherit;
  font-size: 14px;
  line-height: 1.5;
  color: var(--pw-text);
  -webkit-font-smoothing: antialiased;
}

.pw-theme-light { ${THEMES.light} }
.pw-theme-dark { ${THEMES.dark} }

/* 与 DSH 的字体保持一致；取不到也不影响功能 */
.pw-shell-font { font-family: var(--dsh-font-sans, inherit); }

*, *::before, *::after { box-sizing: border-box; }

/* ── 悬浮按钮 ─────────────────────────────────────────────────────────── */
.pw-launcher {
  pointer-events: auto;
  position: relative;
  width: 56px;
  height: 56px;
  padding: 0;
  border: 1.5px solid var(--pw-border-strong);
  border-radius: 50%;
  background: var(--pw-shell);
  box-shadow: var(--pw-shadow);
  cursor: pointer;
  display: grid;
  place-items: center;
  transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease;
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
}
.pw-launcher:hover { transform: translateY(-2px) scale(1.04); border-color: var(--pw-accent); }
.pw-launcher:active { transform: translateY(0) scale(0.98); }
.pw-launcher:focus-visible {
  outline: 3px solid var(--pw-focus);
  outline-offset: 3px;
}
/* 展开态：按钮沉到面板右下角，作为收起开关 */
.pw-launcher[aria-expanded="true"] {
  transform: scale(0.94);
  border-color: var(--pw-accent);
}

/* 头像 */
.pw-avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  object-fit: cover;
  object-position: center 22%;
  display: block;
  pointer-events: none;
  user-select: none;
  -webkit-user-drag: none;
  box-shadow: 0 0 0 1.5px var(--pw-shell-solid), 0 0 0 3px var(--pw-accent-soft);
}

/* 猫耳：两片纯 CSS 三角，落在按钮圆环上，不占额外空间 */
.pw-ear {
  position: absolute;
  top: -5px;
  width: 16px;
  height: 15px;
  background: linear-gradient(160deg, ${PALETTE.ear} 0%, ${PALETTE.hair} 100%);
  border: 1.5px solid var(--pw-border-strong);
  border-bottom-color: transparent;
  border-radius: 62% 38% 4% 8% / 78% 70% 0% 0%;
  pointer-events: none;
  transition: transform 180ms ease;
}
.pw-ear::after {
  content: "";
  position: absolute;
  inset: 3px 3px 6px 3px;
  border-radius: 60% 40% 0 0 / 80% 70% 0 0;
  background: linear-gradient(180deg, rgba(253, 236, 229, 0.85), rgba(212, 178, 166, 0.5));
}
.pw-ear-left  { left: 6px;  transform: rotate(-16deg); }
.pw-ear-right { right: 6px; transform: rotate(16deg); }
.pw-launcher:hover .pw-ear-left  { transform: rotate(-22deg) translateY(-1px); }
.pw-launcher:hover .pw-ear-right { transform: rotate(22deg) translateY(-1px); }

/* 播放中的呼吸光环 */
.pw-launcher[data-playing="true"]::after {
  content: "";
  position: absolute;
  inset: -4px;
  border-radius: 50%;
  border: 2px solid var(--pw-glow);
  animation: pw-pulse 1.9s ease-out infinite;
  pointer-events: none;
}
@keyframes pw-pulse {
  0%   { transform: scale(0.94); opacity: 0.85; }
  70%  { transform: scale(1.16); opacity: 0; }
  100% { transform: scale(1.16); opacity: 0; }
}

/* 面板展开时的淡入 */
.pw-panel[data-open="false"] { display: none; }

/* ── 面板 ─────────────────────────────────────────────────────────────── */
.pw-panel {
  pointer-events: auto;
  position: absolute;
  right: 0;
  bottom: 70px;               /* 浮在按钮上方 */
  width: 320px;
  max-width: min(320px, calc(100vw - 32px));
  max-height: min(70vh, 560px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1.5px solid var(--pw-border-strong);
  border-radius: 18px;
  background: var(--pw-shell);
  box-shadow: var(--pw-shadow);
  -webkit-backdrop-filter: blur(14px) saturate(1.15);
  backdrop-filter: blur(14px) saturate(1.15);
  animation: pw-in 180ms ease-out;
}
@keyframes pw-in {
  from { opacity: 0; transform: translateY(8px) scale(0.98); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}

/* 头部 */
.pw-head {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 11px 12px 10px 13px;
  border-bottom: 1px solid var(--pw-border);
  flex: 0 0 auto;
}
.pw-head-avatar {
  width: 30px; height: 30px; border-radius: 50%;
  object-fit: cover; object-position: center 22%;
  box-shadow: 0 0 0 1.5px var(--pw-accent-soft);
  flex: 0 0 auto;
}
.pw-head-text { display: flex; flex-direction: column; min-width: 0; flex: 1 1 auto; }
.pw-title { font-size: 13px; font-weight: 600; letter-spacing: 0.02em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pw-subtitle { font-size: 11px; color: var(--pw-text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pw-head-close {
  flex: 0 0 auto;
  width: 26px; height: 26px;
  display: grid; place-items: center;
  border: 0; border-radius: 8px;
  background: transparent; color: var(--pw-text-dim);
  cursor: pointer;
}
.pw-head-close:hover { background: var(--pw-hover); color: var(--pw-text); }
.pw-head-close:focus-visible { outline: 2px solid var(--pw-focus); outline-offset: 2px; }

/* 导入区 */
.pw-picker-row {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--pw-border);
  flex: 0 0 auto;
}
.pw-picker {
  flex: 1 1 auto;
  display: inline-flex; align-items: center; justify-content: center; gap: 7px;
  min-height: 34px; padding: 0 12px;
  border: 1.5px dashed var(--pw-border-strong);
  border-radius: 10px;
  background: var(--pw-accent-soft);
  color: var(--pw-text);
  font-size: 12.5px; font-weight: 600;
  cursor: pointer;
  transition: border-color 150ms ease, background 150ms ease;
}
.pw-picker:hover { border-color: var(--pw-accent); }
.pw-picker:focus-within { outline: 2px solid var(--pw-focus); outline-offset: 2px; }
.pw-picker svg { flex: 0 0 auto; }
.pw-visually-hidden {
  position: absolute; width: 1px; height: 1px;
  margin: -1px; padding: 0; border: 0;
  clip-path: inset(50%); overflow: hidden; white-space: nowrap;
}
.pw-count { font-size: 11px; color: var(--pw-text-dim); flex: 0 0 auto; }

/* 当前曲目 */
.pw-now {
  padding: 10px 13px 4px;
  flex: 0 0 auto;
  min-width: 0;
}
.pw-now-title {
  font-size: 13px; font-weight: 600;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.pw-now-meta { font-size: 11px; color: var(--pw-text-dim); margin-top: 1px; }

/* 进度条 */
.pw-progress { padding: 4px 13px 0; flex: 0 0 auto; }
.pw-range {
  -webkit-appearance: none; appearance: none;
  width: 100%; height: 20px; margin: 0;
  background: transparent; cursor: pointer; display: block;
}
.pw-range::-webkit-slider-runnable-track {
  height: 5px; border-radius: 999px;
  background: var(--pw-accent-soft);
}
.pw-range::-webkit-slider-thumb {
  -webkit-appearance: none; appearance: none;
  width: 13px; height: 13px; margin-top: -4px;
  border-radius: 50%; border: 2px solid var(--pw-shell-solid);
  background: var(--pw-accent);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
}
.pw-range::-moz-range-track { height: 5px; border-radius: 999px; background: var(--pw-accent-soft); }
.pw-range::-moz-range-thumb {
  width: 13px; height: 13px; border-radius: 50%;
  border: 2px solid var(--pw-shell-solid); background: var(--pw-accent);
}
.pw-range:focus-visible { outline: 2px solid var(--pw-focus); outline-offset: 3px; border-radius: 6px; }
.pw-range:disabled { opacity: 0.45; cursor: default; }
.pw-times {
  display: flex; justify-content: space-between;
  font-size: 11px; color: var(--pw-text-dim);
  font-variant-numeric: tabular-nums;
  padding: 0 2px 2px;
}

/* 走带 */
.pw-transport {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  padding: 6px 13px 10px;
  flex: 0 0 auto;
}
.pw-btn {
  display: grid; place-items: center;
  width: 34px; height: 34px;
  border: 1px solid transparent; border-radius: 10px;
  background: transparent; color: var(--pw-text);
  cursor: pointer;
  transition: background 140ms ease, color 140ms ease, transform 120ms ease;
}
.pw-btn:hover { background: var(--pw-hover); }
.pw-btn:active { transform: scale(0.94); }
.pw-btn:focus-visible { outline: 2px solid var(--pw-focus); outline-offset: 2px; }
.pw-btn:disabled { opacity: 0.35; cursor: default; background: transparent; }
.pw-btn-primary {
  width: 44px; height: 44px; border-radius: 50%;
  background: var(--pw-accent); color: var(--pw-shell-solid);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
}
.pw-btn-primary:hover { background: var(--pw-accent); filter: brightness(1.06); }
.pw-btn-primary:disabled { filter: none; }
.pw-btn-mode[data-mode="repeat-one"] { color: var(--pw-accent); background: var(--pw-accent-soft); }
.pw-btn-mode[data-mode="shuffle"] { color: var(--pw-accent); background: var(--pw-accent-soft); }

/* 音量 */
.pw-volume {
  display: flex; align-items: center; gap: 8px;
  padding: 0 13px 11px;
  flex: 0 0 auto;
  color: var(--pw-text-dim);
}
.pw-volume .pw-range { height: 18px; }
.pw-volume-value {
  font-size: 11px; font-variant-numeric: tabular-nums;
  min-width: 30px; text-align: right;
}

/* 播放列表 */
.pw-list-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 7px 13px;
  border-top: 1px solid var(--pw-border);
  border-bottom: 1px solid var(--pw-border);
  font-size: 11px; color: var(--pw-text-dim);
  flex: 0 0 auto;
}
.pw-list {
  list-style: none; margin: 0; padding: 5px 0 7px;
  overflow-y: auto; overscroll-behavior: contain;
  flex: 1 1 auto; min-height: 0;
}
/* 窄滚动条，不抢注意力 */
.pw-list { scrollbar-width: thin; scrollbar-color: var(--pw-border-strong) transparent; }
.pw-list::-webkit-scrollbar { width: 8px; }
.pw-list::-webkit-scrollbar-thumb { background: var(--pw-border); border-radius: 999px; }

.pw-item {
  display: flex; align-items: center; gap: 8px;
  padding: 7px 10px 7px 13px;
  cursor: pointer;
  border-left: 2.5px solid transparent;
}
.pw-item:hover { background: var(--pw-hover); }
.pw-item[data-current="true"] {
  border-left-color: var(--pw-accent);
  background: var(--pw-accent-soft);
}
.pw-item-index {
  flex: 0 0 auto; width: 18px;
  font-size: 10.5px; color: var(--pw-text-dim);
  font-variant-numeric: tabular-nums; text-align: right;
}
.pw-item-body { flex: 1 1 auto; min-width: 0; }
.pw-item-name {
  font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.pw-item[data-current="true"] .pw-item-name { font-weight: 600; }
.pw-item-meta { font-size: 10.5px; color: var(--pw-text-dim); }
.pw-item-remove {
  flex: 0 0 auto; width: 24px; height: 24px;
  display: grid; place-items: center;
  border: 0; border-radius: 7px;
  background: transparent; color: var(--pw-text-dim);
  cursor: pointer; opacity: 0.65;
}
.pw-item-remove:hover { background: var(--pw-hover); color: var(--pw-text); opacity: 1; }
.pw-item-remove:focus-visible { outline: 2px solid var(--pw-focus); outline-offset: 1px; opacity: 1; }

/* 诊断区（Shift+点悬浮球切换）：等宽小字，长值换行 */
.pw-diag {
  flex: 0 0 auto;
  max-height: 210px;
  overflow-y: auto;
  padding: 8px 12px 10px;
  border-top: 1px solid var(--pw-border);
  background: var(--pw-accent-soft);
  font-size: 10.5px;
  line-height: 1.65;
  font-family: var(--dsh-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
}
.pw-diag-title { font-weight: 600; margin-bottom: 4px; }
.pw-diag-row { display: flex; gap: 6px; }
.pw-diag-label { flex: 0 0 46%; color: var(--pw-text-dim); word-break: break-all; }
.pw-diag-value { flex: 1 1 auto; word-break: break-all; }
.pw-diag-bad .pw-diag-value { color: #C0392B; font-weight: 600; }

/* 空态与提示 */
.pw-empty {
  padding: 16px 16px 20px;
  text-align: center; font-size: 12px; color: var(--pw-text-dim);
  line-height: 1.7;
}
.pw-empty strong { color: var(--pw-text); font-weight: 600; }
.pw-note {
  margin: 0 13px 8px; padding: 7px 9px;
  border-radius: 9px;
  background: var(--pw-accent-soft);
  color: var(--pw-text);
  font-size: 11.5px; line-height: 1.6;
}
.pw-note[hidden] { display: none; }

/* ── 移动端 ───────────────────────────────────────────────────────────── */
/* 抬高按钮并收窄面板，避开输入框与发送按钮 */
@media (max-width: 640px) {
  :host { right: 12px; bottom: 168px; }
  .pw-launcher { width: 52px; height: 52px; }
  .pw-avatar { width: 40px; height: 40px; }
  .pw-panel {
    width: min(300px, calc(100vw - 24px));
    max-height: min(58vh, 460px);
    bottom: 66px;
  }
}

/* 视口高度很小时（横屏手机）进一步压低面板 */
@media (max-height: 520px) {
  .pw-panel { max-height: min(64vh, 320px); }
}

/* 尊重系统的「减少动态效果」 */
@media (prefers-reduced-motion: reduce) {
  .pw-launcher, .pw-ear, .pw-btn, .pw-panel { transition: none; animation: none; }
  .pw-launcher[data-playing="true"]::after { animation: none; opacity: 0.5; }
}
`;

// ══════════════════════════════════════════════════════════════════════════
//  文档级主题
// ══════════════════════════════════════════════════════════════════════════
//
//  挂件之外，插件还给整个界面加一层「帕朵菲莉丝」的主题：
//  一张以角色立绘为主题的壁纸，加上把 DSH 自己的配色往角色色相上偏的染色。
//
//  ── 壁纸挂在哪一层 ────────────────────────────────────────────────────
//  挂在 html::before 上：html 是根元素，它自己的伪元素天然画在 body 的背景
//  之下，所以不需要 z-index 去和 DSH 的任何元素争层级。用 body::before 反而
//  会画在 body 背景之上，盖住 DSH 自己的底色。
//
//  ── 为什么要改 DSH 的配色令牌 ─────────────────────────────────────────
//  DSH 把整套配色定义为 --dsw-alias-* 令牌（约 100 个），挂在 body 上，
//  明暗两档靠 body[data-ds-dark-theme] 重定义。壁纸一旦上色，原来的
//  「白底 + 深字」与「深底 + 浅字」的对比度假设就会变化，所以必须把
//  背景族令牌一起往角色色相上偏、并加一点透明度让壁纸透出来。
//  只动【背景族】与滚动条；文字色、状态色、代码高亮、报错色一律不碰——
//  那些一改就得重新证明对比度，而且会丢语义。
//
//  ── 为什么用 !important ────────────────────────────────────────────────
//  DSH 的令牌定义在它自己的样式表里，且选择器形态未知（打包产物里同一批
//  令牌在 body 与 body[data-ds-dark-theme] 下各出现两次）。插件样式表的
//  插入位置取决于模块加载顺序，不如把优先级显式定死。这里加 !important 的
//  对象是 CSS 自定义属性，只会影响颜色，不涉及任何布局属性。

const THEME_ATTR_VALUE = 'on';

const THEME_STYLES = `
html[data-dsh-pardofelis="${THEME_ATTR_VALUE}"] {
  /* 这五条全部要 !important。曾经只有 background-color 带，结果 DSH 自己的
     html 规则用 background 简写把 background-image 抹掉——底色生效了、
     壁纸却没画上去，看起来就像"主题没生效"。 */
  background-color: #FFFCFA !important;
  background-image: var(--pw-wallpaper-light) !important;
  background-size: cover !important;
  background-position: center !important;
  background-repeat: no-repeat !important;
  /* 刻意不写 background-attachment: fixed。根元素背景会被提升为画布背景，
     而 fixed 要求相对视口定位，两者语义冲突，多个引擎在这里表现不一致
     （症状就是「color 画了、image 没画」）。文档本身不滚动，不需要它。 */
}
html[data-dsh-pardofelis="${THEME_ATTR_VALUE}"][data-pw-dark="on"] {
  background-color: #1E1C24 !important;
  background-image: var(--pw-wallpaper-dark) !important;
}

/*
 * 染色：把 DSH 的背景族令牌往角色色相（暖砂 / 藕粉 / 靛紫）上偏，
 * 并给一部分加透明度，让下面的壁纸透出来。
 * 每个变量都带 DSH 原值作回退，取不到令牌时行为与未加主题一致。
 *
 * ⚠ 【页面底色】和【卡片/弹层】必须分开对待：
 *   bg-base 是最底层，半透明只是透出壁纸，正确；
 *   bg-layer-* 是叠在别的内容【之上】的表面（面板 .wCInkW_panel、下拉、输入框、
 *   卡片……），一旦半透明，下层内容会透上来和它串在一起——「打开设置时两个窗口
 *   内容混在一起」就是这个原因。所以 layer 家族必须保持不透明。
 *
 * ⚠ 不透明度必须按【层数】反推，因为半透明层叠是相乘而不是相加。
 *   DSH 在对话区实际叠了四层：body -> BynINW_frame -> BynINW_centerCol
 *   -> Dc7zOa_root，四层各 0.72 叠起来是 1-(0.28^4·0.25) ≈ 99.4% 不透明，
 *   壁纸等于被完全挡住（这是 v1.1 系列一直「看不到背景」的真正原因）。
 *   现在每层给 0.28：四层等效 ≈ 0.73，两层（侧栏）≈ 0.48。
 *   改动这里之前请先重跑 tools/contrast_audit.py。
 */
html[data-dsh-pardofelis="${THEME_ATTR_VALUE}"] body {
  --dsw-alias-bg-base: rgba(255, 252, 250, 0.28) !important;
  --dsw-alias-bg-layer-1: rgba(255, 251, 248, 1) !important;
  --dsw-alias-bg-layer-2: rgba(253, 246, 243, 1) !important;
  --dsw-alias-bg-layer-3: rgba(251, 243, 240, 1) !important;
  --dsw-alias-bg-overlay: rgba(255, 252, 250, 0.98) !important;
  --dsw-alias-bg-mask-1: rgba(74, 58, 52, 0.06) !important;
  --dsw-alias-bg-mask-2: rgba(74, 58, 52, 0.10) !important;
  --dsw-alias-bg-mask-3: rgba(74, 58, 52, 0.16) !important;
  --dsw-alias-bg-mask-drop: rgba(74, 58, 52, 0.22) !important;
  --dsw-alias-bg-skeleton: rgba(152, 132, 121, 0.16) !important;
  --dsw-alias-bg-multi-select: rgba(79, 90, 144, 0.20) !important;
  --dsw-alias-interactive-bg-hover: rgba(152, 132, 121, 0.13) !important;
  --dsw-alias-interactive-bg-active: rgba(152, 132, 121, 0.19) !important;
  --dsw-alias-interactive-bg-hover-solid: rgba(244, 232, 226, 0.96) !important;
  --dsw-alias-scrollbar-bg-l1: rgba(152, 132, 121, 0.20) !important;
  --dsw-alias-scrollbar-hover-l1: rgba(152, 132, 121, 0.36) !important;
  --dsw-alias-scrollbar-bg-l2: rgba(152, 132, 121, 0.26) !important;
  --dsw-alias-scrollbar-hover-l2: rgba(152, 132, 121, 0.44) !important;
  /* 侧栏的底。DSH 用 --dsw-specific-* 命名，就是留给主题覆盖的语义槽位；
     不覆盖它侧栏会是一块不透明的 #f9fafb，把左侧的角色整个挡掉。 */
  --dsw-specific-sidebar-fill: rgba(250, 248, 246, 0.64) !important;
}
html[data-dsh-pardofelis="${THEME_ATTR_VALUE}"][data-pw-dark="on"] body {
  --dsw-alias-bg-base: rgba(30, 28, 36, 0.30) !important;
  --dsw-alias-bg-layer-1: rgba(36, 33, 42, 1) !important;
  --dsw-alias-bg-layer-2: rgba(41, 38, 48, 1) !important;
  --dsw-alias-bg-layer-3: rgba(46, 42, 54, 1) !important;
  --dsw-alias-bg-overlay: rgba(30, 28, 36, 0.98) !important;
  --dsw-alias-bg-mask-1: rgba(0, 0, 0, 0.18) !important;
  --dsw-alias-bg-mask-2: rgba(0, 0, 0, 0.26) !important;
  --dsw-alias-bg-mask-3: rgba(0, 0, 0, 0.34) !important;
  --dsw-alias-bg-mask-drop: rgba(0, 0, 0, 0.44) !important;
  --dsw-alias-bg-skeleton: rgba(212, 178, 166, 0.12) !important;
  --dsw-alias-bg-multi-select: rgba(185, 194, 240, 0.20) !important;
  --dsw-alias-interactive-bg-hover: rgba(212, 178, 166, 0.15) !important;
  --dsw-alias-interactive-bg-active: rgba(212, 178, 166, 0.22) !important;
  --dsw-alias-interactive-bg-hover-solid: rgba(56, 51, 64, 0.96) !important;
  --dsw-alias-scrollbar-bg-l1: rgba(212, 178, 166, 0.20) !important;
  --dsw-alias-scrollbar-hover-l1: rgba(212, 178, 166, 0.36) !important;
  --dsw-alias-scrollbar-bg-l2: rgba(212, 178, 166, 0.26) !important;
  --dsw-alias-scrollbar-hover-l2: rgba(212, 178, 166, 0.44) !important;
  --dsw-specific-sidebar-fill: rgba(32, 30, 38, 0.64) !important;
}
`;

/** 主题样式表的宿主 id，卸载时按它摘除。 */
const THEME_STYLE_ID = 'dsh-pardofelis-theme';

// ══════════════════════════════════════════════════════════════════════════
//  小工具
// ══════════════════════════════════════════════════════════════════════════

/**
 * 从 from 出发向上找第一个命中 selector 的元素，最多走到 boundary 为止。
 *
 * 刻意不用 el.closest()：事件委托里真正可靠的是 event.currentTarget（永远
 * 是挂监听的元素），而 target 只保证是「事件目标」。自己向上走
 * parentElement，行为完全可预期，也不依赖 target 一定是 Element。
 */
function closestWithin(from, selector, boundary) {
  let node = from;
  while (node !== null && node !== undefined) {
    if (typeof node.matches === 'function' && node.matches(selector)) return node;
    if (node === boundary) return null;
    node = node.parentElement;
  }
  return null;
}

function el(tag, attrs, children) {
  const node = document.createElement(tag);
  if (attrs) {
    for (const key of Object.keys(attrs)) {
      const value = attrs[key];
      if (value === undefined || value === null || value === false) continue;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key === 'style') node.setAttribute('style', value);
      else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
      else if (value === true) node.setAttribute(key, '');
      else node.setAttribute(key, String(value));
    }
  }
  for (const child of children || []) {
    if (child === null || child === undefined || child === false) continue;
    node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

/** SVG 命名空间。在这之上创建的节点才会被浏览器当图形渲染。 */
const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * 创建 SVG 元素。
 *
 * 必须用 createElementNS：在 HTML 文档里用 createElement('svg') 造出来的节点
 * 落在 HTML 命名空间，浏览器不会把它当 SVG 渲染——结果是按钮里什么都没有，
 * 而 CSS 的尺寸、圆角、悬停全部正常，看起来像"图标丢了"。
 * 这个坑踩过一次（v1.0.0 的走带按钮全是空白方块）。
 */
function svgEl(tag, attrs, children) {
  const node = document.createElementNS(SVG_NS, tag);
  if (attrs) {
    for (const key of Object.keys(attrs)) {
      const value = attrs[key];
      if (value === undefined || value === null || value === false) continue;
      node.setAttribute(key, value === true ? '' : String(value));
    }
  }
  for (const child of children || []) {
    if (child === null || child === undefined) continue;
    node.append(child);
  }
  return node;
}

/**
 * 主题诊断：把「为什么背景没生效」需要的事实直接摆进面板。
 *
 * 为什么要有它：定位这类问题最直接的办法本来是让用户开控制台、粘一段探针。
 * 但控制台有粘贴防护、要按特定顺序操作、还容易被输入法换成全角字符——
 * 一轮轮试下来成本比实现这个还高。读屏看结论比来回粘代码可靠得多。
 *
 * 入口刻意做得不显眼但好描述：按住 Shift 点悬浮球。
 * 全程只读，不改任何东西。
 */
function collectDiagnostics() {
  const rows = [];
  const add = (label, value, bad) => rows.push({ label, value: String(value), bad: bad === true });

  // 1. 插件自己判定出的明暗档
  let theme = '?';
  try {
    theme = detectTheme();
  } catch {
    theme = '读取失败';
  }
  add('插件判定明暗档', theme);

  // 2. 主题样式表在不在、html 上的背景图有没有被解析出来
  const styleTag = document.getElementById(THEME_STYLE_ID);
  add('主题样式表', styleTag === null ? '未注入' : '已注入', styleTag === null);
  add('html 主题属性', document.documentElement.getAttribute(HOST_ATTR) ?? '（无）',
    document.documentElement.getAttribute(HOST_ATTR) === null);

  let bgImage = '读不到';
  let bgColor = '读不到';
  try {
    const computed = window.getComputedStyle(document.documentElement);
    bgImage = computed.backgroundImage ?? '（空）';
    bgColor = computed.backgroundColor ?? '（空）';
  } catch {
    /* 保持默认值 */
  }
  add('html 背景图', bgImage === 'none' || bgImage === '（空）'
    ? '未设置（被覆盖或被丢弃）'
    : `已解析，${bgImage.length} 字符`, bgImage === 'none' || bgImage === '（空）');
  add('html 底色', bgColor);

  // 3. 逐层背景色：从输入框一路向上，找出不透明的那一层
  const composer = document.querySelector(COMPOSER_SELECTORS.join(','));
  if (composer === null) {
    add('页面锚点', '未找到输入框（当前不在对话页？）', true);
  } else {
    let node = composer;
    let depth = 0;
    let foundOpaque = false;
    while (node !== null && node !== document.documentElement && depth < 14) {
      let color = '?';
      try {
        color = window.getComputedStyle(node).backgroundColor ?? '?';
      } catch {
        /* 忽略 */
      }
      const match = color.match(/rgba?\([^)]*?([\d.]+)\s*\)$/);
      const alpha = match === null ? 1 : Number(match[1]);
      const opaque = alpha >= 0.95;
      if (opaque) foundOpaque = true;
      const name = `${node.tagName.toLowerCase()}${node.id ? '#' + node.id : ''}`
        + (typeof node.className === 'string' && node.className.length > 0
          ? '.' + node.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
      add(`  ${'·'.repeat(1)}第${depth + 1}层 ${name}`,
        color + (opaque ? '  ←不透明，挡住壁纸' : ''), opaque);
      node = node.parentElement;
      depth += 1;
    }
    add('逐层扫描结果', foundOpaque ? '存在不透明层（见上）' : '没有不透明层', foundOpaque);
  }

  // 4. 壁纸图能不能真正加载（这才是「有值但不画」的关键）
  const probes = [WALLPAPER_LIGHT_URL, WALLPAPER_DARK_URL];
  const loadable = probes.map(() => '检测中…');
  add('壁纸图可加载性', loadable.join(' / '));
  const rowIndex = rows.length - 1;
  if (typeof Image === 'function') {
    probes.forEach((url, index) => {
      const probe = new Image();
      probe.onload = () => {
        loadable[index] = `可加载 ${probe.naturalWidth}x${probe.naturalHeight}`;
        rows[rowIndex].value = loadable.join(' / ');
        render();
      };
      probe.onerror = () => {
        loadable[index] = '加载失败';
        rows[rowIndex].value = loadable.join(' / ');
        rows[rowIndex].bad = true;
        render();
      };
      probe.src = url;
    });
  } else {
    loadable[0] = loadable[1] = '环境不支持检测';
    rows[rowIndex].value = loadable.join(' / ');
  }

  // 5. 上下文
  add('视口', `${window.innerWidth}x${window.innerHeight}`);
  add('插件版本', PLUGIN_VERSION);

  let container = null;
  let rowsHost = null;
  function render() {
    if (rowsHost === null || !container.isConnected) return;
    // 只清「行」这一层，别用 container.textContent = ''——那会把标题也一起清掉，
    // 结果诊断区只剩一堆没有表头的行（踩过一次）。
    rowsHost.textContent = '';
    for (const row of rows) {
      rowsHost.append(el('div', {
        class: `pw-diag-row${row.bad ? ' pw-diag-bad' : ''}`,
      }, [
        el('span', { class: 'pw-diag-label', text: row.label }),
        el('span', { class: 'pw-diag-value', text: row.value }),
      ]));
    }
  }

  return {
    attach(parent) {
      rowsHost = el('div', { class: 'pw-diag-rows' });
      container = el('div', { class: 'pw-diag' }, [
        el('div', { class: 'pw-diag-title', text: '主题诊断（只读）' }),
        rowsHost,
      ]);
      parent.append(container);
      render();
    },
    refresh: render,
  };
}

/** 行内 SVG 图标。不上传、不请求，纯路径数据。 */
function icon(name, size) {
  const svg = (paths) =>
    svgEl('svg', {
      viewBox: '0 0 24 24', width: size, height: size, fill: 'none',
      stroke: 'currentColor', 'stroke-width': '1.8',
      'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true',
      focusable: 'false',
    }, paths.map((d) => svgEl('path', { d })));
  switch (name) {
    case 'plus':
      return svg(['M12 5v14', 'M5 12h14']);
    case 'play':
      return svgEl('svg', {
        viewBox: '0 0 24 24', width: size, height: size, 'aria-hidden': 'true', focusable: 'false',
      }, [svgEl('path', { d: 'M8 5.2v13.6L19 12z', fill: 'currentColor', stroke: 'none' })]);
    case 'pause':
      return svgEl('svg', {
        viewBox: '0 0 24 24', width: size, height: size, 'aria-hidden': 'true', focusable: 'false',
      }, [
        svgEl('rect', { x: '7', y: '5', width: '3.4', height: '14', rx: '1.1', fill: 'currentColor', stroke: 'none' }),
        svgEl('rect', { x: '13.6', y: '5', width: '3.4', height: '14', rx: '1.1', fill: 'currentColor', stroke: 'none' }),
      ]);
    case 'prev':
      return svg(['M18.5 6.2v11.6L9.8 12z', 'M5.5 5.5v13']);
    case 'next':
      return svg(['M5.5 6.2v11.6L14.2 12z', 'M18.5 5.5v13']);
    case 'sequence':
      return svg(['M4 7h11', 'M4 12h8', 'M4 17h11', 'M17.5 13.5 21 17l-3.5 3.5']);
    case 'repeat-one':
      return svg(['M4 10.5A4 4 0 0 1 8 6.5h9', 'M17 3.5 20.5 6.5 17 9.5', 'M20 15.5a4 4 0 0 1-4 4H7', 'M7 22.5 3.5 19.5 7 16.5', 'M12 11.5v5']);
    case 'shuffle':
      return svg(['M4 6h3.5l3 4', 'M4 18h3.5l9-12H20', 'M17 3.5 20.5 6 17 8.5', 'M13.5 15.5 16.5 18H20', 'M17 15.5 20.5 18 17 20.5']);
    case 'volume':
      return svg(['M5 10v4h3l4 3.5v-11L8 10z', 'M15.5 9.2a4 4 0 0 1 0 5.6']);
    case 'volume-mute':
      return svg(['M5 10v4h3l4 3.5v-11L8 10z', 'M16 10l4 4', 'M20 10l-4 4']);
    case 'close':
      return svg(['M6.5 6.5l11 11', 'M17.5 6.5l-11 11']);
    case 'trash':
      return svg(['M5.5 7.5h13', 'M9.5 7.5V5.5h5v2', 'M7 7.5l.8 11a1 1 0 0 0 1 1h6.4a1 1 0 0 0 1-1l.8-11']);
    case 'cat':
      return svg(['M4 9.5 6.5 5l3 3.2h5L17.5 5 20 9.5', 'M4 9.5c0 5 3.6 8.5 8 8.5s8-3.5 8-8.5']);
    default:
      return null;
  }
}

/**
 * 事件目标是不是表单控件（输入框 / 滑杆 / 按钮）。
 *
 * 刻意不用 `instanceof HTMLInputElement`：那要求运行环境存在这些全局构造器，
 * 也让代码多一层隐式依赖。直接看标签名，语义一样、依赖更少。
 */
function isFormControl(node) {
  if (node === null || node === undefined || typeof node.tagName !== 'string') return false;
  const tag = node.tagName.toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON';
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--';
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}:${String(m % 60).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
  return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

/** 偏好读写：localStorage 在隐私模式 / 沙箱里可能抛错，一律静默降级。 */
function readPrefs() {
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (raw === null) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return {
      volume: typeof parsed.volume === 'number' && parsed.volume >= 0 && parsed.volume <= 1
        ? parsed.volume : DEFAULTS.volume,
      mode: PLAY_MODES.includes(parsed.mode) ? parsed.mode : DEFAULTS.mode,
      open: typeof parsed.open === 'boolean' ? parsed.open : DEFAULTS.open,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function writePrefs(prefs) {
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(prefs));
  } catch {
    /* 存不了就算了，功能不受影响 */
  }
}

/** 相对亮度（WCAG）。用于从 DSH 自身配色推断明暗。 */
function luminance(rgb) {
  const channel = (value) => {
    const v = value / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
}

function parseColor(value) {
  if (typeof value !== 'string' || value.length === 0) return null;
  const match = value.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?/i);
  if (match === null) return null;
  const alpha = match[4] === undefined ? 1 : Number(match[4]);
  if (!(alpha > 0.5)) return null; // 半透明背景说明不是主背景，跳过
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

// ══════════════════════════════════════════════════════════════════════════
//  挂件
// ══════════════════════════════════════════════════════════════════════════

class PardofelisWidget {
  /** @param {ParentNode} parent - 宿主节点所在的父级（Shadow Root）。 */
  constructor(parent) {
    this.prefs = readPrefs();
    this.tracks = [];
    /** @type {Map<string, string>} 曲目 id -> blob: 地址，卸载时逐个 revoke */
    this.objectUrls = new Map();
    /** @type {string | null} */
    this.currentId = null;
    this.seq = 0;
    this.notice = '';
    this.disposers = [];
    /** @type {{attach: Function, refresh: Function} | null} 诊断视图，Shift+点切换 */
    this.diagnostics = null;
    this.urlRegistry = new Map();
    this.ui = {};

    this.instanceNo = (PardofelisWidget.instanceCounter = (PardofelisWidget.instanceCounter || 0) + 1);
    this.audio = new Audio();
    this.audio.preload = 'metadata';
    this.audio.volume = this.prefs.volume;

    this.render(parent);
    this.bindAudio();
    this.syncAll();
  }

  // ── 挂载 ───────────────────────────────────────────────────────────────

  /** 收集事件监听，卸载时逐条摘除。 */
  listen(target, type, handler, options) {
    // 摘除监听必须传【完全相同的函数引用】，因此这里固定持有同一个引用。
    // 任何再包一层的写法（bind / 箭头包装）都会让 removeEventListener 失效，
    // 从而在多轮挂载中把旧闭包留在页面上。
    const wrapped = handler;
    target.addEventListener(type, wrapped, options);
    this.disposers.push(() => target.removeEventListener(type, wrapped, options));
  }

  // ── 渲染骨架 ───────────────────────────────────────────────────────────

  render(parent) {
    const launcher = el('button', {
      class: 'pw-launcher',
      type: 'button',
      'aria-label': '帕朵菲莉丝音乐挂件',
      'aria-expanded': String(this.prefs.open === true),
      'aria-haspopup': 'dialog',
      title: '帕朵菲莉丝 · 本地音乐',
    }, [
      el('span', { class: 'pw-ear pw-ear-left', 'aria-hidden': 'true' }),
      el('span', { class: 'pw-ear pw-ear-right', 'aria-hidden': 'true' }),
      el('img', { class: 'pw-avatar', src: AVATAR_URL, alt: '', 'aria-hidden': 'true', draggable: 'false' }),
    ]);

    const fileInput = el('input', {
      class: 'pw-visually-hidden',
      type: 'file',
      accept: 'audio/*,.mp3,.m4a,.aac,.ogg,.oga,.opus,.wav,.flac,.webm',
      multiple: true,
      tabindex: '-1',
      'aria-hidden': 'true',
    });

    const list = el('ul', { class: 'pw-list', role: 'list', 'aria-label': '播放列表' });

    const progress = el('input', {
      class: 'pw-range pw-progress-range',
      type: 'range', min: '0', max: '1000', step: '1', value: '0',
      'aria-label': '播放进度',
    });
    const volume = el('input', {
      class: 'pw-range pw-volume-range',
      type: 'range', min: '0', max: '100', step: '1',
      value: String(Math.round(this.prefs.volume * 100)),
      'aria-label': '音量',
    });

    const btnPrev = el('button', {
      class: 'pw-btn', type: 'button', 'aria-label': '上一首', title: '上一首（Ctrl+←）',
    }, [icon('prev', 18)]);
    const btnPlay = el('button', {
      class: 'pw-btn pw-btn-primary', type: 'button', 'aria-label': '播放', title: '播放 / 暂停（空格）',
    }, [icon('play', 20)]);
    const btnNext = el('button', {
      class: 'pw-btn', type: 'button', 'aria-label': '下一首', title: '下一首（Ctrl+→）',
    }, [icon('next', 18)]);
    const btnMode = el('button', {
      class: 'pw-btn pw-btn-mode', type: 'button', 'data-mode': this.prefs.mode,
      'aria-label': `播放模式：${PLAY_MODE_LABEL[this.prefs.mode]}`,
      title: `播放模式：${PLAY_MODE_LABEL[this.prefs.mode]}`,
    }, [icon(this.prefs.mode, 18)]);

    const progressRange = progress;
    const volumeRange = volume;

    const panel = el('div', {
      class: 'pw-panel',
      role: 'dialog',
      'aria-modal': 'false',
      'aria-label': '帕朵菲莉丝音乐面板',
      // 面板开合状态可持久化：刷新后保持上次的样子
      'data-open': String(this.prefs.open === true),
    }, [
      el('div', { class: 'pw-head' }, [
        el('img', { class: 'pw-head-avatar', src: AVATAR_URL, alt: '', 'aria-hidden': 'true', draggable: 'false' }),
        el('div', { class: 'pw-head-text' }, [
          el('div', { class: 'pw-title', text: '帕朵菲莉丝' }),
          el('div', { class: 'pw-subtitle', text: '本地音乐 · 不上传' }),
        ]),
        el('button', {
          class: 'pw-head-close', type: 'button', 'aria-label': '收起面板', title: '收起（Esc）',
        }, [icon('close', 16)]),
      ]),

      el('div', { class: 'pw-picker-row' }, [
        el('label', { class: 'pw-picker' }, [icon('plus', 15), ' 导入本地音乐', fileInput]),
        el('span', { class: 'pw-count', text: '0 首' }),
      ]),

      el('div', { class: 'pw-now' }, [
        el('div', { class: 'pw-now-title', text: '尚未选择曲目' }),
        el('div', { class: 'pw-now-meta', text: '导入后点击列表中的曲目即可播放' }),
      ]),

      el('div', { class: 'pw-progress' }, [
        progressRange,
        el('div', { class: 'pw-times' }, [
          el('span', { class: 'pw-time-current', text: '0:00' }),
          el('span', { class: 'pw-time-total', text: '--:--' }),
        ]),
      ]),

      el('div', { class: 'pw-transport' }, [btnMode, btnPrev, btnPlay, btnNext]),

      el('div', { class: 'pw-volume' }, [
        icon('volume', 16),
        volumeRange,
        el('span', { class: 'pw-volume-value', text: `${Math.round(this.prefs.volume * 100)}%` }),
      ]),

      el('div', { class: 'pw-note', hidden: true }),
      el('div', { class: 'pw-list-head' }, [
        el('span', { text: '播放列表' }),
        el('span', { class: 'pw-list-hint', text: '刷新后需重新导入' }),
      ]),
      list,
      el('div', { class: 'pw-empty' }, [
        el('div', {}, [el('strong', { text: '还没有音乐' })]),
        el('div', { text: '点上面的「导入本地音乐」选择音频文件。' }),
        el('div', { text: '支持多选，文件只在这台电脑上播放。' }),
      ]),
      // 诊断区默认是空的（不占高度）；Shift+点悬浮球才填内容
      el('div', { class: 'pw-diag-host' }),
    ]);

    parent.append(launcher, panel);

    this.ui = {
      parent, launcher, panel, fileInput, list,
      diagHost: panel.querySelector('.pw-diag-host') ?? null,
      progress: progressRange, volume: volumeRange,
      timeCurrent: panel.querySelector('.pw-time-current'),
      timeTotal: panel.querySelector('.pw-time-total'),
      nowTitle: panel.querySelector('.pw-now-title'),
      nowMeta: panel.querySelector('.pw-now-meta'),
      count: panel.querySelector('.pw-count'),
      note: panel.querySelector('.pw-note'),
      empty: panel.querySelector('.pw-empty'),
      btnPrev, btnPlay, btnNext, btnMode,
      volumeValue: panel.querySelector('.pw-volume-value'),
      close: panel.querySelector('.pw-head-close'),
    };

    this.bindUi();
  }

  // ── 交互绑定 ───────────────────────────────────────────────────────────

  bindUi() {
    const { ui } = this;

    this.listen(ui.launcher, 'click', (event) => {
      // Shift+点：切换主题诊断。入口不显眼，但好描述、也永远不会误触。
      if (event !== undefined && event !== null && event.shiftKey === true) {
        this.toggleDiagnostics();
        return;
      }
      this.setOpen(!this.isOpen());
    });
    this.listen(ui.close, 'click', () => {
      this.setOpen(false);
      ui.launcher.focus();
    });

    // 导入
    this.listen(ui.fileInput, 'change', () => {
      const files = Array.from(ui.fileInput.files || []);
      ui.fileInput.value = ''; // 允许重复导入同一批文件
      this.importFiles(files);
    });

    // 走带
    this.listen(ui.btnPlay, 'click', () => this.togglePlay());
    this.listen(ui.btnPrev, 'click', () => this.step(-1, true));
    this.listen(ui.btnNext, 'click', () => this.step(1, true));
    this.listen(ui.btnMode, 'click', () => this.cycleMode());

    // 进度与音量
    this.listen(ui.progress, 'input', () => {
      if (this.audio.duration > 0) {
        this.audio.currentTime = (Number(ui.progress.value) / 1000) * this.audio.duration;
      }
    });
    this.listen(ui.volume, 'input', () => {
      const value = Number(ui.volume.value) / 100;
      this.audio.volume = value;
      this.prefs.volume = value;
      ui.volumeValue.textContent = `${Math.round(value * 100)}%`;
      writePrefs(this.prefs);
    });

    // 列表：事件委托，点击切歌 / 移除
    this.listen(ui.list, 'click', (event) => {
      const list = event.currentTarget;
      const target = event.target;
      if (target === null || target === undefined) return;
      const removeButton = closestWithin(target, '.pw-item-remove', list);
      if (removeButton !== null) {
        event.stopPropagation();
        const id = removeButton.closest('.pw-item')?.getAttribute('data-id');
        if (id !== null && id !== undefined) this.removeTrack(id);
        return;
      }
      const item = closestWithin(target, '.pw-item', list);
      const id = item === null ? null : item.getAttribute('data-id');
      if (id !== null && id !== undefined) this.playTrack(id);
    });

    // 列表键盘：方向键在条目间移动焦点
    this.listen(ui.list, 'keydown', (event) => {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      const list = event.currentTarget;
      const item = closestWithin(event.target, '.pw-item', list);
      if (item === null) return;
      const items = Array.from(ui.list.querySelectorAll('.pw-item'));
      const index = items.indexOf(item);
      if (index < 0) return;
      event.preventDefault();
      const next = event.key === 'ArrowDown'
        ? Math.min(items.length - 1, index + 1)
        : Math.max(0, index - 1);
      items[next]?.focus();
    });

    // 面板内的键盘快捷键
    this.listen(ui.panel, 'keydown', (event) => {
      const key = event.key;
      if (key === 'Escape') {
        event.stopPropagation();
        this.setOpen(false);
        ui.launcher.focus();
        return;
      }
      // 空格键在输入类控件上必须保持原义（滑杆有自己的键盘行为）
      if (key === ' ' && !isFormControl(event.target)) {
        event.preventDefault();
        this.togglePlay();
        return;
      }
      if (key === 'ArrowRight' && event.ctrlKey) { event.preventDefault(); this.step(1, true); return; }
      if (key === 'ArrowLeft' && event.ctrlKey) { event.preventDefault(); this.step(-1, true); return; }
      if (key === 'ArrowRight') {
        event.preventDefault();
        this.seekBy(5);
        return;
      }
      if (key === 'ArrowLeft') {
        event.preventDefault();
        this.seekBy(-5);
        return;
      }
      if (key === 'ArrowUp') {
        event.preventDefault();
        this.adjustVolume(0.05);
        return;
      }
      if (key === 'ArrowDown') {
        event.preventDefault();
        this.adjustVolume(-0.05);
      }
    });
  }

  // ── audio 事件 ─────────────────────────────────────────────────────────

  bindAudio() {
    const audio = this.audio;

    this.listen(audio, 'play', () => this.syncTransport());
    this.listen(audio, 'pause', () => this.syncTransport());
    this.listen(audio, 'ended', () => this.onEnded());
    this.listen(audio, 'error', () => {
      const track = this.currentTrack();
      if (track === null) return;
      this.setNotice(`无法播放「${track.name}」：这个文件在当前浏览器里不受支持，或已损坏。`);
      this.prefs.playing = false;
      this.syncTransport();
    });
    this.listen(audio, 'loadedmetadata', () => {
      const track = this.currentTrack();
      if (track !== null && Number.isFinite(audio.duration)) {
        track.duration = audio.duration;
        this.renderList();
      }
      this.syncProgress();
    });

    // rAF 只在播放时跑，暂停即停，靠 isConnected 兜底防泄漏
    const loop = () => {
      if (audio.paused || !this.ui.launcher.isConnected) {
        this.raf = null;
        this.syncProgress();
        return;
      }
      this.syncProgress();
      this.raf = window.requestAnimationFrame(loop);
    };
    this.startProgressLoop = () => {
      if (this.raf === null || this.raf === undefined) this.raf = window.requestAnimationFrame(loop);
    };
  }

  // ── 播放逻辑 ───────────────────────────────────────────────────────────

  isOpen() {
    return this.ui.panel.getAttribute('data-open') === 'true';
  }

  setOpen(open) {
    this.ui.panel.setAttribute('data-open', String(open));
    this.ui.launcher.setAttribute('aria-expanded', String(open));
    this.prefs.open = open;
    writePrefs(this.prefs);
    if (open) this.ui.panel.querySelector('.pw-picker')?.focus?.();
  }

  currentIndex() {
    if (this.currentId === null) return -1;
    return this.tracks.findIndex((track) => track.id === this.currentId);
  }

  currentTrack() {
    const index = this.currentIndex();
    return index < 0 ? null : this.tracks[index];
  }

  /** 导入文件。逐个 createObjectURL，立即渲染列表。 */
  importFiles(files) {
    const audioFiles = files.filter((file) => {
      if (file.size === 0) return false;
      if (file.type.startsWith('audio/')) return true;
      // 有些系统给不出 MIME，按扩展名兜底
      return /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|webm|mp4)$/i.test(file.name);
    });

    if (audioFiles.length === 0) {
      this.setNotice('没有可导入的音频文件。请选择 mp3 / wav / ogg / m4a 等音频格式。');
      return;
    }

    let duplicate = 0;
    const added = [];
    for (const file of audioFiles) {
      const signature = `${file.name}::${file.size}::${file.lastModified}`;
      if (this.tracks.some((track) => track.signature === signature)) {
        duplicate += 1;
        continue;
      }
      const id = `t${++this.seq}`;
      const url = this.createUrl(file);
      const track = {
        id, signature, name: file.name, size: file.size,
        duration: Number.NaN,
        objectUrl: url,
      };
      this.tracks.push(track);
      added.push(track);
    }

    if (added.length > 0) {
      this.setNotice(duplicate > 0 ? `已导入 ${added.length} 首，忽略 ${duplicate} 首重复文件。` : '');
      // 首次导入自动选中第一首（不自动播放，遵守自动播放策略）
      if (this.currentId === null) this.select(added[0].id, { load: true });
      this.renderList();
      this.syncAll();
      // 异步补时长
      void this.hydrateDurations();
    } else if (duplicate > 0) {
      this.setNotice(`这 ${duplicate} 首已经在列表里了。`);
    }
  }

  createUrl(file) {
    const url = URL.createObjectURL(file);
    this.objectUrls.set(url, url);
    return url;
  }

  releaseUrl(url) {
    if (typeof url !== 'string' || url.length === 0) return;
    if (this.objectUrls.has(url)) {
      URL.revokeObjectURL(url);
      this.objectUrls.delete(url);
    }
  }

  /** 用一次性 audio 元素读时长。不加入文档，不给页面增加任何节点。 */
  async hydrateDurations() {
    const pending = this.tracks.filter((track) => !Number.isFinite(track.duration));
    for (const track of pending) {
      if (!this.ui.launcher.isConnected) return;
      const duration = await probeDuration(track.objectUrl);
      if (Number.isFinite(duration)) {
        track.duration = duration;
        this.renderList();
        this.syncProgress();
      }
    }
  }

  select(id, options) {
    const opts = options || {};
    this.currentId = id;
    const track = this.currentTrack();
    if (track === null) return;
    this.setNotice('');
    if (opts.load === true) {
      this.audio.src = track.objectUrl;
      try {
        this.audio.load();
      } catch {
        /* 极端情况下 load() 抛错（例如同源策略），交给 error 事件 */
      }
    }
    this.syncAll();
    if (opts.autoplay === true) void this.play();
  }

  async play() {
    const track = this.currentTrack();
    if (track === null) return;
    if (this.audio.src !== track.objectUrl) this.select(track.id, { load: true });
    try {
      await this.audio.play();
      this.setNotice('');
    } catch (error) {
      // NotAllowedError：浏览器自动播放策略。本插件的播放全部由用户点击/按键触发，
      // 正常路径不会走到这里；仍然显式提示，绝不静默失败。
      const reason = error && error.name === 'NotAllowedError'
        ? '浏览器阻止了自动播放，请再点一次播放按钮。'
        : '播放失败：这个文件在当前浏览器里可能不受支持。';
      this.setNotice(reason);
    }
    this.syncTransport();
  }

  pause() {
    this.audio.pause();
    this.syncTransport();
  }

  /**
   * 用户点击列表里的曲目。无论点的是哪一首都直接起播：
   *  - 点当前曲目 = 从头/继续播放（想暂停请用播放键或再点一次播放键）
   *  - 点其它曲目 = 切过去并播放
   * play() 由用户点击触发，符合浏览器自动播放策略。
   */
  playTrack(id) {
    this.select(id, { load: true, autoplay: true });
  }

  togglePlay() {
    if (this.currentTrack() === null) {
      // 没选曲目就点播放：把第一首选上并开始
      if (this.tracks.length > 0) this.select(this.tracks[0].id, { load: true, autoplay: true });
      else this.setNotice('请先导入音频文件。');
      return;
    }
    if (this.audio.paused) void this.play();
    else this.pause();
  }

  /** 上 / 下一首。manual 为 true 表示用户主动触发（到边界时给出提示而不是静默）。 */
  step(delta, manual) {
    if (this.tracks.length === 0) {
      if (manual) this.setNotice('播放列表还是空的，先导入音频吧。');
      return;
    }
    const index = this.currentIndex();
    if (index < 0) {
      this.select(this.tracks[0].id, { load: true, autoplay: manual });
      return;
    }
    let next;
    if (this.prefs.mode === 'shuffle' && this.tracks.length > 1) {
      do {
        next = Math.floor(Math.random() * this.tracks.length);
      } while (next === index);
    } else {
      next = index + delta;
      if (next < 0) next = this.tracks.length - 1;
      if (next >= this.tracks.length) next = 0;
    }
    const wasPlaying = !this.audio.paused;
    this.select(this.tracks[next].id, { load: true, autoplay: wasPlaying || manual === true });
  }

  onEnded() {
    const index = this.currentIndex();
    if (index < 0) return;
    if (this.prefs.mode === 'repeat-one') {
      this.audio.currentTime = 0;
      void this.play();
      return;
    }
    if (this.prefs.mode === 'shuffle') {
      this.step(1, false);
      return;
    }
    if (index === this.tracks.length - 1) {
      // 顺序播放到底：停在最后一首，等待用户操作
      this.syncTransport();
      this.setNotice('顺序播放已到最后一首。');
      return;
    }
    this.step(1, false);
  }

  cycleMode() {
    const index = PLAY_MODES.indexOf(this.prefs.mode);
    const next = PLAY_MODES[(index + 1) % PLAY_MODES.length];
    this.prefs.mode = next;
    writePrefs(this.prefs);
    this.syncMode();
  }

  seekBy(seconds) {
    if (!Number.isFinite(this.audio.duration)) return;
    const next = Math.min(this.audio.duration, Math.max(0, this.audio.currentTime + seconds));
    this.audio.currentTime = next;
    this.syncProgress();
  }

  adjustVolume(delta) {
    const value = Math.min(1, Math.max(0, Math.round((this.audio.volume + delta) * 100) / 100));
    this.audio.volume = value;
    this.prefs.volume = value;
    this.ui.volume.value = String(Math.round(value * 100));
    this.ui.volumeValue.textContent = `${Math.round(value * 100)}%`;
    writePrefs(this.prefs);
  }

  removeTrack(id) {
    const index = this.tracks.findIndex((track) => track.id === id);
    if (index < 0) return;
    const track = this.tracks[index];
    const wasCurrent = track.id === this.currentId;
    this.tracks.splice(index, 1);

    if (wasCurrent) {
      const wasPlaying = !this.audio.paused;
      this.audio.pause();
      this.audio.removeAttribute('src');
      try {
        this.audio.load();
      } catch {
        /* 忽略 */
      }
      this.currentId = null;
      const fallback = this.tracks[Math.min(index, this.tracks.length - 1)];
      if (fallback !== undefined) this.select(fallback.id, { load: true, autoplay: wasPlaying });
    }

    // 对象地址一定要释放，否则文件内容会一直留在内存里
    this.releaseUrl(track.objectUrl);

    if (this.tracks.length === 0) {
      this.audio.pause();
      this.audio.removeAttribute('src');
      try {
        this.audio.load();
      } catch {
        /* 忽略 */
      }
      this.currentId = null;
    }

    this.renderList();
    this.syncAll();
  }

  /** Shift+点悬浮球：把主题诊断塞进面板底部；再点一次移除。 */
  toggleDiagnostics() {
    const host = this.ui.diagHost;
    if (host === null || host === undefined) return;
    if (this.diagnostics !== null && this.diagnostics !== undefined) {
      host.textContent = '';
      this.diagnostics = null;
      return;
    }
    this.setOpen(true);
    try {
      this.diagnostics = collectDiagnostics();
      this.diagnostics.attach(host);
    } catch (error) {
      host.textContent = '';
      host.append(el('div', { class: 'pw-diag', text: `诊断读取失败：${error && error.message}` }));
      this.diagnostics = null;
    }
  }

  setNotice(text) {
    this.notice = text;
    const note = this.ui.note;
    if (typeof text !== 'string' || text.length === 0) {
      note.hidden = true;
      note.textContent = '';
      return;
    }
    note.hidden = false;
    note.textContent = text;
  }

  // ── 渲染 ───────────────────────────────────────────────────────────────

  renderList() {
    const { ui } = this;
    ui.list.textContent = '';
    for (let index = 0; index < this.tracks.length; index += 1) {
      const track = this.tracks[index];
      const current = track.id === this.currentId;
      const item = el('li', {
        class: 'pw-item',
        'data-id': track.id,
        'data-current': String(current),
        tabindex: '0',
        role: 'button',
        title: track.name,
        'aria-label': `播放 ${track.name}`,
      }, [
        el('span', { class: 'pw-item-index', text: String(index + 1) }),
        el('span', { class: 'pw-item-body' }, [
          el('span', { class: 'pw-item-name', text: track.name }),
          el('span', { class: 'pw-item-meta', text: this.trackMeta(track) }),
        ]),
        el('button', {
          class: 'pw-item-remove', type: 'button',
          'aria-label': `移除 ${track.name}`, title: '移除（并释放内存）',
        }, [icon('trash', 14)]),
      ]);
      ui.list.append(item);
    }
    ui.empty.hidden = this.tracks.length > 0;
    ui.count.textContent = `${this.tracks.length} 首`;
  }

  trackMeta(track) {
    const parts = [];
    if (Number.isFinite(track.duration)) parts.push(formatTime(track.duration));
    else parts.push('时长读取中…');
    const size = formatBytes(track.size);
    if (size.length > 0) parts.push(size);
    return parts.join(' · ');
  }

  syncAll() {
    this.renderList();
    this.syncMode();
    this.syncTransport();
    this.syncProgress();
    this.syncNow();
    const hasTracks = this.tracks.length > 0;
    this.ui.btnPrev.disabled = !hasTracks;
    this.ui.btnNext.disabled = !hasTracks;
    this.ui.volume.value = String(Math.round(this.prefs.volume * 100));
    this.ui.volumeValue.textContent = `${Math.round(this.prefs.volume * 100)}%`;
  }

  syncMode() {
    const mode = this.prefs.mode;
    const button = this.ui.btnMode;
    button.setAttribute('data-mode', mode);
    const label = `播放模式：${PLAY_MODE_LABEL[mode]}`;
    button.setAttribute('aria-label', label);
    button.title = label;
    button.textContent = '';
    button.append(icon(mode, 18));
  }

  syncTransport() {
    const playing = !this.audio.paused && this.currentTrack() !== null;
    const button = this.ui.btnPlay;
    button.textContent = '';
    button.append(icon(playing ? 'pause' : 'play', 20));
    button.setAttribute('aria-label', playing ? '暂停' : '播放');
    this.ui.launcher.setAttribute('data-playing', String(playing));
    if (playing) this.startProgressLoop();
    this.syncNow();
  }

  syncNow() {
    const track = this.currentTrack();
    const { ui } = this;
    if (track === null) {
      ui.nowTitle.textContent = '尚未选择曲目';
      ui.nowMeta.textContent = this.tracks.length > 0
        ? '点击下方列表中的曲目开始播放'
        : '导入后点击列表中的曲目即可播放';
      ui.progress.disabled = true;
      ui.progress.value = '0';
      ui.timeCurrent.textContent = '0:00';
      ui.timeTotal.textContent = '--:--';
      return;
    }
    ui.nowTitle.textContent = track.name;
    const bits = [];
    const index = this.currentIndex();
    bits.push(`第 ${index + 1} / ${this.tracks.length} 首`);
    bits.push(PLAY_MODE_LABEL[this.prefs.mode]);
    ui.nowMeta.textContent = bits.join(' · ');
    ui.progress.disabled = false;
  }

  syncProgress() {
    const { ui } = this;
    const duration = this.audio.duration;
    const current = this.audio.currentTime;
    if (Number.isFinite(duration) && duration > 0) {
      ui.progress.value = String(Math.round((current / duration) * 1000));
      ui.timeTotal.textContent = formatTime(duration);
    } else {
      ui.progress.value = '0';
      ui.timeTotal.textContent = '--:--';
    }
    ui.timeCurrent.textContent = formatTime(current);
  }

  // ── 卸载 ───────────────────────────────────────────────────────────────

  /** 逐项释放：监听、rAF、audio、每一个 Object URL。 */
  dispose() {
    if (this.raf !== null && this.raf !== undefined) {
      window.cancelAnimationFrame(this.raf);
      this.raf = null;
    }
    for (const dispose of this.disposers.splice(0)) {
      try {
        dispose();
      } catch {
        /* 单个监听摘除失败不应中断整体清理 */
      }
    }
    try {
      this.audio.pause();
      this.audio.removeAttribute('src');
      this.audio.load();
    } catch {
      /* 忽略 */
    }
    for (const url of Array.from(this.objectUrls.values())) this.releaseUrl(url);
    this.objectUrls.clear();
    this.tracks = [];
    this.currentId = null;
  }
}

/** 用一次性 audio 元素读时长；不加入文档，读完立即释放元素与定时器。 */
function probeDuration(url) {
  return new Promise((resolve) => {
    const probe = new Audio();
    probe.preload = 'metadata';
    let settled = false;
    let timer = null;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      if (timer !== null) window.clearTimeout(timer);
      probe.removeAttribute('src');
      resolve(value);
    };
    probe.addEventListener('loadedmetadata', () => {
      finish(Number.isFinite(probe.duration) ? probe.duration : Number.NaN);
    });
    probe.addEventListener('error', () => finish(Number.NaN));
    // 极端情况下（损坏文件）不给事件，超时兜底
    timer = window.setTimeout(() => finish(Number.NaN), 6000);
    probe.src = url;
  });
}

// ══════════════════════════════════════════════════════════════════════════
//  页面状态
// ══════════════════════════════════════════════════════════════════════════

const isChatPage = () => COMPOSER_SELECTORS.some((selector) => document.querySelector(selector) !== null);

/**
 * 从 DSH 自己的配色推断当前是亮色还是暗色，而不是猜它的 class 名。
 * 只读 computedStyle，不修改任何原样式。
 */
function detectTheme() {
  // 先读 DSH 自己的明暗信号。这是它的显式声明，比反推可靠，
  // 也避免了「主题改了背景色 → 明暗判定跟着变」这种自引用。
  try {
    if (document.body !== null && document.body.hasAttribute('data-ds-dark-theme')) return 'dark';
    const rootTheme = document.documentElement.getAttribute('data-ds-theme-source');
    if (rootTheme === 'dark') return 'dark';
    if (rootTheme === 'light') return 'light';
  } catch {
    /* 读不到就继续往下走 */
  }

  const samples = [];
  const candidates = [document.body, document.querySelector('main'), document.querySelector('aside')];
  for (const node of candidates) {
    if (node === null || node === undefined) continue;
    try {
      const color = parseColor(window.getComputedStyle(node).backgroundColor);
      if (color !== null) samples.push(luminance(color));
    } catch {
      /* 忽略 */
    }
  }
  if (samples.length > 0) {
    const average = samples.reduce((sum, value) => sum + value, 0) / samples.length;
    return average < 0.5 ? 'dark' : 'light';
  }
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

// ══════════════════════════════════════════════════════════════════════════
//  生命周期
// ══════════════════════════════════════════════════════════════════════════

const inject = [];

function apply(ctx) {
  /** @type {HTMLElement | null} */
  let host = null;
  /** @type {PardofelisWidget | null} */
  let widget = null;
  /** @type {ShadowRoot | null} */
  let shadow = null;
  let mountQueued = false;
  /** @type {MutationObserver | null} */
  let observer = null;
  /** @type {(() => void) | null} */
  let restoreThemeWatch = null;

  /** 幂等挂载：宿主已存在就复用，不重复注入。 */
  function mount() {
    if (host !== null && host.isConnected) {
      syncTheme();
      return;
    }
    host = document.createElement('div');
    host.id = HOST_ID;
    host.setAttribute(HOST_ATTR, 'on');
    shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = STYLES;
    shadow.append(style);
    const surface = document.createElement('div');
    surface.className = 'pw-surface';
    shadow.append(surface);

    // 只有这一个节点进入文档；它是 fixed，没有内容尺寸，不参与文档流。
    document.body.append(host);

    widget = new PardofelisWidget(surface);
    syncTheme();

    // 跟随 DSH 的明暗切换
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onScheme = () => syncTheme();
    media.addEventListener('change', onScheme);
    const rootObserver = new MutationObserver(() => syncTheme());
    rootObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme', 'data-ds-dark-theme'] });
    if (document.body !== null) {
      rootObserver.observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] });
    }
    restoreThemeWatch = () => {
      media.removeEventListener('change', onScheme);
      rootObserver.disconnect();
    };
  }

  function unmount() {
    if (restoreThemeWatch !== null) {
      restoreThemeWatch();
      restoreThemeWatch = null;
    }
    if (widget !== null) {
      widget.dispose();
      widget = null;
    }
    if (host !== null) {
      host.remove();
      host = null;
      shadow = null;
    }
  }

  /** 只在对话页存在悬浮 UI；离开对话页立即卸载，连节点都不留。 */
  function reconcile() {
    const should = isChatPage();
    if (should) {
      if (host === null || !host.isConnected) mount();
    } else if (host !== null) {
      unmount();
    }
  }

  // ── 文档级主题：注入 / 摘除 ────────────────────────────────────────────

  /** 把主题样式表放进文档。幂等：已存在就复用，不重复注入。 */
  function installDocumentTheme() {
    if (document.getElementById(THEME_STYLE_ID) !== null) return;
    const style = document.createElement('style');
    style.id = THEME_STYLE_ID;
    // 壁纸以 CSS 变量喂给样式表：两个槽位在构建时被替换成 data: URL
    style.textContent =
      `:root{--pw-wallpaper-light:url("${WALLPAPER_LIGHT_URL}");`
      + `--pw-wallpaper-dark:url("${WALLPAPER_DARK_URL}");}\n`
      + THEME_STYLES;
    // 关键：样式表放 head。放在 body 里会被 DSH 的布局当成内容，虽然
    // <style> 本身不渲染，但没有必要把东西插进 body 的内容区。
    document.head.append(style);
    // 样式表里的每条规则都以这个属性为前缀，加在 html 上：
    // 它既是「主题已启用」的开关，也是卸载时一键撤销的把手。
    document.documentElement.setAttribute(HOST_ATTR, THEME_ATTR_VALUE);
  }

  /** 摘除主题样式表与它加在 html 上的属性，页面完全复原。 */
  function removeDocumentTheme() {
    const style = document.getElementById(THEME_STYLE_ID);
    if (style !== null) style.remove();
    document.documentElement.removeAttribute(HOST_ATTR);
    document.documentElement.removeAttribute('data-pw-dark');
  }

  function schedule() {
    if (mountQueued) return;
    mountQueued = true;
    // 合并同一帧内的多次变动，避免 DSH 流式输出时反复挂载
    (window.requestAnimationFrame || window.setTimeout)(() => {
      mountQueued = false;
      reconcile();
    }, 0);
  }

  function syncTheme() {
    const theme = detectTheme();
    // 文档级主题的明暗档：换壁纸用。属性加在 html 上，与挂件宿主无关，
    // 因此离开对话页卸载挂件时它依然存在（主题是全局的）。
    const root = document.documentElement;
    if (theme === 'dark') root.setAttribute('data-pw-dark', 'on');
    else root.removeAttribute('data-pw-dark');
    if (shadow === null) return;
    const surface = shadow.querySelector('.pw-surface');
    if (surface === null) return;
    surface.classList.remove('pw-theme-light', 'pw-theme-dark');
    surface.classList.add(theme === 'dark' ? 'pw-theme-dark' : 'pw-theme-light');
    surface.classList.add('pw-shell-font');
  }

  // 路由切换：对话页 ↔ 其它页面。DSH 是 SPA，用 DOM 观察 + 历史事件双保险。
  observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  const onHistory = () => schedule();
  window.addEventListener('popstate', onHistory);
  window.addEventListener('hashchange', onHistory);
  for (const method of ['pushState', 'replaceState']) {
    const original = history[method];
    if (typeof original !== 'function') continue;
    // 用函数表达式而不是函数声明：函数声明在块级作用域里，下面注册的清理
    // 回调会跨出一轮循环的块，引用不到它（真机上会抛 ReferenceError）。
    let patched = null;
    patched = (...args) => {
      const result = original.apply(history, args);
      onHistory();
      return result;
    };
    history[method] = patched;
    ctx.effect(() => () => {
      if (history[method] === patched) history[method] = original;
    }, `${PLUGIN_ID}: history.${method}`);
  }

  ctx.effect(() => {
    // 主题是【全局】的：整个界面（首页、设置、对话）都换成帕朵菲莉丝的底色，
    // 而不是只在对话页生效。悬浮挂件仍然只在对话页出现，两者互不耦合。
    installDocumentTheme();
    syncTheme();
    schedule();
    return () => {
      window.removeEventListener('popstate', onHistory);
      window.removeEventListener('hashchange', onHistory);
      if (observer !== null) {
        observer.disconnect();
        observer = null;
      }
      unmount();
      removeDocumentTheme();
    };
  }, `${PLUGIN_ID}: mount lifecycle`);

  ctx.logger?.info?.(`[pardofelis-widget] ready v${PLUGIN_VERSION}`);
}

// 注意：这里不能写 export 语句。本文件会被注入到 src/client.js 的
// factory 函数体内部，而 ESM 的 export 只能出现在模块顶层。
// 插件导出统一由外壳末尾的 `exports.apply = apply` 完成。
