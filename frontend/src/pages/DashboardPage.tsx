import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import Navigation from '../components/Navigation';
import Footer from '../components/Footer';
import { SkeletonActivityItem } from '../components/Skeleton';

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
      case 'success': return 'text-green-400 bg-green-500/20';
      case 'failed': return 'text-red-400 bg-red-500/20';
      case 'in_progress': return 'text-blue-400 bg-blue-500/20';
      case 'cancelled': return 'text-yellow-400 bg-yellow-500/20';
      default: return 'text-muted-foreground bg-muted';
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
    <div className="min-h-screen bg-background flex flex-col">
      <Navigation />

      <main id="main-content" tabIndex={-1} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 outline-none flex-1 w-full">
        <div className="space-y-6">
          {/* Welcome Section */}
          <div className="bg-card rounded-lg shadow p-6 border border-border">
            <h2 className="text-2xl font-bold text-foreground mb-4">
              Welcome, {user?.firstName || user?.email}!
            </h2>
            <p className="text-muted-foreground mb-4">
              You have successfully logged in to the RISE n8n Workflow Builder.
            </p>
            <button
              onClick={() => navigate('/workflow/create')}
              className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground font-medium rounded-md transition-colors shadow-glow-blue hover:shadow-glow-blue-lg"
            >
              Create New Workflow
            </button>
          </div>

          {/* Recent Activity Section */}
          <div className="bg-card rounded-lg shadow p-6 border border-border">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-foreground">Recent Activity</h3>
              <button
                onClick={() => navigate('/workflow/history')}
                className="text-sm text-primary hover:text-secondary transition-colors"
              >
                View All →
              </button>
            </div>

            {loading ? (
              <div className="space-y-3">
                <SkeletonActivityItem />
                <SkeletonActivityItem />
                <SkeletonActivityItem />
              </div>
            ) : recentActivity.length === 0 ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 mx-auto mb-4 bg-muted rounded-full flex items-center justify-center">
                  <svg className="w-8 h-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="text-muted-foreground mb-2">No recent activity</p>
                <p className="text-sm text-muted-foreground/60">Your workflow generations will appear here</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentActivity.map((activity) => (
                  <div
                    key={activity.id}
                    className="flex items-center justify-between p-3 bg-muted rounded-md hover:bg-muted/80 cursor-pointer transition-colors"
                    onClick={() => navigate(`/workflow/${activity.id}`)}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {activity.workflowDescription.length > 60
                          ? activity.workflowDescription.substring(0, 60) + '...'
                          : activity.workflowDescription}
                      </p>
                      <p className="text-xs text-muted-foreground">
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
            <div className="bg-card rounded-lg shadow p-4 border border-border">
              <h4 className="text-sm font-medium text-muted-foreground">Total Workflows</h4>
              <p className="text-2xl font-bold text-foreground">
                {recentActivity.length > 0 ? '—' : '0'}
              </p>
              <p className="text-xs text-muted-foreground/60">View history for complete count</p>
            </div>
            <div className="bg-card rounded-lg shadow p-4 border border-border">
              <h4 className="text-sm font-medium text-muted-foreground">Successful</h4>
              <p className="text-2xl font-bold text-green-400">
                {recentActivity.filter(a => a.status === 'success').length}
              </p>
              <p className="text-xs text-muted-foreground/60">In recent activity</p>
            </div>
            <div className="bg-card rounded-lg shadow p-4 border border-border">
              <h4 className="text-sm font-medium text-muted-foreground">Failed</h4>
              <p className="text-2xl font-bold text-red-400">
                {recentActivity.filter(a => a.status === 'failed').length}
              </p>
              <p className="text-xs text-muted-foreground/60">In recent activity</p>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default DashboardPage;
