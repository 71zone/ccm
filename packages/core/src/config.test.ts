import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addRepository,
  addSelection,
  clearStagedMcp,
  getRepositories,
  getRepository,
  getSelections,
  getSelectionsForRepo,
  getStagedMcp,
  getStagedServersForFile,
  loadConfig,
  removeRepository,
  removeSelection,
  saveConfig,
  stageMcpServer,
  unstageMcpServer,
  updateRepository,
} from "./config.js";
import type { CcmConfig, Repository, Selection } from "./types.js";

// Mock the paths module to use a temp directory
const TEST_DIR = "/tmp/ccm-test-config";
const TEST_CONFIG_PATH = join(TEST_DIR, "config.json");

vi.mock("./paths.js", () => ({
  getConfigDir: () => TEST_DIR,
  getConfigPath: () => TEST_CONFIG_PATH,
}));

describe("config", () => {
  beforeEach(async () => {
    // Clean up and create test directory
    if (existsSync(TEST_DIR)) {
      await rm(TEST_DIR, { recursive: true });
    }
    await mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    // Clean up
    if (existsSync(TEST_DIR)) {
      await rm(TEST_DIR, { recursive: true });
    }
  });

  describe("loadConfig", () => {
    it("should return default config when file does not exist", async () => {
      const config = await loadConfig();
      expect(config).toEqual({
        repositories: [],
        selections: [],
        stagedMcp: [],
      });
    });

    it("should load existing config", async () => {
      const existingConfig: CcmConfig = {
        repositories: [
          {
            alias: "test",
            url: "https://github.com/test/repo",
            localPath: "/path/to/repo",
            owner: "test",
            repo: "repo",
            assets: [],
            updatedAt: "2024-01-01T00:00:00.000Z",
          },
        ],
        selections: [],
        stagedMcp: [],
      };
      await writeFile(TEST_CONFIG_PATH, JSON.stringify(existingConfig));

      const config = await loadConfig();
      expect(config).toEqual(existingConfig);
    });

    it("should return default config for invalid JSON", async () => {
      await writeFile(TEST_CONFIG_PATH, "not valid json");
      const config = await loadConfig();
      expect(config).toEqual({
        repositories: [],
        selections: [],
        stagedMcp: [],
      });
    });
  });

  describe("saveConfig", () => {
    it("should save config to file", async () => {
      const config: CcmConfig = {
        repositories: [],
        selections: [],
        stagedMcp: [{ repoAlias: "test", assetPath: "mcp.json" }],
      };

      await saveConfig(config);

      const loaded = await loadConfig();
      expect(loaded).toEqual(config);
    });

    it("should create config directory if it does not exist", async () => {
      await rm(TEST_DIR, { recursive: true });

      await saveConfig({ repositories: [], selections: [], stagedMcp: [] });

      expect(existsSync(TEST_CONFIG_PATH)).toBe(true);
    });
  });

  describe("repository operations", () => {
    const testRepo: Repository = {
      alias: "test",
      url: "https://github.com/test/repo",
      localPath: "/path/to/repo",
      owner: "test",
      repo: "repo",
      assets: [{ type: "agent", path: "agents/coder.md", name: "coder" }],
      updatedAt: "2024-01-01T00:00:00.000Z",
    };

    it("should add a repository", async () => {
      await addRepository(testRepo);

      const repos = await getRepositories();
      expect(repos).toHaveLength(1);
      expect(repos[0]).toEqual(testRepo);
    });

    it("should update existing repository with same alias", async () => {
      await addRepository(testRepo);

      const updatedRepo = { ...testRepo, url: "https://github.com/test/updated" };
      await addRepository(updatedRepo);

      const repos = await getRepositories();
      expect(repos).toHaveLength(1);
      expect(repos[0]?.url).toBe("https://github.com/test/updated");
    });

    it("should get repository by alias", async () => {
      await addRepository(testRepo);

      const repo = await getRepository("test");
      expect(repo).toEqual(testRepo);
    });

    it("should return undefined for non-existent repository", async () => {
      const repo = await getRepository("nonexistent");
      expect(repo).toBeUndefined();
    });

    it("should remove repository and associated selections", async () => {
      await addRepository(testRepo);
      await addSelection({
        repoAlias: "test",
        assetPath: "agents/coder.md",
        type: "agent",
        linkedPath: "/path/to/link",
      });

      const removed = await removeRepository("test");

      expect(removed).toEqual(testRepo);
      expect(await getRepositories()).toHaveLength(0);
      expect(await getSelections()).toHaveLength(0);
    });

    it("should return undefined when removing non-existent repository", async () => {
      const removed = await removeRepository("nonexistent");
      expect(removed).toBeUndefined();
    });

    it("should update repository fields", async () => {
      await addRepository(testRepo);

      const updated = await updateRepository("test", {
        updatedAt: "2024-06-01T00:00:00.000Z",
      });

      expect(updated?.updatedAt).toBe("2024-06-01T00:00:00.000Z");
      expect(updated?.alias).toBe("test"); // Other fields unchanged
    });
  });

  describe("selection operations", () => {
    const testSelection: Selection = {
      repoAlias: "test",
      assetPath: "agents/coder.md",
      type: "agent",
      linkedPath: "/home/user/.claude/agents/test-coder.md",
    };

    it("should add a selection", async () => {
      await addSelection(testSelection);

      const selections = await getSelections();
      expect(selections).toHaveLength(1);
      expect(selections[0]).toEqual(testSelection);
    });

    it("should update existing selection", async () => {
      await addSelection(testSelection);

      const updated = { ...testSelection, linkedPath: "/new/path" };
      await addSelection(updated);

      const selections = await getSelections();
      expect(selections).toHaveLength(1);
      expect(selections[0]?.linkedPath).toBe("/new/path");
    });

    it("should remove selection", async () => {
      await addSelection(testSelection);

      const removed = await removeSelection("test", "agents/coder.md");

      expect(removed).toEqual(testSelection);
      expect(await getSelections()).toHaveLength(0);
    });

    it("should get selections for specific repo", async () => {
      await addSelection(testSelection);
      await addSelection({
        ...testSelection,
        repoAlias: "other",
        linkedPath: "/other/path",
      });

      const selections = await getSelectionsForRepo("test");
      expect(selections).toHaveLength(1);
      expect(selections[0]?.repoAlias).toBe("test");
    });
  });

  describe("MCP staging operations", () => {
    it("should stage individual MCP server", async () => {
      await stageMcpServer("test", "mcp.json", "github");

      const staged = await getStagedMcp();
      expect(staged).toHaveLength(1);
      expect(staged[0]).toEqual({ repoAlias: "test", assetPath: "mcp.json", serverName: "github" });
    });

    it("should not duplicate staged MCP server", async () => {
      await stageMcpServer("test", "mcp.json", "github");
      await stageMcpServer("test", "mcp.json", "github");

      const staged = await getStagedMcp();
      expect(staged).toHaveLength(1);
    });

    it("should stage multiple servers from same file", async () => {
      await stageMcpServer("test", "mcp.json", "github");
      await stageMcpServer("test", "mcp.json", "filesystem");

      const staged = await getStagedMcp();
      expect(staged).toHaveLength(2);
    });

    it("should unstage individual MCP server", async () => {
      await stageMcpServer("test", "mcp.json", "github");
      await stageMcpServer("test", "mcp.json", "filesystem");
      await unstageMcpServer("test", "mcp.json", "github");

      const staged = await getStagedMcp();
      expect(staged).toHaveLength(1);
      expect(staged[0]?.serverName).toBe("filesystem");
    });

    it("should get staged servers for specific file", async () => {
      await stageMcpServer("test", "mcp.json", "github");
      await stageMcpServer("test", "mcp.json", "filesystem");
      await stageMcpServer("test", "other.json", "postgres");

      const servers = await getStagedServersForFile("test", "mcp.json");
      expect(servers).toEqual(["github", "filesystem"]);
    });

    it("should clear all staged MCP", async () => {
      await stageMcpServer("test", "mcp1.json", "server1");
      await stageMcpServer("test", "mcp2.json", "server2");

      await clearStagedMcp();

      const staged = await getStagedMcp();
      expect(staged).toHaveLength(0);
    });
  });
});
