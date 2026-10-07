/**
 * Preach Mode - Circle & Ellipse Gesture Recognition
 * Implements Sections 13, 14, 15, 16 of Study Implementation Skill
 */

import { Point2D, Rect2D, CircleDetectionResult } from './types';

export interface CircleDetectorOptions {
  minPoints?: number;
  minSize?: number;
  maxClosureRatio?: number;
  maxRadialCv?: number;
  minAspectRatio?: number;
  confidenceThreshold?: number;
  padding?: number;
}

const DEFAULT_OPTIONS: Required<CircleDetectorOptions> = {
  minPoints: 10,
  minSize: 24, // min width and height in px
  maxClosureRatio: 0.45, // closure distance / diagonal
  maxRadialCv: 0.38, // coefficient of variation of radius
  minAspectRatio: 0.35, // width/height or height/width min ratio for ellipses
  confidenceThreshold: 0.58,
  padding: 12,
};

/**
 * Calculates Euclidean distance between two 2D points.
 */
export function distance(p1: Point2D, p2: Point2D): number {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.hypot(dx, dy);
}

/**
 * Computes the axis-aligned bounding box of a list of points.
 */
export function calculateBounds(points: Point2D[], padding = 0): Rect2D {
  if (points.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  let minX = points[0].x;
  let maxX = points[0].x;
  let minY = points[0].y;
  let maxY = points[0].y;

  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  return {
    x: minX - padding,
    y: minY - padding,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
  };
}

/**
 * Computes angular sweep of stroke around center point.
 * Returns total signed winding angle in radians.
 */
function calculateAngularCoverage(points: Point2D[], cx: number, cy: number): number {
  if (points.length < 3) return 0;

  let totalAngle = 0;
  let prevAngle = Math.atan2(points[0].y - cy, points[0].x - cx);

  for (let i = 1; i < points.length; i++) {
    const angle = Math.atan2(points[i].y - cy, points[i].x - cx);
    let diff = angle - prevAngle;
    // Normalize diff to [-PI, PI]
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    totalAngle += diff;
    prevAngle = angle;
  }

  return Math.abs(totalAngle);
}

/**
 * Detects whether a freehand pen stroke represents a closed circle or ellipse.
 */
export function detectCircle(
  points: Point2D[],
  customOptions?: CircleDetectorOptions
): CircleDetectionResult {
  const opts = { ...DEFAULT_OPTIONS, ...customOptions };

  // Step 1: Minimum points check
  if (!points || points.length < opts.minPoints) {
    return { isCircle: false, confidence: 0, bounds: null };
  }

  // Step 2: Bounding box
  const rawBounds = calculateBounds(points, 0);
  const width = rawBounds.width;
  const height = rawBounds.height;

  if (width < opts.minSize || height < opts.minSize) {
    return {
      isCircle: false,
      confidence: 0,
      bounds: null,
      details: {
        pointCount: points.length,
        closureRatio: 1,
        radialCv: 1,
        aspectRatio: 0,
        width,
        height,
      },
    };
  }

  // Step 3: Closure distance
  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];
  const closureDist = distance(firstPoint, lastPoint);
  const diagonal = Math.hypot(width, height);
  const closureRatio = closureDist / (diagonal || 1);

  // Score from 0 to 1 (1 = perfectly closed)
  const closureScore = Math.max(0, 1 - closureRatio / opts.maxClosureRatio);

  // Step 4: Center estimation
  const centerX = rawBounds.x + width / 2;
  const centerY = rawBounds.y + height / 2;

  // Step 5: Radial consistency & Elliptical normalization
  // To handle ellipses properly, scale coords by aspect ratio before checking radial variation
  const scaleX = width > 0 ? (2 / width) : 1;
  const scaleY = height > 0 ? (2 / height) : 1;

  let radiusSum = 0;
  const normalizedRadii: number[] = new Array(points.length);

  for (let i = 0; i < points.length; i++) {
    const nx = (points[i].x - centerX) * scaleX;
    const ny = (points[i].y - centerY) * scaleY;
    const r = Math.hypot(nx, ny);
    normalizedRadii[i] = r;
    radiusSum += r;
  }

  const meanRadius = radiusSum / points.length;
  let varianceSum = 0;
  for (let i = 0; i < points.length; i++) {
    const diff = normalizedRadii[i] - meanRadius;
    varianceSum += diff * diff;
  }
  const stdDev = Math.sqrt(varianceSum / points.length);
  const radialCv = meanRadius > 0 ? stdDev / meanRadius : 1;
  const circularityScore = Math.max(0, 1 - radialCv / opts.maxRadialCv);

  // Step 6: Aspect ratio
  const aspectRatio = Math.min(width, height) / Math.max(width, height);
  const aspectScore = Math.max(0, Math.min(1, aspectRatio / opts.minAspectRatio));

  // Step 7: Angular loop coverage
  // A genuine circle/ellipse must sweep at least ~4.2 rad (~240 degrees) around its center
  const angularSweep = calculateAngularCoverage(points, centerX, centerY);
  const sweepScore = Math.min(1, angularSweep / (1.5 * Math.PI)); // full credit at 270 deg

  // Combine scores with weighted importance
  const combinedConfidence =
    0.30 * closureScore +
    0.35 * circularityScore +
    0.15 * aspectScore +
    0.20 * sweepScore;

  const isCircle =
    combinedConfidence >= opts.confidenceThreshold &&
    closureRatio <= opts.maxClosureRatio &&
    radialCv <= opts.maxRadialCv &&
    aspectRatio >= opts.minAspectRatio &&
    angularSweep >= Math.PI * 1.2; // at least 216 degrees loop

  const boundsWithPadding = calculateBounds(points, opts.padding);

  return {
    isCircle,
    confidence: Math.round(combinedConfidence * 100) / 100,
    bounds: isCircle ? boundsWithPadding : null,
    details: {
      pointCount: points.length,
      closureRatio: Math.round(closureRatio * 100) / 100,
      radialCv: Math.round(radialCv * 100) / 100,
      aspectRatio: Math.round(aspectRatio * 100) / 100,
      width,
      height,
    },
  };
}

/**
 * Clamps a selection rectangle to the document viewport bounds.
 */
export function clampBoundsToViewport(
  bounds: Rect2D,
  viewport: { width: number; height: number }
): Rect2D {
  const x = Math.max(0, Math.min(bounds.x, viewport.width));
  const y = Math.max(0, Math.min(bounds.y, viewport.height));
  const width = Math.max(10, Math.min(bounds.width, viewport.width - x));
  const height = Math.max(10, Math.min(bounds.height, viewport.height - y));

  return { x, y, width, height };
}
