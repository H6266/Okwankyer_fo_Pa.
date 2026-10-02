/**
 * Ɔkwankyerɛfo Pa - MTN Mobile Money (MoMo) Module Entrypoint
 * 
 * Re-exports engine, configuration, types, and utility functions.
 */

export * from "./types";
export * from "./config";
export * from "./momoEngine";

import { momoEngine } from "./momoEngine";
export default momoEngine;
