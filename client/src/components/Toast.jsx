import React from 'react';
import { UserPlus, UserMinus, Info, CheckCircle2, AlertCircle, X } from 'lucide-react';

export const Toast = ({ toast, onClose }) => {
  if (!toast) return null;

  const getIcon = () => {
    switch (toast.type) {
      case 'join':
        return <UserPlus className="w-5 h-5 text-emerald-400 shrink-0" />;
      case 'leave':
        return <UserMinus className="w-5 h-5 text-amber-400 shrink-0" />;
      case 'success':
        return <CheckCircle2 className="w-5 h-5 text-indigo-400 shrink-0" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />;
      default:
        return <Info className="w-5 h-5 text-sky-400 shrink-0" />;
    }
  };

  const getBorderColor = () => {
    switch (toast.type) {
      case 'join':
        return 'border-emerald-500/30 bg-emerald-950/40 text-emerald-200';
      case 'leave':
        return 'border-amber-500/30 bg-amber-950/40 text-amber-200';
      case 'error':
        return 'border-rose-500/30 bg-rose-950/40 text-rose-200';
      default:
        return 'border-indigo-500/30 bg-indigo-950/40 text-indigo-200';
    }
  };

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-2xl border backdrop-blur-md shadow-2xl transition-all duration-300 animate-in fade-in slide-in-from-top-4 ${getBorderColor()}`}
    >
      {getIcon()}
      <div className="flex-1 text-sm font-medium pr-2">{toast.message}</div>
      {onClose && (
        <button
          onClick={() => onClose(toast.id)}
          className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};
