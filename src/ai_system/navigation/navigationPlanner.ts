/**
 * Ɔkwankyerɛfo Pa - Navigation Planner
 * Evaluates route feasibility and produces navigation actions.
 */

import { NavigationOutput, IntentName } from "../core/aiTypes";
import { NAVIGATION_GRAPH } from "./navigationGraph";
import { routeResolver } from "./routeResolver";

export class NavigationPlanner {
  public plan(
    intent: IntentName,
    utterance: string,
    currentStep: string = "welcome",
    breadcrumb: string[] = ["HOME"]
  ): NavigationOutput {
    // Map currentStep (e.g. "welcome", "provider", "recipient", "amount", "confirm") to node ID
    const stepToNode: Record<string, string> = {
      welcome: "HOME",
      service: "MOBILE_MONEY",
      provider: "NETWORK_SELECT",
      recipient: "RECIPIENT_INPUT",
      kyc: "RECIPIENT_KYC",
      amount: "AMOUNT_INPUT",
      confirm: "TRANSACTION_CONFIRM",
      zero_pin: "SECURE_AUTHENTICATION",
      receipt: "TRANSACTION_RESULT",
    };

    const currentNodeId = stepToNode[currentStep] || "HOME";
    const targetNodeId = routeResolver.resolve(intent, utterance, currentNodeId);
    const targetNode = NAVIGATION_GRAPH[targetNodeId];

    const updatedBreadcrumb = [...breadcrumb];
    if (targetNodeId !== currentNodeId) {
      if (intent === "GO_BACK" && updatedBreadcrumb.length > 1) {
        updatedBreadcrumb.pop();
      } else {
        updatedBreadcrumb.push(targetNodeId);
      }
    }

    return {
      action: `NAVIGATE_${targetNodeId}`,
      targetScreen: targetNode?.screen || "welcome",
      targetStep: targetNode?.screen || currentStep,
      breadcrumb: updatedBreadcrumb,
    };
  }
}

export const navigationPlanner = new NavigationPlanner();
