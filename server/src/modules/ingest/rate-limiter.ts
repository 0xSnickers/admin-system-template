/** 固定窗口限流（单实例内存版）。多实例部署时换成网关限流或 Redis。 */
export class RateLimiter {
  private window = 0;
  private counts = new Map<string, number>();

  constructor(
    private readonly limit: number,
    private readonly windowMs = 60_000,
  ) {}

  /** 返回 false 表示超出限制。 */
  hit(key: string, now = Date.now()) {
    const window = Math.floor(now / this.windowMs);
    if (window !== this.window) {
      this.window = window;
      this.counts.clear();
    }
    const count = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, count);
    return count <= this.limit;
  }
}
