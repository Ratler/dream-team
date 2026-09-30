# Build Mode: Sequential

Read by the build skill when the spec frontmatter has `mode: sequential`. The build skill's shared sections (Instructions, Git Workflow, Build State, Resuming a Build, Report) still apply.

You execute tasks directly — no sub-agents.

**Follow the spec literally.** When the spec provides exact values (hex colors, string templates, element types, class names, timeout values, API parameters, units), use those exact values. Do not substitute your own preferences — the spec author chose specific values to ensure reproducible builds. If the spec says `#e57373`, use `#e57373` — not a "similar" red. If the spec says `createElement("div")`, use a div — not a p or span. If the spec says `timeout: 10000`, use 10000 — not 5000. Treat the spec as a blueprint, not a suggestion.

1. Create the feature branch (see Git Workflow).
2. Create all tasks via TaskCreate. Set dependencies so each task blocks on the previous.
3. If `frontend-design: true`, read `PLUGIN_ROOT/templates/frontend-design-guidelines.md`. When executing tasks that involve frontend/UI code, apply these guidelines along with the spec's `## Design Direction` section.
4. For each task in order:
   - Mark it `in_progress` via TaskUpdate.
   - Execute the task yourself — read files, write code, run commands.
   - When the spec gives exact values, use them verbatim. When the spec is silent on a detail, make a reasonable choice but keep it minimal.
   - If `playwright: true` and the task involves UI changes, verify visually using Playwright MCP tools (navigate, screenshot, interact, check console). If Playwright tools are not available, skip and note it.
   - Mark it `completed` via TaskUpdate.
5. **After completing all builder tasks and before the final code review task**: run a security review. Read the `security-reviewer` agent definition at `PLUGIN_ROOT/agents/security-reviewer.md` to load the security checklist. List all files changed on the feature branch (`git diff --name-only main...HEAD`). Read every changed file and work through the 7-category security checklist systematically. Report findings using Critical/Important/Minor severity. Fix any Critical or Important issues before proceeding to the code review task.
6. **After the security review and before the code review task**: run the documentation step. Read the `docs` agent definition at `PLUGIN_ROOT/agents/docs.md`. Read the spec's `## Documentation Requirements` section. List all files changed on the feature branch (`git diff --name-only main...HEAD`). Read every changed file. Produce all required documentation: README updates, changelog entries, API docs, and inline comments for complex logic. Commit documentation changes with `git add <files> && git commit -m "docs(<scope>): <description>"`.
7. **When you reach a code review task**: re-read every file you changed since the last commit, check for bugs, missing edge cases, security issues, and style problems. Fix anything you find. Then commit all changes from the reviewed task(s) and mark the review task as completed.
8. If a task fails: stop, report what succeeded and what failed, ask the user how to proceed.
9. After all tasks: run validation commands, check acceptance criteria.
