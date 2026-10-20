import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSocket } from '../context/SocketContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import {
  MessageSquare,
  Send,
  X,
  Smile,
  AlertCircle,
  Loader2,
  ChevronRight,
} from 'lucide-react';

export const ChatPanel = ({
  roomCode,
  isOpen,
  onClose,
  onUnreadChange,
  className = '',
}) => {
  const { socket, isConnected } = useSocket();
  const { user } = useAuth();

  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isTypingMap, setIsTypingMap] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [errorBanner, setErrorBanner] = useState('');

  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;

  // Auto scroll to bottom
  const scrollToBottom = useCallback((smooth = true) => {
    messagesEndRef.current?.scrollIntoView({
      behavior: smooth ? 'smooth' : 'auto',
    });
  }, []);

  // Request chat history and register socket events
  useEffect(() => {
    if (!socket || !isConnected || !roomCode) return;

    const cleanCode = roomCode.toUpperCase();
    setIsLoading(true);

    // 1. Request chat history (last 50 messages)
    socket.emit('chat:history', { roomCode: cleanCode }, (res) => {
      setIsLoading(false);
      if (res?.messages) {
        setMessages(res.messages);
        setTimeout(() => scrollToBottom(false), 50);
      }
    });

    // 2. Listen for chat:history broadcast
    const handleHistory = (payload) => {
      if (payload?.roomCode?.toUpperCase() !== cleanCode) return;
      if (Array.isArray(payload.messages)) {
        setMessages(payload.messages);
        setIsLoading(false);
        setTimeout(() => scrollToBottom(false), 50);
      }
    };

    // 3. Listen for incoming message
    const handleNewMessage = (message) => {
      if (message?.roomCode?.toUpperCase() !== cleanCode) return;

      setMessages((prev) => {
        // Prevent duplicates
        if (prev.some((m) => m._id === message._id)) return prev;
        return [...prev, message];
      });

      // Clear typing indicator for that user
      setIsTypingMap((prev) => {
        const next = { ...prev };
        delete next[message.userId];
        return next;
      });

      // Increment unread count if drawer is closed
      if (!isOpenRef.current && onUnreadChange) {
        onUnreadChange((count) => count + 1);
      }

      setTimeout(() => scrollToBottom(true), 50);
    };

    // 4. Listen for typing events
    const handleTyping = (payload) => {
      if (payload?.roomCode?.toUpperCase() !== cleanCode) return;
      if (!payload.userId || payload.userId === user?._id) return;

      setIsTypingMap((prev) => {
        const next = { ...prev };
        if (payload.isTyping) {
          next[payload.userId] = payload.name;
        } else {
          delete next[payload.userId];
        }
        return next;
      });
    };

    // 5. Listen for socket-level rate limit or validation errors
    const handleError = (payload) => {
      if (payload?.message) {
        setErrorBanner(payload.message);
        setTimeout(() => setErrorBanner(''), 4000);
      }
    };

    socket.on('chat:history', handleHistory);
    socket.on('chat:message', handleNewMessage);
    socket.on('chat:typing', handleTyping);
    socket.on('error', handleError);

    return () => {
      socket.off('chat:history', handleHistory);
      socket.off('chat:message', handleNewMessage);
      socket.off('chat:typing', handleTyping);
      socket.off('error', handleError);
    };
  }, [socket, isConnected, roomCode, user, scrollToBottom, onUnreadChange]);

  // Handle typing debounce
  const handleInputChange = (e) => {
    const text = e.target.value;
    if (text.length > 500) return;
    setInputText(text);

    if (!socket || !isConnected || !roomCode) return;

    // Emit typing true
    socket.emit('chat:typing', {
      roomCode: roomCode.toUpperCase(),
      isTyping: true,
    });

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('chat:typing', {
        roomCode: roomCode.toUpperCase(),
        isTyping: false,
      });
    }, 1500);
  };

  // Send message handler
  const handleSendMessage = (e) => {
    e?.preventDefault();
    const cleanText = inputText.trim();
    if (!cleanText || !socket || !isConnected || !roomCode) return;

    // Clear typing timeout immediately
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    socket.emit('chat:typing', {
      roomCode: roomCode.toUpperCase(),
      isTyping: false,
    });

    socket.emit(
      'chat:message',
      { roomCode: roomCode.toUpperCase(), text: cleanText },
      (res) => {
        if (res?.error) {
          setErrorBanner(res.error);
          setTimeout(() => setErrorBanner(''), 4000);
        }
      }
    );

    setInputText('');
  };

  // Format timestamp helper
  const formatTime = (isoString) => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const typingNames = Object.values(isTypingMap);

  return (
    <div
      className={`flex flex-col h-full bg-slate-900 border-l border-slate-800 shadow-2xl transition-all duration-300 ${className}`}
    >
      {/* Header */}
      <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 flex items-center justify-center">
            <MessageSquare className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-bold text-white text-sm leading-tight flex items-center gap-2">
              Room Chat
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            </h3>
            <p className="text-[10px] text-slate-400">Live peer messaging</p>
          </div>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            title="Close Chat"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Error alert banner */}
      {errorBanner && (
        <div className="bg-rose-500/10 border-b border-rose-500/30 px-3 py-2 text-rose-300 text-xs flex items-center gap-2 animate-in fade-in">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{errorBanner}</span>
        </div>
      )}

      {/* Message List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-950/40">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-48 text-slate-500 gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
            <span className="text-xs">Loading message history...</span>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-slate-500 text-center px-4">
            <div className="w-10 h-10 rounded-2xl bg-slate-800/60 flex items-center justify-center mb-2 text-slate-400">
              <MessageSquare className="w-5 h-5" />
            </div>
            <p className="text-xs font-semibold text-slate-300">No messages yet</p>
            <p className="text-[11px] text-slate-500 mt-1">
              Say hello or share ideas with your study partners!
            </p>
          </div>
        ) : (
          messages.map((msg, index) => {
            const isSelf = msg.userId === user?._id;
            const initial = msg.name ? msg.name.charAt(0).toUpperCase() : '?';

            return (
              <div
                key={msg._id || index}
                className={`flex gap-2.5 ${isSelf ? 'justify-end' : 'justify-start'}`}
              >
                {!isSelf && (
                  <div
                    title={msg.name}
                    className="w-7 h-7 rounded-lg bg-gradient-to-tr from-indigo-600 to-violet-600 text-white font-bold text-[11px] flex items-center justify-center shrink-0 shadow-md self-end mb-1"
                  >
                    {initial}
                  </div>
                )}

                <div
                  className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 shadow-md ${
                    isSelf
                      ? 'bg-indigo-600 text-white rounded-br-xs'
                      : 'bg-slate-800/90 text-slate-100 border border-slate-700/60 rounded-bl-xs'
                  }`}
                >
                  {!isSelf && (
                    <div className="text-[10px] font-bold text-indigo-300 mb-0.5">
                      {msg.name}
                    </div>
                  )}

                  <p className="text-xs leading-relaxed break-words whitespace-pre-wrap select-text">
                    {msg.text}
                  </p>

                  <div
                    className={`text-[9px] mt-1 text-right ${
                      isSelf ? 'text-indigo-200' : 'text-slate-400'
                    }`}
                  >
                    {formatTime(msg.createdAt)}
                  </div>
                </div>
              </div>
            );
          })
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Typing Indicator */}
      <div className="px-4 py-1.5 min-h-[24px] bg-slate-950/70 border-t border-slate-900/50 flex items-center text-[10px] text-indigo-400">
        {typingNames.length > 0 && (
          <div className="flex items-center gap-1.5 animate-pulse">
            <span className="flex h-1.5 w-1.5 rounded-full bg-indigo-400" />
            <span>
              {typingNames.length === 1
                ? `${typingNames[0]} is typing...`
                : `${typingNames.join(', ')} are typing...`}
            </span>
          </div>
        )}
      </div>

      {/* Input Box */}
      <form
        onSubmit={handleSendMessage}
        className="p-3 bg-slate-950/90 border-t border-slate-800 flex items-center gap-2"
      >
        <div className="relative flex-1">
          <input
            type="text"
            value={inputText}
            onChange={handleInputChange}
            placeholder="Type a message (max 500 chars)..."
            maxLength={500}
            className="w-full bg-slate-900/90 border border-slate-800 focus:border-indigo-500 rounded-xl px-3.5 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none transition pr-12"
          />
          <span className="absolute right-2.5 top-2.5 text-[9px] text-slate-500">
            {500 - inputText.length}
          </span>
        </div>

        <button
          type="submit"
          disabled={!inputText.trim()}
          className="p-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:hover:bg-indigo-600 text-white transition shadow-md shadow-indigo-600/30 cursor-pointer"
          title="Send Message"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};
