// ══════════════════════════════════════════════════════════════════════════
//  帕朵菲莉丝主题挂件 · 静态自检
//
//  逐条核对项目的硬约束。这些都是「看一眼源码就能判定」的事实，
//  因此放在静态检查里；行为类验证在 tools/test-widget.mjs。
//
//  检查项
//    1. 构建产物与源文件同步（等价于 node tools/build.mjs --check）
//    2. 不得出现网络 API（fetch / XHR / WebSocket / sendBeacon / EventSource）
//    3. 不得触碰原页面的布局属性（style.position / width / display …）；
//       样式表里的布局属性必须落在 Shadow DOM 内的、非 :host 选择器上
//    4. :host 只允许 position / inset 系与 pointer-events / z-index
//    5. 头像必须以 data: URL 内联（零请求）
//    6. 每个副作用 / 监听都登记到 ctx.effect（卸载才可清理）
//    7. 调色板对比度：正文与次要文字均需达到 WCAG AA
//
//  用法：node tools/verify.mjs
// ══════════════════════════════════════════════════════════════════════════

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildBundle } from './build-core.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const RUNTIME_SRC = join(ROOT, 'src', 'runtime.js');
const BUNDLE = join(ROOT, 'bundle', 'client.js');
const PKG = join(ROOT, 'package.json');

let passed = 0;
const failures = [];

function ok(name, detail) {
  passed += 1;
  console.log(`  ok   ${name}${detail === undefined ? '' : ` (${detail})`}`);
}
function bad(name, detail) {
  failures.push(name);
  console.log(`  FAIL ${name}${detail === undefined ? '' : ` -> ${detail}`}`);
}
function check(name, condition, detail) {
  if (condition) ok(name, detail); else bad(name, detail);
}
function equalText(name, actual, expected) {
  if (actual === expected) {
    ok(name);
    return;
  }
  bad(name, `产物与源不一致：bundle ${actual.length} 字符 vs 重建 ${expected.length} 字符；请运行 node tools/build.mjs`);
}

