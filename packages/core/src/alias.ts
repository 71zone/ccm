import { getRepositories } from "./config.js";

/**
 * Generate an alias from a GitHub username/org
 * - If username ≤ 4 chars → use as-is
 * - Else → first 4 chars
 * - Handle collisions by appending number
 */
export async function generateAlias(username: string): Promise<string> {
  const repos = await getRepositories();
  const existingAliases = new Set(repos.map((r) => r.alias));

  // Normalize: lowercase, take first 4 chars if longer
  const base = username.length <= 4 ? username.toLowerCase() : username.slice(0, 4).toLowerCase();

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
 * Parse a GitHub URL to extract owner and repo
 */
export function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  // Support various GitHub URL formats:
  // https://github.com/owner/repo
  // https://github.com/owner/repo.git
  // git@github.com:owner/repo.git
  // github.com/owner/repo

  const patterns = [
    /github\.com[/:]([^/]+)\/([^/\s.]+)(?:\.git)?$/i,
    /^([^/]+)\/([^/\s.]+)$/i, // owner/repo shorthand
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1] && match[2]) {
      return {
        owner: match[1],
        repo: match[2].replace(/\.git$/, ""),
      };
    }
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
