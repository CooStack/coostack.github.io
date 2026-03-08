# Memorix — Automatic Memory Rules

You have access to Memorix memory tools. Follow these rules to maintain persistent context across sessions.

## Session Start — Load Context

At the **beginning of every conversation**, before responding to the user:

1. Call `memorix_search` with a query related to the user's first message or the current project
2. If results are found, use `memorix_detail` to fetch the most relevant ones
3. Reference relevant memories naturally in your response — the user should feel you "remember" them

This ensures you already know the project context without the user re-explaining.

## During Session — Capture Important Context

**Proactively** call `memorix_store` whenever any of the following happen:

### Architecture & Decisions
- Technology choice, framework selection, or design pattern adopted
- Trade-off discussion with a clear conclusion
- API design, database schema, or project structure decisions

### Bug Fixes & Problem Solving
- A bug is identified and resolved — store root cause + fix
- Workaround applied for a known issue
- Performance issue diagnosed and optimized

### Gotchas & Pitfalls
- Something unexpected or tricky is discovered
- A common mistake is identified and corrected
- Platform-specific behavior that caused issues

### Configuration & Environment
- Environment variables, port numbers, paths changed
- Docker, nginx, Caddy, or reverse proxy config modified
- Package dependencies added, removed, or version-pinned

### Deployment & Operations
- Server deployment steps (Docker, VPS, cloud)
- DNS, SSL/TLS certificate, domain configuration
- CI/CD pipeline setup or changes
- Database migration or data transfer procedures
- Server topology (ports, services, reverse proxy chain)
- SSH keys, access credentials setup (store pattern, NOT secrets)

### Project Milestones
- Feature completed or shipped
- Version released or published to npm/PyPI/etc.
- Repository made public, README updated, PR submitted

Use appropriate types: `decision`, `problem-solution`, `gotcha`, `what-changed`, `discovery`, `how-it-works`.

## Session End — Store Summary

When the conversation is ending or the user says goodbye:

1. Call `memorix_store` with type `session-request` to record:
   - What was accomplished in this session
   - Current project state and any blockers
   - Pending tasks or next steps
   - Key files modified

This creates a "handoff note" for the next session (or for another AI agent).

## Guidelines

- **Don't store trivial information** (greetings, acknowledgments, simple file reads, ls/dir output)
- **Do store anything you'd want to know if you lost all context**
- **Do store anything a different AI agent would need to continue this work**
- **Use concise titles** (~5-10 words) and structured facts
- **Include file paths** in filesModified when relevant
- **Include related concepts** for better searchability
- **Prefer storing too much over too little** — the retention system will auto-decay stale memories

<!-- codextools:auto-agent-rules:v1:start -->
# Workspace Agent Policy

- MUST use MCP server `CodexTools` tools for all code, file, and text operations.
- MUST NOT use shell commands, shell redirection, or shell text utilities for any code, file, or text operation.
- Read only with `mcp__CodexTools__fs_read_text` or `mcp__CodexTools__fs_read_texts`.
- Write/create/append only with `mcp__CodexTools__fs_write_text` or `mcp__CodexTools__fs_create`.
- Replace only with `mcp__CodexTools__fs_replace_text`, `mcp__CodexTools__fs_replace_regex`, or `mcp__CodexTools__fs_patch_lines`.
- Use `mcp__CodexTools__fs_list`, `mcp__CodexTools__fs_list_files`, `mcp__CodexTools__fs_stat`, and `mcp__CodexTools__fs_search_text` for discovery and search.
- Prefer `mcp__CodexTools__fs_read_texts` for disjoint multi-range reads.
- Prefer Codex native plan capability for substantial tasks; do not reimplement plan tools in this workspace.
- For OpenAI computer use or custom computer harness flows, call `computer_use_request_consent` before any native desktop or browser screenshot/action unless consent is already granted for the current session.
- If a step requires passwords, MFA, captchas, payment confirmation, or other sensitive manual input, do not automate it; use `computer_use_manual_prompt` and wait for the user.
- Use manual interaction mode for end-user input tools unless the user explicitly requests automation.
- Use `mcp__CodexTools__proc_run` only as a last resort when fs tools are insufficient, and explain why first.
- Use UTF-8 for text operations.
- Prefer non-`CodexTools` MCP tools for web interactions when available; use `CodexTools` web/browser tooling only when other MCP options do not provide the needed capability.
- Prefer minimal, targeted patches; do not modify unrelated code.
- When fixing a function, keep input/output contracts and key caller/callee behavior correct unless the user explicitly asks to change them.
- If the request is broad, ambiguous, or under-specified, ask follow-up questions before coding.
- Ask at most 3 questions per round; you may ask multiple rounds if needed.
- Do not write code until you are at least 95% confident you understand the user's goal, scope, and constraints.
- If confidence is below 95%, state the missing points briefly and continue clarifying.

<!-- codextools:auto-agent-rules:v1:start -->
# Agent Rules
- Follow project instructions for this workspace.
<!-- codextools:auto-agent-rules:v1:end -->
<!-- codextools:auto-agent-rules:v1:end -->
