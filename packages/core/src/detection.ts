import { existsSync } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import { basename, extname, join, relative } from "node:path";
import type { Asset, AssetType, DetectionResult, McpConfig } from "./types.js";

/**
 * Recursively find all files matching a pattern in a directory
 */
async function findFiles(dir: string, pattern: RegExp): Promise<string[]> {
  const results: string[] = [];

  if (!existsSync(dir)) {
    return results;
  }

  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    // Skip hidden directories and node_modules
    if (entry.name.startsWith(".") || entry.name === "node_modules") {
      continue;
    }

    if (entry.isDirectory()) {
      const subResults = await findFiles(fullPath, pattern);
      results.push(...subResults);
    } else if (entry.isFile() && pattern.test(entry.name)) {
      results.push(fullPath);
    }
  }

  return results;
}

/**
 * Check if a file has YAML frontmatter with agent-like fields
 */
async function hasAgentFrontmatter(filePath: string): Promise<boolean> {
  try {
    const content = await readFile(filePath, "utf-8");
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);

    if (!frontmatterMatch?.[1]) {
      return false;
    }

    const frontmatter = frontmatterMatch[1].toLowerCase();
    return frontmatter.includes("tools") || frontmatter.includes("model");
  } catch {
    return false;
  }
}

/**
 * Check if a JSON file is an MCP config (has mcpServers key)
 */
async function isMcpConfig(filePath: string): Promise<boolean> {
  try {
    const content = await readFile(filePath, "utf-8");
    const parsed = JSON.parse(content) as Record<string, unknown>;
    return "mcpServers" in parsed;
  } catch {
    return false;
  }
}

/**
 * Create an Asset object from a file path
 */
function createAsset(repoPath: string, filePath: string, type: AssetType): Asset {
  const relativePath = relative(repoPath, filePath);
  const ext = extname(filePath);
  const name = basename(filePath, ext);

  return {
    type,
    path: relativePath,
    name,
  };
}

/**
 * Detect agents in a repository
 * Pattern: * /agents/*.md
 */
async function detectAgents(repoPath: string): Promise<Asset[]> {
  const assets: Asset[] = [];

  // Look for agents directory
  const agentsDir = join(repoPath, "agents");
  if (existsSync(agentsDir)) {
    const files = await findFiles(agentsDir, /\.md$/i);
    for (const file of files) {
      assets.push(createAsset(repoPath, file, "agent"));
    }
  }

  // Also check for .md files with agent frontmatter in root
  const rootMdFiles = await findFiles(repoPath, /\.md$/i);
  for (const file of rootMdFiles) {
    // Skip if already in agents directory
    if (file.includes("/agents/")) continue;

    if (await hasAgentFrontmatter(file)) {
      assets.push(createAsset(repoPath, file, "agent"));
    }
  }

  return assets;
}

/**
 * Detect skills in a repository
 * Pattern: * /skills/* /SKILL.md
 */
async function detectSkills(repoPath: string): Promise<Asset[]> {
  const assets: Asset[] = [];

  // Look for skills directory
  const skillsDir = join(repoPath, "skills");
  if (existsSync(skillsDir)) {
    const entries = await readdir(skillsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skillFile = join(skillsDir, entry.name, "SKILL.md");
        if (existsSync(skillFile)) {
          assets.push({
            type: "skill",
            path: relative(repoPath, skillFile),
            name: entry.name,
          });
        }
      }
    }
  }

  return assets;
}

/**
 * Detect commands in a repository
 * Pattern: * /commands/*.md
 */
async function detectCommands(repoPath: string): Promise<Asset[]> {
  const assets: Asset[] = [];

  // Look for commands directory
  const commandsDir = join(repoPath, "commands");
  if (existsSync(commandsDir)) {
    const files = await findFiles(commandsDir, /\.md$/i);
    for (const file of files) {
      assets.push(createAsset(repoPath, file, "command"));
    }
  }

  return assets;
}

/**
 * Detect MCP configs in a repository
 * Pattern: *mcp*.json with mcpServers key
 */
async function detectMcp(repoPath: string): Promise<Asset[]> {
  const assets: Asset[] = [];

  // Find all JSON files with "mcp" in the name
  const jsonFiles = await findFiles(repoPath, /mcp.*\.json$/i);

  for (const file of jsonFiles) {
    if (await isMcpConfig(file)) {
      assets.push(createAsset(repoPath, file, "mcp"));
    }
  }

  // Also check common locations
  const commonPaths = ["mcp.json", ".mcp.json", "config/mcp.json"];
  for (const p of commonPaths) {
    const fullPath = join(repoPath, p);
    if (existsSync(fullPath) && (await isMcpConfig(fullPath))) {
      // Avoid duplicates
      if (!assets.some((a) => a.path === p)) {
        assets.push(createAsset(repoPath, fullPath, "mcp"));
      }
    }
  }

  return assets;
}

/**
 * Detect all assets in a repository
 */
export async function detectAssets(repoPath: string): Promise<DetectionResult> {
  const [agents, skills, commands, mcp] = await Promise.all([
    detectAgents(repoPath),
    detectSkills(repoPath),
    detectCommands(repoPath),
    detectMcp(repoPath),
  ]);

  return {
    agents,
    skills,
    commands,
    mcp,
  };
}

/**
 * Get all assets as a flat array
 */
export function flattenAssets(result: DetectionResult): Asset[] {
  return [...result.agents, ...result.skills, ...result.commands, ...result.mcp];
}

/**
 * Get asset counts summary
 */
export function getAssetCounts(
  result: DetectionResult
): Record<AssetType, number> {
  return {
    agent: result.agents.length,
    skill: result.skills.length,
    command: result.commands.length,
    mcp: result.mcp.length,
  };
}

/**
 * Get individual MCP server names from an MCP config file
 */
export async function getMcpServers(filePath: string): Promise<string[]> {
  try {
    const content = await readFile(filePath, "utf-8");
    const config = JSON.parse(content) as McpConfig;
    return Object.keys(config.mcpServers ?? {});
  } catch {
    return [];
  }
}
