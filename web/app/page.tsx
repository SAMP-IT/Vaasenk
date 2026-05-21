import Link from "next/link";
import { Button, Chip, GlassCard, HeroCard } from "@/components/primitives";
import {
  IconArrowRight,
  IconArrowUpRight,
  IconBolt,
  IconBook,
  IconDoc,
  IconLogo,
  IconRobot,
  IconSparkle,
  IconUpload,
} from "@/components/icons";

export default function Landing() {
  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <BackgroundCanvas />

      <div className="relative z-10 mx-auto w-full max-w-[1280px] px-5 py-5 sm:px-8 sm:py-8">
        <Header />
        <Hero />
        <ProductRails />
        <DifferentiatorStrip />
        <CTAStrip />
        <Footer />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function BackgroundCanvas() {
  return (
    <>
      <div className="fixed inset-0 -z-30 [background:var(--gradient-soft-canvas)]" />
      <div aria-hidden className="vaasenk-grain pointer-events-none fixed inset-0 -z-20" />
      <div aria-hidden className="pointer-events-none fixed -top-40 -left-40 -z-10 h-[520px] w-[520px] rounded-full bg-vaasenk-gold/40 blur-[140px]" />
      <div aria-hidden className="pointer-events-none fixed -top-20 right-1/3 -z-10 h-[420px] w-[420px] rounded-full bg-vaasenk-coral-pink/35 blur-[140px]" />
      <div aria-hidden className="pointer-events-none fixed bottom-0 -right-40 -z-10 h-[620px] w-[620px] rounded-full bg-vaasenk-sunrise-orange/25 blur-[160px]" />
    </>
  );
}

function Header() {
  return (
    <header className="flex items-center justify-between rounded-vaasenk-2xl border border-white/40 bg-white/55 px-5 py-3 backdrop-blur-xl shadow-[var(--shadow-card-soft)]">
      <Link href="/" className="flex items-center gap-2.5">
        <span className="flex h-10 w-10 items-center justify-center rounded-vaasenk-md text-vaasenk-red [background:var(--gradient-gold-card)] shadow-[var(--shadow-glow-gold)]">
          <IconLogo width={22} height={22} />
        </span>
        <span className="vaasenk-display text-[26px] font-extrabold leading-none text-vaasenk-deep-maroon">
          vaasenk
        </span>
      </Link>

      <nav className="hidden items-center gap-1 md:flex">
        {[
          { l: "For schools", h: "#schools" },
          { l: "For teachers", h: "#teachers" },
          { l: "AI assistant", h: "#ai" },
          { l: "Pricing", h: "#" },
        ].map((n) => (
          <Link key={n.l} href={n.h} className="rounded-vaasenk-full px-4 py-2 text-[13.5px] font-semibold text-vaasenk-deep-maroon/80 transition-colors hover:bg-white/70 hover:text-vaasenk-deep-maroon">
            {n.l}
          </Link>
        ))}
      </nav>

      <div className="flex items-center gap-2">
        <Link href="/login">
          <Button variant="secondary" size="sm">
            Sign in
          </Button>
        </Link>
        <Link href="/admin">
          <Button size="sm" trailingIcon={<IconArrowRight width={16} height={16} />}>
            Open demo
          </Button>
        </Link>
      </div>
    </header>
  );
}

/* -------------------------------------------------------------------------- */

function Hero() {
  return (
    <section className="mt-10 grid items-start gap-6 md:mt-16 md:grid-cols-[1.15fr_1fr] md:gap-10">
      <div className="vaasenk-rise flex flex-col gap-7">
        <span className="inline-flex w-fit items-center gap-2 rounded-vaasenk-full border border-vaasenk-red/15 bg-white/70 py-1.5 pl-2 pr-4 backdrop-blur">
          <span className="flex h-6 w-6 items-center justify-center rounded-vaasenk-full bg-vaasenk-red text-vaasenk-gold">
            <IconSparkle width={12} height={12} />
          </span>
          <span className="text-[12.5px] font-bold uppercase tracking-[0.18em] text-vaasenk-red">
            Made in India · For Indian classrooms
          </span>
        </span>

        <h1 className="vaasenk-display text-[clamp(48px,7vw,88px)] font-black text-vaasenk-deep-maroon">
          Teach more.
          <br />
          <em>Copy less.</em>
        </h1>

        <p className="max-w-xl text-[17px] leading-[1.55] text-vaasenk-ink/80">
          Vaasenk replaces the chalkboard-copy ritual with a calm digital companion. Teachers upload notes once.
          Students consume on any device. Behind both — a syllabus-grounded AI assistant that drafts question papers,
          builds lesson plans, and never invents what it cannot cite.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <Link href="/teacher">
            <Button size="lg" trailingIcon={<IconArrowRight />}>
              Try the teacher view
            </Button>
          </Link>
          <Link href="/admin">
            <Button variant="secondary" size="lg" trailingIcon={<IconArrowUpRight width={16} height={16} />}>
              See the admin console
            </Button>
          </Link>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 pt-2">
          <Stat n="240+" l="pilot classrooms" />
          <span className="hidden h-6 w-px bg-vaasenk-red/15 sm:inline-block" />
          <Stat n="38" l="schools onboarded" />
          <span className="hidden h-6 w-px bg-vaasenk-red/15 sm:inline-block" />
          <Stat n="100%" l="syllabus-grounded AI" />
        </div>
      </div>

      <HeroPanel />
    </section>
  );
}

function Stat({ n, l }: { n: string; l: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="vaasenk-display text-[28px] font-black text-vaasenk-red">{n}</span>
      <span className="text-[12.5px] font-bold uppercase tracking-wider text-vaasenk-muted">{l}</span>
    </div>
  );
}

function HeroPanel() {
  return (
    <div className="vaasenk-rise vaasenk-rise-delay-2 relative">
      <HeroCard className="aspect-[5/6] p-7 md:aspect-auto md:min-h-[540px]">
        <div className="relative z-10 flex h-full flex-col justify-between">
          <div className="flex items-start justify-between">
            <span className="inline-flex items-center gap-2 rounded-vaasenk-full bg-black/20 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white/85 backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-vaasenk-gold vaasenk-pulse-dot" />
              Live · Class 10-A Physics
            </span>
            <span className="rounded-vaasenk-full bg-vaasenk-gold/95 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-vaasenk-deep-maroon">
              AI Ready
            </span>
          </div>

          <div className="space-y-5">
            <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-vaasenk-gold">
              The teacher asked
            </p>
            <p className="vaasenk-display text-[34px] font-black leading-[1.05] text-white sm:text-[42px]">
              &ldquo;Important questions for the chapter on reflection of light?&rdquo;
            </p>

            <GlassCard className="border-white/30 bg-white/12 p-5 text-white">
              <p className="text-[13.5px] leading-relaxed">
                <span className="font-bold text-vaasenk-gold">Drawing from your syllabus.</span> Six board-pattern
                questions, weighted by the last five years of CBSE papers. Each one cites the syllabus page it&apos;s
                grounded in — no invented content, ever.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="rounded-vaasenk-full bg-white/15 px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wider">
                  cbse physics · p.162
                </span>
                <span className="rounded-vaasenk-full bg-white/15 px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wider">
                  cbse physics · p.168
                </span>
                <span className="rounded-vaasenk-full bg-white/15 px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wider">
                  mid-term 2024 · q.14
                </span>
              </div>
            </GlassCard>

            <div className="flex items-center justify-between rounded-vaasenk-full bg-white/15 p-1.5 pl-5">
              <span className="text-[13px] text-white/85">
                Ask another question<span className="vaasenk-caret">|</span>
              </span>
              <span className="flex h-10 w-10 items-center justify-center rounded-vaasenk-full bg-vaasenk-gold text-vaasenk-deep-maroon shadow-[0_8px_20px_rgba(254,202,2,0.45)]">
                <IconArrowRight width={18} height={18} />
              </span>
            </div>
          </div>
        </div>
      </HeroCard>

      <div className="absolute -left-6 -top-6 hidden h-20 w-20 -rotate-12 items-center justify-center rounded-vaasenk-xl bg-white/85 shadow-[var(--shadow-card-float)] backdrop-blur md:flex">
        <IconBook width={28} height={28} />
      </div>
      <div className="absolute -right-4 bottom-1/3 hidden rounded-vaasenk-xl border border-white/55 bg-white/75 px-3 py-2 text-[12px] font-bold text-vaasenk-deep-maroon shadow-[var(--shadow-card-float)] backdrop-blur md:block">
        ✨ +3 sample papers cited
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function ProductRails() {
  const items = [
    {
      role: "Admin",
      tagline: "Set up your school in a single sitting.",
      copy: "Onboard institution, classes, subjects, teachers, syllabus — all guided. Watch your AI knowledge base assemble itself as you upload.",
      stat: "6 wizard steps",
      gradient: "linear-gradient(135deg,#4A0508 0%,#A00000 60%,#FF7A18 100%)",
      icon: <IconDoc width={22} height={22} />,
      href: "/admin",
      cta: "Open admin console",
    },
    {
      role: "Teacher",
      tagline: "Photograph the board. We do the rest.",
      copy: "Drag-drop notes. Generate full question papers from your syllabus. Chat with an AI grounded in the materials your admin uploaded.",
      stat: "2 differentiators",
      gradient: "linear-gradient(135deg,#FF8A00 0%,#FFB020 55%,#FECA02 100%)",
      icon: <IconBolt width={22} height={22} />,
      href: "/teacher",
      cta: "Try the teacher view",
    },
    {
      role: "Student",
      tagline: "Stop copying. Start understanding.",
      copy: "Mobile-first feed of teacher notes. Bookmark, download, revise. (Student AI lands in Phase 5.)",
      stat: "Web-light · Mobile-first",
      gradient: "linear-gradient(135deg,#FF5C8A 0%,#FF7A18 58%,#FECA02 100%)",
      icon: <IconBook width={22} height={22} />,
      href: "#",
      cta: "Coming soon to mobile",
    },
  ];

  return (
    <section id="schools" className="mt-24 grid gap-5 md:grid-cols-3 md:gap-6">
      {items.map((it, idx) => (
        <article
          key={it.role}
          className={`vaasenk-rise vaasenk-rise-delay-${idx + 1} relative overflow-hidden rounded-vaasenk-2xl p-6 text-white shadow-[var(--shadow-card-float)]`}
          style={{ background: it.gradient }}
        >
          <span aria-hidden className="vaasenk-orbit" style={{ width: 220, height: 220, top: -80, right: -80 }} />
          <span aria-hidden className="vaasenk-orbit" style={{ width: 120, height: 120, bottom: -40, left: -20, opacity: 0.6 }} />

          <div className="relative z-10 flex h-full flex-col">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-2 rounded-vaasenk-full bg-black/20 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white/90 backdrop-blur">
                For {it.role.toLowerCase()}s
              </span>
              <span className="flex h-9 w-9 items-center justify-center rounded-vaasenk-md bg-white/20 backdrop-blur">
                {it.icon}
              </span>
            </div>

            <h3 className="vaasenk-display mt-8 text-[28px] font-black leading-tight">
              {it.tagline}
            </h3>
            <p className="mt-3 text-[14px] leading-relaxed text-white/85">{it.copy}</p>

            <div className="mt-auto flex items-end justify-between pt-8">
              <span className="text-[11.5px] font-bold uppercase tracking-wider text-white/75">{it.stat}</span>
              <Link href={it.href} className="inline-flex items-center gap-1.5 text-[13px] font-extrabold underline-offset-4 hover:underline">
                {it.cta} <IconArrowUpRight width={14} height={14} />
              </Link>
            </div>
          </div>
        </article>
      ))}
    </section>
  );
}

/* -------------------------------------------------------------------------- */

function DifferentiatorStrip() {
  return (
    <section id="ai" className="mt-24">
      <GlassCard className="grid items-center gap-8 p-8 md:grid-cols-[1.1fr_1fr] md:p-10">
        <div className="flex flex-col gap-5">
          <span className="inline-flex w-fit items-center gap-2 rounded-vaasenk-full bg-vaasenk-red/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-vaasenk-red">
            <IconRobot width={14} height={14} />
            The differentiator
          </span>
          <h2 className="vaasenk-display text-[44px] font-black leading-[1.02] text-vaasenk-deep-maroon">
            An AI assistant that <em>cannot</em>
            <br /> hallucinate your syllabus.
          </h2>
          <p className="text-[15.5px] leading-relaxed text-vaasenk-ink/80">
            Every classroom gets its own bot, sealed inside the syllabus and sample papers your admin uploaded.
            It refuses to answer outside scope. It cites the page it&apos;s pulling from. It saves teachers two hours a day
            on lesson plans and question papers — without ever putting them at exam-time risk.
          </p>
          <div className="flex flex-wrap gap-2">
            <Chip tone="gold">Grounded in syllabus</Chip>
            <Chip>Page-level citations</Chip>
            <Chip>Refuses out-of-scope</Chip>
            <Chip>Multi-tenant isolated</Chip>
          </div>
        </div>

        <div className="relative">
          <GlassCard tone="elevated" className="border-vaasenk-red/15 bg-white p-6">
            <div className="flex items-center justify-between border-b border-vaasenk-red/10 pb-3">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-vaasenk-md text-vaasenk-red [background:var(--gradient-gold-card)]">
                  <IconRobot width={18} height={18} />
                </span>
                <span className="text-[13px] font-bold text-vaasenk-deep-maroon">Vaasenk AI · Class 10-A Physics</span>
              </div>
              <span className="rounded-vaasenk-full bg-vaasenk-gold/25 px-2.5 py-1 text-[10.5px] font-extrabold uppercase tracking-wider text-vaasenk-deep-maroon">
                AI Ready
              </span>
            </div>

            <div className="mt-5 space-y-4 text-[14px]">
              <p className="rounded-vaasenk-md bg-vaasenk-red/8 px-4 py-3 text-vaasenk-deep-maroon">
                Make me a 35-minute lesson plan on Reflection of Light.
              </p>
              <div className="rounded-vaasenk-md bg-vaasenk-warm-canvas/80 px-4 py-3 leading-relaxed text-vaasenk-ink">
                <p>
                  <strong className="text-vaasenk-red">Lesson plan — Reflection of Light (35 min)</strong>
                  <br />
                  1. Recap last class (5 min)
                  <br />
                  2. Laws of reflection — demo with plane mirror (10 min)
                  <br />
                  3. Concave mirror ray diagrams (12 min)
                  <br />
                  4. Solve mirror formula numerical (5 min)
                  <br />
                  5. Homework brief — 3 questions from <em>Sample Paper Mid-Term 2024</em> (3 min)
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5 border-t border-vaasenk-red/10 pt-3">
                  <span className="inline-flex items-center gap-1 rounded-vaasenk-full bg-vaasenk-gold/25 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-vaasenk-deep-maroon">
                    📑 Syllabus p.162
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-vaasenk-full bg-vaasenk-gold/25 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-vaasenk-deep-maroon">
                    📑 Syllabus p.168
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-vaasenk-full bg-vaasenk-gold/25 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-vaasenk-deep-maroon">
                    📄 Sample paper Q.14
                  </span>
                </div>
              </div>
            </div>
          </GlassCard>
        </div>
      </GlassCard>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

function CTAStrip() {
  return (
    <section id="teachers" className="mt-24">
      <HeroCard variant="gold" className="p-10 md:p-14">
        <div className="relative z-10 grid items-center gap-8 md:grid-cols-[1.4fr_1fr]">
          <div>
            <span className="inline-flex items-center gap-2 rounded-vaasenk-full bg-vaasenk-deep-maroon/15 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-vaasenk-deep-maroon">
              <IconUpload width={12} height={12} />
              Ready in a single class period
            </span>
            <h2 className="vaasenk-display mt-5 text-[clamp(36px,5vw,60px)] font-black leading-[1.02]">
              Upload the syllabus.
              <br /> Watch the assistant <em>come alive</em>.
            </h2>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed">
              Onboarding is six guided steps. The AI knowledge base builds itself in the background.
              By the next lesson, every teacher in your institution has a grounded, syllabus-aware assistant.
            </p>
          </div>
          <div className="flex flex-col items-stretch gap-3">
            <Link href="/login">
              <Button size="lg" trailingIcon={<IconArrowRight />} className="w-full">
                Get started — it&apos;s free for pilots
              </Button>
            </Link>
            <Link href="/admin">
              <Button variant="ghost" size="lg" trailingIcon={<IconArrowUpRight width={16} height={16} />} className="w-full">
                Tour the admin console
              </Button>
            </Link>
          </div>
        </div>
      </HeroCard>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

function Footer() {
  return (
    <footer className="mt-20 flex flex-col items-start justify-between gap-6 border-t border-vaasenk-red/10 pt-8 text-[13px] text-vaasenk-muted md:flex-row md:items-center">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-vaasenk-md text-vaasenk-red [background:var(--gradient-gold-card)]">
          <IconLogo width={16} height={16} />
        </span>
        <span className="vaasenk-display text-[16px] font-extrabold text-vaasenk-deep-maroon">vaasenk</span>
        <span className="ml-3 text-vaasenk-subtle">© 2026 · Made in India</span>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <Link href="#" className="hover:text-vaasenk-deep-maroon">Privacy</Link>
        <Link href="#" className="hover:text-vaasenk-deep-maroon">Trust &amp; Safety</Link>
        <Link href="#" className="hover:text-vaasenk-deep-maroon">Documentation</Link>
        <Link href="/login" className="font-bold text-vaasenk-red">Sign in →</Link>
      </div>
    </footer>
  );
}
