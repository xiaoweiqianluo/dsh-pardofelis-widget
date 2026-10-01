// ══════════════════════════════════════════════════════════════════════════
//  帕朵菲莉丝主题挂件 · 构建内核
//
//  把 src/client.js（模块外壳）+ src/runtime.js（全部逻辑）+ assets/avatar.webp
//  合成一份自包含的 bundle/client.js。
//
//  抽成模块而不是全部写在 build.mjs 里，是为了让 tools/verify.mjs 能直接调用
//  同一个函数做「产物是否与源一致」的比对，而不必再起一个子进程
//  （在受限沙箱下，子进程的管道 stdio 会被拒绝，EPERM）。
//
//  不依赖任何第三方包。
// ══════════════════════════════════════════════════════════════════════════

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const AVATAR_MARKER = '__DSH_PARDOFELIS_AVATAR__';
export const RUNTIME_SLOT = '/*__RUNTIME__*/';

/** 插件承诺零网络行为；这些名字不允许出现在可执行代码里。 */
export const NETWORK_APIS = [
  'fetch', 'XMLHttpRequest', 'WebSocket', 'sendBeacon', 'EventSource', 'navigator.connection',
];

/**
 * 屏蔽注释与字符串字面量，只保留可执行代码。
 *
 * 为什么需要它：运行时的隐私说明注释里会提到 XMLHttpRequest 这类名字。
 * 直接对全文做子串匹配会把「解释为什么不用它」误判成「用了它」。
 * 这是一个极简词法扫描，只用于消除误报，不用于解析 JavaScript。
 */
export function stripCommentsAndStrings(source) {
  let out = '';
  let i = 0;
  const n = source.length;
  const blank = (text) => { out += ' '.repeat(text.length); };

  while (i < n) {
    const ch = source[i];
    const next = source[i + 1];

    if (ch === '/' && next === '/') {
      const end = source.indexOf('\n', i);
      const stop = end === -1 ? n : end;
      blank(source.slice(i, stop));
      i = stop;
      continue;
    }
    if (ch === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end === -1 ? n : end + 2;
      blank(source.slice(i, stop));
      i = stop;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch;
      let j = i + 1;
      while (j < n) {
        if (source[j] === '\\') { j += 2; continue; }
        if (source[j] === quote) { j += 1; break; }
        j += 1;
      }
      blank(source.slice(i, j));
      i = j;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/**
 * 生成 bundle/client.js 的内容。
 * @returns {Promise<{ output: string, avatarBytes: number, avatarUrlBytes: number }>}
 */
export async function buildBundle() {
  const [shell, runtime, avatar] = await Promise.all([
    readFile(join(ROOT, 'src', 'client.js'), 'utf8'),
    readFile(join(ROOT, 'src', 'runtime.js'), 'utf8'),
    readFile(join(ROOT, 'assets', 'avatar.webp')),
  ]);

  if (!shell.includes(RUNTIME_SLOT)) {
    throw new Error(`src/client.js 缺少注入点 ${RUNTIME_SLOT}`);
  }
  if (!runtime.includes(AVATAR_MARKER)) {
    throw new Error(`src/runtime.js 缺少占位符 ${AVATAR_MARKER}`);
  }

  const avatarUrl = `data:image/webp;base64,${avatar.toString('base64')}`;
  const body = runtime.replace(AVATAR_MARKER, avatarUrl);
  const banner = [
    '// BUILD ARTIFACT - do not edit.',
    '// Source: src/client.js + src/runtime.js + assets/avatar.webp',
    '// Rebuild: node tools/build.mjs',
    '',
  ].join('\n');
  const output = banner + shell.replace(RUNTIME_SLOT, () => body);

  // 自检：注入点不得残留，且可执行代码里不得出现网络 API。
  if (output.includes(RUNTIME_SLOT)) {
    throw new Error('runtime 注入失败：注入点仍留在产物里');
  }
  if (output.includes(AVATAR_MARKER)) {
    throw new Error(`头像内联失败：${AVATAR_MARKER} 仍留在产物里`);
  }
  const code = stripCommentsAndStrings(output);
  for (const api of NETWORK_APIS) {
    if (code.includes(api)) {
      throw new Error(
        `产物使用了网络 API（${api}）；本插件必须保持离线。`
        + '若属误报，请调整 tools/build-core.mjs 里的 stripCommentsAndStrings()。',
      );
    }
  }

  return {
    output,
    avatarBytes: avatar.length,
    avatarUrlBytes: Buffer.byteLength(avatarUrl),
  };
}
