// Centralised constants for the KTMB client. VERSION is sourced from
// package.json so a single bump on release propagates everywhere — tsup
// inlines the JSON during bundling, and Deno honours the import attribute
// at runtime.
import pkg from "../../package.json" with { type: "json" };

export const VERSION = pkg.version;
export const USER_AGENT = `ktmb/${VERSION} (+https://github.com/zhunhao/ktmb)`;
export const KITS_BASE_URL = "https://online.ktmb.com.my";
