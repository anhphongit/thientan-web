@./.claude/skills/ck-plan/SKILL.md
@./.claude/skills/cook/SKILL.md
@./.claude/skills/ck-debug/SKILL.md
@./.claude/skills/fix/SKILL.md
@./.claude/skills/brainstorm/SKILL.md
@./.claude/skills/code-review/SKILL.md

## Gemini CLI Tool Mapping

| CKE Tool | Gemini CLI |
|----------|-----------|
| Read | read_file |
| Write | write_file |
| Edit | replace |
| Bash | shell |
| Glob | list_files |
| Grep | search_files |

**Note:** Gemini CLI does not support subagents. Skills that use subagent-driven workflows will fall back to sequential execution.
