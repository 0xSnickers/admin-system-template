import { ParseUUIDPipe, ValidationError, ValidationPipe } from '@nestjs/common';
import { AppException } from './app.exception';

/** 嵌套对象 / 数组的错误展开成 `events.0.type` 形式的字段名。 */
function flatten(errors: ValidationError[], prefix = ''): Record<string, string[]> {
  return Object.assign(
    {},
    ...errors.map((e) => {
      const key = `${prefix}${e.property}`;
      const own = e.constraints ? { [key]: Object.values(e.constraints) } : {};
      return { ...own, ...flatten(e.children ?? [], `${key}.`) };
    }),
  );
}

/** Global DTO validation; failures become VALIDATION_ERROR with per-field details. */
export const validationPipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  exceptionFactory: (errors) => AppException.validation(flatten(errors)),
});

/** `@Param('id', UuidPipe)` */
export const UuidPipe = new ParseUUIDPipe({
  exceptionFactory: () => AppException.validation({ id: ['must be a valid UUID'] }),
});
