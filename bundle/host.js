// 帕朵菲莉丝主题挂件 · Host 半边（dsh-pardofelis-widget）
//
// 这一半【故意什么都不做】。
//
// 挂件的全部行为都在浏览器里：导入本地音频（File API）、解码播放
// （HTMLAudioElement）、界面（Shadow DOM）。因此 Host 半边刻意保持为空：
//
//   · 不注册任何 HTTP 路由 —— 音频不经过 DSH 的 web server
//   · 不读写任何文件 —— 不碰 DSH_HOME，不留曲库目录
//   · 不发任何网络请求 —— 连 assets/ 都不通过路由提供（头像以 data: URL
//     内联在客户端半边里，见 tools/build.mjs）
//
// 之所以仍然提供这一半，是因为 Loader 需要一个可解析的包入口行
// （见 cordis.patch.yml）；DSH 官方的纯浏览器插件（例如
// @deepseek-ai/dsh-client-ui-attachment）同样是「Host 半边空操作 +
// Client 半边干活」的结构。

/** 无 Host 侧行为。 */
function apply() {}

export { apply };
