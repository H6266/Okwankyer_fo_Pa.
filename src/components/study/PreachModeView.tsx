import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  BookOpen,
  PenTool,
  MousePointer,
  Sparkles,
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  Upload,
  Maximize2,
  Minimize2,
  RotateCcw,
  RotateCw,
  Trash2,
  FileText,
  Search,
  Book,
  Languages,
  Layers,
  Compass,
  Check,
  HelpCircle,
  X,
} from 'lucide-react';
import {
  LoadedDocument,
  DocumentSelection,
  InteractionMode,
  PenSettings,
  AiAction,
  AiResult,
  ScriptureReference,
  Rect2D,
} from '../../modules/study/types';
import {
  SAMPLE_STUDY_DOCUMENTS,
  documentParser,
} from '../../modules/study/documentParser';
import { scriptureDetector } from '../../modules/study/scriptureDetector';
import { documentRegionRenderer } from '../../modules/study/regionRenderer';
import { DrawingCanvasOverlay } from './DrawingCanvasOverlay';
import { ScripturePopup } from './ScripturePopup';
import { AiStudyDrawer } from './AiStudyDrawer';

const PEN_COLORS = [
  { name: 'Charcoal', hex: '#1e293b' },
  { name: 'Sapphire', hex: '#2563eb' },
  { name: 'Emerald', hex: '#059669' },
  { name: 'Crimson', hex: '#dc2626' },
  { name: 'Amber', hex: '#d97706' },
];

export const PreachModeView: React.FC = () => {
  // Document state
  const [currentDoc, setCurrentDoc] = useState<LoadedDocument>(SAMPLE_STUDY_DOCUMENTS[0]);
  const [currentPageIndex, setCurrentPageIndex] = useState<number>(0);
  const [zoom, setZoom] = useState<number>(1.0);
  const [isPulpitMode, setIsPulpitMode] = useState<boolean>(false);

  // Interaction & Pen state
  const [mode, setMode] = useState<InteractionMode>('circle_select');
  const [penSettings, setPenSettings] = useState<PenSettings>({
    color: '#2563eb',
    width: 3.5,
    opacity: 1.0,
  });

  // Selection & AI state
  const [activeSelection, setActiveSelection] = useState<DocumentSelection | null>(null);
  const [activeScriptureRef, setActiveScriptureRef] = useState<ScriptureReference | null>(null);
  const [showAiDrawer, setShowAiDrawer] = useState<boolean>(false);
  const [aiResult, setAiResult] = useState<AiResult | null>(null);
  const [isAiLoading, setIsAiLoading] = useState<boolean>(false);

  // Quick Scripture search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFeedback, setSearchFeedback] = useState<string | null>(null);

  // DOM refs
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const docContainerRef = useRef<HTMLDivElement | null>(null);
  const activePageRef = useRef<HTMLDivElement | null>(null);

  const currentPage = currentDoc.pages[currentPageIndex] || currentDoc.pages[0];

  // Scan current page for Scripture references (memoized to avoid rescanning on each render)
  const detectedReferences = useMemo(() => {
    if (!currentPage?.text) return [];
    return scriptureDetector.detect(currentPage.text);
  }, [currentPage?.text]);

  // Handle file upload (PDF, DOCX, TXT)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const parsed = await documentParser.parseFile(file);
      setCurrentDoc(parsed);
      setCurrentPageIndex(0);
      setActiveSelection(null);
      setAiResult(null);
    } catch (err: any) {
      alert('Failed to load document: ' + (err?.message || err));
    }
  };

  // Circle detection handler from overlay
  const handleCircleDetected = useCallback(
    (bounds: Rect2D) => {
      // Find intersecting text in current page container
      let extracted = '';
      if (activePageRef.current) {
        // Approximate text extraction by character position or selection
        const containerRect = activePageRef.current.getBoundingClientRect();
        const fullText = currentPage?.text || '';
        // If whole page or region is selected, extract words
        const words = fullText.split(/\s+/);
        const ratioStart = Math.max(0, Math.min(1, bounds.y / (containerRect.height || 600)));
        const ratioEnd = Math.max(0, Math.min(1, (bounds.y + bounds.height) / (containerRect.height || 600)));
        const startIdx = Math.floor(ratioStart * words.length);
        const endIdx = Math.min(words.length, Math.ceil(ratioEnd * words.length));
        extracted = words.slice(startIdx, endIdx).join(' ').trim();
      }

      if (!extracted && currentPage?.text) {
        extracted = currentPage.text.slice(0, 200);
      }

      // Create document selection package
      const selection = documentRegionRenderer.createDocumentSelection({
        bounds,
        fullText: currentPage?.text,
        documentTitle: currentDoc.title,
        pageIndex: currentPageIndex,
      });
      if (extracted) {
        selection.extractedText = extracted;
      }

      setActiveSelection(selection);
      setShowAiDrawer(true);

      // Trigger automatic initial contextual explanation
      executeStudyAction('explain', selection);
    },
    [currentPage?.text, currentDoc.title, currentPageIndex]
  );

  // Execute AI study action via server route
  const executeStudyAction = async (action: AiAction, selectionToUse?: DocumentSelection, userQuestion?: string) => {
    const targetSel = selectionToUse || activeSelection;
    if (!targetSel) return;

    setIsAiLoading(true);
    setShowAiDrawer(true);

    try {
      const res = await fetch('/api/study/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selection: targetSel,
          action,
          userQuestion,
        }),
      });

      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`);
      }

      const data: AiResult = await res.json();
      setAiResult(data);
    } catch (err: any) {
      console.warn('Study analysis request failed, falling back:', err);
      // Fallback result display
      setAiResult({
        action,
        title: `Expository Study: "${(targetSel.extractedText || 'Selected text').slice(0, 30)}"`,
        content: `### Expository Note (Offline Mode)
