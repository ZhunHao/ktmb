export type LogLevel = "info" | "error";

export type LogRecord = {
  level: LogLevel;
  msg: string;
  err?: unknown;
};

export type Logger = {
  info: (msg: string, err?: unknown) => void;
  error: (msg: string, err?: unknown) => void;
};

export type LoggerOptions = {
  transport?: (rec: LogRecord) => void;
};

const consoleTransport = (rec: LogRecord): void => {
  if (rec.level === "error") {
    if (rec.err !== undefined) console.error(rec.msg, rec.err);
    else console.error(rec.msg);
  } else {
    if (rec.err !== undefined) console.log(rec.msg, rec.err);
    else console.log(rec.msg);
  }
};

export const createLogger = (opts: LoggerOptions = {}): Logger => {
  const transport = opts.transport ?? consoleTransport;
  return {
    info: (msg, err) =>
      transport(err === undefined ? { level: "info", msg } : { level: "info", msg, err }),
    error: (msg, err) =>
      transport(err === undefined ? { level: "error", msg } : { level: "error", msg, err }),
  };
};
