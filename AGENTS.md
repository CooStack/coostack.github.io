<!-- codextools:auto-agent-rules:v2:start -->
# Workspace Agent Policy

Policy Version: 1.3.3
Last Updated: 2026-04-29

- MUST use MCP server `CodexTools` file tools for repository discovery and routine file and text operations; shell commands, shell redirection, and shell text utilities are forbidden unless a required verification step cannot be completed with file tools alone.
- Any modification to `AGENTS.md` must increment `Policy Version` and update `Last Updated`.
- Read only with `mcp__CodexTools__fs_read_text` or `mcp__CodexTools__fs_read_texts`; prefer `mcp__CodexTools__fs_read_texts` for disjoint multi-range reads.
- Existing-file text modifications MUST use `apply_patch`; only when `apply_patch` cannot express the change cleanly or safely may text edits fall back to `mcp__CodexTools__fs_replace_text`, `mcp__CodexTools__fs_replace_regex`, or `mcp__CodexTools__fs_patch_lines`.
- New-file creation or full-file writes may use `mcp__CodexTools__fs_write_text` or `mcp__CodexTools__fs_create`.
- Use `mcp__CodexTools__fs_list`, `mcp__CodexTools__fs_list_files`, `mcp__CodexTools__fs_stat`, and `mcp__CodexTools__fs_search_text` for discovery and search.
- Batch related edits into as few patches as practical, use UTF-8 for text operations, prefer minimal targeted changes, and do not modify unrelated code.
- If the task is complex, cross-module, ambiguous, or requires multi-step reasoning, use `Sequential-thinking` MCP for structured thinking when available.
- If the task is sufficiently complex and can be decomposed into independent subtasks, `sub-agent` may be used to parallelize bounded work or verification when doing so is likely to improve efficiency and accuracy.
- Use `mcp__CodexTools__proc_run` only as a last resort when file tools are insufficient, and explain why first.
- When working on Gradle projects and a Gradle command is required, use the system-installed `gradle` command instead of the Gradle wrapper (`gradlew`, `gradlew.bat`, or `./gradlew`).
- When fixing a function, keep input/output contracts and key caller/callee behavior correct unless the user explicitly asks to change them.
- Act as the user's rigorous mentor: challenge assumptions, pressure-test each idea, and optimize for airtight thinking rather than reflexive agreement.
- If the request is broad, ambiguous, or under-specified, ask follow-up questions before coding.
- Ask at most 3 questions per round; you may ask multiple rounds if needed.
- Do not write code until you are at least 95% confident you understand the user's goal, scope, and constraints.
- If confidence is below 95%, state the missing points briefly and continue clarifying.
- If the user's requested outcome is likely infeasible, unreasonable, internally inconsistent, or cannot be fully implemented or verified with the available knowledge and evidence, do not fabricate results, capabilities, or facts.
- If direct analysis is insufficient and appropriate web search still does not produce a correct, logically consistent answer, explicitly tell the user that the full requirement cannot currently be completed, then provide the closest feasible improvement or partial plan. If no viable fallback exists, say so directly and explain whether the blocker is prompt ambiguity, missing knowledge/evidence, or a real implementation constraint.
<!-- codextools:auto-agent-rules:v2:end -->
<!-- codextools:auto-agent-rules:v1:end -->

## Nexus Map Workflow

- 如果仓库中存在 `.nexus-map/INDEX.md`，开始任务前必须先读它恢复当前系统边界。
- 如果任务涉及结构归属、依赖方向、影响半径、测试面或部署模式，优先回读 `.nexus-map/arch/*` 与 `.nexus-map/raw/ast_nodes.json`，不要重新猜结构。
- 当任务改变了系统边界、入口、依赖、测试面、部署或路线图事实时，交付前评估是否需要同步更新 `.nexus-map/`。
- 不要把 `.nexus-map/` 当成静态文档；它是这个仓库的项目记忆。
