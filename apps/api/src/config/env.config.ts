import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  validateSync,
} from 'class-validator';

export enum NodeEnv {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

/**
 * Strongly typed environment configuration for the Vaasenk API.
 *
 * Validated at boot via class-validator (see {@link validateEnv}). If any
 * required variable is missing or malformed, the process exits before the
 * HTTP server starts — there is no scenario where a half-configured API
 * accepts traffic.
 *
 * Aligned with .env.example at the repo root. New env vars must be declared
 * here as well as in .env.example.
 */
export class EnvConfig {
  @IsEnum(NodeEnv)
  @IsOptional()
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  PORT: number = 4000;

  // ---- Database ---------------------------------------------------------

  @IsString()
  DATABASE_URL!: string;

  @IsString()
  DIRECT_URL!: string;

  // ---- Supabase ---------------------------------------------------------

  @IsString()
  SUPABASE_URL!: string;

  @IsString()
  SUPABASE_ANON_KEY!: string;

  @IsString()
  SUPABASE_SERVICE_ROLE_KEY!: string;

  // ---- Background jobs --------------------------------------------------

  @IsString()
  REDIS_URL!: string;

  // ---- AI providers -----------------------------------------------------

  @IsString()
  @IsOptional()
  OPENAI_API_KEY?: string;

  @IsString()
  @IsOptional()
  ANTHROPIC_API_KEY?: string;

  // ---- Mobile push (Expo) -----------------------------------------------

  /**
   * Optional. Set ONLY when the Expo project has "Enhanced security" turned
   * on (https://docs.expo.dev/push-notifications/sending-notifications/#additional-security).
   * When set, the API attaches `Authorization: Bearer <token>` to every
   * Expo Push API call. Leaving it empty is fine for dev + small-scale
   * production — the calls go through unauthenticated.
   */
  @IsString()
  @IsOptional()
  EXPO_ACCESS_TOKEN?: string;

  // ---- CORS / hosts -----------------------------------------------------

  @IsString()
  @IsOptional()
  CORS_ORIGINS?: string;

  /**
   * Public origin of the web app — used by /auth/forgot-password as the
   * password-reset redirect target. Optional; falls back to localhost:3000
   * for dev. Validated as a string at boot (URL parsing is intentionally
   * loose to keep dev "http://localhost:3000" working without scheme nags).
   */
  @IsString()
  @IsOptional()
  WEB_APP_URL?: string;
}

export function validateEnv(raw: Record<string, unknown>): EnvConfig {
  const config = plainToInstance(EnvConfig, raw, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(config, {
    skipMissingProperties: false,
    whitelist: false,
    forbidUnknownValues: false,
  });

  if (errors.length > 0) {
    const formatted = errors
      .map((e) => `  • ${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`)
      .join('\n');
    throw new Error(
      `Invalid environment configuration:\n${formatted}\n\nFix .env (see .env.example) and restart.`,
    );
  }

  return config;
}
