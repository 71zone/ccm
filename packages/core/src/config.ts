import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { getConfigPath } from "./paths.js";
import type { CcmConfig, Repository, Selection, StagedMcpServer } from "./types.js";

/**
 * Default empty configuration
 */
function createDefaultConfig(): CcmConfig {
  return {
    repositories: [],
    selections: [],
    stagedMcp: [],
  };
}

/**
 * Ensure the config directory exists
 */
async function ensureConfigDir(): Promise<void> {
  const configPath = getConfigPath();
  const configDir = dirname(configPath);
  if (!existsSync(configDir)) {
    await mkdir(configDir, { recursive: true });
  }
}

/**
 * Load the CCM configuration
 */
export async function loadConfig(): Promise<CcmConfig> {
  const configPath = getConfigPath();

  if (!existsSync(configPath)) {
    return createDefaultConfig();
  }

  try {
    const content = await readFile(configPath, "utf-8");
    const parsed = JSON.parse(content);
    // Ensure all required fields exist with defaults (for backwards compatibility)
    return {
      repositories: parsed.repositories ?? [],
      selections: parsed.selections ?? [],
      stagedMcp: parsed.stagedMcp ?? [],
    };
  } catch {
    return createDefaultConfig();
  }
}

/**
 * Save the CCM configuration
 */
export async function saveConfig(config: CcmConfig): Promise<void> {
  await ensureConfigDir();
  const configPath = getConfigPath();
  await writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
}

/**
 * Add a repository to the config
 */
export async function addRepository(repo: Repository): Promise<void> {
  const config = await loadConfig();
  const existing = config.repositories.findIndex((r) => r.alias === repo.alias);

  if (existing >= 0) {
    config.repositories[existing] = repo;
  } else {
    config.repositories.push(repo);
  }

  await saveConfig(config);
}

/**
 * Remove a repository from the config
 */
export async function removeRepository(alias: string): Promise<Repository | undefined> {
  const config = await loadConfig();
  const index = config.repositories.findIndex((r) => r.alias === alias);

  if (index < 0) {
    return undefined;
  }

  const [removed] = config.repositories.splice(index, 1);

  // Also remove associated selections
  config.selections = config.selections.filter((s) => s.repoAlias !== alias);
  config.stagedMcp = config.stagedMcp.filter((s) => s.repoAlias !== alias);

  await saveConfig(config);
  return removed;
}

/**
 * Get a repository by alias
 */
export async function getRepository(alias: string): Promise<Repository | undefined> {
  const config = await loadConfig();
  return config.repositories.find((r) => r.alias === alias);
}

/**
 * Get all repositories
 */
export async function getRepositories(): Promise<Repository[]> {
  const config = await loadConfig();
  return config.repositories;
}

/**
 * Add a selection to the config
 */
export async function addSelection(selection: Selection): Promise<void> {
  const config = await loadConfig();
  const existing = config.selections.findIndex(
    (s) => s.repoAlias === selection.repoAlias && s.assetPath === selection.assetPath
  );

  if (existing >= 0) {
    config.selections[existing] = selection;
  } else {
    config.selections.push(selection);
  }

  await saveConfig(config);
}

/**
 * Remove a selection from the config
 */
export async function removeSelection(
  repoAlias: string,
  assetPath: string
): Promise<Selection | undefined> {
  const config = await loadConfig();
  const index = config.selections.findIndex(
    (s) => s.repoAlias === repoAlias && s.assetPath === assetPath
  );

  if (index < 0) {
    return undefined;
  }

  const [removed] = config.selections.splice(index, 1);
  await saveConfig(config);
  return removed;
}

/**
 * Get all selections
 */
export async function getSelections(): Promise<Selection[]> {
  const config = await loadConfig();
  return config.selections;
}

/**
 * Get selections for a specific repository
 */
export async function getSelectionsForRepo(alias: string): Promise<Selection[]> {
  const config = await loadConfig();
  return config.selections.filter((s) => s.repoAlias === alias);
}

/**
 * Stage an individual MCP server
 */
export async function stageMcpServer(
  repoAlias: string,
  assetPath: string,
  serverName: string
): Promise<void> {
  const config = await loadConfig();
  const existing = config.stagedMcp.find(
    (s) =>
      s.repoAlias === repoAlias &&
      s.assetPath === assetPath &&
      s.serverName === serverName
  );

  if (!existing) {
    config.stagedMcp.push({ repoAlias, assetPath, serverName });
    await saveConfig(config);
  }
}

/**
 * Unstage an individual MCP server
 */
export async function unstageMcpServer(
  repoAlias: string,
  assetPath: string,
  serverName: string
): Promise<void> {
  const config = await loadConfig();
  config.stagedMcp = config.stagedMcp.filter(
    (s) =>
      !(
        s.repoAlias === repoAlias &&
        s.assetPath === assetPath &&
        s.serverName === serverName
      )
  );
  await saveConfig(config);
}

/**
 * Get all staged MCP server selections
 */
export async function getStagedMcp(): Promise<StagedMcpServer[]> {
  const config = await loadConfig();
  return config.stagedMcp;
}

/**
 * Get staged servers for a specific MCP file
 */
export async function getStagedServersForFile(
  repoAlias: string,
  assetPath: string
): Promise<string[]> {
  const config = await loadConfig();
  return config.stagedMcp
    .filter((s) => s.repoAlias === repoAlias && s.assetPath === assetPath)
    .map((s) => s.serverName);
}

/**
 * Clear all staged MCP selections
 */
export async function clearStagedMcp(): Promise<void> {
  const config = await loadConfig();
  config.stagedMcp = [];
  await saveConfig(config);
}

/**
 * Update repository in config
 */
export async function updateRepository(
  alias: string,
  updates: Partial<Repository>
): Promise<Repository | undefined> {
  const config = await loadConfig();
  const index = config.repositories.findIndex((r) => r.alias === alias);

  if (index < 0) {
    return undefined;
  }

  const repo = config.repositories[index];
  if (!repo) {
    return undefined;
  }

  config.repositories[index] = { ...repo, ...updates };
  await saveConfig(config);
  return config.repositories[index];
}
