// Centralised constants for the KTMB client. VERSION is sourced from
// package.json so a single bump on release propagates everywhere — tsup
// inlines the JSON during bundling, and Deno honours the import attribute
// at runtime.
import pkg from "../../package.json" with { type: "json" };

export const VERSION = pkg.version;
export const USER_AGENT = `ktmb/${VERSION} (+https://github.com/zhunhao/ktmb)`;
export const KITS_BASE_URL = "https://online.ktmb.com.my";

// Public GTFS feeds published by Malaysia's Open Data Portal (data.gov.my).
// Hardcoded here because they are the canonical KTMB feed locations; bins,
// scripts, and the Deno Deploy entry all import these instead of duplicating
// the literal URLs.
export const DATA_GOV_MY_GTFS_STATIC_URL = "https://api.data.gov.my/gtfs-static/ktmb";
export const DATA_GOV_MY_GTFS_REALTIME_URL =
  "https://api.data.gov.my/gtfs-realtime/vehicle-position/ktmb";
