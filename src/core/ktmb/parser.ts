// Legacy entrypoint replaced by parse-home.ts / parse-trip-listing.ts /
// parse-layout.ts. Re-exported for any external import that pinned to
// "./parser.js".
export { parseTripListing as parseAvailabilityResponse } from "./parse-trip-listing.js";
