import Link from "next/link";
import {
  Avatar,
  Button,
  Chip,
  GlassCard,
  HeroCard,
  SectionHeader,
  StatusBadge,
} from "@/components/primitives";
import { Shell } from "@/components/shell";
import {
  IconArrowRight,
  IconArrowUpRight,
  IconBolt,
  IconChat,
  IconCopy,
  IconDoc,
  IconRobot,
  IconSparkle,
  IconUpload,
} from "@/components/icons";
import { classrooms, institution, recentNotes, teacherUser } from "@/lib/mock";

export default function TeacherDashboard() {
  return (
    <Shell role="teacher" userName={teacherUser.name} institutionName={institution.name}>
      <GreetingHero />
      <MyClassrooms />
      <QuickActions />
      <RecentUploads />
    </Shell>
  );
}

/* -------------------------------------------------------------------------- */

function GreetingHero() {
  return (
    <HeroCard className="vaasenk-rise p-7 md:p-10">
      <div className="relative z-10 grid items-start gap-8 md:grid-cols-[1.4fr_1fr]">
        <div>
          <span className="inline-flex items-center gap-2 rounded-vaasenk-full bg-white/15 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white/85 backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-vaasenk-gold vaasenk-pulse-dot" />
            Thursday · 21 May 2026 · 09:14
          </span>
          <h1 className="vaasenk-display mt-5 text-[clamp(34px,5vw,56px)] font-black leading-[1.02] text-white">
            Good morning, <em>Arun.</em>
          </h1>
          <p className="mt-4 max-w-xl text-[15.5px] leading-relaxed text-white/85">
            One paper draft is waiting for your review — <strong>Mid-Term Physics, Class 10-A</strong> finished generating
            at 06:42 with 24 questions across 4 sections.
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link href="/teacher/ai">
              <Button variant="gold" size="lg" trailingIcon={<IconArrowRight />}>
                Open paper draft
              </Button>
            </Link>
            <Link href="/teacher/upload">
              <Button variant="secondary" size="lg" leadingIcon={<IconUpload width={16} height={16} />}>
                Upload a note
              </Button>
            </Link>
          </div>
        </div>

        <GlassCard className="border-white/30 bg-white/12 p-6 text-white">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-vaasenk-gold">
              Today at a glance
            </span>
            <IconSparkle width={16} height={16} />
          </div>
          <ul className="mt-5 space-y-3.5 text-[13.5px]">
            <li className="flex items-start gap-3">
              <span className="mt-1 flex h-2 w-2 flex-shrink-0 rounded-full bg-vaasenk-gold" />
              <span><strong>4 notes</strong> uploaded by you this week</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-1 flex h-2 w-2 flex-shrink-0 rounded-full bg-white" />
              <span><strong>12 AI prompts</strong> across 3 sessions</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-1 flex h-2 w-2 flex-shrink-0 rounded-full bg-vaasenk-coral-pink" />
              <span><strong>1 student doubt</strong> awaits your reply — <em>Vidya, on numerical</em></span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-1 flex h-2 w-2 flex-shrink-0 rounded-full bg-white/60" />
              <span>Class 10-B Physics — syllabus still indexing (4 min left)</span>
            </li>
          </ul>
        </GlassCard>
      </div>
    </HeroCard>
  );
}

/* -------------------------------------------------------------------------- */

function MyClassrooms() {
  return (
    <section className="vaasenk-rise vaasenk-rise-delay-1 flex flex-col gap-5">
      <SectionHeader
        eyebrow="My classrooms"
        title="Four active rooms this term."
        description="Bot status, last activity, and today’s uploads at a glance."
        action={
          <Link href="/teacher/classrooms">
            <Button variant="ghost" trailingIcon={<IconArrowUpRight width={14} height={14} />}>
              See all
            </Button>
          </Link>
        }
      />
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {classrooms.map((c) => (
          <ClassroomCard key={c.id} c={c} />
        ))}
      </div>
    </section>
  );
}

function ClassroomCard({ c }: { c: (typeof classrooms)[number] }) {
  const accentGradient = {
    red: "linear-gradient(90deg,#A00000,#FF7A18)",
    gold: "linear-gradient(90deg,#FECA02,#FF7A18)",
    coral: "linear-gradient(90deg,#FF5C8A,#FECA02)",
    orange: "linear-gradient(90deg,#FF7A18,#FECA02)",
  }[c.accent];

  return (
    <GlassCard interactive className="group flex flex-col">
      <div className="h-1.5 w-full" style={{ background: accentGradient }} />
      <div className="flex flex-1 flex-col gap-4 p-5">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-[18px] font-extrabold tracking-tight text-vaasenk-deep-maroon">
              {c.name}
            </h3>
            <p className="text-[12.5px] font-bold uppercase tracking-wider text-vaasenk-muted">
              {c.subject}
            </p>
          </div>
          <StatusBadge status={c.botStatus} />
        </div>

        <div className="grid grid-cols-2 gap-3 text-[12.5px] text-vaasenk-muted">
          <div>
            <p className="font-bold uppercase tracking-wider text-vaasenk-subtle text-[10.5px]">Students</p>
            <p className="mt-0.5 text-[16px] font-extrabold text-vaasenk-deep-maroon">{c.students}</p>
          </div>
          <div>
            <p className="font-bold uppercase tracking-wider text-vaasenk-subtle text-[10.5px]">Today</p>
            <p className="mt-0.5 text-[16px] font-extrabold text-vaasenk-deep-maroon">{c.todayUploads} uploads</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-vaasenk-red/8 pt-3">
          <span className="inline-flex items-center gap-1.5 rounded-vaasenk-full bg-white/65 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-vaasenk-deep-maroon">
            <IconCopy width={11} height={11} />
            {c.inviteCode}
          </span>
          <span className="text-[11.5px] text-vaasenk-muted">· {c.lastActivity}</span>
          <Link
            href="/teacher/ai"
            className="ml-auto inline-flex items-center gap-1 text-[12px] font-extrabold text-vaasenk-red"
          >
            Open <IconArrowUpRight width={12} height={12} />
          </Link>
        </div>
      </div>
    </GlassCard>
  );
}

