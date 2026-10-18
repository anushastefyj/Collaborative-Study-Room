import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import { SocketProvider } from './context/SocketContext.jsx';
import { ProtectedRoute } from './components/ProtectedRoute.jsx';
import { Navbar } from './components/Navbar.jsx';
import { LoginPage } from './pages/LoginPage.jsx';
import { RegisterPage } from './pages/RegisterPage.jsx';
import { DashboardPage } from './pages/DashboardPage.jsx';
import { RoomPage } from './pages/RoomPage.jsx';

export const App = () => {
  return (
    <AuthProvider>
      <SocketProvider>
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
          <Routes>
            {/* Public Routes */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />

            {/* Protected Routes */}
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Navbar />
                  <main className="flex-1">
                    <DashboardPage />
                  </main>
                </ProtectedRoute>
              }
            />
            <Route
              path="/room/:code"
              element={
                <ProtectedRoute>
                  <Navbar />
                  <main className="flex-1">
                    <RoomPage />
                  </main>
                </ProtectedRoute>
              }
            />

            {/* Default fallback */}
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </div>
      </SocketProvider>
    </AuthProvider>
  );
};

export default App;
