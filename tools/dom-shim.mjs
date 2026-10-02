// ══════════════════════════════════════════════════════════════════════════
//  帕朵菲莉丝主题挂件 · 最小 DOM 仿真 + 插件载入器
//
//  目的：在没有浏览器的情况下把 bundle/client.js 真正跑起来，验证
//    · 只在对话页挂载 / 离开即卸载，重复挂载不重复注入
//    · 导入 -> 播放 -> 切歌 -> 音量 / 模式 -> 移除 的行为
//    · 卸载时 Object URL 是否全部 revoke、audio 是否停止
//
//  只实现插件用到的那部分 DOM 子集，不是通用 DOM 实现。
// ══════════════════════════════════════════════════════════════════════════

const HTML_NS = 'http://www.w3.org/1999/xhtml';
const SVG_NS = 'http://www.w3.org/2000/svg';

// ── 选择器匹配：只支持插件与测试实际用到的形式 ────────────────────────────
//   #id / 标签名 / .class / [attr] / [attr="value"] / 逗号多选 / 空格后代
function matchesSimple(el, selector) {
  const text = selector.trim();
  const attr = text.match(/^\[([\w-]+)(?:=["']?([^"'\]]*)["']?)?\]$/);
  if (attr !== null) {
    const [, name, value] = attr;
    if (!el.hasAttribute(name)) return false;
    if (value === undefined) return true;
    return el.getAttribute(name) === value;
  }
  if (text.startsWith('#')) return el.getAttribute('id') === text.slice(1);
  if (text.startsWith('.')) return el.classList.contains(text.slice(1));
  return el.tagName === text.toUpperCase();
}

function matches(el, selector) {
  return selector.split(',').some((part) => {
    const steps = part.trim().split(/\s+/);
    if (!matchesSimple(el, steps[steps.length - 1])) return false;
    let node = el.parentElement;
    for (let i = steps.length - 2; i >= 0; i -= 1) {
      let found = false;
      while (node !== null && node !== undefined) {
        if (matchesSimple(node, steps[i])) { found = true; node = node.parentElement; break; }
        node = node.parentElement;
      }
      if (!found) return false;
    }
    return true;
  });
}

class FakeClassList {
  constructor() { this.set = new Set(); }
  add(...names) { for (const name of names) this.set.add(name); }
  remove(...names) { for (const name of names) this.set.delete(name); }
  contains(name) { return this.set.has(name); }
  toggle(name, force) {
    const want = force === undefined ? !this.contains(name) : force;
    if (want) this.add(name); else this.remove(name);
    return want;
  }
  toString() { return Array.from(this.set).join(' '); }
}

class FakeNode {
  constructor(tagName, namespace) {
    this.tagName = String(tagName).toUpperCase();
    // 记录命名空间：SVG 必须用 createElementNS 创建，否则浏览器不渲染。
    // 仿真把这件事记下来，测试才有办法抓住这个错误（v1.0.0 踩过一次）。
    this.namespaceURI = namespace === undefined ? HTML_NS : namespace;
    this.children = [];
    this.parentElement = null;
    this.attributes = new Map();
    this.classList = new FakeClassList();
    this.style = {};
    this.listeners = new Map();
    this.isConnected = false;
    this.shadowRoot = null;
    this.hidden = false;
    this.disabled = false;
    this.value = '';
  }

  get className() { return this.classList.toString(); }
  set className(value) {
    this.classList = new FakeClassList();
    for (const name of String(value).split(/\s+/)) if (name.length > 0) this.classList.add(name);
    this.attributes.set('class', String(value));
  }

