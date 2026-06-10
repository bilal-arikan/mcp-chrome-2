import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { setupTools } from './register-tools';

/**
 * Create a fresh MCP Server instance.
 *
 * IMPORTANT: A new instance MUST be created per transport/connection.
 * The MCP SDK's `Server.connect(transport)` assigns `this._transport = transport`,
 * so sharing a single server across connections makes a second client's
 * `initialize` orphan the first client's transport (responses get written to the
 * wrong socket) and triggers "Already connected to a transport" errors on the
 * HTTP/SSE endpoints. Returning a new instance per connection keeps each
 * client's transport isolated.
 *
 * See issues hangwin/mcp-chrome#321 and #345.
 */
export const getMcpServer = (): Server => {
  const server = new Server(
    {
      name: 'ChromeMcpServer',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  setupTools(server);
  return server;
};
