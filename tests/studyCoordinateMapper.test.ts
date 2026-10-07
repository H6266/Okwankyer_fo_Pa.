import { describe, it, expect } from 'vitest';
import { DocumentCoordinateMapper, PageLayoutInfo } from '../src/modules/study/coordinateMapper';
import { Point2D, Rect2D } from '../src/modules/study/types';

describe('Preach Mode: Coordinate Mapping & Zoom Transformations (Section 59)', () => {
  it('correctly maps coordinates at zoom 1.0 with zero offset', () => {
    const mapper = new DocumentCoordinateMapper(1.0, { x: 0, y: 0 }, { x: 0, y: 0 });
    const viewPoint: Point2D = { x: 150, y: 300 };

    const docPoint = mapper.viewToDocument(viewPoint);
    expect(docPoint.x).toBe(150);
    expect(docPoint.y).toBe(300);

    const roundTrip = mapper.documentToView(docPoint);
    expect(roundTrip.x).toBe(150);
    expect(roundTrip.y).toBe(300);
  });

  it('correctly maps coordinates at zoom 1.5, 2.0, and 3.0', () => {
    const zoomLevels = [1.5, 2.0, 3.0];
    const initialView: Point2D = { x: 240, y: 480 };

    for (const zoom of zoomLevels) {
      const mapper = new DocumentCoordinateMapper(zoom);
      const doc = mapper.viewToDocument(initialView);

      // doc coords should equal view / zoom
      expect(doc.x).toBeCloseTo(initialView.x / zoom, 4);
      expect(doc.y).toBeCloseTo(initialView.y / zoom, 4);

      // Round-trip must return initial view point exactly
      const viewBack = mapper.documentToView(doc);
      expect(viewBack.x).toBeCloseTo(initialView.x, 4);
      expect(viewBack.y).toBeCloseTo(initialView.y, 4);
    }
  });

  it('handles scroll offset and container toolbar offsets', () => {
    const scrollOffset: Point2D = { x: 50, y: 200 };
    const containerOffset: Point2D = { x: 20, y: 64 }; // e.g. 64px header
    const zoom = 1.5;

    const mapper = new DocumentCoordinateMapper(zoom, scrollOffset, containerOffset);
    const screenTouch: Point2D = { x: 300, y: 450 };

    const docPoint = mapper.viewToDocument(screenTouch);
    // formula: (300 - 20 + 50) / 1.5 = 330 / 1.5 = 220
    // formula: (450 - 64 + 200) / 1.5 = 586 / 1.5 = 390.666...
    expect(docPoint.x).toBeCloseTo(220, 4);
    expect(docPoint.y).toBeCloseTo(586 / 1.5, 4);

    const backToScreen = mapper.documentToView(docPoint);
    expect(backToScreen.x).toBeCloseTo(screenTouch.x, 4);
    expect(backToScreen.y).toBeCloseTo(screenTouch.y, 4);
  });

  it('transforms bounding rectangles preserving dimensional scale', () => {
    const zoom = 2.0;
    const mapper = new DocumentCoordinateMapper(zoom);
    const viewRect: Rect2D = { x: 100, y: 200, width: 300, height: 150 };

    const docRect = mapper.viewRectToDocument(viewRect);
    expect(docRect.x).toBe(50);
    expect(docRect.y).toBe(100);
    expect(docRect.width).toBe(150);
    expect(docRect.height).toBe(75);

    const viewBack = mapper.documentRectToView(docRect);
    expect(viewBack.x).toBe(100);
    expect(viewBack.y).toBe(200);
    expect(viewBack.width).toBe(300);
    expect(viewBack.height).toBe(150);
  });

  it('maps document coordinates to PDF page boundaries and local page points', () => {
    const pages: PageLayoutInfo[] = [
      { pageIndex: 0, offsetLeft: 0, offsetTop: 0, width: 600, height: 800 },
      { pageIndex: 1, offsetLeft: 0, offsetTop: 850, width: 600, height: 800 }, // 50px margin
    ];

    const mapper = new DocumentCoordinateMapper(1.0);

    // Point in Page 1
    const p1 = mapper.documentToPdfPage({ x: 250, y: 400 }, pages);
    expect(p1).not.toBeNull();
    expect(p1!.pageIndex).toBe(0);
    expect(p1!.localPoint.x).toBe(250);
    expect(p1!.localPoint.y).toBe(400);

    // Point in Page 2
    const p2 = mapper.documentToPdfPage({ x: 150, y: 1000 }, pages);
    expect(p2).not.toBeNull();
    expect(p2!.pageIndex).toBe(1);
    expect(p2!.localPoint.x).toBe(150);
    expect(p2!.localPoint.y).toBe(150); // 1000 - 850 = 150
  });
});
