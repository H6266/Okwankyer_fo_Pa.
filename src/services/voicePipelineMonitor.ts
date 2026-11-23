export type VoicePipelineEvent =
  | "asr_success"
  | "asr_empty"
  | "asr_timeout"
  | "callback_failure"
  | "intent_failure"
  | "session_expired"
  | "response_delivery_failure"
  | "unexpected_call_termination"
  | "conversation_completed";

export interface VoicePipelineMetrics {
  totalEvents: number;
  byEvent: Record<VoicePipelineEvent, number>;
  emptyTranscriptionRate: number;
  timeoutRate: number;
  intentFailureRate: number;
  responseDeliveryFailureRate: number;
  completionRate: number;
}

class VoicePipelineMonitor {
  private readonly counts: Record<VoicePipelineEvent, number> = {
    asr_success: 0,
    asr_empty: 0,
    asr_timeout: 0,
    callback_failure: 0,
    intent_failure: 0,
    session_expired: 0,
    response_delivery_failure: 0,
    unexpected_call_termination: 0,
    conversation_completed: 0,
  };

  public record(event: VoicePipelineEvent): void {
    this.counts[event] += 1;
  }

  public reset(): void {
    for (const event of Object.keys(this.counts) as VoicePipelineEvent[]) {
      this.counts[event] = 0;
    }
  }

  public getMetrics(): VoicePipelineMetrics {
    const totalEvents = Object.values(this.counts).reduce((sum, value) => sum + value, 0);
    const asrEvents = this.counts.asr_success + this.counts.asr_empty + this.counts.asr_timeout;
    const intentEvents = this.counts.asr_success + this.counts.asr_empty + this.counts.intent_failure;
    const responseEvents = this.counts.asr_success + this.counts.response_delivery_failure;
    const callEvents = this.counts.conversation_completed + this.counts.unexpected_call_termination;

    const rate = (numerator: number, denominator: number) =>
      denominator > 0 ? Number((numerator / denominator).toFixed(4)) : 0;

    return {
      totalEvents,
      byEvent: { ...this.counts },
      emptyTranscriptionRate: rate(this.counts.asr_empty, asrEvents),
      timeoutRate: rate(this.counts.asr_timeout, asrEvents),
      intentFailureRate: rate(this.counts.intent_failure, intentEvents),
      responseDeliveryFailureRate: rate(this.counts.response_delivery_failure, responseEvents),
      completionRate: rate(this.counts.conversation_completed, callEvents),
    };
  }
}

export const voicePipelineMonitor = new VoicePipelineMonitor();
