/**
 * Answer key PDF template — Sprint 5 PROMPT 20.
 *
 * Compact "answer key" sheet rendered separately from the main paper. We
 * keep this independent so a teacher can hand out the question paper alone
 * and download the key as a second file. Same visual language as the main
 * template — printable black-ink, no gradients.
 *
 * Uses `React.createElement` directly (no JSX); see `paper-template.ts` for
 * the reasoning.
 */

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from '@react-pdf/renderer';
import * as React from 'react';
import type { PaperPdfContext } from '../types';

const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 40,
    paddingHorizontal: 50,
    fontSize: 11,
    fontFamily: 'Helvetica',
    lineHeight: 1.45,
    color: '#000',
  },
  header: {
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: '#000',
  },
  institutionName: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
    marginBottom: 4,
  },
  keyTitle: {
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
    marginBottom: 6,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
    fontSize: 10,
  },
  warning: {
    marginBottom: 12,
    padding: 6,
    backgroundColor: '#F0F0F0',
    fontSize: 9.5,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  sectionHeader: {
    marginTop: 12,
    marginBottom: 6,
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
  },
  answerRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  qNumber: {
    width: 28,
    fontFamily: 'Helvetica-Bold',
  },
  answerText: {
    flexGrow: 1,
    flexShrink: 1,
  },
  footer: {
    position: 'absolute',
    bottom: 18,
    left: 50,
    right: 50,
    fontSize: 8.5,
    color: '#555',
    textAlign: 'center',
    borderTopWidth: 0.5,
    borderTopStyle: 'solid',
    borderTopColor: '#999',
    paddingTop: 6,
  },
  pageNumber: {
    position: 'absolute',
    bottom: 18,
    right: 50,
    fontSize: 8.5,
    color: '#555',
  },
});

function el(
  type: React.ElementType,
  props: Record<string, unknown> & { key?: string | number } = {},
  ...children: React.ReactNode[]
): React.ReactElement {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return React.createElement(type as any, props as any, ...children);
}

export function AnswerKeyTemplate(ctx: PaperPdfContext): React.ReactElement {
  const { paper, classroom, institution, source } = ctx;

  const footerText =
    `Vaasenk Answer Key · Syllabus: "${source.syllabusName}" v${source.syllabusVersion} · ` +
    `Confidential — Teacher use only`;

  const pageNumberRenderer = (info: {
    pageNumber: number;
    totalPages: number;
  }): string => `Page ${info.pageNumber} of ${info.totalPages}`;

  return el(
    Document,
    {},
    el(
      Page,
      { size: 'A4', style: styles.page },
      el(
        View,
        { style: styles.header, fixed: true },
        el(Text, { style: styles.institutionName }, institution.name),
        el(Text, { style: styles.keyTitle }, `${paper.title} — Answer Key`),
        el(
          View,
          { style: styles.metaRow },
          el(
            Text,
            {},
            `Class: ${classroom.className}${classroom.sectionName ? ' — ' + classroom.sectionName : ''}`,
          ),
          el(Text, {}, `Subject: ${classroom.subjectName}`),
          el(Text, {}, `Max Marks: ${paper.totalMarks}`),
        ),
      ),
      el(
        Text,
        { style: styles.warning },
        'For teacher reference only. AI-generated — verify before distribution.',
      ),
      ...paper.structuredContent.sections.map((section, sIdx) =>
        el(
          View,
          { key: `s-${sIdx}`, wrap: true },
          el(Text, { style: styles.sectionHeader }, section.name),
          ...section.questions.map((q, qIdx) =>
            el(
              View,
              { key: `s-${sIdx}-q-${qIdx}`, style: styles.answerRow, wrap: false },
              el(Text, { style: styles.qNumber }, `${qIdx + 1}.`),
              el(
                Text,
                { style: styles.answerText },
                q.answer && q.answer.trim().length > 0
                  ? q.answer
                  : '(no answer recorded)',
              ),
            ),
          ),
        ),
      ),
      el(Text, { style: styles.footer, fixed: true }, footerText),
      el(Text, { style: styles.pageNumber, render: pageNumberRenderer, fixed: true }),
    ),
  );
}
