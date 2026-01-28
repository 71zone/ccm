import { defineCommand } from "citty";
import { intro, groupMultiselect, outro, spinner, isCancel, confirm, text } from "@clack/prompts";
import { cp, mkdir, rm, symlink, unlink } from "node:fs/promises";
import { existsSync, lstatSync, readlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  scanStrayAssets,
  getLocalVaultDir,
  getAgentsDir,
  getSkillsDir,
  getCommandsDir,
  addSelection,
  getRepository,
  addRepository,
  updateRepository,
  type StrayAsset,
  type LocalRepository,
  type Selection,
  type AssetType,
  type Asset,
} from "@71zone/ccm-core";

const LOCAL_ALIAS = "local";

/**
 * Ensure the "local" repository exists in config
 */
async function ensureLocalRepository(): Promise<LocalRepository> {
  let repo = await getRepository(LOCAL_ALIAS);
  if (!repo) {
    const localRepo: LocalRepository = {
      alias: LOCAL_ALIAS,
      registryType: "local",
      localPath: getLocalVaultDir(),
      assets: [],
      updatedAt: new Date().toISOString(),
    };
    await addRepository(localRepo);
    return localRepo;
  }
  return repo as LocalRepository;
}

/**
 * Get the target vault directory for an asset type
 */
function getVaultDirForType(type: AssetType): string {
  const localVault = getLocalVaultDir();
  switch (type) {
    case "agent":
      return join(localVault, "agents");
    case "skill":
      return join(localVault, "skills");
    case "command":
      return join(localVault, "commands");
    default:
      throw new Error(`Unsupported asset type for migration: ${type}`);
  }
}

/**
 * Get the Claude directory for an asset type
 */
function getClaudeDirForType(type: AssetType): string {
  switch (type) {
    case "agent":
      return getAgentsDir();
    case "skill":
      return getSkillsDir();
    case "command":
      return getCommandsDir();
    default:
      throw new Error(`Unsupported asset type for migration: ${type}`);
  }
}

/**
 * Migrate a single stray asset to the local vault
 * Returns the Asset object for adding to repository
 */
async function migrateAsset(asset: StrayAsset): Promise<Asset> {
  const vaultDir = getVaultDirForType(asset.type);
  const claudeDir = getClaudeDirForType(asset.type);

  // Determine the target name in vault (same as source name)
  const targetName = asset.type === "skill" ? asset.name : `${asset.name}.md`;
  const targetPath = join(vaultDir, targetName);
  const claudePath = join(claudeDir, targetName);

  // Ensure vault directory exists
  await mkdir(vaultDir, { recursive: true });

  // Check if the asset itself is actually a symlink (not just inherited flag from parent)
  const stats = lstatSync(asset.fullPath);
  const isActualSymlink = stats.isSymbolicLink();

  // Handle the source content
  if (isActualSymlink) {
    // Resolve symlink and copy the target content
    const linkTarget = readlinkSync(asset.fullPath);
    const absoluteTarget = resolve(dirname(asset.fullPath), linkTarget);

    // Copy the actual content (follow symlinks)
    await cp(absoluteTarget, targetPath, { recursive: true });
  } else {
    // Regular file/directory - copy directly (dereference any nested symlinks)
    await cp(asset.fullPath, targetPath, { recursive: true, dereference: true });
  }

  // Remove original file/symlink from ~/.claude/
  if (isActualSymlink) {
    await unlink(asset.fullPath);
  } else if (stats.isDirectory()) {
    await rm(asset.fullPath, { recursive: true });
  } else {
    await unlink(asset.fullPath);
  }

  // Create symlink from ~/.claude/{type}s/{name} -> vault
  await symlink(targetPath, claudePath);

  // Build the asset path relative to local vault (e.g., "agents/my-agent.md")
  const assetPath = asset.type === "skill"
    ? `skills/${asset.name}`
    : `${asset.type}s/${asset.name}.md`;

  // Add selection to config
  const selection: Selection = {
    repoAlias: LOCAL_ALIAS,
    assetPath,
    type: asset.type,
    linkedPath: claudePath,
  };
  await addSelection(selection);

  // Return Asset for repository update
  return {
    type: asset.type,
    path: assetPath,
    name: asset.name,
  };
}

