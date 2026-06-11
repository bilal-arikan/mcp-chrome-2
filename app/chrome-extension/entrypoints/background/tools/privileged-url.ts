/**
 * Privileged-URL guard
 *
 * Some tab URLs cannot be scripted by a content-script / CDP from this
 * extension: chrome:// pages, the Web Store, other extensions' pages, the
 * browser's PDF/devtools surfaces, etc. Attempting CDP Runtime.evaluate against
 * another extension's page yields the opaque CDP error
 * "Cannot access a chrome-extension:// URL of different extension", which reads
 * like a bug but is really "you're pointed at the wrong tab".
 *
 * Centralizing the check lets tools fail fast with an actionable message
 * (pass an explicit tabId of a normal web page) instead of leaking the raw CDP
 * error. See hangwin/mcp-chrome — chrome-extension:// evaluate failure.
 */

const PRIVILEGED_SCHEMES = [
  'chrome:',
  'chrome-untrusted:',
  'devtools:',
  'edge:',
  'brave:',
  'about:',
  'view-source:',
];

const WEB_STORE_HOSTS = ['chromewebstore.google.com', 'chrome.google.com'];

export interface PrivilegedUrlCheck {
  privileged: boolean;
  /** Human-readable reason, present only when privileged. */
  reason?: string;
}

/**
 * Decide whether a URL is off-limits for scripting/CDP from this extension.
 * Our own extension pages are allowed (we can script ourselves); other
 * extensions' pages are not.
 */
export function inspectUrl(url: string | undefined | null): PrivilegedUrlCheck {
  const raw = (url || '').trim();
  if (!raw) {
    // No URL usually means a brand-new tab the SW can't see yet.
    return { privileged: true, reason: 'Tab has no accessible URL yet (still loading?).' };
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { privileged: true, reason: `Tab URL is not a navigable web URL: ${raw}` };
  }

  const scheme = parsed.protocol.toLowerCase();

  if (scheme === 'chrome-extension:') {
    const ownId = chrome.runtime.id;
    if (parsed.hostname === ownId) {
      return { privileged: false };
    }
    return {
      privileged: true,
      reason:
        "Tab is another extension's page (chrome-extension://). Scripting it is blocked by " +
        'Chrome. Pass an explicit tabId pointing at a normal web page (http/https).',
    };
  }

  if (PRIVILEGED_SCHEMES.includes(scheme)) {
    return {
      privileged: true,
      reason: `Tab is a privileged browser page (${scheme}) that cannot be scripted. Pass a tabId of a normal web page.`,
    };
  }

  if ((scheme === 'http:' || scheme === 'https:') && WEB_STORE_HOSTS.includes(parsed.hostname)) {
    return {
      privileged: true,
      reason:
        'Tab is the Chrome Web Store, which blocks extension scripting. Pass a tabId of a different web page.',
    };
  }

  return { privileged: false };
}

/**
 * Convenience: returns an error string if the tab is privileged, else null.
 */
export function getPrivilegedTabError(tab: chrome.tabs.Tab | null | undefined): string | null {
  if (!tab) return 'No target tab resolved.';
  const check = inspectUrl(tab.url);
  if (!check.privileged) return null;
  const where = typeof tab.id === 'number' ? ` (tabId ${tab.id})` : '';
  return `Cannot run script in this tab${where}: ${check.reason}`;
}
