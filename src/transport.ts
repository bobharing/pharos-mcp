import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

export type TransportMode = "stdio" | "http";

export function getTransportMode(): TransportMode {
  const mode = process.env.PHAROS_TRANSPORT ?? "stdio";
  if (mode === "http" || mode === "stdio") return mode;
  process.stderr.write(`Unknown transport "${mode}", defaulting to stdio\n`);
  return "stdio";
}

export function getHttpPort(): number {
  const port = Number(process.env.PHAROS_PORT ?? "3000");
  return Number.isFinite(port) && port > 0 ? port : 3000;
}

export async function connectStdio(server: McpServer): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

export async function connectHttp(createServer: () => McpServer): Promise<void> {
  const port = getHttpPort();
  const hostname = process.env.PHAROS_HOST ?? "127.0.0.1";

  Bun.serve({
    port,
    hostname,
    async fetch(req: Request): Promise<Response> {
      const url = new URL(req.url);

      if (url.pathname === "/mcp") {
        const server = createServer();
        const transport = new WebStandardStreamableHTTPServerTransport({
          sessionIdGenerator: undefined, // stateless mode
        });
        await server.connect(transport);
        return await transport.handleRequest(req);
      }

      if (url.pathname === "/health") {
        return new Response("ok");
      }

      return new Response("Not Found", { status: 404 });
    },
  });

  process.stderr.write(`Pharos HTTP transport listening on ${hostname}:${port}\n`);
}
