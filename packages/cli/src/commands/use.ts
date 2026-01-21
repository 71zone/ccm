import { defineCommand } from "citty";
import { intro, multiselect, outro, select, spinner, isCancel } from "@clack/prompts";
import {
  getRepositories,
  getRepository,
  getSelectionsForRepo,
  linkAsset,
  type Asset,
  type Repository,
} from "@71zone/ccm-core";

interface AssetOption {
  value: { asset: Asset; selected: boolean };
  label: string;
  hint?: string;
}

function buildAssetOptions(repo: Repository, currentSelections: string[]): AssetOption[] {
  const options: AssetOption[] = [];

  // Group assets by type
  const groups: Record<string, Asset[]> = {
    agents: repo.assets.filter((a) => a.type === "agent"),
    skills: repo.assets.filter((a) => a.type === "skill"),
    commands: repo.assets.filter((a) => a.type === "command"),
    mcp: repo.assets.filter((a) => a.type === "mcp"),
  };

  for (const [groupName, assets] of Object.entries(groups)) {
    if (assets.length === 0) continue;

    for (const asset of assets) {
      const isSelected = currentSelections.includes(asset.path);
      const filename = asset.path.split("/").pop() ?? asset.name;

      options.push({
        value: { asset, selected: isSelected },
        label: `${groupName}/${filename}`,
        hint: isSelected ? "currently linked" : undefined,
      });
    }
  }

  return options;
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
          label: `${r.alias} (${r.owner}/${r.repo})`,
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

    // Build options with current selection state
    const options = buildAssetOptions(repo, currentPaths);

    // Show multiselect picker
    const selected = await multiselect({
      message: "Select assets to link (space to toggle, enter to confirm)",
      options,
      initialValues: options.filter((o) => o.value.selected).map((o) => o.value),
      required: false,
    });

    if (isCancel(selected)) {
      outro("Cancelled");
      return;
    }

    const selectedAssets = (selected as Array<{ asset: Asset; selected: boolean }>).map((s) => s.asset);

    if (selectedAssets.length === 0) {
      outro("No assets selected");
      return;
    }

    // Link selected assets
    const s = spinner();
    s.start("Linking assets");

    const results: string[] = [];

    for (const asset of selectedAssets) {
      try {
        const selection = await linkAsset(repo.alias, asset);
        if (asset.type === "mcp") {
          results.push(`✓ Staged ${repo.alias}:${asset.path} for MCP sync`);
        } else {
          results.push(`✓ Linked ${selection.linkedPath.split("/").pop()}`);
        }
      } catch (error) {
        results.push(`✗ Failed to link ${asset.path}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    s.stop("Done");

    for (const result of results) {
      console.log(`  ${result}`);
    }

    const mcpCount = selectedAssets.filter((a) => a.type === "mcp").length;
    if (mcpCount > 0) {
      console.log();
      console.log("  Run `ccm mcp sync` to apply MCP configurations");
    }

    outro("Assets linked successfully");
  },
});
