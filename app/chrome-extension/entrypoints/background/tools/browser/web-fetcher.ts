import { createErrorResponse, ToolResult } from '@/common/tool-handler';
import { BaseBrowserToolExecutor } from '../base-browser';
import { TOOL_NAMES } from 'chrome-mcp-shared';
import { TOOL_MESSAGE_TYPES } from '@/common/message-types';

interface WebFetcherToolParams {
  htmlContent?: boolean; // get the visible HTML content of the current page. default: false
  textContent?: boolean; // get the visible text content of the current page. default: true
  url?: string; // optional URL to fetch content from (if not provided, uses active tab)
  selector?: string; // optional CSS selector to get content from a specific element
  tabId?: number; // target existing tab id
  background?: boolean; // do not activate/focus
  windowId?: number; // target window id to pick active tab or create tab
  // Wait for the page to finish loading before reading content (see #259)
  waitForLoad?: boolean; // wait until tab status is 'complete' (default: true)
  waitTimeout?: number; // max ms to wait for load (default: 10000)
  waitForSelector?: string; // additionally wait until this CSS selector appears
}

const DEFAULT_WAIT_TIMEOUT_MS = 10_000;

/**
 * Wait until a tab reaches status 'complete', or the timeout elapses.
 * Resolves regardless so callers can still attempt to read whatever is present.
 * See hangwin/mcp-chrome#259.
 */
async function waitForTabComplete(tabId: number, timeoutMs: number): Promise<void> {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab.status === 'complete') return;
  } catch {
    return;
  }

  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      try {
        chrome.tabs.onUpdated.removeListener(listener);
      } catch {
        // Ignore
      }
      clearTimeout(timer);
      resolve();
    };

    const listener = (updatedTabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        finish();
      }
    };

    const timer = setTimeout(finish, Math.max(0, timeoutMs));
    chrome.tabs.onUpdated.addListener(listener);
  });
}

class WebFetcherTool extends BaseBrowserToolExecutor {
  name = TOOL_NAMES.BROWSER.WEB_FETCHER;

