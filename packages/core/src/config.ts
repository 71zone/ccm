import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { getConfigPath, getReposDir } from "./paths.js";
import type { CcmConfig, GitHubRepository, LocalRepository, Repository, Selection, StagedMcpServer } from "./types.js";

/**
 * Check if an alias uses the old truncated format
 * Old format: 4 chars or less, or 4 chars + number (e.g., "acme", "acme2")
 * New format contains a dot separator (owner.repo)
 */
function isLegacyAliasFormat(alias: string): boolean {
  if (alias.includes(".")) {
    return false;
  }
  return /^[a-z]{1,4}\d*$/.test(alias);
}

/**
 * Generate new alias format from owner and repo
 */
function generateNewAlias(owner: string, repo: string): string {
  return `${owner.toLowerCase()}.${repo.toLowerCase()}`;
}

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
 * Migrate legacy aliases to new owner.repo format
 * Updates repositories, selections, stagedMcp, and renames directories
 */
async function migrateLegacyAliases(config: CcmConfig): Promise<{ migrated: boolean; config: CcmConfig }> {
  let migrated = false;
  const aliasMapping = new Map<string, string>(); // old alias -> new alias

  // Find repos that need migration
  for (const repo of config.repositories) {
    if (repo.registryType === "github" && isLegacyAliasFormat(repo.alias)) {
      const githubRepo = repo as GitHubRepository;
      const newAlias = generateNewAlias(githubRepo.owner, githubRepo.repo);

      // Check if new alias already exists (handle collision)
      let finalAlias = newAlias;
      let counter = 2;
      while (config.repositories.some((r) => r.alias === finalAlias && r !== repo)) {
        finalAlias = `${newAlias}${counter}`;
        counter++;
      }

      aliasMapping.set(repo.alias, finalAlias);
      migrated = true;
    }
  }

  if (!migrated) {
    return { migrated: false, config };
  }

  // Update repositories
  const reposDir = getReposDir();
  for (const repo of config.repositories) {
    const newAlias = aliasMapping.get(repo.alias);
    if (newAlias) {
      const oldPath = repo.localPath;
      const newPath = join(reposDir, newAlias);

      // Try to rename directory if it exists at old path
      if (existsSync(oldPath) && !existsSync(newPath)) {
        try {
          await rename(oldPath, newPath);
          repo.localPath = newPath;
        } catch {
          // If rename fails, keep the old path
        }
      } else if (existsSync(newPath)) {
        // New path already exists, use it
        repo.localPath = newPath;
      }

      repo.alias = newAlias;
    }
  }

  // Update selections
  config.selections = config.selections.map((selection) => {
    const newAlias = aliasMapping.get(selection.repoAlias);
    if (newAlias) {
      // Also update linkedPath if it contains the old alias
      let newLinkedPath = selection.linkedPath;
      const oldAlias = selection.repoAlias;
      if (selection.linkedPath.includes(oldAlias)) {
        newLinkedPath = selection.linkedPath.replace(
          new RegExp(`${oldAlias}-`, "g"),
          `${newAlias}-`
        );
      }
      return { ...selection, repoAlias: newAlias, linkedPath: newLinkedPath };
    }
    return selection;
  });

  // Update stagedMcp
  config.stagedMcp = config.stagedMcp.map((staged) => {
    const newAlias = aliasMapping.get(staged.repoAlias);
    if (newAlias) {
      return { ...staged, repoAlias: newAlias };
    }
    return staged;
  });

  return { migrated: true, config };
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

    // Migrate old repositories to include registryType
    const migratedRepos = (parsed.repositories ?? []).map((repo: any) => {
      if (!repo.registryType) {
        // Old repos are always GitHub repos
        return { ...repo, registryType: "github" as const };
      }
      return repo;
    });

    let config: CcmConfig = {
      repositories: migratedRepos,
      selections: parsed.selections ?? [],
      stagedMcp: parsed.stagedMcp ?? [],
    };

    // Migrate legacy aliases to new format
    const { migrated, config: migratedConfig } = await migrateLegacyAliases(config);
    if (migrated) {
      config = migratedConfig;
      // Save migrated config
      await ensureConfigDir();
      await writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
    }

    return config;
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

  // Type assertion needed because Partial<Repository> doesn't preserve discriminated union
  config.repositories[index] = { ...repo, ...updates } as Repository;
  await saveConfig(config);
  return config.repositories[index];
}
