import { existsSync, lstatSync, readlinkSync, readdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import {
  getAgentsDir,
  getCommandsDir,
  getSkillsDir,
  getReposDir,
  getLocalVaultDir,
} from "./paths.js";
import type { AssetType, StrayAsset } from "./types.js";

/**
 * Check if a file is a symlink pointing to CCM vault directories
 * (either ~/.local/share/ccm/repos/ or ~/.local/share/ccm/local/)
 */
export function isSymlinkToCcmVault(filePath: string): boolean {
  try {
    const stats = lstatSync(filePath);
    if (!stats.isSymbolicLink()) {
      return false;
    }

    const linkTarget = readlinkSync(filePath);
    // Resolve relative symlinks to absolute path
    const absoluteTarget = resolve(dirname(filePath), linkTarget);

    const reposDir = getReposDir();
    const localVaultDir = getLocalVaultDir();

    return (
      absoluteTarget.startsWith(reposDir + "/") ||
      absoluteTarget.startsWith(localVaultDir + "/")
    );
  } catch {
    // Handle broken symlinks or permission errors gracefully
    return false;
  }
}

/**
 * Check if a file is a symlink pointing outside CCM vault
 * Regular files return false
 */
export function isExternalSymlink(filePath: string): boolean {
  try {
    const stats = lstatSync(filePath);
    if (!stats.isSymbolicLink()) {
      return false;
    }

    // It's a symlink - check if it points to CCM vault
    return !isSymlinkToCcmVault(filePath);
  } catch {
    return false;
  }
}

/**
 * Check if a filename is a hidden file (starts with dot)
 */
function isHiddenFile(filename: string): boolean {
  return filename.startsWith(".");
}

/**
 * Recursively scan a directory for .md files
 * Returns flat list of StrayAssets with relative paths from baseDir
 */
function scanNestedMdFiles(
  baseDir: string,
  relativePath: string,
  assetType: AssetType
): StrayAsset[] {
  const strays: StrayAsset[] = [];
  const currentDir = relativePath ? join(baseDir, relativePath) : baseDir;

  if (!existsSync(currentDir)) {
    return strays;
  }

  try {
    const entries = readdirSync(currentDir);

    for (const entry of entries) {
      if (isHiddenFile(entry)) {
        continue;
      }

      const fullPath = join(currentDir, entry);
      const entryRelativePath = relativePath ? join(relativePath, entry) : entry;

      try {
        const stats = lstatSync(fullPath);

        if (stats.isDirectory()) {
          // Recurse into subdirectories
          const nested = scanNestedMdFiles(baseDir, entryRelativePath, assetType);
          strays.push(...nested);
        } else if (stats.isFile() && entry.endsWith(".md")) {
          // Found an .md file
          const name = entry.replace(/\.md$/, "");
          strays.push({
            type: assetType,
            path: entryRelativePath,
            name,
            fullPath,
            isExternalSymlink: false,
          });
        }
      } catch {
        // Skip inaccessible entries
        continue;
      }
    }
  } catch {
    // Directory read error
  }

  return strays;
}

/**
 * Scan a directory for stray agent or command files (.md files)
 * Also detects directory symlinks (like symlinked agent folders)
 */
function scanStrayMdFiles(
  dir: string,
  assetType: AssetType
): StrayAsset[] {
  const strays: StrayAsset[] = [];

  if (!existsSync(dir)) {
    return strays;
  }

  // Check if the entire directory is an external symlink
  let parentIsExternalSymlink = false;
  try {
    const dirStats = lstatSync(dir);
    if (dirStats.isSymbolicLink()) {
      if (isSymlinkToCcmVault(dir)) {
        // CCM-managed - skip entirely
        return strays;
      }
      // Parent dir is an external symlink - all children inherit this
      parentIsExternalSymlink = true;
    }
  } catch {
    return strays;
  }

  try {
    const entries = readdirSync(dir);

    for (const entry of entries) {
      // Skip hidden files
      if (isHiddenFile(entry)) {
        continue;
      }

      const fullPath = join(dir, entry);

      // Skip CCM-managed symlinks
      if (isSymlinkToCcmVault(fullPath)) {
        continue;
      }

      // Check what type of entry this is
      try {
        const stats = lstatSync(fullPath);

        // Handle directory symlinks (e.g., agents/claude-agents -> external project)
        if (stats.isSymbolicLink()) {
          // Check if target is a directory
          try {
            const targetPath = resolve(dirname(fullPath), readlinkSync(fullPath));
            const targetStats = lstatSync(targetPath);
            if (targetStats.isDirectory()) {
              // It's a symlink to a directory - scan recursively and FLATTEN each .md file
              const nestedFiles = scanNestedMdFiles(targetPath, "", assetType);

              // Flatten: each nested file becomes a separate stray asset
              // with path-prefixed name (e.g., "core/agent.md" -> "core-agent")
              for (const nested of nestedFiles) {
                // Convert path separators to dashes for the name
                // e.g., "core/code-archaeologist.md" -> "core-code-archaeologist"
                const pathWithoutExt = nested.path.replace(/\.md$/, "");
                const prefixedName = pathWithoutExt.replace(/\//g, "-");

                strays.push({
                  type: assetType,
                  path: `${prefixedName}.md`,
                  name: prefixedName,
                  fullPath: nested.fullPath,
                  isExternalSymlink: true,
                  // Store original source folder for grouping in UI
                  sourceFolder: entry,
                });
              }
              continue;
            }
          } catch {
            // Broken symlink or inaccessible target - skip
            continue;
          }
        }

        // Only process .md files for agents/commands
        if (!entry.endsWith(".md")) {
          continue;
        }

        if (!stats.isSymbolicLink() && !stats.isFile()) {
          continue;
        }

        const name = entry.replace(/\.md$/, "");

        strays.push({
          type: assetType,
          path: entry,
          name,
          fullPath,
          // Mark as external if parent dir is external OR this entry itself is external
          isExternalSymlink: parentIsExternalSymlink || isExternalSymlink(fullPath),
        });
      } catch {
        // Skip broken symlinks or inaccessible files
        continue;
      }
    }
  } catch {
    // Directory read error - return empty
  }

  return strays;
}

/**
 * Scan skills directory for stray skill directories (containing SKILL.md)
 * Follows symlinks to scan contents even if the parent directory is a symlink
 */
function scanStraySkills(dir: string): StrayAsset[] {
  const strays: StrayAsset[] = [];

  if (!existsSync(dir)) {
    return strays;
  }

  // Check if the entire skills directory is a CCM-managed symlink or external symlink
  let parentIsExternalSymlink = false;
  try {
    const dirStats = lstatSync(dir);
    if (dirStats.isSymbolicLink()) {
      if (isSymlinkToCcmVault(dir)) {
        // CCM-managed - skip entirely
        return strays;
      }
      // Parent dir is an external symlink - all children inherit this
      parentIsExternalSymlink = true;
    }
  } catch {
    return strays;
  }

  try {
    const entries = readdirSync(dir);

    for (const entry of entries) {
      // Skip hidden files/directories
      if (isHiddenFile(entry)) {
        continue;
      }

      const fullPath = join(dir, entry);

      // Skip CCM-managed symlinks
      if (isSymlinkToCcmVault(fullPath)) {
        continue;
      }

      // Check if it's a directory or symlink to directory
      try {
        const stats = lstatSync(fullPath);
        const isSymlink = stats.isSymbolicLink();

        // For skills, we need directories (or symlinks to directories)
        if (!isSymlink && !stats.isDirectory()) {
          continue;
        }

        // If it's a symlink, check if target is accessible
        if (isSymlink) {
          try {
            // Try to read target - will fail for broken symlinks
            const targetStats = lstatSync(resolve(dirname(fullPath), readlinkSync(fullPath)));
            if (!targetStats.isDirectory()) {
              continue;
            }
          } catch {
            // Broken symlink - skip
            continue;
          }
        }

        // Verify SKILL.md exists within the directory
        const skillMdPath = join(fullPath, "SKILL.md");
        if (!existsSync(skillMdPath)) {
          continue;
        }

        strays.push({
          type: "skill",
          path: entry,
          name: entry,
          fullPath,
          // Mark as external if parent dir is external OR this entry itself is external
          isExternalSymlink: parentIsExternalSymlink || isExternalSymlink(fullPath),
        });
      } catch {
        // Skip inaccessible entries
        continue;
      }
    }
  } catch {
    // Directory read error - return empty
  }

  return strays;
}

/**
 * Scan all Claude directories for stray assets not managed by CCM
 * Follows symlinks to scan contents of externally linked directories
 */
export async function scanStrayAssets(): Promise<{
  agents: StrayAsset[];
  skills: StrayAsset[];
  commands: StrayAsset[];
}> {
  const agentsDir = getAgentsDir();
  const skillsDir = getSkillsDir();
  const commandsDir = getCommandsDir();

  const agents = scanStrayMdFiles(agentsDir, "agent");
  const skills = scanStraySkills(skillsDir);
  const commands = scanStrayMdFiles(commandsDir, "command");

  return {
    agents,
    skills,
    commands,
  };
}
