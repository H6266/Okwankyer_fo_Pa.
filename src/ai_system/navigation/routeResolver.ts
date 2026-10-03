/**
 * Ɔkwankyerɛfo Pa - Route Resolver
 * Resolves conversational phrases like 'take me home', 'go back', 'check balance' to graph nodes.
 */

import { NAVIGATION_GRAPH } from "./navigationGraph";
import { IntentName } from "../core/aiTypes";

export class RouteResolver {
  public resolve(intent: IntentName, utterance: string, currentNodeId: string = "HOME"): string {
    const lower = utterance.toLowerCase();

    // Direct home command
    if (intent === "GO_HOME" || lower.includes("home") || lower.includes("start over") || lower.includes("fie")) {
      return "HOME";
    }

    // Direct back command
    if (intent === "GO_BACK" || lower.includes("back") || lower.includes("akyi")) {
      const current = NAVIGATION_GRAPH[currentNodeId];
      return current?.allowedBackTarget || current?.parent || "HOME";
    }

    // Direct intents
    switch (intent) {
      case "SEND_MONEY":
        return "SEND_MONEY";
      case "CHECK_BALANCE":
        return "CHECK_BALANCE";
      case "PAY_BILL":
        return "PAY_BILL";
      case "BUY_AIRTIME":
      case "BUY_DATA":
        return "BUY_AIRTIME";
      case "HELP":
        return "HELP";
      default:
        return currentNodeId;
    }
  }
}

export const routeResolver = new RouteResolver();
