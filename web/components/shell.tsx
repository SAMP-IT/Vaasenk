"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Avatar, RoleBadge, cx } from "./primitives";
import {
  IconBell,
  IconBookmark,
  IconChat,
  IconClassroom,
  IconDoc,
  IconHome,
  IconLogo,
  IconRobot,
  IconSettings,
  IconShield,
  IconUpload,
  IconUser,
  IconUsers,
} from "./icons";

interface ShellProps {
  role: "admin" | "teacher" | "student";
  userName: string;
  institutionName: string;
  children: ReactNode;
}

const navByRole = {
  admin: [
    { label: "Dashboard",     href: "/admin",            icon: <IconHome /> },
    { label: "Classrooms",    href: "/admin/classrooms", icon: <IconClassroom /> },
    { label: "Teachers",      href: "/admin/teachers",   icon: <IconUsers /> },
    { label: "Syllabus",      href: "/admin/syllabus",   icon: <IconDoc /> },
    { label: "Sample papers", href: "/admin/papers",     icon: <IconDoc /> },
    { label: "AI processing", href: "/admin/ai",         icon: <IconRobot /> },
    { label: "Settings",      href: "/admin/settings",   icon: <IconSettings /> },
  ],
  teacher: [
    { label: "Dashboard",   href: "/teacher",                  icon: <IconHome /> },
    { label: "Classrooms",  href: "/teacher/classrooms",       icon: <IconClassroom /> },
    { label: "AI Assistant", href: "/teacher/ai",              icon: <IconRobot /> },
    { label: "Upload",      href: "/teacher/upload",           icon: <IconUpload /> },
    { label: "Settings",    href: "/teacher/settings",         icon: <IconSettings /> },
  ],
  student: [
    { label: "Home",       href: "/student",            icon: <IconHome /> },
    { label: "Classrooms", href: "/student/classrooms", icon: <IconClassroom /> },
    { label: "Bookmarks",  href: "/student/bookmarks",  icon: <IconBookmark /> },
  ],
};

export function Shell({ role, userName, institutionName, children }: ShellProps) {
  const pathname = usePathname();
  const nav = navByRole[role];

  return (
    <div className="relative min-h-screen">
      <BackgroundCanvas />

      <div className="relative z-10 mx-auto flex w-full max-w-[1440px] gap-6 px-6 py-6">
        {/* Sidebar */}
        <aside className="hidden w-[252px] flex-shrink-0 flex-col lg:flex">
          <Link href="/" className="flex items-center gap-2.5 px-3 pb-8">
            <span className="flex h-9 w-9 items-center justify-center rounded-vaasenk-md text-vaasenk-red [background:var(--gradient-gold-card)] shadow-[var(--shadow-glow-gold)]">
              <IconLogo />
            </span>
            <span className="vaasenk-display text-[22px] font-extrabold text-vaasenk-deep-maroon">
              vaasenk
            </span>
          </Link>

          <nav className="flex flex-col gap-1">
            {nav.map((item) => {
              const active = pathname === item.href || (item.href !== `/${role}` && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cx(
                    "group relative flex items-center gap-3 rounded-vaasenk-lg px-3 py-3 text-[14px] font-bold tracking-tight transition-all duration-200",
                    active
                      ? "text-white shadow-[var(--shadow-glow-red)] [background:linear-gradient(135deg,#4A0508_0%,#A00000_60%,#C1121F_100%)]"
                      : "text-vaasenk-ink/75 hover:bg-white/55 hover:text-vaasenk-deep-maroon",
                  )}
                >
                  <span className={cx("opacity-80 transition-opacity", active && "opacity-100")}>
                    {item.icon}
                  </span>
                  {item.label}
                  {active && (
                    <span className="ml-auto inline-flex h-1.5 w-1.5 rounded-full bg-vaasenk-gold shadow-[0_0_12px_2px_rgba(254,202,2,0.7)]" />
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto pt-8">
            <div className="rounded-vaasenk-2xl border border-white/45 bg-white/65 p-4 backdrop-blur">
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-vaasenk-red">
                <IconShield />
                Trust footer
              </div>
              <p className="mt-2 text-[12.5px] leading-relaxed text-vaasenk-muted">
                AI answers are grounded in your admin&apos;s syllabus. Verify before exam use.
              </p>
            </div>
          </div>
        </aside>

        {/* Main column */}
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <TopBar role={role} userName={userName} institutionName={institutionName} />
          <main className="flex flex-col gap-6">{children}</main>
        </div>
      </div>
    </div>
  );
}

function TopBar({ role, userName, institutionName }: { role: "admin" | "teacher" | "student"; userName: string; institutionName: string }) {
  return (
    <header className="relative flex items-center justify-between rounded-vaasenk-2xl border border-white/45 bg-white/60 px-5 py-3 backdrop-blur-xl shadow-[var(--shadow-card-soft)]">
      <div className="flex items-center gap-3">
        <Link href="/" className="flex items-center gap-2 lg:hidden">
          <span className="flex h-8 w-8 items-center justify-center rounded-vaasenk-md text-vaasenk-red [background:var(--gradient-gold-card)]">
            <IconLogo />
          </span>
          <span className="vaasenk-display text-[18px] font-extrabold text-vaasenk-deep-maroon">vaasenk</span>
        </Link>
        <div className="hidden flex-col leading-tight lg:flex">
          <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-vaasenk-muted">Institution</span>
          <span className="text-[14px] font-bold text-vaasenk-deep-maroon">{institutionName}</span>
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        <button className="relative inline-flex h-10 w-10 items-center justify-center rounded-vaasenk-full bg-white/65 text-vaasenk-deep-maroon transition-colors hover:bg-white">
          <IconBell />
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-vaasenk-gold shadow-[0_0_8px_2px_rgba(254,202,2,0.6)]" />
        </button>
        <span className="hidden items-center gap-2 rounded-vaasenk-full bg-white/70 py-1.5 pl-2 pr-3 sm:inline-flex">
          <Avatar name={userName} tone={role === "admin" ? "maroon" : role === "teacher" ? "orange" : "coral"} />
          <span className="flex flex-col leading-tight">
            <span className="text-[12.5px] font-bold text-vaasenk-deep-maroon">{userName}</span>
            <span className="text-[10.5px] uppercase tracking-wider text-vaasenk-muted">{role}</span>
          </span>
        </span>
        <RoleBadge role={role} />
      </div>
    </header>
  );
}

function BackgroundCanvas() {
  return (
    <>
      <div className="fixed inset-0 -z-30 [background:var(--gradient-soft-canvas)]" />
      <div
        aria-hidden
        className="vaasenk-grain pointer-events-none fixed inset-0 -z-20"
      />
      <div
        aria-hidden
        className="pointer-events-none fixed -top-32 -left-32 -z-10 h-[420px] w-[420px] rounded-full bg-vaasenk-gold/30 blur-[120px]"
      />
      <div
        aria-hidden
        className="pointer-events-none fixed -bottom-40 -right-40 -z-10 h-[520px] w-[520px] rounded-full bg-vaasenk-coral-pink/30 blur-[140px]"
      />
      <div
        aria-hidden
        className="pointer-events-none fixed top-1/3 right-1/4 -z-10 h-[280px] w-[280px] rounded-full bg-vaasenk-sunrise-orange/20 blur-[120px]"
      />
    </>
  );
}

export function UserAvatarOnly({ name, role }: { name: string; role: "admin" | "teacher" | "student" }) {
  return <Avatar name={name} tone={role === "admin" ? "maroon" : role === "teacher" ? "orange" : "coral"} />;
}

export { IconBell, IconUser };
