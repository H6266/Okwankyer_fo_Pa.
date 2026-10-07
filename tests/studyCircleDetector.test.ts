import { describe, it, expect } from 'vitest';
import {
  detectCircle,
  calculateBounds,
  clampBoundsToViewport,
  distance,
} from '../src/modules/study/circleDetector';
import { Point2D } from '../src/modules/study/types';

describe('Preach Mode: Circle & Ellipse Gesture Recognition (Section 57)', () => {
  // Helper to generate a parametric ellipse / circle
  function generateEllipsePoints(
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    count = 36,
    noise = 0,
    closeGapAngle = 0 // radians left open at end
  ): Point2D[] {
    const points: Point2D[] = [];
    const maxTheta = Math.PI * 2 - closeGapAngle;
    for (let i = 0; i <= count; i++) {
      const theta = (i / count) * maxTheta;
      const rNoiseX = (Math.random() - 0.5) * noise;
      const rNoiseY = (Math.random() - 0.5) * noise;
      points.push({
        x: cx + (rx + rNoiseX) * Math.cos(theta),
        y: cy + (ry + rNoiseY) * Math.sin(theta),
        timestamp: i * 20,
      });
    }
    return points;
  }

  it('detects a perfect circle with high confidence', () => {
    const points = generateEllipsePoints(200, 200, 60, 60, 40, 0, 0);
    const result = detectCircle(points);

    expect(result.isCircle).toBe(true);
    expect(result.confidence).toBeGreaterThan(0.8);
    expect(result.bounds).not.toBeNull();
    expect(result.bounds!.width).toBeGreaterThanOrEqual(120);
    expect(result.bounds!.height).toBeGreaterThanOrEqual(120);
  });

  it('detects a rough hand-drawn circle with human wobble', () => {
    const points = generateEllipsePoints(200, 200, 70, 70, 30, 8, 0);
    const result = detectCircle(points);

    expect(result.isCircle).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(0.58);
    expect(result.bounds).not.toBeNull();
  });

  it('detects an ellipse with a 1.6:1 aspect ratio', () => {
    const points = generateEllipsePoints(250, 150, 80, 50, 36, 2, 0);
    const result = detectCircle(points);

    expect(result.isCircle).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(0.58);
  });

  it('detects a slightly open circle (human pen lift before touching start)', () => {
    // 25 degrees gap at closure
    const openGap = (25 * Math.PI) / 180;
    const points = generateEllipsePoints(180, 180, 55, 55, 30, 2, openGap);
    const result = detectCircle(points);

    expect(result.isCircle).toBe(true);
    expect(result.bounds).not.toBeNull();
  });

  it('rejects a tiny circle below min size threshold', () => {
    const points = generateEllipsePoints(100, 100, 8, 8, 20, 0, 0); // 16px wide
    const result = detectCircle(points, { minSize: 25 });

    expect(result.isCircle).toBe(false);
    expect(result.bounds).toBeNull();
  });

  it('accepts a huge circle covering a broad passage', () => {
    const points = generateEllipsePoints(500, 500, 300, 260, 60, 5, 0);
    const result = detectCircle(points);

    expect(result.isCircle).toBe(true);
    expect(result.bounds!.width).toBeGreaterThan(500);
  });

  it('rejects an underline (horizontal straight line)', () => {
    const points: Point2D[] = [];
    for (let x = 50; x <= 350; x += 10) {
      points.push({ x, y: 150 + (Math.random() - 0.5) * 2, timestamp: x });
    }
    const result = detectCircle(points);

    expect(result.isCircle).toBe(false);
  });

  it('rejects a back-and-forth scribble', () => {
    const points: Point2D[] = [];
    for (let i = 0; i < 40; i++) {
      points.push({
        x: 100 + (i % 2 === 0 ? 0 : 80),
        y: 100 + i * 2,
        timestamp: i * 15,
      });
    }
    const result = detectCircle(points);

    expect(result.isCircle).toBe(false);
  });

  it('rejects stroke with fewer than minimum points', () => {
    const points: Point2D[] = [
      { x: 10, y: 10 },
      { x: 20, y: 20 },
      { x: 30, y: 30 },
    ];
    const result = detectCircle(points);

    expect(result.isCircle).toBe(false);
    expect(result.confidence).toBe(0);
  });

  it('correctly calculates bounding box with padding and clamps to viewport', () => {
    const rawPoints: Point2D[] = [
      { x: 100, y: 100 },
      { x: 200, y: 100 },
      { x: 200, y: 300 },
      { x: 100, y: 300 },
    ];
    const bounds = calculateBounds(rawPoints, 10);

    expect(bounds.x).toBe(90);
    expect(bounds.y).toBe(90);
    expect(bounds.width).toBe(120);
    expect(bounds.height).toBe(220);

    const clamped = clampBoundsToViewport(bounds, { width: 150, height: 250 });
    expect(clamped.x).toBe(90);
    expect(clamped.width).toBe(60); // clamped to 150 - 90
    expect(clamped.height).toBe(160); // clamped to 250 - 90
  });
});
