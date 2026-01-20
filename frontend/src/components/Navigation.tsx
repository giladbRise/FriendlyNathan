import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface NavItem {
  label: string;
  path: string;
  adminOnly?: boolean;
}

const Navigation: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    setUserMenuOpen(false);
    logout();
    navigate('/login');
  };

  const handleProfileClick = () => {
    setUserMenuOpen(false);
    navigate('/profile');
  };

  const navItems: NavItem[] = [
    { label: 'Dashboard', path: '/dashboard' },
    { label: 'Create Workflow', path: '/workflow/create' },
    { label: 'History', path: '/workflow/history' },
    { label: 'Instances', path: '/instances' },
    { label: 'Admin', path: '/admin', adminOnly: true },
  ];

  const isActive = (path: string): boolean => {
    // Exact match for most paths
    if (location.pathname === path) return true;
    // Check if current path starts with the nav path (for nested routes like /admin/*)
    if (path !== '/dashboard' && location.pathname.startsWith(path)) return true;
    return false;
  };

  const getUserInitials = () => {
    if (user?.firstName && user?.lastName) {
      return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
    }
    return user?.email?.[0]?.toUpperCase() || 'U';
  };

  return (
    <nav className="bg-white shadow-sm border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              RISE n8n Workflow Builder
            </h1>
          </div>
          <div className="flex items-center gap-4">
            {navItems.map((item) => {
              // Skip admin items for non-admin users
              if (item.adminOnly && user?.role !== 'admin') return null;

              const active = isActive(item.path);
              return (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                    active
                      ? 'text-blue-700 bg-blue-100 hover:bg-blue-200'
                      : 'text-gray-700 bg-gray-100 hover:bg-gray-200'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}

            {/* User Menu Dropdown */}
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                aria-expanded={userMenuOpen}
                aria-haspopup="true"
              >
                <span className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-medium">
                  {getUserInitials()}
                </span>
                <span className="hidden sm:block max-w-[120px] truncate">
                  {user?.firstName || user?.email}
                </span>
                <svg
                  className={`w-4 h-4 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Dropdown Menu */}
              {userMenuOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg py-1 z-50 border border-gray-200">
                  <div className="px-4 py-2 border-b border-gray-100">
                    <p className="text-sm font-medium text-gray-900">
                      {user?.firstName} {user?.lastName}
                    </p>
                    <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                  </div>
                  <button
                    onClick={handleProfileClick}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                  >
                    Profile
                  </button>
                  <button
                    onClick={handleLogout}
                    className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                  >
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navigation;
