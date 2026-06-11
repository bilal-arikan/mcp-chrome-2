import { createErrorResponse, ToolResult } from '@/common/tool-handler';
import { BaseBrowserToolExecutor } from '../base-browser';
import { TOOL_NAMES } from 'chrome-mcp-shared';
import { setPinnedTab, clearPinnedTab, getPinnedTabId, getPinnedTab } from '../active-tab-tracker';

interface TargetTabToolParams {
  /** Pin this tab as the agent target. Omit with clear:false to query. */
  tabId?: number;
  /** When true, remove the current pin. */
  clear?: boolean;
}

/**
 * Tool for binding the agent to a specific "target" tab.
 *
 * Once a tab is pinned, every other tool that omits an explicit tabId acts on
 * that tab — no matter which window the user is focused on. This lets the agent
 * keep working in a background tab (e.g. a game in window B) while the user
 * keeps working in window A; manual tab switches no longer hijack the agent.
 *
 * Usage:
 *   { tabId: 123 }   pin tab 123 as the target
 *   { clear: true }  release the pin (back to driven/active-tab resolution)
 *   {}               report the current pin without changing it
 */
class TargetTabTool extends BaseBrowserToolExecutor {
  name = TOOL_NAMES.BROWSER.TARGET_TAB;

  async execute(args: TargetTabToolParams): Promise<ToolResult> {
    const { tabId, clear } = args || {};

    try {
      // Release the pin.
      if (clear === true) {
        const previous = getPinnedTabId();
        clearPinnedTab();
        return this.ok({
          message:
            previous === null
              ? 'No target tab was pinned'
              : `Released pinned target tab ${previous}`,
          pinnedTabId: null,
          previousTabId: previous,
        });
      }

      // Pin a new target tab.
      if (typeof tabId === 'number') {
        // Validate the tab exists before pinning so we never bind to a ghost.
        let tab: chrome.tabs.Tab;
        try {
          tab = await chrome.tabs.get(tabId);
        } catch {
          return createErrorResponse(`Tab ${tabId} not found; cannot pin as target`);
        }
        setPinnedTab(tabId);
        return this.ok({
          message: `Pinned target tab ${tabId}. Tools without an explicit tabId now act on it.`,
          pinnedTabId: tabId,
          windowId: tab.windowId,
          url: tab.url,
          title: tab.title,
        });
      }

      // No args: report current pin (validating it still exists).
      const current = await getPinnedTab();
      if (!current || typeof current.id !== 'number') {
        return this.ok({
          message: 'No target tab is pinned',
          pinnedTabId: null,
        });
      }
      return this.ok({
        message: `Target tab ${current.id} is pinned`,
        pinnedTabId: current.id,
        windowId: current.windowId,
        url: current.url,
        title: current.title,
      });
    } catch (error) {
      return createErrorResponse(
        `Error managing target tab: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private ok(payload: Record<string, unknown>): ToolResult {
    return {
      content: [{ type: 'text', text: JSON.stringify({ success: true, ...payload }) }],
      isError: false,
    };
  }
}

export const targetTabTool = new TargetTabTool();
