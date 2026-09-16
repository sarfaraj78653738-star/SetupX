/**
 * Shared constants for KV-backed storage.
 */

/** Default TTL for user records and watchlists (30 days). */
export const AUTH_KV_TTL = 30 * 24 * 60 * 60; // seconds

/** Scan result cache TTL (15 seconds). */
export const SCAN_CACHE_TTL_MS = 15 * 1000;

/** Instrument cache TTL (24 hours). */
export const INSTRUMENT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
