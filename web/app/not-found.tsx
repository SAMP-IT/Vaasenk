import Link from "next/link";
import { Button, GlassCard, HeroCard } from "@/components/primitives";
import { IconArrowRight, IconLogo, IconSparkle } from "@/components/icons";

export default function NotFound() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden">
      <div className="fixed inset-0 -z-30 [background:var(--gradient-soft-canvas)]" />
      <div aria-hidden className="vaasenk-grain pointer-events-none fixed inset-0 -z-20" />
      <div aria-hidden className="pointer-events-none fixed -top-40 -left-40 -z-10 h-[420px] w-[420px] rounded-full bg-vaasenk-gold/40 blur-[140px]" />
      <div aria-hidden className="pointer-events-none fixed -bottom-40 -right-40 -z-10 h-[520px] w-[520px] rounded-full bg-vaasenk-coral-pink/30 blur-[140px]" />

      <div className="relative z-10 mx-auto w-full max-w-[820px] px-6 py-10">
        <Link href="/" className="flex w-fit items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-vaasenk-md text-vaasenk-red [background:var(--gradient-gold-card)] shadow-[var(--shadow-glow-gold)]">
            <IconLogo width={22} height={22} />
          </span>
          <span className="vaasenk-display text-[26px] font-extrabold leading-none text-vaasenk-deep-maroon">vaasenk</span>
        </Link>

        <HeroCard className="mt-8 p-10">
          <div className="relative z-10 flex flex-col gap-6 text-white">
            <span className="inline-flex w-fit items-center gap-2 rounded-vaasenk-full bg-white/15 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] backdrop-blur">
              <IconSparkle width={12} height={12} />
              Coming in the next iteration
            </span>
            <h1 className="vaasenk-display text-[clamp(40px,6vw,72px)] font-black leading-[1.02]">
              This screen is <em>still on the way.</em>
            </h1>
            <p className="max-w-xl text-[15.5px] leading-relaxed text-white/85">
              The Phase 1 demo focuses on five screens — Landing, Login, Teacher Dashboard, AI Chatbot, and Admin Dashboard.
              The rest of the spec set (admin libraries, classroom detail, question paper wizard, student web) ships next.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/"><Button variant="gold" size="lg" trailingIcon={<IconArrowRight />}>Back to landing</Button></Link>
              <Link href="/teacher"><Button variant="secondary" size="lg">Teacher view</Button></Link>
              <Link href="/admin"><Button variant="secondary" size="lg">Admin view</Button></Link>
            </div>
          </div>
        </HeroCard>

        <GlassCard className="mt-6 p-6">
          <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-vaasenk-muted">
            What&apos;s already built
          </p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {[
              { l: "Landing page", h: "/" },
              { l: "Login", h: "/login" },
              { l: "Teacher dashboard", h: "/teacher" },
              { l: "AI assistant", h: "/teacher/ai" },
              { l: "Admin dashboard", h: "/admin" },
            ].map((p) => (
              <li key={p.h}>
                <Link href={p.h} className="flex items-center justify-between rounded-vaasenk-md border border-vaasenk-red/10 bg-white/65 px-4 py-3 text-[13.5px] font-bold text-vaasenk-deep-maroon transition-all hover:-translate-y-0.5 hover:border-vaasenk-red/30 hover:bg-white">
                  {p.l}
                  <IconArrowRight width={14} height={14} className="text-vaasenk-red" />
                </Link>
              </li>
            ))}
          </ul>
        </GlassCard>
      </div>
    </div>
  );
}
