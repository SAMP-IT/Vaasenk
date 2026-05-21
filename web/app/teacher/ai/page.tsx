"use client";

import { useState } from "react";
import {
  Avatar,
  Button,
  Chip,
  GlassCard,
  HeroCard,
  StatusBadge,
} from "@/components/primitives";
import { Shell } from "@/components/shell";
import {
  IconArrowRight,
  IconBolt,
  IconCopy,
  IconDoc,
  IconPlus,
  IconRefresh,
  IconRobot,
  IconSearch,
  IconShield,
  IconSparkle,
} from "@/components/icons";
import {
  chatSessions,
  institution,
  promptChips,
  sampleAssistantReply,
  teacherUser,
} from "@/lib/mock";

type Message =
  | { role: "user"; content: string; timestamp: string }
  | (typeof sampleAssistantReply & { role: "assistant" });

export default function AIAssistant() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Hello Arun. I'm grounded in the CBSE Physics 2025-26 v2 syllabus and 4 sample papers mapped to Class 10-A. Ask me about any chapter — I'll cite the page I'm pulling from.",
      citations: [],
      timestamp: "Just now",
      groundedness: "in_syllabus" as const,
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  function send(prompt: string) {
    const userMsg: Message = { role: "user", content: prompt, timestamp: "Just now" };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setLoading(true);

    setTimeout(() => {
      setMessages((m) => [...m, { ...sampleAssistantReply, role: "assistant" }]);
      setLoading(false);
    }, 1100);
  }

  return (
    <Shell role="teacher" userName={teacherUser.name} institutionName={institution.name}>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[300px_1fr]">
        <SessionsPanel />
        <div className="flex flex-col gap-5">
          <ChatHeader />
          <ChatBody messages={messages} loading={loading} />
          {messages.length <= 1 && <PromptChipsPanel onPick={send} />}
          <Composer
            value={input}
            onChange={setInput}
            onSend={() => input.trim() && send(input)}
            disabled={loading}
          />
          <Disclaimer />
        </div>
      </div>
    </Shell>
  );
}

/* -------------------------------------------------------------------------- */

function SessionsPanel() {
  return (
    <aside className="vaasenk-rise hidden flex-col gap-4 xl:flex">
      <GlassCard className="p-4">
        <Button size="md" className="w-full" leadingIcon={<IconPlus width={16} height={16} />}>
          New chat
        </Button>
        <div className="mt-4 flex items-center gap-2 rounded-vaasenk-full border border-vaasenk-red/10 bg-white/65 px-3 py-2">
          <IconSearch width={14} height={14} />
          <input
            type="text"
            placeholder="Search sessions"
            className="w-full bg-transparent text-[13px] placeholder:text-vaasenk-subtle focus:outline-none"
          />
        </div>
      </GlassCard>

      <GlassCard className="p-2">
        <p className="px-3 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-vaasenk-muted">
          Recent sessions
        </p>
        <ul className="flex flex-col gap-1">
          {chatSessions.map((s, i) => (
            <li key={s.id}>
              <button
                className={`flex w-full flex-col gap-1 rounded-vaasenk-md px-3 py-3 text-left transition-colors hover:bg-white/65 ${i === 0 ? "bg-white/75 ring-1 ring-vaasenk-red/12" : ""}`}
              >
                <span className="line-clamp-1 text-[13.5px] font-bold text-vaasenk-deep-maroon">{s.title}</span>
                <span className="text-[11.5px] text-vaasenk-muted">{s.time} · {s.msgCount} msgs</span>
              </button>
            </li>
          ))}
        </ul>
      </GlassCard>
    </aside>
  );
}

/* -------------------------------------------------------------------------- */

function ChatHeader() {
  return (
    <HeroCard className="vaasenk-rise p-7">
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-4 text-white">
        <div className="flex items-center gap-4">
          <span className="flex h-12 w-12 items-center justify-center rounded-vaasenk-lg text-vaasenk-deep-maroon [background:var(--gradient-gold-card)] shadow-[var(--shadow-glow-gold)]">
            <IconRobot width={22} height={22} />
          </span>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-vaasenk-gold">Vaasenk AI</p>
            <h1 className="vaasenk-display text-[28px] font-black leading-tight">
              Class 10-A · Physics
            </h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status="ai_ready" />
          <span className="inline-flex items-center gap-1.5 rounded-vaasenk-full bg-white/15 px-3 py-1 text-[11px] font-bold uppercase tracking-wider backdrop-blur">
            <IconDoc width={11} height={11} />
            CBSE Physics 2025-26 v2
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-vaasenk-full bg-white/15 px-3 py-1 text-[11px] font-bold uppercase tracking-wider backdrop-blur">
            4 sample papers
          </span>
        </div>
      </div>
    </HeroCard>
  );
}

