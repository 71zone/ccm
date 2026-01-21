import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getAgentsDir,
  getClaudeDir,
  getCommandsDir,
  getConfigDir,
  getConfigPath,
  getDataDir,
  getMcpConfigPath,
  getReposDir,
  getSkillsDir,
} from "./paths.js";

describe("paths", () => {
  const home = homedir();

  describe("getConfigDir", () => {
    it("should return ~/.config/ccm", () => {
      expect(getConfigDir()).toBe(join(home, ".config", "ccm"));
    });
  });

  describe("getConfigPath", () => {
    it("should return ~/.config/ccm/config.json", () => {
      expect(getConfigPath()).toBe(join(home, ".config", "ccm", "config.json"));
    });
  });

  describe("getDataDir", () => {
    it("should return ~/.local/share/ccm", () => {
      expect(getDataDir()).toBe(join(home, ".local", "share", "ccm"));
    });
  });

  describe("getReposDir", () => {
    it("should return ~/.local/share/ccm/repos", () => {
      expect(getReposDir()).toBe(join(home, ".local", "share", "ccm", "repos"));
    });
  });

  describe("getClaudeDir", () => {
    it("should return ~/.claude", () => {
      expect(getClaudeDir()).toBe(join(home, ".claude"));
    });
  });

  describe("getAgentsDir", () => {
    it("should return ~/.claude/agents", () => {
      expect(getAgentsDir()).toBe(join(home, ".claude", "agents"));
    });
  });

  describe("getSkillsDir", () => {
    it("should return ~/.claude/skills", () => {
      expect(getSkillsDir()).toBe(join(home, ".claude", "skills"));
    });
  });

  describe("getCommandsDir", () => {
    it("should return ~/.claude/commands", () => {
      expect(getCommandsDir()).toBe(join(home, ".claude", "commands"));
    });
  });

  describe("getMcpConfigPath", () => {
    it("should return ~/.claude/mcp.json", () => {
      expect(getMcpConfigPath()).toBe(join(home, ".claude", "mcp.json"));
    });
  });
});