/* -------------------------------------------------------------------------- */

function QuickActions() {
  const actions = [
    {
      title: "Upload a note",
      copy: "Photograph or drop a PDF. We&apos;ll OCR, thumbnail, and notify your students.",
      icon: <IconUpload width={22} height={22} />,
      tone: "linear-gradient(135deg,#A00000,#FF7A18 90%)",
      href: "/teacher/upload",
      footer: "Drag-drop or browse",
    },
    {
      title: "Generate question paper",
      copy: "Six-step wizard. Pulls from your mapped syllabus + sample papers. Editable result.",
      icon: <IconBolt width={22} height={22} />,
      tone: "linear-gradient(135deg,#FECA02,#FF7A18 85%)",
      href: "/teacher/ai",
      footer: "Differentiator · MVP",
    },
    {
      title: "Ask your AI assistant",
      copy: "Grounded chat. Page-level citations. Refuses out-of-syllabus politely.",
      icon: <IconRobot width={22} height={22} />,
      tone: "linear-gradient(135deg,#4A0508,#A00000 70%)",
      href: "/teacher/ai",
      footer: "Class 10-A · Ready",
    },
  ];

  return (
    <section className="vaasenk-rise vaasenk-rise-delay-2 grid gap-5 md:grid-cols-3">
      {actions.map((a) => (
        <Link key={a.title} href={a.href} className="group block">
          <article
            className="relative h-full overflow-hidden rounded-vaasenk-2xl p-6 text-white shadow-[var(--shadow-card-soft)] transition-all duration-200 group-hover:-translate-y-1 group-hover:shadow-[var(--shadow-card-float)]"
            style={{ background: a.tone }}
          >
            <span aria-hidden className="vaasenk-orbit" style={{ width: 180, height: 180, top: -60, right: -50, opacity: 0.5 }} />

            <div className="relative z-10 flex h-full flex-col">
              <div className="flex h-12 w-12 items-center justify-center rounded-vaasenk-md bg-white/20 backdrop-blur">
                {a.icon}
              </div>
              <h3 className="vaasenk-display mt-6 text-[24px] font-black leading-tight">{a.title}</h3>
              <p className="mt-3 text-[13.5px] leading-relaxed text-white/85">{a.copy}</p>
              <div className="mt-auto flex items-center justify-between pt-6">
                <span className="text-[11px] font-bold uppercase tracking-wider text-white/75">{a.footer}</span>
                <span className="flex h-8 w-8 items-center justify-center rounded-vaasenk-full bg-white/20 transition-transform duration-200 group-hover:translate-x-1">
                  <IconArrowRight width={16} height={16} />
                </span>
              </div>
            </div>
          </article>
        </Link>
      ))}
    </section>
  );
}

/* -------------------------------------------------------------------------- */

function RecentUploads() {
  return (
    <section className="vaasenk-rise vaasenk-rise-delay-3 flex flex-col gap-5">
      <SectionHeader
        eyebrow="Recent activity"
        title="Your last 4 uploads."
        description="A teaching journal that builds itself."
      />
      <GlassCard className="p-2">
        <ul className="divide-y divide-vaasenk-red/8">
          {recentNotes.map((n) => (
            <li key={n.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-4 px-4 py-4 transition-colors hover:bg-white/60">
              <span className="flex h-12 w-12 items-center justify-center rounded-vaasenk-md bg-vaasenk-warm-canvas text-[22px]">
                {n.thumb}
              </span>
              <div className="min-w-0">
                <p className="truncate text-[15px] font-bold text-vaasenk-deep-maroon">{n.title}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px] text-vaasenk-muted">
                  <span>{n.classroom}</span>
                  <span>·</span>
                  <Chip tone={n.tag === "Important" ? "gold" : "default"} className="h-6 px-2 text-[11px]">{n.tag}</Chip>
                  <span>· {n.uploadedAt}</span>
                </div>
              </div>
              <Link
                href="#"
                className="inline-flex items-center gap-1 text-[12.5px] font-bold text-vaasenk-red"
              >
                Open <IconArrowUpRight width={12} height={12} />
              </Link>
            </li>
          ))}
        </ul>
      </GlassCard>
    </section>
  );
}
