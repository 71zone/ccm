import { existsSync, lstatSync, readlinkSync } from "node:fs";
import { mkdir, readFile, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import { getNamespacedFilename } from "./alias.js";
import {
  addSelection,
  clearStagedMcp,
  getRepository,
  getSelections,
  getStagedMcp,
  removeSelection,
  stageMcpServer,
  unstageMcpServer,
} from "./config.js";
import {
  getAgentsDir,
  getClaudeDir,
  getCommandsDir,
  getMcpConfigPath,
  getSkillsDir,
} from "./paths.js";
import type {
  Asset,
  AssetType,
  DiagnosisResult,
  LinkHealth,
  McpConfig,
  Selection,
} from "./types.js";

/**
 * Get the target directory for an asset type
 */
function getTargetDir(type: AssetType): string {
  switch (type) {
    case "agent":
      return getAgentsDir();
    case "skill":
      return getSkillsDir();
    case "command":
      return getCommandsDir();
    case "mcp":
      throw new Error("MCP assets should not be directly linked");
  }
}

/**
 * Ensure a directory exists
 */
async function ensureDir(dir: string): Promise<void> {
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
}

/**
 * Link an asset (create symlink)
 * Note: MCP assets should use stageMcpServers() instead
 */
export async function linkAsset(
  repoAlias: string,
  asset: Asset
): Promise<Selection> {
  const repo = await getRepository(repoAlias);
  if (!repo) {
    throw new Error(`Repository not found: ${repoAlias}`);
  }

  // MCP assets should be staged via stageMcpServers, not linkAsset
  if (asset.type === "mcp") {
    throw new Error("MCP assets should be staged using stageMcpServers() instead of linkAsset()");
  }

  const sourcePath = join(repo.localPath, asset.path);
  if (!existsSync(sourcePath)) {
    throw new Error(`Asset not found: ${sourcePath}`);
  }

  const targetDir = getTargetDir(asset.type);
  await ensureDir(targetDir);

  // For skills, we need to create the skill directory structure
  if (asset.type === "skill") {
    const skillDirName = getNamespacedFilename(repoAlias, asset.name);
    const skillDir = join(targetDir, skillDirName);
    await ensureDir(skillDir);

    const targetPath = join(skillDir, "SKILL.md");

    // Remove existing symlink if present
    if (existsSync(targetPath)) {
      await unlink(targetPath);
    }

    await symlink(sourcePath, targetPath);

    const selection: Selection = {
      repoAlias,
      assetPath: asset.path,
      type: asset.type,
      linkedPath: targetPath,
    };

    await addSelection(selection);
    return selection;
  }

  // For agents and commands, use namespaced filename
  const ext = extname(asset.path);
  const nameWithoutExt = basename(asset.path, ext);
  const targetFilename = getNamespacedFilename(repoAlias, nameWithoutExt) + ext;
  const targetPath = join(targetDir, targetFilename);

  // Remove existing symlink if present
  if (existsSync(targetPath)) {
    await unlink(targetPath);
  }

  await symlink(sourcePath, targetPath);

  const selection: Selection = {
    repoAlias,
    assetPath: asset.path,
    type: asset.type,
    linkedPath: targetPath,
  };

  await addSelection(selection);
  return selection;
}

/**
 * Unlink an asset (remove symlink)
 */
export async function unlinkAsset(
  repoAlias: string,
  assetPath: string
): Promise<boolean> {
  const selection = await removeSelection(repoAlias, assetPath);
  if (!selection) {
    return false;
  }

  // MCP assets shouldn't be in selections anymore (they use stagedMcp)
  if (selection.type === "mcp") {
    return false;
  }

  // Remove the symlink
  if (existsSync(selection.linkedPath)) {
    await unlink(selection.linkedPath);

    // For skills, also remove the directory if empty
    if (selection.type === "skill") {
      const skillDir = dirname(selection.linkedPath);
      try {
        await rm(skillDir, { recursive: true });
      } catch {
        // Ignore if directory not empty or doesn't exist
      }
    }
  }

  return true;
}

/**
 * Check the health of all links
 */
export async function diagnose(): Promise<DiagnosisResult> {
  const selections = await getSelections();
  const healthy: LinkHealth[] = [];
  const broken: LinkHealth[] = [];

  for (const selection of selections) {
    // Skip MCP selections (they don't have direct links)
    if (selection.type === "mcp") {
      continue;
    }

    const repo = await getRepository(selection.repoAlias);

    // Check if the symlink exists and is valid
    if (!existsSync(selection.linkedPath)) {
      broken.push({
        selection,
        healthy: false,
        issue: "broken_symlink",
      });
      continue;
    }

    // Check if it's actually a symlink
    const stats = lstatSync(selection.linkedPath);
    if (!stats.isSymbolicLink()) {
      broken.push({
        selection,
        healthy: false,
        issue: "broken_symlink",
      });
      continue;
    }

    // Check if the source exists
    if (!repo) {
      broken.push({
        selection,
        healthy: false,
        issue: "missing_source",
      });
      continue;
    }

    const sourcePath = join(repo.localPath, selection.assetPath);
    if (!existsSync(sourcePath)) {
      broken.push({
        selection,
        healthy: false,
        issue: "missing_source",
      });
      continue;
    }

    healthy.push({
      selection,
      healthy: true,
    });
  }

  return { healthy, broken };
}

/**
 * Fix broken links
 */
export async function cure(): Promise<{ fixed: number; errors: string[] }> {
  const { broken } = await diagnose();
  let fixed = 0;
  const errors: string[] = [];

  for (const link of broken) {
    try {
      // Remove the broken symlink
      if (existsSync(link.selection.linkedPath)) {
        await unlink(link.selection.linkedPath);
      }

      // Remove from selections
      await removeSelection(link.selection.repoAlias, link.selection.assetPath);

      // For skills, try to remove the directory
      if (link.selection.type === "skill") {
        const skillDir = dirname(link.selection.linkedPath);
        try {
          await rm(skillDir, { recursive: true });
        } catch {
          // Ignore
        }
      }

      fixed++;
    } catch (error) {
      errors.push(
        `Failed to fix ${link.selection.linkedPath}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  return { fixed, errors };
}

/**
 * Build merged MCP configuration from staged server selections
 */
export async function buildMcpConfig(): Promise<McpConfig> {
  const staged = await getStagedMcp();
  const merged: McpConfig = { mcpServers: {} };

  // Group by repo+file to minimize file reads
  const fileCache = new Map<string, McpConfig>();

  for (const { repoAlias, assetPath, serverName } of staged) {
    const cacheKey = `${repoAlias}:${assetPath}`;

    // Load file if not cached
    if (!fileCache.has(cacheKey)) {
      const repo = await getRepository(repoAlias);
      if (!repo) continue;

      const sourcePath = join(repo.localPath, assetPath);
      if (!existsSync(sourcePath)) continue;

      try {
        const content = await readFile(sourcePath, "utf-8");
        const config = JSON.parse(content) as McpConfig;
        fileCache.set(cacheKey, config);
      } catch {
        continue;
      }
    }

    // Get the specific server from cached config
    const config = fileCache.get(cacheKey);
    const serverConfig = config?.mcpServers?.[serverName];
    if (serverConfig) {
      merged.mcpServers[serverName] = serverConfig;
    }
  }

  return merged;
}

/**
 * Get preview of MCP changes
 */
export async function getMcpPreview(): Promise<{
  additions: Array<{ name: string; from: string; file: string }>;
  existing: string[];
}> {
  const staged = await getStagedMcp();
  const additions: Array<{ name: string; from: string; file: string }> = [];
  const existing: string[] = [];

  // Load existing MCP config if present
  const mcpPath = getMcpConfigPath();
  if (existsSync(mcpPath)) {
    try {
      const content = await readFile(mcpPath, "utf-8");
      const config = JSON.parse(content) as McpConfig;
      existing.push(...Object.keys(config.mcpServers ?? {}));
    } catch {
      // Ignore invalid config
    }
  }

  // Get additions from staged servers
  for (const { repoAlias, assetPath, serverName } of staged) {
    additions.push({
      name: serverName,
      from: repoAlias,
      file: assetPath.split("/").pop() ?? assetPath,
    });
  }

  return { additions, existing };
}

/**
 * Stage multiple MCP servers from a config file
 */
export async function stageMcpServers(
  repoAlias: string,
  assetPath: string,
  serverNames: string[]
): Promise<void> {
  for (const serverName of serverNames) {
    await stageMcpServer(repoAlias, assetPath, serverName);
  }
}

/**
 * Unstage multiple MCP servers
 */
export async function unstageMcpServers(
  repoAlias: string,
  assetPath: string,
  serverNames: string[]
): Promise<void> {
  for (const serverName of serverNames) {
    await unstageMcpServer(repoAlias, assetPath, serverName);
  }
}

/**
 * Sync MCP configuration to ~/.claude/mcp.json
 */
export async function syncMcp(): Promise<void> {
  const merged = await buildMcpConfig();

  await ensureDir(getClaudeDir());
  await writeFile(getMcpConfigPath(), JSON.stringify(merged, null, 2), "utf-8");

  // Clear staged after successful sync
  await clearStagedMcp();
}
