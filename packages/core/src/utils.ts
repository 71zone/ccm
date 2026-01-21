import { exec } from "node:child_process";
import { promisify } from "node:util";

/**
 * Promisified exec
 */
export const execAsync = promisify(exec);
