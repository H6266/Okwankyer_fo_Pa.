/**
 * Ɔkwankyerɛfo Pa - MTN Mobile Money (MoMo) Compatibility Facade
 * 
 * ARCHITECTURAL SEAM:
 * This facade preserves backwards compatibility for existing imports
 * while delegating all core engine logic, token caching, API calls,
 * and resilient emulation to `src/integrations/momo/`.
 */

import { momoEngine, MoMoEngine } from "../integrations/momo";

export * from "../integrations/momo";
export const mtnMomoService = momoEngine;
export default mtnMomoService;
