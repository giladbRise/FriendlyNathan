import React from 'react';

const Footer: React.FC = () => {
  const currentYear = new Date().getFullYear();
  const version = '1.0.0';

  return (
    <footer className="bg-white border-t border-gray-200 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-4 text-sm text-gray-500">
            <span>© {currentYear} RISE n8n Workflow Builder</span>
            <span className="hidden sm:inline">•</span>
            <span className="text-gray-400">v{version}</span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <a
              href="https://docs.n8n.io"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-500 hover:text-gray-700 transition-colors"
            >
              n8n Documentation
            </a>
            <a
              href="mailto:support@rise.com"
              className="text-gray-500 hover:text-gray-700 transition-colors"
            >
              Support
            </a>
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                alert('Privacy Policy coming soon');
              }}
              className="text-gray-500 hover:text-gray-700 transition-colors"
            >
              Privacy
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
