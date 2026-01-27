import { getRepositories } from "./config.js";

/**
 * Generate an alias from a GitHub owner and repo
 * New format: owner.repo (lowercase, no truncation)
 * Example: "acmefoo/claude-awesome-aio" → "acmefoo.claude-awesome-aio"
 * Handle collisions by appending number
 */
export async function generateAlias(owner: string, repo: string): Promise<string> {
  const repos = await getRepositories();
  const existingAliases = new Set(repos.map((r) => r.alias));

  // New format: owner.repo (lowercase)
  const base = `${owner.toLowerCase()}.${repo.toLowerCase()}`;

  // If no collision, use base
  if (!existingAliases.has(base)) {
    return base;
  }

  // Handle collision by appending number
  let counter = 2;
  while (existingAliases.has(`${base}${counter}`)) {
    counter++;
  }

  return `${base}${counter}`;
}

/**
 * Check if an alias uses the old truncated format
 * Old format: 4 chars or less, or 4 chars + number (e.g., "acme", "acme2")
 */
export function isLegacyAlias(alias: string): boolean {
  // Old format was: up to 4 lowercase chars, optionally followed by a number
  // New format contains a dot separator (owner.repo)
  if (alias.includes(".")) {
    return false;
  }

  // Check if it matches the old pattern: 1-4 chars optionally followed by digits
  return /^[a-z]{1,4}\d*$/.test(alias);
}

/**
 * Parse a GitHub URL to extract owner and repo
 * Handles various formats including URLs with trailing paths, query params, and fragments:
 * - https://github.com/owner/repo
 * - https://github.com/owner/repo.git
 * - https://github.com/owner/repo/tree/main
 * - https://github.com/owner/repo/blob/main/file.md
 * - https://github.com/owner/repo?tab=readme
 * - github.com/owner/repo
 * - git@github.com:owner/repo.git
 * - owner/repo (shorthand)
 */
export function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  // Clean up the URL first - remove query params and fragments
  const withoutQuery = url.split("?")[0] ?? url;
  const withoutFragment = withoutQuery.split("#")[0] ?? withoutQuery;
  const cleanUrl = withoutFragment.trim();

  // Pattern for github.com URLs (https, http, git@, or no protocol)
  // Captures owner and repo, allowing trailing path segments
  const githubPattern = /github\.com[/:]([^/]+)\/([^/\s]+?)(?:\.git)?(?:\/|$)/i;

  const githubMatch = cleanUrl.match(githubPattern);
  if (githubMatch?.[1] && githubMatch[2]) {
    return {
      owner: githubMatch[1],
      repo: githubMatch[2].replace(/\.git$/, ""),
    };
  }

  // Shorthand format: owner/repo (no slashes except the one separator)
  const shorthandPattern = /^([^/\s]+)\/([^/\s]+)$/i;
  const shorthandMatch = cleanUrl.match(shorthandPattern);
  if (shorthandMatch?.[1] && shorthandMatch[2]) {
    return {
      owner: shorthandMatch[1],
      repo: shorthandMatch[2].replace(/\.git$/, ""),
    };
  }

  return null;
}

/**
 * Generate a namespaced filename for an asset
 * e.g., "nguy-coder.md" for alias "nguy" and asset "coder.md"
 */
export function getNamespacedFilename(alias: string, assetName: string): string {
  return `${alias}-${assetName}`;
}
