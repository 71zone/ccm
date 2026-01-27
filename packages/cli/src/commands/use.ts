import { defineCommand } from "citty";
import { intro, groupMultiselect, multiselect, outro, select, spinner, isCancel, note } from "@clack/prompts";
import { join } from "node:path";
import {
  getRepositories,
  getRepository,
  getSelectionsForRepo,
  getStagedServersForFile,
  linkAsset,
  getMcpServers,
  stageMcpServers,
  isGitHubRepository,
  type Asset,
  type Repository,
} from "@71zone/ccm-core";

interface AssetOption {
  value: Asset;
  label: string;
  hint?: string;
}

function buildGroupedAssetOptions(
  repo: Repository,
  currentSelections: string[]
): { options: Record<string, AssetOption[]>; initialValues: Asset[] } {
  const options: Record<string, AssetOption[]> = {};
  const initialValues: Asset[] = [];

  // Group assets by type - exclude MCP (handled separately)
  const groups: Record<string, Asset[]> = {
    agents: repo.assets.filter((a) => a.type === "agent"),
    skills: repo.assets.filter((a) => a.type === "skill"),
    commands: repo.assets.filter((a) => a.type === "command"),
  };

  for (const [groupName, assets] of Object.entries(groups)) {
    if (assets.length === 0) continue;

    options[groupName] = [];

    for (const asset of assets) {
      const isSelected = currentSelections.includes(asset.path);
      // For skills, use asset.name (the folder name); for others, extract from path
      const displayName = asset.type === "skill"
        ? asset.name
        : (asset.path.split("/").pop() ?? asset.name);

      options[groupName].push({
        value: asset,
        label: displayName,
        hint: isSelected ? "currently linked" : undefined,
      });

      if (isSelected) {
        initialValues.push(asset);
      }
    }
  }

  return { options, initialValues };
}

export const useCommand = defineCommand({
  meta: {
    name: "use",
    description: "Interactive asset picker to select and link assets",
  },
  args: {
    alias: {
      type: "positional",
      description: "Repository alias (optional - will prompt if not provided)",
      required: false,
    },
    assets: {
      type: "positional",
      description: "Asset paths in format alias:path (for non-interactive mode)",
      required: false,
    },
    yes: {
      type: "boolean",
      alias: "y",
      description: "Skip confirmation (for scripting)",
      default: false,
    },
  },
  async run({ args }) {
    intro("ccm use");

    let repo: Repository | undefined;

    // If no alias provided, show repo picker first
    if (!args.alias) {
      const repos = await getRepositories();

      if (repos.length === 0) {
        outro("No repositories registered. Use `ccm add <url>` to add one.");
        return;
      }

      const selected = await select({
        message: "Select a repository",
        options: repos.map((r) => ({
          value: r.alias,
          label: isGitHubRepository(r) ? `${r.alias} (${r.owner}/${r.repo})` : `${r.alias} (local)`,
          hint: `${r.assets.length} assets`,
        })),
      });

      if (isCancel(selected)) {
        outro("Cancelled");
        return;
      }

      repo = await getRepository(selected as string);
    } else {
      repo = await getRepository(args.alias);
    }

    if (!repo) {
      console.error(`Repository "${args.alias}" not found`);
      process.exit(1);
    }

    if (repo.assets.length === 0) {
      outro(`No assets found in ${repo.alias}`);
      return;
    }

    // Get current selections
    const currentSelections = await getSelectionsForRepo(repo.alias);
    const currentPaths = currentSelections.map((s) => s.assetPath);

    // Build grouped options for non-MCP assets
    const { options, initialValues } = buildGroupedAssetOptions(repo, currentPaths);
    const mcpAssets = repo.assets.filter((a) => a.type === "mcp");

    const results: string[] = [];
    let hasMcpSelections = false;

    // Step 1: Select non-MCP assets if any (using groupMultiselect)
    const hasNonMcpAssets = Object.keys(options).length > 0;
    if (hasNonMcpAssets) {
      const selected = await groupMultiselect({
        message: "Select assets to link (space to toggle, enter to confirm)",
        options,
        initialValues,
        required: false,
      });

      if (isCancel(selected)) {
        outro("Cancelled");
        return;
      }

      const selectedAssets = selected as Asset[];

      // Link selected non-MCP assets
      if (selectedAssets.length > 0) {
        const s = spinner();
        s.start("Linking assets");

        for (const asset of selectedAssets) {
          try {
            const selection = await linkAsset(repo.alias, asset);
            results.push(`✓ Linked ${selection.linkedPath.split("/").pop()}`);
          } catch (error) {
            results.push(`✗ Failed to link ${asset.path}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }

        s.stop("Linked assets");
      }
    }

    // Step 2: Handle MCP assets - show individual server picker for each
    if (mcpAssets.length > 0) {
      note("MCP configurations found. Select individual servers to stage.");

      for (const mcpAsset of mcpAssets) {
        const sourcePath = join(repo.localPath, mcpAsset.path);
        const serverNames = await getMcpServers(sourcePath);

        if (serverNames.length === 0) {
          results.push(`⚠ No servers found in ${mcpAsset.path}`);
          continue;
        }

        // Get currently staged servers for this file
        const stagedServers = await getStagedServersForFile(repo.alias, mcpAsset.path);

        const fileName = mcpAsset.path.split("/").pop() ?? mcpAsset.path;

        // Use groupMultiselect with a single "servers" group for select-all behavior
        const serverOptions: Record<string, Array<{ value: string; label: string; hint?: string }>> = {
          servers: serverNames.map((name) => ({
            value: name,
            label: name,
            hint: stagedServers.includes(name) ? "staged" : undefined,
          })),
        };

        const selectedServers = await groupMultiselect({
          message: `Select servers from ${fileName}`,
          options: serverOptions,
          initialValues: stagedServers,
          required: false,
        });

        if (isCancel(selectedServers)) {
          continue; // Skip this MCP file but continue with others
        }

        const servers = selectedServers as string[];
        if (servers.length > 0) {
          await stageMcpServers(repo.alias, mcpAsset.path, servers);
          hasMcpSelections = true;
          for (const server of servers) {
            results.push(`✓ Staged MCP server: ${server}`);
          }
        }
      }
    }

    // Show results
    if (results.length > 0) {
      console.log();
      for (const result of results) {
        console.log(`  ${result}`);
      }
    }

    if (hasMcpSelections) {
      console.log();
      console.log("  Run `ccm mcp sync` to apply staged MCP servers");
    }

    if (results.length === 0) {
      outro("No assets selected");
    } else {
      outro("Done");
    }
  },
});
