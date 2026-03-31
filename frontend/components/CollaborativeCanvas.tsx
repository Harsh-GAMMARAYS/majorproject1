'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

export interface CanvasPoint {
  x: number;
  y: number;
}

export interface CanvasStroke {
  id: string;
  user_id: string;
  color: string;
  width: number;
  tool?: 'pen' | 'line' | 'rectangle' | 'ellipse' | 'eraser';
  points: CanvasPoint[];
}

export interface CanvasCursor {
  user_id: string;
  name: string;
  x: number;
  y: number;
}

interface CollaborativeCanvasProps {
  strokes: CanvasStroke[];
  currentUserId: string;
  currentUserName: string;
  remoteCursors: Record<string, CanvasCursor>;
  className?: string;
  showToolbar?: boolean;
  disabled?: boolean;
  onStrokeComplete: (stroke: CanvasStroke) => void;
  onReplaceStrokes?: (strokes: CanvasStroke[]) => void;
  onCursorMove: (cursor: Omit<CanvasCursor, 'name'>) => void;
}

interface CanvasViewport {
  offsetX: number;
  offsetY: number;
  zoom: number;
}

type CanvasTool = 'select' | 'pen' | 'line' | 'rectangle' | 'ellipse' | 'eraser' | 'hand';
type DrawableTool = Exclude<CanvasTool, 'hand' | 'select'>;
type ResizeHandle = 'nw' | 'ne' | 'sw' | 'se';

interface StrokeBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const PALETTE = ['#10b981', '#22d3ee', '#f59e0b', '#f97316', '#e879f9'];
const TOOLBAR_COLORS = ['#22d3ee', '#10b981', '#f59e0b', '#f97316', '#e879f9', '#ef4444', '#f8fafc'];
const TOOLBAR_WIDTHS = [2, 3, 5, 8, 12];
const GRID_STEP_WORLD = 80;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;

function getUserColor(userId: string): string {
  const hash = Array.from(userId).reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return PALETTE[hash % PALETTE.length];
}

function clampZoom(nextZoom: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, nextZoom));
}

function pointerToScreen(event: PointerEvent | WheelEvent, element: HTMLCanvasElement): { x: number; y: number } {
  const rect = element.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function worldFromScreenPoint(screen: CanvasPoint, viewport: CanvasViewport): CanvasPoint {
  return {
    x: viewport.offsetX + screen.x / viewport.zoom,
    y: viewport.offsetY + screen.y / viewport.zoom,
  };
}

function worldFromPointerEvent(event: PointerEvent, element: HTMLCanvasElement, viewport: CanvasViewport): CanvasPoint {
  const screen = pointerToScreen(event, element);
  return worldFromScreenPoint(screen, viewport);
}

function toPixels(point: CanvasPoint, viewport: CanvasViewport): { x: number; y: number } {
  return {
    x: (point.x - viewport.offsetX) * viewport.zoom,
    y: (point.y - viewport.offsetY) * viewport.zoom,
  };
}

function drawGrid(context: CanvasRenderingContext2D, width: number, height: number, viewport: CanvasViewport) {
  const worldStartX = viewport.offsetX;
  const worldEndX = viewport.offsetX + width / viewport.zoom;
  const worldStartY = viewport.offsetY;
  const worldEndY = viewport.offsetY + height / viewport.zoom;

  context.save();
  context.strokeStyle = 'rgba(45, 55, 72, 0.35)';
  context.lineWidth = 1;

  for (let x = Math.floor(worldStartX / GRID_STEP_WORLD) * GRID_STEP_WORLD; x <= worldEndX; x += GRID_STEP_WORLD) {
    const px = (x - viewport.offsetX) * viewport.zoom;
    context.beginPath();
    context.moveTo(px, 0);
    context.lineTo(px, height);
    context.stroke();
  }

  for (let y = Math.floor(worldStartY / GRID_STEP_WORLD) * GRID_STEP_WORLD; y <= worldEndY; y += GRID_STEP_WORLD) {
    const py = (y - viewport.offsetY) * viewport.zoom;
    context.beginPath();
    context.moveTo(0, py);
    context.lineTo(width, py);
    context.stroke();
  }
  context.restore();
}

function drawStroke(context: CanvasRenderingContext2D, stroke: CanvasStroke, viewport: CanvasViewport) {
  if (stroke.points.length < 2) {
    return;
  }

  const tool = stroke.tool ?? 'pen';
  const start = toPixels(stroke.points[0], viewport);
  const end = toPixels(stroke.points[stroke.points.length - 1], viewport);

  context.save();
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.lineWidth = stroke.width;
  context.strokeStyle = stroke.color;

  if (tool === 'eraser') {
    context.globalCompositeOperation = 'destination-out';
  }

  if (tool === 'line') {
    context.beginPath();
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
    context.stroke();
    context.restore();
    return;
  }

  if (tool === 'rectangle') {
    context.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
    context.restore();
    return;
  }

  if (tool === 'ellipse') {
    const centerX = (start.x + end.x) / 2;
    const centerY = (start.y + end.y) / 2;
    const radiusX = Math.abs(end.x - start.x) / 2;
    const radiusY = Math.abs(end.y - start.y) / 2;
    context.beginPath();
    context.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
    context.stroke();
    context.restore();
    return;
  }

  context.beginPath();
  context.moveTo(start.x, start.y);
  for (const point of stroke.points.slice(1)) {
    const pixel = toPixels(point, viewport);
    context.lineTo(pixel.x, pixel.y);
  }
  context.stroke();
  context.restore();
}

function getStrokeBounds(stroke: CanvasStroke): StrokeBounds {
  const xs = stroke.points.map((point) => point.x);
  const ys = stroke.points.map((point) => point.y);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

function distancePointToSegment(point: CanvasPoint, a: CanvasPoint, b: CanvasPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) {
    const px = point.x - a.x;
    const py = point.y - a.y;
    return Math.hypot(px, py);
  }

  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy)));
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  return Math.hypot(point.x - projX, point.y - projY);
}