The selected excerpt connects theological doctrine directly with preaching and pastoral care.

> "${targetSel.extractedText || 'Document selection'}"

**Key Principle**: Divine justification and peace with God in Christ are permanent gifts. Expound this truth with pastoral clarity for the listener.`,
        keyPoints: [
          'Expository grounding in original text',
          'Pastoral application for teaching',
        ],
      });
    } finally {
      setIsAiLoading(false);
    }
  };

  // Keyboard shortcut listeners (Section 67)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;
      if (e.key === 'f' || e.key === 'F') {
        setIsPulpitMode((p) => !p);
      } else if (e.key === 'ArrowRight' && currentPageIndex < currentDoc.totalPages - 1) {
        setCurrentPageIndex((p) => p + 1);
      } else if (e.key === 'ArrowLeft' && currentPageIndex > 0) {
        setCurrentPageIndex((p) => p - 1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPageIndex, currentDoc.totalPages]);

  // Handle quick Scripture search
  const handleQuickSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    const detected = scriptureDetector.detect(searchQuery.trim());
    if (detected.length > 0) {
      setActiveScriptureRef(detected[0]);
      setSearchFeedback(null);
      setSearchQuery('');
    } else {
      setSearchFeedback(`"${searchQuery}" not recognized as a valid canonical reference.`);
      setTimeout(() => setSearchFeedback(null), 3000);
    }
  };

  // Render text with interactive Scripture highlights
  const renderHighlightedText = (rawText: string) => {
    if (!detectedReferences || detectedReferences.length === 0) {
      return <span className="whitespace-pre-wrap">{rawText}</span>;
    }

    const segments: React.ReactNode[] = [];
    let lastIndex = 0;

    // Sort refs by start index
    const sorted = [...detectedReferences].sort((a, b) => a.startIndex - b.startIndex);

    sorted.forEach((ref, idx) => {
      // Un-highlighted text before ref
      if (ref.startIndex > lastIndex) {
        segments.push(
          <span key={`text_${lastIndex}`} className="whitespace-pre-wrap">
            {rawText.substring(lastIndex, ref.startIndex)}
          </span>
        );
      }

      // Interactive scripture highlight
      segments.push(
        <button
          key={`ref_${ref.id}_${idx}`}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setActiveScriptureRef(ref);
          }}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-100 hover:bg-amber-200 text-amber-950 font-semibold font-serif border border-amber-300/80 transition-all cursor-pointer shadow-2xs hover:scale-105"
          title={`Click to inspect ${ref.rawText} Scripture context`}
        >
          <span className="text-amber-700 text-[10px]">✝</span>
          <span className="underline decoration-amber-500/70 underline-offset-2">{ref.rawText}</span>
        </button>
      );

      lastIndex = ref.endIndex;
    });

    if (lastIndex < rawText.length) {
      segments.push(
        <span key={`tail_${lastIndex}`} className="whitespace-pre-wrap">
          {rawText.substring(lastIndex)}
        </span>
      );
    }

    return <>{segments}</>;
  };

  return (
    <div
      className={`flex flex-col h-[calc(100vh-4rem)] bg-slate-100 overflow-hidden font-sans ${
        isPulpitMode ? 'fixed inset-0 z-50 bg-slate-950 text-slate-100 h-screen' : ''
      }`}
    >
      {/* ── Hidden File Input ────────────────────────────────────────── */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.docx,.txt"
        onChange={handleFileUpload}
        className="hidden"
      />

      {/* ── Top Command Toolbar (Section 52: Pen Mode & Controls) ─────── */}
      <header
        className={`px-4 py-2.5 border-b flex flex-wrap items-center justify-between gap-3 shadow-xs transition-colors ${
          isPulpitMode
            ? 'bg-slate-900 border-slate-800 text-slate-100'
            : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        {/* Left: Document Picker & Upload */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-amber-500 text-white flex items-center justify-center font-bold text-sm shadow-xs">
              📖
            </span>
            <div className="hidden sm:block">
              <div className="font-extrabold text-xs tracking-tight flex items-center gap-1.5">
                <span>Preach Mode</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded font-mono font-bold bg-amber-100 text-amber-800 uppercase">
                  STUDY LAYER
                </span>
              </div>
              <div className="text-[10px] text-slate-500 truncate max-w-[180px]">
                {currentDoc.title}
              </div>
            </div>
          </div>

          {/* Document Dropdown */}
          <select
            value={currentDoc.id}
            onChange={(e) => {
              const selected = SAMPLE_STUDY_DOCUMENTS.find((d) => d.id === e.target.value);
              if (selected) {
                setCurrentDoc(selected);
                setCurrentPageIndex(0);
                setActiveSelection(null);
                setAiResult(null);
              }
            }}
            className={`text-xs px-2.5 py-1.5 rounded-lg border font-medium focus:outline-none focus:ring-1 focus:ring-amber-500 max-w-[190px] truncate ${
              isPulpitMode
                ? 'bg-slate-800 border-slate-700 text-slate-200'
                : 'bg-slate-50 border-slate-200 text-slate-800'
            }`}
          >
            {SAMPLE_STUDY_DOCUMENTS.map((doc) => (
              <option key={doc.id} value={doc.id}>
                {doc.type.toUpperCase()}: {doc.title}
              </option>
            ))}
          </select>

          {/* Upload Button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300/80 transition-colors shadow-2xs"
            title="Upload PDF, DOCX, or TXT"
          >
            <Upload className="w-3.5 h-3.5 text-slate-600" />
            <span className="hidden md:inline">Open File</span>
          </button>
        </div>

        {/* Center: Mode Switching (Read, Pen, AI Circle Selection) */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200/80">
          <button
            onClick={() => setMode('read')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              mode === 'read'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
            title="Reading Mode (Scroll & text selection)"
          >
            <MousePointer className="w-3.5 h-3.5" />
            <span>Read</span>
          </button>

          <button
            onClick={() => setMode('pen')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              mode === 'pen'
                ? 'bg-emerald-600 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
            title="Pen Mode (Freehand opaque drawing)"
          >
            <PenTool className="w-3.5 h-3.5" />
            <span>Pen</span>
          </button>

          <button
            onClick={() => setMode('circle_select')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              mode === 'circle_select'
                ? 'bg-blue-600 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
            title="AI Circle Selection (Draw circle to analyze)"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-200" />
            <span>AI Pen</span>
          </button>
        </div>

        {/* Pen Palette & Thickness (when in pen or circle mode) */}
        {mode !== 'read' && (
          <div className="hidden lg:flex items-center gap-2 pl-2 border-l border-slate-200">
            {/* Color Palette */}
            <div className="flex items-center gap-1">
              {PEN_COLORS.map((col) => (
                <button
                  key={col.hex}
                  onClick={() => setPenSettings((s) => ({ ...s, color: col.hex }))}
                  className={`w-5 h-5 rounded-full transition-transform ${
                    penSettings.color === col.hex ? 'scale-125 ring-2 ring-blue-500 ring-offset-1' : 'hover:scale-110'
                  }`}
                  style={{ backgroundColor: col.hex }}
                  title={col.name}
                />
              ))}
            </div>

            {/* Thickness selector */}
            <select
              value={penSettings.width}
              onChange={(e) => setPenSettings((s) => ({ ...s, width: parseFloat(e.target.value) }))}
              className="text-[11px] px-1.5 py-1 rounded bg-slate-100 border border-slate-200 font-semibold text-slate-700"
            >
              <option value="2">Thin (2px)</option>
              <option value="3.5">Medium (3.5px)</option>
              <option value="6">Bold (6px)</option>
              <option value="9">Broad (9px)</option>
            </select>

            {/* Undo / Clear triggers */}
            <button
              onClick={() => {
                const el = document.getElementById('preach-pen-controls');
                el?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                const fake = { target: { dataset: { action: 'undo' } } };
                (el as any)?.onclick?.(fake);
              }}
              className="p-1.5 text-slate-500 hover:text-slate-900 rounded hover:bg-slate-100"
              title="Undo stroke"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => {
                const el = document.getElementById('preach-pen-controls');
                const fake = { target: { dataset: { action: 'clear' } } };
                (el as any)?.onclick?.(fake);
                setActiveSelection(null);
              }}
              className="p-1.5 text-slate-500 hover:text-red-600 rounded hover:bg-red-50"
              title="Clear all strokes"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Right: Quick Scripture Search & Zoom / Pulpit Toggle */}
        <div className="flex items-center gap-2">
          {/* Quick Scripture Lookup */}
          <form onSubmit={handleQuickSearch} className="relative hidden xl:block">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Scripture (e.g. John 3:16)..."
              className="w-44 text-xs px-2.5 py-1.5 pl-7 rounded-lg bg-slate-50 border border-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-500 text-slate-800"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-2" />
          </form>

          {/* Zoom controls */}
          <div className="flex items-center gap-1 bg-slate-100 px-1 py-0.5 rounded-lg border border-slate-200">
            <button
              onClick={() => setZoom((z) => Math.max(0.6, Math.round((z - 0.15) * 100) / 100))}
              className="p-1 text-slate-500 hover:text-slate-800 rounded"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[11px] font-mono font-bold text-slate-700 min-w-[38px] text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => setZoom((z) => Math.min(2.5, Math.round((z + 0.15) * 100) / 100))}
              className="p-1 text-slate-500 hover:text-slate-800 rounded"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Pulpit Fullscreen Mode Toggle */}
          <button
            onClick={() => setIsPulpitMode(!isPulpitMode)}
            className={`p-1.5 rounded-lg border text-xs font-bold flex items-center gap-1 transition-colors ${
              isPulpitMode
                ? 'bg-amber-500 text-slate-950 border-amber-400'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
            }`}
            title="Toggle Distraction-Free Pulpit Mode (F)"
          >
            {isPulpitMode ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            <span className="hidden sm:inline">{isPulpitMode ? 'Exit' : 'Pulpit'}</span>
          </button>
        </div>
      </header>

      {/* Search feedback toast if invalid */}
      {searchFeedback && (
        <div className="bg-red-50 text-red-800 text-xs px-4 py-1.5 border-b border-red-200 text-center font-medium">
          {searchFeedback}
        </div>
      )}

      {/* ── Contextual Study Action Bar (Visible when region is selected) ─ */}
      {activeSelection && (
        <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white px-4 py-2 flex items-center justify-between text-xs z-30 shadow-md animate-in slide-in-from-top-2 duration-150">
          <div className="flex items-center gap-2 overflow-x-auto">
            <span className="font-bold text-blue-200 flex items-center gap-1 shrink-0">
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>Study Actions:</span>
            </span>

            <button
              onClick={() => executeStudyAction('explain')}
              className="px-2.5 py-1 rounded bg-blue-800 hover:bg-blue-700 text-white font-semibold transition-colors shrink-0"
            >
              Explain
            </button>
            <button
              onClick={() => executeStudyAction('dictionary')}
              className="px-2.5 py-1 rounded bg-blue-800 hover:bg-blue-700 text-white font-semibold transition-colors shrink-0"
            >
              Dictionary
            </button>
            <button
              onClick={() => executeStudyAction('lexicon')}
              className="px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition-colors shrink-0"
            >
              Lexicon (Gk/Heb)
            </button>
            <button
              onClick={() => executeStudyAction('cross_references')}
              className="px-2.5 py-1 rounded bg-blue-800 hover:bg-blue-700 text-white font-semibold transition-colors shrink-0"
            >
              Cross-Refs
            </button>
            <button
              onClick={() => executeStudyAction('scripture_context')}
              className="px-2.5 py-1 rounded bg-blue-800 hover:bg-blue-700 text-white font-semibold transition-colors shrink-0"
            >
              Context
            </button>
            <button
              onClick={() => executeStudyAction('summarize')}
              className="px-2.5 py-1 rounded bg-blue-800 hover:bg-blue-700 text-white font-semibold transition-colors shrink-0"
            >
              Summarize
            </button>
            <button
              onClick={() => executeStudyAction('translate')}
              className="px-2.5 py-1 rounded bg-blue-800 hover:bg-blue-700 text-white font-semibold transition-colors shrink-0"
            >
              Translate
            </button>
          </div>

          <button
            onClick={() => setActiveSelection(null)}
            className="p-1 text-slate-400 hover:text-white rounded ml-2"
            title="Deselect"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Document Workspace & Drawing Surface ─────────────────────── */}
      <div
        ref={docContainerRef}
        className="flex-1 overflow-auto relative p-4 sm:p-8 flex justify-center items-start bg-slate-200/60 dark:bg-slate-950"
      >
        {/* Document Page Canvas Wrapper (Section 6: UI Layering) */}
        <div
          ref={activePageRef}
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: 'top center',
            transition: 'transform 100ms ease-out',
          }}
          className={`relative max-w-4xl w-full min-h-[780px] rounded-2xl shadow-xl border overflow-hidden transition-all ${
            isPulpitMode
              ? 'bg-slate-900 border-slate-800 text-slate-100 p-8 sm:p-14 font-serif text-lg leading-loose'
              : 'bg-white border-slate-300/80 text-slate-900 p-8 sm:p-14 font-serif text-base sm:text-lg leading-relaxed shadow-slate-300/50'
          }`}
        >
          {/* Document Content View */}
          <div className="relative z-10 select-text">
            {/* Header Document Badge */}
            <div className="flex items-center justify-between pb-6 mb-8 border-b border-slate-200 dark:border-slate-800">
              <div>
                <span className="text-[11px] font-sans font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 block mb-1">
                  {currentDoc.type.toUpperCase()} • PAGE {currentPageIndex + 1} OF {currentDoc.totalPages}
                </span>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight font-serif text-slate-900 dark:text-white">
                  {currentDoc.title}
                </h1>
              </div>

              {detectedReferences.length > 0 && (
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-900/60 text-xs font-sans text-amber-800 dark:text-amber-300 font-semibold shadow-2xs">
                  <span>✝ {detectedReferences.length} Scriptures Detected</span>
                </div>
              )}
            </div>

            {/* Document Body Text with interactive scripture highlights */}
            <div className="space-y-6 text-slate-800 dark:text-slate-200 text-justify hyphens-auto">
              {currentPage?.text.split('\n\n').map((paragraph, pIdx) => (
                <p key={pIdx} className="leading-relaxed">
                  {renderHighlightedText(paragraph)}
                </p>
              ))}
            </div>
          </div>

          {/* ── Interactive Drawing & Gesture Recognition Layer (Section 6, 7, 13) ── */}
          <DrawingCanvasOverlay
            mode={mode}
            zoom={zoom}
            penSettings={penSettings}
            selectionBounds={activeSelection?.bounds || null}
            onCircleDetected={handleCircleDetected}
            onSelectionCleared={() => setActiveSelection(null)}
          />
        </div>
      </div>

      {/* ── Page Navigation Footer Bar ──────────────────────────────── */}
      <footer
        className={`px-4 py-2 border-t flex items-center justify-between text-xs z-30 transition-colors ${
          isPulpitMode
            ? 'bg-slate-900 border-slate-800 text-slate-300'
            : 'bg-white border-slate-200 text-slate-600'
        }`}
      >
        <div className="flex items-center gap-3">
          <span className="font-semibold">
            Page {currentPageIndex + 1} of {currentDoc.totalPages}
          </span>
          <span className="text-slate-300" aria-hidden="true">
            •
          </span>
          <span className="text-[11px] text-slate-400">
            Tip: Select "AI Pen", circle any scripture or phrase on document to trigger deep analysis.
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setCurrentPageIndex((p) => Math.max(0, p - 1))}
            disabled={currentPageIndex === 0}
            className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-100 transition-colors"
            title="Previous Page (Left Arrow)"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="font-mono px-2 font-bold text-slate-800 dark:text-slate-200">
            {currentPageIndex + 1} / {currentDoc.totalPages}
          </span>
          <button
            onClick={() => setCurrentPageIndex((p) => Math.min(currentDoc.totalPages - 1, p + 1))}
            disabled={currentPageIndex >= currentDoc.totalPages - 1}
            className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-100 transition-colors"
            title="Next Page (Right Arrow)"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </footer>

      {/* ── Scripture Popup Modal (Sections 29, 30, 31) ───────────────── */}
      {activeScriptureRef && (
        <ScripturePopup
          reference={activeScriptureRef}
          onClose={() => setActiveScriptureRef(null)}
          onStudyAction={(action) => {
            // Create a selection for this scripture reference and open AI drawer
            const selection = documentRegionRenderer.createDocumentSelection({
              bounds: { x: 50, y: 50, width: 300, height: 100 },
              fullText: activeScriptureRef.rawText,
              documentTitle: currentDoc.title,
            });
            selection.extractedText = activeScriptureRef.rawText;
            selection.scriptureReferences = [activeScriptureRef];
            setActiveSelection(selection);
            executeStudyAction(action, selection);
          }}
        />
      )}

      {/* ── AI Study Drawer (Sections 40, 41, 42) ────────────────────── */}
      {showAiDrawer && (
        <AiStudyDrawer
          selection={activeSelection}
          result={aiResult}
          isLoading={isAiLoading}
          onClose={() => setShowAiDrawer(false)}
          onSelectAction={(action, question) => executeStudyAction(action, activeSelection || undefined, question)}
        />
      )}
    </div>
  );
};
