import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AiModule } from '@vaasenk/ai';
import IORedis from 'ioredis';
import { EnvConfig, validateEnv } from './config/env.config';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { InstitutionScopeInterceptor } from './common/interceptors/institution-scope.interceptor';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { AuditModule } from './common/audit/audit.module';
import { SupabaseModule } from './common/supabase/supabase.module';
import { AiChatModule } from './modules/ai-chat/ai-chat.module';
import { AcademicModule } from './modules/academic/academic.module';
import { AuthModule } from './modules/auth/auth.module';
import { ClassroomsModule } from './modules/classrooms/classrooms.module';
import { HealthModule } from './modules/health/health.module';
import { InstitutionsModule } from './modules/institutions/institutions.module';
import { InvitesModule } from './modules/invites/invites.module';
import { NotesModule } from './modules/notes/notes.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { QuestionPapersModule } from './modules/question-papers/question-papers.module';
import { SamplePapersModule } from './modules/sample-papers/sample-papers.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { SyllabusModule } from './modules/syllabus/syllabus.module';
import { UsersModule } from './modules/users/users.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['.env.local', '.env'],
      validate: validateEnv,
    }),
    PrismaModule,
    SupabaseModule,
    // AiModule is @Global() — registered here so OpenAIClient,
    // AnthropicClient, EmbeddingsService, VectorStoreService, RagService and
    // ChatService are injectable from any downstream module without a
    // re-import. VectorStoreService injects PrismaClient, which is aliased to
    // PrismaService inside PrismaModule above.
    AiModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvConfig, true>) => ({
        connection: new IORedis(config.get('REDIS_URL', { infer: true }), {
          maxRetriesPerRequest: null,
          enableReadyCheck: false,
          lazyConnect: true,
        }),
      }),
    }),
    HealthModule,
    // AuditModule is @Global() — Sprint 8.1. Registered FIRST among the
    // domain modules so SubscriptionsModule (which uses AuditService
    // directly) and every other module that emits audit writes can resolve
    // the provider unconditionally.
    AuditModule,
    // SubscriptionsModule is @Global() — Sprint 8.1. Owns plan limits,
    // credit guards, storage usage tracking, and the /stats + /activity
    // dashboard endpoints. Must come BEFORE any module that calls
    // `ensure*Available` or `increment*` (users, notes, syllabus,
    // sample-papers, ai-chat, question-papers).
    SubscriptionsModule,
    // NotificationsModule is @Global() — registered here so any module
    // can inject `NotificationsService` without a per-module import.
    // Must come BEFORE any module that depends on it (notes,
    // question-papers, classrooms, syllabus, ai-chat) so the provider
    // graph resolves in the right order at boot.
    NotificationsModule,
    InvitesModule,
    InstitutionsModule,
    AuthModule,
    UsersModule,
    AcademicModule,
    ClassroomsModule,
    NotesModule,
    SyllabusModule,
    SamplePapersModule,
    AiChatModule,
    QuestionPapersModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: InstitutionScopeInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseInterceptor,
    },
  ],
})
export class AppModule {}
