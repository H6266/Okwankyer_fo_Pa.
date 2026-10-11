import React, { useRef, useEffect, useCallback, useState } from 'react';
import { Point2D, Rect2D, PenStroke, InteractionMode, PenSettings } from '../../modules/study/types';
import { detectCircle } from '../../modules/study/circleDetector';

interface DrawingCanvasOverlayProps {
  mode: InteractionMode;
  zoom: number;
  penSettings: PenSettings;
  selectionBounds: Rect2D | null;
  onStrokeFinished?: (stroke: PenStroke) => void;
  onCircleDetected?: (bounds: Rect2D, stroke: PenStroke) => void;
  onSelectionCleared?: () => void;
}

export const DrawingCanvasOverlay: React.FC<DrawingCanvasOverlayProps> = ({
  mode,
  zoom,
  penSettings,
  selectionBounds,
  onStrokeFinished,
  onCircleDetected,
  onSelectionCleared,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Persistent strokes
  const [strokes, setStrokes] = useState<PenStroke[]>([]);
  const [redoStack, setRedoStack] = useState<PenStroke[]>([]);

  // Current active stroke (local state to avoid lag)
  const isDrawingRef = useRef(false);
  const currentPointsRef = useRef<Point2D[]>([]);

  // Resize canvas to match container exactly
  const syncCanvasSize = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(dpr, dpr);
    }
    redrawAll();
  }, [strokes, selectionBounds]);

  // Smooth quadratic Bézier path rendering
  const drawStrokePath = (ctx: CanvasRenderingContext2D, stroke: PenStroke) => {
    const points = stroke.points;
    if (points.length === 0) return;

    ctx.save();
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();

    if (points.length === 1) {
      ctx.arc(points[0].x, points[0].y, stroke.width / 2, 0, Math.PI * 2);
      ctx.fillStyle = stroke.color;
      ctx.fill();
      ctx.restore();
      return;
    }

    ctx.moveTo(points[0].x, points[0].y);

    if (points.length === 2) {
      ctx.lineTo(points[1].x, points[1].y);
      ctx.stroke();
      ctx.restore();
      return;
    }

    // Bézier interpolation between midpoints for supreme smoothness
    for (let i = 1; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;
      ctx.quadraticCurveTo(p1.x, p1.y, midX, midY);
    }

    const last = points[points.length - 1];
    ctx.lineTo(last.x, last.y);
    ctx.stroke();
    ctx.restore();
  };

  // Redraws all completed strokes and selection feedback
  const redrawAll = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);

    // Draw saved strokes
    for (const stroke of strokes) {
      drawStrokePath(ctx, stroke);
    }

    // Draw active stroke if currently drawing
    if (isDrawingRef.current && currentPointsRef.current.length > 0) {
      const activeStroke: PenStroke = {
        id: 'active',
        points: currentPointsRef.current,
        color: mode === 'circle_select' ? '#2563eb' : penSettings.color,
        width: penSettings.width,
        timestamp: Date.now(),
      };
      drawStrokePath(ctx, activeStroke);
    }
  }, [strokes, mode, penSettings]);

  useEffect(() => {
    syncCanvasSize();
    window.addEventListener('resize', syncCanvasSize);
    return () => window.removeEventListener('resize', syncCanvasSize);
  }, [syncCanvasSize]);

  useEffect(() => {
    redrawAll();
  }, [redrawAll]);

  // Pointer event coordinates relative to container
  const getPointerPos = (e: React.PointerEvent<HTMLCanvasElement>): Point2D => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      timestamp: Date.now(),
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (mode === 'read') return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);

    isDrawingRef.current = true;
    const pos = getPointerPos(e);
    currentPointsRef.current = [pos];
    redrawAll();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || mode === 'read') return;

    const pos = getPointerPos(e);
    const pts = currentPointsRef.current;
    const lastPos = pts[pts.length - 1];

    // Filter sub-pixel jitter
    if (lastPos && Math.hypot(pos.x - lastPos.x, pos.y - lastPos.y) < 2) {
      return;
    }

    pts.push(pos);

    // Direct local canvas drawing for instantaneous 60fps response
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (ctx && pts.length >= 2) {
      const p1 = pts[pts.length - 2];
      const p2 = pts[pts.length - 1];
      ctx.save();
      ctx.strokeStyle = mode === 'circle_select' ? '#2563eb' : penSettings.color;
      ctx.lineWidth = penSettings.width;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
      ctx.restore();
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || mode === 'read') return;
    isDrawingRef.current = false;

    const points = [...currentPointsRef.current];
    currentPointsRef.current = [];

    if (points.length < 2) {
      redrawAll();
      return;
    }

    const strokeId = `stroke_${Date.now()}`;
    const newStroke: PenStroke = {
      id: strokeId,
      points,
      color: mode === 'circle_select' ? '#2563eb' : penSettings.color,
      width: penSettings.width,
      timestamp: Date.now(),
    };

    // Run Circle Detector (Sections 13, 14, 15)
    const circleResult = detectCircle(points);

    if (circleResult.isCircle && circleResult.bounds) {
      // Circle Recognized!
      if (onCircleDetected) {
        onCircleDetected(circleResult.bounds, newStroke);
      }
      // If in circle_select mode, we can also record stroke
      setStrokes((prev) => [...prev, { ...newStroke, isClosedLoop: true }]);
      setRedoStack([]);
    } else {
      // Normal stroke annotation
      setStrokes((prev) => [...prev, newStroke]);
      setRedoStack([]);
      if (onStrokeFinished) {
        onStrokeFinished(newStroke);
      }
    }

    redrawAll();
  };

  // Undo / Redo controls exposed to parent or toolbar
  const handleUndo = useCallback(() => {
    setStrokes((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setRedoStack((r) => [...r, last]);
      return prev.slice(0, prev.length - 1);
    });
    if (onSelectionCleared) onSelectionCleared();
  }, [onSelectionCleared]);

  const handleRedo = useCallback(() => {
    setRedoStack((prev) => {
      if (prev.length === 0) return prev;
      const next = prev[prev.length - 1];
      setStrokes((s) => [...s, next]);
      return prev.slice(0, prev.length - 1);
    });
  }, []);

  const handleClear = useCallback(() => {
    setStrokes([]);
    setRedoStack([]);
    if (onSelectionCleared) onSelectionCleared();
  }, [onSelectionCleared]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-20 pointer-events-none select-none"
    >
      {/* HTML5 Canvas Surface */}
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className={`w-full h-full block ${
          mode === 'read' ? 'pointer-events-none cursor-default' : 'pointer-events-auto cursor-crosshair'
        }`}
      />

      {/* Visual Selection Feedback Overlay (Section 53) */}
      {selectionBounds && (
        <div
          className="absolute border-2 border-emerald-500 rounded-lg pointer-events-none transition-all duration-150 animate-pulse bg-emerald-500/10 shadow-[0_0_15px_rgba(16,185,129,0.35)]"
          style={{
            left: `${selectionBounds.x}px`,
            top: `${selectionBounds.y}px`,
            width: `${selectionBounds.width}px`,
            height: `${selectionBounds.height}px`,
          }}
        >
          <span className="absolute -top-6 left-0 bg-emerald-600 text-white font-bold text-[10px] uppercase tracking-wider px-2 py-0.5 rounded shadow-xs">
            ✨ Selected Region
          </span>
        </div>
      )}

      {/* Hidden Hook Ref Support for external toolbar triggers */}
      <div
        id="preach-pen-controls"
        data-undoable={strokes.length > 0}
        data-redoable={redoStack.length > 0}
        onClick={(e: any) => {
          if (e.target.dataset.action === 'undo') handleUndo();
          if (e.target.dataset.action === 'redo') handleRedo();
          if (e.target.dataset.action === 'clear') handleClear();
        }}
      />
    </div>
  );
};
