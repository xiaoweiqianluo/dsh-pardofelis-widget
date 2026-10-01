// ══════════════════════════════════════════════════════════════════════════
//  帕朵菲莉丝主题挂件 · 回归测试
//
//  在没有浏览器的情况下把 bundle/client.js 真跑一遍，覆盖：
//    挂载幂等 / 页面边界 / 导入去重 / 播放暂停 / 切歌 / 音量 / 播放模式 /
//    移除与 Object URL 释放 / 持久化 / 明暗theme / 卸载清理 / 自动播放被拦
//
//  用法：node tools/test-widget.mjs
// ══════════════════════════════════════════════════════════════════════════

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createEnvironment, loadPlugin } from './dom-shim.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const BUNDLE = join(ROOT, 'bundle', 'client.js');
const HOST_ID = 'dsh-pardofelis-widget-host';
const LS_KEY = 'dsh-pardofelis-widget:v1';

let passed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  ok   ${name}`);
    return;
  }
  failures.push(name);
  console.log(`  FAIL ${name}${detail === undefined ? '' : ` -> ${detail}`}`);
}

function equal(name, actual, expected) {
  check(name, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function section(title) {
  console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 58 - title.length))}`);
}

// ── 环境助手 ─────────────────────────────────────────────────────────────

/** 起一个全新环境并挂载插件（仿真是全局的，因此用 ctx 记录下来统一归还）。 */
const liveContexts = [];

async function boot(options) {
  const env = createEnvironment(options || {});
  env.enterChat();
  const plugin = await loadPlugin(env, BUNDLE);
  plugin.exports.apply(plugin.ctx);
  env.flush();
  const context = { env, plugin };
  liveContexts.push(context);
  context.host = env.document.body.querySelector(`#${HOST_ID}`);
  return context;
}

/** 卸载插件并归还仿真全局，保证测试之间互不影响。 */
function shutdown(context) {
  try {
    context.plugin.disposeEffects();
    context.env.flush();
  } finally {
    context.env.restore();
    const index = liveContexts.indexOf(context);
    if (index >= 0) liveContexts.splice(index, 1);
  }
}

const shadowOf = (env) => env.document.body.querySelector(`#${HOST_ID}`)?.shadowRoot ?? null;
const $ = (env, selector) => shadowOf(env)?.querySelector(selector) ?? null;
const $$ = (env, selector) => shadowOf(env)?.querySelectorAll(selector) ?? [];

/** 通过文件输入导入若干「文件」。 */
function importFiles(env, files) {
  const input = $(env, '.pw-visually-hidden');
  input.files = files;
  input.dispatch('change');
  env.flush();
}

const itemNames = (env) => $$(env, '.pw-item-name').map((node) => node.textContent);
// 取「当前这个挂件」的播放器。两个坑都不能踩：
//   · 不能取最后一个——仿真修好 isConnected 之后 hydrateDurations() 会真的跑，
//     每首曲目都创建一个一次性探测器 Audio，最后那个是探测器。
//   · 也不能取第一个——「页面边界」那节会离开再回到对话页，挂件被重建过，
//     第一个是已经释放的旧实例。
// 可靠的判别：挂件会给自己的 audio 注册 play/pause/ended 监听，探测器只注册
// loadedmetadata/error，不会注册 play。
const currentAudio = (env) => [...env.audioInstances].reverse()
  .find((audio) => audio.listenerCount('play') > 0);
const tick = () => new Promise((resolve) => { setImmediate(resolve); });

