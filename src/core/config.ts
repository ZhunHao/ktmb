// Centralised constants for the KTMB client. Keep VERSION in sync with
// package.json on release — there's no runtime read because we bundle for
// both Node and Deno and want zero filesystem coupling at import time.
export const VERSION = "0.3.0";
export const USER_AGENT = `ktmb/${VERSION} (+https://github.com/zhunhao/ktmb)`;
export const KITS_BASE_URL = "https://online.ktmb.com.my";
