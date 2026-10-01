// ══════════════════════════════════════════════════════════════════════════
//  帕朵菲莉丝主题挂件 · 打包入口
//
//  把 src/client.js（模块外壳）+ src/runtime.js（全部逻辑）拼成
//  bundle/client.js，并把 assets/avatar.webp 内联成 data: URL。
//
//  为什么内联头像：挂件承诺「零网络请求」。走 HTTP 路由要注册 Host 端点，
//  内联则连一次请求都不产生，整个插件没有任何网络行为。
//
//  用法：node tools/build.mjs          写入产物
//        node tools/build.mjs --check  只比对产物是否与源一致（不写盘）
//
//  具体逻辑在 tools/build-core.mjs，verify 会直接复用同一个函数。
// ══════════════════════════════════════════════════════════════════════════

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildBundle, ROOT } from './build-core.mjs';

const checkOnly = process.argv.includes('--check');
const target = join(ROOT, 'bundle', 'client.js');

const { output, assets } = await buildBundle();
const kib = (value) => `${(value / 1024).toFixed(1)} KiB`;

if (checkOnly) {
  const current = await readFile(target, 'utf8').catch(() => null);
  if (current === output) {
    console.log('[build] up to date');
  } else {
    console.error('[build] bundle/client.js is stale; run: node tools/build.mjs');
    process.exitCode = 1;
  }
} else {
  await writeFile(target, output, 'utf8');
  console.log('[build] wrote bundle/client.js');
  for (const asset of assets) {
    console.log(`[build] inlined ${asset.name.padEnd(14)} ${kib(asset.bytes)} -> base64 ${kib(asset.urlBytes)}`);
  }
  console.log(`[build] output size: ${kib(Buffer.byteLength(output))}`);
}
