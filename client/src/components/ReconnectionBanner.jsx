import React from 'react';
import { useSocket } from '../context/SocketContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { WifiOff, RefreshCw } from 'lucide-react';

export const ReconnectionBanner = () => {
  const { isConnected } = useSocket();
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated || isConnected) {
    return null;
  }

  return (
    <div className="bg-amber-500/90 text-amber-950 px-4 py-2 text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 shadow-lg backdrop-blur-md sticky top-0 z-50 animate-pulse">
      <WifiOff className="w-4 h-4 shrink-0" />
      <span>Connection lost to live study gateway. Reconnecting automatically...</span>
      <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
    </div>
  );
};
