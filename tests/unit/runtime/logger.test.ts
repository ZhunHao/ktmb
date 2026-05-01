import { describe, expect, it } from "vitest";
import { createLogger, type Logger } from "../../../src/runtime/logger.js";

describe("createLogger", () => {
  it("captures messages on the in-memory transport", () => {
    const sink: Array<{ level: string; msg: string; err?: unknown }> = [];
    const log: Logger = createLogger({
      transport: (rec) => {
        sink.push(rec);
      },
    });
    log.info("hello", { foo: 1 });
    log.error("boom", new Error("nope"));
    expect(sink).toEqual([
      { level: "info", msg: "hello", err: { foo: 1 } },
      { level: "error", msg: "boom", err: expect.any(Error) },
    ]);
  });
});
