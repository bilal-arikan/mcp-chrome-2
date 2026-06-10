import { createErrorResponse, ToolResult } from '@/common/tool-handler';
import { BaseBrowserToolExecutor } from '../base-browser';
import { TOOL_NAMES } from 'chrome-mcp-shared';
import { cdpSessionManager } from '@/utils/cdp-session-manager';

const CDP_SESSION_KEY = 'paste-clipboard';

interface PasteClipboardToolParams {
  selector?: string; // optional CSS selector for the target input
  ref?: string; // optional element ref from chrome_read_page
  text?: string; // optional explicit text to paste instead of the clipboard
  tabId?: number; // target existing tab id
  windowId?: number; // when no tabId, pick active tab from this window
}

/**
 * Paste clipboard text into a page input.
 *
 * Reads the clipboard and writes it into the focused (or targeted) element via
 * CDP Input.insertText. It does NOT inject a content script, so it is not
 * blocked by page CSP. See hangwin/mcp-chrome#205.
 */
class PasteClipboardTool extends BaseBrowserToolExecutor {
  name = TOOL_NAMES.BROWSER.PASTE_CLIPBOARD;

  async execute(args: PasteClipboardToolParams): Promise<ToolResult> {
    const { selector, ref, text } = args;

    try {
      const explicit = await this.tryGetTab(args.tabId);
      const tab = explicit || (await this.getActiveTabOrThrowInWindow(args.windowId));
      if (!tab.id) {
        return createErrorResponse('Active tab has no ID');
      }
      const tabId = tab.id;

      // 1. Focus the target element if one was specified; otherwise the
      //    currently focused element (the user's cursor position) is used.
      if (ref || selector) {
        const focused = await this.focusTarget(tabId, ref, selector);
        if (!focused.ok) {
          return createErrorResponse(focused.error || 'Failed to focus target element');
        }
      }

      // 2. Resolve the text to paste: explicit text wins, otherwise read the
      //    system clipboard from the page context (CSP-safe, no inject script).
      let pasteText = typeof text === 'string' ? text : null;
      let source: 'argument' | 'clipboard' = 'argument';
      if (pasteText === null) {
        const clip = await this.readClipboard(tabId);
        if (!clip.ok) {
          return createErrorResponse(
            clip.error ||
              'Could not read the clipboard. Pass the "text" parameter explicitly instead.',
          );
        }
        pasteText = clip.text;
        source = 'clipboard';
      }

      if (!pasteText) {
        return createErrorResponse('Nothing to paste (clipboard is empty and no text provided).');
      }

      // 3. Ensure there is a focused, editable element to receive the text.
      const target = await this.getFocusedEditableInfo(tabId);
      if (!target.ok) {
        return createErrorResponse(
          target.error ||
            'No focused editable element to paste into. Click/focus an input first or pass selector/ref.',
        );
      }

      // 4. Insert the text via CDP (does not require clipboard permission and
      //    fires proper input events for frameworks).
      await cdpSessionManager.withSession(tabId, CDP_SESSION_KEY, async () => {
        await cdpSessionManager.sendCommand(tabId, 'Input.insertText', { text: pasteText });
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              source,
              length: pasteText.length,
              target: target.info,
            }),
          },
        ],
        isError: false,
      };
    } catch (error) {
      return createErrorResponse(
        `Error pasting clipboard: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Focus a target element by ref or selector using chrome.scripting (CSP-safe).
   */
  private async focusTarget(
    tabId: number,
    ref?: string,
    selector?: string,
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      const [injection] = await chrome.scripting.executeScript({
        target: { tabId },
        world: 'ISOLATED',
        func: (refId: string | undefined, sel: string | undefined) => {
          let el: Element | null = null;
          if (refId) {
            try {
              const map = (window as any).__claudeElementMap;
              const weak = map && map[refId];
              const target = weak && typeof weak.deref === 'function' ? weak.deref() : null;
              el = target instanceof Element ? target : null;
            } catch {
              el = null;
            }
          }
          if (!el && sel) {
            try {
              el = document.querySelector(sel);
            } catch {
              el = null;
            }
          }
          if (!el) return { ok: false, error: 'Target element not found' };
          if (typeof (el as HTMLElement).focus === 'function') {
            (el as HTMLElement).focus();
          }
          return { ok: document.activeElement === el };
        },
        args: [ref, selector],
      });
      const result = injection?.result as { ok?: boolean; error?: string } | undefined;
      if (!result) return { ok: false, error: 'Failed to run focus script' };
      if (!result.ok) return { ok: false, error: result.error || 'Element could not be focused' };
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Read clipboard text from the page context via chrome.scripting (CSP-safe).
   */
  private async readClipboard(
    tabId: number,
  ): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
    try {
      const [injection] = await chrome.scripting.executeScript({
        target: { tabId },
        world: 'ISOLATED',
        func: async () => {
          try {
            const text = await navigator.clipboard.readText();
            return { ok: true, text };
          } catch (err) {
            return { ok: false, error: (err as Error)?.message || 'clipboard read failed' };
          }
        },
      });
      const result = injection?.result as
        | { ok: boolean; text?: string; error?: string }
        | undefined;
      if (!result) return { ok: false, error: 'Failed to run clipboard script' };
      if (!result.ok) {
        return { ok: false, error: result.error || 'Clipboard read was denied' };
      }
      return { ok: true, text: result.text || '' };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Inspect the currently focused element to confirm it can receive text.
   */
  private async getFocusedEditableInfo(
    tabId: number,
  ): Promise<{ ok: true; info: unknown } | { ok: false; error: string }> {
    try {
      const [injection] = await chrome.scripting.executeScript({
        target: { tabId },
        world: 'ISOLATED',
        func: () => {
          const el = document.activeElement as HTMLElement | null;
          if (!el || el === document.body) {
            return { ok: false, error: 'No element is focused' };
          }
          const tag = el.tagName.toLowerCase();
          const isInput = tag === 'input' || tag === 'textarea';
          const isEditable = (el as HTMLElement).isContentEditable;
          if (!isInput && !isEditable) {
            return { ok: false, error: `Focused element <${tag}> is not editable` };
          }
          return {
            ok: true,
            info: {
              tagName: tag,
              type: (el as HTMLInputElement).type || null,
              id: el.id || null,
              name: (el as HTMLInputElement).name || null,
            },
          };
        },
      });
      const result = injection?.result as
        | { ok: boolean; info?: unknown; error?: string }
        | undefined;
      if (!result) return { ok: false, error: 'Failed to inspect focused element' };
      if (!result.ok) return { ok: false, error: result.error || 'No editable focused element' };
      return { ok: true, info: result.info };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
}

export const pasteClipboardTool = new PasteClipboardTool();
