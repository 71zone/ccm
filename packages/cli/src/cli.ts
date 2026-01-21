import { defineCommand, runMain } from "citty";
import { addCommand } from "./commands/add.js";
import { doctorCommand } from "./commands/doctor.js";
import { listCommand } from "./commands/list.js";
import { mcpCommand } from "./commands/mcp.js";
import { removeCommand } from "./commands/remove.js";
import { showCommand } from "./commands/show.js";
import { statusCommand } from "./commands/status.js";
import { unuseCommand } from "./commands/unuse.js";
import { updateCommand } from "./commands/update.js";
import { useCommand } from "./commands/use.js";

const main = defineCommand({
  meta: {
    name: "ccm",
    version: "0.1.0",
    description: "Claude Code Extension Manager - Manage Claude Code configurations from Git repositories",
  },
  subCommands: {
    add: addCommand,
    list: listCommand,
    ls: listCommand, // alias
    remove: removeCommand,
    rm: removeCommand, // alias
    update: updateCommand,
    show: showCommand,
    use: useCommand,
    unuse: unuseCommand,
    status: statusCommand,
    doctor: doctorCommand,
    mcp: mcpCommand,
  },
});

runMain(main);
