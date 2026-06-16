import 'reflect-metadata';

import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import helmet from 'helmet';
import { AppModule } from './app.module';
import type { EnvConfig } from './config/env.config';

const bootstrap = async (): Promise<void> => {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  const config = app.get(ConfigService<EnvConfig, true>);
  const logger = new Logger('Bootstrap');

  app.setGlobalPrefix('api/v1', {
    exclude: ['health', 'docs', 'docs-json'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.use(helmet());
  app.use(compression());

  // Socket.IO adapter — required for the NotificationsGateway (Sprint 6).
  // The IoAdapter is auto-discovered when `@nestjs/platform-socket.io` is
  // installed, but registering it explicitly removes the warning Nest logs
  // on cold boot and lets us swap to a Redis adapter later without
  // changing the module-level @WebSocketGateway() decorators.
  app.useWebSocketAdapter(new IoAdapter(app));

  const corsOriginsRaw = config.get('CORS_ORIGINS', { infer: true });
  const defaultOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    /^https:\/\/[a-z0-9-]+\.vercel\.app$/,
  ];
  const allowedOrigins = corsOriginsRaw
    ? [
        ...corsOriginsRaw.split(',').map((s: string) => s.trim()).filter(Boolean),
        ...defaultOrigins,
      ]
    : defaultOrigins;

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Accept', 'X-Requested-With'],
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Vaasenk API')
    .setDescription('Backend API for the Vaasenk classroom productivity platform.')
    .setVersion('0.1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'supabase-jwt',
    )
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  const port = config.get('PORT', { infer: true });
  await app.listen(port);
  logger.log(`Vaasenk API listening on http://localhost:${port}`);
  logger.log(`Swagger docs: http://localhost:${port}/docs`);
  logger.log(`Health check: http://localhost:${port}/health`);
};

// Fail HARD and LOUD on any boot error (e.g. PrismaService refusing to start
// when the DB is unreachable in production). We do not rely on Node's implicit
// unhandled-rejection-kills-process default — an explicit catch guarantees a
// clean exit(1) with an operator-facing message, and survives a future
// `process.on('unhandledRejection')` handler being added elsewhere.
void bootstrap().catch((err: unknown) => {
  const message = err instanceof Error ? err.stack ?? err.message : String(err);
  new Logger('Bootstrap').error(`Fatal: API failed to start.\n${message}`);
  process.exit(1);
});