  get textContent() {
    let out = this._text === undefined ? '' : this._text;
    for (const child of this.children) out += child.textContent;
    return out;
  }
  set textContent(value) {
    this._text = String(value);
    for (const child of this.children) child.parentElement = null;
    this.children = [];
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === 'class') this.className = value;
    if (name === 'hidden') this.hidden = true;
  }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  hasAttribute(name) { return this.attributes.has(name); }
  removeAttribute(name) {
    this.attributes.delete(name);
    if (name === 'hidden') this.hidden = false;
  }

  append(...nodes) {
    for (const node of nodes) {
      if (node === null || node === undefined || node === false) continue;
      const child = typeof node === 'string' ? makeText(node) : node;
      child.parentElement = this;
      this.children.push(child);
      markConnected(child, this.isConnected);
    }
  }
  appendChild(node) { this.append(node); return node; }

  remove() {
    if (this.parentElement === null) return;
    const list = this.parentElement.children;
    const index = list.indexOf(this);
    if (index >= 0) list.splice(index, 1);
    this.parentElement = null;
    markConnected(this, false);
  }

  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(handler);
  }
  removeEventListener(type, handler) {
    const list = this.listeners.get(type);
    if (list === undefined) return;
    const index = list.indexOf(handler);
    if (index >= 0) list.splice(index, 1);
  }
  /**
   * 派发事件，并【沿 parentElement 冒泡】。
   *
   * 插件用事件委托（在 <ul> 上监听，靠子元素的事件冒泡上来），所以仿真必须
   * 实现冒泡，否则会得出「委托失效」的错误结论。真实 DOM 里 click 与 keydown
   * 都是冒泡事件，因此默认 bubbles=true。
   */
  dispatch(type, event, options) {
    const opts = options || {};
    const bubbles = opts.bubbles !== false;
    const payload = event || {};
    if (payload.type === undefined) payload.type = type;
    if (payload.target === undefined) payload.target = this;
    let stopped = false;
    if (typeof payload.stopPropagation !== 'function') {
      payload.stopPropagation = () => { stopped = true; };
    } else {
      const originalStop = payload.stopPropagation;
      payload.stopPropagation = () => { stopped = true; originalStop(); };
    }
    if (typeof payload.preventDefault !== 'function') payload.preventDefault = () => {};

    let node = this;
    while (node !== null && node !== undefined) {
      const list = node.listeners === undefined ? undefined : node.listeners.get(type);
      if (list !== undefined) {
        payload.currentTarget = node;
        for (const handler of list.slice()) {
          handler.call(node, payload);
          if (stopped) return;
        }
      }
      if (!bubbles) return;
      node = node.parentElement;
    }
  }
  listenerCount(type) {
    const list = this.listeners.get(type);
    return list === undefined ? 0 : list.length;
  }

  focus() { globalThis.__pardofelisActiveElement = this; }
  blur() {}

  attachShadow() {
    const shadow = new FakeShadowRoot(this);
    // 继承宿主的连接状态：真实 DOM 里 attachShadow 之后，宿主在文档里就意味着
    // Shadow Root 内的节点也在文档里。
    markConnected(shadow, this.isConnected);
    this.shadowRoot = shadow;
    return shadow;
  }

  querySelectorAll(selector) {
    const result = [];
    const walk = (node) => {
      for (const child of node.children) {
        // 文本节点没有 classList / tagName，不能参与选择器匹配
        if (child instanceof FakeNode && matches(child, selector)) result.push(child);
        if (Array.isArray(child.children) && child.children.length > 0) walk(child);
        if (child.shadowRoot !== null && child.shadowRoot !== undefined) walk(child.shadowRoot);
      }
    };
    walk(this);
    return result;
  }
  querySelector(selector) {
    const all = this.querySelectorAll(selector);
    return all.length > 0 ? all[0] : null;
  }
  closest(selector) {
    let node = this;
    while (node !== null && node !== undefined) {
      if (typeof node.matches === 'function' && node.matches(selector)) return node;
      node = node.parentElement;
    }
    return null;
  }
  matches(selector) { return matches(this, selector); }
}

function markConnected(node, connected) {
  node.isConnected = connected;
  for (const child of node.children) markConnected(child, connected);
  // Shadow Root 不是 children 里的一员，必须单独传播。
  // 漏掉它的后果很隐蔽：真实浏览器里挂到文档上的宿主，其 Shadow Root 内的
  // 节点 isConnected 为 true，而仿真里会一直是 false——于是任何
  // `if (!el.isConnected) return` 的防御性判断都会静默跳过后面的代码。
  if (node.shadowRoot !== null && node.shadowRoot !== undefined) {
    markConnected(node.shadowRoot, connected);
  }
}

