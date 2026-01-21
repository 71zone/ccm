import { defineCommand } from "citty";
import { confirm, intro, isCancel, groupMultiselect, outro, note } from "@clack/prompts";
import {
  getSelections,
  getStagedMcp,
  unlinkAsset,
  unstageMcpServer,
  type Selection,
  type StagedMcpServer,
} from "@71zone/ccm-core";

export const unuseCommand = defineCommand({
  meta: {
    name: "unuse",
    description: "Interactively unlink assets and unstage MCP servers",
  },
  args: {
    target: {
      type: "positional",
      description: "Asset to unlink in format alias:path (optional - interactive if omitted)",
      required: false,
    },
    all: {
      type: "boolean",
      description: "Unlink all assets and unstage all MCP servers",
      default: false,
    },
  },
  async run({ args }) {
    intro("ccm unuse");

    // Non-interactive mode: explicit target provided
    if (args.target) {
      const [alias, ...pathParts] = args.target.split(":");
      const assetPath = pathParts.join(":");

      if (!alias || !assetPath) {
        console.error('Invalid format. Use "alias:path" (e.g., "nguy:agents/coder.md")');
        process.exit(1);
      }

      const success = await unlinkAsset(alias, assetPath);

      if (!success) {
        console.error(`Selection "${args.target}" not found`);
        process.exit(1);
      }

      outro(`✓ Unlinked ${alias}-${assetPath.split("/").pop()}`);
      return;
    }

    // Get current state
    const selections = await getSelections();
    const stagedMcp = await getStagedMcp();

    // Filter out MCP from selections (MCP uses stagedMcp now)
    const linkedAssets = selections.filter((s) => s.type !== "mcp");

    if (linkedAssets.length === 0 && stagedMcp.length === 0) {
      outro("No assets are currently linked. Nothing to unuse.");
      return;
    }

    // --all flag: unlink everything with confirmation
    if (args.all) {
      const shouldProceed = await confirm({
        message: `Unlink ${linkedAssets.length} asset(s) and unstage ${stagedMcp.length} MCP server(s)?`,
      });

      if (isCancel(shouldProceed) || !shouldProceed) {
        outro("Cancelled");
        return;
      }

      // Unlink all assets
      for (const selection of linkedAssets) {
        await unlinkAsset(selection.repoAlias, selection.assetPath);
      }

      // Unstage all MCP servers
      for (const staged of stagedMcp) {
        await unstageMcpServer(staged.repoAlias, staged.assetPath, staged.serverName);
      }

      outro(`✓ Unlinked ${linkedAssets.length} asset(s), unstaged ${stagedMcp.length} MCP server(s)`);

      if (stagedMcp.length > 0) {
        console.log("\nRun `ccm mcp sync` to apply MCP changes\n");
      }
      return;
    }

    // Interactive mode
    let unlinkedCount = 0;
    let unstagedCount = 0;

    // Step 1: Non-MCP assets (agents, skills, commands) - grouped by repo
    if (linkedAssets.length > 0) {
      note("Select assets to UNLINK (currently linked assets shown below)");

      // Group by repo for groupMultiselect
      const byRepo = new Map<string, Selection[]>();
      for (const selection of linkedAssets) {
        const existing = byRepo.get(selection.repoAlias) || [];
        existing.push(selection);
        byRepo.set(selection.repoAlias, existing);
      }

      // Build grouped options
      const assetOptions: Record<string, Array<{ value: Selection; label: string; hint?: string }>> = {};

      for (const [repoAlias, repoSelections] of byRepo) {
        assetOptions[repoAlias] = repoSelections.map((selection) => {
          const displayName = selection.type === "skill"
            ? selection.assetPath.split("/").slice(-2, -1)[0] ?? selection.assetPath
            : (selection.linkedPath.split("/").pop() ?? "");
          return {
            value: selection,
            label: `${selection.type}/${displayName}`,
          };
        });
      }

      const selected = await groupMultiselect({
        message: "Select assets to unlink:",
        options: assetOptions,
        required: false,
      });

      if (isCancel(selected)) {
        outro("Cancelled");
        return;
      }

      // Unlink selected assets
      for (const selection of selected as Selection[]) {
        await unlinkAsset(selection.repoAlias, selection.assetPath);
        unlinkedCount++;
      }
    }

    // Step 2: MCP servers (global, across all repos) - grouped by repo
    if (stagedMcp.length > 0) {
      note("Select MCP servers to UNSTAGE (currently staged servers shown below)");

      // Group by repo for groupMultiselect
      const byRepo = new Map<string, StagedMcpServer[]>();
      for (const staged of stagedMcp) {
        const existing = byRepo.get(staged.repoAlias) || [];
        existing.push(staged);
        byRepo.set(staged.repoAlias, existing);
      }

      // Build grouped options
      const mcpOptions: Record<string, Array<{ value: StagedMcpServer; label: string; hint?: string }>> = {};

      for (const [repoAlias, repoStaged] of byRepo) {
        mcpOptions[repoAlias] = repoStaged.map((staged) => ({
          value: staged,
          label: staged.serverName,
          hint: staged.assetPath.split("/").pop(),
        }));
      }

      const selected = await groupMultiselect({
        message: "Select MCP servers to unstage:",
        options: mcpOptions,
        required: false,
      });

      if (isCancel(selected)) {
        outro("Cancelled");
        return;
      }

      // Unstage selected servers
      for (const staged of selected as StagedMcpServer[]) {
        await unstageMcpServer(staged.repoAlias, staged.assetPath, staged.serverName);
        unstagedCount++;
      }
    }

    // Summary
    if (unlinkedCount === 0 && unstagedCount === 0) {
      outro("No changes made");
      return;
    }

    const parts: string[] = [];
    if (unlinkedCount > 0) parts.push(`${unlinkedCount} asset(s) unlinked`);
    if (unstagedCount > 0) parts.push(`${unstagedCount} MCP server(s) unstaged`);

    outro(`✓ ${parts.join(", ")}`);

    if (unstagedCount > 0) {
      console.log("\nRun `ccm mcp sync` to apply MCP changes\n");
    }
  },
});
