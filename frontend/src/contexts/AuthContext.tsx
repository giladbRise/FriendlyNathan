import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';

interface User {
  id: string;
  email: string;
  role: string;
  firstName?: string;
  lastName?: string;
  isActive: boolean;
  createdAt: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => void;
  updateUser: (updatedUser: User) => void;
  refreshToken: () => Promise<void>;
  isAuthenticated: boolean;
  isLoading: boolean;
}

interface RegisterData {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Token refresh interval: 20 hours (refresh before 24-hour expiry)
const TOKEN_REFRESH_INTERVAL = 20 * 60 * 60 * 1000;

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [isLoading, setIsLoading] = useState(true);
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  // Refresh token function
  const refreshTokenFn = useCallback(async () => {
    const currentToken = localStorage.getItem('token');
    if (!currentToken) return;

    try {
      const response = await axios.post(
        `${API_URL}/api/auth/refresh`,
        {},
        {
          headers: { Authorization: `Bearer ${currentToken}` },
        }
      );
      const { token: newToken } = response.data;
      setToken(newToken);
      localStorage.setItem('token', newToken);
      console.log('Token refreshed successfully');
    } catch (error) {
      console.error('Token refresh failed:', error);
      // Don't log out on refresh failure - let the natural expiration handle it
    }
  }, [API_URL]);

  // Setup token refresh interval
  const setupRefreshInterval = useCallback(() => {
    // Clear any existing interval
    if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current);
    }

    // Set up new interval to refresh token periodically
    refreshIntervalRef.current = setInterval(() => {
      refreshTokenFn();
    }, TOKEN_REFRESH_INTERVAL);
  }, [refreshTokenFn]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const initAuth = async () => {
      const storedToken = localStorage.getItem('token');
      if (storedToken) {
        try {
          const response = await axios.get(`${API_URL}/api/auth/me`, {
            headers: { Authorization: `Bearer ${storedToken}` },
          });
          setUser(response.data.user);
          setToken(storedToken);
          // Setup automatic token refresh
          setupRefreshInterval();
        } catch (error) {
          console.error('Token validation failed:', error);
          localStorage.removeItem('token');
          setToken(null);
          setUser(null);
        }
      }
      setIsLoading(false);
    };

    initAuth();
  }, [API_URL, setupRefreshInterval]);

  const register = async (data: RegisterData) => {
    try {
      const response = await axios.post(`${API_URL}/api/auth/register`, data);
      const { user: newUser, token: newToken } = response.data;
      setUser(newUser);
      setToken(newToken);
      localStorage.setItem('token', newToken);
      // Setup automatic token refresh
      setupRefreshInterval();
    } catch (error: any) {
      if (error.response?.data?.details) {
        throw new Error(error.response.data.details.map((d: any) => d.message).join(', '));
      }
      throw new Error(error.response?.data?.error || 'Registration failed');
    }
  };

  const login = async (email: string, password: string) => {
    try {
      const response = await axios.post(`${API_URL}/api/auth/login`, {
        email,
        password,
      });
      const { user: loggedInUser, token: newToken } = response.data;
      setUser(loggedInUser);
      setToken(newToken);
      localStorage.setItem('token', newToken);
      // Setup automatic token refresh
      setupRefreshInterval();
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Login failed');
    }
  };

  const logout = () => {
    // Clear refresh interval
    if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current);
      refreshIntervalRef.current = null;
    }
    setUser(null);
    setToken(null);
    localStorage.removeItem('token');
  };

  const updateUser = (updatedUser: User) => {
    setUser(updatedUser);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        login,
        register,
        logout,
        updateUser,
        refreshToken: refreshTokenFn,
        isAuthenticated: !!user,
        isLoading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