/* -------------------------------------------------------------------------- */

function ChatBody({ messages, loading }: { messages: Message[]; loading: boolean }) {
  return (
    <GlassCard className="flex flex-col gap-5 p-6 sm:p-8">
      <ul className="flex flex-col gap-5">
        {messages.map((m, i) =>
          m.role === "user" ? <UserBubble key={i} m={m} /> : <AssistantBubble key={i} m={m} />,
        )}
        {loading && <ThinkingBubble />}
      </ul>
    </GlassCard>
  );
}

function UserBubble({ m }: { m: Extract<Message, { role: "user" }> }) {
  return (
    <li className="flex items-start justify-end gap-3">
      <div className="max-w-[80%] rounded-vaasenk-2xl rounded-tr-md border border-vaasenk-red/12 bg-white px-5 py-3.5 shadow-[var(--shadow-card-soft)]">
        <p className="text-[14.5px] leading-relaxed text-vaasenk-deep-maroon">{m.content}</p>
        <p className="mt-1.5 text-right text-[11px] uppercase tracking-wider text-vaasenk-subtle">
          You · {m.timestamp}
        </p>
      </div>
      <Avatar name="Arun Subramanian" tone="orange" />
    </li>
  );
}

function AssistantBubble({ m }: { m: Extract<Message, { role: "assistant" }> }) {
  return (
    <li className="flex items-start gap-3">
      <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-vaasenk-full text-vaasenk-deep-maroon [background:var(--gradient-gold-card)] shadow-[var(--shadow-glow-gold)]">
        <IconRobot width={18} height={18} />
      </span>
      <div className="vaasenk-rise max-w-[88%] rounded-vaasenk-2xl rounded-tl-md border border-white/55 bg-[color:var(--vaasenk-cream-card)] px-5 py-4 shadow-[var(--shadow-card-soft)]">
        <div className="flex items-center justify-between border-b border-vaasenk-red/8 pb-2.5">
          <div className="flex items-center gap-2">
            <span className="text-[12.5px] font-extrabold text-vaasenk-deep-maroon">Vaasenk AI</span>
            <span className="h-1.5 w-1.5 rounded-full bg-vaasenk-gold" />
            <span className="text-[11.5px] uppercase tracking-wider text-vaasenk-muted">Grounded in syllabus</span>
          </div>
          <span className="text-[11px] text-vaasenk-subtle">{m.timestamp}</span>
        </div>

        <div className="mt-3 whitespace-pre-wrap text-[14.5px] leading-[1.65] text-vaasenk-ink">
          {renderMarkdown(m.content)}
        </div>

        {m.citations && m.citations.length > 0 && (
          <div className="mt-4 border-t border-vaasenk-red/8 pt-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-vaasenk-muted">
              Sources
            </p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {m.citations.map((c, i) => (
                <li
                  key={i}
                  className="group/cite relative inline-flex items-center gap-1.5 rounded-vaasenk-full bg-vaasenk-gold/20 px-3 py-1 text-[12px] font-bold text-vaasenk-deep-maroon transition-all hover:bg-vaasenk-gold/35"
                >
                  <IconDoc width={11} height={11} />
                  {c.doc} · p.{c.page}
                  <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-normal rounded-vaasenk-md bg-vaasenk-deep-maroon px-3 py-2 text-[11px] font-medium text-white shadow-[var(--shadow-card-float)] w-64 leading-relaxed group-hover/cite:block">
                    {c.snippet}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-vaasenk-red/8 pt-3">
          <Button variant="ghost" size="sm" leadingIcon={<IconCopy width={13} height={13} />}>Copy</Button>
          <Button variant="ghost" size="sm" leadingIcon={<IconDoc width={13} height={13} />}>Save as note</Button>
          <Button variant="ghost" size="sm" leadingIcon={<IconBolt width={13} height={13} />}>Convert to paper</Button>
          <Button variant="ghost" size="sm" leadingIcon={<IconRefresh width={13} height={13} />}>Regenerate</Button>
        </div>
      </div>
    </li>
  );
}

function ThinkingBubble() {
  return (
    <li className="flex items-start gap-3">
      <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-vaasenk-full text-vaasenk-deep-maroon [background:var(--gradient-gold-card)] shadow-[var(--shadow-glow-gold)]">
        <IconRobot width={18} height={18} />
      </span>
      <div className="rounded-vaasenk-2xl rounded-tl-md border border-white/55 bg-[color:var(--vaasenk-cream-card)] px-6 py-5 shadow-[var(--shadow-card-soft)]">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-vaasenk-red vaasenk-pulse-dot" />
          <span className="h-2 w-2 rounded-full bg-vaasenk-sunrise-orange vaasenk-pulse-dot" style={{ animationDelay: "0.18s" }} />
          <span className="h-2 w-2 rounded-full bg-vaasenk-gold vaasenk-pulse-dot" style={{ animationDelay: "0.36s" }} />
          <span className="ml-2 text-[12.5px] font-semibold text-vaasenk-muted">Retrieving syllabus chunks…</span>
        </span>
      </div>
    </li>
  );
}

/* -------------------------------------------------------------------------- */

function PromptChipsPanel({ onPick }: { onPick: (s: string) => void }) {
  return (
    <GlassCard className="p-5">
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-vaasenk-muted">
        <IconSparkle width={12} height={12} className="text-vaasenk-red" />
        Start with a board-pattern prompt
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {promptChips.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPick(p)}
            className="rounded-vaasenk-full border border-vaasenk-red/15 bg-white/65 px-3.5 py-2 text-left text-[13px] font-semibold text-vaasenk-deep-maroon transition-all hover:-translate-y-0.5 hover:border-vaasenk-red/40 hover:bg-white"
          >
            {p}
          </button>
        ))}
      </div>
    </GlassCard>
  );
}

/* -------------------------------------------------------------------------- */

function Composer({
  value,
  onChange,
  onSend,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="vaasenk-rise vaasenk-rise-delay-2">
      <div className="flex items-end gap-3 rounded-vaasenk-2xl border border-vaasenk-red/15 bg-white/85 p-2 pl-5 shadow-[var(--shadow-card-soft)] backdrop-blur-xl focus-within:border-vaasenk-red/40 focus-within:shadow-[0_0_0_4px_rgba(254,202,2,0.18),var(--shadow-card-soft)]">
        <textarea
          rows={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Ask about any chapter from your syllabus…"
          className="block max-h-40 min-h-[44px] flex-1 resize-none bg-transparent py-2 text-[14.5px] font-medium text-vaasenk-ink placeholder:text-vaasenk-subtle focus:outline-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
        />
        <Button onClick={onSend} disabled={disabled} size="md" trailingIcon={<IconArrowRight width={16} height={16} />}>
          Send
        </Button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function Disclaimer() {
  return (
    <div className="flex items-start gap-3 rounded-vaasenk-lg border border-vaasenk-red/10 bg-white/55 px-4 py-3 text-[12.5px] text-vaasenk-muted backdrop-blur">
      <IconShield width={16} height={16} className="mt-0.5 text-vaasenk-red" />
      <p>
        AI answers are grounded in <strong>CBSE Physics 2025-26 v2</strong> and 4 sample papers your admin uploaded.
        Verify before using in class or exams. Vaasenk AI refuses out-of-syllabus questions by design.
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

// Tiny inline markdown renderer for **bold**, *italic*, and numbered lines.
// Avoids pulling in a dependency for the demo.
function renderMarkdown(text: string) {
  return text.split("\n").map((line, i) => {
    const parts = line.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean);
    return (
      <span key={i} className="block">
        {parts.map((p, j) => {
          if (p.startsWith("**") && p.endsWith("**")) return <strong key={j} className="text-vaasenk-deep-maroon">{p.slice(2, -2)}</strong>;
          if (p.startsWith("*") && p.endsWith("*")) return <em key={j} className="text-vaasenk-muted">{p.slice(1, -1)}</em>;
          return <span key={j}>{p}</span>;
        })}
      </span>
    );
  });
}
