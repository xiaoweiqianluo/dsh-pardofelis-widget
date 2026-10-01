# 帕朵菲莉丝主题挂件 · dsh-pardofelis-widget

**v1.1** —— 除了右下角的音乐挂件，整个界面也换成以角色立绘为主题的底色（左侧是角色本体）。

给 **DeepSeek Harness** 做的《崩坏：星穹铁道》帕朵菲莉丝（Pardofelis）主题挂件。

对话页右下角多一个猫耳头像的悬浮按钮，点开是一个**本地音乐播放器**。
导入你自己电脑上的音乐文件，播放、切歌、调音量。

**不改变 DSH 原本的布局，不上传任何文件，不请求任何外部接口。**

---

## 效果

**界面背景**：以角色立绘为主题的两档壁纸（亮色一张、暗色一张），
加上把 DSH 自己的配色往角色色相上偏的染色。角色**偏左**站立，右侧留给正文。

**右下角悬浮按钮**：角色头像 + 一对猫耳。播起来的时候有一圈呼吸光环。

**面板向上弹出**：导入、播放 / 暂停、上一首 / 下一首、进度条、时间、音量、
三种播放模式、可点击切换并可移除的播放列表。

**只在对话页出现的是挂件**：离开对话页（比如去设置）按钮就消失，回到对话页
再出现。主题是全局的，所有页面都生效——两者互不耦合。

---

## 它不会动你的界面

这几条是硬约束，也是这个插件最花心思的地方：

- **宿主容器是一个 `position: fixed` 的节点**，本身没有内容尺寸。除了它之外，
  插件不会往文档里插任何东西。
- **不碰原 DOM**：不改任何原有元素的 `style` / `class`，不覆盖
  `display` / `flex` / `grid` / `position` / 宽高。
- **不挡点击**：容器是 `pointer-events: none`，只有按钮与面板自身恢复
  `pointer-events: auto`。容器之外的一切点击直接穿透。
- **不锁滚动**：面板内部滚动（`overscroll-behavior: contain`），
  从不给 `html` / `body` 加 `overflow: hidden`。
- **样式隔离**：全部 CSS 都在 Shadow DOM 里，不污染全局。
- **明暗自动跟随**：不去猜 DSH 的类名，而是读它自己的背景色亮度来判断当前是
  亮色还是暗色，然后选对应的调色板与壁纸。
- **背景不动布局**：壁纸挂在 `html` 的伪元素上（根元素的伪元素天然画在 body
  背景之下，不必用 `z-index` 去和任何元素争层级），不新增任何占文档流的节点。
- **只改颜色令牌，不改文字**：主题只覆盖 DSH 的【背景族】、滚动条与侧栏令牌
  （`--dsw-alias-bg-*` / `scrollbar-*` / `interactive-bg-*` / `--dsw-specific-sidebar-fill`），
  正文与次要文字、语义色（成功 / 警告 / 错误）、代码高亮一律不碰——
  那些一改就得重新证明对比度，而且会丢语义。

这些不是嘴上说说，仓库里有两套自检逐条核对（见下面的「自检」）。

---

## 它不会联网

**音频只在这台电脑上处理。**

- 导入用 `<input type="file">`，文件由浏览器交给页面，
  用 `URL.createObjectURL()` 生成一个 `blob:` 地址。
- 播放用 `HTMLAudioElement`，读的就是这个 `blob:` 地址。
- 代码里没有 `fetch` / `XMLHttpRequest` / `WebSocket` / `sendBeacon` / `EventSource`，
  构建脚本会**在打包时强制检查**，出现任何一个都会直接失败。
- 连角色头像都不走网络请求：它以 `data:` URL 内联在客户端半边里。

也就是说，**没有「上传」这个动作存在** —— 没有接口可上传。

移除曲目、或者插件被卸载（禁用 / 移除插件）时，
对应的 `blob:` 地址会逐个 `URL.revokeObjectURL()` 释放，文件内容随之从内存里消失。

### 刷新之后

**音频文件本身不会被保存。** 刷新页面后播放列表是空的，需要重新导入
（受浏览器安全模型限制，网页无法长期持有你选过的本地文件）。

**会被记住的**：音量、播放模式、面板开合状态。存在 `localStorage` 的
`dsh-pardofelis-widget:v1` 键下，随时可以自己删掉。

