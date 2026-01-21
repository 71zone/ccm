import { describe, expect, it } from "vitest";
import { getNamespacedFilename, parseGitHubUrl } from "./alias.js";

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
