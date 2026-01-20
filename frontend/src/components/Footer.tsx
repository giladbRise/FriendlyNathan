import React from 'react';

const Footer: React.FC = () => {
  const currentYear = new Date().getFullYear();
  const version = '1.0.0';

  return (
    <footer className="bg-card border-t border-border mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>© {currentYear} RISE n8n Workflow Builder</span>
            <span className="hidden sm:inline">•</span>
            <span className="text-muted-foreground/60">v{version}</span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <a
              href="https://docs.n8n.io"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-primary transition-colors"
            >
              n8n Documentation
            </a>
            <a
              href="mailto:support@rise.com"
              className="text-muted-foreground hover:text-primary transition-colors"
            >
              Support
            </a>
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                alert('Privacy Policy coming soon');
              }}
              className="text-muted-foreground hover:text-primary transition-colors"
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
