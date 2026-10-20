import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  X,
  Copy,
  Check,
  Download,
  RotateCw,
  ChevronLeft,
  ChevronRight,
  Shuffle,
  AlertCircle,
  Loader2,
  FileText,
  Layers,
  HelpCircle,
  Lightbulb,
} from 'lucide-react';
import { aiApi } from '../services/api.js';

export const AiSummaryModal = ({ isOpen, onClose, roomCode }) => {
  const [activeTab, setActiveTab] = useState('summary'); // 'summary' | 'flashcards'
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [aiData, setAiData] = useState(null);

  // Flashcards state
  const [flashcards, setFlashcards] = useState([]);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [copiedSummary, setCopiedSummary] = useState(false);

  // Fetch or generate AI summary when modal opens
  useEffect(() => {
    if (!isOpen || !roomCode) return;

    // Only auto-fetch if we haven't loaded data yet for this session
    if (!aiData && !isLoading && !error) {
      handleGenerateSummary();
    }
  }, [isOpen, roomCode]);

  const handleGenerateSummary = async () => {
    try {
      setIsLoading(true);
      setError('');
      setIsFlipped(false);
      setCurrentCardIndex(0);

      const res = await aiApi.summarizeNotes(roomCode);
      if (res?.success) {
        setAiData(res);
        setFlashcards(res.flashcards || []);
      } else {
        setError(res?.message || 'Failed to generate AI summary.');
      }
    } catch (err) {
      setError(
        err.message || 'An unexpected error occurred while communicating with the AI service.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Flip card
  const handleFlipCard = () => {
    setIsFlipped((prev) => !prev);
  };

  // Prev / Next card
  const handlePrevCard = () => {
    setIsFlipped(false);
    setCurrentCardIndex((prev) => (prev > 0 ? prev - 1 : flashcards.length - 1));
  };

  const handleNextCard = () => {
    setIsFlipped(false);
    setCurrentCardIndex((prev) => (prev < flashcards.length - 1 ? prev + 1 : 0));
  };

  // Shuffle flashcards
  const handleShuffle = () => {
    setIsFlipped(false);
    const shuffled = [...flashcards].sort(() => Math.random() - 0.5);
    setFlashcards(shuffled);
    setCurrentCardIndex(0);
  };

  // Copy summary to clipboard
  const handleCopySummary = () => {
    if (!aiData) return;
    const textToCopy = `=== STUDY SUMMARY ===\n\n${aiData.summary}\n\n=== KEY POINTS ===\n${aiData.keyPoints
      .map((p, idx) => `${idx + 1}. ${p}`)
      .join('\n')}`;

    navigator.clipboard.writeText(textToCopy);
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 2000);
  };

  // Export flashcards as JSON
  const handleExportJson = () => {
    if (!flashcards.length) return;
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(flashcards, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `${roomCode}_study_flashcards.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Export flashcards as CSV
  const handleExportCsv = () => {
    if (!flashcards.length) return;
    const csvRows = ['"Question","Answer"'];
    flashcards.forEach((card) => {
      const q = card.question.replace(/"/g, '""');
      const a = card.answer.replace(/"/g, '""');
      csvRows.push(`"${q}","${a}"`);
    });
    const csvContent = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvRows.join('\n'));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', csvContent);
    downloadAnchor.setAttribute('download', `${roomCode}_study_flashcards.csv`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  if (!isOpen) return null;

  const currentCard = flashcards[currentCardIndex];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in">
      {/* Modal Container */}
      <div className="relative w-full max-w-3xl max-h-[90vh] bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 to-purple-600 text-white flex items-center justify-center shadow-lg shadow-indigo-600/30">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                AI Notes Summary & Study Flashcards
                <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-purple-500/10 border border-purple-500/30 text-purple-300">
                  Claude 3.5 Haiku
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Synthesized from your collaborative notes
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selection Bar */}
        {aiData && !isLoading && (
          <div className="flex items-center justify-between px-6 py-2 border-b border-slate-800 bg-slate-950/40">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveTab('summary')}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                  activeTab === 'summary'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Summary & Key Points</span>
              </button>

              <button
                onClick={() => setActiveTab('flashcards')}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                  activeTab === 'flashcards'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Interactive Flashcards ({flashcards.length})</span>
              </button>
            </div>

            <button
              onClick={handleGenerateSummary}
              disabled={isLoading}
              title="Regenerate summary with latest notes"
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-indigo-400 transition cursor-pointer"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        )}

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
              <div className="relative">
                <div className="w-16 h-16 rounded-3xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                  <Sparkles className="w-8 h-8 animate-pulse" />
                </div>
                <Loader2 className="w-20 h-20 animate-spin text-purple-500 absolute -top-2 -left-2 opacity-50" />
              </div>
              <div>
                <h3 className="text-white font-bold text-sm">
                  Analyzing collaborative notes...
                </h3>
                <p className="text-slate-400 text-xs mt-1 max-w-sm mx-auto">
                  Claude is extracting essential takeaways, synthesizing key concepts, and drafting active recall study flashcards.
                </p>
              </div>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-16 text-center max-w-md mx-auto space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center justify-center">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-white font-bold text-sm">AI Summary Notice</h3>
                <p className="text-slate-400 text-xs mt-1.5 leading-relaxed">
                  {error}
                </p>
              </div>
              <button
                onClick={handleGenerateSummary}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition shadow-md shadow-indigo-600/30 cursor-pointer"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>Try Again</span>
              </button>
            </div>
          ) : aiData && activeTab === 'summary' ? (
            <div className="space-y-6">
              {/* Summary Section */}
              <div className="p-5 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Executive Summary
                  </h4>
                  <button
                    onClick={handleCopySummary}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white text-xs font-semibold transition cursor-pointer"
                  >
                    {copiedSummary ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>{copiedSummary ? 'Copied' : 'Copy All'}</span>
                  </button>
                </div>

                <p className="text-slate-200 text-sm leading-relaxed whitespace-pre-wrap select-text">
                  {aiData.summary}
                </p>
              </div>

              {/* Key Takeaways Section */}
              <div className="p-5 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-purple-400 flex items-center gap-2">
                  <Lightbulb className="w-4 h-4" />
                  Key Points & Concepts
                </h4>

                <ul className="space-y-2.5">
                  {aiData.keyPoints.map((point, index) => (
                    <li
                      key={index}
                      className="flex items-start gap-2.5 text-slate-300 text-xs leading-relaxed"
                    >
                      <span className="w-5 h-5 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                        {index + 1}
                      </span>
                      <span className="select-text">{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : aiData && activeTab === 'flashcards' && flashcards.length > 0 ? (
            <div className="flex flex-col items-center justify-between min-h-[380px] space-y-6">
              {/* Flashcard Header Controls */}
              <div className="w-full flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-indigo-400 font-bold">
                    Card {currentCardIndex + 1} of {flashcards.length}
                  </span>
                  <button
                    onClick={handleShuffle}
                    title="Shuffle card order"
                    className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
                  >
                    <Shuffle className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Export Dropdown / Buttons */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleExportJson}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-300 text-xs font-medium transition cursor-pointer"
                    title="Export flashcards as JSON"
                  >
                    <Download className="w-3 h-3 text-sky-400" />
                    <span>JSON</span>
                  </button>

                  <button
                    onClick={handleExportCsv}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-300 text-xs font-medium transition cursor-pointer"
                    title="Export flashcards as CSV"
                  >
                    <Download className="w-3 h-3 text-emerald-400" />
                    <span>CSV</span>
                  </button>
                </div>
              </div>

              {/* 3D Flip Card */}
              <div
                onClick={handleFlipCard}
                className="w-full max-w-lg min-h-[240px] rounded-3xl p-8 border cursor-pointer transition-all duration-300 select-none flex flex-col justify-between shadow-2xl relative group bg-gradient-to-b from-slate-900 to-slate-950 hover:border-indigo-500/50"
                style={{
                  borderColor: isFlipped ? 'rgba(168, 85, 247, 0.4)' : 'rgba(99, 102, 241, 0.3)',
                }}
              >
                {/* Badge top */}
                <div className="flex items-center justify-between mb-4">
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${
                      isFlipped
                        ? 'bg-purple-500/10 border-purple-500/30 text-purple-300'
                        : 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300'
                    }`}
                  >
                    {isFlipped ? '💡 Answer' : '❓ Question'}
                  </span>

                  <span className="text-[10px] text-slate-500 flex items-center gap-1">
                    <RotateCw className="w-3 h-3 group-hover:rotate-180 transition-transform duration-500" />
                    Click to flip
                  </span>
                </div>

                {/* Card text */}
                <div className="flex-1 flex items-center justify-center text-center my-4">
                  <p
                    className={`text-base sm:text-lg font-medium leading-relaxed ${
                      isFlipped ? 'text-purple-100 font-normal' : 'text-white font-bold'
                    }`}
                  >
                    {isFlipped ? currentCard.answer : currentCard.question}
                  </p>
                </div>

                {/* Footer hint */}
                <div className="text-center text-[10px] text-slate-500">
                  {isFlipped ? 'Click card to view question' : 'Click card to reveal answer'}
                </div>
              </div>

              {/* Navigation Arrows */}
              <div className="flex items-center justify-center gap-4">
                <button
                  onClick={handlePrevCard}
                  className="p-3 rounded-2xl bg-slate-950 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 transition cursor-pointer"
                  title="Previous card"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>

                <button
                  onClick={handleFlipCard}
                  className="px-6 py-2.5 rounded-2xl bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 font-semibold text-xs transition cursor-pointer flex items-center gap-2"
                >
                  <RotateCw className="w-4 h-4" />
                  <span>{isFlipped ? 'Show Question' : 'Reveal Answer'}</span>
                </button>

                <button
                  onClick={handleNextCard}
                  className="p-3 rounded-2xl bg-slate-950 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 transition cursor-pointer"
                  title="Next card"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
