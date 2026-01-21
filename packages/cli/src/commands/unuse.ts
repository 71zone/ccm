import { defineCommand } from "citty";
import { intro, outro } from "@clack/prompts";
import { unlinkAsset } from "@71zone/ccm-core";

export const unuseCommand = defineCommand({
  meta: {
    name: "unuse",
    description: "Remove a specific selection and its symlink",
  },
  args: {
    target: {
      type: "positional",
      description: "Asset to unlink in format alias:path",
      required: true,
    },
  },
  async run({ args }) {
    intro("ccm unuse");

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
  },
});
