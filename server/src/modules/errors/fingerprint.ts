import { createHash } from 'node:crypto';

/**
 * 把同一个问题的不同发生归为一组：去掉消息里的数字、ID、引号内容、URL，
 * 再取堆栈第一帧的「文件 + 函数」（去掉行列号，避免小改动导致拆组）。
 */
export function normalizeMessage(message: string) {
  return message
    .replace(/https?:\/\/\S+/g, '<url>')
    .replace(/(["'`]).*?\1/g, '<str>')
    .replace(/\b[0-9a-f]{8,}\b/gi, '<id>')
    .replace(/\d+/g, '<n>')
    .trim()
    .slice(0, 300);
}

export function topFrame(stack: string) {
  const line = stack
    .split('\n')
    .map((l) => l.trim())
    .find((l) => /^at\s|@/.test(l));
  if (!line) return '';
  return line
    .replace(/\?[^:)\s]*/g, '')
    .replace(/:\d+(:\d+)?\)?$/, '')
    .replace(/^at\s+/, '')
    .slice(0, 300);
}

export function fingerprint(type: string, message: string, stack = '', source = '') {
  const key = [
    type,
    normalizeMessage(message),
    topFrame(stack) || source.replace(/:\d+(:\d+)?$/, ''),
  ];
  return createHash('sha1').update(key.join('|')).digest('hex');
}