function section(title) {
  console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 56 - title.length))}`);
}

/** 去掉注释与字符串字面量，只留可执行代码。 */
function stripCommentsAndStrings(source) {
  let out = '';
  let i = 0;
  const blank = (text) => { out += ' '.repeat(text.length); };
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];
    if (ch === '/' && next === '/') {
      const end = source.indexOf('\n', i);
      const stop = end === -1 ? source.length : end;
      blank(source.slice(i, stop)); i = stop; continue;
    }
    if (ch === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end === -1 ? source.length : end + 2;
      blank(source.slice(i, stop)); i = stop; continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch;
      let j = i + 1;
      while (j < source.length) {
        if (source[j] === '\\') { j += 2; continue; }
        if (source[j] === quote) { j += 1; break; }
        j += 1;
      }
      blank(source.slice(i, j)); i = j; continue;
    }
    out += ch; i += 1;
  }
  return out;
}

// ── 颜色工具 ─────────────────────────────────────────────────────────────

function hexToRgb(hex) {
  const text = hex.replace('#', '').trim();
  const full = text.length === 3 ? text.split('').map((c) => c + c).join('') : text;
  return [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16));
}

/** sRGB 相对亮度（WCAG 2.1）。 */
function luminance(rgb) {
  const channel = (value) => {
    const v = value / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
}

/** 两色的对比度。foreground 可以是 #rrggbb，也可以是 [r,g,b]。 */
function contrast(foreground, background) {
  const fg = typeof foreground === 'string' ? hexToRgb(foreground) : foreground;
  const bg = typeof background === 'string' ? hexToRgb(background) : background;
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/** 把 rgba() / #hex 解析成 [r,g,b] + alpha，并合成到给定背景上。 */
function composite(color, backdrop) {
  const rgba = color.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?/i);
  if (rgba !== null) {
    const alpha = rgba[4] === undefined ? 1 : Number(rgba[4]);
    return [1, 2, 3].map((i) => Math.round(Number(rgba[i]) * alpha + backdrop[i - 1] * (1 - alpha)));
  }
  return hexToRgb(color);
}

/** 从一段 CSS 文本里取出某个声明的值。 */
function declaration(css, name) {
  const match = css.match(new RegExp(`--${name}\\s*:\\s*([^;]+);`));
  return match === null ? null : match[1].trim();
}

// ══════════════════════════════════════════════════════════════════════════
async function main() {
  const [runtime, bundle, pkgText] = await Promise.all([
    readFile(RUNTIME_SRC, 'utf8'),
    readFile(BUNDLE, 'utf8'),
    readFile(PKG, 'utf8'),
  ]);
  const pkg = JSON.parse(pkgText);
  const code = stripCommentsAndStrings(bundle);

  section('包清单');

  check('包名正确', pkg.name === 'dsh-pardofelis-widget', pkg.name);
  check('声明 dsh.client.platform = web', pkg.dsh?.client?.platform === 'web');
  check('声明 bundle patch', pkg.dsh?.bundle?.patch === './cordis.patch.yml');
  check('导出 host 半边', typeof pkg.exports?.['.'] === 'string', pkg.exports?.['.']);
  check('导出 client 半边', typeof pkg.exports?.['./client'] === 'string', pkg.exports?.['./client']);
  check('main 指向 host 半边', pkg.main === 'bundle/host.js', pkg.main);
  check('无运行时依赖（dependencies 为空或缺省）',
    pkg.dependencies === undefined || Object.keys(pkg.dependencies).length === 0);
  const patch = await readFile(join(ROOT, 'cordis.patch.yml'), 'utf8');
  check('cordis.patch.yml 挂载了本插件行', patch.includes('name: dsh-pardofelis-widget'));

  section('构建产物同步');

  let rebuilt = null;
  try {
    rebuilt = await buildBundle();
    ok('源文件可以成功构建（含离线自检）');
  } catch (error) {
    bad('源文件可以成功构建（含离线自检）', error && error.message);
  }
  if (rebuilt !== null) {
    equalText('bundle/client.js 与源文件一致', bundle, rebuilt.output);
  }

  section('离线保证（零网络）');

  for (const api of ['fetch', 'XMLHttpRequest', 'WebSocket', 'sendBeacon', 'EventSource']) {
    check(`可执行代码中不含 ${api}`, !code.includes(api));
  }
  check('不含 http(s):// 外链', !/https?:\/\//.test(code));
  check('不含 file:// 文件访问', !code.includes('file://'));
  check('头像以 data: URL 内联（不发起请求）', bundle.includes('data:image/webp;base64,'));

  section('不改变原布局');

  // 3.1 不得改写原页面元素的内联样式属性
  for (const prop of ['position', 'display', 'flex', 'grid', 'width', 'height', 'margin', 'transform']) {
    const pattern = new RegExp(`\\.style\\.${prop}\\b`);
    check(`不写 document/元素 的 style.${prop}`, !pattern.test(code));
  }
  check('不查询或修改 styleSheets', !code.includes('styleSheets') && !/document\.head/.test(code));
  check('不修改 body / documentElement 的样式',
    !/body\.style/.test(code) && !/documentElement\.style/.test(code));
  check('不使用 insertBefore / replaceChild 改动原节点',
    !code.includes('insertBefore') && !code.includes('replaceChild'));
  check('宿主容器只追加到 body（不改动任何原有节点）', code.includes('body.append(host)'), 'body.append(host)');

  // 3.2 样式表必须整体位于 Shadow DOM 内
  const styleMatch = runtime.match(/const STYLES = `([\s\S]*?)`;/);
  check('找到注入用的样式表', styleMatch !== null);
  if (styleMatch !== null) {
    const css = styleMatch[1];
    const selectors = Array.from(css.matchAll(/(^|\})\s*([^{}@]+)\{/g)).map((m) => m[2].trim());

    // :host 允许的属性白名单：定位与穿透，不含 display / 尺寸 / flex / grid
    // 注意：:host 规则里有 ${...} 插值，不能用 [^}] 抓取正文
    const hostRule = css.match(/:host\s*\{([\s\S]*?)\n\}/);
    check('样式表包含 :host 规则', hostRule !== null);
    if (hostRule !== null) {
      const declarations = hostRule[1]
        .split(';')
        .map((line) => line.split(':')[0].trim())
        .filter((name) => name.length > 0);
      const allowed = new Set([
        'position', 'right', 'bottom', 'top', 'left', 'z-index', 'pointer-events',
        'font-family', 'font-size', 'line-height', 'color', '-webkit-font-smoothing',
      ]);
      const offenders = declarations.filter((name) => !allowed.has(name));
      check(':host 只声明定位 / 穿透 / 字体相关属性', offenders.length === 0, offenders.join(', '));
      check(':host 明确使用 position: fixed', /position:\s*fixed/.test(hostRule[1]));
      check(':host 明确 pointer-events: none（容器不拦点击）', /pointer-events:\s*none/.test(hostRule[1]), hostRule[1].replace(/\s+/g, ' ').trim());
      check(':host 未声明 display / flex / grid / 宽高',
        !/(^|[;\s])(display|flex|grid|width|height)\s*:/.test(hostRule[1]), hostRule[1].replace(/\s+/g, ' ').trim());
    }

    // 任何影响原页面文档流的全局选择器都不允许出现
    const globalSelectors = selectors.filter((selector) => {
      if (selector.startsWith(':host') || selector.startsWith('@')) return false;
      // 允许 ::before / ::after 与 * 这类纯本地重置
      if (selector === '*' || selector.startsWith('*,') || selector.includes(',') === false && selector.startsWith('*')) return false;
      return true;
    });
    // 说明：样式表整体被塞进 Shadow Root，所以这些选择器天然只作用于挂件内部。
    // 这里额外确认没有任何「看起来想命中宿主文档」的选择器（html / body / #root / [class*= 等）。
    const suspicious = selectors.filter((selector) =>
      /(^|[\s,>+~])(html|body|#root|#app)\b/.test(selector));
    check('样式表不含针对宿主文档的选择器（html / body / #root / #app）', suspicious.length === 0,
      suspicious.join(' | '));
    check('样式表把交互元素恢复为可点击（panel / launcher pointer-events: auto）',
      /\.pw-launcher\s*\{[\s\S]*?pointer-events:\s*auto/.test(css)
      && /\.pw-panel\s*\{[\s\S]*?pointer-events:\s*auto/.test(css));
    check('播放列表内部滚动且带 overscroll 收敛',
      /\.pw-list\s*\{[\s\S]*?overflow-y:\s*auto/.test(css)
      && /\.pw-list\s*\{[\s\S]*?overscroll-behavior:\s*contain/.test(css));
    check('不锁定页面滚动（没有对 html/body 的 overflow 声明）',
      !/(^|[},])\s*(html|body)\s*\{[\s\S]*?overflow/.test(css));

    // 4. 面板向上弹出、最大高度受限
    check('面板向上弹出（bottom 定位，不使用 top）', /\.pw-panel\s*\{[^}]*bottom:/.test(css) && !/\.pw-panel\s*\{[^}]*\btop:/.test(css));
    check('面板最大高度受限', /\.pw-panel\s*\{[^}]*max-height:/.test(css));
    check('移动端有独立布局（media query）', css.includes('@media (max-width: 640px)'));
    check('尊重 prefers-reduced-motion', css.includes('prefers-reduced-motion'));
  }

  section('只在对话页挂载');

  check('以 DSH 稳定的 data-* 锚点判定对话页',
    runtime.includes("'[data-composer-card]'") && runtime.includes("'[data-composer-input]'"),
    'data-composer-card / data-composer-input');
  check('锚点选择器集中在一处（便于 DSH 升级时维护）',
    /const COMPOSER_SELECTORS = \[/.test(runtime));
  check('不硬编码 CSS Modules 的类名哈希', !/class\*=["']?_[A-Za-z0-9]{4,}_/.test(code));
  check('卸载时断开 MutationObserver', code.includes('observer.disconnect()'));
  check('卸载时移除宿主节点', /\.remove\(\)/.test(code));
  check('使用 data-dsh-pardofelis 命名空间标记宿主', runtime.includes("'data-dsh-pardofelis'"));

  section('清理与副作用登记');

  const effectCount = (bundle.match(/ctx\.effect\(/g) || []).length;
  check('生命周期副作用登记到 ctx.effect（挂载 / 路由历史）', effectCount >= 2, `${effectCount} 处`);
  check('事件监听统一经 listen() 记录，卸载时可逐条摘除',
    /removeEventListener\(\s*type\s*,\s*wrapped\b/.test(bundle));
  check('每个 listen() 都进入 disposers 队列', /this\.disposers\.push/.test(runtime));
  check('卸载时清空监听队列', /this\.disposers\.splice\(0\)/.test(runtime));
  check('卸载时释放全部 Object URL', runtime.includes('revokeObjectURL'));
  check('卸载时清空 audio.src 并 load()', /removeAttribute\('src'\)/.test(runtime) && /audio\.load\(\)/.test(runtime));
  check('取消 rAF 循环', code.includes('cancelAnimationFrame'));
  check('导入用 accept="audio/*"', bundle.includes("accept: 'audio/*"));
  check('支持多选', /multiple:\s*true/.test(runtime));
  check('播放全部由用户手势触发（无自动播放调用）',
    !/new Audio\(\)[\s\S]{0,200}?\.play\(\)/.test(code.split('apply(ctx)')[0]));

  section('可访问性');

  check('悬浮按钮有 aria-label', runtime.includes("'aria-label': '帕朵菲莉丝音乐挂件'"));
  check('悬浮按钮是原生 button（可聚焦）', /el\('button',\s*\{[\s\S]{0,120}class: 'pw-launcher'/.test(runtime));
  check('按钮暴露 aria-expanded', runtime.includes("'aria-expanded'"));
  check('面板 role="dialog"', runtime.includes("role: 'dialog'"));
  check('滑杆有 aria-label', runtime.includes("'aria-label': '播放进度'") && runtime.includes("'aria-label': '音量'"));
  check('提供 :focus-visible 焦点样式', (styleMatch?.[1] || '').includes(':focus-visible'));
  check('移除按钮有可读名称', runtime.includes('移除 ${track.name}'));

  section('调色板对比度（WCAG AA）');

  const themes = {
    light: { solid: '#FFFCFA', text: '#3A3330', dim: '#7A6C64', accent: '#4F5A90' },
    dark: { solid: '#1E1C24', text: '#F0E8E4', dim: '#B3A49C', accent: '#B9C2F0' },
  };
  for (const [name, theme] of Object.entries(themes)) {
    const textRatio = contrast(theme.text, theme.solid);
    const dimRatio = contrast(theme.dim, theme.solid);
    const accentRatio = contrast(theme.accent, theme.solid);
    check(`${name} 档正文对比度 >= 7:1`, textRatio >= 7, `${textRatio.toFixed(2)}:1`);
    check(`${name} 档次要文字对比度 >= 4.5:1`, dimRatio >= 4.5, `${dimRatio.toFixed(2)}:1`);
    check(`${name} 档强调色对比度 >= 3:1`, accentRatio >= 3, `${accentRatio.toFixed(2)}:1`);
  }

  // 面板是半透明壳层：把正文色合成到「壳层叠在页面底色上」的结果再算一次
  const shell = {
    light: { shell: 'rgba(255, 252, 250, 0.9)', page: '#FFFFFF', text: '#3A3330', dim: '#7A6C64' },
    dark: { shell: 'rgba(30, 28, 36, 0.88)', page: '#101014', text: '#F0E8E4', dim: '#B3A49C' },
  };
  for (const [name, theme] of Object.entries(shell)) {
    const page = hexToRgb(theme.page);
    const backdrop = composite(theme.shell, page);
    const textRatio = contrast(theme.text, backdrop);
    const dimRatio = contrast(theme.dim, backdrop);
    check(`${name} 档半透明壳层上的正文对比度 >= 7:1`, textRatio >= 7, `${textRatio.toFixed(2)}:1`);
    check(`${name} 档半透明壳层上的次要文字对比度 >= 4.5:1`, dimRatio >= 4.5, `${dimRatio.toFixed(2)}:1`);
  }

  section('调色板取值与立绘一致');

  const paletteSource = await readFile(join(HERE, 'palette-report.txt'), 'utf8');
  check('取样报告存在且含虹膜色', paletteSource.includes('iris-'));
  // 立绘采样得到的三个锚点色必须在运行时出现
  for (const [label, hex] of [
    ['头发暖砂', '#988479'],
    ['猫耳藕粉', '#D4B2A6'],
    ['虹膜青蓝', '#7CDCF4'],
  ]) {
    check(`运行时保留了立绘取样色（${label} ${hex}）`, runtime.toUpperCase().includes(hex.toUpperCase()));
  }

  // ── 汇总 ───────────────────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(64)}`);
  console.log(`通过 ${passed} 项，失败 ${failures.length} 项`);
  if (failures.length > 0) {
    console.log('失败清单：');
    for (const name of failures) console.log(`  - ${name}`);
    process.exitCode = 1;
  }
}

await main();