function isPointNearStroke(point: CanvasPoint, stroke: CanvasStroke, tolerance: number): boolean {
  const bounds = getStrokeBounds(stroke);
  if (
    point.x < bounds.minX - tolerance
    || point.x > bounds.maxX + tolerance
    || point.y < bounds.minY - tolerance
    || point.y > bounds.maxY + tolerance
  ) {
    return false;
  }

  if (stroke.points.length < 2) {
    return false;
  }

  for (let index = 0; index < stroke.points.length - 1; index += 1) {
    const distance = distancePointToSegment(point, stroke.points[index], stroke.points[index + 1]);
    if (distance <= tolerance + stroke.width / 2) {
      return true;
    }
  }
  return false;
}

function getResizeHandles(bounds: StrokeBounds): Record<ResizeHandle, CanvasPoint> {
  return {
    nw: { x: bounds.minX, y: bounds.minY },
    ne: { x: bounds.maxX, y: bounds.minY },
    sw: { x: bounds.minX, y: bounds.maxY },
    se: { x: bounds.maxX, y: bounds.maxY },
  };
}

function getResizeHandleAtPoint(point: CanvasPoint, bounds: StrokeBounds, tolerance: number): ResizeHandle | null {
  const handles = getResizeHandles(bounds);
  for (const handle of Object.keys(handles) as ResizeHandle[]) {
    const candidate = handles[handle];
    if (Math.abs(point.x - candidate.x) <= tolerance && Math.abs(point.y - candidate.y) <= tolerance) {
      return handle;
    }
  }
  return null;
}

function resizeStrokePoints(
  originalPoints: CanvasPoint[],
  originalBounds: StrokeBounds,
  nextBounds: StrokeBounds,
): CanvasPoint[] {
  const originalWidth = Math.max(1e-6, originalBounds.maxX - originalBounds.minX);
  const originalHeight = Math.max(1e-6, originalBounds.maxY - originalBounds.minY);
  const nextWidth = Math.max(1e-6, nextBounds.maxX - nextBounds.minX);
  const nextHeight = Math.max(1e-6, nextBounds.maxY - nextBounds.minY);

  return originalPoints.map((point) => {
    const nx = (point.x - originalBounds.minX) / originalWidth;
    const ny = (point.y - originalBounds.minY) / originalHeight;
    return {
      x: nextBounds.minX + nx * nextWidth,
      y: nextBounds.minY + ny * nextHeight,
    };
  });
}

