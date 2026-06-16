import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

/**
 * Standard error envelope, per CLAUDE.md §5:
 *
 *   { error: { code: string, message: string, details?: unknown } }
 *
 * - HttpException → preserves status + extracts code/message/details
 * - Anything else → 500 INTERNAL_SERVER_ERROR with a generic message
 *   (full error logged server-side; never leaked to the client)
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let code: string;
    let message: string;
    let details: unknown;

    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      code = this.codeForStatus(status);
      if (typeof response === 'string') {
        message = response;
      } else if (typeof response === 'object' && response !== null) {
        const r = response as Record<string, unknown>;
        message = (r['message'] as string | undefined) ?? exception.message;
        details = r['errors'] ?? r['details'] ?? undefined;
        if (typeof r['code'] === 'string') {
          code = r['code'];
        }
      } else {
        message = exception.message;
      }
    } else {
      code = 'INTERNAL_SERVER_ERROR';
      message = 'An unexpected error occurred.';
      this.logger.error(
        `Unhandled exception on ${req.method} ${req.url}`,
        exception instanceof Error ? exception.stack : exception,
      );
    }

    res.status(status).json({
      error: { code, message, ...(details !== undefined ? { details } : {}) },
    });
  }

  private codeForStatus(status: number): string {
    const name = HttpStatus[status];
    return typeof name === 'string' ? name : `HTTP_${status}`;
  }
}
