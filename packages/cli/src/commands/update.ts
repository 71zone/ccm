import { defineCommand } from "citty";
import { intro, outro, spinner } from "@clack/prompts";
import { updateActiveRepos, updateAllRepos, updateRepo } from "@71zone/ccm-core";

export const updateCommand = defineCommand({
  meta: {
    name: "update",
    description: "Pull latest changes from registered repositories",
  },
  args: {
    alias: {
      type: "positional",
      description: "Specific repository alias to update",
      required: false,
    },
    all: {
      type: "boolean",
      alias: "a",
      description: "Update all registered repos (default: only repos with active selections)",
      default: false,
    },
  },
  async run({ args }) {
    intro("ccm update");

    const s = spinner();

    // Update specific repo
    if (args.alias) {
      s.start(`Updating ${args.alias}`);
      try {
        const repo = await updateRepo(args.alias);
        if (!repo) {
          s.stop(`Repository "${args.alias}" not found`);
          process.exit(1);
        }
        s.stop(`Updated ${args.alias}`);
        outro("✓ Done");
      } catch (error) {
        s.stop(`Failed to update ${args.alias}`);
        console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
      return;
    }

    // Update all or only active repos
    s.start(args.all ? "Updating all repositories" : "Updating repositories with active selections");

    const results = args.all ? await updateAllRepos() : await updateActiveRepos();

    s.stop("Update complete");

    if (results.length === 0) {
      outro("No repositories to update");
      return;
    }

    for (const result of results) {
      if (result.success) {
        console.log(`  ✓ ${result.alias}`);
      } else {
        console.log(`  ✗ ${result.alias}: ${result.error}`);
      }
    }

    const successCount = results.filter((r) => r.success).length;
    outro(`Updated ${successCount}/${results.length} repositories`);
  },
});
