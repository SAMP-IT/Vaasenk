"use client";

import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

/* -------------------------------------------------------------------------- */
/*  Button                                                                    */
/* -------------------------------------------------------------------------- */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "gold";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    leadingIcon,
    trailingIcon,
    loading,
    className,
    children,
    disabled,
    ...rest
  },
  ref,
) {
  const sizeCx = {
    sm: "h-10 px-4 text-[13px]",
    md: "h-[52px] px-6 text-[15px]",
    lg: "h-[60px] px-8 text-base",
  }[size];

  const variantCx = {
    primary:
      "text-white shadow-[var(--shadow-glow-red)] hover:-translate-y-[1px] hover:saturate-110 active:translate-y-0 [background:var(--gradient-hero-sunrise)]",
    secondary:
      "border border-vaasenk-red/15 bg-white/65 text-vaasenk-red backdrop-blur-md hover:bg-white/90",
    ghost:
      "text-vaasenk-deep-maroon hover:bg-white/55",
    danger:
      "bg-vaasenk-danger text-white hover:brightness-110",
    gold:
      "text-vaasenk-deep-maroon shadow-[var(--shadow-glow-gold)] hover:-translate-y-[1px] [background:var(--gradient-gold-card)]",
  }[variant];

  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-vaasenk-full font-semibold tracking-tight transition-all duration-200 ease-[var(--ease-spring)] focus-visible:outline-none focus-visible:[box-shadow:0_0_0_4px_rgba(254,202,2,0.32),_0_0_0_6px_rgba(160,0,0,0.24)] disabled:opacity-60 disabled:cursor-not-allowed",
        sizeCx,
        variantCx,
        className,
      )}
      {...rest}
    >
      {loading && <Spinner />}
      {!loading && leadingIcon && <span className="-ml-1">{leadingIcon}</span>}
      <span>{children}</span>
      {!loading && trailingIcon && <span className="-mr-1">{trailingIcon}</span>}
    </button>
  );
});

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path
        d="M22 12a10 10 0 0 0-10-10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  GlassCard                                                                 */
/* -------------------------------------------------------------------------- */

interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
  tone?: "default" | "elevated";
}

