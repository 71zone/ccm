import { defineCommand } from "citty";
import { intro, outro, spinner } from "@clack/prompts";
import { cure, diagnose } from "@71zone/ccm-core";

const cureSubcommand = defineCommand({
  meta: {
    name: "cure",
    description: "Auto-fix issues (remove broken symlinks, clean orphaned selections)",
  },
  async run() {
    intro("ccm doctor cure");

    const s = spinner();
    s.start("Fixing issues");

    const result = await cure();

    s.stop("Done");

    if (result.fixed === 0 && result.errors.length === 0) {
      outro("Nothing to fix - all links are healthy!");
      return;
    }

    if (result.fixed > 0) {
      console.log(`  ✓ Fixed ${result.fixed} broken link(s)`);
    }

    for (const error of result.errors) {
      console.log(`  ✗ ${error}`);
    }

    outro("Repair complete");
  },
});

export const doctorCommand = defineCommand({
  meta: {
    name: "doctor",
    description: "Check for issues with linked assets",
  },
  subCommands: {
    cure: cureSubcommand,
  },
  async run() {
    intro("ccm doctor");

    const result = await diagnose();

    console.log();

    // Show broken links
    for (const link of result.broken) {
      const issue =
        link.issue === "broken_symlink"
          ? "Broken symlink"
          : "Missing source (deleted upstream?)";
      console.log(`✗ ${issue}: ${link.selection.linkedPath}`);
    }

    // Show healthy count
    if (result.healthy.length > 0) {
      console.log(`✓ ${result.healthy.length} healthy link(s)`);
    }

    console.log();

    if (result.broken.length > 0) {
      outro('Run `ccm doctor cure` to auto-fix');
    } else {
      outro("All links are healthy!");
    }
  },
});