class FakeTextNode {
  constructor(text) { this._text = text; this.children = []; this.parentElement = null; }
  get textContent() { return this._text; }
  set textContent(value) { this._text = String(value); }
}
function makeText(text) { return new FakeTextNode(text); }

class FakeShadowRoot extends FakeNode {
  constructor(host) { super('#shadow-root', HTML_NS); this.host = host; }
}

class FakeElement extends FakeNode {}

// 真实 DOM 里 el.id = x 会反射到 id 属性；仿真必须一致，
// 否则按 #id 查询（插件与测试都这么做）会查不到。
Object.defineProperty(FakeElement.prototype, 'id', {
  get() { return this.getAttribute('id') ?? ''; },
  set(value) { this.setAttribute('id', String(value)); },
  configurable: true,
});

class FakeDocument extends FakeNode {
  constructor() {
    super('#document');
    this.documentElement = new FakeElement('html', HTML_NS);
    this.head = new FakeElement('head', HTML_NS);
    this.body = new FakeElement('body', HTML_NS);
    // documentElement 必须是 document 的子节点，否则从 document 出发的
    // 查询遍历永远走不到 body（这正是 isChatPage 判否的原因）。
    this.append(this.documentElement);
    this.documentElement.append(this.head);
    this.documentElement.append(this.body);
    markConnected(this.body, true);
    this.activeElement = null;
    this.title = '';
  }
  createElement(tagName) { return new FakeElement(tagName, HTML_NS); }
  createElementNS(namespace, tagName) { return new FakeElement(tagName, namespace); }
  createTextNode(text) { return makeText(text); }

  /** 按 id 查元素（含 Shadow Root 内部）。插件用它判断样式表是否已注入。 */
  getElementById(id) {
    const all = this.querySelectorAll(`#${id}`);
    return all.length > 0 ? all[0] : null;
  }
}

/** 观察器回调改为排队执行，避免「挂载 DOM -> 又触发观察器」的同步死循环。 */
class FakeMutationObserver {
  constructor(callback) { this.callback = callback; this.observed = []; }
  observe(target, options) { this.observed.push({ target, options }); }
  disconnect() { this.observed = []; }
  fire() { this.callback([], this); }
}

// ══════════════════════════════════════════════════════════════════════════
//  环境
// ══════════════════════════════════════════════════════════════════════════