export default function CollaborativeCanvas({
  strokes,
  currentUserId,
  currentUserName,
  remoteCursors,
  className,
  showToolbar = true,
  disabled = false,
  onStrokeComplete,
  onReplaceStrokes,
  onCursorMove,
}: CollaborativeCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const draftPointsRef = useRef<CanvasPoint[]>([]);
  const viewportRef = useRef<CanvasViewport>({ offsetX: -240, offsetY: -160, zoom: 1 });
  const panStartRef = useRef<{ x: number; y: number; offsetX: number; offsetY: number }>({
    x: 0,
    y: 0,
    offsetX: 0,
    offsetY: 0,
  });
  const [draftPoints, setDraftPoints] = useState<CanvasPoint[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [panning, setPanning] = useState(false);
  const [spacePressed, setSpacePressed] = useState(false);
  const [activeTool, setActiveTool] = useState<CanvasTool>('select');
  const [activeColor, setActiveColor] = useState<string>('');
  const [activeWidth, setActiveWidth] = useState(3);
  const [redoStrokes, setRedoStrokes] = useState<CanvasStroke[]>([]);
  const [showGrid, setShowGrid] = useState(true);
  const [viewport, setViewport] = useState<CanvasViewport>(viewportRef.current);
  const [selectedStrokeId, setSelectedStrokeId] = useState<string | null>(null);
  const [selectionPreviewStroke, setSelectionPreviewStroke] = useState<CanvasStroke | null>(null);
  const selectionDragRef = useRef<{ kind: 'move'; start: CanvasPoint; points: CanvasPoint[] } | {
    kind: 'resize';
    handle: ResizeHandle;
    originalBounds: StrokeBounds;
    points: CanvasPoint[];
  } | null>(null);
  const minimapCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const draftColor = useMemo(() => getUserColor(currentUserId), [currentUserId]);
  const effectiveColor = activeTool === 'eraser' ? '#000000' : (activeColor || draftColor);
  const effectiveWidth = activeTool === 'eraser' ? Math.max(10, activeWidth * 2) : activeWidth;

  const renderedStrokes = useMemo(() => {
    if (!selectionPreviewStroke) {
      return strokes;
    }
    return strokes.map((stroke) => (stroke.id === selectionPreviewStroke.id ? selectionPreviewStroke : stroke));
  }, [selectionPreviewStroke, strokes]);

  const selectedStroke = useMemo(() => {
    return renderedStrokes.find((stroke) => stroke.id === selectedStrokeId) ?? null;
  }, [renderedStrokes, selectedStrokeId]);

  const selectedBounds = useMemo(() => {
    if (!selectedStroke) {
      return null;
    }
    return getStrokeBounds(selectedStroke);
  }, [selectedStroke]);

  useEffect(() => {
    if (!activeColor) {
      setActiveColor(draftColor);
    }
  }, [activeColor, draftColor]);

  useEffect(() => {
    draftPointsRef.current = draftPoints;
  }, [draftPoints]);

  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        setSpacePressed(true);
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        setSpacePressed(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) {
      return;
    }

    const resize = () => {
      const rect = wrapper.getBoundingClientRect();
      const width = Math.max(320, Math.floor(rect.width));
      const height = Math.max(220, Math.floor(rect.height));
      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext('2d');
      if (!context) {
        return;
      }

      context.clearRect(0, 0, width, height);
      context.lineCap = 'round';
      context.lineJoin = 'round';

      if (showGrid) {
        drawGrid(context, width, height, viewport);
      }

      for (const stroke of renderedStrokes) {
        drawStroke(context, stroke, viewport);
      }

      if (selectedBounds) {
        const topLeft = toPixels({ x: selectedBounds.minX, y: selectedBounds.minY }, viewport);
        const bottomRight = toPixels({ x: selectedBounds.maxX, y: selectedBounds.maxY }, viewport);

        context.save();
        context.strokeStyle = 'rgba(34, 211, 238, 0.9)';
        context.lineWidth = 1.5;
        context.setLineDash([8, 6]);
        context.strokeRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
        context.setLineDash([]);

        const handles = getResizeHandles(selectedBounds);
        for (const handlePoint of Object.values(handles)) {
          const pixel = toPixels(handlePoint, viewport);
          context.fillStyle = '#22d3ee';
          context.fillRect(pixel.x - 4, pixel.y - 4, 8, 8);
        }
        context.restore();
      }

      if (draftPoints.length >= 2) {
        drawStroke(context, {
          id: 'draft',
          user_id: currentUserId,
          color: effectiveColor,
          width: effectiveWidth,
          points: draftPoints,
          tool: (activeTool === 'hand' || activeTool === 'select') ? 'pen' : activeTool,
        }, viewport);
      }
    };

    resize();
    const observer = new ResizeObserver(() => resize());
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, [activeTool, currentUserId, draftPoints, effectiveColor, effectiveWidth, renderedStrokes, selectedBounds, showGrid, strokes, viewport]);

  useEffect(() => {
    if (selectedStrokeId && !strokes.some((stroke) => stroke.id === selectedStrokeId)) {
      setSelectedStrokeId(null);
      setSelectionPreviewStroke(null);
      selectionDragRef.current = null;
    }
  }, [selectedStrokeId, strokes]);

  useEffect(() => {
    const mini = minimapCanvasRef.current;
    if (!mini) {
      return;
    }
    const ctx = mini.getContext('2d');
    if (!ctx) {
      return;
    }

    const width = mini.width;
    const height = mini.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(0, 0, width, height);

    const allPoints = strokes.flatMap((stroke) => stroke.points);
    const viewportWorldWidth = 300 / viewport.zoom;
    const viewportWorldHeight = 180 / viewport.zoom;
    const minX = Math.min(viewport.offsetX, ...allPoints.map((point) => point.x)) - 80;
    const minY = Math.min(viewport.offsetY, ...allPoints.map((point) => point.y)) - 80;
    const maxX = Math.max(viewport.offsetX + viewportWorldWidth, ...allPoints.map((point) => point.x)) + 80;
    const maxY = Math.max(viewport.offsetY + viewportWorldHeight, ...allPoints.map((point) => point.y)) + 80;

    const worldWidth = Math.max(1, maxX - minX);
    const worldHeight = Math.max(1, maxY - minY);
    const scale = Math.min(width / worldWidth, height / worldHeight);

    const project = (point: CanvasPoint) => ({
      x: (point.x - minX) * scale,
      y: (point.y - minY) * scale,
    });

    for (const stroke of strokes) {
      if (stroke.points.length < 2) {
        continue;
      }
      ctx.beginPath();
      const start = project(stroke.points[0]);
      ctx.moveTo(start.x, start.y);
      for (const point of stroke.points.slice(1)) {
        const mapped = project(point);
        ctx.lineTo(mapped.x, mapped.y);
      }
      ctx.strokeStyle = stroke.tool === 'eraser' ? 'rgba(120,120,120,0.55)' : 'rgba(160,220,255,0.75)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    const viewportRectX = (viewport.offsetX - minX) * scale;
    const viewportRectY = (viewport.offsetY - minY) * scale;
    const viewportRectW = viewportWorldWidth * scale;
    const viewportRectH = viewportWorldHeight * scale;
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(viewportRectX, viewportRectY, viewportRectW, viewportRectH);
  }, [strokes, viewport]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      const shouldPan = event.button === 1 || activeTool === 'hand' || spacePressed;

      if (shouldPan) {
        event.preventDefault();
        canvas.setPointerCapture(event.pointerId);
        const screen = pointerToScreen(event, canvas);
        panStartRef.current = {
          x: screen.x,
          y: screen.y,
          offsetX: viewportRef.current.offsetX,
          offsetY: viewportRef.current.offsetY,
        };
        setPanning(true);
        return;
      }

      if (event.button !== 0 || disabled) {
        return;
      }

      const point = worldFromPointerEvent(event, canvas, viewportRef.current);

      if (activeTool === 'select') {
        const selected = [...renderedStrokes]
          .reverse()
          .find((stroke) => isPointNearStroke(point, stroke, Math.max(8 / viewportRef.current.zoom, 2.5)));

        if (!selected) {
          setSelectedStrokeId(null);
          setSelectionPreviewStroke(null);
          selectionDragRef.current = null;
          return;
        }

        setSelectedStrokeId(selected.id);
        const bounds = getStrokeBounds(selected);
        const handle = getResizeHandleAtPoint(point, bounds, Math.max(10 / viewportRef.current.zoom, 3));
        if (handle) {
          selectionDragRef.current = {
            kind: 'resize',
            handle,
            originalBounds: bounds,
            points: selected.points,
          };
        } else {
          selectionDragRef.current = {
            kind: 'move',
            start: point,
            points: selected.points,
          };
        }
        canvas.setPointerCapture(event.pointerId);
        return;
      }

      event.preventDefault();
      canvas.setPointerCapture(event.pointerId);
      draftPointsRef.current = [point];
      setDraftPoints([point]);
      setDrawing(true);

      const rect = canvas.getBoundingClientRect();
      const cursorX = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      const cursorY = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
      onCursorMove({ user_id: currentUserId, x: cursorX, y: cursorY });
    };

    const onPointerMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const cursorX = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      const cursorY = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
      onCursorMove({ user_id: currentUserId, x: cursorX, y: cursorY });

      if (panning) {
        const screen = pointerToScreen(event, canvas);
        const dx = (screen.x - panStartRef.current.x) / viewportRef.current.zoom;
        const dy = (screen.y - panStartRef.current.y) / viewportRef.current.zoom;
        setViewport({
          offsetX: panStartRef.current.offsetX - dx,
          offsetY: panStartRef.current.offsetY - dy,
          zoom: viewportRef.current.zoom,
        });
        return;
      }

      if (selectionDragRef.current && selectedStrokeId) {
        const selected = renderedStrokes.find((stroke) => stroke.id === selectedStrokeId);
        if (!selected) {
          return;
        }
        const point = worldFromPointerEvent(event, canvas, viewportRef.current);
        if (selectionDragRef.current.kind === 'move') {
          const dx = point.x - selectionDragRef.current.start.x;
          const dy = point.y - selectionDragRef.current.start.y;
          setSelectionPreviewStroke({
            ...selected,
            points: selectionDragRef.current.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
          });
          return;
        }

        const { handle, originalBounds, points } = selectionDragRef.current;
        const nextBounds = { ...originalBounds };
        if (handle === 'nw') {
          nextBounds.minX = point.x;
          nextBounds.minY = point.y;
        }
        if (handle === 'ne') {
          nextBounds.maxX = point.x;
          nextBounds.minY = point.y;
        }
        if (handle === 'sw') {
          nextBounds.minX = point.x;
          nextBounds.maxY = point.y;
        }
        if (handle === 'se') {
          nextBounds.maxX = point.x;
          nextBounds.maxY = point.y;
        }

        if (nextBounds.minX > nextBounds.maxX) {
          const tmp = nextBounds.minX;
          nextBounds.minX = nextBounds.maxX;
          nextBounds.maxX = tmp;
        }
        if (nextBounds.minY > nextBounds.maxY) {
          const tmp = nextBounds.minY;
          nextBounds.minY = nextBounds.maxY;
          nextBounds.maxY = tmp;
        }

        setSelectionPreviewStroke({
          ...selected,
          points: resizeStrokePoints(points, originalBounds, nextBounds),
        });
        return;
      }

      if (!drawing) {
        return;
      }
      const point = worldFromPointerEvent(event, canvas, viewportRef.current);
      if (activeTool === 'line' || activeTool === 'rectangle' || activeTool === 'ellipse') {
        setDraftPoints((current) => {
          const start = current[0] ?? point;
          const next = [start, point];
          draftPointsRef.current = next;
          return next;
        });
        return;
      }

      setDraftPoints((current) => {
        const next = [...current, point];
        draftPointsRef.current = next;
        return next;
      });
    };

    const finishStroke = (event: PointerEvent) => {
      if (panning) {
        setPanning(false);
        if (canvas.hasPointerCapture(event.pointerId)) {
          canvas.releasePointerCapture(event.pointerId);
        }
        return;
      }

      if (selectionDragRef.current && selectedStrokeId) {
        if (selectionPreviewStroke) {
          replaceBoard(strokes.map((stroke) => (
            stroke.id === selectionPreviewStroke.id ? selectionPreviewStroke : stroke
          )));
        }
        setSelectionPreviewStroke(null);
        selectionDragRef.current = null;
        if (canvas.hasPointerCapture(event.pointerId)) {
          canvas.releasePointerCapture(event.pointerId);
        }
        return;
      }

      if (!drawing) {
        return;
      }
      const point = worldFromPointerEvent(event, canvas, viewportRef.current);
      const points = [...draftPointsRef.current, point];
      setDraftPoints([]);
      draftPointsRef.current = [];
      if (points.length >= 2) {
        onStrokeComplete({
          id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
          user_id: currentUserId,
          color: effectiveColor,
          width: effectiveWidth,
          tool: (activeTool === 'hand' ? 'pen' : activeTool) as DrawableTool,
          points,
        });
        setRedoStrokes([]);
      }
      setDrawing(false);
      const rect = canvas.getBoundingClientRect();
      const cursorX = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      const cursorY = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
      onCursorMove({ user_id: currentUserId, x: cursorX, y: cursorY });
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
    };

    const onWheel = (event: WheelEvent) => {
      const currentViewport = viewportRef.current;
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();

        const screen = pointerToScreen(event, canvas);
        const worldPoint = worldFromScreenPoint({ x: screen.x, y: screen.y }, currentViewport);
        const zoomStep = event.deltaY < 0 ? 1.1 : 0.9;
        const nextZoom = clampZoom(currentViewport.zoom * zoomStep);
        const nextOffsetX = worldPoint.x - screen.x / nextZoom;
        const nextOffsetY = worldPoint.y - screen.y / nextZoom;

        setViewport({
          offsetX: nextOffsetX,
          offsetY: nextOffsetY,
          zoom: nextZoom,
        });
        return;
      }

      event.preventDefault();

      setViewport({
        offsetX: currentViewport.offsetX + event.deltaX / currentViewport.zoom,
        offsetY: currentViewport.offsetY + event.deltaY / currentViewport.zoom,
        zoom: currentViewport.zoom,
      });
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', finishStroke);
    canvas.addEventListener('pointercancel', finishStroke);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', finishStroke);
      canvas.removeEventListener('pointercancel', finishStroke);
      canvas.removeEventListener('wheel', onWheel);
    };
  }, [activeTool, currentUserId, disabled, drawing, effectiveColor, effectiveWidth, onCursorMove, onReplaceStrokes, onStrokeComplete, panning, renderedStrokes, selectedStrokeId, selectionPreviewStroke, spacePressed, strokes]);

  useEffect(() => {
    if (disabled || !onReplaceStrokes) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault();
        handleUndo();
      }
      if (key === 'y' || (key === 'z' && event.shiftKey)) {
        event.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [disabled, onReplaceStrokes, redoStrokes, strokes]);

  const replaceBoard = (nextStrokes: CanvasStroke[]) => {
    if (!onReplaceStrokes) {
      return;
    }
    onReplaceStrokes(nextStrokes);
  };

  const handleUndo = () => {
    if (!onReplaceStrokes || disabled) {
      return;
    }
    const ownIndexes: number[] = [];
    for (let index = 0; index < strokes.length; index += 1) {
      if (strokes[index].user_id === currentUserId) {
        ownIndexes.push(index);
      }
    }
    const lastOwnIndex = ownIndexes[ownIndexes.length - 1];
    if (lastOwnIndex === undefined) {
      return;
    }
    const removedStroke = strokes[lastOwnIndex];
    const next = strokes.filter((_, index) => index !== lastOwnIndex);
    setRedoStrokes((current) => [...current, removedStroke]);
    replaceBoard(next);
  };

  const handleRedo = () => {
    if (!onReplaceStrokes || disabled || redoStrokes.length === 0) {
      return;
    }
    const stroke = redoStrokes[redoStrokes.length - 1];
    setRedoStrokes((current) => current.slice(0, -1));
    replaceBoard([...strokes, stroke]);
  };

  const handleClearMine = () => {
    if (!onReplaceStrokes || disabled) {
      return;
    }
    const mine = strokes.filter((stroke) => stroke.user_id === currentUserId);
    if (mine.length === 0) {
      return;
    }
    setRedoStrokes((current) => [...current, ...mine]);
    replaceBoard(strokes.filter((stroke) => stroke.user_id !== currentUserId));
  };

  const handleClearAll = () => {
    if (!onReplaceStrokes || disabled || strokes.length === 0) {
      return;
    }
    setRedoStrokes((current) => [...current, ...strokes]);
    replaceBoard([]);
    setSelectedStrokeId(null);
    setSelectionPreviewStroke(null);
    selectionDragRef.current = null;
  };

  const zoomBy = (factor: number) => {
    const current = viewportRef.current;
    const nextZoom = clampZoom(current.zoom * factor);
    setViewport({
      offsetX: current.offsetX,
      offsetY: current.offsetY,
      zoom: nextZoom,
    });
  };

  const resetView = () => {
    setViewport({ offsetX: -240, offsetY: -160, zoom: 1 });
  };

  const handleMinimapPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const mini = minimapCanvasRef.current;
    if (!mini) {
      return;
    }

    const rect = mini.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const allPoints = strokes.flatMap((stroke) => stroke.points);
    const viewportWorldWidth = 300 / viewport.zoom;
    const viewportWorldHeight = 180 / viewport.zoom;
    const minX = Math.min(viewport.offsetX, ...allPoints.map((point) => point.x)) - 80;
    const minY = Math.min(viewport.offsetY, ...allPoints.map((point) => point.y)) - 80;
    const maxX = Math.max(viewport.offsetX + viewportWorldWidth, ...allPoints.map((point) => point.x)) + 80;
    const maxY = Math.max(viewport.offsetY + viewportWorldHeight, ...allPoints.map((point) => point.y)) + 80;

    const worldWidth = Math.max(1, maxX - minX);
    const worldHeight = Math.max(1, maxY - minY);
    const scale = Math.min(mini.width / worldWidth, mini.height / worldHeight);

    const worldX = minX + x / scale;
    const worldY = minY + y / scale;

    setViewport((current) => ({
      offsetX: worldX - (300 / current.zoom) / 2,
      offsetY: worldY - (180 / current.zoom) / 2,
      zoom: current.zoom,
    }));
  };

  const remoteCursorItems = Object.values(remoteCursors).filter((cursor) => cursor.user_id !== currentUserId);

  const wrapperClassName = className ?? 'relative h-80 w-full overflow-hidden rounded-xl border border-gray-700 bg-[#0a0a0a]';

  return (
    <div ref={wrapperRef} className={wrapperClassName}>
      {showToolbar && (
        <div className="pointer-events-auto absolute left-2 top-2 z-20 flex max-w-[calc(100%-1rem)] flex-wrap items-center gap-1.5 rounded-xl border border-gray-700 bg-black/75 p-2 backdrop-blur">
          {(['select', 'pen', 'line', 'rectangle', 'ellipse', 'eraser', 'hand'] as CanvasTool[]).map((tool) => (
            <button
              key={tool}
              disabled={disabled}
              onClick={() => {
                setActiveTool(tool);
                if (tool !== 'hand') {
                  setSpacePressed(false);
                }
              }}
              className={`rounded-md border px-2 py-1 text-[10px] uppercase tracking-[0.12em] ${activeTool === tool ? 'border-cyan-600 bg-cyan-950/45 text-cyan-100' : 'border-gray-700 bg-black/45 text-gray-200'} disabled:cursor-not-allowed disabled:opacity-60`}
            >
              {tool === 'rectangle' ? 'rect' : (tool === 'select' ? 'select' : tool)}
            </button>
          ))}

          <div className="mx-1 h-5 w-px bg-gray-700" />

          {TOOLBAR_COLORS.map((color) => (
            <button
              key={color}
              disabled={disabled || activeTool === 'eraser'}
              onClick={() => setActiveColor(color)}
              className={`h-4 w-4 rounded-full border ${activeColor === color ? 'border-white' : 'border-gray-700'} disabled:cursor-not-allowed disabled:opacity-50`}
              style={{ backgroundColor: color }}
              aria-label={`color-${color}`}
            />
          ))}

          <select
            disabled={disabled}
            value={activeWidth}
            onChange={(event) => setActiveWidth(Number.parseInt(event.target.value, 10) || 3)}
            className="rounded-md border border-gray-700 bg-black/60 px-1.5 py-1 text-[10px] text-gray-100 outline-none disabled:cursor-not-allowed disabled:opacity-60"
          >
            {TOOLBAR_WIDTHS.map((value) => (
              <option key={value} value={value}>{value}px</option>
            ))}
          </select>

          <button
            disabled={disabled || !onReplaceStrokes}
            onClick={handleUndo}
            className="rounded-md border border-gray-700 bg-black/45 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Undo
          </button>
          <button
            disabled={disabled || !onReplaceStrokes || redoStrokes.length === 0}
            onClick={handleRedo}
            className="rounded-md border border-gray-700 bg-black/45 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Redo
          </button>
          <button
            disabled={disabled || !onReplaceStrokes}
            onClick={handleClearMine}
            className="rounded-md border border-rose-800/70 bg-rose-950/35 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-rose-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Clear mine
          </button>
          <button
            disabled={disabled || !onReplaceStrokes}
            onClick={handleClearAll}
            className="rounded-md border border-rose-700/70 bg-rose-900/40 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Clear all
          </button>

          <div className="mx-1 h-5 w-px bg-gray-700" />

          <button
            disabled={disabled}
            onClick={() => zoomBy(0.9)}
            className="rounded-md border border-gray-700 bg-black/45 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            -
          </button>
          <button
            disabled={disabled}
            onClick={() => zoomBy(1.1)}
            className="rounded-md border border-gray-700 bg-black/45 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            +
          </button>
          <button
            disabled={disabled}
            onClick={resetView}
            className="rounded-md border border-gray-700 bg-black/45 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {Math.round(viewport.zoom * 100)}%
          </button>
          <button
            disabled={disabled}
            onClick={() => setShowGrid((current) => !current)}
            className="rounded-md border border-gray-700 bg-black/45 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {showGrid ? 'Grid on' : 'Grid off'}
          </button>
        </div>
      )}

      <canvas
        ref={canvasRef}
        className={`h-full w-full touch-none ${panning ? 'cursor-grabbing' : (activeTool === 'hand' || spacePressed ? 'cursor-grab' : activeTool === 'select' ? 'cursor-default' : 'cursor-crosshair')}`}
      />
      {showToolbar && (
        <div className="pointer-events-auto absolute bottom-2 left-2 z-20 rounded-lg border border-gray-700 bg-black/70 p-1">
          <canvas
            ref={minimapCanvasRef}
            width={150}
            height={90}
            onPointerDown={handleMinimapPointerDown}
            className="cursor-pointer rounded"
          />
        </div>
      )}
      {remoteCursorItems.map((cursor) => (
        <div
          key={cursor.user_id}
          className="pointer-events-none absolute"
          style={{
            left: `${cursor.x * 100}%`,
            top: `${cursor.y * 100}%`,
            transform: 'translate(-2px, -2px)',
          }}
        >
          <div className="h-2.5 w-2.5 rounded-full bg-cyan-300 shadow-[0_0_0_2px_rgba(8,47,73,0.9)]" />
          <div className="mt-1 rounded bg-black/80 px-1.5 py-0.5 text-[10px] text-cyan-100">{cursor.name}</div>
        </div>
      ))}
      <div className="pointer-events-none absolute bottom-2 right-2 rounded bg-black/70 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-gray-400">
        {currentUserName} drawing
      </div>
    </div>
  );
}
