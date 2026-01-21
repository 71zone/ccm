/**
 * Asset types supported by CCM
 */
export type AssetType = "agent" | "skill" | "command" | "mcp";

/**
 * An asset detected in a repository
 */
export interface Asset {
  /** Asset type */
  type: AssetType;
  /** Relative path within the repository */
  path: string;
  /** Display name (filename without extension) */
  name: string;
}

/**
 * A registered repository
 */
export interface Repository {
  /** Short alias for the repository */
  alias: string;
  /** Full GitHub URL */
  url: string;
  /** Local path where repo is cloned */
  localPath: string;
  /** GitHub username/org */
  owner: string;
  /** Repository name */
  repo: string;
  /** Detected assets */
  assets: Asset[];
  /** Last updated timestamp */
  updatedAt: string;
}

/**
 * A selected asset from a repository
 */
export interface Selection {
  /** Repository alias */
  repoAlias: string;
  /** Asset path within repository */
  assetPath: string;
  /** Asset type */
  type: AssetType;
  /** Symlink target path */
  linkedPath: string;
}

/**
 * MCP server configuration
 */
export interface McpServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  [key: string]: unknown;
}

/**
 * MCP configuration file structure
 */
export interface McpConfig {
  mcpServers: Record<string, McpServerConfig>;
}

/**
 * A staged MCP server selection
 */
export interface StagedMcpServer {
  /** Repository alias */
  repoAlias: string;
  /** Path to the MCP config file within repository */
  assetPath: string;
  /** Individual server name to include */
  serverName: string;
}

/**
 * CCM configuration state
 */
export interface CcmConfig {
  /** Registered repositories */
  repositories: Repository[];
  /** Currently active selections */
  selections: Selection[];
  /** Staged MCP server selections (not yet synced) */
  stagedMcp: StagedMcpServer[];
}

/**
 * Result of a repository detection scan
 */
export interface DetectionResult {
  agents: Asset[];
  skills: Asset[];
  commands: Asset[];
  mcp: Asset[];
}

/**
 * Health check result for a link
 */
export interface LinkHealth {
  selection: Selection;
  healthy: boolean;
  issue?: "broken_symlink" | "missing_source";
}

/**
 * Doctor diagnosis result
 */
export interface DiagnosisResult {
  healthy: LinkHealth[];
  broken: LinkHealth[];
}
