import { defineCommand } from "citty";
import {
  getRepositories,
  scanStrayAssets,
  isGitHubRepository,
  isLocalRepository,
  isLegacyAlias,
  type GitHubRepository,
  type LocalRepository,
  type StrayAsset,
} from "@71zone/ccm-core";

export const listCommand = defineCommand({
  meta: {
    name: "list",
    description: "Show all registered repositories",
  },
  async run() {
    const repos = await getRepositories();
    const strays = await scanStrayAssets();

    const hasStrays =
      strays.agents.length > 0 ||
      strays.skills.length > 0 ||
      strays.commands.length > 0;
    const hasRepos = repos.length > 0;

    // Handle empty state
    if (!hasStrays && !hasRepos) {
      console.log("No registries found. Use `ccm add <url>` to add a GitHub repo.");
      return;
    }

    console.log();

    // Display stray assets first
    if (hasStrays) {
      console.log("  Registry: stray");

      // Helper to display assets grouped by sourceFolder
      const displayAssets = (assets: StrayAsset[], typePrefix: string, suffix = "") => {
        // Group by sourceFolder
        const grouped = new Map<string | undefined, StrayAsset[]>();
        for (const asset of assets) {
          const folder = asset.sourceFolder;
          if (!grouped.has(folder)) {
            grouped.set(folder, []);
          }
          grouped.get(folder)!.push(asset);
        }

        // Display ungrouped (no sourceFolder) first
        const ungrouped = grouped.get(undefined) || [];
        for (const stray of ungrouped) {
          const hint = stray.isExternalSymlink ? " (external)" : "";
          console.log(`    └── ${typePrefix}/${stray.path}${suffix}${hint}`);
        }

        // Display grouped by sourceFolder
        for (const [folder, folderAssets] of grouped) {
          if (folder === undefined) continue;
          console.log(`    └── ${typePrefix}/${folder}/ (external symlink, ${folderAssets.length} items)`);
          for (const stray of folderAssets) {
            console.log(`        └── ${stray.path}`);
          }
        }
      };

      // Show agents
      displayAssets(strays.agents, "agents");

      // Show skills
      displayAssets(strays.skills, "skills", "/");

      // Show commands
      displayAssets(strays.commands, "commands");

      console.log();
    }

    // Separate local and GitHub repos
    const localRepos = repos.filter(isLocalRepository) as LocalRepository[];
    const githubRepos = repos.filter(isGitHubRepository) as GitHubRepository[];

    // Display local registries
    for (const repo of localRepos) {
      console.log("  Registry: local");
      for (const asset of repo.assets) {
        const suffix = asset.type === "skill" ? "/" : "";
        // asset.path already includes the type prefix (e.g., "agents/foo.md")
        console.log(`    \u2514\u2500\u2500 ${asset.path}${suffix}`);
      }
      console.log();
    }

    // Display GitHub registries
    for (const repo of githubRepos) {
      const counts = {
        agent: repo.assets.filter((a) => a.type === "agent").length,
        skill: repo.assets.filter((a) => a.type === "skill").length,
        command: repo.assets.filter((a) => a.type === "command").length,
        mcp: repo.assets.filter((a) => a.type === "mcp").length,
      };

      const legacyHint = isLegacyAlias(repo.alias) ? " [legacy alias]" : "";
      const repoDisplay = `github.com/${repo.owner}/${repo.repo}`;
      const countsDisplay = `${counts.agent}a  ${counts.skill}s  ${counts.command}c  ${counts.mcp}m`;

      console.log(`  Registry: ${repo.alias} (github)${legacyHint}`);
      console.log(`    ${repoDisplay}  ${countsDisplay}`);
      console.log();
    }

    // Show migration hint if there are strays but no repos
    if (hasStrays && !hasRepos) {
      console.log("  Tip: Use `ccm migrate` to migrate stray assets to a local registry.");
      console.log();
    }
  },
});
