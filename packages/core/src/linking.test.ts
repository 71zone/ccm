import { existsSync, lstatSync, readlinkSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Asset, Repository, Selection } from "./types.js";

// Test directories
const TEST_DIR = "/tmp/ccm-test-linking";
const TEST_REPOS_DIR = join(TEST_DIR, "repos");
const TEST_CLAUDE_DIR = join(TEST_DIR, "claude");
const TEST_CONFIG_DIR = join(TEST_DIR, "config");
const TEST_CONFIG_PATH = join(TEST_CONFIG_DIR, "config.json");

// Mock paths module
vi.mock("./paths.js", () => ({
  getConfigDir: () => TEST_CONFIG_DIR,
  getConfigPath: () => TEST_CONFIG_PATH,
  getClaudeDir: () => TEST_CLAUDE_DIR,
  getAgentsDir: () => join(TEST_CLAUDE_DIR, "agents"),
  getSkillsDir: () => join(TEST_CLAUDE_DIR, "skills"),
  getCommandsDir: () => join(TEST_CLAUDE_DIR, "commands"),
  getMcpConfigPath: () => join(TEST_CLAUDE_DIR, "mcp.json"),
  getReposDir: () => TEST_REPOS_DIR,
  getDataDir: () => TEST_DIR,
}));

// Import after mocking
const { linkAsset, unlinkAsset, diagnose, cure, buildMcpConfig, syncMcp, stageMcpServers, unstageMcpServers } = await import(
  "./linking.js"
);
const { addRepository, addSelection, getSelections, stageMcpServer, getStagedMcp } = await import(
  "./config.js"
);

