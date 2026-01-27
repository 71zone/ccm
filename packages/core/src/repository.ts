import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { generateAlias, parseGitHubUrl } from "./alias.js";
import {
  addRepository,
  getRepository,
  getRepositories,
  removeRepository as removeFromConfig,
  updateRepository,
  getSelectionsForRepo,
} from "./config.js";
import { detectAssets, flattenAssets } from "./detection.js";
import { getReposDir } from "./paths.js";
import type { Repository } from "./types.js";
import { execAsync } from "./utils.js";

/**
 * Check if a repository with the same owner/repo already exists
 */
async function findExistingRepository(owner: string, repo: string): Promise<Repository | undefined> {
  const repos = await getRepositories();
  const normalizedOwner = owner.toLowerCase();
  const normalizedRepo = repo.toLowerCase();

  return repos.find((r) => {
    if (r.registryType === "github") {
      return (
        r.owner.toLowerCase() === normalizedOwner &&
        r.repo.toLowerCase() === normalizedRepo
      );
    }
    return false;
  });
}

/**
 * Clone a repository and register it
 */
export async function cloneRepository(url: string): Promise<Repository> {
  const parsed = parseGitHubUrl(url);
  if (!parsed) {
    throw new Error(`Invalid GitHub URL: ${url}`);
  }

  const { owner, repo } = parsed;

  // Check for duplicate repository (same owner/repo)
  const existing = await findExistingRepository(owner, repo);
  if (existing) {
    throw new Error(
      `Repository already registered as "${existing.alias}" (${owner}/${repo})`
    );
  }

  const alias = await generateAlias(owner, repo);
  const reposDir = getReposDir();
  const localPath = join(reposDir, alias);

  // Ensure repos directory exists
  if (!existsSync(reposDir)) {
    await mkdir(reposDir, { recursive: true });
  }

  // Check if already cloned
  if (existsSync(localPath)) {
    throw new Error(`Repository already exists at ${localPath}`);
  }

  // Clone the repository
  const normalizedUrl = url.startsWith("http") ? url : `https://github.com/${owner}/${repo}`;
  await execAsync(`git clone --depth 1 "${normalizedUrl}" "${localPath}"`);

  // Detect assets
  const detection = await detectAssets(localPath);
  const assets = flattenAssets(detection);

  const repository: Repository = {
    alias,
    registryType: "github",
    url: normalizedUrl,
    localPath,
    owner,
    repo,
    assets,
    updatedAt: new Date().toISOString(),
  };

  // Register in config
  await addRepository(repository);

  return repository;
}

/**
 * Remove a repository and clean up
 */
export async function removeRepo(alias: string): Promise<{ removed: Repository; unlinkedCount: number } | null> {
  const repo = await getRepository(alias);
  if (!repo) {
    return null;
  }

  // Get selections count before removal
  const selections = await getSelectionsForRepo(alias);
  const unlinkedCount = selections.length;

  // Remove from config (also removes selections)
  await removeFromConfig(alias);

  // Remove local files
  if (existsSync(repo.localPath)) {
    await rm(repo.localPath, { recursive: true, force: true });
  }

  return { removed: repo, unlinkedCount };
}

/**
 * Update a repository (git pull)
 */
export async function updateRepo(alias: string): Promise<Repository | null> {
  const repo = await getRepository(alias);
  if (!repo) {
    return null;
  }

  if (!existsSync(repo.localPath)) {
    throw new Error(`Repository not found at ${repo.localPath}`);
  }

  // Get current branch
  const branchResult = await execAsync(`git -C "${repo.localPath}" rev-parse --abbrev-ref HEAD`);
  const branch = branchResult.stdout.trim();

  // Fetch and reset to origin
  await execAsync(`git -C "${repo.localPath}" fetch origin`);
  await execAsync(`git -C "${repo.localPath}" reset --hard origin/${branch}`);

  // Re-detect assets
  const detection = await detectAssets(repo.localPath);
  const assets = flattenAssets(detection);

  // Update config
  const updated = await updateRepository(alias, {
    assets,
    updatedAt: new Date().toISOString(),
  });

  return updated ?? null;
}

/**
 * Update all repositories
 */
export async function updateAllRepos(): Promise<Array<{ alias: string; success: boolean; error?: string }>> {
  const repos = await getRepositories();
  const results: Array<{ alias: string; success: boolean; error?: string }> = [];

  for (const repo of repos) {
    try {
      await updateRepo(repo.alias);
      results.push({ alias: repo.alias, success: true });
    } catch (error) {
      results.push({
        alias: repo.alias,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}

/**
 * Update only repositories that have active selections
 */
export async function updateActiveRepos(): Promise<Array<{ alias: string; success: boolean; error?: string }>> {
  const repos = await getRepositories();
  const results: Array<{ alias: string; success: boolean; error?: string }> = [];

  for (const repo of repos) {
    const selections = await getSelectionsForRepo(repo.alias);
    if (selections.length === 0) {
      continue; // Skip repos with no active selections
    }

    try {
      await updateRepo(repo.alias);
      results.push({ alias: repo.alias, success: true });
    } catch (error) {
      results.push({
        alias: repo.alias,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}
