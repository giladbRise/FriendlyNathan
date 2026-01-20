import React from 'react';

interface JsonSyntaxHighlightProps {
  data: unknown;
  className?: string;
}

const JsonSyntaxHighlight: React.FC<JsonSyntaxHighlightProps> = ({ data, className = '' }) => {
  const highlightJson = (json: string): string => {
    // Escape HTML entities
    json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Apply syntax highlighting
    return json.replace(
      /("(\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
      (match) => {
        let cls = 'text-amber-400'; // number
        if (/^"/.test(match)) {
          if (/:$/.test(match)) {
            cls = 'text-cyan-400'; // key
            match = match.slice(0, -1) + '<span class="text-gray-400">:</span>';
          } else {
            cls = 'text-green-400'; // string
          }
        } else if (/true|false/.test(match)) {
          cls = 'text-purple-400'; // boolean
        } else if (/null/.test(match)) {
          cls = 'text-red-400'; // null
        }
        return `<span class="${cls}">${match}</span>`;
      }
    );
  };

  const jsonString = JSON.stringify(data, null, 2);
  const highlighted = highlightJson(jsonString);

  return (
    <pre
      className={`bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto text-sm font-mono max-h-96 overflow-y-auto ${className}`}
      dangerouslySetInnerHTML={{ __html: highlighted }}
    />
  );
};

export default JsonSyntaxHighlight;
