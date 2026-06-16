import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseClient, createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import type { EnvConfig } from '../../config/env.config';

/**
 * Single source of truth for the Supabase admin client.
 *
 * Instantiated once at module init. Both the JWT auth guard and the auth
 * module's controllers/services depend on this; centralizing the
 * configuration avoids drift between "verify a token" and "create a user"
 * code paths (they MUST use the same project + service role key).
 *
 * Production note: this client uses the SERVICE ROLE KEY and can bypass RLS.
 * Never expose it to the client. Multi-tenant scoping (CLAUDE.md §3) must
 * be enforced at the service layer because RLS is bypassed here.
 */
@Injectable()
export class SupabaseService {
  private readonly logger = new Logger(SupabaseService.name);
  readonly admin: SupabaseClient;

  constructor(private readonly config: ConfigService<EnvConfig, true>) {
    const url = this.config.get('SUPABASE_URL', { infer: true });
    const serviceKey = this.config.get('SUPABASE_SERVICE_ROLE_KEY', { infer: true });
    this.admin = createClient(url, serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      // Supabase v2 bundles Realtime which requires a WebSocket on Node 20.
      // The API never opens a Realtime channel, but the SupabaseClient
      // constructor instantiates one unconditionally.
      realtime: { transport: WebSocket as unknown as never },
    });
    if (url.includes('placeholder') || url.includes('your-project')) {
      this.logger.warn(
        'Supabase config looks like a placeholder. Login/register endpoints ' +
          'will return errors until a real project is configured.',
      );
    }
  }
}
