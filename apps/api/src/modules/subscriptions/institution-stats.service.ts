import { Injectable, NotFoundException } from '@nestjs/common';
import {
  NoteStatus,
  PaperJobStatus,
  ProcessingStatus,
  Status,
  UserRole,
  type AuditLog,
  type User,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * InstitutionStatsService — Sprint 8.1.
 *
 * Backs the admin dashboard with two aggregate endpoints:
 *   • GET /institutions/:id/stats     — 7 counts in a single transaction
 *   • GET /institutions/:id/activity  — recent AuditLog rows + summary lines
 *
 * Multi-tenant scoping (CLAUDE.md §3) is enforced at the service level by
 * filtering on `institutionId` from the JWT-trusted actor. Cross-institution
 * reads are blocked unless the actor is SUPER_ADMIN.
 */

const ACTIVITY_DEFAULT_LIMIT = 10;
const ACTIVITY_MAX_LIMIT = 50;

export interface InstitutionStats {
  totalTeachers: number;
  totalStudents: number;
  totalClassrooms: number;
  totalNotes: number;
  totalAiGenerations: number;
  totalSyllabusDocuments: number;
  totalSamplePapers: number;
}

export interface ActivityRow {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actor: {
    id: string;
    name: string;
    role: UserRole;
    email: string | null;
  } | null;
  summary: string;
  createdAt: Date;
}

@Injectable()
export class InstitutionStatsService {
  constructor(private readonly prisma: PrismaService) {}

  /* ------------------------------------------------------------------------ */
  /* Stats                                                                     */
  /* ------------------------------------------------------------------------ */

  async getStats(
    actor: User,
    institutionId: string,
  ): Promise<{ stats: InstitutionStats }> {
    this.assertCanReach(actor, institutionId);

    const [
      totalTeachers,
      totalStudents,
      totalClassrooms,
      totalNotes,
      totalAiGenerations,
      totalSyllabusDocuments,
      totalSamplePapers,
    ] = await this.prisma.$transaction([
      this.prisma.user.count({
        where: {
          institutionId,
          role: UserRole.TEACHER,
          status: Status.ACTIVE,
          deletedAt: null,
        },
      }),
      this.prisma.user.count({
        where: {
          institutionId,
          role: UserRole.STUDENT,
          status: Status.ACTIVE,
          deletedAt: null,
        },
      }),
      this.prisma.classroom.count({
        where: { institutionId, status: Status.ACTIVE },
      }),
      this.prisma.note.count({
        where: { institutionId, status: NoteStatus.PUBLISHED },
      }),
      this.prisma.questionPaperJob.count({
        where: { institutionId, status: PaperJobStatus.COMPLETED },
      }),
      this.prisma.syllabusDocument.count({
        where: { institutionId, status: ProcessingStatus.AI_READY },
      }),
      this.prisma.sampleQuestionPaper.count({
        where: { institutionId, status: ProcessingStatus.AI_READY },
      }),
    ]);

    return {
      stats: {
        totalTeachers,
        totalStudents,
        totalClassrooms,
        totalNotes,
        totalAiGenerations,
        totalSyllabusDocuments,
        totalSamplePapers,
      },
    };
  }

  /* ------------------------------------------------------------------------ */
  /* Activity                                                                  */
  /* ------------------------------------------------------------------------ */

  async getActivity(
    actor: User,
    institutionId: string,
    limit: number = ACTIVITY_DEFAULT_LIMIT,
  ): Promise<{
    data: { activities: ActivityRow[] };
    meta: { total: number };
  }> {
    this.assertCanReach(actor, institutionId);

    const effectiveLimit = Math.max(
      1,
      Math.min(limit || ACTIVITY_DEFAULT_LIMIT, ACTIVITY_MAX_LIMIT),
    );

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where: { institutionId },
        orderBy: { createdAt: 'desc' },
        take: effectiveLimit,
        include: {
          actor: {
            select: {
              id: true,
              name: true,
              role: true,
              email: true,
            },
          },
        },
      }),
      this.prisma.auditLog.count({ where: { institutionId } }),
    ]);

    return {
      data: {
        activities: rows.map((r) => this.toActivityRow(r)),
      },
      meta: { total },
    };
  }

  /* ------------------------------------------------------------------------ */
  /* Internal                                                                  */
  /* ------------------------------------------------------------------------ */

  private assertCanReach(actor: User, institutionId: string): void {
    if (actor.role === UserRole.SUPER_ADMIN) return;
    if (actor.institutionId === institutionId) return;
    throw new NotFoundException('Institution not found');
  }

  /**
   * Project an AuditLog row + (optional) actor to the wire shape.
   * Computes a human-readable summary line by switching on (entityType,
   * action). Unknown combinations fall back to a generic line. Audit
   * writes that lack an actor (worker / system) get "System" as the actor
   * label and a passive summary line.
   */
  private toActivityRow(
    row: AuditLog & {
      actor: {
        id: string;
        name: string;
        role: UserRole;
        email: string | null;
      } | null;
    },
  ): ActivityRow {
    const actorName = row.actor?.name ?? 'System';
    return {
      id: row.id,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      actor: row.actor,
      summary: this.computeSummary(row.entityType, row.action, actorName),
      createdAt: row.createdAt,
    };
  }

  /**
   * Switch on common (entityType, action) pairs to produce a friendly
   * activity feed line. New audit writes added in Sprint 8.1 (note.create,
   * user.invite, classroom.create, syllabus.create, paper.created,
   * paper.published, syllabus.replace_file, paper.exported, etc.) all map
   * here. Unknown combos fall back to "{actor} performed `{action}` on
   * `{entityType}`" — never blank.
   */
  private computeSummary(
    entityType: string,
    action: string,
    actor: string,
  ): string {
    const key = `${entityType}:${action}`;
    const m = SUMMARY_MAP[key];
    if (m) return m(actor);
    return `${actor} performed \`${action}\` on \`${entityType}\``;
  }
}

