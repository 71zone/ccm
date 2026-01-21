# CCM - Claude Code Extension Manager

A CLI tool to manage Claude Code configurations (agents, skills, commands, MCP) from multiple Git repositories.

## Installation

```bash
npm install -g @71zone/ccm
```

## Quick Start

```bash
# Add a repository
ccm add https://github.com/anthropics/claude-skills

# Interactive picker - select what you want
ccm use anth

# Check what's linked
ccm status
```

## Commands

### `ccm add <github-url>`

Clone a repository and register it as a source.

```bash
$ ccm add https://github.com/acme/claude-toolkit

✓ Cloned to ~/.local/share/ccm/repos/acme
✓ Detected: 3a 5s 2c 1m
✓ Registered as "acme"
```

### `ccm list` (alias: `ccm ls`)

Show all registered repositories.

```bash
$ ccm list

  acme  github.com/acme/claude-toolkit  3a  5s  2c  1m
  myco  github.com/myco/dotclaude        1a  0s  4c  0m
```

### `ccm remove <alias>` (alias: `ccm rm`)

Remove a repository and unlink all its assets.

```bash
$ ccm remove acme

Unlinked 4 assets. Removed repository.
```

### `ccm update [alias]`

Pull latest changes from registered repositories.

```bash
# Updates only repos with active selections
$ ccm update

# Updates all registered repos
$ ccm update -a

# Updates specific repo
$ ccm update acme
```

### `ccm show <alias>`

Display available assets in a repository.

```bash
$ ccm show acme

acme (acme/claude-toolkit)
├── agents/
│   ├── coder.md
│   └── reviewer.md
├── skills/
│   ├── coding/SKILL.md
│   └── debugging/SKILL.md
├── commands/
│   └── deploy.md
└── mcp/
    └── github.json
```

### `ccm use [alias]`

Interactive asset picker. Without alias, prompts for repository selection first.

```bash
$ ccm use acme

  ▾ agents/
    [x] coder.md
    [ ] reviewer.md
  ▾ skills/
    [x] coding/SKILL.md
    [ ] debugging/SKILL.md
  ▾ commands/
    [ ] deploy.md
  ▾ mcp/
    [ ] github.json

  ↑↓ navigate  space toggle  enter sync  q cancel

✓ Linked acme-coder.md → ~/.claude/agents/
✓ Linked acme-coding → ~/.claude/skills/
```

### `ccm unuse <alias>:<path>`

Remove a specific selection and its symlink.

```bash
$ ccm unuse acme:agents/coder.md

✓ Unlinked acme-coder.md
```

### `ccm status`

Show currently linked assets.

```bash
$ ccm status

agents/
  acme-coder.md     ✓
  myco-writer.md     ✗ broken
skills/
  acme-coding       ✓
mcp/
  (staged) acme:github.json, myco:filesystem.json

Run `ccm doctor cure` to fix broken links
Run `ccm mcp sync` to apply staged MCP configs
```

### `ccm doctor`

Check for issues.

```bash
$ ccm doctor

✗ Broken symlink: ~/.claude/agents/myco-writer.md
✗ Missing source: myco/agents/writer.md (deleted upstream?)
✓ 3 healthy link(s)

Run `ccm doctor cure` to auto-fix
```

### `ccm doctor cure`

Auto-fix issues (remove broken symlinks, clean orphaned selections).

```bash
$ ccm doctor cure

✓ Fixed 2 broken link(s)
```

### `ccm mcp show`

Preview merged MCP configuration.

```bash
$ ccm mcp show

# Merged from: acme:github.json, myco:filesystem.json

{
  "mcpServers": {
    "github": { ... },
    "filesystem": { ... }
  }
}
```

### `ccm mcp sync`

Build and apply merged MCP config to `~/.claude/mcp.json`.

```bash
$ ccm mcp sync

Preview:
  + github (from acme)
  + filesystem (from myco)

Apply to ~/.claude/mcp.json? [y/N] y
✓ Applied
```

## File Structure

```
~/.config/ccm/config.json     # Registry & selection state
~/.local/share/ccm/repos/     # Cloned repositories
~/.claude/                    # Output (symlinks)
  ├── agents/                 # Agent symlinks
  ├── skills/                 # Skill symlinks
  ├── commands/               # Command symlinks
  └── mcp.json               # Merged MCP config
```

## Asset Detection

Assets are detected by path patterns:

| Pattern | Type |
|---------|------|
| `*/agents/*.md` | Agent |
| `*/skills/*/SKILL.md` | Skill |
| `*/commands/*.md` | Command |
| `*mcp*.json` with `mcpServers` key | MCP config |

Fallback: parse YAML frontmatter (`tools`/`model` fields = Agent).

## Alias Generation

- Username ≤ 4 chars → use as-is
- Else → first 4 chars
- Collision → append number (acme, acme2)

## How It Works

- **Symlinks** for live updates (edits in source repos propagate automatically)
- **`git fetch && git reset --hard origin/<branch>`** for updates
- **Flat output structure** with namespace prefix (e.g., `acme-coder.md`)
- **MCP staging** - MCP configs are staged then merged on `ccm mcp sync`

## Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Development mode (watch)
pnpm dev
```

## Packages

| Package | Description |
|---------|-------------|
| `@71zone/ccm` | CLI tool |
| `@71zone/ccm-core` | Core library (repo management, asset detection, linking) |

## License

MIT
