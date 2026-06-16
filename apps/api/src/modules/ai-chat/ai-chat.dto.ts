import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * AI Chat DTOs — Sprint 4 PROMPT 18.
 *
 * Multi-tenant scope is derived from the JWT (CLAUDE.md §3 rule 4); these
 * DTOs never accept `institutionId`. Free text fields carry explicit
 * `@MaxLength` to bound DoS / prompt-injection blast radius (skill §4).
 */

/* -------------------------------------------------------------------------- */
/* POST /classrooms/:id/ai/sessions                                           */
/* -------------------------------------------------------------------------- */

export class CreateChatSessionDto {
  /**
   * Optional session title. If omitted, the service auto-generates one of
   * the form "Chat — {timestamp}" so the sidebar still has something to
   * render.
   */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;
}

/* -------------------------------------------------------------------------- */
/* GET /classrooms/:id/ai/sessions                                            */
/* -------------------------------------------------------------------------- */

export class ListChatSessionsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

/* -------------------------------------------------------------------------- */
/* POST /classrooms/:id/ai/sessions/:sessionId/chat                           */
/* -------------------------------------------------------------------------- */

/**
 * User message body. Capped at 4000 chars (≈ 1000 tokens) so:
 *   1. A single user message can't blow the model's context window.
 *   2. Prompt-injection payloads have an upper bound.
 *   3. Pricing per message is predictable for credit checks.
 */
export class SendChatMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  content!: string;
}
