import { readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const CORE_PKG = resolve(ROOT, "packages/core/package.json");
const CLI_PKG = resolve(ROOT, "packages/cli/package.json");

function log(msg: string) {
  console.log(`[release] ${msg}`);
}

function fail(msg: string): never {
  console.error(`[release] ERROR: ${msg}`);
  process.exit(1);
}

function isValidSemver(version: string): boolean {
  return /^\d+\.\d+\.\d+$/.test(version);
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function writeJson(path: string, data: Record<string, unknown>) {
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
}

function run(cmd: string) {
  log(`$ ${cmd}`);
  execSync(cmd, { cwd: ROOT, stdio: "inherit" });
}

// Main
const version = process.argv[2];

if (!version) {
  fail("Version argument required (e.g., pnpm release 0.2.0)");
}

if (!isValidSemver(version)) {
  fail(`Invalid semver format: "${version}". Expected format: X.Y.Z`);
}

log(`Releasing version ${version}`);

// Update core package.json
log("Updating packages/core/package.json");
const corePkg = readJson(CORE_PKG);
corePkg.version = version;
writeJson(CORE_PKG, corePkg);

// Update cli package.json (keep workspace:* - pnpm handles version at publish time)
log("Updating packages/cli/package.json");
const cliPkg = readJson(CLI_PKG);
cliPkg.version = version;
writeJson(CLI_PKG, cliPkg);

// Git operations
log("Staging changes");
run("git add packages/core/package.json packages/cli/package.json");

log("Creating commit");
try {
  run(`git commit -m "release: v${version}"`);
} catch {
  log("No changes to commit (version already set)");
}

log("Creating tag");
run(`git tag v${version}`);

log("Pushing to remote");
run("git push && git push --tags");

log(`Successfully released v${version}`);
