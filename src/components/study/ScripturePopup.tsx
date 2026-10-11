import React from 'react';
import { X, BookOpen, ExternalLink, Sparkles, Compass, Share2 } from 'lucide-react';
import { ScriptureReference } from '../../modules/study/types';
import { getBiblePassage, BiblePassage } from '../../modules/study/bibleDatabase';

interface ScripturePopupProps {
  reference: ScriptureReference;
  onClose: () => void;
  onStudyAction?: (action: 'explain' | 'lexicon' | 'cross_references' | 'scripture_context') => void;
}

export const ScripturePopup: React.FC<ScripturePopupProps> = ({
  reference,
  onClose,
  onStudyAction,
}) => {
  const passage: BiblePassage = getBiblePassage(reference);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="bg-white rounded-2xl border border-amber-200/80 max-w-lg w-full shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="scripture-dialog-title"
      >
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-amber-500/10 via-amber-50 to-orange-50/50 border-b border-amber-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-amber-600 text-white flex items-center justify-center font-serif font-bold text-sm shadow-xs">
              ✝
            </span>
            <div>
              <h3 id="scripture-dialog-title" className="text-base font-bold text-slate-900 tracking-tight font-serif">
                {passage.reference}
              </h3>
              <p className="text-[11px] text-amber-900/70 font-medium">
                {passage.translation} • {reference.testament === 'NT' ? 'New Testament' : 'Old Testament'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            aria-label="Close Scripture popup"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body content */}
        <div className="p-5 overflow-y-auto space-y-4">
          {/* Main Scripture Text */}
          <div className="p-4 rounded-xl bg-amber-50/50 border border-amber-200/60 shadow-2xs">
            <p className="font-serif text-slate-800 text-sm sm:text-base leading-relaxed italic">
              "{passage.text}"
            </p>
          </div>

          {/* Theme & Historical Context */}
          {passage.theme && (
            <div className="text-xs text-slate-600 flex items-center gap-2 font-medium">
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-amber-100 text-amber-800">
                Central Theme
              </span>
              <span>{passage.theme}</span>
            </div>
          )}

          {passage.historicalContext && (
            <div className="text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-200/80 leading-relaxed">
              <span className="font-bold text-slate-800 block mb-1">Historical & Expository Background:</span>
              {passage.historicalContext}
            </div>
          )}

          {/* Cross References */}
          {passage.crossReferences && passage.crossReferences.length > 0 && (
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">
                Canonical Cross-References
              </span>
              <div className="flex flex-wrap gap-1.5">
                {passage.crossReferences.map((cr) => (
                  <span
                    key={cr}
                    className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md bg-white border border-slate-200 text-slate-700 font-medium shadow-2xs"
                  >
                    <BookOpen className="w-3 h-3 text-amber-600" />
                    {cr}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-3 bg-slate-50 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {onStudyAction && (
              <>
                <button
                  onClick={() => {
                    onStudyAction('scripture_context');
                    onClose();
                  }}
                  className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 font-semibold transition-colors"
                >
                  <Compass className="w-3.5 h-3.5 text-amber-700" />
                  Passage Context
                </button>
                <button
                  onClick={() => {
                    onStudyAction('lexicon');
                    onClose();
                  }}
                  className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-semibold transition-colors shadow-2xs"
                >
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                  Lexicon
                </button>
              </>
            )}
          </div>

          <button
            onClick={onClose}
            className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-900 text-white font-semibold transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
