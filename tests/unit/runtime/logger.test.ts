import { afterEach, describe, expect, it, vi } from "vitest";
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

  it("omits the err field when only a message is supplied", () => {
    const sink: Array<{ level: string; msg: string; err?: unknown }> = [];
    const log = createLogger({ transport: (rec) => sink.push(rec) });
    log.info("plain");
    log.error("plain-error");
    expect(sink).toEqual([
      { level: "info", msg: "plain" },
      { level: "error", msg: "plain-error" },
    ]);
  });
});

describe("createLogger default console transport", () => {
  afterEach(() => vi.restoreAllMocks());

  it("routes info through console.log with err passthrough", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const logger = createLogger();
    logger.info("hi", { meta: 1 });
    logger.info("hi-bare");
    expect(log).toHaveBeenNthCalledWith(1, "hi", { meta: 1 });
    expect(log).toHaveBeenNthCalledWith(2, "hi-bare");
  });

  it("routes error through console.error with err passthrough", () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logger = createLogger();
    const e = new Error("kaboom");
    logger.error("oops", e);
    logger.error("oops-bare");
    expect(errSpy).toHaveBeenNthCalledWith(1, "oops", e);
    expect(errSpy).toHaveBeenNthCalledWith(2, "oops-bare");
  });
});
