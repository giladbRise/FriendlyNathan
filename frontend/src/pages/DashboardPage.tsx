import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import Navigation from '../components/Navigation';

const DashboardPage: React.FC = () => {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            Welcome, {user?.firstName || user?.email}!
          </h2>
          <p className="text-gray-600">
            You have successfully logged in to the RISE n8n Workflow Builder.
          </p>
        </div>
      </main>
    </div>
  );
};

export default DashboardPage;
