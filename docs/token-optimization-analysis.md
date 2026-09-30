# Token Optimization Analysis

Date: 2026-07-06
Scope: full dream-team harness — skills, agents, commands, hooks, templates.
Constraint: no quality regressions; no changes to the key behavior of skill or agent instructions. All savings come from *where* content is loaded, not *what* agents are instructed to do.

Status: **Tier 1 and Tier 2 implemented** (see Implementation Status at the bottom). Tier 3 and the rejected items are documented for future consideration.

## Where the tokens go

The harness's cost has four layers, with very different multipliers:

| Layer | Size (before) | Paid how often |
|---|---|---|
| SessionStart injection + skill/command listings | ~600 tokens | Every session in every project with the plugin installed, even sessions that never use dream-team |
| `skills/build/SKILL.md` | ~7.6k tokens (30 KB) | Once per build, held in orchestrator context for the entire build |
| `agents/*.md` read wholesale by the orchestrator | ~15.4k tokens (61.5 KB) | Once per delegated/team build and once per delegated/team spec-writing run |
| Per-dispatch prompt content (dispatch template, pasted guidelines) | 0.6k–4k tokens each | Every agent dispatch; accumulates in the orchestrator transcript, which is re-sent on every subsequent orchestrator turn |

The most expensive tokens are the ones in the **orchestrator's context**, because that context is replayed on every API call for the whole build and survives (or forces) compactions. That is where the biggest wins are — none of them touch a behavioral instruction.

## Tier 1 — structural wins, zero behavior change

### 1. Stop reading all 11 agent definitions into the orchestrator (~15k tokens per build and per spec-write)

Delegated mode step 2, team mode pre-flight step 3, and spec-delegated/spec-team step 2 all said "read agent definitions from `agents/*.md`" — 61.5 KB into the orchestrator's context. Those files are the *sub-agents'* system prompts; each spawned agent gets its full definition automatically. The orchestrator only needs dispatch parameters (model, isolation, reuse, capability one-liner).

**Fix**: `agents/MANIFEST.md` — a ~350-token dispatch table. Orchestrators and spec writers read the manifest; the full definitions are never loaded outside the agent they belong to. Bonus: the model roster previously appeared in five places (CLAUDE.md, session_start.js, 3× in the build skill) — the manifest is now the single source of truth, killing drift risk.

### 2. Split the build skill by mode (~2.7–4.5k tokens per build)

`skills/build/SKILL.md` (30 KB) contained all three execution strategies, but exactly one runs per build. After the split the orchestrator loads the 9 KB shared file plus one mode file: sequential ≈ 12 KB (saves ~4.5k tokens), delegated/team ≈ 19 KB (saves ~2.7k tokens — those mode files each carry their own Playwright and Frontend Design blocks).

**Fix**: SKILL.md keeps the shared material (variables, instructions, git workflow, build state, resume, final report); each strategy lives in `skills/build/modes/{sequential,delegated,team}.md`, loaded only after the spec's `mode` frontmatter is parsed. Same words, different file layout — one extra Read call.

### 3. Stop pasting frontend-design-guidelines.md into every builder dispatch (~3.3k tokens per builder dispatch)

With `frontend-design: true`, the orchestrator read the 13.4 KB guidelines file and pasted its full content into *every* builder prompt. With 5 UI builders that is ~16.5k tokens of identical content accumulated in the orchestrator transcript, replayed on every subsequent orchestrator turn.

**Fix**: the dispatch block now pastes only the spec's `## Design Direction` section (small, per-project) plus an instruction for the builder to Read the guidelines file itself before writing UI code. The builder pays the same 3.3k once in its own context — identical guidance reaches the code — but the orchestrator never carries it. The same fix applies to the plan skill's Phase 4, which pointed at the full guidelines file just to describe aesthetic options; the option one-liners are now inlined, and the file is read only if the user wants more options.

### 4. Deduplicate the dispatch template against agent definitions (~300–400 tokens per dispatch)

The delegated Agent Dispatch Template re-stated the TDD loop, the commit protocol, and the TaskUpdate/report protocol — all already present in `builder.md`'s Workflow and Completion Protocol sections, which every builder receives as its system prompt. Across builders, retries, and fix-loop re-dispatches this compounds; a review fix-loop hitting Max Retries pays it 4×.

**Fix**: the template keeps the task-specific parts (description, file scope, acceptance criteria, tests, literal-spec-adherence note) and replaces the three duplicated blocks with a one-line pointer to the agent definition's Workflow and Completion Protocol.

## Tier 2 — per-session overhead (small each, huge multiplier)

### 5. Trim the SessionStart injection (~280 tokens on every session, all projects)