// ══════════════════════════════════════════════════════════════════════════
async function run() {
  section('模块外壳');

  {
    const env = createEnvironment();
    const plugin = await loadPlugin(env, BUNDLE);
    equal('导出的 inject 为空数组（无强制依赖）', Array.isArray(plugin.exports.inject) && plugin.exports.inject.length, 0);
    equal('导出 apply 是函数', typeof plugin.exports.apply, 'function');
    plugin.exports.apply(plugin.ctx);
    env.flush();
    equal('非对话页不注入宿主节点', env.document.body.querySelector(`#${HOST_ID}`), null);
    plugin.disposeEffects();
    env.flush();
    env.restore();
  }

  section('挂载与页面边界');

  const main = await boot();
  const { env, plugin, host } = main;

  check('对话页出现宿主节点', host !== null);
  equal('宿主节点带标记属性', host?.getAttribute('data-dsh-pardofelis'), 'on');
  equal('宿主节点带 id', host?.getAttribute('id'), HOST_ID);
  check('宿主节点挂在 body 下', host?.parentElement === env.document.body);
  check('宿主节点创建了 Shadow Root', shadowOf(env) !== null);
  check('Shadow Root 内有样式表', $(env, 'style') !== null);
  check('渲染了悬浮按钮', $(env, '.pw-launcher') !== null);
  check('渲染了音乐面板', $(env, '.pw-panel') !== null);
  check('body 下只有对话锚点与宿主容器两个节点', env.document.body.children.length === 2,
    `children=${env.document.body.children.map((n) => n.tagName).join(',')}`);

  equal('按钮初始 aria-expanded=false', $(env, '.pw-launcher').getAttribute('aria-expanded'), 'false');
  equal('按钮有 aria-label', $(env, '.pw-launcher').getAttribute('aria-label'), '帕朵菲莉丝音乐挂件');
  check('按钮是 button 元素（可键盘聚焦）', $(env, '.pw-launcher').tagName === 'BUTTON');
  equal('面板初始收起', $(env, '.pw-panel').getAttribute('data-open'), 'false');

  section('图标命名空间（曾经全部不渲染的 bug）');

  {
    // 在 HTML 文档里用 createElement('svg') 造出来的节点落在 HTML 命名空间，
    // 浏览器不会渲染它——按钮会是空白方块，而 CSS 一切正常。
    // v1.0.0 就是这样把走带按钮做成空白的，所以这里把命名空间钉死。
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const svgs = $$(env, 'svg');
    check('面板里有内联 SVG 图标', svgs.length > 0, `${svgs.length} 个`);
    check('所有 SVG 都在 SVG 命名空间下',
      svgs.every((node) => node.namespaceURI === SVG_NS),
      svgs.map((node) => node.namespaceURI).join(', '));
    const paths = $$(env, 'path');
    check('SVG 子元素（path）也在 SVG 命名空间下',
      paths.length > 0 && paths.every((node) => node.namespaceURI === SVG_NS),
      `${paths.length} 个 path`);
    const rects = $$(env, 'rect');
    check('暂停图标的两根竖条用 SVG 命名空间',
      rects.every((node) => node.namespaceURI === SVG_NS));
    check('走带按钮里确实有图形子节点',
      ['[aria-label="播放"], [aria-label="暂停"]', '[aria-label="下一首"]', '[aria-label="上一首"]']
        .every((selector) => $(env, selector).children.length > 0));
  }

  section('文档级主题');

  {
    const html = env.document.documentElement;
    equal('主题标记加在 html 上', html.getAttribute('data-dsh-pardofelis'), 'on');
    const themeStyle = env.document.getElementById('dsh-pardofelis-theme');
    check('主题样式表已注入 head', themeStyle !== null);
    check('主题样式表放在 head 里（不插进内容区）', themeStyle?.parentElement === env.document.head);
    check('主题样式表带壁纸变量',
      themeStyle !== null
      && themeStyle.textContent.includes('--pw-wallpaper-light')
      && themeStyle.textContent.includes('--pw-wallpaper-dark'));
    check('壁纸以 data: URL 内联（不产生请求）',
      themeStyle !== null && themeStyle.textContent.includes('data:image/webp;base64,'));
    check('主题只覆盖背景族令牌，不碰文字与状态色',
      themeStyle !== null
      && !/--dsw-alias-label-|--dsw-alias-state-|--dsw-alias-markdown-/.test(themeStyle.textContent));
    equal('亮色档不设置暗色标记', html.getAttribute('data-pw-dark'), null);
  }

  section('主题是全局的，挂件才是对话页专属');

  {
    // 离开对话页：挂件必须卸载，主题必须留着。
    env.leaveChat();
    env.flush();
    equal('离开对话页后挂件宿主被移除', env.document.body.querySelector(`#${HOST_ID}`), null);
    equal('离开对话页后主题标记仍在', env.document.documentElement.getAttribute('data-dsh-pardofelis'), 'on');
    check('离开对话页后主题样式表仍在', env.document.getElementById('dsh-pardofelis-theme') !== null);
    env.enterChat();
    env.flush();
    check('回到对话页后挂件重新挂载', env.document.body.querySelector(`#${HOST_ID}`) !== null);
    equal('主题样式表没有被重复注入',
      env.document.documentElement.querySelectorAll('#dsh-pardofelis-theme').length, 1);
  }

  env.mutate();
  env.flush();
  equal('重复调度后仍只有一个宿主节点', env.document.body.querySelectorAll(`#${HOST_ID}`).length, 1);

  section('主题诊断（Shift+点悬浮球）');

  {
    // 诊断区默认不存在，Shift+点才出现。这条路径在这次的排查里是主力，
    // 所以要有回归覆盖：它不能抛错、不能污染面板。
    equal('默认没有诊断区', $(env, '.pw-diag'), null);
    $(env, '.pw-launcher').dispatch('click', { shiftKey: true });
    env.flush();
    const diag = $(env, '.pw-diag');
    check('Shift+点后出现诊断区', diag !== null);
    check('诊断区有标题', diag !== null && diag.textContent.includes('主题诊断'));
    const rows = $$(env, '.pw-diag-row');
    check('诊断区列出了若干项', rows.length >= 6, `${rows.length} 项`);
    check('诊断含 html 背景图一行',
      rows.some((row) => row.textContent.includes('html 背景图')));
    check('诊断含逐层扫描结论',
      rows.some((row) => row.textContent.includes('逐层扫描结果')));
    const openBefore = $(env, '.pw-panel').getAttribute('data-open');
    equal('诊断会自动展开面板', openBefore, 'true');
    $(env, '.pw-launcher').dispatch('click', { shiftKey: true });
    env.flush();
    equal('再 Shift+点一次收起诊断区', $(env, '.pw-diag'), null);
    check('收起诊断不影响面板内容', $(env, '.pw-picker') !== null);
    // 诊断会顺手把面板打开；下一节假定它是收起的，所以这里恢复原状。
    if ($(env, '.pw-panel').getAttribute('data-open') === 'true') {
      $(env, '.pw-launcher').dispatch('click');
      env.flush();
    }
    equal('退出诊断后把面板恢复为收起', $(env, '.pw-panel').getAttribute('data-open'), 'false');
  }

  section('面板开合与持久化');

  $(env, '.pw-launcher').dispatch('click');
  env.flush();
  equal('点击按钮展开面板', $(env, '.pw-panel').getAttribute('data-open'), 'true');
  equal('展开后 aria-expanded=true', $(env, '.pw-launcher').getAttribute('aria-expanded'), 'true');
  check('开合状态写入 localStorage', env.storage.get(LS_KEY).includes('"open":true'));

  $(env, '.pw-head-close').dispatch('click');
  env.flush();
  equal('点关闭按钮收起面板', $(env, '.pw-panel').getAttribute('data-open'), 'false');

  $(env, '.pw-launcher').dispatch('click');
  env.flush();
  $(env, '.pw-panel').dispatch('keydown', { key: 'Escape' });
  env.flush();
  equal('Esc 收起面板', $(env, '.pw-panel').getAttribute('data-open'), 'false');

  section('导入本地音频');

  equal('初始列表为空', $$(env, '.pw-item').length, 0);
  check('初始显示空态', $(env, '.pw-empty').hidden === false);
  equal('初始计数为 0 首', $(env, '.pw-count').textContent, '0 首');

  importFiles(env, [env.makeFile('夜航.mp3', 1024), env.makeFile('猫步.wav', 2048)]);
  equal('导入两首后列表有两项', $$(env, '.pw-item').length, 2);
  check('列表显示文件名', itemNames(env).includes('夜航.mp3') && itemNames(env).includes('猫步.wav'));
  equal('计数更新为 2 首', $(env, '.pw-count').textContent, '2 首');
  check('空态隐藏', $(env, '.pw-empty').hidden === true);
  equal('为每个文件创建了 Object URL', env.created.length, 2);
  check('Object URL 是 blob: 地址', env.created.every((entry) => entry.url.startsWith('blob:')));
  check('未 revoke 任何地址', env.revoked.length === 0);
  equal('导入后自动选中第一首（但不自动播放）', $(env, '.pw-now-title').textContent, '夜航.mp3');
  equal('导入不触发自动播放', currentAudio(env).playCalls, 0);

  importFiles(env, [env.makeFile('夜航.mp3', 1024)]);
  equal('重复文件不重复入列', $$(env, '.pw-item').length, 2);
  check('重复导入给出提示', $(env, '.pw-note').hidden === false);

  importFiles(env, [{ name: '说明.txt', size: 10, type: 'text/plain', lastModified: 1 }]);
  equal('非音频文件不被导入', $$(env, '.pw-item').length, 2);

  section('播放 / 暂停 / 进度');

  {
    const audio = currentAudio(env);
    $(env, '[aria-label="播放"], [aria-label="暂停"]').dispatch('click');
    await tick();
    env.flush();
    equal('点播放调用 audio.play()', audio.playCalls, 1);
    equal('播放后 audio 处于 playing', audio.paused, false);
    equal('播放后按钮 aria-label 变为暂停', $(env, '[aria-label="播放"], [aria-label="暂停"]').getAttribute('aria-label'), '暂停');
    equal('按钮进入播放态（呼吸光环）', $(env, '.pw-launcher').getAttribute('data-playing'), 'true');

    audio.duration = 200;
    audio.currentTime = 50;
    audio.dispatch('loadedmetadata');
    env.flush();
    equal('总时长渲染为 3:20', $(env, '.pw-time-total').textContent, '3:20');
    equal('当前时间渲染为 0:50', $(env, '.pw-time-current').textContent, '0:50');
    equal('进度条按比例定位', $(env, '.pw-progress-range').value, '250');

    $(env, '.pw-progress-range').value = '500';
    $(env, '.pw-progress-range').dispatch('input');
    equal('拖动进度条写入 currentTime', audio.currentTime, 100);

    $(env, '.pw-volume-range').value = '35';
    $(env, '.pw-volume-range').dispatch('input');
    equal('音量写入 audio.volume', Math.round(audio.volume * 100), 35);
    equal('音量百分比显示', $(env, '.pw-volume-value').textContent, '35%');
    check('音量写入 localStorage', env.storage.get(LS_KEY).includes('"volume":0.35'));

    $(env, '[aria-label="播放"], [aria-label="暂停"]').dispatch('click');
    await tick();
    env.flush();
    equal('再次点击暂停', audio.paused, true);
    equal('暂停后按钮 aria-label 变回播放', $(env, '[aria-label="播放"], [aria-label="暂停"]').getAttribute('aria-label'), '播放');
  }

  section('切歌与播放模式');

  equal('默认模式为顺序播放', $(env, '.pw-btn-mode').getAttribute('data-mode'), 'sequence');
  $(env, '.pw-btn-mode').dispatch('click');
  equal('第一次切换 -> 单曲循环', $(env, '.pw-btn-mode').getAttribute('data-mode'), 'repeat-one');
  $(env, '.pw-btn-mode').dispatch('click');
  equal('第二次切换 -> 随机播放', $(env, '.pw-btn-mode').getAttribute('data-mode'), 'shuffle');
  $(env, '.pw-btn-mode').dispatch('click');
  equal('第三次切换回到顺序', $(env, '.pw-btn-mode').getAttribute('data-mode'), 'sequence');
  check('播放模式写入 localStorage', env.storage.get(LS_KEY).includes('"mode":"sequence"'));

  {
    $$(env, '.pw-item')[1].dispatch('click');
    await tick();
    env.flush();
    equal('点击列表切到第二首', $(env, '.pw-now-title').textContent, '猫步.wav');
    equal('第二首标记为当前曲目', $$(env, '.pw-item')[1].getAttribute('data-current'), 'true');
  }

  {
    const nextButton = $(env, '[aria-label="下一首"]');
    if (nextButton === null) throw new Error('next button missing; aborting');
    nextButton.dispatch('click');
    await tick();
    env.flush();
    equal('顺序模式下一首到尾部回卷到第一首', $(env, '.pw-now-title').textContent, '夜航.mp3');
  }

  $(env, '[aria-label="上一首"]').dispatch('click');
  await tick();
  env.flush();
  equal('上一首从首项回卷到最后一首', $(env, '.pw-now-title').textContent, '猫步.wav');

  $(env, '.pw-btn-mode').dispatch('click');
  equal('切到单曲循环', $(env, '.pw-btn-mode').getAttribute('data-mode'), 'repeat-one');
  {
    const audio = currentAudio(env);
    const nameBefore = $(env, '.pw-now-title').textContent;
    const playCallsBefore = audio.playCalls;
    audio.currentTime = 123;
    audio.dispatch('ended');
    await tick();
    env.flush();
    equal('单曲循环把进度归零', audio.currentTime, 0);
    equal('单曲循环不换曲目', $(env, '.pw-now-title').textContent, nameBefore);
    check('单曲循环重新播放', audio.playCalls > playCallsBefore);
  }

  // 顺序模式最后一首播完：停在原地并提示
  $(env, '.pw-btn-mode').dispatch('click'); // repeat-one -> shuffle
  $(env, '.pw-btn-mode').dispatch('click'); // shuffle -> sequence
  {
    $$(env, '.pw-item')[1].dispatch('click'); // 切到最后一首
    await tick();
    env.flush();
    const audio = currentAudio(env);
    audio.dispatch('ended');
    await tick();
    env.flush();
    equal('顺序模式播完最后一首不跳回第一首', $(env, '.pw-now-title').textContent, '猫步.wav');
    check('顺序模式播完最后一首给出提示', $(env, '.pw-note').textContent.includes('最后一首'));
  }

  section('移除曲目与内存释放');

  {
    const namesBefore = itemNames(env);
    const removed = namesBefore[0];
    const removedUrl = env.created.find((entry) => entry.file.name === removed).url;
    const revokedBefore = env.revoked.length;
    $$(env, '.pw-item-remove')[0].dispatch('click');
    env.flush();
    equal('移除后列表少一项', $$(env, '.pw-item').length, 1);
    check('被移除的曲目不再出现在列表', !itemNames(env).includes(removed));
    check('移除时释放了对应的 Object URL', env.revoked.includes(removedUrl));
    check('确实调用了 revokeObjectURL', env.revoked.length > revokedBefore);
  }

  while ($$(env, '.pw-item-remove').length > 0) {
    $$(env, '.pw-item-remove')[0].dispatch('click');
    env.flush();
  }
  equal('清空后列表为空', $$(env, '.pw-item').length, 0);
  check('清空后显示空态', $(env, '.pw-empty').hidden === false);
  equal('所有 Object URL 均已释放', env.revoked.length, env.created.length);
  check('清空后 audio 已停止', currentAudio(env).paused === true);

  section('键盘操作');

  {
    importFiles(env, [env.makeFile('键盘.mp3', 700)]);
    const body = $(env, '.pw-panel');
    body.dispatch('keydown', { key: ' ' });
    await tick();
    env.flush();
    equal('空格播放', currentAudio(env).paused, false);
    body.dispatch('keydown', { key: ' ' });
    await tick();
    env.flush();
    equal('空格再按暂停', currentAudio(env).paused, true);

    const audio = currentAudio(env);
    audio.duration = 100;
    audio.currentTime = 50;
    body.dispatch('keydown', { key: 'ArrowRight' });
    equal('右方向键快进 5 秒', audio.currentTime, 55);
    body.dispatch('keydown', { key: 'ArrowLeft' });
    equal('左方向键后退 5 秒', audio.currentTime, 50);

    const beforeVolume = audio.volume;
    body.dispatch('keydown', { key: 'ArrowUp' });
    check('上方向键提高音量', audio.volume > beforeVolume);
    body.dispatch('keydown', { key: 'ArrowDown' });
    equal('下方向键回到原音量', Math.round(audio.volume * 100), Math.round(beforeVolume * 100));

    $$(env, '.pw-item-remove')[0].dispatch('click');
    env.flush();
  }

  shutdown(main);

  section('卸载清理');

  {
    const context = await boot();
    const { env: env2, plugin: plugin2 } = context;
    importFiles(env2, [env2.makeFile('收尾.mp3', 512)]);
    $(env2, '[aria-label="播放"], [aria-label="暂停"]').dispatch('click');
    await tick();
    env2.flush();
    const audio = currentAudio(env2);
    equal('卸载前正在播放', audio.paused, false);
    const launcher = $(env2, '.pw-launcher');
    check('按钮上注册了 click 监听', launcher.listenerCount('click') > 0);
    const revokedBefore = env2.revoked.length;
    const createdCount = env2.created.length;

    shutdown(context);

    equal('卸载后宿主节点被移除', env2.document.body.querySelector(`#${HOST_ID}`), null);
    equal('卸载后 audio 已暂停', audio.paused, true);
    check('卸载后 audio 的 src 已清空', audio.src === '');
    check('卸载后调用了 audio.load() 释放资源', audio.loadCalls > 0);
    equal('卸载后所有 Object URL 均已释放', env2.revoked.length, createdCount);
    check('卸载过程中确实做了 revoke', env2.revoked.length >= revokedBefore);
    equal('卸载后残余事件监听被摘除', launcher.listenerCount('click'), 0);
    check('卸载后观察器已断开', env2.observers.every((observer) => observer.disconnected));
    equal('卸载后主题样式表被摘除', env2.document.getElementById('dsh-pardofelis-theme'), null);
    equal('卸载后 html 上的主题标记被摘除',
      env2.document.documentElement.getAttribute('data-dsh-pardofelis'), null);
  }

  section('持久化与明暗跟随');

  {
    const env2 = createEnvironment();
    env2.storage.set(LS_KEY, JSON.stringify({ volume: 0.42, mode: 'shuffle', open: true }));
    env2.enterChat();
    const plugin2 = await loadPlugin(env2, BUNDLE);
    plugin2.exports.apply(plugin2.ctx);
    env2.flush();
    equal('读回持久化的音量', $(env2, '.pw-volume-range').value, '42');
    equal('读回持久化的播放模式', $(env2, '.pw-btn-mode').getAttribute('data-mode'), 'shuffle');
    equal('读回持久化的面板开合状态', $(env2, '.pw-panel').getAttribute('data-open'), 'true');
    equal('刷新后曲目列表为空（音频不持久化）', $$(env2, '.pw-item').length, 0);
    plugin2.disposeEffects();
    env2.flush();
    env2.restore();
  }

  for (const [label, dark, expectedClass] of [
    ['暗色环境应用暗色调色板', true, 'pw-theme-dark'],
    ['亮色环境应用亮色调色板', false, 'pw-theme-light'],
  ]) {
    const env2 = createEnvironment({ dark });
    env2.enterChat();
    const plugin2 = await loadPlugin(env2, BUNDLE);
    plugin2.exports.apply(plugin2.ctx);
    env2.flush();
    const surface = env2.document.body.querySelector(`#${HOST_ID}`).shadowRoot.querySelector('.pw-surface');
    check(label, surface.classList.contains(expectedClass));
    // 壁纸是两档各自的图，靠 html 上的 data-pw-dark 切换
    equal(`${dark ? '暗' : '亮'}色档的壁纸切换标记`,
      env2.document.documentElement.getAttribute('data-pw-dark'), dark ? 'on' : null);
    plugin2.disposeEffects();
    env2.flush();
    env2.restore();
  }

  section('自动播放被拦截时的提示');

  {
    const env2 = createEnvironment({ blockAutoplay: true });
    env2.enterChat();
    const plugin2 = await loadPlugin(env2, BUNDLE);
    plugin2.exports.apply(plugin2.ctx);
    env2.flush();
    importFiles(env2, [env2.makeFile('拦截.mp3')]);
    $(env2, '[aria-label="播放"], [aria-label="暂停"]').dispatch('click');
    await tick();
    env2.flush();
    const note = $(env2, '.pw-note');
    equal('给出提示而不是静默失败', note.hidden, false);
    check('提示说明是自动播放策略', note.textContent.includes('自动播放'), note.textContent);
    plugin2.disposeEffects();
    env2.flush();
    env2.restore();
  }

  section('异常输入');

  {
    const context = await boot();
    const env2 = context.env;
    importFiles(env2, []);
    equal('导入空数组不产生曲目', $$(env2, '.pw-item').length, 0);
    importFiles(env2, [{ name: '零字节.mp3', size: 0, type: 'audio/mpeg', lastModified: 1 }]);
    equal('零字节文件被拒绝', $$(env2, '.pw-item').length, 0);
    check('给出可读提示', $(env2, '.pw-note').hidden === false);
    $(env2, '[aria-label="播放"], [aria-label="暂停"]').dispatch('click');
    await tick();
    env2.flush();
    check('空列表点播放给出提示', $(env2, '.pw-note').textContent.includes('导入'));
    $(env2, '[aria-label="下一首"]').dispatch('click');
    await tick();
    env2.flush();
    check('空列表点下一首不抛错', true);
    shutdown(context);
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

await run();
