import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';

/**
 * Wraps every successful response in the standard envelope from
 * CLAUDE.md §5:
 *
 *   { data: T, meta?: { page, limit, total } }
 *
 * Controllers may return:
 *   • a raw value          → wrapped as `{ data: value }`
 *   • `{ data, meta }`     → passed through unchanged (list endpoints)
 *
 * Returning `undefined` or `null` from a 204-style endpoint yields
 * `{ data: null }`.
 */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, unknown> {
  intercept(
    _context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<unknown> {
    return next.handle().pipe(
      map((value) => {
        if (this.isEnvelope(value)) {
          return value;
        }
        return { data: value ?? null };
      }),
    );
  }

  /**
   * An object counts as "already enveloped" only when its shape is one of:
   *   • exactly `{ data }`                  — single-resource handler returned the envelope themselves
   *   • exactly `{ data, meta }` (meta=obj) — paginated list handler
   *
   * Anything else (e.g. `{ data, signedUrl }` from a future signed-upload
   * handler) falls through to the wrapping branch so we don't silently drop
   * sibling keys. The earlier looser heuristic ("has a `data` key") would
   * have masked these regressions.
   */
  private isEnvelope(value: unknown): value is { data: unknown; meta?: unknown } {
    if (typeof value !== 'object' || value === null) return false;
    const obj = value as Record<string, unknown>;
    if (!('data' in obj)) return false;
    const keys = Object.keys(obj);
    if (keys.length === 1) return true; // just { data }
    if (
      keys.length === 2 &&
      'meta' in obj &&
      typeof obj['meta'] === 'object' &&
      obj['meta'] !== null
    ) {
      return true; // { data, meta }
    }
    return false;
  }
}
