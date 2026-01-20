import React from 'react';
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

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems: NavItem[] = [
    { label: 'Dashboard', path: '/dashboard' },
    { label: 'Create Workflow', path: '/workflow/create' },
    { label: 'History', path: '/workflow/history' },
    { label: 'Instances', path: '/instances' },
    { label: 'Profile', path: '/profile' },
    { label: 'Admin', path: '/admin', adminOnly: true },
  ];

  const isActive = (path: string): boolean => {
    // Exact match for most paths
    if (location.pathname === path) return true;
    // Check if current path starts with the nav path (for nested routes like /admin/*)
    if (path !== '/dashboard' && location.pathname.startsWith(path)) return true;
    return false;
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
            <span className="text-sm text-gray-700">{user?.email}</span>
            <button
              onClick={handleLogout}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navigation;
