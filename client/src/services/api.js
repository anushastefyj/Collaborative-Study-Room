const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

/**
 * Universal fetch wrapper with automatic JWT token injection
 * @param {string} endpoint - API route (e.g. '/api/rooms')
 * @param {RequestInit} options - Standard fetch options
 */
export const fetchWithAuth = async (endpoint, options = {}) => {
  const token = localStorage.getItem('study_token');

  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.message || `Request failed with status ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
};

// Auth API services
export const authApi = {
  register: (name, email, password) =>
    fetchWithAuth('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    }),

  login: (email, password) =>
    fetchWithAuth('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  getMe: () => fetchWithAuth('/api/auth/me', { method: 'GET' }),
};

// Room API services
export const roomApi = {
  createRoom: (name) =>
    fetchWithAuth('/api/rooms', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  getRoomByCode: (code) =>
    fetchWithAuth(`/api/rooms/${code.toUpperCase()}`, {
      method: 'GET',
    }),

  getMyRooms: () =>
    fetchWithAuth('/api/rooms/mine', {
      method: 'GET',
    }),
};
