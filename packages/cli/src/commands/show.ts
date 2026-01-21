import { defineCommand } from "citty";
import { getRepository, type Asset } from "@71zone/ccm-core";

function groupAssetsByType(assets: Asset[]): Record<string, Asset[]> {
  const grouped: Record<string, Asset[]> = {
    agents: [],
    skills: [],
    commands: [],
    mcp: [],
  };

  for (const asset of assets) {
    switch (asset.type) {
      case "agent":
        grouped["agents"]?.push(asset);
        break;
      case "skill":
        grouped["skills"]?.push(asset);
        break;
      case "command":
        grouped["commands"]?.push(asset);
        break;
      case "mcp":
        grouped["mcp"]?.push(asset);
        break;
    }
  }

  return grouped;
}

export const showCommand = defineCommand({
  meta: {
    name: "show",
    description: "Display available assets in a repository",
  },
  args: {
    alias: {
      type: "positional",
      description: "Repository alias",
      required: true,
    },
  },
  async run({ args }) {
    const repo = await getRepository(args.alias);

    if (!repo) {
      console.error(`Repository "${args.alias}" not found`);
      process.exit(1);
    }

    console.log();
    console.log(`${repo.alias} (${repo.owner}/${repo.repo})`);

    const grouped = groupAssetsByType(repo.assets);

    for (const [category, assets] of Object.entries(grouped)) {
      if (assets.length === 0) continue;

      console.log(`├── ${category}/`);
      assets.forEach((asset, index) => {
        const isLast = index === assets.length - 1;
        const prefix = isLast ? "└──" : "├──";
        console.log(`│   ${prefix} ${asset.path.split("/").pop()}`);
      });
    }

    console.log();
  },
});
