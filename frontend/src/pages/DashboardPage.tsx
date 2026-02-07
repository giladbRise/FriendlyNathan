import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import Navigation from '../components/Navigation';
import Footer from '../components/Footer';
import { SkeletonActivityItem } from '../components/Skeleton';
import { API_URL } from '../utils/api';

interface RecentActivity {
  id: string;
  type: 'activity' | 'workflow';
  activityType: string;
  description: string;
  metadata: Record<string, unknown> | null;
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
        `${API_URL}/api/workflows/activity?limit=10`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setRecentActivity(response.data.activities || []);
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

  const getActivityColor = (activityType: string) => {
    switch (activityType) {
      case 'workflow_created': return 'text-green-400 bg-green-500/20';
      case 'workflow_failed': return 'text-red-400 bg-red-500/20';
      case 'instance_added': return 'text-blue-400 bg-blue-500/20';
      case 'instance_updated': return 'text-blue-400 bg-blue-500/20';
      case 'instance_deleted': return 'text-yellow-400 bg-yellow-500/20';
      case 'profile_updated': return 'text-purple-400 bg-purple-500/20';
      case 'login': return 'text-cyan-400 bg-cyan-500/20';
      default: return 'text-muted-foreground bg-muted';
    }
  };

  const getActivityLabel = (activityType: string) => {
    switch (activityType) {
      case 'workflow_created': return 'Workflow Created';
      case 'workflow_failed': return 'Workflow Failed';
      case 'instance_added': return 'Instance Added';
      case 'instance_updated': return 'Instance Updated';
      case 'instance_deleted': return 'Instance Deleted';
      case 'profile_updated': return 'Profile Updated';
      case 'login': return 'Login';
      default: return activityType;
    }
  };

  const getActivityIcon = (activityType: string) => {
    switch (activityType) {
      case 'workflow_created':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'workflow_failed':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'instance_added':
      case 'instance_updated':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        );
      case 'instance_deleted':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        );
      case 'profile_updated':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        );
      case 'login':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
          </svg>
        );
      default:
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
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
              You have successfully logged in to Friendly Nathan (n8n).
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
                    className={`flex items-center justify-between p-3 bg-muted rounded-md transition-colors ${
                      activity.type === 'workflow' ? 'cursor-pointer hover:bg-muted/80' : ''
                    }`}
                    onClick={() => activity.type === 'workflow' && navigate(`/workflow/${activity.id}`)}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className={`p-1.5 rounded-full ${getActivityColor(activity.activityType)}`}>
                        {getActivityIcon(activity.activityType)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {activity.description.length > 60
                            ? activity.description.substring(0, 60) + '...'
                            : activity.description}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatRelativeTime(activity.createdAt)}
                        </p>
                      </div>
                    </div>
                    <span className={`ml-3 px-2 py-1 text-xs font-medium rounded-full ${getActivityColor(activity.activityType)}`}>
                      {getActivityLabel(activity.activityType)}
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
                {recentActivity.filter(a => a.activityType === 'workflow_created').length}
              </p>
              <p className="text-xs text-muted-foreground/60">In recent activity</p>
            </div>
            <div className="bg-card rounded-lg shadow p-4 border border-border">
              <h4 className="text-sm font-medium text-muted-foreground">Failed</h4>
              <p className="text-2xl font-bold text-red-400">
                {recentActivity.filter(a => a.activityType === 'workflow_failed').length}
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
