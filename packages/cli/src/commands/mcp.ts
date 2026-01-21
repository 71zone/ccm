import { defineCommand } from "citty";
import { confirm, intro, outro, isCancel } from "@clack/prompts";
import { buildMcpConfig, getMcpPreview, getStagedMcp, syncMcp } from "@71zone/ccm-core";

const showSubcommand = defineCommand({
  meta: {
    name: "show",
    description: "Preview merged MCP configuration",
  },
  async run() {
    const staged = await getStagedMcp();

    if (staged.length === 0) {
      console.log("\nNo MCP configurations staged.");
      console.log('Use `ccm use <alias>` to select MCP configs.\n');
      return;
    }

    const merged = await buildMcpConfig();

    console.log();
    console.log(`# Merged from: ${staged.map((s) => `${s.repoAlias}:${s.assetPath.split("/").pop()}`).join(", ")}`);
    console.log();
    console.log(JSON.stringify(merged, null, 2));
    console.log();
  },
});

const syncSubcommand = defineCommand({
  meta: {
    name: "sync",
    description: "Build and apply merged MCP config to ~/.claude/mcp.json",
  },
  args: {
    yes: {
      type: "boolean",
      alias: "y",
      description: "Skip confirmation",
      default: false,
    },
  },
  async run({ args }) {
    intro("ccm mcp sync");

    const staged = await getStagedMcp();

    if (staged.length === 0) {
      outro("No MCP configurations staged");
      return;
    }

    const preview = await getMcpPreview();

    console.log();
    console.log("Preview:");
    for (const addition of preview.additions) {
      console.log(`  + ${addition.name} (from ${addition.from})`);
    }
    console.log();

    if (!args.yes) {
      const shouldApply = await confirm({
        message: "Apply to ~/.claude/mcp.json?",
      });

      if (isCancel(shouldApply) || !shouldApply) {
        outro("Cancelled");
        return;
      }
    }

    await syncMcp();

    outro("✓ Applied");
  },
});

export const mcpCommand = defineCommand({
  meta: {
    name: "mcp",
    description: "Manage MCP configurations",
  },
  subCommands: {
    show: showSubcommand,
    sync: syncSubcommand,
  },
  async run() {
    // Default to showing help
    console.log("\nUsage: ccm mcp <command>\n");
    console.log("Commands:");
    console.log("  show    Preview merged MCP configuration");
    console.log("  sync    Build and apply merged MCP config to ~/.claude/mcp.json\n");
  },
});
