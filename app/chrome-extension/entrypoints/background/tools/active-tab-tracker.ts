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
 * Resolution order for "the tab a tool should act on when no tabId is given":
 *   1. Pinned target tab — an explicit binding set via chrome_target_tab. While
 *      pinned, tools act on this tab no matter which window the *user* is in.
 *      This is what lets the agent drive a background tab in one window while
 *      the user works in another.
 *   2. Driven tab — the tab the agent itself last navigated to / switched to.
 *      Tracks agent intent automatically when nothing is pinned.
 *   3. currentWindow active tab — native fallback.
 *
 * Note: the user manually activating a tab (chrome.tabs.onActivated) does NOT
 * change the agent's target. Manual focus changes are the user's own workflow;
 * letting them hijack the agent target would break parallel work (user in
 * window A, agent in window B). The agent target only moves when the agent
 * itself drives a tab, or when a pin is explicitly set/cleared.
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

/** Explicitly pinned target tab. Wins over the driven tab while set. */
let pinnedTabId: number | null = null;

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
 * Pin a specific tab as the agent's target. While pinned, every tool that omits
 * an explicit tabId acts on this tab regardless of which window is focused.
 */
export function setPinnedTab(tabId: number): void {
  if (typeof tabId !== 'number' || !Number.isFinite(tabId) || tabId < 0) {
    return;
  }
  pinnedTabId = tabId;
}

/** Remove the pinned target, falling back to driven/currentWindow resolution. */
export function clearPinnedTab(): void {
  pinnedTabId = null;
}

/** Return the raw pinned tab id, or null when nothing is pinned. */
export function getPinnedTabId(): number | null {
  return pinnedTabId;
}

/**
 * Return the pinned target tab if it still exists, otherwise null.
 * A closed pinned tab auto-clears so resolution degrades gracefully.
 */
export async function getPinnedTab(): Promise<chrome.tabs.Tab | null> {
  if (pinnedTabId === null) return null;
  try {
    const tab = await chrome.tabs.get(pinnedTabId);
    return tab && typeof tab.id === 'number' ? tab : null;
  } catch {
    // Pinned tab was closed; drop the binding.
    pinnedTabId = null;
    return null;
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
 * Resolve the agent's target tab without an explicit tabId.
 * Pinned target wins, then the driven tab; returns null when neither is valid
 * (callers fall back to a currentWindow query).
 */
export async function getTargetTab(): Promise<chrome.tabs.Tab | null> {
  const pinned = await getPinnedTab();
  if (pinned) return pinned;
  return getDrivenTab();
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
    if (pinnedTabId === tabId) {
      pinnedTabId = null;
    }
  });

  // Intentionally NOT listening to chrome.tabs.onActivated: the user manually
  // switching tabs (often in a different window) must not hijack the agent's
  // target. The agent target only moves via markTabDriven (agent-driven
  // navigation) or an explicit pin set/cleared through chrome_target_tab.
}
