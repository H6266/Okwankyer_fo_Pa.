/**
 * Ɔkwankyerɛfo Pa - Live Speech & Discussion Intelligence Monitor
 * 
 * Displays:
 * - Real-time continuous speech transcription stream
 * - Long conversation & discussion entity extraction (Amount, Recipient, Provider, Purpose)
 * - Ghanaian dialect & code-switching detection
 * - Fast-track transaction shortcuts extracted from extended user discussions
 */

import React from "react";
import { MessageSquare, ArrowRight, UserCheck, CreditCard, Network, CheckCircle2 } from "lucide-react";
import { ParsedDiscussionState } from "../../ai_system/brain/longDiscussionParser";

interface LiveDiscussionMonitorProps {
  interimTranscript: string;
  finalizedTranscript: string;
  parsedDiscussion: ParsedDiscussionState | null;
  onApplyShortcut?: (shortcutStep: string, slots: ParsedDiscussionState["slots"]) => void;
}

export const LiveDiscussionMonitor: React.FC<LiveDiscussionMonitorProps> = ({
  interimTranscript,
  finalizedTranscript,
  parsedDiscussion,
  onApplyShortcut,
}) => {
  const hasText = Boolean(interimTranscript || finalizedTranscript);

  return (
    <div className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 shadow-md text-slate-100 font-sans space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-bold text-slate-200 uppercase tracking-wide">
            Live Speech &amp; Discussion Stream
          </span>
        </div>
        {parsedDiscussion && (
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-600/40 text-emerald-300">
            Dialect: {parsedDiscussion.detectedDialect.toUpperCase()}
          </span>
        )}
      </div>

      {/* Real-time Transcription Stream */}
      <div className="min-h-[52px] bg-slate-900/80 rounded-xl p-3 border border-slate-800/80 text-xs font-mono">
        {!hasText ? (
          <div className="text-slate-500 italic flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Mic active &amp; listening. Speak in English, Twi, or code-switched phrases anytime...
          </div>
        ) : (
          <div className="space-y-1">
            {finalizedTranscript && (
              <span className="text-slate-100 font-medium">{finalizedTranscript} </span>
            )}
            {interimTranscript && (
              <span className="text-emerald-400 italic bg-emerald-950/40 px-1 rounded animate-pulse">
                {interimTranscript}...
              </span>
            )}
          </div>
        )}
      </div>

      {/* Discussion Intelligence & Extracted Slots Card */}
      {parsedDiscussion && (parsedDiscussion.slots.amount || parsedDiscussion.slots.recipientPhone || parsedDiscussion.slots.recipientName) && (
        <div className="p-3 bg-slate-900/90 border border-emerald-500/40 rounded-xl space-y-2 animate-in fade-in duration-300">
          <div className="flex items-center justify-between text-xs font-bold text-emerald-300">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              Discussion Extracted Entities
            </span>
            {parsedDiscussion.isLongDiscussion && (
              <span className="text-[10px] bg-emerald-900/60 text-emerald-200 px-2 py-0.5 rounded-full border border-emerald-500/30">
                Extended Discussion Parsed
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] font-mono">
            {parsedDiscussion.slots.amount && (
              <div className="p-2 rounded bg-slate-950/80 border border-slate-800">
                <div className="text-slate-400 text-[10px] flex items-center gap-1">
                  <CreditCard className="w-3 h-3 text-emerald-400" />
                  Amount
                </div>
                <div className="text-emerald-300 font-bold">{parsedDiscussion.slots.amount} GHS</div>
              </div>
            )}

            {(parsedDiscussion.slots.recipientName || parsedDiscussion.slots.recipientPhone) && (
              <div className="p-2 rounded bg-slate-950/80 border border-slate-800">
                <div className="text-slate-400 text-[10px] flex items-center gap-1">
                  <UserCheck className="w-3 h-3 text-sky-400" />
                  Recipient
                </div>
                <div className="text-sky-300 font-bold truncate">
                  {parsedDiscussion.slots.recipientName || parsedDiscussion.slots.recipientPhone}
                </div>
              </div>
            )}

            {parsedDiscussion.slots.provider && (
              <div className="p-2 rounded bg-slate-950/80 border border-slate-800">
                <div className="text-slate-400 text-[10px] flex items-center gap-1">
                  <Network className="w-3 h-3 text-amber-400" />
                  Provider
                </div>
                <div className="text-amber-300 font-bold uppercase">{parsedDiscussion.slots.provider}</div>
              </div>
            )}
          </div>

          {/* Shortcut Readback & Action */}
          {parsedDiscussion.shortcutSuggestedStep && onApplyShortcut && (
            <div className="flex items-center justify-between pt-1 border-t border-slate-800 text-xs">
              <span className="text-slate-300 text-[11px]">
                {parsedDiscussion.summaryForReadback || "Full transaction parameters detected in speech."}
              </span>
              <button
                type="button"
                onClick={() => onApplyShortcut(parsedDiscussion.shortcutSuggestedStep!, parsedDiscussion.slots)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shrink-0 transition-colors shadow"
              >
                <span>Proceed</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