describe("linking", () => {
  const testRepo: Repository = {
    alias: "test",
    url: "https://github.com/test/repo",
    localPath: join(TEST_REPOS_DIR, "test"),
    owner: "test",
    repo: "repo",
    assets: [],
    updatedAt: "2024-01-01T00:00:00.000Z",
  };

  beforeEach(async () => {
    // Clean up and create test directories
    if (existsSync(TEST_DIR)) {
      await rm(TEST_DIR, { recursive: true });
    }
    await mkdir(TEST_CONFIG_DIR, { recursive: true });
    await mkdir(TEST_REPOS_DIR, { recursive: true });
    await mkdir(TEST_CLAUDE_DIR, { recursive: true });
    await mkdir(testRepo.localPath, { recursive: true });

    // Initialize empty config
    await writeFile(
      TEST_CONFIG_PATH,
      JSON.stringify({ repositories: [], selections: [], stagedMcp: [] })
    );

    // Register the test repo
    await addRepository(testRepo);
  });

  afterEach(async () => {
    if (existsSync(TEST_DIR)) {
      await rm(TEST_DIR, { recursive: true });
    }
  });

  describe("linkAsset", () => {
    it("should create symlink for agent", async () => {
      // Create source file
      const agentsDir = join(testRepo.localPath, "agents");
      await mkdir(agentsDir);
      const sourcePath = join(agentsDir, "coder.md");
      await writeFile(sourcePath, "# Coder Agent");

      const asset: Asset = { type: "agent", path: "agents/coder.md", name: "coder" };

      const selection = await linkAsset("test", asset);

      expect(selection.repoAlias).toBe("test");
      expect(selection.assetPath).toBe("agents/coder.md");
      expect(selection.type).toBe("agent");
      expect(existsSync(selection.linkedPath)).toBe(true);
      expect(lstatSync(selection.linkedPath).isSymbolicLink()).toBe(true);
      expect(readlinkSync(selection.linkedPath)).toBe(sourcePath);
    });

    it("should create skill directory structure", async () => {
      // Create source file
      const skillDir = join(testRepo.localPath, "skills", "coding");
      await mkdir(skillDir, { recursive: true });
      const sourcePath = join(skillDir, "SKILL.md");
      await writeFile(sourcePath, "# Coding Skill");

      const asset: Asset = { type: "skill", path: "skills/coding/SKILL.md", name: "coding" };

      const selection = await linkAsset("test", asset);

      expect(selection.linkedPath).toContain("test-coding");
      expect(selection.linkedPath).toContain("SKILL.md");
      expect(existsSync(selection.linkedPath)).toBe(true);
    });

    it("should throw error for MCP assets (must use stageMcpServers)", async () => {
      // Create source file
      const mcpContent = JSON.stringify({ mcpServers: { github: {} } });
      await writeFile(join(testRepo.localPath, "mcp.json"), mcpContent);

      const asset: Asset = { type: "mcp", path: "mcp.json", name: "mcp" };

      await expect(linkAsset("test", asset)).rejects.toThrow("MCP assets should be staged");
    });

    it("should throw error for non-existent source", async () => {
      const asset: Asset = { type: "agent", path: "nonexistent.md", name: "nonexistent" };

      await expect(linkAsset("test", asset)).rejects.toThrow("Asset not found");
    });

    it("should throw error for non-existent repo", async () => {
      const asset: Asset = { type: "agent", path: "agents/coder.md", name: "coder" };

      await expect(linkAsset("nonexistent", asset)).rejects.toThrow("Repository not found");
    });
  });

  describe("unlinkAsset", () => {
    it("should remove symlink and selection", async () => {
      // Create and link an agent
      const agentsDir = join(testRepo.localPath, "agents");
      await mkdir(agentsDir);
      await writeFile(join(agentsDir, "coder.md"), "# Coder");

      const asset: Asset = { type: "agent", path: "agents/coder.md", name: "coder" };
      const selection = await linkAsset("test", asset);

      expect(existsSync(selection.linkedPath)).toBe(true);

      const success = await unlinkAsset("test", "agents/coder.md");

      expect(success).toBe(true);
      expect(existsSync(selection.linkedPath)).toBe(false);
      expect(await getSelections()).toHaveLength(0);
    });

    it("should return false for non-existent selection", async () => {
      const success = await unlinkAsset("test", "nonexistent.md");
      expect(success).toBe(false);
    });
  });

  describe("diagnose", () => {
    it("should identify healthy links", async () => {
      const agentsDir = join(testRepo.localPath, "agents");
      await mkdir(agentsDir);
      await writeFile(join(agentsDir, "coder.md"), "# Coder");

      const asset: Asset = { type: "agent", path: "agents/coder.md", name: "coder" };
      await linkAsset("test", asset);

      const result = await diagnose();

      expect(result.healthy).toHaveLength(1);
      expect(result.broken).toHaveLength(0);
    });

    it("should identify broken symlinks", async () => {
      const agentsDir = join(testRepo.localPath, "agents");
      await mkdir(agentsDir);
      await writeFile(join(agentsDir, "coder.md"), "# Coder");

      const asset: Asset = { type: "agent", path: "agents/coder.md", name: "coder" };
      const selection = await linkAsset("test", asset);

      // Delete the source file to break the symlink
      await rm(join(agentsDir, "coder.md"));

      const result = await diagnose();

      expect(result.healthy).toHaveLength(0);
      expect(result.broken).toHaveLength(1);
      // When source is deleted, symlink becomes broken - either issue type is valid
      expect(["broken_symlink", "missing_source"]).toContain(result.broken[0]?.issue);
    });
  });

  describe("cure", () => {
    it("should fix broken links", async () => {
      const agentsDir = join(testRepo.localPath, "agents");
      await mkdir(agentsDir);
      await writeFile(join(agentsDir, "coder.md"), "# Coder");

      const asset: Asset = { type: "agent", path: "agents/coder.md", name: "coder" };
      const selection = await linkAsset("test", asset);

      // Break the symlink
      await rm(join(agentsDir, "coder.md"));

      const result = await cure();

      expect(result.fixed).toBe(1);
      expect(result.errors).toHaveLength(0);
      expect(await getSelections()).toHaveLength(0);
    });
  });

  describe("MCP operations", () => {
    it("should build merged MCP config with selected servers only", async () => {
      // Create MCP file with multiple servers
      const mcpContent = {
        mcpServers: {
          github: { command: "npx", args: ["-y", "@mcp/github"] },
          filesystem: { command: "npx", args: ["-y", "@mcp/filesystem"] },
          postgres: { command: "npx", args: ["-y", "@mcp/postgres"] },
        },
      };
      await writeFile(join(testRepo.localPath, "mcp.json"), JSON.stringify(mcpContent));

      // Stage only github and filesystem
      await stageMcpServer("test", "mcp.json", "github");
      await stageMcpServer("test", "mcp.json", "filesystem");

      const merged = await buildMcpConfig();

      expect(merged.mcpServers).toHaveProperty("github");
      expect(merged.mcpServers).toHaveProperty("filesystem");
      expect(merged.mcpServers).not.toHaveProperty("postgres"); // Not staged
    });

    it("should sync MCP to claude directory", async () => {
      const mcpContent = {
        mcpServers: {
          filesystem: { command: "npx", args: ["-y", "@mcp/filesystem"] },
          github: { command: "npx", args: ["-y", "@mcp/github"] },
        },
      };
      await writeFile(join(testRepo.localPath, "mcp.json"), JSON.stringify(mcpContent));
      await stageMcpServer("test", "mcp.json", "filesystem");

      await syncMcp();

      const mcpPath = join(TEST_CLAUDE_DIR, "mcp.json");
      expect(existsSync(mcpPath)).toBe(true);

      const written = JSON.parse(await readFile(mcpPath, "utf-8"));
      expect(written.mcpServers).toHaveProperty("filesystem");
      expect(written.mcpServers).not.toHaveProperty("github"); // Not staged

      // Staged should be cleared after sync
      expect(await getStagedMcp()).toHaveLength(0);
    });

    it("should stage and unstage multiple servers", async () => {
      const mcpContent = {
        mcpServers: {
          server1: { command: "cmd1" },
          server2: { command: "cmd2" },
        },
      };
      await writeFile(join(testRepo.localPath, "mcp.json"), JSON.stringify(mcpContent));

      await stageMcpServers("test", "mcp.json", ["server1", "server2"]);
      expect(await getStagedMcp()).toHaveLength(2);

      await unstageMcpServers("test", "mcp.json", ["server1"]);
      const staged = await getStagedMcp();
      expect(staged).toHaveLength(1);
      expect(staged[0]?.serverName).toBe("server2");
    });
  });
});
