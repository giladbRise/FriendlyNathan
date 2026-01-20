import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import Navigation from '../components/Navigation';

interface RecentActivity {
  id: string;
  workflowDescription: string;
  status: 'pending' | 'in_progress' | 'success' | 'failed' | 'cancelled';
  createdAt: string;
}

const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRecentActivity();
  }, []);

  const fetchRecentActivity = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(
        'http://localhost:3000/api/workflows/history?limit=5',
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setRecentActivity(response.data.generations || []);
    } catch (err) {
      console.error('Error fetching recent activity:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatRelativeTime = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
    return date.toLocaleDateString();
  };

  const getStatusColor = (status: RecentActivity['status']) => {
    switch (status) {
      case 'success': return 'text-green-600 bg-green-100';
      case 'failed': return 'text-red-600 bg-red-100';
      case 'in_progress': return 'text-blue-600 bg-blue-100';
      case 'cancelled': return 'text-yellow-600 bg-yellow-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getStatusLabel = (status: RecentActivity['status']) => {
    switch (status) {
      case 'success': return 'Success';
      case 'failed': return 'Failed';
      case 'in_progress': return 'In Progress';
      case 'cancelled': return 'Cancelled';
      default: return 'Pending';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-6">
          {/* Welcome Section */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              Welcome, {user?.firstName || user?.email}!
            </h2>
            <p className="text-gray-600 mb-4">
              You have successfully logged in to the RISE n8n Workflow Builder.
            </p>
            <button
              onClick={() => navigate('/workflow/create')}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md transition-colors"
            >
              Create New Workflow
            </button>
          </div>

          {/* Recent Activity Section */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Recent Activity</h3>
              <button
                onClick={() => navigate('/workflow/history')}
                className="text-sm text-blue-600 hover:text-blue-700"
              >
                View All →
              </button>
            </div>

            {loading ? (
              <p className="text-gray-500">Loading recent activity...</p>
            ) : recentActivity.length === 0 ? (
              <p className="text-gray-500">No recent workflow generations yet.</p>
            ) : (
              <div className="space-y-3">
                {recentActivity.map((activity) => (
                  <div
                    key={activity.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-md hover:bg-gray-100 cursor-pointer transition-colors"
                    onClick={() => navigate(`/workflow/${activity.id}`)}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {activity.workflowDescription.length > 60
                          ? activity.workflowDescription.substring(0, 60) + '...'
                          : activity.workflowDescription}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatRelativeTime(activity.createdAt)}
                      </p>
                    </div>
                    <span className={`ml-3 px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(activity.status)}`}>
                      {getStatusLabel(activity.status)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick Stats Section */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-lg shadow p-4">
              <h4 className="text-sm font-medium text-gray-500">Total Workflows</h4>
              <p className="text-2xl font-bold text-gray-900">
                {recentActivity.length > 0 ? '—' : '0'}
              </p>
              <p className="text-xs text-gray-400">View history for complete count</p>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <h4 className="text-sm font-medium text-gray-500">Successful</h4>
              <p className="text-2xl font-bold text-green-600">
                {recentActivity.filter(a => a.status === 'success').length}
              </p>
              <p className="text-xs text-gray-400">In recent activity</p>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <h4 className="text-sm font-medium text-gray-500">Failed</h4>
              <p className="text-2xl font-bold text-red-600">
                {recentActivity.filter(a => a.status === 'failed').length}
              </p>
              <p className="text-xs text-gray-400">In recent activity</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default DashboardPage;
