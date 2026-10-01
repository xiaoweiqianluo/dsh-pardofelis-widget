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

/*__RUNTIME__*/

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