export function createEnvironment(options) {
  const opts = options || {};
  const document = new FakeDocument();

  const audioInstances = [];
  const revoked = [];
  const created = [];
  const observers = [];
  const scheduled = [];
  const observerQueue = [];
  let objectUrlSeq = 0;

  class FakeAudio extends FakeNode {
    constructor() {
      super('audio');
      this.src = '';
      this.paused = true;
      this.currentTime = 0;
      this.volume = 1;
      this.preload = '';
      this.duration = Number.NaN;
      this.playCalls = 0;
      this.pauseCalls = 0;
      this.loadCalls = 0;
      audioInstances.push(this);
    }
    play() {
      this.playCalls += 1;
      // 模拟自动播放策略：第一次被拦，用户再次点击后放行
      if (opts.blockAutoplay === true && this.autoplayBlocked !== true) {
        this.autoplayBlocked = true;
        const error = new Error('autoplay blocked');
        error.name = 'NotAllowedError';
        return Promise.reject(error);
      }
      this.paused = false;
      this.dispatch('play');
      return Promise.resolve();
    }
    pause() {
      this.pauseCalls += 1;
      if (this.paused) { this.dispatch('pause'); return; }
      this.paused = true;
      this.dispatch('pause');
    }
    // 真实浏览器里 load() 会把播放状态重置回暂停（规范如此）。
    // 补上这一条是为了让「切歌后是否还在播」这类断言真的有分辨力——
    // 漏掉它时，载荷新的 src 之后 paused 仍是 false，测试就抓不到
    // 「自动切歌后其实没播」这种 bug。
    load() { this.loadCalls += 1; this.paused = true; }
    removeAttribute(name) { if (name === 'src') this.src = ''; super.removeAttribute(name); }
    /** 让「元数据加载完成」发生，并给出时长。 */
    finishMetadata(duration) {
      this.duration = duration;
      this.dispatch('loadedmetadata');
    }
  }

  class QueuedMutationObserver {
    constructor(callback) {
      this.callback = callback;
      this.observed = [];
      this.disconnected = false;
      observers.push(this);
    }
    observe(target, config) { this.observed.push({ target, config }); this.disconnected = false; }
    disconnect() { this.observed = []; this.disconnected = true; }
  }

  const storage = new Map();
  const localStorage = {
    getItem: (key) => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => { storage.set(key, String(value)); },
    removeItem: (key) => { storage.delete(key); },
    clear: () => storage.clear(),
  };

  // 继承原生 URL：插件与测试代码都可能用 new URL(...)，
  // 所以只把 createObjectURL / revokeObjectURL 换成可观测的替身。
  const NativeURL = globalThis.URL;
  class ShimURL extends NativeURL {
    static createObjectURL(file) {
      objectUrlSeq += 1;
      const url = `blob:test/${objectUrlSeq}/${encodeURIComponent(file.name)}`;
      created.push({ url, file });
      return url;
    }
    static revokeObjectURL(url) { revoked.push(url); }
  }
  const URLShim = ShimURL;

  const history = { pushState: () => {}, replaceState: () => {} };
  const navigatorShim = { userAgent: 'pardofelis-test' };
  const windowShim = {
    localStorage,
    setTimeout: (fn) => { scheduled.push(fn); return scheduled.length; },
    clearTimeout: () => {},
    requestAnimationFrame: (fn) => { scheduled.push(fn); return scheduled.length; },
    cancelAnimationFrame: () => {},
    addEventListener: (type, handler) => document.addEventListener(type, handler),
    removeEventListener: (type, handler) => document.removeEventListener(type, handler),
    matchMedia: () => ({ matches: opts.dark === true, addEventListener: () => {}, removeEventListener: () => {} }),
    getComputedStyle: () => ({
      backgroundColor: opts.dark === true ? 'rgb(24, 24, 28)' : 'rgb(255, 255, 255)',
    }),
    history,
    navigator: navigatorShim,
    document,
  };

  /** 把所有排队的工作跑完：定时器 / rAF / 观察器回调交替执行。 */
  /**
   * 把所有排队的工作跑完。
   *
   * 必须是有上限的：插件的进度条用 requestAnimationFrame 自排队，只要音频在播
   * 就会一直排下去。真实浏览器里每帧跑一次是正常的，但仿真里"把队列清空"就成了
   * 死循环——踩过一次，表现为测试进程挂死。所以跑到上限就返回，剩下的留给下一次
   * flush；测试都是先 flush 再断言，不会因此漏掉工作。
   */
  function flush(limit) {
    const max = limit === undefined ? 600 : limit;
    let guard = 0;
    for (;;) {
      if (guard >= max) return;
      if (scheduled.length === 0 && observerQueue.length === 0) return;
      const batch = scheduled.splice(0, scheduled.length);
      for (const fn of batch) {
        fn();
        guard += 1;
        if (guard >= max) return;
      }
      if (observerQueue.length > 0) {
        const observer = observerQueue.shift();
        if (!observer.disconnected) observer.callback([], observer);
      }
      guard += 1;
    }
  }

  /** 通知所有活着的观察器：DOM 变了。 */
  function mutate() {
    for (const observer of observers) {
      if (observer.disconnected || observer.observed.length === 0) continue;
      if (!observerQueue.includes(observer)) observerQueue.push(observer);
    }
  }

  function enterChat() {
    if (document.body.querySelector('[data-composer-card]') !== null) return;
    const card = document.createElement('div');
    card.setAttribute('data-composer-card', '');
    document.body.append(card);
    mutate();
  }
  function leaveChat() {
    const card = document.body.querySelector('[data-composer-card]');
    if (card !== null) card.remove();
    mutate();
  }

  function makeFile(name, size) {
    return { name, size: size === undefined ? 4096 : size, type: 'audio/mpeg', lastModified: 1700000000000 };
  }

  // ── 把仿真对象装到宿主全局上 ───────────────────────────────────────────
  //
  //  插件代码里的 document / window / Audio / MutationObserver 等自由标识符
  //  必须解析到仿真对象。这些标识符在 apply() 之后的整个生命周期里都会被
  //  访问（观察器回调、卸载清理、rAF 循环），所以安装期必须覆盖整个测试，
  //  而不是只在执行产物那一刻。
  //
  //  多个环境可以同时存在（测试会一个接一个地起环境），因此安装/还原按
  //  【栈】语义工作：新环境叠在上一个之上，还原时回到被打断的那一层，
  //  最外层还原才恢复 Node 的真实全局。
  const scope = [
    'window', 'document', 'URL', 'Audio', 'MutationObserver', 'navigator',
    'history', 'localStorage', 'requestAnimationFrame', 'cancelAnimationFrame',
  ];
  const installStack = [];
  let installed = false;
  function install() {
    if (installed) return;
    installed = true;
    const values = {
      window: windowShim,
      document,
      URL: URLShim,
      Audio: FakeAudio,
      MutationObserver: QueuedMutationObserver,
      navigator: navigatorShim,
      history,
      localStorage,
      requestAnimationFrame: windowShim.requestAnimationFrame,
      cancelAnimationFrame: windowShim.cancelAnimationFrame,
    };
    const saved = new Map();
    for (const name of scope) {
      saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
      Object.defineProperty(globalThis, name, { value: values[name], configurable: true, writable: true });
    }
    installStack.push({ saved, values });
  }
  function restore() {
    if (!installed) return;
    installed = false;
    const top = installStack.pop();
    if (top === undefined) return;
    for (const name of scope) {
      const descriptor = top.saved.get(name);
      if (descriptor === undefined) delete globalThis[name];
      else Object.defineProperty(globalThis, name, descriptor);
    }
  }

  install();

  return {
    document, windowShim, URLShim, localStorage, storage,
    audioInstances, revoked, created, observers, history,
    flush, mutate, enterChat, leaveChat, makeFile,
    FakeAudio, QueuedMutationObserver,
    install, restore,
  };
}