---

## 安装

**Web 端与 DSH Desktop 用的是同一个 profile。**
`DSH_PROFILE` 环境变量指向哪个 profile，插件就装到哪个。

### 命令行（装了 `dsh` 命令的环境）

```bash
dsh plugin --profile desktop add github:<你的账号>/dsh-pardofelis-widget
```

（`--profile desktop` 指的是 DSH 的 profile 名字，不是「只装给桌面端」。）

### DSH Desktop 本地安装（没有 `dsh` 命令时）

1. **完全退出 DSH Desktop**（托盘图标 → 退出）
2. 右键 `tools\install-local.ps1` →「使用 PowerShell 运行」
3. 启动 DSH，刷新页面

脚本会先确认 DSH 已退出、备份 profile 配置，再安装并逐项校验。
任一步失败都会停下并回滚，同时打印手动回滚命令。

安装有两条路径，脚本自动选：

- **pnpm 可用时**先走 pnpm（`pnpm --dir <profile> add`），这是官方路径，
  也会同步 lockfile；
- **pnpm 跑不通时**（受限环境、pnpm 内部调用 git 被拒等）自动改用
  「清单登记 + 目录联接」：把插件复制/链接到 profile 内，写进
  `dependencies` 与 `dsh.profile.bundles`，并在 `node_modules` 下建一个指向它的
  目录联接。效果与 pnpm 安装等价，只是少一条 lockfile 记录。

两条路径完成后都跑同样的五步校验（依赖已登记 / 包能解析 / 声明了
`dsh.bundle.patch` / 两半都在 / bundle 列表含本插件）。

> 想先看不装？用 `tools\test-install.ps1` 演练：它把当前 profile 的清单复制到
> 仓库内的 `.scratch`，用 `-ProfileDir` 指向那份副本跑真正的安装脚本，
> **完全不碰真实 profile**，也不要求 DSH 退出。

### 装好了但界面没变？

1. 先刷新页面（`Ctrl+R`）
2. 还不行就**完全退出 DSH** 再启动一次
3. 确认你确实在**对话页**（按钮只在对话页出现）

---

## 卸载

**应用内**：设置 → 插件 → 找到 `dsh-pardofelis-widget` → 移除。

**命令行**：

```bash
dsh plugin --profile desktop remove dsh-pardofelis-widget
```

卸载后按钮消失、监听全部摘除、`blob:` 地址全部释放，不留残留。

---

## 支持哪些格式

`accept="audio/*"`，另外显式列出 `.mp3` `.m4a` `.aac` `.ogg` `.oga` `.opus`
`.wav` `.flac` `.webm`。

**实际能不能播取决于你的浏览器**（Chrome / Electron 对上述格式支持良好）。
遇到播不了的文件，面板会给出中文提示，不会静默失败。

---

## 操作

| 操作 | 方式 |
| --- | --- |
| 展开 / 收起面板 | 点悬浮按钮，或按 `Esc` 收起 |
| 播放 / 暂停 | 点中间的大按钮，或在面板里按 `空格` |
| 上一首 / 下一首 | 点箭头按钮，或 `Ctrl + ←` / `Ctrl + →` |
| 前后跳 5 秒 | `←` / `→`（焦点不落在输入框上时） |
| 调音量 | 音量滑杆，或 `↑` / `↓` |
| 切换曲目 | 点播放列表里的任意一项 |
| 移除曲目 | 点条目右侧的垃圾桶图标 |
| 切换播放模式 | 点最左边的模式按钮，在顺序 / 单曲循环 / 随机之间轮换 |

按钮有 `aria-label`、可键盘聚焦、有 `:focus-visible` 焦点环；
面板是 `role="dialog"`，滑杆有各自的 `aria-label`。

---

## 自检

提交前跑这两个（都无第三方依赖）：

```bash
node tools/build.mjs          # 重新打包 bundle/client.js
node tools/verify.mjs         # 静态自检：118 项
node tools/test-widget.mjs    # 行为回归：123 项
```

`verify.mjs` 核对的是「看一眼源码就能判定」的事实：
产物与源是否同步、有没有网络 API、有没有碰原布局、`:host` 只声明了哪些属性、
卸载路径是否完整、调色板对比度是否达到 WCAG AA。

