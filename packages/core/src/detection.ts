import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, dirname, extname, join, relative } from "node:path";
import { glob } from "tinyglobby";
import type { Asset, AssetType, DetectionResult, McpConfig } from "./types.js";

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
 * Scans for any 'agents' folder at any depth and finds .md files within
 * Also detects .md files with agent frontmatter anywhere in the repo
 */
async function detectAgents(repoPath: string): Promise<Asset[]> {
  const assets: Asset[] = [];
  const seenPaths = new Set<string>();

  // Find all .md files inside any 'agents' folder at any depth
  const agentFiles = await glob("**/agents/**/*.md", {
    cwd: repoPath,
    ignore: ["**/node_modules/**", "**/.*/**"],
    absolute: true,
  });

  for (const file of agentFiles) {
    const relativePath = relative(repoPath, file);
    if (!seenPaths.has(relativePath)) {
      seenPaths.add(relativePath);
      assets.push(createAsset(repoPath, file, "agent"));
    }
  }

  // Also check for .md files with agent frontmatter anywhere (not in agents folders)
  const allMdFiles = await glob("**/*.md", {
    cwd: repoPath,
    ignore: ["**/node_modules/**", "**/.*/**", "**/agents/**"],
    absolute: true,
  });

  for (const file of allMdFiles) {
    if (await hasAgentFrontmatter(file)) {
      const relativePath = relative(repoPath, file);
      if (!seenPaths.has(relativePath)) {
        seenPaths.add(relativePath);
        assets.push(createAsset(repoPath, file, "agent"));
      }
    }
  }

  return assets;
}

/**
 * Detect skills in a repository
 * Scans for any 'skills' folder at any depth and finds SKILL.md files within subdirectories
 */
async function detectSkills(repoPath: string): Promise<Asset[]> {
  const assets: Asset[] = [];
  const seenPaths = new Set<string>();

  // Find all SKILL.md files inside any 'skills' folder at any depth
  // Pattern: **/skills/*/SKILL.md (skill name is the parent directory)
  const skillFiles = await glob("**/skills/*/SKILL.md", {
    cwd: repoPath,
    ignore: ["**/node_modules/**", "**/.*/**"],
    absolute: true,
  });

  for (const file of skillFiles) {
    const relativePath = relative(repoPath, file);
    if (!seenPaths.has(relativePath)) {
      seenPaths.add(relativePath);
      // Skill name is the parent directory name
      const skillName = basename(dirname(file));
      assets.push({
        type: "skill",
        path: relativePath,
        name: skillName,
      });
    }
  }

  return assets;
}

/**
 * Detect commands in a repository
 * Scans for any 'commands' folder at any depth and finds .md files within
 */
async function detectCommands(repoPath: string): Promise<Asset[]> {
  const assets: Asset[] = [];
  const seenPaths = new Set<string>();

  // Find all .md files inside any 'commands' folder at any depth
  const commandFiles = await glob("**/commands/**/*.md", {
    cwd: repoPath,
    ignore: ["**/node_modules/**", "**/.*/**"],
    absolute: true,
  });

  for (const file of commandFiles) {
    const relativePath = relative(repoPath, file);
    if (!seenPaths.has(relativePath)) {
      seenPaths.add(relativePath);
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
  const seenPaths = new Set<string>();

  // Find all JSON files with "mcp" in the name
  const mcpFiles = await glob("**/*mcp*.json", {
    cwd: repoPath,
    ignore: ["**/node_modules/**", "**/.*/**"],
    absolute: true,
  });

  for (const file of mcpFiles) {
    if (await isMcpConfig(file)) {
      const relativePath = relative(repoPath, file);
      if (!seenPaths.has(relativePath)) {
        seenPaths.add(relativePath);
        assets.push(createAsset(repoPath, file, "mcp"));
      }
    }
  }

  // Also check common locations
  const commonPaths = ["mcp.json", ".mcp.json", "config/mcp.json"];
  for (const p of commonPaths) {
    const fullPath = join(repoPath, p);
    if (existsSync(fullPath) && (await isMcpConfig(fullPath))) {
      if (!seenPaths.has(p)) {
        seenPaths.add(p);
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
