# 设计说明 · dsh-pardofelis-widget

这份文档记录两件「改代码前应该先读」的事：**配色是怎么从立绘推出来的**，
以及**为什么可以保证不改动 DSH 的原布局**。

---

## 一、配色

### 1.1 取样

`tools/make_avatar.py` 会读原始立绘，做两件事：

1. 把中性色（近白 / 近黑 / 低饱和灰）滤掉，统计有彩色像素的色簇；
2. 在眼睛（虹膜）位置单独开小窗口，抓强饱和色。

结果落在 `tools/palette-report.txt`。这张立绘的结论是：

| 部位 | 取样值 | 说明 |
| --- | --- | --- |
| 头发（主色） | `#988479` | 暖砂棕。整个画面的主调 |
| 头发（亮部） | `#CCADA3` / `#B2978E` | 高光与中间调 |
| 猫耳 / 耳内 | `#D4B2A6` | 藕粉，比头发更暖更浅 |
| 头发（暗部） | `#7F6C66` / `#4C413D` | 阴影 |
| **虹膜** | **`#7CDCF4`** | 唯一的高饱和色，青蓝。**整套 UI 的强调色来源** |
| 裙装 | `#5C5090` / `#4F5A90` | 靛紫，作亮色档的强调色 |
| 皮肤高光 | `#FDECE5` | 近白奶色，作壳层底色 |

一个反直觉的地方：**这张立绘几乎全是低饱和色**。第一遍聚类出来的「主色」
是 `#FFFFFF`、`#171717` 这类白与黑，第二遍滤掉中性色后剩下的也全是
`h≈0–15, s≈0.1–0.2` 的暖灰。真正有彩度的只有眼睛那一处。

所以配色策略不是「把主色铺满界面」，而是：

- **壳层用低彩度的近白 / 近墨**（`#FFFCFA` / `#1E1C24`），保证文字清晰；
- **彩色只出现在装饰位置**：头像光环、描边、进度条、当前曲目高亮；
- **强调色取自虹膜**，因为它才是角色身上唯一"跳"出来的颜色。

### 1.2 提亮策略

立绘的暗部（`#4C413D`、`#5C5090`）直接拿来当界面色会显得脏、也不再护眼。
因此界面用色是**本色提亮后的淡彩**，并且**文字颜色一律交给 DSH 自己的
token 兜底**，不覆盖正文颜色：

```css
--pw-text: var(--dsh-text-primary, #3A3330);
--pw-text-dim: var(--dsh-text-secondary, #7A6C64);
```

这样即使在 DSH 换色或自定义主题下，正文对比度也不会因为这个插件而下降。

### 1.3 两档色板

| 角色 | 亮色档 | 暗色档 |
| --- | --- | --- |
| 壳层底 | `#FFFCFA`（近白奶色） | `#1E1C24`（暖靛黑） |
| 正文 | `#3A3330` | `#F0E8E4` |
| 次要文字 | `#7A6C64` | `#B3A49C` |
| 强调色 | `#4F5A90`（裙装靛紫） | `#B9C2F0`（虹膜提亮后的淡蓝） |
| 焦点环 | `#3F6EA8` | `#8FD8F4` |

### 1.4 对比度（实测，非估算）

`verify.mjs` 会用 WCAG 2.1 的公式现场算一遍，**半透明壳层还会先合成到页面底色
再算**（因为面板是 `rgba` + 背景模糊，直接拿半透明色和文字算对比度是自欺欺人）：

| 档位 | 正文 | 次要文字 | 强调色 |
| --- | --- | --- | --- |
| 亮色（纯底） | **12.12:1** | **4.95:1** | 6.43:1 |
| 暗色（纯底） | **13.93:1** | **6.98:1** | 9.66:1 |
| 亮色（半透明壳层合成后） | **12.13:1** | **4.95:1** | — |
| 暗色（半透明壳层合成后） | **14.13:1** | **7.08:1** | — |

WCAG AA 的门槛是正文 4.5:1、大字 3:1。这里正文一律按 7:1（AAA）要求自己。

### 1.5 明暗档怎么选

**不去猜 DSH 的类名或属性**（那是同类主题在 DSH 升级后失效的常见原因）。
改为读它自己的 `backgroundColor`：采样 `body` / `main` / `aside`，
取相对亮度平均，`< 0.5` 判为暗色；取不到就退回 `prefers-color-scheme`。

