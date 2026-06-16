import type { Citation, RagChunk } from '../types';

/**
 * Builds the system prompt for the teacher chatbot (Sprint 4 PROMPT 18).
 *
 * The prompt is the same one specified in the Sprint 4 prompts spec:
 *
 *   You are Vaasenk AI, a teaching assistant for {subject} in {class}. You
 *   answer using ONLY the mapped syllabus and sample papers. Always cite
 *   chapter/topic when referencing syllabus content. If asked something
 *   outside the syllabus, say: "I could not find this in the mapped
 *   syllabus. Please verify from other sources." Never fabricate page
 *   numbers or references.
 *
 * Retrieved chunks are appended as numbered `[n]` citations the model can
 * reference inline. Sprint 5 will extend this with sample-paper chunks.
 */
export function buildTeacherAssistantSystemPrompt(params: {
  subject: string;
  className: string;
  chunks: RagChunk[];
}): string {
  const { subject, className, chunks } = params;

  const header =
    `You are Vaasenk AI, a teaching assistant for ${subject} in ${className}. ` +
    `You answer using ONLY the mapped syllabus and sample papers. ` +
    `Always cite chapter/topic when referencing syllabus content. ` +
    `If asked something outside the syllabus, say: ` +
    `"I could not find this in the mapped syllabus. Please verify from other sources." ` +
    `Never fabricate page numbers or references.`;

  if (chunks.length === 0) {
    return (
      `${header}\n\n` +
      `No relevant syllabus context was retrieved for this query. ` +
      `Politely tell the teacher the topic was not found in the mapped syllabus.`
    );
  }

  const contextLines = chunks.map((chunk, idx) => {
    const n = idx + 1;
    const ref = formatCitation(chunk.citation);
    return `[${n}] ${ref}\n${chunk.content}`;
  });

  return (
    `${header}\n\n` +
    `When you reference syllabus content, cite the matching source by its bracketed number (e.g., [1], [2]).\n\n` +
    `--- BEGIN SYLLABUS CONTEXT ---\n` +
    contextLines.join('\n\n') +
    `\n--- END SYLLABUS CONTEXT ---`
  );
}

function formatCitation(citation: Citation): string {
  const parts: string[] = [`Syllabus "${citation.syllabusName}" (${citation.syllabusVersion})`];
  if (citation.chapter) parts.push(`Chapter: "${citation.chapter}"`);
  if (citation.topic) parts.push(`Topic: "${citation.topic}"`);
  if (citation.pageNumber !== null && citation.pageNumber !== undefined) {
    parts.push(`Page: ${citation.pageNumber}`);
  }
  return parts.join(' — ');
}

/**
 * Extracts the set of `[n]` references the model emitted in `text` and maps
 * them to citation payloads via the source `chunks` list (1-indexed).
 *
 * Duplicates are de-duplicated by syllabusId+chapter+topic+page so a chatty
 * model that cites [1] five times only produces one Citation row.
 */
export function extractCitations(
  text: string,
  chunks: RagChunk[],
): Citation[] {
  if (chunks.length === 0) return [];
  const matches = text.matchAll(/\[(\d{1,3})\]/g);
  const seen = new Set<string>();
  const citations: Citation[] = [];
  for (const m of matches) {
    const indexText = m[1];
    if (indexText === undefined) continue;
    const n = parseInt(indexText, 10);
    if (!Number.isFinite(n) || n < 1 || n > chunks.length) continue;
    const chunk = chunks[n - 1];
    if (!chunk) continue;
    const key =
      `${chunk.citation.syllabusId}::${chunk.citation.chapter ?? ''}::` +
      `${chunk.citation.topic ?? ''}::${chunk.citation.pageNumber ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    citations.push(chunk.citation);
  }
  return citations;
}
