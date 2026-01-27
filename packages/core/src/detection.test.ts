import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { detectAssets, flattenAssets, getAssetCounts } from "./detection.js";

const TEST_REPO_DIR = "/tmp/ccm-test-detection";

describe("detection", () => {
  beforeEach(async () => {
    // Clean up and create test directory
    if (existsSync(TEST_REPO_DIR)) {
      await rm(TEST_REPO_DIR, { recursive: true });
    }
    await mkdir(TEST_REPO_DIR, { recursive: true });
  });

  afterEach(async () => {
    // Clean up
    if (existsSync(TEST_REPO_DIR)) {
      await rm(TEST_REPO_DIR, { recursive: true });
    }
  });

  describe("detectAssets", () => {
    it("should detect agents in agents/ directory", async () => {
      const agentsDir = join(TEST_REPO_DIR, "agents");
      await mkdir(agentsDir);
      await writeFile(join(agentsDir, "coder.md"), "# Coder Agent");
      await writeFile(join(agentsDir, "reviewer.md"), "# Reviewer Agent");

      const result = await detectAssets(TEST_REPO_DIR);

      expect(result.agents).toHaveLength(2);
      expect(result.agents.map((a) => a.name).sort()).toEqual(["coder", "reviewer"]);
      expect(result.agents[0]?.type).toBe("agent");
    });

    it("should detect agents with YAML frontmatter", async () => {
      const agentContent = `---
tools:
  - read
  - write
model: claude-3
---
# My Agent
`;
      await writeFile(join(TEST_REPO_DIR, "custom-agent.md"), agentContent);

      const result = await detectAssets(TEST_REPO_DIR);

      expect(result.agents).toHaveLength(1);
      expect(result.agents[0]?.name).toBe("custom-agent");
    });

    it("should detect skills in skills/*/SKILL.md pattern", async () => {
      const skillsDir = join(TEST_REPO_DIR, "skills");
      await mkdir(join(skillsDir, "coding"), { recursive: true });
      await mkdir(join(skillsDir, "debugging"), { recursive: true });
      await writeFile(join(skillsDir, "coding", "SKILL.md"), "# Coding Skill");
      await writeFile(join(skillsDir, "debugging", "SKILL.md"), "# Debugging Skill");

      const result = await detectAssets(TEST_REPO_DIR);

      expect(result.skills).toHaveLength(2);
      expect(result.skills.map((s) => s.name).sort()).toEqual(["coding", "debugging"]);
      expect(result.skills[0]?.type).toBe("skill");
    });

    it("should detect commands in commands/ directory", async () => {
      const commandsDir = join(TEST_REPO_DIR, "commands");
      await mkdir(commandsDir);
      await writeFile(join(commandsDir, "deploy.md"), "# Deploy Command");

      const result = await detectAssets(TEST_REPO_DIR);

      expect(result.commands).toHaveLength(1);
      expect(result.commands[0]?.name).toBe("deploy");
      expect(result.commands[0]?.type).toBe("command");
    });

    it("should detect MCP configs with mcpServers key", async () => {
      const mcpContent = JSON.stringify({
        mcpServers: {
          github: { command: "npx", args: ["-y", "@modelcontextprotocol/server-github"] },
        },
      });
      await writeFile(join(TEST_REPO_DIR, "mcp.json"), mcpContent);

      const result = await detectAssets(TEST_REPO_DIR);

      expect(result.mcp).toHaveLength(1);
      expect(result.mcp[0]?.name).toBe("mcp");
      expect(result.mcp[0]?.type).toBe("mcp");
    });

    it("should not detect JSON files without mcpServers key as MCP", async () => {
      const nonMcpContent = JSON.stringify({ notMcp: true });
      await writeFile(join(TEST_REPO_DIR, "mcp-config.json"), nonMcpContent);

      const result = await detectAssets(TEST_REPO_DIR);

      expect(result.mcp).toHaveLength(0);
    });

    it("should skip hidden directories and node_modules", async () => {
      await mkdir(join(TEST_REPO_DIR, ".hidden", "agents"), { recursive: true });
      await mkdir(join(TEST_REPO_DIR, "node_modules", "agents"), { recursive: true });
      await writeFile(join(TEST_REPO_DIR, ".hidden", "agents", "hidden.md"), "# Hidden");
      await writeFile(join(TEST_REPO_DIR, "node_modules", "agents", "npm.md"), "# NPM");

      const result = await detectAssets(TEST_REPO_DIR);

      expect(result.agents).toHaveLength(0);
    });

    it("should return empty results for non-existent directory", async () => {
      const result = await detectAssets("/nonexistent/path");

      expect(result.agents).toHaveLength(0);
      expect(result.skills).toHaveLength(0);
      expect(result.commands).toHaveLength(0);
      expect(result.mcp).toHaveLength(0);
    });

    it("should detect agents in deeply nested agents/ folders", async () => {
      // Create nested structure: claude/agents/
      const nestedAgentsDir = join(TEST_REPO_DIR, "claude", "agents");
      await mkdir(nestedAgentsDir, { recursive: true });
      await writeFile(join(nestedAgentsDir, "deep-agent.md"), "# Deep Agent");

      // Also create root-level agents
      const rootAgentsDir = join(TEST_REPO_DIR, "agents");
      await mkdir(rootAgentsDir);
      await writeFile(join(rootAgentsDir, "root-agent.md"), "# Root Agent");

      const result = await detectAssets(TEST_REPO_DIR);

      expect(result.agents).toHaveLength(2);
      expect(result.agents.map((a) => a.name).sort()).toEqual(["deep-agent", "root-agent"]);
    });

    it("should detect skills in deeply nested skills/ folders", async () => {
      // Create nested structure: src/claude/skills/coding/SKILL.md
      const nestedSkillDir = join(TEST_REPO_DIR, "src", "claude", "skills", "nested-coding");
      await mkdir(nestedSkillDir, { recursive: true });
      await writeFile(join(nestedSkillDir, "SKILL.md"), "# Nested Coding Skill");

      // Also create root-level skills
      const rootSkillDir = join(TEST_REPO_DIR, "skills", "root-coding");
      await mkdir(rootSkillDir, { recursive: true });
      await writeFile(join(rootSkillDir, "SKILL.md"), "# Root Coding Skill");

      const result = await detectAssets(TEST_REPO_DIR);

      expect(result.skills).toHaveLength(2);
      expect(result.skills.map((s) => s.name).sort()).toEqual(["nested-coding", "root-coding"]);
    });

    it("should detect commands in deeply nested commands/ folders", async () => {
      // Create nested structure: plugins/dev/commands/
      const nestedCommandsDir = join(TEST_REPO_DIR, "plugins", "dev", "commands");
      await mkdir(nestedCommandsDir, { recursive: true });
      await writeFile(join(nestedCommandsDir, "deep-deploy.md"), "# Deep Deploy");

      // Also create root-level commands
      const rootCommandsDir = join(TEST_REPO_DIR, "commands");
      await mkdir(rootCommandsDir);
      await writeFile(join(rootCommandsDir, "root-deploy.md"), "# Root Deploy");

      const result = await detectAssets(TEST_REPO_DIR);

      expect(result.commands).toHaveLength(2);
      expect(result.commands.map((c) => c.name).sort()).toEqual(["deep-deploy", "root-deploy"]);
    });

    it("should detect MCP configs at any depth", async () => {
      // Create nested MCP config
      const nestedDir = join(TEST_REPO_DIR, "config", "mcp");
      await mkdir(nestedDir, { recursive: true });
      await writeFile(
        join(nestedDir, "servers-mcp.json"),
        JSON.stringify({ mcpServers: { nested: {} } })
      );

      // Also create root-level MCP config
      await writeFile(
        join(TEST_REPO_DIR, "mcp.json"),
        JSON.stringify({ mcpServers: { root: {} } })
      );

      const result = await detectAssets(TEST_REPO_DIR);

      expect(result.mcp).toHaveLength(2);
    });
  });

  describe("flattenAssets", () => {
    it("should flatten all asset types into single array", async () => {
      // Create one of each type
      const agentsDir = join(TEST_REPO_DIR, "agents");
      const skillsDir = join(TEST_REPO_DIR, "skills", "test");
      const commandsDir = join(TEST_REPO_DIR, "commands");

      await mkdir(agentsDir);
      await mkdir(skillsDir, { recursive: true });
      await mkdir(commandsDir);

      await writeFile(join(agentsDir, "agent.md"), "# Agent");
      await writeFile(join(skillsDir, "SKILL.md"), "# Skill");
      await writeFile(join(commandsDir, "cmd.md"), "# Command");
      await writeFile(
        join(TEST_REPO_DIR, "mcp.json"),
        JSON.stringify({ mcpServers: {} })
      );

      const result = await detectAssets(TEST_REPO_DIR);
      const flat = flattenAssets(result);

      expect(flat).toHaveLength(4);
      expect(flat.map((a) => a.type).sort()).toEqual(["agent", "command", "mcp", "skill"]);
    });
  });

  describe("getAssetCounts", () => {
    it("should return counts by type", async () => {
      const agentsDir = join(TEST_REPO_DIR, "agents");
      await mkdir(agentsDir);
      await writeFile(join(agentsDir, "a1.md"), "# A1");
      await writeFile(join(agentsDir, "a2.md"), "# A2");

      const result = await detectAssets(TEST_REPO_DIR);
      const counts = getAssetCounts(result);

      expect(counts).toEqual({
        agent: 2,
        skill: 0,
        command: 0,
        mcp: 0,
      });
    });
  });
});
