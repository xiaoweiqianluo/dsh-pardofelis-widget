// BUILD ARTIFACT - do not edit.
// Source: src/client.js + src/runtime.js + assets/avatar.webp
// Rebuild: node tools/build.mjs
// 帕朵菲莉丝主题挂件 · 浏览器半边模块外壳
//
// 本文件是构建输入，不要直接改 bundle/client.js（那是产物）。
// 打包脚本 tools/build.mjs 会把 src/runtime.js 注入到下面标记为
// RUNTIME 的注释槽处，并把 assets/avatar.webp 内联成 data: URL。
//
// 注意：本注释里绝对不能出现「星号 + 斜杠」这个字符对。它是块注释的结束符，
// 一旦写成占位符的原样字面量，块注释会在这里提前结束，后面的中文说明就会被
// 当成代码解析（这就是构建产物报 SyntaxError 的原因）。占位符只以
// RUNTIME 代称。
//
// 模块格式：DSH 的浏览器模块加载器在启动时注册各插件的工厂函数
//   window.__ModuleLoader__.load({ id, factory })
// 工厂返回一个模块对象，加载器读取其上的 apply / inject 作为插件本体。
// 在 apply 里创建的一切副作用都登记到 ctx.effect，禁用或移除插件时
// DSH 会调用清理函数，页面完全复原。

window.__ModuleLoader__.load({
  id: 'dsh-pardofelis-widget',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

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
const PLUGIN_VERSION = '1.0.0';

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

// 头像：由 tools/build.mjs 把 assets/avatar.webp 内联成 data: URL。
// 内联而不是走 HTTP 路由，是为了「零请求」——挂件不产生任何网络流量。
const AVATAR_URL = 'data:image/webp;base64,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';

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
.pw-foot {
  flex: 0 0 auto;
  padding: 7px 13px 9px;
  border-top: 1px solid var(--pw-border);
  font-size: 10.5px; color: var(--pw-text-dim);
  display: flex; align-items: center; gap: 6px;
}
.pw-foot svg { flex: 0 0 auto; }

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

/** 行内 SVG 图标。不上传、不请求，纯路径数据。 */
function icon(name, size) {
  const svg = (paths) =>
    el('svg', {
      viewBox: '0 0 24 24', width: size, height: size, fill: 'none',
      stroke: 'currentColor', 'stroke-width': '1.8',
      'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true',
      focusable: 'false',
    }, paths.map((d) => el('path', { d })));
  switch (name) {
    case 'plus':
      return svg(['M12 5v14', 'M5 12h14']);
    case 'play':
      return el('svg', {
        viewBox: '0 0 24 24', width: size, height: size, 'aria-hidden': 'true', focusable: 'false',
      }, [el('path', { d: 'M8 5.2v13.6L19 12z', fill: 'currentColor', stroke: 'none' })]);
    case 'pause':
      return el('svg', {
        viewBox: '0 0 24 24', width: size, height: size, 'aria-hidden': 'true', focusable: 'false',
      }, [
        el('rect', { x: '7', y: '5', width: '3.4', height: '14', rx: '1.1', fill: 'currentColor', stroke: 'none' }),
        el('rect', { x: '13.6', y: '5', width: '3.4', height: '14', rx: '1.1', fill: 'currentColor', stroke: 'none' }),
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
    case 'shield':
      return svg(['M12 3.5l7 2.6v5.3c0 4.2-2.9 7.6-7 9.1-4.1-1.5-7-4.9-7-9.1V6.1z', 'M9 12.2l2.1 2.1L15 10.5']);
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
      el('div', { class: 'pw-foot' }, [
        icon('shield', 13),
        el('span', { text: '仅本地处理 · 不联网 · 不上传' }),
      ]),
    ]);

    parent.append(launcher, panel);

    this.ui = {
      parent, launcher, panel, fileInput, list,
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

    this.listen(ui.launcher, 'click', () => this.setOpen(!this.isOpen()));
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
    if (shadow === null) return;
    const theme = detectTheme();
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
    schedule();
    return () => {
      window.removeEventListener('popstate', onHistory);
      window.removeEventListener('hashchange', onHistory);
      if (observer !== null) {
        observer.disconnect();
        observer = null;
      }
      unmount();
    };
  }, `${PLUGIN_ID}: mount lifecycle`);

  ctx.logger?.info?.(`[pardofelis-widget] ready v${PLUGIN_VERSION}`);
}

// 注意：这里不能写 export 语句。本文件会被注入到 src/client.js 的
// factory 函数体内部，而 ESM 的 export 只能出现在模块顶层。
// 插件导出统一由外壳末尾的 `exports.apply = apply` 完成。


    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
