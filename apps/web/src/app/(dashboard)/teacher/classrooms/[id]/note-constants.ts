/**
 * Note constants for this folder now live in the shared lib so the student
 * feed + viewer (Sprint 2.5) can use the exact same chip styling. This
 * file is kept as a re-export to avoid churning any other co-located
 * imports that may have referenced it.
 */
export {
  NOTE_TAGS,
  NOTE_STATUSES,
  TAG_LABELS,
  TAG_CHIP_CLASSES,
  type NoteTag,
  type NoteStatus,
  type NoteView,
} from '@/lib/notes-constants';