export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(function GlassCard(
  { interactive, tone = "default", className, children, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cx(
        "relative overflow-hidden rounded-vaasenk-3xl border border-white/45 backdrop-blur-xl transition-shadow duration-300",
        tone === "elevated"
          ? "shadow-[var(--shadow-card-float)]"
          : "shadow-[var(--shadow-card-soft)]",
        "[background:var(--gradient-glass-shine)]",
        interactive && "cursor-pointer hover:shadow-[var(--shadow-card-float)]",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
});

/* -------------------------------------------------------------------------- */
/*  HeroCard                                                                  */
/* -------------------------------------------------------------------------- */

interface HeroCardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "red-glow" | "gold" | "student-candy";
  animate?: boolean;
}

export const HeroCard = forwardRef<HTMLDivElement, HeroCardProps>(function HeroCard(
  { variant = "red-glow", animate = true, className, children, ...rest },
  ref,
) {
  const bg = {
    "red-glow":
      "[background:var(--gradient-red-glow)] text-white",
    gold:
      "[background:var(--gradient-gold-card)] text-vaasenk-deep-maroon",
    "student-candy":
      "[background:var(--gradient-student-candy)] text-white",
  }[variant];

  return (
    <div
      ref={ref}
      className={cx(
        "vaasenk-hero-card relative overflow-hidden rounded-vaasenk-3xl shadow-[var(--shadow-card-float)]",
        animate && "vaasenk-animate-gradient",
        bg,
        className,
      )}
      {...rest}
    >
      <span className="vaasenk-orbit" style={{ width: 280, height: 280, top: -60, right: -100 }} />
      <span className="vaasenk-orbit" style={{ width: 460, height: 460, top: -160, right: -200, opacity: 0.5 }} />
      <span className="vaasenk-orbit" style={{ width: 200, height: 200, bottom: -80, left: -60, opacity: 0.7 }} />
      {children}
    </div>
  );
});

/* -------------------------------------------------------------------------- */
/*  Chip                                                                      */
/* -------------------------------------------------------------------------- */

interface ChipProps extends HTMLAttributes<HTMLSpanElement> {
  active?: boolean;
  leadingIcon?: ReactNode;
  tone?: "default" | "gold" | "success" | "warning";
}

export function Chip({ active, leadingIcon, tone = "default", className, children, ...rest }: ChipProps) {
  const toneIdle = {
    default: "bg-white/65 text-vaasenk-deep-maroon border-vaasenk-red/10",
    gold: "bg-vaasenk-gold/15 text-vaasenk-deep-maroon border-vaasenk-gold/40",
    success: "bg-vaasenk-success/10 text-vaasenk-success border-vaasenk-success/30",
    warning: "bg-vaasenk-warning/15 text-amber-700 border-vaasenk-warning/40",
  }[tone];

  return (
    <span
      className={cx(
        "inline-flex h-[34px] items-center gap-1.5 rounded-vaasenk-full border px-3 text-[13px] font-bold transition-all duration-200",
        active
          ? "border-transparent text-white shadow-[var(--shadow-glow-red)] [background:var(--gradient-hero-sunrise)]"
          : toneIdle,
        className,
      )}
      {...rest}
    >
      {leadingIcon}
      {children}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*  StatusBadge                                                               */
/* -------------------------------------------------------------------------- */

export type Status =
  | "uploaded"
  | "processing"
  | "ai_ready"
  | "failed"
  | "draft"
  | "published"
  | "archived"
  | "indexing"
  | "setup_pending"
  | "bot_disabled";

const statusConfig: Record<Status, { label: string; dot: string; bg: string; text: string; pulse?: boolean }> = {
  uploaded:      { label: "Uploaded",        dot: "bg-vaasenk-subtle",  bg: "bg-white/65",         text: "text-vaasenk-muted" },
  processing:    { label: "Processing",      dot: "bg-vaasenk-warning", bg: "bg-vaasenk-warning/15", text: "text-amber-700", pulse: true },
  ai_ready:      { label: "AI Ready",        dot: "bg-vaasenk-gold",    bg: "bg-vaasenk-gold/20",  text: "text-vaasenk-deep-maroon" },
  failed:        { label: "Failed",          dot: "bg-vaasenk-danger",  bg: "bg-vaasenk-danger/10", text: "text-vaasenk-danger" },
  draft:         { label: "Draft",           dot: "bg-vaasenk-subtle",  bg: "bg-white/65",         text: "text-vaasenk-muted" },
  published:     { label: "Published",       dot: "bg-vaasenk-success", bg: "bg-vaasenk-success/10", text: "text-vaasenk-success" },
  archived:      { label: "Archived",        dot: "bg-vaasenk-subtle",  bg: "bg-white/50",         text: "text-vaasenk-subtle" },
  indexing:      { label: "Indexing syllabus", dot: "bg-vaasenk-warning", bg: "bg-vaasenk-warning/15", text: "text-amber-700", pulse: true },
  setup_pending: { label: "Setup pending",   dot: "bg-vaasenk-warning", bg: "bg-vaasenk-warning/15", text: "text-amber-700" },
  bot_disabled:  { label: "Bot disabled",    dot: "bg-vaasenk-subtle",  bg: "bg-white/55",         text: "text-vaasenk-muted" },
};

export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  const cfg = statusConfig[status];
  return (
    <span
      className={cx(
        "inline-flex items-center gap-2 rounded-vaasenk-full px-3 py-1 text-[12px] font-bold uppercase tracking-wider",
        cfg.bg,
        cfg.text,
        className,
      )}
    >
      <span className={cx("h-1.5 w-1.5 rounded-full", cfg.dot, cfg.pulse && "vaasenk-pulse-dot")} />
      {cfg.label}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*  RoleBadge                                                                 */
/* -------------------------------------------------------------------------- */

export function RoleBadge({ role }: { role: "admin" | "teacher" | "student" }) {
  const cfg = {
    admin: { label: "Admin", dot: "bg-vaasenk-red" },
    teacher: { label: "Teacher", dot: "bg-vaasenk-sunrise-orange" },
    student: { label: "Student", dot: "bg-vaasenk-coral-pink" },
  }[role];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-vaasenk-full bg-white/70 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-vaasenk-deep-maroon">
      <span className={cx("h-1.5 w-1.5 rounded-full", cfg.dot)} />
      {cfg.label}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*  Input                                                                     */
/* -------------------------------------------------------------------------- */

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  error?: string;
  label?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { leadingIcon, trailingIcon, error, label, className, id, ...rest },
  ref,
) {
  const inputId = id || rest.name;
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-[13px] font-bold tracking-wide text-vaasenk-deep-maroon">
          {label}
        </label>
      )}
      <div
        className={cx(
          "relative flex items-center rounded-vaasenk-lg border bg-white/72 backdrop-blur transition-all duration-200",
          error ? "border-vaasenk-danger/60" : "border-vaasenk-red/10 focus-within:border-vaasenk-red/45 focus-within:bg-white/95 focus-within:shadow-[0_0_0_4px_rgba(254,202,2,0.18)]",
        )}
      >
        {leadingIcon && <span className="pl-4 text-vaasenk-muted">{leadingIcon}</span>}
        <input
          ref={ref}
          id={inputId}
          className={cx(
            "h-[52px] w-full bg-transparent px-4 text-[15px] font-medium text-vaasenk-ink placeholder:text-vaasenk-subtle focus:outline-none",
            leadingIcon && "pl-2",
            trailingIcon && "pr-2",
            className,
          )}
          {...rest}
        />
        {trailingIcon && <span className="pr-4 text-vaasenk-muted">{trailingIcon}</span>}
      </div>
      {error && <span className="text-[12px] font-semibold text-vaasenk-danger">{error}</span>}
    </div>
  );
});

