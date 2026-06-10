/**
 * Per-tool access policy for the MCP server.
 *
 * Lets operators disable specific tools (e.g. chrome_inject_script,
 * chrome_bookmark_delete) without environment-variable all-or-nothing flags and
 * without code changes. The policy is a small JSON file that is enforced in two
 * places:
 *   1. ListTools — denied tools are hidden so agents never discover them.
 *   2. CallTool  — denied tools are rejected as a defense-in-depth backstop.
 *
 * Resolution order for the policy file:
 *   1. CHROME_MCP_TOOL_POLICY env var (explicit path)
 *   2. <homedir>/.chrome-mcp-agent/tool-policy.json (default location)
 *
 * Policy file shape (decision defaults to "allow" when a tool is unlisted):
 *   {
 *     "tools": {
 *       "chrome_inject_script":   { "decision": "deny" },
 *       "chrome_bookmark_delete": { "decision": "deny" }
 *     }
 *   }
 *
 * A top-level "default": "deny" flips the model to allow-list mode, where only
 * tools explicitly marked "allow" are exposed.
 *
 * See hangwin/mcp-chrome#320 (and #169).
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export const TOOL_POLICY_ENV = 'CHROME_MCP_TOOL_POLICY';

type Decision = 'allow' | 'deny';

interface ToolPolicyEntry {
  decision?: Decision;
}

interface ToolPolicyFile {
  default?: Decision;
  tools?: Record<string, ToolPolicyEntry>;
}

export interface ToolPolicy {
  defaultDecision: Decision;
  perTool: Map<string, Decision>;
}

const EMPTY_POLICY: ToolPolicy = {
  defaultDecision: 'allow',
  perTool: new Map(),
};

let cachedPolicy: ToolPolicy | null = null;

function resolvePolicyPath(): string {
  const fromEnv = process.env[TOOL_POLICY_ENV];
  if (typeof fromEnv === 'string' && fromEnv.trim().length > 0) {
    return fromEnv.trim();
  }
  return path.join(os.homedir(), '.chrome-mcp-agent', 'tool-policy.json');
}

function normalizeDecision(value: unknown): Decision | undefined {
  if (value === 'allow' || value === 'deny') return value;
  return undefined;
}

function parsePolicy(raw: string): ToolPolicy {
  const data = JSON.parse(raw) as ToolPolicyFile;
  const perTool = new Map<string, Decision>();
  if (data.tools && typeof data.tools === 'object') {
    for (const [name, entry] of Object.entries(data.tools)) {
      const decision = normalizeDecision(entry?.decision);
      if (decision) perTool.set(name, decision);
    }
  }
  return {
    defaultDecision: normalizeDecision(data.default) ?? 'allow',
    perTool,
  };
}

/**
 * Load and cache the tool policy. Missing file → permissive (allow-all) policy.
 * Malformed file → permissive policy with a warning, so a bad config can never
 * silently lock the user out of every tool.
 */
export function loadToolPolicy(): ToolPolicy {
  if (cachedPolicy) return cachedPolicy;

  const policyPath = resolvePolicyPath();
  try {
    if (!fs.existsSync(policyPath)) {
      cachedPolicy = EMPTY_POLICY;
      return cachedPolicy;
    }
    const raw = fs.readFileSync(policyPath, 'utf8');
    cachedPolicy = parsePolicy(raw);
  } catch (error) {
    console.error(
      `Failed to load tool policy from ${policyPath}; allowing all tools. Error:`,
      error instanceof Error ? error.message : String(error),
    );
    cachedPolicy = EMPTY_POLICY;
  }
  return cachedPolicy;
}

/** Reset the cached policy (used by tests / hot reload). */
export function resetToolPolicyCache(): void {
  cachedPolicy = null;
}

/** Whether a given tool is allowed by the active policy. */
export function isToolAllowed(name: string, policy: ToolPolicy = loadToolPolicy()): boolean {
  const explicit = policy.perTool.get(name);
  if (explicit) return explicit === 'allow';
  return policy.defaultDecision === 'allow';
}