`test-widget.mjs` 用一个最小 DOM 仿真把 `bundle/client.js` **真跑一遍**：
挂载幂等、页面边界、导入去重、播放暂停、切歌、播放模式、移除与内存释放、
持久化、明暗跟随、自动播放被拦截时的提示、卸载清理。
它不需要浏览器，也不需要 DSH 在跑。

### 改代码之前值得知道的几点

- **改 `src/runtime.js` 或 `src/client.js` 之后必须重新打包**：
  `node tools/build.mjs`，否则 `verify.mjs` 会报产物过期。
- **`src/client.js` 的注释里不能出现「星号 + 斜杠」这个字符对**。
  它是块注释的结束符，写了会让注释提前结束，后面的中文说明被当成代码解析 ——
  产物会直接报 `SyntaxError`。这个坑踩过一次，注释里留了警告。
- **`src/runtime.js` 里不能写 `export` 语句**：它会被注入到
  `src/client.js` 的工厂函数体内部，而 ESM 的 `export` 只能出现在模块顶层。
  插件的导出由外壳末尾的 `exports.apply = apply` 完成。
- **改了 `assets/avatar.webp` 要重新打包**（`tools/build.mjs` 会把它内联进产物）。
  头像由 `tools/make_avatar.py` 从原始立绘生成。

---

## 目录结构

```
dsh-pardofelis-widget/
├── src/
│   ├── client.js          # 浏览器半边模块外壳（工厂函数 + 导出）
│   └── runtime.js         # 全部逻辑：界面、播放器、挂载生命周期
├── bundle/
│   ├── host.js            # Host 半边：刻意空操作
│   └── client.js          # 构建产物（不要直接改）
├── assets/
│   ├── avatar.webp        # 头像（构建时内联）
│   ├── bg-light.webp      # 亮色档壁纸（构建时内联）
│   ├── bg-dark.webp       # 暗色档壁纸（构建时内联）
│   └── bg-figure.webp     # 角色本体透明层（备用素材，不内联）
├── photo/
│   ├── 立绘.png           # 角色立绘（源图，随仓库发布）
│   └── 头像.jpg           # 头像源图（随仓库发布）
├── tools/
│   ├── build-core.mjs     # 构建内核（build 与 verify 共用）
│   ├── build.mjs          # 打包入口
│   ├── verify.mjs         # 静态自检
│   ├── test-widget.mjs    # 行为回归测试
│   ├── dom-shim.mjs       # 最小 DOM 仿真（测试用）
│   ├── make_avatar.py     # 从源图生成头像 + 配色报告
│   ├── make_wallpaper.py  # 从立绘合成两档壁纸
│   ├── contrast_audit.py  # 主题底色的文字对比度审计
│   ├── palette-report.txt # 立绘取色报告
│   ├── install-local.ps1  # DSH Desktop 本地安装
│   └── test-install.ps1   # 安装脚本演练（临时 profile，不碰真环境）
├── package.json
├── cordis.patch.yml
├── DESIGN.md              # 配色推导与选择器策略
└── LICENSE
```

### 为什么 Host 半边是空的

插件的全部行为都在浏览器里完成，所以 Host 半边刻意什么都不做：
不注册 HTTP 路由、不读写文件、不发请求。

之所以仍然提供它，是因为 Loader 需要一行可解析的包入口
（见 `cordis.patch.yml`）。DSH 官方的纯浏览器插件
（例如 `@deepseek-ai/dsh-client-ui-attachment`）同样是
「Host 半边空操作 + Client 半边干活」的结构。

---

## 兼容性

- DSH **0.2.0-rc.2**（本机验证版本）及以上
- Web 端与 DSH Desktop 通用
- 跟随 DSH 自己的明暗设置自动换档
- 系统开启「减少动态效果」时关闭动画

---

## 授权与声明

代码以 **MIT** 授权，见 [`LICENSE`](./LICENSE)。

角色「帕朵菲莉丝」为米哈游《崩坏：星穹铁道》角色，
本插件为**非商业同人作品**，与米哈游无关联。

`assets/avatar.webp` 由角色立绘裁切而来，**原始立绘不随本仓库发布**
（`tools/make_avatar.py` 需要你自备源图才能重新生成）。

插件**不内置任何音乐**。
