import { defineCommand } from "citty";
import { diagnose, getSelections, getStagedMcp, type Selection } from "@71zone/ccm-core";

function groupSelectionsByType(selections: Selection[]): Record<string, Selection[]> {
  const grouped: Record<string, Selection[]> = {};

  for (const selection of selections) {
    const key = `${selection.type}s`;
    if (!grouped[key]) {
      grouped[key] = [];
    }
    grouped[key].push(selection);
  }

  return grouped;
}

export const statusCommand = defineCommand({
  meta: {
    name: "status",
    description: "Show currently linked assets",
  },
  async run() {
    const selections = await getSelections();
    const stagedMcp = await getStagedMcp();
    const diagnosis = await diagnose();

    if (selections.length === 0 && stagedMcp.length === 0) {
      console.log("\nNo assets currently linked.");
      console.log('Use `ccm use <alias>` to select assets.\n');
      return;
    }

    console.log();

    // Group by type and display
    const grouped = groupSelectionsByType(selections.filter((s) => s.type !== "mcp"));

    for (const [category, items] of Object.entries(grouped)) {
      console.log(`${category}/`);
      for (const selection of items) {
        // For skills, extract folder name from assetPath (e.g., "coding" from "skills/coding/SKILL.md")
        // For others, use the filename from linkedPath
        const displayName = selection.type === "skill"
          ? selection.assetPath.split("/").slice(-2, -1)[0] ?? selection.assetPath
          : (selection.linkedPath.split("/").pop() ?? "");
        const healthStatus = diagnosis.broken.find(
          (b) => b.selection.repoAlias === selection.repoAlias && b.selection.assetPath === selection.assetPath
        );
        const status = healthStatus ? "✗ broken" : "✓";
        console.log(`  ${displayName.padEnd(30)} ${status}`);
      }
    }

    // Show staged MCP servers
    if (stagedMcp.length > 0) {
      console.log("mcp/ (staged)");
      // Group by repo for cleaner display
      const byRepo = new Map<string, string[]>();
      for (const s of stagedMcp) {
        if (!byRepo.has(s.repoAlias)) {
          byRepo.set(s.repoAlias, []);
        }
        byRepo.get(s.repoAlias)?.push(s.serverName);
      }
      for (const [repo, servers] of byRepo) {
        console.log(`  ${repo}: ${servers.join(", ")}`);
      }
    }

    console.log();

    // Show helpful commands if there are issues
    if (diagnosis.broken.length > 0) {
      console.log("Run `ccm doctor cure` to fix broken links");
    }

    if (stagedMcp.length > 0) {
      console.log("Run `ccm mcp sync` to apply staged MCP configs");
    }

    console.log();
  },
});
