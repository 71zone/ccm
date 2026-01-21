import { defineCommand } from "citty";
import { intro, outro, spinner } from "@clack/prompts";
import { cloneRepository, getAssetCounts, detectAssets } from "@71zone/ccm-core";

export const addCommand = defineCommand({
  meta: {
    name: "add",
    description: "Clone a repository and register it as a source",
  },
  args: {
    url: {
      type: "positional",
      description: "GitHub repository URL",
      required: true,
    },
  },
  async run({ args }) {
    intro("ccm add");

    const s = spinner();
    s.start(`Cloning ${args.url}`);

    try {
      const repo = await cloneRepository(args.url);
      s.stop(`Cloned to ~/.local/share/ccm/repos/${repo.alias}`);

      const detection = await detectAssets(repo.localPath);
      const counts = getAssetCounts(detection);

      outro(
        `✓ Detected: ${counts.agent}a ${counts.skill}s ${counts.command}c ${counts.mcp}m\n` +
          `✓ Registered as "${repo.alias}"`
      );
    } catch (error) {
      s.stop("Failed to clone repository");
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  },
});
