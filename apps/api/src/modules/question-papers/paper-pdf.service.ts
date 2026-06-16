/**
 * PDF rendering service — Sprint 5 PROMPT 20.
 *
 * Wraps @react-pdf/renderer behind an injectable service so the controller +
 * worker never touch the renderer directly. Returns Buffers — uploading is
 * the orchestrating service's concern.
 *
 * We use `@react-pdf/renderer`'s server-side `renderToBuffer(...)` (no Chrome
 * dependency, no Puppeteer, no headless browser). The output is identical to
 * the browser path so previews and downloads stay byte-equivalent.
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  renderToBuffer,
  type DocumentProps,
} from '@react-pdf/renderer';
import type { ReactElement } from 'react';
import { AnswerKeyTemplate } from './paper-pdf-templates/answer-key-template';
import { PaperTemplate } from './paper-pdf-templates/paper-template';
import type { PaperPdfContext, StructuredContent } from './types';

@Injectable()
export class PaperPdfService {
  private readonly logger = new Logger(PaperPdfService.name);

  /** Renders the main question paper PDF. */
  async renderPaper(ctx: PaperPdfContext): Promise<Buffer> {
    try {
      // Templates return a generic ReactElement (we constructed it via the
      // local `el()` helper that bypasses react-pdf's narrow typings — see
      // paper-template.ts). renderToBuffer expects ReactElement<DocumentProps>,
      // so cast at the boundary; runtime contract is identical.
      const element = PaperTemplate(ctx) as ReactElement<DocumentProps>;
      const stream = await renderToBuffer(element);
      return stream;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Paper PDF render failed for paper ${ctx.paper.id}: ${message}`,
        err instanceof Error ? err.stack : undefined,
      );
      throw new Error('Failed to render question paper PDF.');
    }
  }

  /**
   * Renders the answer key PDF. Returns null when no question carries an
   * `answer` value — there's nothing meaningful to render.
   */
  async renderAnswerKey(ctx: PaperPdfContext): Promise<Buffer | null> {
    if (!this.hasAnswers(ctx.paper.structuredContent)) return null;
    try {
      const element = AnswerKeyTemplate(ctx) as ReactElement<DocumentProps>;
      const stream = await renderToBuffer(element);
      return stream;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Answer key PDF render failed for paper ${ctx.paper.id}: ${message}`,
        err instanceof Error ? err.stack : undefined,
      );
      throw new Error('Failed to render answer key PDF.');
    }
  }

  private hasAnswers(content: StructuredContent): boolean {
    return content.sections.some((s) =>
      s.questions.some((q) => typeof q.answer === 'string' && q.answer.trim().length > 0),
    );
  }
}
