/**
 * MTN MoMo API Standalone Package & Bridge
 * 
 * Provides direct access to the MTN Mobile Money API engine
 * for external systems, microservices, and client applications.
 */

export * from "../src/integrations/momo/types";
export * from "../src/integrations/momo/config";
export * from "../src/integrations/momo/momoEngine";

import { momoEngine } from "../src/integrations/momo/momoEngine";
export default momoEngine;
