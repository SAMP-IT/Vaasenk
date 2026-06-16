/**
 * Boot-behavior contract for PrismaService.
 *
 * The fail-soft-on-connect-failure decision (Session 0.3) is a deliberate DX
 * win for LOCAL DEVELOPMENT — the API boots even when Docker/Postgres isn't
 * running. But the same behavior in PRODUCTION is dangerous: a server that
 * boots against a missing/unreachable database passes a load-balancer health
 * check while failing every request, instead of refusing to start and
 * alerting. So boot must be environment-aware:
 *   - NODE_ENV=development      → fail-SOFT (warn, start anyway)
 *   - production / test / unset → fail-HARD (rethrow, refuse to start)
 *
 * Coverage:
 *   1. BRANCH tests (mocked $connect) — assert the onModuleInit if/throw logic
 *      fast and deterministically, across every env.
 *   2. REAL-connection test (no mock, unreachable DB) — proves the actual
 *      driver failure path fail-hards in production, not a fabricated error.
 *   3. INIT-PROPAGATION test — boots a real Nest app containing PrismaService
 *      and asserts `app.init()` itself REJECTS, i.e. the whole boot refuses to
 *      start (not merely that one method's promise rejects).
 */
import { Test } from '@nestjs/testing';
import { PrismaService } from '../src/prisma/prisma.service';

const UNREACHABLE_DB = 'postgresql://u:p@localhost:1/x?connect_timeout=2';

// PrismaClient's constructor needs a parseable datasource URL; the branch tests
// mock $connect so they never actually connect.
process.env.DATABASE_URL ??= UNREACHABLE_DB;
process.env.DIRECT_URL ??= UNREACHABLE_DB;

describe('PrismaService boot behavior (fail-soft dev / fail-hard prod)', () => {
  const ENV_SNAPSHOT = { ...process.env };

  afterEach(() => {
    process.env = { ...ENV_SNAPSHOT };
    jest.restoreAllMocks();
  });

  function serviceWithFailingConnect(): PrismaService {
    const svc = new PrismaService();
    jest
      .spyOn(svc, '$connect')
      .mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:1'));
    jest.spyOn(svc, '$disconnect').mockResolvedValue(undefined);
    return svc;
  }

  // --- 1. BRANCH tests (mocked) ---------------------------------------------

  it('PRODUCTION: onModuleInit THROWS when the DB connection fails (refuses to start)', async () => {
    process.env.NODE_ENV = 'production';
    const svc = serviceWithFailingConnect();
    await expect(svc.onModuleInit()).rejects.toThrow('ECONNREFUSED');
  });

  it('TEST env: onModuleInit also fails hard (non-development)', async () => {
    process.env.NODE_ENV = 'test';
    const svc = serviceWithFailingConnect();
    await expect(svc.onModuleInit()).rejects.toThrow();
  });

  it('UNSET NODE_ENV: onModuleInit fails hard (secure default)', async () => {
    delete process.env.NODE_ENV;
    const svc = serviceWithFailingConnect();
    await expect(svc.onModuleInit()).rejects.toThrow();
  });

  it('DEVELOPMENT: onModuleInit RESOLVES (fail-soft) when the DB connection fails', async () => {
    process.env.NODE_ENV = 'development';
    const svc = serviceWithFailingConnect();
    await expect(svc.onModuleInit()).resolves.toBeUndefined();
  });

  it('PRODUCTION + healthy DB: onModuleInit resolves when $connect succeeds', async () => {
    process.env.NODE_ENV = 'production';
    const svc = new PrismaService();
    jest.spyOn(svc, '$connect').mockResolvedValue(undefined);
    jest.spyOn(svc, '$disconnect').mockResolvedValue(undefined);
    await expect(svc.onModuleInit()).resolves.toBeUndefined();
  });

  // --- 2. REAL connection failure (no mock) ---------------------------------

  it('PRODUCTION (REAL connect): onModuleInit rejects with a real driver error on an unreachable DB', async () => {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = UNREACHABLE_DB;
    process.env.DIRECT_URL = UNREACHABLE_DB;
    const svc = new PrismaService();
    // NO $connect mock — exercise the genuine Prisma connection-failure path.
    await expect(svc.onModuleInit()).rejects.toThrow();
    await svc.onModuleDestroy().catch(() => undefined);
  }, 20000);

  it('DEVELOPMENT (REAL connect): onModuleInit resolves despite an unreachable DB (DX preserved)', async () => {
    process.env.NODE_ENV = 'development';
    process.env.DATABASE_URL = UNREACHABLE_DB;
    process.env.DIRECT_URL = UNREACHABLE_DB;
    const svc = new PrismaService();
    await expect(svc.onModuleInit()).resolves.toBeUndefined();
    await svc.onModuleDestroy().catch(() => undefined);
  }, 20000);

  // --- 3. INIT-PROPAGATION (the whole boot refuses to start) ----------------

  it('PRODUCTION: a Nest app.init() REJECTS when PrismaService cannot connect (boot aborts)', async () => {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = UNREACHABLE_DB;
    process.env.DIRECT_URL = UNREACHABLE_DB;
    const moduleRef = await Test.createTestingModule({
      providers: [PrismaService],
    }).compile();
    const app = moduleRef.createNestApplication();
    // Pin the rejection to the connection failure so a future provider added to
    // this module can't mask a regression with an unrelated throw.
    await expect(app.init()).rejects.toThrow(/reach database server|ECONNREFUSED/i);
    await app.close().catch(() => undefined);
  }, 20000);
});
