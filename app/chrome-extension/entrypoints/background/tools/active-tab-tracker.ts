/**
 * Active-tab tracker
 *
 * Chrome's `chrome.tabs.query({ active: true, currentWindow: true })` resolves
 * against the "last focused normal window". In a multi-window setup the service
 * worker's notion of the focused window can lag behind (or point at a different
 * window than the one the user just acted on), so a tool that omits an explicit
 * tabId can silently target the wrong tab — even a privileged page belonging to
 * another extension. That produces confusing failures such as
 * "Cannot access a chrome-extension:// URL of different extension".
 *
 * To make tab resolution deterministic, every tool that drives a tab
 * (navigate, switch_tab, …) records it here. Active-tab resolution then prefers
 * the most recently driven tab when it is still valid, falling back to the
 * native currentWindow query only when no driven tab is known.
 *
 * See hangwin/mcp-chrome — multi-window active-tab ambiguity.
 */

interface DrivenTabRecord {
  tabId: number;
  /** Monotonic-ish marker; larger means more recent. */
  seq: number;
}

let lastDriven: DrivenTabRecord | null = null;
let seqCounter = 0;

/**
 * Record that a tool just navigated to / switched to / acted on this tab.
 * Call this from navigate, switch_tab, and any tool that changes which tab the
 * agent is "looking at".
 */
export function markTabDriven(tabId: number | undefined | null): void {
  if (typeof tabId !== 'number' || !Number.isFinite(tabId) || tabId < 0) {
    return;
  }
  seqCounter += 1;
  lastDriven = { tabId, seq: seqCounter };
}

/**
 * Forget the driven tab when it goes away, so resolution falls back cleanly.
 */
export function clearDrivenTab(tabId: number): void {
  if (lastDriven && lastDriven.tabId === tabId) {
    lastDriven = null;
  }
}

/**
 * Return the last driven tab if it still exists, otherwise null.
 * Validates existence via chrome.tabs.get so a stale/closed tab never wins.
 */
export async function getDrivenTab(): Promise<chrome.tabs.Tab | null> {
  const record = lastDriven;
  if (!record) return null;
  try {
    const tab = await chrome.tabs.get(record.tabId);
    return tab && typeof tab.id === 'number' ? tab : null;
  } catch {
    // Tab was closed; drop the stale record.
    clearDrivenTab(record.tabId);
    return null;
  }
}

/**
 * Wire up automatic cleanup so the tracker never points at a dead tab.
 * Safe to call multiple times (listeners are idempotent-ish; Chrome dedupes
 * identical function references but we guard with a flag anyway).
 */
let listenersInstalled = false;
export function installActiveTabTrackerListeners(): void {
  if (listenersInstalled) return;
  listenersInstalled = true;

  chrome.tabs.onRemoved.addListener((tabId) => {
    clearDrivenTab(tabId);
  });

  // When the user manually activates a tab, treat it as the freshly driven one
  // so manual focus changes are respected by subsequent tool calls.
  chrome.tabs.onActivated.addListener((info) => {
    markTabDriven(info.tabId);
  });
}
