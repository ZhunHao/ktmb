import type { Ktmb } from "../../core/index.js";
import type { ErrorCode, Result } from "../../core/index.js";

export type McpToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

/**
 * Resolve user-entered station input (code or name) to a station code.
 * Direct code lookup first, then top fuzzy match.
 */
export const resolveStation = (ktmb: Ktmb, input: string): string | undefined =>
  ktmb.stations.getByCode(input)?.code ?? ktmb.stations.search(input, 1)[0]?.code;

/** Wrap any Result as the MCP content envelope. */
export const mcpJson = <T>(result: Result<T>): McpToolResult => ({
  content: [{ type: "text", text: JSON.stringify(result) }],
  isError: !result.ok,
});

/** Wrap a synthetic error as the MCP content envelope. */
export const mcpError = (code: ErrorCode, message: string): McpToolResult => ({
  content: [{ type: "text", text: JSON.stringify({ ok: false, error: { code, message } }) }],
  isError: true,
});