只读，不写。DSH 自己的配色一个字节都不改。

---

## 二、为什么不会改变原布局

### 2.1 只插入一个 fixed 节点

```
document.body
├── <div data-composer-card>            ← DSH 原有节点
└── <div id="dsh-pardofelis-widget-host" data-dsh-pardofelis="on">   ← 唯一新增
     └── #shadow-root
          ├── <style>                    ← 全部样式，隔离在 Shadow DOM 里
          └── .pw-surface
               ├── button.pw-launcher    ← position: absolute 的子元素
               └── div.pw-panel          ← position: absolute，向上弹出
```

宿主容器的 `:host` 规则**只允许**这些声明：

```
position: fixed; right; bottom; z-index;
pointer-events: none; font-family; font-size; line-height; color;
-webkit-font-smoothing;
```

**没有 `display`、没有 `flex`、没有 `grid`、没有宽高。**
`verify.mjs` 会把 `:host` 规则解析出来逐条比对白名单，多一个就失败。

容器没有内容尺寸（内容是溢出的绝对定位子元素），
所以它不占文档流、不改变任何原有元素的排布。

### 2.2 点击穿透

容器是 `pointer-events: none`，只有按钮和面板自己恢复 `auto`：

```css
:host { pointer-events: none; }
.pw-launcher, .pw-panel { pointer-events: auto; }
```

面板之外的一切点击直接落到原页面上。**从不给 `html` / `body` 加 `overflow: hidden`**，
所以页面滚动也不会被锁。

### 2.3 选择器策略

DSH 的组件样式表用 CSS Modules，类名形如 `<构建哈希>_<局部名>`，
**哈希每次构建都会变**。因此本插件：

- 只依赖稳定锚点：`[data-composer-card]`、`[data-composer-input]`、
  `[data-composer-placeholder]`、`[data-conversation-composer-overlay]`；
- 从不硬编码类名哈希（`verify.mjs` 会检查有没有 `_[A-Za-z0-9]{4,}_` 这种模式）。

锚点集中在 `COMPOSER_SELECTORS` 一处，DSH 万一改了属性名，只改这一处。

### 2.4 只在对话页

`reconcile()` 判断当前是否处于对话页：

- 在 → 挂载（幂等：宿主已存在且仍在文档里就直接复用，不重复注入）；
- 不在 → 立即卸载，连节点都不留。

触发时机有两条路：`MutationObserver`（观察 `documentElement` 的子树变化，
用 `requestAnimationFrame` 合并同一帧内的多次变动，避免 DSH 流式输出时反复挂载）
加上 `popstate` / `hashchange` / `pushState` / `replaceState` 的包装。

### 2.5 卸载清理

`ctx.effect` 登记的清理函数里逐项执行：

1. 取消 `requestAnimationFrame`；
2. 摘除所有事件监听（统一经 `listen()` 记录，用**同一个函数引用**摘除 ——
   任何再包一层的写法都会让 `removeEventListener` 失效）；
3. `audio.pause()` → 清 `src` → `load()`；
4. 遍历 `Map` 调 `URL.revokeObjectURL()`；
5. 断开 `MutationObserver`；
6. 移除宿主节点。

`test-widget.mjs` 会在卸载后断言：宿主没了、audio 停了、`src` 空了、
Object URL 全部 revoke、监听数归零、观察器全部断开。

---

## 三、几个刻意的取舍

**为什么音频不进 DOM。** 播放用的 `HTMLAudioElement` 从不 `append` 到文档。
它不需要在文档里就能播，而且不进文档就绝不会影响布局。

**为什么头像内联成 `data:` URL。** 走 HTTP 路由需要 Host 半边注册端点，
就会产生网络请求。内联之后整个插件**一次请求都没有**，
Host 半边也就可以是彻底的空操作。代价是产物大了约 16 KiB。

**为什么曲目列表不持久化。** 网页无法长期持有用户选过的本地文件
（`File` 对象不能序列化，`blob:` 地址刷新即失效）。
与其存一个刷新后必然失效的列表，不如空着，并在空态里直说
「刷新后需重新导入」。

**为什么点当前曲目是重播而不是暂停。** 用户点列表里的某一项，
表达的是「我要听这首」。想暂停有播放键，也支持空格键。
