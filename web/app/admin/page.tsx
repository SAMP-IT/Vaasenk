import Link from "next/link";
import {
  Button,
  Chip,
  GlassCard,
  HeroCard,
  SectionHeader,
  StatTile,
  StatusBadge,
} from "@/components/primitives";
import { Shell } from "@/components/shell";
import {
  IconArrowRight,
  IconArrowUpRight,
  IconCheck,
  IconClassroom,
  IconDoc,
  IconRobot,
  IconSparkle,
  IconUsers,
} from "@/components/icons";
import {
  adminAlerts,
  adminUser,
  aiKnowledgeSnapshot,
  institution,
  recentActivity,
  setupChecklist,
} from "@/lib/mock";

export default function AdminDashboard() {
  return (
    <Shell role="admin" userName={adminUser.name} institutionName={institution.name}>
      <Alerts />
      <Greeting />
      <Stats />
      <SetupAndAI />
      <Activity />
    </Shell>
  );
}

/* -------------------------------------------------------------------------- */

function Alerts() {
  return (
    <div className="vaasenk-rise flex flex-col gap-2">
      {adminAlerts.map((a) => (
        <div
          key={a.id}
          className={`flex items-start gap-3 rounded-vaasenk-2xl border px-5 py-3 backdrop-blur-xl shadow-[var(--shadow-card-soft)] ${a.kind === "warning" ? "border-vaasenk-warning/40 bg-vaasenk-warning/12" : "border-vaasenk-info/25 bg-vaasenk-info/8"}`}
        >
          <span className={`mt-1 h-2 w-2 flex-shrink-0 rounded-full ${a.kind === "warning" ? "bg-vaasenk-warning" : "bg-vaasenk-info"}`} />
          <div className="flex-1">
            <p className="text-[14px] font-bold text-vaasenk-deep-maroon">{a.title}</p>
            <p className="text-[12.5px] text-vaasenk-muted">{a.body}</p>
          </div>
          <Button variant="ghost" size="sm" trailingIcon={<IconArrowUpRight width={12} height={12} />}>
            Resolve
          </Button>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function Greeting() {
  return (
    <HeroCard className="vaasenk-rise p-8 md:p-10">
      <div className="relative z-10 grid items-end gap-8 md:grid-cols-[1.4fr_1fr]">
        <div>
          <span className="inline-flex items-center gap-2 rounded-vaasenk-full bg-white/15 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-white/85 backdrop-blur">
            Admin console · {institution.name}
          </span>
          <h1 className="vaasenk-display mt-5 text-[clamp(34px,5vw,52px)] font-black leading-[1.02] text-white">
            Good morning, <em>Priya.</em>
          </h1>
          <p className="mt-4 max-w-xl text-[15.5px] leading-relaxed text-white/85">
            Your institution&apos;s AI knowledge base is <strong className="text-vaasenk-gold">82% ready</strong>.
            Map a syllabus to <strong>Class 9-C Physics</strong> to bring its assistant online before tomorrow&apos;s class.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="#"><Button variant="gold" trailingIcon={<IconArrowRight />}>Resolve setup gaps</Button></Link>
            <Link href="#"><Button variant="secondary" trailingIcon={<IconArrowUpRight width={14} height={14} />}>View AI usage</Button></Link>
          </div>
        </div>

        <GlassCard className="border-white/30 bg-white/12 p-6 text-white">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-vaasenk-gold">Setup checklist</span>
            <span className="text-[12px] font-extrabold">5 / 6</span>
          </div>
          <ul className="mt-4 flex flex-col gap-2.5 text-[13.5px]">
            {setupChecklist.map((s) => (
              <li key={s.label} className="flex items-center gap-3">
                <span
                  className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold ${s.done ? "bg-vaasenk-gold text-vaasenk-deep-maroon" : "border border-white/40 text-white/60"}`}
                >
                  {s.done ? <IconCheck width={12} height={12} /> : "·"}
                </span>
                <span className={s.done ? "text-white/65 line-through" : "font-bold"}>{s.label}</span>
              </li>
            ))}
          </ul>
        </GlassCard>
      </div>
    </HeroCard>
  );
}

/* -------------------------------------------------------------------------- */

function Stats() {
  return (
    <section className="vaasenk-rise vaasenk-rise-delay-1 grid gap-5 md:grid-cols-4">
      <StatTile
        label="Classrooms"
        value={24}
        delta="3 new this week"
        icon={<IconClassroom />}
      />
      <StatTile
        label="Teachers"
        value={32}
        hint="28 active this week"
        icon={<IconUsers />}
        tone="gold"
      />
      <StatTile
        label="Students"
        value={742}
        delta="46 joined this week"
        icon={<IconUsers />}
      />
      <StatTile
        label="AI Jobs"
        value="148"
        hint="2 failed · 1 needs attention"
        icon={<IconRobot />}
        tone="danger"
      />
    </section>
  );
}

/* -------------------------------------------------------------------------- */

function SetupAndAI() {
  return (
    <section className="vaasenk-rise vaasenk-rise-delay-2 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
      <GlassCard className="p-6">
        <SectionHeader
          eyebrow="AI knowledge base"
          title="Where your assistants get their answers."
          description="Status snapshot across syllabus and sample papers."
        />
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <AIBucket label="Syllabus documents" data={aiKnowledgeSnapshot.syllabusDocs} />
          <AIBucket label="Sample papers" data={aiKnowledgeSnapshot.samplePapers} />
        </div>
        <div className="mt-6 flex items-center justify-between rounded-vaasenk-lg bg-vaasenk-warm-canvas/60 p-4">
          <p className="text-[13px] text-vaasenk-deep-maroon">
            <strong className="font-extrabold">2 jobs in flight</strong> · ETA &lt; 5 min · <em>0 failed in last 24h</em>
          </p>
          <Link href="#"><Button variant="secondary" size="sm" trailingIcon={<IconArrowUpRight width={12} height={12} />}>Open monitor</Button></Link>
        </div>
      </GlassCard>

      <GlassCard className="p-6">
        <SectionHeader eyebrow="Quick actions" title="Get more from your institution." />
        <ul className="mt-5 grid grid-cols-2 gap-3">
          {[
            { icon: <IconDoc width={18} height={18} />, label: "Upload syllabus" },
            { icon: <IconUsers width={18} height={18} />, label: "Invite teacher" },
            { icon: <IconClassroom width={18} height={18} />, label: "Create classroom" },
            { icon: <IconRobot width={18} height={18} />, label: "AI quota" },
            { icon: <IconSparkle width={18} height={18} />, label: "Announcement" },
            { icon: <IconArrowRight width={18} height={18} />, label: "Billing" },
          ].map((a) => (
            <li key={a.label}>
              <button className="group flex w-full items-center gap-3 rounded-vaasenk-lg border border-vaasenk-red/10 bg-white/65 p-3 text-left transition-all hover:-translate-y-0.5 hover:border-vaasenk-red/30 hover:bg-white">
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-vaasenk-md bg-vaasenk-red/10 text-vaasenk-red">
                  {a.icon}
                </span>
                <span className="text-[13px] font-bold text-vaasenk-deep-maroon">{a.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </GlassCard>
    </section>
  );
}

function AIBucket({ label, data }: { label: string; data: { total: number; aiReady: number; processing: number; failed: number } }) {
  const readyPct = Math.round((data.aiReady / data.total) * 100);
  return (
    <div className="flex flex-col gap-3 rounded-vaasenk-lg border border-vaasenk-red/10 bg-vaasenk-cream-card p-5">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-extrabold text-vaasenk-deep-maroon">{label}</p>
        <span className="text-[12px] font-bold text-vaasenk-muted">{data.total} total</span>
      </div>
      <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-white shadow-inner">
        <span className="absolute inset-y-0 left-0 [background:var(--gradient-hero-sunrise)]" style={{ width: `${readyPct}%` }} />
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        <Pill tone="gold">{data.aiReady} ready</Pill>
        <Pill tone="warning">{data.processing} processing</Pill>
        <Pill tone="danger">{data.failed} failed</Pill>
      </div>
    </div>
  );
}

function Pill({ tone, children }: { tone: "gold" | "warning" | "danger"; children: React.ReactNode }) {
  const cls = {
    gold: "bg-vaasenk-gold/20 text-vaasenk-deep-maroon",
    warning: "bg-vaasenk-warning/15 text-amber-700",
    danger: "bg-vaasenk-danger/10 text-vaasenk-danger",
  }[tone];
  return (
    <span className={`flex items-center justify-center rounded-vaasenk-full px-2 py-1 text-[11px] font-extrabold uppercase tracking-wider ${cls}`}>
      {children}
    </span>
  );
}

/* -------------------------------------------------------------------------- */

function Activity() {
  return (
    <section className="vaasenk-rise vaasenk-rise-delay-3 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <GlassCard className="p-6">
        <SectionHeader
          eyebrow="Activity"
          title="What changed today."
          description="Audit-grade trail of who did what."
        />
        <ul className="mt-5 divide-y divide-vaasenk-red/8">
          {recentActivity.map((a, i) => (
            <li key={i} className="flex items-start gap-3 py-3">
              <span className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${a.actor === "AI Engine" ? "bg-vaasenk-gold" : "bg-vaasenk-red/60"}`} />
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] text-vaasenk-ink">
                  <strong className="text-vaasenk-deep-maroon">{a.actor}</strong>{" "}
                  <span className="text-vaasenk-muted">{a.action}</span>{" "}
                  <strong className="text-vaasenk-red">{a.subject}</strong>
                </p>
              </div>
              <span className="text-[11.5px] font-bold uppercase tracking-wider text-vaasenk-subtle">{a.time}</span>
            </li>
          ))}
        </ul>
      </GlassCard>

      <GlassCard tone="elevated" className="p-6">
        <SectionHeader eyebrow="Subscription" title="Pilot — Tier 2" />
        <div className="mt-5 flex flex-col gap-4">
          <div className="rounded-vaasenk-lg bg-vaasenk-warm-canvas/65 p-4">
            <p className="text-[11.5px] font-bold uppercase tracking-wider text-vaasenk-muted">Includes</p>
            <ul className="mt-2 space-y-1.5 text-[13.5px] text-vaasenk-deep-maroon">
              <li>· 40 classrooms</li>
              <li>· Unlimited notes &amp; uploads</li>
              <li>· 2M tokens AI / month</li>
              <li>· Priority OCR for Tamil + English</li>
            </ul>
          </div>
          <div className="flex items-center gap-3">
            <Chip tone="gold">82% AI budget used</Chip>
            <Chip>Renews 30 Jun</Chip>
          </div>
          <Button variant="secondary" size="sm" trailingIcon={<IconArrowUpRight width={12} height={12} />}>
            Manage billing
          </Button>
        </div>
      </GlassCard>
    </section>
  );
}