// ══════════════════════════════════════════════════════════════════════════
//  载入 bundle/client.js 的模块外壳，并取出工厂函数
// ══════════════════════════════════════════════════════════════════════════

export async function loadPlugin(env, bundlePath) {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(bundlePath, 'utf8');

  const registrations = [];
  env.windowShim.__ModuleLoader__ = { load: (entry) => { registrations.push(entry); } };

  // 仿真全局由 createEnvironment 安装并一直保持；这里只执行产物本身。
  // eslint-disable-next-line no-new-func
  new Function(source)();

  const entry = registrations[0];
  if (entry === undefined) throw new Error('plugin registered no module loader entry');
  if (entry.id !== 'dsh-pardofelis-widget') throw new Error(`unexpected plugin id: ${entry.id}`);

  const ledger = [];
  const context = {
    effect: (callback, label) => {
      const dispose = callback();
      ledger.push({ label, dispose: typeof dispose === 'function' ? dispose : () => {} });
      return () => {};
    },
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  };

  // 工厂必须不依赖任何模块：插件是自包含的，没有 require。
  const exportsObject = entry.factory(() => {
    throw new Error('the widget must not require any module');
  });

  return {
    entry,
    exports: exportsObject,
    ctx: context,
    ledger,
    disposeEffects: () => { for (const item of ledger.splice(0)) item.dispose(); },
  };
}
