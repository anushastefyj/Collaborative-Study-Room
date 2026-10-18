import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useSocket } from '../context/SocketContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import {
  Pen,
  Eraser,
  Undo2,
  Trash2,
  Download,
  PenTool,
  Image as ImageIcon,
  Sparkles,
} from 'lucide-react';

const PRESET_COLORS = [
  '#ffffff', // White
  '#818cf8', // Indigo
  '#38bdf8', // Sky Blue
  '#34d399', // Emerald
  '#fbbf24', // Amber
  '#f87171', // Rose
  '#c084fc', // Purple
  '#f472b6', // Pink
];

export const Whiteboard = ({ roomCode }) => {
  const { socket, isConnected } = useSocket();
  const { user } = useAuth();

  const containerRef = useRef(null);
  const canvasRef = useRef(null);

  // Drawing tools state
  const [tool, setTool] = useState('pen'); // 'pen' | 'eraser'
  const [color, setColor] = useState('#818cf8');
  const [size, setSize] = useState(4);
  const [isDrawing, setIsDrawing] = useState(false);
  const [remoteCursors, setRemoteCursors] = useState({});

  // References to keep stroke history in sync across renders
  const strokesRef = useRef([]);
  const activeStrokeRef = useRef(null);
  const lastEmitTimeRef = useRef(0);

  /**
   * Render a single stroke onto the canvas context
   */
  const drawStrokeOnCanvas = useCallback((ctx, stroke, width, height) => {
    if (!ctx || !stroke || !stroke.points || stroke.points.length === 0) return;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (stroke.tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = stroke.size * 2.5; // Wider eraser for usability
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = stroke.color || '#ffffff';
      ctx.lineWidth = stroke.size || 3;
    }

    const pts = stroke.points;
    if (pts.length === 1) {
      // Draw a single dot
      ctx.beginPath();
      ctx.arc(pts[0].x * width, pts[0].y * height, (stroke.size || 3) / 2, 0, Math.PI * 2);
      ctx.fillStyle = stroke.color || '#ffffff';
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(pts[0].x * width, pts[0].y * height);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x * width, pts[i].y * height);
      }
      ctx.stroke();
    }

    ctx.restore();
  }, []);

  /**
   * Redraw all cached normalized strokes
   */
  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const stroke of strokesRef.current) {
      drawStrokeOnCanvas(ctx, stroke, canvas.width, canvas.height);
    }
  }, [drawStrokeOnCanvas]);

  /**
   * Resize canvas to fill container while preserving pixel aspect ratio
   */
  const handleResize = useCallback(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const rect = container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    canvas.width = rect.width;
    canvas.height = rect.height;

    redrawCanvas();
  }, [redrawCanvas]);

  // Set up ResizeObserver to handle window and panel resizing smoothly
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    handleResize();

    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, [handleResize]);

  // Socket event listeners for real-time collaboration
  useEffect(() => {
    if (!socket || !isConnected || !roomCode) return;

    const cleanCode = roomCode.toUpperCase();

    // 1. Request initial board state
    socket.emit('board:init', { roomCode: cleanCode });

    // 2. Listen to full board state on join or sync
    const handleBoardState = (payload) => {
      if (payload.roomCode?.toUpperCase() !== cleanCode) return;
      if (Array.isArray(payload.strokes)) {
        strokesRef.current = payload.strokes;
        redrawCanvas();
      }
    };

    // 3. Listen to incoming strokes drawn by peers
    const handleRemoteStroke = (stroke) => {
      if (!stroke || !stroke.points) return;

      const existingIndex = strokesRef.current.findIndex(
        (s) => s.strokeId === stroke.strokeId
      );

      if (existingIndex >= 0) {
        strokesRef.current[existingIndex] = stroke;
      } else {
        strokesRef.current.push(stroke);
      }

      // Incrementally render incoming stroke for efficiency
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        drawStrokeOnCanvas(ctx, stroke, canvas.width, canvas.height);
      }
    };

    // 4. Listen to undo action
    const handleRemoteUndo = ({ strokeId }) => {
      strokesRef.current = strokesRef.current.filter((s) => s.strokeId !== strokeId);
      redrawCanvas();
    };

    // 5. Listen to clear board action
    const handleRemoteClear = () => {
      strokesRef.current = [];
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };

    // 6. Listen to peer drawing cursors & indicators
    const handleRemoteCursor = (payload) => {
      if (!payload?.userId || payload.userId === user?._id) return;
      setRemoteCursors((prev) => ({
        ...prev,
        [payload.userId]: {
          ...payload,
          timestamp: Date.now(),
        },
      }));
    };

    socket.on('board:state', handleBoardState);
    socket.on('draw:stroke', handleRemoteStroke);
    socket.on('draw:undo', handleRemoteUndo);
    socket.on('draw:clear', handleRemoteClear);
    socket.on('draw:cursor', handleRemoteCursor);

    // Auto-clean stale drawing cursors after 3 seconds
    const cursorInterval = setInterval(() => {
      const now = Date.now();
      setRemoteCursors((prev) => {
        let changed = false;
        const next = {};
        for (const [id, cursor] of Object.entries(prev)) {
          if (now - cursor.timestamp < 3500) {
            next[id] = cursor;
          } else {
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 2000);

    return () => {
      socket.off('board:state', handleBoardState);
      socket.off('draw:stroke', handleRemoteStroke);
      socket.off('draw:undo', handleRemoteUndo);
      socket.off('draw:clear', handleRemoteClear);
      socket.off('draw:cursor', handleRemoteCursor);
      clearInterval(cursorInterval);
    };
  }, [socket, isConnected, roomCode, user, redrawCanvas, drawStrokeOnCanvas]);

  /**
   * Helper to extract normalized (0 to 1) coordinates from Mouse or Touch event
   */
  const getNormalizedCoordinates = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));

    return { x, y };
  };

  /**
   * Start drawing (PointerDown / TouchStart)
   */
  const startDrawing = (e) => {
    // Avoid drawing if clicking on toolbars
    if (e.target !== canvasRef.current) return;
    if (e.touches && e.touches.length > 1) return; // Ignore multi-touch gestures

    const coords = getNormalizedCoordinates(e);
    if (!coords) return;

    setIsDrawing(true);
    const strokeId = `${user?._id || 'anon'}_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;

    const newStroke = {
      strokeId,
      userId: user?._id,
      color,
      size,
      tool,
      points: [coords],
    };

    activeStrokeRef.current = newStroke;
    lastEmitTimeRef.current = Date.now();

    // Render immediate local dot
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      drawStrokeOnCanvas(ctx, newStroke, canvas.width, canvas.height);
    }

    // Broadcast cursor start
    if (socket && isConnected) {
      socket.emit('draw:cursor', {
        roomCode: roomCode.toUpperCase(),
        x: coords.x,
        y: coords.y,
        isDrawing: true,
        color,
        userName: user?.name,
      });
    }
  };

  /**
   * Continue drawing (PointerMove / TouchMove)
   */
  const draw = (e) => {
    if (!isDrawing || !activeStrokeRef.current) return;
    if (e.cancelable && e.type === 'touchmove') e.preventDefault();

    const coords = getNormalizedCoordinates(e);
    if (!coords) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const stroke = activeStrokeRef.current;
    const prevPoint = stroke.points[stroke.points.length - 1];
    stroke.points.push(coords);

    // Draw incremental segment for 60fps immediate response
    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (stroke.tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = stroke.size * 2.5;
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.size;
    }

    ctx.beginPath();
    ctx.moveTo(prevPoint.x * canvas.width, prevPoint.y * canvas.height);
    ctx.lineTo(coords.x * canvas.width, coords.y * canvas.height);
    ctx.stroke();
    ctx.restore();

    // Throttle socket emission (~40ms)
    const now = Date.now();
    if (now - lastEmitTimeRef.current >= 40) {
      lastEmitTimeRef.current = now;
      if (socket && isConnected) {
        socket.emit('draw:stroke', {
          ...stroke,
          roomCode: roomCode.toUpperCase(),
        });
        socket.emit('draw:cursor', {
          roomCode: roomCode.toUpperCase(),
          x: coords.x,
          y: coords.y,
          isDrawing: true,
          color,
          userName: user?.name,
        });
      }
    }
  };

  /**
   * Stop drawing (PointerUp / TouchEnd)
   */
  const stopDrawing = () => {
    if (!isDrawing || !activeStrokeRef.current) return;

    const stroke = activeStrokeRef.current;
    strokesRef.current.push(stroke);

    // Final emit with complete points
    if (socket && isConnected) {
      socket.emit('draw:stroke', {
        ...stroke,
        roomCode: roomCode.toUpperCase(),
      });
      socket.emit('draw:cursor', {
        roomCode: roomCode.toUpperCase(),
        isDrawing: false,
      });
    }

    activeStrokeRef.current = null;
    setIsDrawing(false);
  };

  /**
   * Trigger undo for current user's last stroke
   */
  const handleUndo = () => {
    if (!socket || !isConnected) return;
    socket.emit('draw:undo', { roomCode: roomCode.toUpperCase() });
  };

  /**
   * Trigger clear board
   */
  const handleClear = () => {
    if (!socket || !isConnected) return;
    if (window.confirm('Are you sure you want to clear the entire whiteboard for everyone in this room?')) {
      socket.emit('draw:clear', { roomCode: roomCode.toUpperCase() });
    }
  };

  /**
   * Export whiteboard canvas as high-resolution PNG image
   */
  const exportAsPng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Create an offscreen canvas with background
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = canvas.width;
    exportCanvas.height = canvas.height;
    const ctx = exportCanvas.getContext('2d');

    // Fill dark background
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

    // Subtle grid dots in background
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    for (let x = 0; x < exportCanvas.width; x += 24) {
      for (let y = 0; y < exportCanvas.height; y += 24) {
        ctx.beginPath();
        ctx.arc(x, y, 1, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Render strokes
    for (const stroke of strokesRef.current) {
      drawStrokeOnCanvas(ctx, stroke, exportCanvas.width, exportCanvas.height);
    }

    // Watermark/Footer
    ctx.font = '11px sans-serif';
    ctx.fillStyle = 'rgba(148, 163, 184, 0.6)';
    ctx.fillText(
      `StudySpace Whiteboard • Room ${roomCode?.toUpperCase()} • ${new Date().toLocaleDateString()}`,
      16,
      exportCanvas.height - 16
    );

    // Download PNG
    const link = document.createElement('a');
    link.download = `whiteboard-${roomCode}-${new Date().toISOString().slice(0, 10)}.png`;
    link.href = exportCanvas.toDataURL('image/png');
    link.click();
  };

  const activeDrawers = Object.values(remoteCursors).filter((c) => c.isDrawing);

  return (
    <div className="flex flex-col h-full w-full glass-panel rounded-3xl border border-slate-800 overflow-hidden shadow-2xl relative select-none">
      {/* Top Floating Whiteboard Toolbar */}
      <div className="p-3 border-b border-slate-800 bg-slate-900/90 backdrop-blur-md flex flex-wrap items-center justify-between gap-3 z-10">
        {/* Left Tools Group: Pen & Eraser */}
        <div className="flex items-center gap-1.5 bg-slate-950/80 p-1 rounded-2xl border border-slate-800">
          <button
            onClick={() => setTool('pen')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
              tool === 'pen'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
            title="Drawing Pen"
          >
            <Pen className="w-4 h-4" />
            <span className="hidden sm:inline">Pen</span>
          </button>

          <button
            onClick={() => setTool('eraser')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
              tool === 'eraser'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
            title="Eraser"
          >
            <Eraser className="w-4 h-4" />
            <span className="hidden sm:inline">Eraser</span>
          </button>
        </div>

        {/* Center: Color Palette (when in Pen mode) & Brush Size */}
        <div className="flex items-center gap-3">
          {tool === 'pen' && (
            <div className="flex items-center gap-1.5 bg-slate-950/80 px-2 py-1.5 rounded-2xl border border-slate-800">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-5 h-5 rounded-full transition-transform cursor-pointer ${
                    color === c ? 'scale-125 ring-2 ring-white ring-offset-2 ring-offset-slate-950' : 'hover:scale-110'
                  }`}
                  style={{ backgroundColor: c }}
                  title={c}
                />
              ))}

              {/* Custom Color Input */}
              <div className="relative flex items-center ml-1">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-6 h-6 rounded-lg border-0 cursor-pointer bg-transparent"
                  title="Pick custom color"
                />
              </div>
            </div>
          )}

          {/* Brush Size Slider */}
          <div className="flex items-center gap-2 bg-slate-950/80 px-3 py-1.5 rounded-2xl border border-slate-800">
            <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
              Size
            </span>
            <input
              type="range"
              min="2"
              max="24"
              value={size}
              onChange={(e) => setSize(Number(e.target.value))}
              className="w-16 sm:w-20 accent-indigo-500 cursor-pointer"
              title={`Brush size: ${size}px`}
            />
            {/* Visual Dot Preview */}
            <div
              className="rounded-full bg-slate-200 shrink-0"
              style={{
                width: `${Math.max(4, Math.min(16, size))}px`,
                height: `${Math.max(4, Math.min(16, size))}px`,
                backgroundColor: tool === 'pen' ? color : '#f43f5e',
              }}
            />
          </div>
        </div>

        {/* Right Tools Group: Export PNG, Undo & Clear */}
        <div className="flex items-center gap-2">
          <button
            onClick={exportAsPng}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/40 text-indigo-200 hover:text-white text-xs font-semibold transition cursor-pointer"
            title="Download whiteboard as PNG"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Export PNG</span>
          </button>

          <button
            onClick={handleUndo}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-950/80 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white text-xs font-semibold transition cursor-pointer"
            title="Undo your last stroke"
          >
            <Undo2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Undo</span>
          </button>

          <button
            onClick={handleClear}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-950/30 hover:bg-rose-950/60 border border-rose-900/50 text-rose-300 hover:text-rose-200 text-xs font-semibold transition cursor-pointer"
            title="Clear the entire board for everyone"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Clear Board</span>
          </button>
        </div>
      </div>

      {/* HTML5 Canvas Area */}
      <div
        ref={containerRef}
        className="flex-1 w-full relative touch-none bg-slate-950 cursor-crosshair overflow-hidden min-h-[460px]"
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        onTouchStart={startDrawing}
        onTouchMove={draw}
        onTouchEnd={stopDrawing}
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 block w-full h-full"
        />

        {/* Subtle grid pattern background */}
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.03]"
          style={{
            backgroundImage: `radial-gradient(rgba(255, 255, 255, 0.8) 1px, transparent 1px)`,
            backgroundSize: '24px 24px',
          }}
        />

        {/* Live Active Drawing Status Banner */}
        {activeDrawers.length > 0 && (
          <div className="absolute top-4 left-4 z-20 flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/90 border border-indigo-500/40 text-indigo-300 text-xs font-medium shadow-xl backdrop-blur-md animate-pulse">
            <PenTool className="w-3.5 h-3.5 text-indigo-400" />
            <span>
              {activeDrawers.map((d) => d.userName || 'Peer').join(', ')}{' '}
              {activeDrawers.length === 1 ? 'is' : 'are'} currently drawing...
            </span>
          </div>
        )}

        {/* Floating Remote Peer Drawing Cursors */}
        {Object.entries(remoteCursors).map(([id, cursor]) => {
          if (!cursor.x || !cursor.y || !cursor.isDrawing) return null;
          return (
            <div
              key={id}
              className="absolute pointer-events-none transition-all duration-75 ease-out z-20"
              style={{
                left: `${cursor.x * 100}%`,
                top: `${cursor.y * 100}%`,
                transform: 'translate(-4px, -24px)',
              }}
            >
              <div className="flex items-center gap-1.5">
                <div
                  className="w-3 h-3 rounded-full border-2 border-white shadow-lg animate-ping"
                  style={{ backgroundColor: cursor.color || '#818cf8' }}
                />
                <span
                  className="px-2 py-0.5 rounded-lg text-[10px] font-bold text-white shadow-lg tracking-wide whitespace-nowrap"
                  style={{ backgroundColor: cursor.color || '#4f46e5' }}
                >
                  {cursor.userName || 'Peer'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
