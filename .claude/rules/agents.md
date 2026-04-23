---
description: Agent spawning rules for the MrGovCon platform — when to delegate, which subagent, how to brief
scope: project
appliesTo: Agent, Task
---

# Agent Rules — MrGovCon / BANKV Engine

## Context
This is a multi-tenant SaaS (Mercy Raine LLC) with 3 operating firms: FiveGates Technologies (Mr GovCon), Mr Freight Broker, Mercy Raine LLC. Always scope agent prompts with `consultingFirmId` context when relevant.

## Decision Tree: When to Spawn an Agent

| Situation | Action |
|---|---|
| Known file path, known change | Direct tool (Read/Edit). **Do not spawn.** |
| Single `grep` or `glob` away from answer | Direct tool. **Do not spawn.** |
| 3+ queries to locate symbol across codebase | `subagent_type: Explore`, thoroughness: medium |
| Open-ended "how does X work" across multiple files | `subagent_type: Explore`, thoroughness: very thorough |
| Design an implementation before coding (non-trivial) | `subagent_type: Plan` |
| Multi-file refactor with research + edits | `general-purpose` (only when explicitly asked) |
| User asks Claude Code / API / SDK question | `subagent_type: claude-code-guide` |
| Status line config | `subagent_type: statusline-setup` |

**Hard rule:** Do not spawn agents unless the user explicitly asks, OR the task genuinely exceeds direct-tool capacity (>3 search iterations expected).

## Required Briefing Elements

Every agent prompt must include:
1. **Goal** — one sentence, outcome-focused
2. **Context loaded** — what the parent already knows (so the agent doesn't re-derive)
3. **Constraints** — multi-tenancy scope, file paths to skip, models to prefer
4. **Expected output** — format, length cap ("under 200 words")
5. **Authorization** — "research only" vs "write code"

## Template
```
Goal: <one sentence>

Context:
- Parent has already verified: <list>
- Relevant paths: <backend/src/routes/X.ts, frontend/src/components/Y.tsx>
- Tenant scope: consultingFirmId from JWT

Constraints:
- Do NOT modify <files/areas>
- Prefer <specific pattern / tool>
- <any multi-firm or branding considerations>

Deliverable:
- <research report | code changes | both>
- <under N words>
```

## Multi-Firm Awareness

When the task involves firm data:
- Specify which firm: `FiveGates Technologies` (633962dd...), `Mr Freight Broker` (8215901d...), `Mercy Raine LLC` (34a4e6db...), or "all firms"
- Remind agent that all queries must filter by `consultingFirmId`
- Never let an agent fetch data cross-firm without an explicit parent-supplied justification

## Parallelism Rules

- Independent research queries → send one message with multiple Agent calls in parallel
- Sequential dependencies → one at a time; wait for result before next
- Never run Explore + Plan in parallel on the same topic — Plan needs Explore's output

## Background vs Foreground

- **Foreground (default):** you need the result to proceed
- **Background (`run_in_background: true`):** you have independent work to do meanwhile (e.g., agent scans routes while you edit a component)
- **Do not poll** a background agent — you'll get a notification when it completes

## Trust but Verify

An agent's summary describes intent, not verified output. When an agent writes/edits code:
1. Read the actual changes
2. Run TypeScript check (`npx tsc --noEmit`)
3. Spot-check one critical file

## Anti-Patterns

- ❌ "Research and then fix it" — the agent can't judge what "fix" means; you do that.
- ❌ Spawning Explore for a single `grep` query
- ❌ Passing "based on your findings, implement X" — you implement, using the findings
- ❌ Letting an agent span >3 tool calls without a focused goal
- ❌ Spawning in "auto" mode when the task is actually straightforward

## When the User Says "Use a Subagent"

- Match their named type exactly (`Explore`, `Plan`, `general-purpose`, `claude-code-guide`, `statusline-setup`)
- If they don't specify type and it's open-ended research, default to `Explore`
- If they don't specify type and it's design work, default to `Plan`

## Reference
See `PROGRAM_VISION.md` at project root for full architectural context before briefing agents on architecture-sensitive tasks.
