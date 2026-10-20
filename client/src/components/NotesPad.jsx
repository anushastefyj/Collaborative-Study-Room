import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as Y from 'yjs';
import { jsPDF } from 'jspdf';
import { useSocket } from '../context/SocketContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import {
  FileText,
  Download,
  Copy,
  Check,
  RotateCcw,
  Clock,
  User,
  Sparkles,
  Loader2,
  FileDown,
  CheckCircle2,
  Cloud,
} from 'lucide-react';
import { AiSummaryModal } from './AiSummaryModal.jsx';

export const NotesPad = ({ roomCode }) => {
  const { socket, isConnected } = useSocket();
  const { user } = useAuth();

  const [content, setContent] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState('synced'); // 'synced' | 'saving'
  const [lastEdited, setLastEdited] = useState(null);
  const [typingUsers, setTypingUsers] = useState({});
  const [copied, setCopied] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);

  const textareaRef = useRef(null);
  const ydocRef = useRef(null);
  const ytextRef = useRef(null);
  const isLocalChangeRef = useRef(false);
  const typingTimeoutRef = useRef(null);

  // Initialize Yjs doc on mount
  if (!ydocRef.current) {
    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;
    ytextRef.current = ydoc.getText('notes');
  }

  // 1. Join room notes & setup Yjs event listeners
  useEffect(() => {
    if (!socket || !isConnected || !roomCode) return;

    const cleanCode = roomCode.toUpperCase();
    const ydoc = ydocRef.current;
    const ytext = ytextRef.current;

    // Listen to Yjs local updates to broadcast to peers
    const handleYjsUpdate = (update, origin) => {
      if (origin === 'local' && socket.connected) {
        setSaveStatus('saving');
        socket.emit('notes:update', {
          roomCode: cleanCode,
          update: Array.from(update),
        });

        // Set status back to synced after debounce
        setTimeout(() => {
          setSaveStatus('synced');
          setLastEdited({
            user: { name: 'You' },
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          });
        }, 800);
      }
    };

    ydoc.on('update', handleYjsUpdate);

    // Request initial document state from server
    setIsLoading(true);
    socket.emit('notes:init', { roomCode: cleanCode }, (response) => {
      setIsLoading(false);
      if (response?.stateUpdate) {
        try {
          Y.applyUpdate(ydoc, new Uint8Array(response.stateUpdate), 'remote');
          const currentText = ytext.toString();
          setContent(currentText);
          if (response.lastEditedBy) {
            setLastEdited({
              user: response.lastEditedBy,
              time: response.updatedAt
                ? new Date(response.updatedAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : null,
            });
          }
        } catch (err) {
          console.error('[Notes] Failed to apply initial Yjs state:', err);
        }
      } else if (typeof response?.content === 'string') {
        setContent(response.content);
      }
    });

    // Handle peer incoming Yjs updates
    const handleRemoteUpdate = (payload) => {
      if (!payload?.update) return;

      try {
        const update = new Uint8Array(payload.update);
        const textarea = textareaRef.current;
        const currentSelectionStart = textarea ? textarea.selectionStart : 0;
        const currentSelectionEnd = textarea ? textarea.selectionEnd : 0;

        // Apply update with origin 'remote'
        Y.applyUpdate(ydoc, update, 'remote');
        const newText = ytext.toString();
        setContent(newText);

        // Attempt to preserve cursor position for seamless typing
        if (textarea && document.activeElement === textarea) {
          requestAnimationFrame(() => {
            textarea.setSelectionRange(currentSelectionStart, currentSelectionEnd);
          });
        }

        if (payload.userName) {
          setLastEdited({
            user: { name: payload.userName },
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          });
        }
      } catch (err) {
        console.error('[Notes] Error applying remote update:', err);
      }
    };

    // Handle incoming typing indicators
    const handleRemoteTyping = (payload) => {
      if (!payload?.userId || payload.userId === user?._id) return;

      setTypingUsers((prev) => {
        const next = { ...prev };
        if (payload.isTyping) {
          next[payload.userId] = {
            name: payload.userName || 'Peer',
            timestamp: Date.now(),
          };
        } else {
          delete next[payload.userId];
        }
        return next;
      });
    };

    socket.on('notes:update', handleRemoteUpdate);
    socket.on('notes:typing', handleRemoteTyping);

    // Auto-clean stale typing indicators every 2 seconds
    const typingInterval = setInterval(() => {
      const now = Date.now();
      setTypingUsers((prev) => {
        let changed = false;
        const next = {};
        for (const [id, data] of Object.entries(prev)) {
          if (now - data.timestamp < 3500) {
            next[id] = data;
          } else {
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 2000);

    return () => {
      ydoc.off('update', handleYjsUpdate);
      socket.off('notes:update', handleRemoteUpdate);
      socket.off('notes:typing', handleRemoteTyping);
      clearInterval(typingInterval);
    };
  }, [socket, isConnected, roomCode, user]);

  /**
   * Diff-based binding from textarea string edits to Yjs CRDT operations
   */
  const handleContentChange = (e) => {
    const newText = e.target.value;
    const oldText = content;
    const ytext = ytextRef.current;
    const ydoc = ydocRef.current;

    setContent(newText);

    // Compute minimal diff to apply to Y.Text
    let start = 0;
    while (start < oldText.length && start < newText.length && oldText[start] === newText[start]) {
      start++;
    }

    let oldEnd = oldText.length;
    let newEnd = newText.length;
    while (oldEnd > start && newEnd > start && oldText[oldEnd - 1] === newText[newEnd - 1]) {
      oldEnd--;
      newEnd--;
    }

    const deleteCount = oldEnd - start;
    const insertText = newText.slice(start, newEnd);

    // Execute in Yjs transaction with 'local' origin
    ydoc.transact(() => {
      if (deleteCount > 0) {
        ytext.delete(start, deleteCount);
      }
      if (insertText.length > 0) {
        ytext.insert(start, insertText);
      }
    }, 'local');

    // Emit typing indicator with debounce
    if (socket && isConnected) {
      socket.emit('notes:typing', { roomCode: roomCode.toUpperCase(), isTyping: true });

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      typingTimeoutRef.current = setTimeout(() => {
        socket.emit('notes:typing', { roomCode: roomCode.toUpperCase(), isTyping: false });
      }, 1500);
    }
  };

  /**
   * Export notes as plain text file (.txt)
   */
  const exportAsTxt = () => {
    const element = document.createElement('a');
    const file = new Blob([content], { type: 'text/plain;charset=utf-8' });
    element.href = URL.createObjectURL(file);
    element.download = `notes-${roomCode}-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    setShowExportMenu(false);
  };

  /**
   * Export notes as styled PDF
   */
  const exportAsPdf = () => {
    const doc = new jsPDF();
    const cleanCode = roomCode ? roomCode.toUpperCase() : 'STUDY';
    const dateStr = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    // Header styling
    doc.setFillColor(15, 23, 42); // slate-900
    doc.rect(0, 0, 210, 30, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('StudySpace — Collaborative Study Room Notes', 14, 18);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text(`Room Code: ${cleanCode}   •   Exported: ${dateStr}`, 14, 25);

    // Notes Body
    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);

    const splitText = doc.splitTextToSize(content || '(No notes recorded yet.)', 180);
    doc.text(splitText, 14, 42);

    // Footer
    const pageHeight = doc.internal.pageSize.height;
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text('Generated with Collaborative Study Room • Real-time Yjs CRDT Notes', 14, pageHeight - 10);

    doc.save(`study-notes-${cleanCode}-${new Date().toISOString().slice(0, 10)}.pdf`);
    setShowExportMenu(false);
  };

  /**
   * Copy note content to clipboard
   */
  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const charCount = content.length;
  const activeTypers = Object.values(typingUsers);

  return (
    <div className="flex flex-col h-full w-full glass-panel rounded-3xl border border-slate-800 overflow-hidden shadow-2xl relative select-none">
      {/* Top Toolbar */}
      <div className="p-3 border-b border-slate-800 bg-slate-900/90 backdrop-blur-md flex flex-wrap items-center justify-between gap-3 z-10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 flex items-center justify-center">
            <FileText className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-bold text-white text-sm leading-tight flex items-center gap-2">
              Collaborative Notes
              <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-indigo-500/10 border border-indigo-500/30 text-indigo-300">
                CRDT Sync
              </span>
            </h3>
            <div className="flex items-center gap-2 text-[10px] text-slate-400">
              {saveStatus === 'saving' ? (
                <span className="flex items-center gap-1 text-amber-400">
                  <Cloud className="w-3 h-3 animate-pulse" /> Saving changes...
                </span>
              ) : (
                <span className="flex items-center gap-1 text-emerald-400">
                  <CheckCircle2 className="w-3 h-3" /> All changes saved
                </span>
              )}
              {lastEdited?.user?.name && (
                <span className="hidden sm:inline text-slate-500">
                  • Last edit by {lastEdited.user.name} {lastEdited.time ? `at ${lastEdited.time}` : ''}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-950/80 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white text-xs font-semibold transition cursor-pointer"
            title="Copy notes to clipboard"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{copied ? 'Copied' : 'Copy'}</span>
          </button>

          {/* AI Summary & Flashcards Button */}
          <button
            onClick={() => setShowAiModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-purple-600/30 to-indigo-600/30 hover:from-purple-600/50 hover:to-indigo-600/50 border border-purple-500/40 text-purple-300 hover:text-white text-xs font-semibold transition cursor-pointer shadow-sm"
            title="Generate AI Summary & Flashcards"
          >
            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
            <span className="hidden sm:inline">AI Summary</span>
          </button>

          {/* Export Dropdown Menu */}
          <div className="relative">
            <button
              onClick={() => setShowExportMenu((prev) => !prev)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition shadow-md shadow-indigo-600/30 cursor-pointer"
              title="Export Notes"
            >
              <FileDown className="w-3.5 h-3.5" />
              <span>Export</span>
            </button>

            {showExportMenu && (
              <>
                <div
                  className="fixed inset-0 z-20"
                  onClick={() => setShowExportMenu(false)}
                />
                <div className="absolute right-0 mt-2 w-48 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl py-1.5 z-30 animate-in fade-in zoom-in-95">
                  <button
                    onClick={exportAsPdf}
                    className="w-full text-left px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-indigo-600/20 hover:text-indigo-300 flex items-center gap-2 transition"
                  >
                    <Download className="w-3.5 h-3.5 text-rose-400" />
                    <span>Download as PDF (.pdf)</span>
                  </button>
                  <button
                    onClick={exportAsTxt}
                    className="w-full text-left px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-indigo-600/20 hover:text-indigo-300 flex items-center gap-2 transition"
                  >
                    <Download className="w-3.5 h-3.5 text-sky-400" />
                    <span>Download as Text (.txt)</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Editor Main Canvas */}
      <div className="flex-1 relative flex flex-col p-4 bg-slate-950/60">
        {isLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mb-2" />
            <p className="text-xs">Loading shared notes...</p>
          </div>
        ) : (
          <textarea
            ref={textareaRef}
            value={content}
            onChange={handleContentChange}
            placeholder="Write collaborative notes, code snippets, meeting summaries, or study tasks here... Everyone in this room sees edits in real time without overwriting conflicts."
            className="flex-1 w-full bg-transparent text-slate-100 placeholder:text-slate-600 resize-none focus:outline-none font-mono text-sm leading-relaxed p-2"
            spellCheck="false"
          />
        )}

        {/* Bottom Status Bar: Typing Indicator & Word Count */}
        <div className="pt-2 mt-auto border-t border-slate-900 flex items-center justify-between text-[11px] text-slate-500">
          <div className="flex items-center gap-2 min-h-[20px]">
            {activeTypers.length > 0 && (
              <div className="flex items-center gap-1.5 text-indigo-400 animate-pulse font-medium">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                </span>
                <span>
                  {activeTypers.length === 1
                    ? `${activeTypers[0].name} is typing...`
                    : `${activeTypers.map((t) => t.name).join(', ')} are typing...`}
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <span>{wordCount} words</span>
            <span>•</span>
            <span>{charCount} characters</span>
          </div>
        </div>
      </div>

      {/* AI Notes Summary & Flashcards Modal */}
      <AiSummaryModal
        isOpen={showAiModal}
        onClose={() => setShowAiModal(false)}
        roomCode={roomCode}
      />
    </div>
  );
};
