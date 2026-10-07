import React, { useState } from 'react';
import {
  X,
  Copy,
  Check,
  RotateCw,
  Sparkles,
  Book,
  FileText,
  Languages,
  Layers,
  Compass,
  Send,
  Loader2,
  HelpCircle,
  ExternalLink,
} from 'lucide-react';
import { AiAction, AiResult, DocumentSelection } from '../../modules/study/types';

interface AiStudyDrawerProps {
  selection: DocumentSelection | null;
  result: AiResult | null;
  isLoading: boolean;
  onClose: () => void;
  onSelectAction: (action: AiAction, userQuestion?: string) => void;
}

const ACTION_BUTTONS: { action: AiAction; label: string; icon: React.FC<{ className?: string }> }[] = [
  { action: 'explain', label: 'Explain', icon: FileText },
  { action: 'dictionary', label: 'Dictionary', icon: Book },
  { action: 'lexicon', label: 'Lexicon (Gk/Heb)', icon: Sparkles },
  { action: 'cross_references', label: 'Cross-Refs', icon: Layers },
  { action: 'scripture_context', label: 'Context', icon: Compass },
  { action: 'summarize', label: 'Summarize', icon: FileText },
  { action: 'translate', label: 'Translate', icon: Languages },
  { action: 'ask_ai', label: 'Ask AI', icon: HelpCircle },
];