/* -------------------------------------------------------------------------- */
/*  Stat tile                                                                 */
/* -------------------------------------------------------------------------- */

export function StatTile({
  label,
  value,
  delta,
  hint,
  icon,
  tone = "default",
}: {
  label: string;
  value: string | number;
  delta?: string;
  hint?: string;
  icon?: ReactNode;
  tone?: "default" | "gold" | "danger";
}) {
  const accentBg = {
    default: "bg-vaasenk-red/10 text-vaasenk-red",
    gold: "bg-vaasenk-gold/20 text-vaasenk-deep-maroon",
    danger: "bg-vaasenk-danger/10 text-vaasenk-danger",
  }[tone];
  return (
    <GlassCard className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[12px] font-bold uppercase tracking-wider text-vaasenk-muted">{label}</p>
          <p className="mt-2 text-[40px] font-extrabold leading-none tracking-tight text-vaasenk-deep-maroon">{value}</p>
          {hint && <p className="mt-2 text-[13px] text-vaasenk-muted">{hint}</p>}
          {delta && (
            <p className="mt-2 inline-flex items-center gap-1 text-[12px] font-bold text-vaasenk-success">
              ↑ {delta}
            </p>
          )}
        </div>
        {icon && <span className={cx("flex h-12 w-12 items-center justify-center rounded-vaasenk-xl", accentBg)}>{icon}</span>}
      </div>
    </GlassCard>
  );
}

/* -------------------------------------------------------------------------- */
/*  Avatar                                                                    */
/* -------------------------------------------------------------------------- */

export function Avatar({ name, tone = "red" }: { name: string; tone?: "red" | "gold" | "coral" | "orange" | "maroon" }) {
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const bg = {
    red: "[background:var(--gradient-hero-sunrise)] text-white",
    gold: "[background:var(--gradient-gold-card)] text-vaasenk-deep-maroon",
    coral: "[background:var(--gradient-student-candy)] text-white",
    orange: "bg-vaasenk-sunrise-orange text-white",
    maroon: "bg-vaasenk-deep-maroon text-white",
  }[tone];
  return (
    <span
      className={cx(
        "inline-flex h-10 w-10 select-none items-center justify-center rounded-vaasenk-full text-[13px] font-extrabold shadow-[0_8px_20px_rgba(160,0,0,0.18)]",
        bg,
      )}
    >
      {initials}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*  Section header                                                            */
/* -------------------------------------------------------------------------- */

export function SectionHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && (
          <span className="inline-flex items-center gap-2 rounded-vaasenk-full bg-white/65 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-vaasenk-red">
            <span className="h-1.5 w-1.5 rounded-full bg-vaasenk-red" />
            {eyebrow}
          </span>
        )}
        <h2 className="mt-3 text-[28px] font-extrabold tracking-tight text-vaasenk-deep-maroon">{title}</h2>
        {description && <p className="mt-1 max-w-2xl text-[15px] text-vaasenk-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export { cx };
