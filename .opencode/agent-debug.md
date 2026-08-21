# Agent Debug: code-writer Not Invoked

## Current Status (after restart)
- **code-writer IS registered** in `opencode agent list` — confirmed at the bottom of the output
- **Mode**: subagent ✓
- **Model**: unsloth-local/unsloth/Qwen3.5-9B-MTP-GGGUF
- **Permissions**: All tools enabled ✓

## Problem
User reports that @code-writer does not appear in autocomplete or get invoked when mentioned.

## Possible Causes

### 1. Model Not Resolving
The model `unsloth-local/unsloth/Qwen3.5-9B-MTP-GGUF` needs to be available. Check with:
```bash
opencode models --refresh | grep -i "Qwen"
```

If the model doesn't exist or isn't configured, the agent won't show up in autocomplete because it can't initialize.

### 2. Model Path Typo
The registry shows these models:
- `unsloth-local/mradermacher/Qwen3.6-28B-REAP-i1-GGUF` (current model being used)
- `unsloth-local/unsloth/Qwen3.5-9B-MTP-GGUF` ← code-writer's target

Verify the exact ID with `opencode models --refresh`.

### 3. File Not Being Watched
If running via `opencode serve`, the agent file must be at:
- **Project level**: `.opencode/agents/code-writer.md` ✓ (confirmed exists)
- **Global level**: `~/.config/opencode/agents/code-writer.md`

### 4. Server Needs Restart After File Changes
After creating/modifying agent files, the server must be restarted:
```bash
pkill -f "opencode serve" || true && opencode serve
```

## Diagnostic Steps
1. `opencode models --refresh | grep -i qwen` — verify model exists
2. `cat .opencode/agents/code-writer.md` — verify file content
3. If model ID is wrong, fix it in the YAML frontmatter and restart server
4. Try manually specifying the model via `--agent code-writer` when creating a session

## Resolution
- **Changed model** from `unsloth-local/unsloth/Qwen3.5-9B-MTP-GGUF` to `unsloth-local/mradermacher/Qwen3.6-28B-REAP-i1-GGUF` (known-working model)
- Restart server: `pkill -f "opencode serve" && opencode serve`
