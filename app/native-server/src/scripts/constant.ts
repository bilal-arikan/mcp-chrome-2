export const COMMAND_NAME = 'mcp-chrome-bridge';

/**
 * Extension IDs allowed to connect to the native host.
 *
 * - The first is the original published/store ID (kept for store installs).
 * - The second is the fixed ID produced by the pinned manifest "key" in
 *   app/chrome-extension/wxt.config.ts, so unpacked dev builds keep a stable ID
 *   across reloads/rebuilds instead of a path-derived one that changes and
 *   breaks the whitelist.
 *
 * Both are whitelisted in the native-messaging manifest's allowed_origins.
 */
export const EXTENSION_IDS = [
  'hbdgbgagpkpjffpklnamcljpakneikee', // published / store build
  'ofjcofiidpnlbiocjojaabanlmfbljmm', // pinned-key unpacked build
] as const;

// Primary ID used wherever a single value is expected (e.g. diagnostics).
export const EXTENSION_ID = EXTENSION_IDS[0];

export const HOST_NAME = 'com.chromemcp.nativehost';
export const DESCRIPTION = 'Node.js Host for Browser Bridge Extension';
