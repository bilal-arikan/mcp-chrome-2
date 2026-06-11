import type { ImageContent, TextContent } from '@modelcontextprotocol/sdk/types.js';
import type { ToolResult } from '@/common/tool-handler';

/**
 * Image-content helpers
 *
 * Screenshot / zoom tools used to return the captured image as a base64 string
 * embedded inside a JSON `text` block. MCP clients then received one giant text
 * blob (hundreds of KB), which blew past output limits and spilled to disk —
 * e.g. a single chrome_computer screenshot serialized to ~400K characters.
 *
 * The MCP protocol has a first-class `image` content type for exactly this:
 * the client renders/handles it as an image instead of dumping raw base64 into
 * the text channel. Returning images this way keeps the text payload tiny.
 *
 * See hangwin/mcp-chrome — screenshot output token overflow.
 */

/** Strip a `data:<mime>;base64,` prefix if present, returning raw base64. */
export function stripDataUrlPrefix(data: string): string {
  return data.replace(/^data:[^;]+;base64,/, '');
}

/**
 * Build a ToolResult that carries an image as a proper MCP image content block,
 * plus a compact text summary so the agent still gets structured metadata
 * (success flag, dimensions, etc.) without the base64 bloat.
 */
export function createImageResponse(params: {
  base64Data: string;
  mimeType: string;
  /** Small JSON-serializable summary; base64 must NOT be included here. */
  summary?: Record<string, unknown>;
}): ToolResult {
  const data = stripDataUrlPrefix(params.base64Data);

  const image: ImageContent = {
    type: 'image',
    data,
    mimeType: params.mimeType,
  };

  const content: (TextContent | ImageContent)[] = [image];

  if (params.summary) {
    content.unshift({
      type: 'text',
      text: JSON.stringify(params.summary),
    });
  }

  return { content, isError: false };
}
