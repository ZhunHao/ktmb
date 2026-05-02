import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

export type RunHttpOptions = {
  port: number;
  host?: string;
  path?: string;
};

export type HttpHandle = {
  port: number;
  stop: () => Promise<void>;
};

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PATH = "/mcp";

const normalizePath = (p: string): string =>
  p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p;

const writeNotFound = (res: ServerResponse): void => {
  res.statusCode = 404;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ error: "not_found" }));
};

const writeServerError = (res: ServerResponse, err: unknown): void => {
  if (res.headersSent) {
    res.end();
    return;
  }
  res.statusCode = 500;
  res.setHeader("Content-Type", "application/json");
  const message = err instanceof Error ? err.message : "internal_error";
  res.end(JSON.stringify({ error: "internal_error", message }));
};

export const runHttp = async (
  server: McpServer,
  opts: RunHttpOptions,
): Promise<HttpHandle> => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
  });
  // SDK 1.29 typings: StreamableHTTPServerTransport's onclose/onerror getters are
  // `(() => void) | undefined`, which collide with Transport's optional-property
  // shape under `exactOptionalPropertyTypes`. The runtime behaviour is correct;
  // cast through Transport to satisfy `server.connect`.
  await server.connect(transport as unknown as Transport);

  const path = normalizePath(opts.path ?? DEFAULT_PATH);
  const host = opts.host ?? DEFAULT_HOST;

  const httpServer: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = req.url ?? "";
    // Strip query string for path comparison.
    const qIndex = url.indexOf("?");
    const reqPath = normalizePath(qIndex >= 0 ? url.slice(0, qIndex) : url);
    if (reqPath !== path) {
      writeNotFound(res);
      return;
    }
    transport.handleRequest(req, res).catch((err) => writeServerError(res, err));
  });

  return new Promise<HttpHandle>((resolve, reject) => {
    const onError = (err: Error): void => {
      reject(err);
    };
    httpServer.once("error", onError);
    httpServer.listen(opts.port, host, () => {
      httpServer.removeListener("error", onError);
      const address = httpServer.address();
      const boundPort = typeof address === "object" && address ? address.port : opts.port;
      resolve({
        port: boundPort,
        stop: async () => {
          try {
            await transport.close?.();
          } catch {
            // best-effort: a failed transport.close() must not block httpServer.close()
          }
          await new Promise<void>((r, rej) => {
            httpServer.close((err) => {
              if (err) rej(err);
              else r();
            });
          });
        },
      });
    });
  });
};
