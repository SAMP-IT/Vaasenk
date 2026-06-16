# `.claude/agents/` — project-level Claude Code agents

This directory exists for project-level Claude Code subagent overrides per
[Claude Code's agent system](https://docs.claude.com/en/docs/claude-code/sub-agents).

## Current state — empty by design

Vaasenk relies entirely on the **global** Claude Code agent ecosystem
(Backend Architect, DevOps Engineer, Frontend Developer, Reality Checker,
Security Engineer, etc.) shipped through the user-installed agent plugins
and the built-in roster. No project-specific agent personas have been
authored for this repo yet.

The agent personas used by the team are listed in the playbook at
`docs/Vaasenk_Development_Playbook.md` §4 (Part 4: Agent Workflow Protocol).

## When to add a project-level agent here

Add a custom agent file here only when one of these is true:

1. **The global agent's persona drifts from Vaasenk's conventions** in a way
   that can't be fixed with `CLAUDE.md` instructions or a project skill.
2. **The work is uniquely Vaasenk** (e.g., a "Samacheer Kalvi PDF Extraction
   Engineer" that doesn't generalise) and one of the existing global
   personas is the wrong shape.
3. **You need a specific tool allowlist** that the global persona doesn't
   provide.

For everyday Vaasenk-specific guidance (multi-tenant patterns, design
tokens, the 5 component states), the operational guidance lives in
`.claude/skills/vaasenk-component/SKILL.md` and
`.claude/skills/vaasenk-api/SKILL.md` — **prefer extending skills over
forking agents**. Skills are scoped, opt-in, and don't change the tool
surface; new agents do all three.

## File format

When you do add a project-level agent, follow the standard Claude Code
agent file shape:

```markdown
---
name: agent-name-kebab-case
description: When to use this agent (read by the dispatcher to decide invocation).
tools: [...]  # optional; omit to inherit the parent's tools
model: sonnet # optional
---

# Agent persona body
...
```

Drop the file in `.claude/agents/<name>.md`. It becomes available to the
`Agent` tool the next session a Claude Code instance opens this repo.
