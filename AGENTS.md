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

<!-- codextools:auto-agent-rules:v2:start -->
# Workspace Agent Policy

Policy Version: 1.0.0
Last Updated: 2026-03-12

- MUST use MCP server `CodexTools` tools for repository discovery, reads, and routine code, file, and text operations; for existing-file manual edits, MUST use `apply_patch` by default.
- MUST NOT use shell commands, shell redirection, or shell text utilities for any code, file, or text operation.
- Any modification to `AGENTS.md` must increment `Policy Version` and update `Last Updated`.
- Read only with `mcp__CodexTools__fs_read_text` or `mcp__CodexTools__fs_read_texts`.
- Write/create/append only with `mcp__CodexTools__fs_write_text` or `mcp__CodexTools__fs_create`.
- MUST use `apply_patch` for manual code patch modifications by default. Only when `apply_patch` cannot express the required text change cleanly or safely may you use `mcp__CodexTools__fs_replace_text`, `mcp__CodexTools__fs_replace_regex`, or `mcp__CodexTools__fs_patch_lines`.
- For existing-file edits, use `apply_patch` unless you have a concrete reason it cannot handle the text change cleanly; compatible IDE clients can then present structured edited-file/diff UI.
- Avoid `mcp__CodexTools__fs_write_text` for modifying existing files unless a full rewrite is genuinely safer or the patch tools cannot express the change cleanly.
- Batch related edits into as few `apply_patch` operations as practical to improve edited-file grouping in compatible clients such as Claude Code GUI IDEA integrations.
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

## Nexus Map And Structure Rules

- `.nexus-map/` 存在时：开始任务前必须先读 `INDEX.md` 恢复上下文，并按其中的路由块决定下一步动作。
- `.nexus-map/` 不存在时：跨模块或接口修改前，先向用户提议运行 `nexus-mapper`；若用户需立即开始，至少先运行 `query_graph.py --summary` 建立结构感知，不要对陌生仓库盲改核心接口。
- 结构查询：任何时候需要判断依赖关系、影响半径或边界归属，优先用 `query_graph.py` 验证，不要凭目录名猜测。
- 知识库同步：任务中若改变了系统边界、入口或依赖关系，完成后评估是否需要重新运行 `nexus-mapper` 更新 `.nexus-map`。
<!-- codextools:auto-agent-rules:v2:end -->


<!-- codextools:auto-agent-rules:v1:end -->

## Nexus Map Workflow

- 如果仓库中存在 `.nexus-map/INDEX.md`，开始任务前必须先读它恢复当前系统边界。
- 如果任务涉及结构归属、依赖方向、影响半径、测试面或部署模式，优先回读 `.nexus-map/arch/*` 与 `.nexus-map/raw/ast_nodes.json`，不要重新猜结构。
- 当任务改变了系统边界、入口、依赖、测试面、部署或路线图事实时，交付前评估是否需要同步更新 `.nexus-map/`。
- 不要把 `.nexus-map/` 当成静态文档；它是这个仓库的项目记忆。
