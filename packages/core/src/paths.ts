import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Get the CCM config directory path
 * ~/.config/ccm/
 */
export function getConfigDir(): string {
  return join(homedir(), ".config", "ccm");
}

/**
 * Get the CCM config file path
 * ~/.config/ccm/config.json
 */
export function getConfigPath(): string {
  return join(getConfigDir(), "config.json");
}

/**
 * Get the CCM data directory path
 * ~/.local/share/ccm/
 */
export function getDataDir(): string {
  return join(homedir(), ".local", "share", "ccm");
}

/**
 * Get the repos directory path
 * ~/.local/share/ccm/repos/
 */
export function getReposDir(): string {
  return join(getDataDir(), "repos");
}

/**
 * Get the Claude configuration directory path
 * ~/.claude/
 */
export function getClaudeDir(): string {
  return join(homedir(), ".claude");
}

/**
 * Get the Claude agents directory path
 * ~/.claude/agents/
 */
export function getAgentsDir(): string {
  return join(getClaudeDir(), "agents");
}

/**
 * Get the Claude skills directory path
 * ~/.claude/skills/
 */
export function getSkillsDir(): string {
  return join(getClaudeDir(), "skills");
}

/**
 * Get the Claude commands directory path
 * ~/.claude/commands/
 */
export function getCommandsDir(): string {
  return join(getClaudeDir(), "commands");
}

/**
 * Get the Claude MCP config path
 * ~/.claude/mcp.json
 */
export function getMcpConfigPath(): string {
  return join(getClaudeDir(), "mcp.json");
}
