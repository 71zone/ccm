import { defineCommand } from "citty";
import { confirm, intro, outro } from "@clack/prompts";
import { removeRepo } from "@71zone/ccm-core";

export const removeCommand = defineCommand({
  meta: {
    name: "remove",
    description: "Remove a repository and unlink all its assets",
  },
  args: {
    alias: {
      type: "positional",
      description: "Repository alias",
      required: true,
    },
    yes: {
      type: "boolean",
      alias: "y",
      description: "Skip confirmation",
      default: false,
    },
  },
  async run({ args }) {
    intro("ccm remove");

    if (!args.yes) {
      const shouldContinue = await confirm({
        message: `Remove repository "${args.alias}" and all its linked assets?`,
      });

      if (!shouldContinue || typeof shouldContinue === "symbol") {
        outro("Cancelled");
        return;
      }
    }

    const result = await removeRepo(args.alias);

    if (!result) {
      console.error(`Repository "${args.alias}" not found`);
      process.exit(1);
    }

    outro(`Unlinked ${result.unlinkedCount} assets. Removed repository.`);
  },
});
