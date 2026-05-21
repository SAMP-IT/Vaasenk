export const institution = {
  name: "Bharathi Vidyalaya",
  type: "School (CBSE)",
  city: "Coimbatore",
};

export const adminUser = {
  name: "Priya Ramanathan",
  email: "priya@bharathividyalaya.in",
  role: "admin" as const,
};

export const teacherUser = {
  name: "Arun Subramanian",
  email: "arun.s@bharathividyalaya.in",
  role: "teacher" as const,
  subjects: ["Physics", "Mathematics"],
};

export const classrooms = [
  {
    id: "c-10a-phy",
    name: "Class 10-A",
    subject: "Physics",
    section: "A",
    teacher: "Arun Subramanian",
    students: 32,
    botStatus: "ai_ready" as const,
    syllabus: "CBSE Physics 2025-26 v2",
    accent: "red" as const,
    inviteCode: "10APHY",
    lastActivity: "12 min ago",
    todayUploads: 3,
  },
  {
    id: "c-10b-phy",
    name: "Class 10-B",
    subject: "Physics",
    section: "B",
    teacher: "Arun Subramanian",
    students: 28,
    botStatus: "indexing" as const,
    syllabus: "CBSE Physics 2025-26 v2",
    accent: "gold" as const,
    inviteCode: "10BPHY",
    lastActivity: "2 hr ago",
    todayUploads: 1,
  },
  {
    id: "c-12a-math",
    name: "Class 12-A",
    subject: "Mathematics",
    section: "A",
    teacher: "Arun Subramanian",
    students: 38,
    botStatus: "ai_ready" as const,
    syllabus: "CBSE Maths Class 12 v1",
    accent: "coral" as const,
    inviteCode: "12AMTH",
    lastActivity: "Yesterday",
    todayUploads: 0,
  },
  {
    id: "c-9c-phy",
    name: "Class 9-C",
    subject: "Physics",
    section: "C",
    teacher: "Arun Subramanian",
    students: 30,
    botStatus: "setup_pending" as const,
    syllabus: "—",
    accent: "orange" as const,
    inviteCode: "09CPHY",
    lastActivity: "5 days ago",
    todayUploads: 0,
  },
];

export const recentNotes = [
  { id: "n1", title: "Light — Reflection on Curved Mirrors", classroom: "Class 10-A Physics", tag: "Important", uploadedAt: "32 min ago", thumb: "📐" },
  { id: "n2", title: "Vector Algebra — Cross Product Worked Examples", classroom: "Class 12-A Maths", tag: "Revision", uploadedAt: "2 hr ago", thumb: "✏️" },
  { id: "n3", title: "Numericals on Mirror Formula", classroom: "Class 10-A Physics", tag: "Homework", uploadedAt: "Yesterday", thumb: "🧮" },
  { id: "n4", title: "Differential Equations — Order & Degree", classroom: "Class 12-A Maths", tag: "Formula", uploadedAt: "2 days ago", thumb: "∫" },
];

export const adminAlerts = [
  { id: "a1", kind: "warning" as const, title: "Class 9-C Physics has no syllabus mapped", body: "AI assistant will stay offline until you map a syllabus." },
  { id: "a2", kind: "info" as const, title: "3 new teacher invites are pending acceptance", body: "Sent 4 days ago. You can resend or revoke." },
];

export const setupChecklist = [
  { label: "Institution profile", done: true },
  { label: "Academic year 2025-26", done: true },
  { label: "Classes & sections", done: true },
  { label: "Subjects mapped", done: true },
  { label: "Teachers invited", done: true },
  { label: "First syllabus uploaded", done: false },
];

export const aiKnowledgeSnapshot = {
  syllabusDocs: { total: 12, aiReady: 9, processing: 2, failed: 1 },
  samplePapers: { total: 28, aiReady: 24, processing: 3, failed: 1 },
};

export const recentActivity = [
  { actor: "Arun Subramanian", action: "uploaded note", subject: "Light — Reflection on Curved Mirrors", time: "32 min ago" },
  { actor: "Vidya Lakshmi", action: "joined classroom", subject: "Class 10-A Physics", time: "1 hr ago" },
  { actor: "AI Engine", action: "marked syllabus AI-Ready", subject: "CBSE Physics 2025-26 v2", time: "3 hr ago" },
  { actor: "Priya Ramanathan", action: "invited teacher", subject: "Meera Krishnan", time: "5 hr ago" },
  { actor: "Arun Subramanian", action: "generated paper", subject: "Mid-Term Physics, Class 10-A", time: "Yesterday" },
];

export const promptChips = [
  "Important questions from chapter 10",
  "Make me a 35-min lesson plan for Reflection of Light",
  "Summarise 'Mirror formula' in 200 words",
  "Create a quick 5-question quiz on curved mirrors",
];

export const chatHistory = [
  {
    role: "assistant" as const,
    content:
      "Hello Arun. I'm grounded in the CBSE Physics 2025-26 v2 syllabus and 4 sample papers mapped to Class 10-A. Ask me about any chapter — I'll cite the page I'm pulling from.",
    citations: [],
    timestamp: "Just now",
  },
];

export const chatSessions = [
  { id: "s1", title: "Lesson plan — Reflection of Light", time: "2 min ago", msgCount: 4 },
  { id: "s2", title: "Quiz on numericals", time: "Yesterday", msgCount: 12 },
  { id: "s3", title: "Important questions Ch.9", time: "3 days ago", msgCount: 8 },
  { id: "s4", title: "Simplify mirror formula", time: "Last week", msgCount: 6 },
];

export const sampleAssistantReply = {
  role: "assistant" as const,
  content:
    "Here are 6 board-pattern important questions from **Chapter 10 — Light: Reflection and Refraction**, weighted by frequency in the last 5 years of CBSE Class 10 papers.\n\n1. State the laws of reflection of light. Show that the angle of incidence equals the angle of reflection using a labelled diagram. *(3 marks — appeared 3 times)*\n2. A concave mirror produces a three-times magnified real image of an object placed 10 cm in front of it. Find the position of the image. *(3 marks — numerical)*\n3. Differentiate between real and virtual images with 2 examples each. *(2 marks)*\n4. Define the principal focus of a concave mirror. Draw the ray diagram for an object placed beyond the centre of curvature. *(3 marks)*\n5. The refractive index of water with respect to air is 4/3 and of glass with respect to air is 3/2. Find the refractive index of glass with respect to water. *(3 marks — numerical)*\n6. Why does a stick partially immersed in water appear to be bent at the surface? Explain with a ray diagram. *(2 marks)*\n\nWant me to convert these into a formatted question paper, or build a worksheet with answer key?",
  citations: [
    { doc: "CBSE Physics 2025-26 v2", page: 162, snippet: "10.1 Reflection of Light. Light travels in straight lines…" },
    { doc: "CBSE Physics 2025-26 v2", page: 168, snippet: "10.2.4 Mirror Formula and Magnification…" },
    { doc: "Sample Paper — Mid-Term 2024", page: 3, snippet: "Q.14 A concave mirror produces…" },
  ],
  timestamp: "3 sec",
  groundedness: "in_syllabus" as const,
};
