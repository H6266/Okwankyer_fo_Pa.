/**
 * Preach Mode - Document Region Renderer & Text Extractor
 * Implements Sections 20, 22, 23, 24, 25, 47, 48 of Study Implementation Skill
 *
 * Exclusively renders and crops the selected DOCUMENT surface (never whole-window screenshot).
 * Extracts text within bounding box in reading order and collects nearby context.
 */

import { Rect2D, DocumentSelection, ScriptureReference } from './types';
import { scriptureDetector } from './scriptureDetector';

export interface TextItemWithBounds {
  text: string;
  bounds: Rect2D;
}

export class DocumentRegionRenderer {
  /**
   * Renders and crops a specific region from a PDF/Image canvas.
   * Produces a high-resolution base64 PNG containing ONLY document pixels.
   */
  public renderCanvasRegion(
    sourceCanvas: HTMLCanvasElement,
    selectionBounds: Rect2D,
    scaleFactor = 1.5
  ): string {
    const sx = Math.max(0, Math.floor(selectionBounds.x));
    const sy = Math.max(0, Math.floor(selectionBounds.y));
    const sWidth = Math.min(
      sourceCanvas.width - sx,
      Math.max(10, Math.ceil(selectionBounds.width))
    );
    const sHeight = Math.min(
      sourceCanvas.height - sy,
      Math.max(10, Math.ceil(selectionBounds.height))
    );

    const offscreen = document.createElement('canvas');
    offscreen.width = Math.max(1, Math.floor(sWidth * scaleFactor));
    offscreen.height = Math.max(1, Math.floor(sHeight * scaleFactor));

    const ctx = offscreen.getContext('2d');
    if (!ctx) return '';

    // Smooth image rendering
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Fill clean white background first
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, offscreen.width, offscreen.height);

    // Draw exclusively the document canvas crop
    ctx.drawImage(
      sourceCanvas,
      sx,
      sy,
      sWidth,
      sHeight,
      0,
      0,
      offscreen.width,
      offscreen.height
    );

    return offscreen.toDataURL('image/png', 0.92);
  }

  /**
   * Renders and crops a region of a DOM container (e.g. for TXT / DOCX view).
   * Renders the targeted text excerpt into a styled document bitmap snippet.
   */
  public renderTextRegionBitmap(
    extractedText: string,
    documentTitle: string,
    width = 600,
    height = 200
  ): string {
    const offscreen = document.createElement('canvas');
    offscreen.width = width;
    offscreen.height = height;

    const ctx = offscreen.getContext('2d');
    if (!ctx) return '';

    // Professional paper background
    ctx.fillStyle = '#faf8f5';
    ctx.fillRect(0, 0, width, height);

    // Subtle document border
    ctx.strokeStyle = '#e2d9cc';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, width, height);

    // Document header pill
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 12px serif, Georgia, system-ui';
    ctx.fillText(`DOCUMENT: ${documentTitle.slice(0, 45)}`, 18, 26);

    ctx.strokeStyle = '#cbd5e1';
    ctx.beginPath();
    ctx.moveTo(18, 34);
    ctx.lineTo(width - 18, 34);
    ctx.stroke();

    // Body excerpt text
    ctx.fillStyle = '#0f172a';
    ctx.font = '14px serif, Georgia, system-ui';

    const words = (extractedText || 'Document selection').split(/\s+/);
    let line = '';
    let y = 58;
    const lineHeight = 22;
    const maxWidth = width - 36;

    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' ';
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && n > 0) {
        ctx.fillText(line, 18, y);
        line = words[n] + ' ';
        y += lineHeight;
        if (y > height - 20) {
          ctx.fillText('...', 18, y);
          break;
        }
      } else {
        line = testLine;
      }
    }
    if (y <= height - 20) {
      ctx.fillText(line, 18, y);
    }

    return offscreen.toDataURL('image/png', 0.9);
  }

  /**
   * Section 48, 49: Extracts text items whose bounding boxes intersect selection bounds.
   * Preserves natural reading order (top-to-bottom, left-to-right).
   */
  public extractTextInBounds(
    items: TextItemWithBounds[],
    selectionBounds: Rect2D
  ): string {
    const intersecting = items.filter((item) => {
      const b = item.bounds;
      return (
        b.x < selectionBounds.x + selectionBounds.width &&
        b.x + b.width > selectionBounds.x &&
        b.y < selectionBounds.y + selectionBounds.height &&
        b.y + b.height > selectionBounds.y
      );
    });

    // Sort by reading order: primarily vertical (Y), secondarily horizontal (X)
    intersecting.sort((a, b) => {
      const yTolerance = 6; // text on roughly same baseline
      if (Math.abs(a.bounds.y - b.bounds.y) > yTolerance) {
        return a.bounds.y - b.bounds.y;
      }
      return a.bounds.x - b.bounds.x;
    });

    return intersecting.map((i) => i.text).join(' ').trim();
  }

  /**
   * Assembles a complete DocumentSelection package ready for AI ingestion.
   */
  public createDocumentSelection(params: {
    bounds: Rect2D;
    sourceCanvas?: HTMLCanvasElement | null;
    fullText?: string;
    textItems?: TextItemWithBounds[];
    documentTitle?: string;
    pageIndex?: number;
  }): DocumentSelection {
    const id = `sel_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    let extractedText = '';
    let image = '';

    // Extract text via geometry if text items are provided
    if (params.textItems && params.textItems.length > 0) {
      extractedText = this.extractTextInBounds(params.textItems, params.bounds);
    }

    // Render cropped image
    if (params.sourceCanvas) {
      image = this.renderCanvasRegion(params.sourceCanvas, params.bounds);
    } else if (extractedText || params.fullText) {
      image = this.renderTextRegionBitmap(
        extractedText || params.fullText?.slice(0, 200) || '',
        params.documentTitle || 'Preach Document'
      );
    }

    // Nearby text context
    let nearbyText = '';
    if (params.fullText && extractedText) {
      const idx = params.fullText.indexOf(extractedText.slice(0, 40));
      if (idx !== -1) {
        const start = Math.max(0, idx - 200);
        const end = Math.min(params.fullText.length, idx + extractedText.length + 200);
        nearbyText = params.fullText.substring(start, end);
      }
    }

    // Run Scripture Detection on the extracted text & nearby context
    const detectedRefs: ScriptureReference[] = extractedText
      ? scriptureDetector.detect(extractedText)
      : [];

    return {
      id,
      bounds: params.bounds,
      image,
      extractedText: extractedText || undefined,
      nearbyText: nearbyText || undefined,
      scriptureReferences: detectedRefs.length > 0 ? detectedRefs : undefined,
      pageIndex: params.pageIndex,
      createdAt: Date.now(),
    };
  }
}

export const documentRegionRenderer = new DocumentRegionRenderer();