/**
 * Format asset path for display (e.g., "agents/my-agent.md")
 */
function formatAssetPath(asset: StrayAsset): string {
  if (asset.type === "skill") {
    return `skills/${asset.name}/`;
  }
  return `${asset.type}s/${asset.path}`;
}

/**
 * Find a stray asset by its path (e.g., "agents/my-agent.md")
 */
function findAssetByPath(
  allStrays: StrayAsset[],
  assetPath: string
): StrayAsset | undefined {
  // Normalize path: remove trailing slash, handle both formats
  const normalized = assetPath.replace(/\/$/, "");

  for (const stray of allStrays) {
    const strayPath = formatAssetPath(stray).replace(/\/$/, "");
    if (strayPath === normalized) {
      return stray;
    }
  }

  return undefined;
}

export const migrateCommand = defineCommand({
  meta: {
    name: "migrate",
    description: "Migrate stray assets to local vault for CCM management",
  },
  args: {
    asset: {
      type: "positional",
      description: "Asset path (e.g., agents/my-agent.md) for direct migration",
      required: false,
    },
    yes: {
      type: "boolean",
      alias: "y",
      description: "Skip confirmation",
      default: false,
    },
  },
  async run({ args }) {
    intro("ccm migrate");

    // Scan for stray assets
    const s = spinner();
    s.start("Scanning for stray assets");
    const { agents, skills, commands } = await scanStrayAssets();
    const allStrays = [...agents, ...skills, ...commands];
    s.stop("Scan complete");

    if (allStrays.length === 0) {
      outro("No stray assets found to migrate.");
      return;
    }

    let assetsToMigrate: StrayAsset[];

    if (args.asset) {
      // Direct migration of specific asset
      const found = findAssetByPath(allStrays, args.asset);
      if (!found) {
        console.error(`  Asset not found: ${args.asset}`);
        console.error("  Available stray assets:");
        for (const stray of allStrays) {
          console.error(`    - ${formatAssetPath(stray)}`);
        }
        process.exit(1);
      }
      assetsToMigrate = [found];
    } else {
      // First ask if user wants to migrate all
      const migrateAll = await confirm({
        message: `Found ${allStrays.length} stray assets. Migrate all?`,
      });

      if (isCancel(migrateAll)) {
        outro("Cancelled");
        return;
      }

      if (migrateAll) {
        assetsToMigrate = allStrays;
      } else {
        // Group assets by sourceFolder for organized selection
        const groupedOptions: Record<string, Array<{ value: StrayAsset; label: string; hint?: string }>> = {};

        for (const stray of allStrays) {
          // Group key: sourceFolder if exists, otherwise by asset type
          const groupKey = stray.sourceFolder
            ? `${stray.type}s/${stray.sourceFolder}`
            : `${stray.type}s`;

          if (!groupedOptions[groupKey]) {
            groupedOptions[groupKey] = [];
          }

          groupedOptions[groupKey].push({
            value: stray,
            label: stray.sourceFolder ? stray.path : formatAssetPath(stray),
            hint: stray.isExternalSymlink && !stray.sourceFolder ? "external" : undefined,
          });
        }

        const selected = await groupMultiselect({
          message: "Select assets to migrate (use 'a' to toggle group)",
          options: groupedOptions,
          required: false,
        });

        if (isCancel(selected)) {
          outro("Cancelled");
          return;
        }

        assetsToMigrate = selected as StrayAsset[];

        if (assetsToMigrate.length === 0) {
          outro("No assets selected");
          return;
        }
      }
    }

    // Detect conflicts (same target filename from different sources)
    const targetNames = new Map<string, StrayAsset[]>();
    for (const asset of assetsToMigrate) {
      const targetName = asset.type === "skill" ? asset.name : asset.name;
      const key = `${asset.type}:${targetName}`;
      if (!targetNames.has(key)) {
        targetNames.set(key, []);
      }
      targetNames.get(key)!.push(asset);
    }

    // Find conflicts and prompt user to rename
    const renamedAssets = new Map<StrayAsset, string>(); // asset -> new name
    for (const [key, assets] of targetNames) {
      if (assets.length > 1) {
        console.log();
        console.log(`  Conflict detected: ${assets.length} assets would have the same name "${key.split(":")[1]}"`);
        for (let i = 0; i < assets.length; i++) {
          const asset = assets[i];
          console.log(`    ${i + 1}. ${asset.fullPath}`);
        }
        console.log();

        // Prompt for rename for each conflicting asset (except first)
        for (let i = 1; i < assets.length; i++) {
          const asset = assets[i];
          const newName = await text({
            message: `Enter new name for "${asset.name}" (from ${asset.sourceFolder || "root"}):`,
            placeholder: `${asset.sourceFolder ? asset.sourceFolder + "-" : ""}${asset.name}`,
            defaultValue: `${asset.sourceFolder ? asset.sourceFolder + "-" : ""}${asset.name}`,
            validate: (value) => {
              if (!value.trim()) return "Name cannot be empty";
              if (value.includes("/")) return "Name cannot contain /";
              return undefined;
            },
          });

          if (isCancel(newName)) {
            outro("Cancelled");
            return;
          }

          renamedAssets.set(asset, newName as string);
        }
      }
    }

    // Apply renames to assets
    for (const [asset, newName] of renamedAssets) {
      asset.name = newName;
      asset.path = asset.type === "skill" ? newName : `${newName}.md`;
    }

    // Confirm migration unless --yes flag
    if (!args.yes) {
      console.log();
      console.log("  Assets to migrate:");
      for (const asset of assetsToMigrate) {
        const renamed = renamedAssets.has(asset) ? " (renamed)" : "";
        console.log(`    - ${formatAssetPath(asset)}${renamed}`);
      }
      console.log();

      const confirmed = await confirm({
        message: `Migrate ${assetsToMigrate.length} asset(s) to local vault?`,
      });

      if (isCancel(confirmed) || !confirmed) {
        outro("Cancelled");
        return;
      }
    }

    // Ensure local repository exists
    const localRepo = await ensureLocalRepository();

    // Migrate each asset
    const results: { path: string; success: boolean; asset?: Asset; error?: string }[] = [];

    const migrationSpinner = spinner();
    migrationSpinner.start("Migrating assets");

    for (const asset of assetsToMigrate) {
      const path = formatAssetPath(asset);
      try {
        const migratedAsset = await migrateAsset(asset);
        results.push({ path, success: true, asset: migratedAsset });
      } catch (error) {
        results.push({
          path,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Update repository with new assets
    const newAssets = results
      .filter((r) => r.success && r.asset)
      .map((r) => r.asset as Asset);

    if (newAssets.length > 0) {
      const updatedAssets = [...localRepo.assets, ...newAssets];
      await updateRepository(LOCAL_ALIAS, {
        assets: updatedAssets,
        updatedAt: new Date().toISOString(),
      });
    }

    migrationSpinner.stop("Migration complete");

    // Show results
    console.log();
    for (const result of results) {
      if (result.success) {
        console.log(`  \u2713 Migrated ${result.path}`);
      } else {
        console.log(`  \u2717 Failed ${result.path}: ${result.error}`);
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    if (failCount > 0) {
      outro(`Migrated ${successCount} asset(s), ${failCount} failed`);
    } else {
      outro(`Migrated ${successCount} asset(s) to local vault`);
    }
  },
});
