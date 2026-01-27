// Types
export type {
  Asset,
  AssetType,
  CcmConfig,
  DetectionResult,
  DiagnosisResult,
  GitHubRepository,
  LinkHealth,
  LocalRepository,
  McpConfig,
  McpServerConfig,
  RegistryType,
  Repository,
  Selection,
  StagedMcpServer,
  StrayAsset,
} from "./types.js";

// Type guards
export { isGitHubRepository, isLocalRepository } from "./types.js";

// Paths
export {
  getAgentsDir,
  getClaudeDir,
  getCommandsDir,
  getConfigDir,
  getConfigPath,
  getDataDir,
  getLocalVaultDir,
  getMcpConfigPath,
  getReposDir,
  getSkillsDir,
} from "./paths.js";

// Config management
export {
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

// Alias utilities
export { generateAlias, getNamespacedFilename, isLegacyAlias, parseGitHubUrl } from "./alias.js";

// Asset detection
export { detectAssets, flattenAssets, getAssetCounts, getMcpServers } from "./detection.js";

// Repository management
export {
  cloneRepository,
  removeRepo,
  updateActiveRepos,
  updateAllRepos,
  updateRepo,
} from "./repository.js";

// Linking
export {
  buildMcpConfig,
  cure,
  diagnose,
  getMcpPreview,
  linkAsset,
  stageMcpServers,
  syncMcp,
  unlinkAsset,
  unstageMcpServers,
} from "./linking.js";

// Stray asset detection
export {
  isExternalSymlink,
  isSymlinkToCcmVault,
  scanStrayAssets,
} from "./stray.js";

// Utilities
export { execAsync } from "./utils.js";
