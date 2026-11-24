import type { Request } from 'express';

export type ClientInfo = {
  ip: string;
  userAgent: string;
  browser: string;
  os: string;
  device: string;
};

/** `::ffff:1.2.3.4` -> `1.2.3.4`；app 开启 trust proxy 时 req.ip 已经取自 X-Forwarded-For。 */
export function normalizeIp(ip: string | undefined) {
  if (!ip) return 'unknown';
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

const BROWSERS: [RegExp, string][] = [
  [/MicroMessenger/i, 'WeChat'],
  [/Edg(e|A|iOS)?\//, 'Edge'],
  [/OPR\/|Opera/, 'Opera'],
  [/SamsungBrowser/, 'Samsung'],
  [/Firefox|FxiOS/, 'Firefox'],
  [/Chrome|CriOS/, 'Chrome'],
  [/Safari/, 'Safari'],
  [/MSIE|Trident/, 'IE'],
];
const SYSTEMS: [RegExp, string][] = [
  [/Windows/, 'Windows'],
  [/iPhone|iPad|iPod/, 'iOS'],
  [/Android/, 'Android'],
  [/Mac OS X|Macintosh/, 'macOS'],
  [/HarmonyOS/, 'HarmonyOS'],
  [/CrOS/, 'ChromeOS'],
  [/Linux/, 'Linux'],
];

const match = (ua: string, rules: [RegExp, string][]) =>
  rules.find(([re]) => re.test(ua))?.[1] ?? 'Other';

/** 轻量 UA 解析（只区分常见浏览器 / 系统 / 设备类型，不引入额外依赖）。 */
export function parseUserAgent(ua: string) {
  const isBot = /bot|crawl|spider|slurp|headless|curl|wget|python-requests/i.test(ua);
  const isTablet = /iPad|Tablet/i.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua));
  const isMobile = /Mobi|iPhone|iPod|Android/i.test(ua);
  const device = isBot ? 'bot' : isTablet ? 'tablet' : isMobile ? 'mobile' : 'desktop';
  return {
    browser: ua ? match(ua, BROWSERS) : 'Other',
    os: ua ? match(ua, SYSTEMS) : 'Other',
    device,
  };
}

export function clientInfo(req: Request): ClientInfo {
  const userAgent = String(req.headers['user-agent'] ?? '').slice(0, 512);
  return { ip: normalizeIp(req.ip), userAgent, ...parseUserAgent(userAgent) };
}

/** URL -> path（解析失败时原样截断）。 */
export function toPath(url: string) {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.hash.startsWith('#/') ? parsed.hash : ''}`.slice(0, 512);
  } catch {
    return url.split('?')[0]!.slice(0, 512);
  }
}
