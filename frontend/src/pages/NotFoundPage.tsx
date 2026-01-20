import React from 'react';
import { useNavigate } from 'react-router-dom';

const NotFoundPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="text-center">
        <h1 className="text-9xl font-bold text-gray-200">404</h1>
        <h2 className="text-3xl font-bold text-gray-900 mt-4">Page Not Found</h2>
        <p className="text-gray-600 mt-2 max-w-md mx-auto">
          The page you are looking for doesn't exist or has been moved.
        </p>
        <div className="mt-8 flex gap-4 justify-center">
          <button
            onClick={() => navigate(-1)}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
          >
            Go Back
          </button>
          <button
            onClick={() => navigate('/dashboard')}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
};

export default NotFoundPage;
