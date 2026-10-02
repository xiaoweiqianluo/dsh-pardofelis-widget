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
  check('不查询或修改 styleSheets', !code.includes('styleSheets'));
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

  section('文档级主题');

  {
    const themeMatch = runtime.match(/const THEME_STYLES = `([\s\S]*?)`;/);
    check('找到主题样式表', themeMatch !== null);
    if (themeMatch !== null) {
      const theme = themeMatch[1];
      // 规则头里带引号的属性选择器会让「按 } 切段」的简单解析断掉，所以先把
      // ${...} 插值与注释抹掉，再【逐个选择器】验证前缀。
      //
      // 原来这里是「花括号个数 == 前缀个数」。那个假设在逗号分隔的选择器上不成立：
      // `html[attr] .a, html[attr] .b { }` 有两个前缀却只有一个花括号。
      // 改成逐个选择器检查：既容得下这种写法，又比原来更严——它保证每一个选择器
      // 都带命名空间，而不是只保证总数对得上（总数对得上、其中某一个选择器漏了
      // 前缀，是完全可能的）。
      const flatTheme = theme
        .replace(/\$\{[^}]*\}/g, 'X')
        .replace(/\/\*[\s\S]*?\*\//g, '');
      const ruleHeads = Array.from(flatTheme.matchAll(/(^|\})\s*([^{}@]+)\{/g))
        .map((match) => match[2].trim())
        .filter((head) => head.length > 0);
      const allSelectors = ruleHeads
        .flatMap((head) => head.split(','))
        .map((selector) => selector.trim())
        .filter((selector) => selector.length > 0);
      const unscoped = allSelectors.filter((selector) => !selector.includes('html[data-dsh-pardofelis='));
      check('主题里的每条规则都以命名空间属性为前缀（卸载即可整体撤销）',
        allSelectors.length > 0 && unscoped.length === 0,
        `${allSelectors.length} 个选择器，其中 ${unscoped.length} 个没前缀：${unscoped.slice(0, 3).join(' | ')}`);
      check('主题给 html 设了底色与壁纸', /background-color:/.test(theme) && /background-image:/.test(theme));
      check('主题不碰文字色（label-*）', !/--dsw-alias-label-/.test(theme));
      check('主题不碰语义色（state-*）', !/--dsw-alias-state-/.test(theme));
      check('主题不碰代码高亮（markdown-* / code-diff-*）',
        !/--dsw-alias-markdown-/.test(theme) && !/--dsw-alias-code-diff-/.test(theme));
      check('主题只覆盖令牌值，不含任何布局属性',
        !/(^|[;{\s])(display|flex|grid|position|width|height|margin|padding)\s*:/.test(theme));
      check('暗色档壁纸由 html 上的标记切换', /\[data-pw-dark="on"\]/.test(theme));

      // ── 这次的回归守卫 ────────────────────────────────────────────────
      // v1.1.0 的壁纸规则里只有 background-color 带 !important，
      // background-image 没带，被 DSH 自己的 html 规则用 background 简写抹掉：
      // 底色生效、壁纸没画上，界面看起来像"主题没生效"。
      for (const prop of ['background-color', 'background-image', 'background-size',
        'background-position', 'background-repeat']) {
        const pattern = new RegExp(`${prop}:[^;]*!important`);
        check(`html 上的 ${prop} 带 !important（否则会被 DSH 的简写覆盖）`, pattern.test(theme));
      }
      // 根元素上的 fixed 背景是已知的引擎怪区：根元素背景会被提升为画布背景，
      // 而 fixed 要求相对视口定位，两者语义冲突，症状是「颜色画了、图没画」。
      // 检查前必须剥掉 CSS 注释——样式表里正好有一条注释在解释「为什么不用它」，
      // 不剥掉会被自己的说明文字误判（踩过一次）。
      const themeCode = theme.replace(/\/\*[\s\S]*?\*\//g, '');
      check('html 上不使用 background-attachment: fixed',
        !/background-attachment:\s*fixed/.test(themeCode));
    }
    check('壁纸以变量注入，且两个槽位都在', /--pw-wallpaper-light/.test(runtime) && /--pw-wallpaper-dark/.test(runtime));
    check('主题样式表有稳定 id（幂等注入依赖它）', /const THEME_STYLE_ID = '/.test(runtime));
    check('卸载时会摘除主题样式表', /removeDocumentTheme/.test(runtime) && /style\.remove\(\)/.test(runtime));
    check('卸载时会摘除 html 上的主题属性',
      /documentElement\.removeAttribute\(HOST_ATTR\)/.test(runtime));
    check('主题在首个 effect 里注入（不依赖对话页）', /installDocumentTheme\(\);/.test(runtime));
  }

  section('整屏子页面必须补实');

  {
    const themeMatch = runtime.match(/const THEME_STYLES = `([\s\S]*?)`;/);
    const theme = themeMatch === null ? '' : themeMatch[1];
    // DSH 的整屏子页面（设置 → 充值 这类）是一个 fixed、覆盖整个视口的容器，
    // 背景用 bg-base；而 bg-base 在主题里是半透明的，于是它的头部（返回按钮所在）
    // 会把下层内容漏上来。这条守着「必须给它补实」。
    check('整屏子页面浮层被补实（背景不透明）',
      /html\[data-dsh-pardofelis=[^\]]*\]\s*\[class\*="TaJwIq_overlay"\][\s\S]{0,200}background-color:\s*#FFFCFA\s*!important/.test(theme));
    check('整屏子页面浮层有暗色档', /\[data-pw-dark="on"\][^\n]*TaJwIq_overlay/.test(theme));

    // 关键守卫：绝不能"简化"成宽匹配。DSH 里还有 .BynINW_overlayLayer
    // （inset:0、pointer-events:none 的整屏覆盖层），被涂实会把整个界面盖住。
    //
    // 检查前必须剥掉注释：样式表里正好有一条注释在解释「为什么不能写成宽匹配」，
    // 里面就带着那个示例写法，不剥掉会被自己的说明文字误判（这个坑踩了第三次）。
    const themeCode = theme.replace(/\/\*[\s\S]*?\*\//g, '');
    check('没有把 overlay 写成宽匹配（否则会盖住 .BynINW_overlayLayer）',
      !/\[class\*="?[Oo]verlay"?\]/.test(themeCode.replace(/TaJwIq_overlay|Vb49yG_onboardingOverlay/g, '')),
      '出现了宽匹配的 overlay 选择器');
  }

  section('播放态光环与按钮投影');

  {
    const styleMatch = runtime.match(/const STYLES = `([\s\S]*?)`;/);
    const css = styleMatch === null ? '' : styleMatch[1];
    // 用户澄清过：要去掉的是【按钮投影】，播放时的呼吸光环要保留。
    // 两者都是 box-shadow / 视觉装饰，很容易在改动里被一起误删，所以都守着。
    check('播放态保留呼吸光环（::after 那圈）', /data-playing="true"\]::after/.test(css));
    check('光环的关键帧还在', /@keyframes pw-pulse/.test(css));
    check('减少动态效果时光环不动画',
      /prefers-reduced-motion[\s\S]{0,240}data-playing="true"\]::after/.test(css));
    check('播放态标记仍然保留（状态还得表达得出来）', /data-playing/.test(runtime));

    // 用户明确要求：按钮和面板的投影都去掉，播放光环保留。
    // 三者都是 box-shadow 这一类装饰，改动时极易互相误伤（已经误删过一次光环）。
    for (const selector of ['.pw-launcher', '.pw-panel']) {
      const escaped = selector.replace('.', '\\.');
      const rule = css.match(new RegExp(`${escaped} \\{([\\s\\S]*?)\\n\\}`));
      check(`找到 ${selector} 规则`, rule !== null);
      if (rule !== null) {
        check(`${selector} 不带投影（用户明确要求去掉）`, !/box-shadow/.test(rule[1]),
          rule[1].replace(/\s+/g, ' ').trim().slice(0, 70));
      }
    }
    // 剥掉注释再查：说明文字里一旦出现这个名字，守卫就会把自己绊倒
    //（主题规则、视频样式表上都踩过，这里是第四次）。
    const runtimeCode = runtime.replace(/\/\*[\s\S]*?\*\//g, '');
    check('没有残留的投影变量定义（已无使用者）', !/--pw-shadow/.test(runtimeCode));
  }

  section('面层不透明度与对比度审计一致');

  {
    // 面层 alpha 决定壁纸能透出多少，也决定文字对比度。数字分散在两处
    // （运行时样式表、审计脚本），最容易悄悄漂移，所以强制对齐。
    //
    // 注意：这里比的是【取值集合】而不是逐个令牌对应。原因是层叠结构决定了
    // 同一个令牌可能出现多次、不同角色给不同 alpha（bg-base 在对话区叠三层），
    // 逐名对应既脆弱又表达不了真实关系。
    const themeCss = (runtime.match(/const THEME_STYLES = `([\s\S]*?)`;/))?.[1] ?? '';
    // 只统计【面层】令牌：bg-base / bg-layer-* / specific-sidebar-fill。
    // 遮罩、骨架、overlay 那些和层叠无关，不该进这个集合。
    const surfaceTokens = '--dsw-alias-bg-base|--dsw-alias-bg-layer-[123]|--dsw-specific-sidebar-fill';
    const runtimeAlphas = new Set(
      Array.from(themeCss.matchAll(new RegExp(`(${surfaceTokens}):\\s*rgba\\([^)]*?([0-9.]+)\\)`, 'g')))
        .map((match) => match[2]),
    );
    const audit = await readFile(join(HERE, 'contrast_audit.py'), 'utf8');
    const auditAlphas = new Set(
      Array.from(audit.matchAll(/\(\s*\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)\s*,\s*([0-9.]+)\s*\)/g))
        .map((match) => match[1]),
    );
    // 方向是单向的：审计【用到的】每个取值都必须在运行时里真实存在，
    // 否则审计就是在验证一个根本没上线的数字。
    //
    // 反过来不要求相等：运行时会有审计没建模的面层令牌（bg-overlay 之类），
    // 那不是不一致。另外必须按【数值】比较——运行时写 rgba(...,1)，审计写 1.0，
    // 按字符串比会假报不一致（踩过）。
    const runtimeList = [...runtimeAlphas].map(Number).sort((a, b) => a - b);
    const auditList = [...auditAlphas].map(Number).sort((a, b) => a - b);
    const missing = auditList.filter((value) => !runtimeList.includes(value));
    check('审计用到的每个面层取值在运行时样式表里都存在', missing.length === 0,
      `审计 [${auditList.join(', ')}] 运行时 [${runtimeList.join(', ')}] 缺 [${missing.join(', ')}]`);
  }

  section('叠在内容之上的面层必须不透明');

  {
    // 回归守卫，对应一个真实 bug：把 bg-layer-* 调成 0.70 之后，设置弹层
    // （.wCInkW_panel 用 bg-layer-2、._1Wt2eq_panel 用 bg-layer-1）变成 30% 透明，
    // 下层页面的文字直接透上来，看起来像两个窗口的内容糊在一起。
    //
    // 区分标准不是"哪个令牌好看"，而是【这个表面是不是叠在别的内容之上】：
    //   bg-base —— 页面最底层，半透明只是透出壁纸，允许；
    //   bg-layer-* —— 卡片/面板/下拉/输入框，永远叠在内容之上，必须不透明。
    // 谁想再把它调透，请先想清楚弹层会不会串内容。
    const themeCss = (runtime.match(/const THEME_STYLES = `([\s\S]*?)`;/))?.[1] ?? '';
    for (const token of ['--dsw-alias-bg-layer-1', '--dsw-alias-bg-layer-2', '--dsw-alias-bg-layer-3']) {
      const matches = [...themeCss.matchAll(new RegExp(`(${token}):\\s*rgba\\([^)]*?([0-9.]+)\\)`, 'g'))];
      check(`${token} 被显式设置为不透明`, matches.length >= 1, `${matches.length} 处`);
      for (const match of matches) {
        check(`${token} 的不透明度 ≥ 0.95（当前 ${match[2]}），否则弹层会透出下层内容`,
          Number(match[2]) >= 0.95);
      }
    }
  }

  section('内联资源（零请求的前提）');

  {
    for (const [name, marker] of [
      ['头像', 'data:image/webp;base64,'],
    ]) {
      check(`${name}以 data: URL 内联`, bundle.includes(marker));
    }
    check('两张壁纸都被内联', (bundle.match(/data:image\/webp;base64,/g) || []).length >= 3,
      `${(bundle.match(/data:image\/webp;base64,/g) || []).length} 处`);
    for (const marker of ['__DSH_PARDOFELIS_AVATAR__', '__DSH_PARDOFELIS_BG_LIGHT__', '__DSH_PARDOFELIS_BG_DARK__']) {
      check(`构建占位符已全部替换（${marker}）`, !bundle.includes(marker));
    }
  }

  section('SVG 必须走命名空间（v1.0.0 的空白按钮事故）');

  check('用 createElementNS 创建 SVG 元素', /createElementNS\(SVG_NS,/.test(runtime));
  check('没有用 createElement 造 svg', !/el\('svg'/.test(runtime));
  check('没有用 createElement 造 path/rect',
    !/el\('path'/.test(runtime) && !/el\('rect'/.test(runtime));

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