/**
 * Single-source-of-truth for the activity feed copy. Keep these short and
 * past-tense; they render as one-liners next to a timestamp.
 */
const SUMMARY_MAP: Record<string, (actor: string) => string> = {
  // Notes
  'Note:note.create': (a) => `${a} uploaded a note`,
  'Note:note.delete': (a) => `${a} archived a note`,
  'Note:note.update': (a) => `${a} updated a note`,
  // Users
  'User:user.invite': (a) => `${a} invited a teacher`,
  'User:user.create': (a) => `${a} created a student`,
  'User:user.import': (a) => `${a} imported students from CSV`,
  'User:user.deleted': (a) => `${a} removed a user`,
  'User:user.status_changed': (a) => `${a} changed a user's status`,
  // Classrooms
  'Classroom:classroom.create': (a) => `${a} created a classroom`,
  'Classroom:classroom.update': (a) => `${a} updated a classroom`,
  // Syllabus
  'SyllabusDocument:syllabus.create': (a) => `${a} uploaded a new syllabus`,
  'SyllabusDocument:syllabus.update': (a) => `${a} updated a syllabus`,
  'SyllabusDocument:syllabus.replace_file': (a) =>
    `${a} uploaded a new syllabus version`,
  'SyllabusDocument:syllabus.map_classrooms': (a) =>
    `${a} mapped a syllabus to classroom(s)`,
  'SyllabusDocument:syllabus.reprocess': (a) =>
    `${a} reprocessed a syllabus`,
  // Sample papers
  'SampleQuestionPaper:sample_paper.create': (a) =>
    `${a} uploaded a sample paper`,
  'SampleQuestionPaper:sample_paper.update': (a) =>
    `${a} updated a sample paper`,
  'SampleQuestionPaper:sample_paper.replace_file': (a) =>
    `${a} replaced a sample paper file`,
  // Question papers
  'QuestionPaper:paper.created': (a) =>
    `${a} started a question paper generation`,
  'QuestionPaper:paper.updated': (a) =>
    `${a} edited a generated question paper`,
  'QuestionPaper:paper.question_regenerated': (a) =>
    `${a} regenerated a question`,
  'QuestionPaper:paper.exported': (a) =>
    `${a} exported a question paper to PDF`,
  'QuestionPaper:paper.published': (a) =>
    `${a} published a question paper`,
  'QuestionPaper:paper.credit_exceeded': (a) =>
    `${a} hit the AI credit limit`,
  // AI chat
  'AiChatSession:chat.message_sent': (a) =>
    `${a} sent a message to the AI assistant`,
  'AiChatSession:chat.credit_exceeded': (a) =>
    `${a} hit the AI credit limit`,
  // Subscriptions
  'Subscription:subscription.create': (a) =>
    `${a} initialized the subscription`,
  'Subscription:subscription.update': (a) =>
    `${a} updated the subscription`,
};