The injected guide was ~430 tokens; its "Available Agents" section (~200 tokens) duplicated the agent descriptions Claude Code already injects into the "Available agent types" list from each agent's frontmatter.

**Fix**: ~140-token version — workflow, the five commands, one line pointing at the Agent tool's agent-type list for agent descriptions. Full details live in the skills, which load when actually invoked.

### 6. Shorten command frontmatter descriptions (~100–150 tokens per session)

Each command *and* its skill both register in the available-skills list, so every dream-team entry appeared twice with a full description. The skill description drives model invocation and stays rich; the command description only needs to serve autocomplete.

**Fix**: command descriptions cut to a few words each.

## Tier 3 — smaller, optional (not implemented)

7. **Sequential mode's security/docs steps** read the full `security-reviewer.md` (10 KB) and `docs.md` (5 KB) just to borrow the checklist and requirements logic. Extracting the 7-category checklist into a shared `templates/security-checklist.md` referenced by both the agent and the sequential skill would save ~1.5k tokens per sequential build, at the cost of shared-file indirection.
8. **Validator evidence quoting**: `validator.md` says "Do not summarize — quote the output." For a large test suite that can be thousands of tokens of verbatim output copied into the report (which then lives in the task description and the orchestrator context). Adding "quote the decisive lines; for long output, the first/last 20 lines" would preserve pass/fail-with-evidence behavior at a fraction of the cost. Slightly touches an agent instruction — opt-in only.
9. **CLAUDE.md** (~1.9k tokens) is dev-repo-only cost; its agent/model roster was replaced with a pointer to the manifest.

## Considered and rejected (quality would be at risk)

- **Model downgrades** (builder/architect/debugger/security-reviewer are opus): the biggest *dollar* lever by far, but it directly trades quality. The tiering is already sensible — haiku for the validator, sonnet for the mid-tier. Only revisit with evals. (In 0.10.0 three roles moved *up* a tier on quality grounds — reviewer and merger to opus, scout to sonnet — see RELEASE-NOTES.md.)
- **Trimming agent persona prose** (~150–250 tokens per agent): role-priming plausibly contributes to output quality; agent instructions are out of scope per the constraint.
- **Compressing spec verbosity**: the spec-writing guide's exact-values discipline is what makes builds deterministic. Loosening it saves tokens and costs quality.
- **Making agents read the spec instead of receiving full task text**: the current "give the agent everything" pattern is already the cheaper option (task slice < whole spec).

## Side finding (correctness, not tokens)

Team mode completion step 18 said to fix Critical security findings by spawning a fresh builder "with `isolation: "worktree"`" — but team mode explicitly does not support worktree isolation (per the same skill's Commit After Completion section and CLAUDE.md). Fixed while restructuring: the worktree clause is dropped in `modes/team.md`. Delegated mode had a related contradiction — step 8 said to *resume* the builder to fix security findings, but builders are never reused (their worktree is gone). It now spawns a fresh worktree builder and merges its branch.

## Expected impact

For a representative delegated build (5 builder tasks + reviews, scout×2, security, docs, validator, frontend enabled), Tier 1 removes roughly **35–40k tokens from the orchestrator's working context**, paid repeatedly across every orchestrator turn — realistically a 20–30% reduction in orchestrator input tokens, plus later/fewer compactions (compactions are themselves a quality risk on long builds, so this mildly *helps* quality). Spec-writing for delegated/team drops ~15k per run. Every session across all projects saves ~400–550 tokens of dead injection. Nothing any agent is instructed to do has changed — the savings come entirely from not carrying other agents' prompts, other modes' strategies, and duplicated blocks in contexts that never use them.

## Implementation Status

| # | Change | Status |
|---|---|---|
| 1 | `agents/MANIFEST.md` dispatch table; orchestrators/spec writers no longer read `agents/*.md` | Done |
| 2 | Build skill split into `SKILL.md` (shared) + `skills/build/modes/{sequential,delegated,team}.md` | Done |
| 3 | Frontend design guidelines by reference in dispatch prompts; plan skill inlines aesthetic one-liners | Done |
| 4 | Dispatch template deduplicated against agent definitions | Done |
| 5 | SessionStart injection trimmed (~430 → ~140 tokens) | Done |
| 6 | Command descriptions shortened | Done |
| — | Team-mode step 18 worktree contradiction removed; delegated step 8 "resume builder" replaced with fresh builder + merge | Done |
| — | Tester commits its own test files (commit step was lost when the dispatch template was deduplicated) | Done |
| — | Mode files use `PLUGIN_ROOT` (defined in `SKILL.md`) since `${CLAUDE_PLUGIN_ROOT}` is not expanded in files opened with Read | Done |
| 7–9 | Tier 3 items | Not implemented (documented above) |
