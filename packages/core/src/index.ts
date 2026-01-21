// Types
export type {
  Asset,
  AssetType,
  CcmConfig,
  DetectionResult,
  DiagnosisResult,
  LinkHealth,
  McpConfig,
  McpServerConfig,
  Repository,
  Selection,
} from "./types.js";

// Paths
export {
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
  loadConfig,
  removeRepository,
  removeSelection,
  saveConfig,
  stageMcp,
  unstageMcp,
  updateRepository,
} from "./config.js";

// Alias utilities
export { generateAlias, getNamespacedFilename, parseGitHubUrl } from "./alias.js";

// Asset detection
export { detectAssets, flattenAssets, getAssetCounts } from "./detection.js";

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
  syncMcp,
  unlinkAsset,
} from "./linking.js";

// Utilities
export { execAsync } from "./utils.js";
