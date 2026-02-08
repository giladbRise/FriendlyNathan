import React from 'react';

interface JsonSyntaxHighlightProps {
  data: unknown;
  className?: string;
}

interface Token {
  text: string;
  className?: string;
}

const JsonSyntaxHighlight: React.FC<JsonSyntaxHighlightProps> = ({ data, className = '' }) => {
  const tokenize = (json: string): Token[] => {
    const tokens: Token[] = [];
    const regex = /("(\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(json)) !== null) {
      // Add any text before this match as plain text
      if (match.index > lastIndex) {
        tokens.push({ text: json.slice(lastIndex, match.index) });
      }

      const value = match[0];
      let cls = 'text-amber-600'; // number
      if (/^"/.test(value)) {
        if (/:$/.test(value)) {
          // Key — split into key text and colon
          tokens.push({ text: value.slice(0, -1), className: 'text-cyan-700' });
          tokens.push({ text: ':', className: 'text-gray-500' });
          lastIndex = regex.lastIndex;
          continue;
        } else {
          cls = 'text-green-700'; // string
        }
      } else if (/true|false/.test(value)) {
        cls = 'text-purple-600'; // boolean
      } else if (/null/.test(value)) {
        cls = 'text-red-500'; // null
      }

      tokens.push({ text: value, className: cls });
      lastIndex = regex.lastIndex;
    }

    // Add remaining text
    if (lastIndex < json.length) {
      tokens.push({ text: json.slice(lastIndex) });
    }

    return tokens;
  };

  const jsonString = JSON.stringify(data, null, 2);
  const tokens = tokenize(jsonString);

  return (
    <pre
      className={`bg-gray-50 text-gray-800 p-4 rounded-lg overflow-x-auto text-sm font-mono max-h-96 overflow-y-auto border border-gray-200 ${className}`}
    >
      {tokens.map((token, i) =>
        token.className ? (
          <span key={i} className={token.className}>{token.text}</span>
        ) : (
          <React.Fragment key={i}>{token.text}</React.Fragment>
        )
      )}
    </pre>
  );
};

export default JsonSyntaxHighlight;
