import { text, type NextFunction, type Request, type Response } from 'express';
import { AppException } from '../../common/http/app.exception';

const parseText = text({ type: 'text/plain', limit: '100kb' });

/**
 * navigator.sendBeacon / 跨域 fetch 为了避免 CORS 预检会用 `text/plain` 发送 JSON，
 * 这里把它解析成对象，后续照常走 DTO 校验。
 */
export function textJsonBody(req: Request, res: Response, next: NextFunction) {
  if (!req.is('text/plain')) return next();
  parseText(req, res, (error?: unknown) => {
    if (error) return next(AppException.validation({ body: ['body too large or unreadable'] }));
    if (typeof req.body === 'string') {
      try {
        req.body = JSON.parse(req.body);
      } catch {
        return next(AppException.validation({ body: ['must be valid JSON'] }));
      }
    }
    next();
  });
}
