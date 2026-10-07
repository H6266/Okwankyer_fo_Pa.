/**
 * Preach Mode - Intelligent Document Study Layer
 * Core Type Definitions
 */

export interface Point2D {
  x: number;
  y: number;
  timestamp?: number;
}

export interface Rect2D {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PenStroke {
  id: string;
  points: Point2D[];
  color: string;
  width: number;
  timestamp: number;
  isClosedLoop?: boolean;
}

export interface CircleDetectionResult {
  isCircle: boolean;
  confidence: number;
  bounds: Rect2D | null;
  details?: {
    pointCount: number;
    closureRatio: number;
    radialCv: number;
    aspectRatio: number;
    width: number;
    height: number;
  };
}

export type DocumentType = 'pdf' | 'docx' | 'txt';

export interface ScriptureReference {
  id: string;
  book: string;
  bookCode: string;
  chapter: number;
  verseStart: number;
  verseEnd?: number;
  rawText: string;
  startIndex: number;
  endIndex: number;
  testament: 'OT' | 'NT';
}

export interface DocumentSelection {
  id: string;
  bounds: Rect2D;
  image?: string; // base64 data URL of cropped document region
  extractedText?: string;
  nearbyText?: string;
  scriptureReferences?: ScriptureReference[];
  pageIndex?: number;
  createdAt: number;
}

export type AiAction =
  | 'dictionary'
  | 'explain'
  | 'lexicon'
  | 'cross_references'
  | 'scripture_context'
  | 'summarize'
  | 'translate'
  | 'ask_ai';

export interface AiResult {
  action: AiAction;
  title: string;
  content: string;
  keyPoints?: string[];
  relatedVerses?: string[];
  originalTerm?: string;
  language?: string;
  confidence?: number;
  error?: string;
}

export interface DocumentPage {
  pageNumber: number;
  text: string;
  width?: number;
  height?: number;
  textItems?: {
    text: string;
    bounds: Rect2D;
  }[];
}

export interface LoadedDocument {
  id: string;
  title: string;
  type: DocumentType;
  totalPages: number;
  fullText: string;
  pages: DocumentPage[];
  rawArrayBuffer?: ArrayBuffer;
}

export type InteractionMode = 'read' | 'pen' | 'circle_select';

export interface PenSettings {
  color: string;
  width: number;
  opacity: number;
}