export const AiStudyDrawer: React.FC<AiStudyDrawerProps> = ({
  selection,
  result,
  isLoading,
  onClose,
  onSelectAction,
}) => {
  const [copied, setCopied] = useState(false);
  const [userQuestion, setUserQuestion] = useState('');

  const handleCopy = () => {
    if (!result?.content) return;
    navigator.clipboard.writeText(result.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleAskSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userQuestion.trim()) return;
    onSelectAction('ask_ai', userQuestion.trim());
    setUserQuestion('');
  };

  return (
    <aside
      className="fixed inset-y-0 right-0 z-40 w-full sm:w-[480px] lg:w-[520px] bg-white border-l border-slate-200 shadow-2xl flex flex-col transform transition-transform duration-200 ease-out"
      aria-label="Preach Mode Study Assistant"
    >
      {/* Drawer Header */}
      <div className="h-16 px-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-emerald-50/60 to-white">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-700 text-white flex items-center justify-center font-bold shadow-xs">
            <Sparkles className="w-4 h-4 text-emerald-200" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <span>{result?.title || 'Preach Mode Study Assistant'}</span>
            </h2>
            <p className="text-[11px] text-slate-500 font-medium">
              Multimodal Theological &amp; Exegetical Intelligence
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {result?.content && (
            <button
              onClick={handleCopy}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors"
              title="Copy analysis to clipboard"
              aria-label="Copy analysis to clipboard"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors"
            title="Close Study Panel"
            aria-label="Close Study Panel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Selected Excerpt Banner */}
      {selection && (
        <div className="px-5 py-3 bg-slate-50/90 border-b border-slate-200/60 text-xs">
          <div className="flex items-start gap-3">
            {selection.image && (
              <div className="w-16 h-12 rounded border border-slate-300 overflow-hidden shrink-0 bg-white shadow-2xs">
                <img
                  src={selection.image}
                  alt="Selected document crop"
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                Selected Excerpt
              </span>
              <p className="text-slate-700 font-serif italic truncate text-xs">
                "{selection.extractedText || 'Document region selected via pen gesture'}"
              </p>
              {selection.scriptureReferences && selection.scriptureReferences.length > 0 && (
                <div className="flex items-center gap-1 mt-1">
                  <span className="text-[10px] font-semibold text-amber-800 bg-amber-100 px-1.5 py-0.2 rounded">
                    ✝ {selection.scriptureReferences.map((r) => r.rawText).join(', ')}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Action Switcher Tabs */}
      <div className="px-3 py-2 border-b border-slate-100 bg-white overflow-x-auto flex items-center gap-1 scrollbar-none">
        {ACTION_BUTTONS.map((item) => {
          const Icon = item.icon;
          const isActive = result?.action === item.action;
          return (
            <button
              key={item.action}
              onClick={() => onSelectAction(item.action)}
              disabled={isLoading}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-emerald-700 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              } disabled:opacity-50`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Main Analysis Body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {isLoading ? (
          <div className="h-64 flex flex-col items-center justify-center text-center p-6 space-y-3">
            <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
            <div className="font-bold text-slate-800 text-sm">
              Analyzing Document &amp; Scripture...
            </div>
            <p className="text-xs text-slate-500 max-w-xs leading-relaxed">
              Synthesizing biblical linguistics, historical context, and expository commentary via Gemini API.
            </p>
          </div>
        ) : result ? (
          <div className="space-y-4">
            {/* Key Term Banner if Lexicon */}
            {result.originalTerm && (
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200/70 text-xs">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 block mb-0.5">
                  Original Language Term
                </span>
                <span className="text-base font-serif font-bold text-slate-900">
                  {result.originalTerm}
                </span>
              </div>
            )}

            {/* Key Points Summary Pills */}
            {result.keyPoints && result.keyPoints.length > 0 && (
              <div className="p-3 bg-emerald-50/70 rounded-xl border border-emerald-100 space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 block">
                  Expository Highlights
                </span>
                <ul className="text-xs text-slate-700 space-y-1">
                  {result.keyPoints.map((point, idx) => (
                    <li key={idx} className="flex items-start gap-1.5">
                      <span className="text-emerald-600 font-bold">•</span>
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Markdown / Formatted Text Content */}
            <div className="prose prose-slate prose-sm max-w-none text-slate-800 text-xs sm:text-sm leading-relaxed space-y-3">
              {result.content.split('\n\n').map((paragraph, i) => {
                if (paragraph.startsWith('### ')) {
                  return (
                    <h3 key={i} className="text-sm font-bold text-slate-900 mt-4 mb-1">
                      {paragraph.replace('### ', '')}
                    </h3>
                  );
                } else if (paragraph.startsWith('## ')) {
                  return (
                    <h2 key={i} className="text-base font-bold text-slate-900 mt-4 mb-2">
                      {paragraph.replace('## ', '')}
                    </h2>
                  );
                } else if (paragraph.startsWith('> ')) {
                  return (
                    <blockquote
                      key={i}
                      className="border-l-3 border-amber-500 pl-3 italic text-slate-700 bg-amber-50/40 py-1 rounded-r my-2"
                    >
                      {paragraph.replace('> ', '')}
                    </blockquote>
                  );
                } else {
                  return (
                    <p key={i} className="text-slate-700">
                      {paragraph}
                    </p>
                  );
                }
              })}
            </div>

            {/* Related Verses Tags */}
            {result.relatedVerses && result.relatedVerses.length > 0 && (
              <div className="pt-2 border-t border-slate-100">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
                  Connected Scripture References
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {result.relatedVerses.map((v) => (
                    <span
                      key={v}
                      className="text-xs px-2.5 py-1 rounded bg-slate-100 border border-slate-200 text-slate-700 font-medium"
                    >
                      ✝ {v}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="h-64 flex flex-col items-center justify-center text-center p-6 text-slate-400">
            <Sparkles className="w-8 h-8 mb-2 text-slate-300" />
            <p className="text-xs font-medium">
              Circle any text or diagram on the document with the pen, or select a study action above.
            </p>
          </div>
        )}
      </div>

      {/* Follow-up Question Input */}
      <div className="p-3 bg-slate-50 border-t border-slate-200">
        <form onSubmit={handleAskSubmit} className="flex items-center gap-2">
          <input
            type="text"
            value={userQuestion}
            onChange={(e) => setUserQuestion(e.target.value)}
            placeholder="Ask a follow-up study question..."
            disabled={isLoading}
            className="flex-1 px-3 py-2 text-xs rounded-xl bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800 placeholder-slate-400"
          />
          <button
            type="submit"
            disabled={isLoading || !userQuestion.trim()}
            className="p-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white disabled:opacity-50 transition-colors shadow-2xs"
            aria-label="Send question"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>
    </aside>
  );
};
