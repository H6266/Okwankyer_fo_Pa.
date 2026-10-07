/**
 * Preach Mode - Document Coordinate Mapping Engine
 * Implements Sections 18, 19, 21 of Study Implementation Skill
 *
 * Maps between Viewport (screen/overlay), Document space, and PDF Page coordinates.
 * Handles zoom, scroll offset, margins, and density scaling.
 */

import { Point2D, Rect2D } from './types';

export interface PageLayoutInfo {
  pageIndex: number;
  offsetTop: number;
  offsetLeft: number;
  width: number;
  height: number;
}

export class DocumentCoordinateMapper {
  private zoom: number;
  private scrollOffset: Point2D;
  private containerOffset: Point2D;

  constructor(
    zoom = 1.0,
    scrollOffset: Point2D = { x: 0, y: 0 },
    containerOffset: Point2D = { x: 0, y: 0 }
  ) {
    this.zoom = zoom > 0 ? zoom : 1.0;
    this.scrollOffset = scrollOffset;
    this.containerOffset = containerOffset;
  }

  public setZoom(zoom: number): void {
    this.zoom = zoom > 0 ? zoom : 1.0;
  }

  public getZoom(): number {
    return this.zoom;
  }

  public setScrollOffset(offset: Point2D): void {
    this.scrollOffset = { x: offset.x, y: offset.y };
  }

  public setContainerOffset(offset: Point2D): void {
    this.containerOffset = { x: offset.x, y: offset.y };
  }

  /**
   * Converts a view (screen/pointer) point to document-space coordinates.
   * documentCoord = (viewCoord - containerOffset + scrollOffset) / zoom
   */
  public viewToDocument(viewPoint: Point2D): Point2D {
    const rawX = viewPoint.x - this.containerOffset.x + this.scrollOffset.x;
    const rawY = viewPoint.y - this.containerOffset.y + this.scrollOffset.y;
    return {
      x: rawX / this.zoom,
      y: rawY / this.zoom,
      timestamp: viewPoint.timestamp,
    };
  }

  /**
   * Converts a document-space point to view (screen/pointer) coordinates.
   * viewCoord = (documentCoord * zoom) + containerOffset - scrollOffset
   */
  public documentToView(docPoint: Point2D): Point2D {
    return {
      x: docPoint.x * this.zoom + this.containerOffset.x - this.scrollOffset.x,
      y: docPoint.y * this.zoom + this.containerOffset.y - this.scrollOffset.y,
      timestamp: docPoint.timestamp,
    };
  }

  /**
   * Converts a view rectangle to document space.
   */
  public viewRectToDocument(viewRect: Rect2D): Rect2D {
    const topLeft = this.viewToDocument({ x: viewRect.x, y: viewRect.y });
    return {
      x: topLeft.x,
      y: topLeft.y,
      width: viewRect.width / this.zoom,
      height: viewRect.height / this.zoom,
    };
  }

  /**
   * Converts a document rectangle to view space.
   */
  public documentRectToView(docRect: Rect2D): Rect2D {
    const topLeft = this.documentToView({ x: docRect.x, y: docRect.y });
    return {
      x: topLeft.x,
      y: topLeft.y,
      width: docRect.width * this.zoom,
      height: docRect.height * this.zoom,
    };
  }

  /**
   * Identifies which page contains the given document coordinate
   * and computes page-relative coordinates.
   */
  public documentToPdfPage(
    docPoint: Point2D,
    pages: PageLayoutInfo[]
  ): { pageIndex: number; localPoint: Point2D } | null {
    if (!pages || pages.length === 0) return null;

    for (const page of pages) {
      const withinX =
        docPoint.x >= page.offsetLeft &&
        docPoint.x <= page.offsetLeft + page.width;
      const withinY =
        docPoint.y >= page.offsetTop &&
        docPoint.y <= page.offsetTop + page.height;

      if (withinX && withinY) {
        return {
          pageIndex: page.pageIndex,
          localPoint: {
            x: docPoint.x - page.offsetLeft,
            y: docPoint.y - page.offsetTop,
          },
        };
      }
    }

    // Default to first page if not strictly matching margins
    return {
      pageIndex: 0,
      localPoint: {
        x: Math.max(0, docPoint.x - (pages[0]?.offsetLeft || 0)),
        y: Math.max(0, docPoint.y - (pages[0]?.offsetTop || 0)),
      },
    };
  }

  /**
   * Maps document rectangle to a specific page's crop coordinates.
   */
  public documentRectToPdfPageRect(
    docRect: Rect2D,
    page: PageLayoutInfo,
    pdfBottomLeftOrigin = false
  ): Rect2D {
    const localX = Math.max(0, docRect.x - page.offsetLeft);
    const localY = Math.max(0, docRect.y - page.offsetTop);
    const width = Math.min(docRect.width, page.width - localX);
    const height = Math.min(docRect.height, page.height - localY);

    if (pdfBottomLeftOrigin) {
      // PDF standard coordinate system (origin at bottom left)
      const pdfY = page.height - (localY + height);
      return { x: localX, y: pdfY, width, height };
    }

    return { x: localX, y: localY, width, height };
  }
}
