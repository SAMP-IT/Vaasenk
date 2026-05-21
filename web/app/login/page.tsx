import Link from "next/link";
import { Button, GlassCard, HeroCard, Input } from "@/components/primitives";
import { IconArrowRight, IconLogo, IconShield, IconSparkle } from "@/components/icons";

export default function LoginPage() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="fixed inset-0 -z-30 [background:var(--gradient-soft-canvas)]" />
      <div aria-hidden className="vaasenk-grain pointer-events-none fixed inset-0 -z-20" />
      <div aria-hidden className="pointer-events-none fixed -top-40 -left-40 -z-10 h-[420px] w-[420px] rounded-full bg-vaasenk-gold/40 blur-[140px]" />
      <div aria-hidden className="pointer-events-none fixed -bottom-40 -right-40 -z-10 h-[520px] w-[520px] rounded-full bg-vaasenk-coral-pink/30 blur-[140px]" />

      <div className="relative z-10 mx-auto grid min-h-screen w-full max-w-[1280px] grid-cols-1 gap-10 px-6 py-8 lg:grid-cols-[1fr_1fr] lg:gap-16 lg:py-14">
        {/* Marketing column */}
        <div className="flex flex-col">
          <Link href="/" className="flex w-fit items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-vaasenk-md text-vaasenk-red [background:var(--gradient-gold-card)] shadow-[var(--shadow-glow-gold)]">
              <IconLogo width={22} height={22} />
            </span>
            <span className="vaasenk-display text-[26px] font-extrabold leading-none text-vaasenk-deep-maroon">
              vaasenk
            </span>
          </Link>

          <div className="mt-auto hidden lg:block">
            <HeroCard className="p-9">
              <div className="relative z-10 flex flex-col gap-7">
                <span className="inline-flex w-fit items-center gap-2 rounded-vaasenk-full bg-white/15 px-3 py-1 text-[11px] font-bold uppercase tracking-wider backdrop-blur">
                  <IconSparkle width={12} height={12} />
                  Welcome back
                </span>
                <h2 className="vaasenk-display text-[44px] font-black leading-[1.05] text-white">
                  Today is a <em>copy-less</em> day.
                </h2>
                <p className="text-[14.5px] leading-relaxed text-white/85">
                  Your classroom AI has indexed 12 new syllabus pages overnight. Three teachers asked it to draft lesson
                  plans before sunrise. Welcome to the side of teaching that scales.
                </p>
                <GlassCard className="border-white/25 bg-white/12 p-5 text-white">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-vaasenk-full bg-vaasenk-gold text-vaasenk-deep-maroon">
                      <IconShield width={18} height={18} />
                    </span>
                    <div className="leading-tight">
                      <p className="text-[12px] font-extrabold uppercase tracking-wider text-vaasenk-gold">
                        Multi-tenant by design
                      </p>
                      <p className="text-[13px] text-white/85">
                        Your institution&apos;s data never leaves your boundary.
                      </p>
                    </div>
                  </div>
                </GlassCard>
              </div>
            </HeroCard>
          </div>
        </div>

        {/* Form column */}
        <div className="flex items-center">
          <GlassCard tone="elevated" className="w-full p-8 sm:p-10">
            <div className="flex flex-col gap-2">
              <span className="text-[12px] font-bold uppercase tracking-[0.2em] text-vaasenk-red">
                Sign in
              </span>
              <h1 className="vaasenk-display text-[44px] font-black leading-[1.02] text-vaasenk-deep-maroon">
                Open your <em>classroom.</em>
              </h1>
              <p className="text-[14.5px] text-vaasenk-muted">
                Use your school email or the invite link your admin sent you.
              </p>
            </div>

            <form className="mt-7 flex flex-col gap-4">
              <Input
                label="Email or phone"
                name="email"
                placeholder="arun.s@bharathividyalaya.in"
                defaultValue="arun.s@bharathividyalaya.in"
                autoComplete="email"
              />
              <Input
                label="Password"
                name="password"
                type="password"
                placeholder="Your password"
                defaultValue="••••••••"
                autoComplete="current-password"
              />
              <div className="flex items-center justify-between text-[13px]">
                <label className="flex items-center gap-2 text-vaasenk-muted">
                  <input type="checkbox" defaultChecked className="h-4 w-4 accent-[color:var(--vaasenk-red)]" />
                  Keep me signed in
                </label>
                <Link href="#" className="font-bold text-vaasenk-red hover:underline">
                  Forgot password?
                </Link>
              </div>

              <Link href="/teacher">
                <Button size="lg" className="w-full" trailingIcon={<IconArrowRight />}>
                  Continue
                </Button>
              </Link>
            </form>

            <div className="my-6 flex items-center gap-3 text-[11px] uppercase tracking-[0.2em] text-vaasenk-subtle">
              <span className="h-px flex-1 bg-vaasenk-red/10" />
              or jump straight into a demo
              <span className="h-px flex-1 bg-vaasenk-red/10" />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <Link href="/admin">
                <Button variant="secondary" size="sm" className="w-full">Admin</Button>
              </Link>
              <Link href="/teacher">
                <Button variant="gold" size="sm" className="w-full">Teacher</Button>
              </Link>
              <Link href="/">
                <Button variant="ghost" size="sm" className="w-full">Student</Button>
              </Link>
            </div>

            <p className="mt-7 text-center text-[12.5px] text-vaasenk-muted">
              Need an account? <Link href="#" className="font-bold text-vaasenk-red hover:underline">Talk to your admin →</Link>
            </p>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
