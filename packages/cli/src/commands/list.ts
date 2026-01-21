import { defineCommand } from "citty";
import { getRepositories } from "@71zone/ccm-core";

export const listCommand = defineCommand({
  meta: {
    name: "list",
    description: "Show all registered repositories",
  },
  async run() {
    const repos = await getRepositories();

    if (repos.length === 0) {
      console.log("No repositories registered. Use `ccm add <url>` to add one.");
      return;
    }

    console.log();
    for (const repo of repos) {
      const counts = {
        agent: repo.assets.filter((a) => a.type === "agent").length,
        skill: repo.assets.filter((a) => a.type === "skill").length,
        command: repo.assets.filter((a) => a.type === "command").length,
        mcp: repo.assets.filter((a) => a.type === "mcp").length,
      };

      const repoDisplay = `github.com/${repo.owner}/${repo.repo}`;
      const countsDisplay = `${counts.agent}a  ${counts.skill}s  ${counts.command}c  ${counts.mcp}m`;

      console.log(`  ${repo.alias.padEnd(6)} ${repoDisplay.padEnd(50)} ${countsDisplay}`);
    }
    console.log();
  },
});
