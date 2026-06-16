/**
 * Backfill storage usage on existing `Subscription` rows — Sprint 8.1.
 *
 * Sums `file_size_bytes` across `notes`, `syllabus_documents`, and
 * `sample_question_papers` per institution, divides by 1024^3 (rounded to
 * 2 decimals), and writes the result into `subscriptions.storage_used_gb`
 * for the institution's active subscription. Institutions without an
 * active subscription row are skipped (no storage limits applied — they're
 * implicitly unrestricted until ops issues a PATCH).
 *
 * USAGE — run manually, NOT part of migrations:
 *
 *   npx ts-node apps/api/src/scripts/backfill-storage-usage.ts
 *
 * or via the compiled build:
 *
 *   node apps/api/dist/scripts/backfill-storage-usage.js
 *
 * Idempotent — safe to re-run. Each pass overwrites `storage_used_gb` with
 * the freshly recomputed sum.
 *
 * Performance — uses Prisma's `aggregate({ _sum: ... })` so each
 * institution's pass is 3 indexed scans, not a per-row fetch. For a tenant
 * with 100k notes this is sub-second.
 */

import { PrismaClient, SubscriptionStatus } from '@prisma/client';

const prisma = new PrismaClient();

function bytesToGb(bytes: bigint | number | null | undefined): number {
  if (bytes === null || bytes === undefined) return 0;
  const n = typeof bytes === 'bigint' ? Number(bytes) : bytes;
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round((n / 1024 / 1024 / 1024) * 100) / 100;
}

async function main(): Promise<void> {
  const startedAt = Date.now();
  const institutions = await prisma.institution.findMany({
    select: { id: true, name: true },
    orderBy: { createdAt: 'asc' },
  });
  console.log(`Backfill: scanning ${institutions.length} institution(s)…`);

  let updated = 0;
  let skipped = 0;

  for (const inst of institutions) {
    // Sum file sizes across the three storage-bearing entities.
    const [notesAgg, syllabusAgg, samplePapersAgg] = await Promise.all([
      prisma.note.aggregate({
        where: { institutionId: inst.id },
        _sum: { fileSizeBytes: true },
      }),
      prisma.syllabusDocument.aggregate({
        where: { institutionId: inst.id },
        _sum: { fileSizeBytes: true },
      }),
      prisma.sampleQuestionPaper.aggregate({
        where: { institutionId: inst.id },
        _sum: { fileSizeBytes: true },
      }),
    ]);

    const totalBytes =
      Number(notesAgg._sum.fileSizeBytes ?? 0) +
      Number(syllabusAgg._sum.fileSizeBytes ?? 0) +
      Number(samplePapersAgg._sum.fileSizeBytes ?? 0);
    const gb = bytesToGb(totalBytes);

    // Find the most recent ACTIVE subscription. If none exists, skip — we
    // don't want to create rows here; that's ops policy.
    const sub = await prisma.subscription.findFirst({
      where: {
        institutionId: inst.id,
        status: SubscriptionStatus.ACTIVE,
      },
      orderBy: { startedAt: 'desc' },
      select: { id: true },
    });

    if (!sub) {
      skipped += 1;
      console.log(
        `  - ${inst.name} (${inst.id}): ${gb} GB observed, NO active subscription — skipped.`,
      );
      continue;
    }

    await prisma.subscription.update({
      where: { id: sub.id },
      data: { storageUsedGb: gb },
    });
    updated += 1;
    console.log(`  + ${inst.name} (${inst.id}): ${gb} GB → subscription ${sub.id}`);
  }

  const elapsedMs = Date.now() - startedAt;
  console.log(
    `Done. Updated ${updated} / ${institutions.length}, skipped ${skipped}, in ${elapsedMs}ms.`,
  );
}

main()
  .catch((err) => {
    console.error('Backfill failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
