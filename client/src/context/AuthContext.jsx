import React, { createContext, useContext, useState, useEffect } from 'react';
import { authApi } from '../services/api.js';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('study_token') || null);
  const [loading, setLoading] = useState(true);

  // Initialize auth state by verifying token with backend /api/auth/me
  useEffect(() => {
    const initializeAuth = async () => {
      const storedToken = localStorage.getItem('study_token');
      if (!storedToken) {
        setLoading(false);
        return;
      }

      try {
        const data = await authApi.getMe();
        setUser(data.user);
        setToken(storedToken);
      } catch (error) {
        console.error('[AuthContext] Session expired or invalid token:', error.message);
        localStorage.removeItem('study_token');
        setUser(null);
        setToken(null);
      } finally {
        setLoading(false);
      }
    };

    initializeAuth();
  }, []);

  const login = async (email, password) => {
    const data = await authApi.login(email, password);
    localStorage.setItem('study_token', data.token);
    setToken(data.token);
    setUser(data.user);
    return data;
  };

  const register = async (name, email, password) => {
    const data = await authApi.register(name, email, password);
    localStorage.setItem('study_token', data.token);
    setToken(data.token);
    setUser(data.user);
    return data;
  };

  const logout = () => {
    localStorage.removeItem('study_token');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        isAuthenticated: !!user,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
