import { describe, expect, it } from "vitest";
import { generateAlias, getNamespacedFilename, isLegacyAlias, parseGitHubUrl } from "./alias.js";

describe("parseGitHubUrl", () => {
  it("should parse HTTPS GitHub URLs", () => {
    const result = parseGitHubUrl("https://github.com/anthropics/claude-skills");
    expect(result).toEqual({ owner: "anthropics", repo: "claude-skills" });
  });

  it("should parse HTTPS GitHub URLs with .git suffix", () => {
    const result = parseGitHubUrl("https://github.com/anthropics/claude-skills.git");
    expect(result).toEqual({ owner: "anthropics", repo: "claude-skills" });
  });

  it("should parse SSH GitHub URLs", () => {
    const result = parseGitHubUrl("git@github.com:anthropics/claude-skills.git");
    expect(result).toEqual({ owner: "anthropics", repo: "claude-skills" });
  });

  it("should parse shorthand owner/repo format", () => {
    const result = parseGitHubUrl("anthropics/claude-skills");
    expect(result).toEqual({ owner: "anthropics", repo: "claude-skills" });
  });

  it("should parse URLs with trailing /tree/branch path", () => {
    const result = parseGitHubUrl("https://github.com/anthropics/claude-skills/tree/main");
    expect(result).toEqual({ owner: "anthropics", repo: "claude-skills" });
  });

  it("should parse URLs with /blob/branch/file path", () => {
    const result = parseGitHubUrl("https://github.com/anthropics/claude-skills/blob/main/README.md");
    expect(result).toEqual({ owner: "anthropics", repo: "claude-skills" });
  });

  it("should parse URLs with query parameters", () => {
    const result = parseGitHubUrl("https://github.com/anthropics/claude-skills?tab=readme");
    expect(result).toEqual({ owner: "anthropics", repo: "claude-skills" });
  });

  it("should parse URLs with fragment identifiers", () => {
    const result = parseGitHubUrl("https://github.com/anthropics/claude-skills#installation");
    expect(result).toEqual({ owner: "anthropics", repo: "claude-skills" });
  });

  it("should parse URLs without protocol", () => {
    const result = parseGitHubUrl("github.com/anthropics/claude-skills");
    expect(result).toEqual({ owner: "anthropics", repo: "claude-skills" });
  });

  it("should parse URLs with /issues path", () => {
    const result = parseGitHubUrl("https://github.com/anthropics/claude-skills/issues/123");
    expect(result).toEqual({ owner: "anthropics", repo: "claude-skills" });
  });

  it("should return null for invalid URLs", () => {
    expect(parseGitHubUrl("not-a-url")).toBeNull();
    expect(parseGitHubUrl("https://gitlab.com/owner/repo")).toBeNull();
  });
});

describe("getNamespacedFilename", () => {
  it("should create namespaced filename", () => {
    expect(getNamespacedFilename("nguy", "coder")).toBe("nguy-coder");
    expect(getNamespacedFilename("8bu", "writer.md")).toBe("8bu-writer.md");
  });
});

describe("isLegacyAlias", () => {
  it("should detect legacy truncated aliases", () => {
    expect(isLegacyAlias("acme")).toBe(true);
    expect(isLegacyAlias("foo")).toBe(true);
    expect(isLegacyAlias("ab")).toBe(true);
    expect(isLegacyAlias("acme2")).toBe(true);
    expect(isLegacyAlias("foo42")).toBe(true);
  });

  it("should not detect new format aliases as legacy", () => {
    expect(isLegacyAlias("acmefoo.claude-skills")).toBe(false);
    expect(isLegacyAlias("owner.repo")).toBe(false);
    expect(isLegacyAlias("anthropics.claude-skills")).toBe(false);
  });

  it("should not detect longer aliases without dots as legacy", () => {
    // Aliases longer than 4 chars without digits don't match legacy pattern
    expect(isLegacyAlias("longalias")).toBe(false);
  });
});

describe("generateAlias", () => {
  it("should generate owner.repo format alias", async () => {
    const alias = await generateAlias("acmefoo", "claude-skills");
    expect(alias).toBe("acmefoo.claude-skills");
  });

  it("should lowercase the alias", async () => {
    const alias = await generateAlias("AcmeFoo", "Claude-Skills");
    expect(alias).toBe("acmefoo.claude-skills");
  });
});