  /**
   * Execute web fetcher operation
   */
  async execute(args: WebFetcherToolParams): Promise<ToolResult> {
    // Handle mutually exclusive parameters: if htmlContent is true, textContent is forced to false
    const htmlContent = args.htmlContent === true;
    const textContent = htmlContent ? false : args.textContent !== false; // Default is true, unless htmlContent is true or textContent is explicitly set to false
    const url = args.url;
    const selector = args.selector;
    const explicitTabId = args.tabId;
    const background = args.background === true;
    const windowId = args.windowId;
    const waitForLoad = args.waitForLoad !== false; // default: true
    const waitTimeout =
      typeof args.waitTimeout === 'number' && Number.isFinite(args.waitTimeout)
        ? Math.max(0, Math.floor(args.waitTimeout))
        : DEFAULT_WAIT_TIMEOUT_MS;
    const waitForSelector = args.waitForSelector;

    console.log(`Starting web fetcher with options:`, {
      htmlContent,
      textContent,
      url,
      selector,
    });

    try {
      // Get tab to fetch content from
      let tab;

      if (typeof explicitTabId === 'number') {
        tab = await chrome.tabs.get(explicitTabId);
      } else if (url) {
        // If URL is provided, check if it's already open
        console.log(`Checking if URL is already open: ${url}`);
        const allTabs = await chrome.tabs.query({});

        // Find tab with matching URL
        const matchingTabs = allTabs.filter((t) => {
          // Normalize URLs for comparison (remove trailing slashes)
          const tabUrl = t.url?.endsWith('/') ? t.url.slice(0, -1) : t.url;
          const targetUrl = url.endsWith('/') ? url.slice(0, -1) : url;
          return tabUrl === targetUrl;
        });

        if (matchingTabs.length > 0) {
          // Use existing tab
          tab = matchingTabs[0];
          console.log(`Found existing tab with URL: ${url}, tab ID: ${tab.id}`);
        } else {
          // Create new tab with the URL
          console.log(`No existing tab found with URL: ${url}, creating new tab`);
          tab = await chrome.tabs.create({ url, active: background ? false : true });

          // Wait for the page to actually finish loading instead of a fixed
          // delay, so slow pages don't return empty content. See #259.
          if (waitForLoad && tab.id) {
            console.log('Waiting for page to load...');
            await waitForTabComplete(tab.id, waitTimeout);
          }
        }
      } else {
        // Use active tab (prefer specified window)
        const tabs =
          typeof windowId === 'number'
            ? await chrome.tabs.query({ active: true, windowId })
            : await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tabs[0]) {
          return createErrorResponse('No active tab found');
        }
        tab = tabs[0];
      }

      if (!tab.id) {
        return createErrorResponse('Tab has no ID');
      }

      // Ensure the page has finished loading before reading, so content from a
      // still-loading tab isn't returned empty/partial. See #259.
      if (waitForLoad) {
        await waitForTabComplete(tab.id, waitTimeout);
      }

      // Optionally bring tab/window to foreground
      if (!background) {
        await chrome.tabs.update(tab.id, { active: true });
        await chrome.windows.update(tab.windowId, { focused: true });
      }

      // Prepare result object
      const result: any = {
        success: true,
        url: tab.url,
        title: tab.title,
      };

      await this.injectContentScript(tab.id, ['inject-scripts/web-fetcher-helper.js']);

      // Optionally wait for a specific element to appear before reading (#259).
      if (waitForSelector) {
        await this.waitForSelectorInTab(tab.id, waitForSelector, waitTimeout);
      }

      // Get HTML content if requested
      if (htmlContent) {
        const htmlResponse = await this.sendMessageToTab(tab.id, {
          action: TOOL_MESSAGE_TYPES.WEB_FETCHER_GET_HTML_CONTENT,
          selector: selector,
        });

        if (htmlResponse.success) {
          result.htmlContent = htmlResponse.htmlContent;
        } else {
          console.error('Failed to get HTML content:', htmlResponse.error);
          result.htmlContentError = htmlResponse.error;
        }
      }

      // Get text content if requested (and htmlContent is not true)
      if (textContent) {
        const textResponse = await this.sendMessageToTab(tab.id, {
          action: TOOL_MESSAGE_TYPES.WEB_FETCHER_GET_TEXT_CONTENT,
          selector: selector,
        });

        if (textResponse.success) {
          result.textContent = textResponse.textContent;

          // Include article metadata if available
          if (textResponse.article) {
            result.article = {
              title: textResponse.article.title,
              byline: textResponse.article.byline,
              siteName: textResponse.article.siteName,
              excerpt: textResponse.article.excerpt,
              lang: textResponse.article.lang,
            };
          }

          // Include page metadata if available
          if (textResponse.metadata) {
            result.metadata = textResponse.metadata;
          }
        } else {
          console.error('Failed to get text content:', textResponse.error);
          result.textContentError = textResponse.error;
        }
      }

      // Interactive elements feature has been removed

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result),
          },
        ],
        isError: false,
      };
    } catch (error) {
      console.error('Error in web fetcher:', error);
      return createErrorResponse(
        `Error fetching web content: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Poll the page until the given CSS selector exists or the timeout elapses.
   * Best-effort: resolves regardless so reading can still proceed. See #259.
   */
  private async waitForSelectorInTab(
    tabId: number,
    selector: string,
    timeoutMs: number,
  ): Promise<void> {
    const deadline = Date.now() + Math.max(0, timeoutMs);
    const POLL_INTERVAL_MS = 200;

    // Loop in the background; each probe runs a tiny script in the page.
    // We re-check Date.now() here (in the SW) rather than inside the page so we
    // don't depend on the page clock.

    while (true) {
      try {
        const [injection] = await chrome.scripting.executeScript({
          target: { tabId },
          world: 'ISOLATED',
          func: (sel: string) => !!document.querySelector(sel),
          args: [selector],
        });
        if (injection?.result === true) return;
      } catch {
        // Page may be mid-navigation; keep trying until the deadline.
      }
      if (Date.now() >= deadline) return;
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }
}

export const webFetcherTool = new WebFetcherTool();

interface GetInteractiveElementsToolParams {
  textQuery?: string; // Text to search for within interactive elements (fuzzy search)
  selector?: string; // CSS selector to filter interactive elements
  includeCoordinates?: boolean; // Include element coordinates in the response (default: true)
  types?: string[]; // Types of interactive elements to include (default: all types)
}

class GetInteractiveElementsTool extends BaseBrowserToolExecutor {
  name = TOOL_NAMES.BROWSER.GET_INTERACTIVE_ELEMENTS;

  /**
   * Execute get interactive elements operation
   */
  async execute(args: GetInteractiveElementsToolParams): Promise<ToolResult> {
    const { textQuery, selector, includeCoordinates = true, types } = args;

    console.log(`Starting get interactive elements with options:`, args);

    try {
      // Get current tab
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabs[0]) {
        return createErrorResponse('No active tab found');
      }

      const tab = tabs[0];
      if (!tab.id) {
        return createErrorResponse('Active tab has no ID');
      }

      // Ensure content script is injected
      await this.injectContentScript(tab.id, ['inject-scripts/interactive-elements-helper.js']);

      // Send message to content script
      const result = await this.sendMessageToTab(tab.id, {
        action: TOOL_MESSAGE_TYPES.GET_INTERACTIVE_ELEMENTS,
        textQuery,
        selector,
        includeCoordinates,
        types,
      });

      if (!result.success) {
        return createErrorResponse(result.error || 'Failed to get interactive elements');
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              elements: result.elements,
              count: result.elements.length,
              query: {
                textQuery,
                selector,
                types: types || 'all',
              },
            }),
          },
        ],
        isError: false,
      };
    } catch (error) {
      console.error('Error in get interactive elements operation:', error);
      return createErrorResponse(
        `Error getting interactive elements: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

export const getInteractiveElementsTool = new GetInteractiveElementsTool();
