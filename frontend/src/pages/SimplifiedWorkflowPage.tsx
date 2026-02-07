import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { io, Socket } from 'socket.io-client';
import JsonSyntaxHighlight from '../components/JsonSyntaxHighlight';
import { API_URL } from '../utils/api';

interface CredentialRequirement {
  type: string;
  displayName: string;
  instructions: string;
  steps: string[];
  documentationUrl?: string;
  videoUrl?: string;
  contactInfo?: string;
}

interface GenerationResult {
  generationId: string;
  success: boolean;
  n8nWorkflowId?: string;
  n8nWorkflowUrl?: string;
  nodesUsed?: number;
  error?: string;
  credentials?: CredentialRequirement[];
  originalDescription?: string;
  workflow?: Record<string, any>; // Add workflow JSON
}

interface PreviewResult {
  previewId: string;
  workflow: Record<string, unknown>;
  nodeCount: number;
  explanation?: string;
  credentials?: CredentialRequirement[];
  originalDescription?: string;
}

// Local storage keys
const STORAGE_KEYS = {
  N8N_URL: 'rise_n8n_url',
  N8N_API_KEY: 'rise_n8n_api_key',
  GEMINI_API_KEY: 'rise_gemini_api_key',
};

// Default n8n URL
const DEFAULT_N8N_URL = 'https://n8n.risecodes.com/';

const SimplifiedWorkflowPage: React.FC = () => {
  const socketRef = useRef<Socket | null>(null);

  // State for credentials (stored locally)
  const [n8nUrl, setN8nUrl] = useState(() => localStorage.getItem(STORAGE_KEYS.N8N_URL) || DEFAULT_N8N_URL);
  const [n8nApiKey, setN8nApiKey] = useState(() => localStorage.getItem(STORAGE_KEYS.N8N_API_KEY) || '');
  const [geminiApiKey, setGeminiApiKey] = useState(() => localStorage.getItem(STORAGE_KEYS.GEMINI_API_KEY) || '');
  const [showApiKeys, setShowApiKeys] = useState(false);
  const [showGeminiKey, setShowGeminiKey] = useState(false);

  // State for workflow
  const [workflowDescription, setWorkflowDescription] = useState('');
  const [generating, setGenerating] = useState(false);
  const [currentGenerationId, setCurrentGenerationId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [generationProgress, setGenerationProgress] = useState({ message: '', progress: 0, estimatedTimeRemaining: null as number | null });
  const [generationResult, setGenerationResult] = useState<GenerationResult | null>(null);
  const [expandedCredentials, setExpandedCredentials] = useState<Set<string>>(new Set());
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null);
  const [creatingFromPreview, setCreatingFromPreview] = useState(false);
  const [showFlowDetails, setShowFlowDetails] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showWorkflowJSON, setShowWorkflowJSON] = useState(false);

  // UI state
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState('');
  const [validationSuccess, setValidationSuccess] = useState('');

  // Save credentials to local storage whenever they change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.N8N_URL, n8nUrl);
  }, [n8nUrl]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.N8N_API_KEY, n8nApiKey);
  }, [n8nApiKey]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.GEMINI_API_KEY, geminiApiKey);
  }, [geminiApiKey]);

  // Connect to socket.io for real-time updates
  useEffect(() => {
    socketRef.current = io(`${API_URL}`);

    socketRef.current.on('connect', () => {
      console.log('Socket connected:', socketRef.current?.id);
    });

    socketRef.current.on('workflow:progress', (data) => {
      console.log('Progress:', data);
      setGenerationProgress({
        message: data.message,
        progress: data.progress,
        estimatedTimeRemaining: data.estimatedTimeRemaining ?? null,
      });
    });

    socketRef.current.on('workflow:complete', (data: GenerationResult) => {
      console.log('Complete:', data);
      setGenerating(false);
      setCurrentGenerationId(null);
      setGenerationResult(data);
    });

    socketRef.current.on('workflow:error', (data) => {
      console.log('Error:', data);
      setGenerating(false);
      setCurrentGenerationId(null);
      setError(data.error || 'Workflow generation failed');
    });

    socketRef.current.on('workflow:cancelled', (data) => {
      console.log('Cancelled:', data);
      setGenerating(false);
      setCancelling(false);
      setCurrentGenerationId(null);
    });

    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  const handleValidateConnection = async () => {
    setError('');
    setValidationSuccess('');

    if (!n8nUrl || !n8nApiKey) {
      setError('Please enter both n8n URL and API key to validate');
      return;
    }

    try {
      setValidating(true);

      // Call the public validation endpoint (no auth required)
      const response = await axios.post(
        `${API_URL}/api/public/validate-n8n`,
        {
          url: n8nUrl,
          apiKey: n8nApiKey,
        }
      );

      if (response.data.valid) {
        setValidationSuccess(response.data.message || 'Connection successful! Credentials are valid.');
      }
    } catch (err: any) {
      console.error('Error validating connection:', err);
      // Check if it's a network error (backend not reachable)
      if (err.code === 'ERR_NETWORK' || !err.response) {
        setError('Cannot connect to backend server. Please ensure the backend is running on localhost:3000');
      } else {
        setError(err.response?.data?.error || 'Failed to validate n8n connection');
      }
    } finally {
      setValidating(false);
    }
  };

  const handleGenerateWorkflow = async () => {
    setError('');
    setGenerationResult(null);
    setPreviewResult(null);

    if (!n8nUrl || !n8nApiKey) {
      setError('Please enter your n8n URL and API key');
      return;
    }

    if (!workflowDescription.trim() || workflowDescription.trim().length < 10) {
      setError('Please enter a workflow description (at least 10 characters)');
      return;
    }

    try {
      setGenerating(true);
      setGenerationProgress({ message: 'Starting...', progress: 0, estimatedTimeRemaining: null });

      setGenerationProgress({ message: 'Generating preview...', progress: 50, estimatedTimeRemaining: null });
      const response = await axios.post(
        `${API_URL}/api/public/preview-workflow`,
        {
          n8nUrl,
          n8nApiKey,
          description: workflowDescription,
          geminiApiKey: geminiApiKey.trim() || undefined,
        }
      );
      setPreviewResult(response.data);
      setGenerating(false);
      setGenerationProgress({ message: '', progress: 0, estimatedTimeRemaining: null });
      return;
    } catch (err: any) {
      console.error('Error generating workflow:', err);
      setGenerating(false);

      if (!err.response) {
        setError('Connection failed, please check your network and try again.');
      } else if (err.response.status === 429) {
        const retryAfter = err.response.data?.retryAfter || '15 minutes';
        setError(`Rate limit exceeded, please wait ${retryAfter} before generating another workflow.`);
      } else if (err.response.status >= 500) {
        setError('Server error. Please try again later.');
      } else {
        setError(err.response.data?.error || 'Failed to generate workflow. Please try again.');
      }
    }
  };

  const handleCreateFromPreview = async () => {
    if (!previewResult) return;

    setCreatingFromPreview(true);
    setError('');

    try {
      const response = await axios.post(
        `${API_URL}/api/public/create-workflow`,
        {
          n8nUrl,
          n8nApiKey,
          previewId: previewResult.previewId,
        }
      );

      setGenerationResult({
        generationId: response.data.generationId || 'preview',
        success: response.data.success,
        n8nWorkflowId: response.data.n8nWorkflowId,
        n8nWorkflowUrl: response.data.n8nWorkflowUrl,
        nodesUsed: response.data.nodesUsed,
        credentials: previewResult.credentials,
        originalDescription: previewResult.originalDescription,
        workflow: response.data.workflow || previewResult.workflow, // Include workflow JSON
      });
      setPreviewResult(null);
    } catch (err: any) {
      console.error('Error creating workflow from preview:', err);
      setError(err.response?.data?.error || 'Failed to create workflow in n8n');
    } finally {
      setCreatingFromPreview(false);
    }
  };

  const renderFlowPreview = () => {
    if (!previewResult?.workflow || !showFlowDetails) return null;
    const nodes = (previewResult.workflow.nodes as Array<{ id: string; name: string; type: string; position?: [number, number] }>) || [];

    const columns = new Map<number, typeof nodes>();
    for (const node of nodes) {
      const x = node.position?.[0] ?? 0;
      if (!columns.has(x)) columns.set(x, []);
      columns.get(x)!.push(node);
    }

    const sortedColumns = Array.from(columns.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, value]) => value.sort((a, b) => (a.position?.[1] ?? 0) - (b.position?.[1] ?? 0)));

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-foreground">Flow Preview</h4>
          <button
            onClick={() => setShowFlowDetails(false)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Hide
          </button>
        </div>
        <div className="overflow-x-auto">
          <div className="inline-flex gap-6">
            {sortedColumns.map((column, colIndex) => (
              <div key={`col-${colIndex}`} className="flex flex-col gap-4 min-w-[160px]">
                {column.map((node) => (
                  <div
                    key={node.id}
                    className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs text-foreground shadow-sm"
                  >
                    <div className="font-semibold text-sm">{node.name}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{node.type}</div>
                  </div>
                ))}
                {colIndex < sortedColumns.length - 1 && (
                  <div className="text-center text-muted-foreground text-xs">→</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const handleCancelGeneration = async () => {
    if (!currentGenerationId) return;

    try {
      setCancelling(true);
      const socketId = socketRef.current?.id;

      await axios.post(
        `${API_URL}/api/public/cancel-workflow/${currentGenerationId}`,
        { socketId }
      );

      // The cancellation confirmation will come through the socket
    } catch (err: any) {
      console.error('Error cancelling workflow:', err);
      setCancelling(false);
      setError(err.response?.data?.error || 'Failed to cancel workflow generation');
    }
  };

  const handleNewWorkflow = () => {
    setWorkflowDescription('');
    setGenerationResult(null);
    setCurrentGenerationId(null);
    setCancelling(false);
    setGenerationProgress({ message: '', progress: 0, estimatedTimeRemaining: null });
    setError('');
  };

  const handleClearCredentials = () => {
    setN8nUrl(DEFAULT_N8N_URL);
    setN8nApiKey('');
    setGeminiApiKey('');
    localStorage.removeItem(STORAGE_KEYS.N8N_URL);
    localStorage.removeItem(STORAGE_KEYS.N8N_API_KEY);
    localStorage.removeItem(STORAGE_KEYS.GEMINI_API_KEY);
    setValidationSuccess('');
    setError('');
  };

  const formatTimeRemaining = (seconds: number | null): string => {
    if (seconds === null || seconds <= 0) return '';
    if (seconds === 1) return '~1 second remaining';
    if (seconds < 60) return `~${seconds} seconds remaining`;
    const minutes = Math.floor(seconds / 60);
    const remainingSecs = seconds % 60;
    if (minutes === 1 && remainingSecs === 0) return '~1 minute remaining';
    if (remainingSecs === 0) return `~${minutes} minutes remaining`;
    return `~${minutes}m ${remainingSecs}s remaining`;
  };

  const isReadyToGenerate = n8nUrl && n8nApiKey && workflowDescription.length >= 10;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Simple Header */}
      <header className="bg-card shadow-sm border-b border-border">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-primary to-primary/70 rounded-lg flex items-center justify-center shadow-glow-blue">
                <span className="text-primary-foreground font-bold text-lg">FN</span>
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">Friendly Nathan (n8n)</h1>
                <p className="text-xs text-muted-foreground">AI-Powered Workflow Generation</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main id="main-content" className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full">
        <div className="space-y-6">

          {/* Credentials Section - Collapsible */}
          <div className="bg-card rounded-lg shadow-lg border border-border">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="w-full p-4 flex justify-between items-center hover:bg-muted/30 transition-colors rounded-t-lg"
            >
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <h2 className="text-lg font-semibold text-foreground">Settings & Configuration</h2>
              </div>
              <div className="flex items-center gap-2">
                {validationSuccess && !showSettings && (
                  <span className="text-xs text-green-400 mr-2">✓ Connected</span>
                )}
                <svg
                  className={`w-5 h-5 text-muted-foreground transition-transform ${showSettings ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>

            {showSettings && (
              <div className="p-6 border-t border-border">
                <div className="flex justify-between items-center mb-4">
                  {(n8nApiKey || geminiApiKey) && (
                    <button
                      onClick={handleClearCredentials}
                      className="text-sm text-muted-foreground hover:text-destructive transition-colors ml-auto"
                    >
                      Clear All
                    </button>
                  )}
                </div>

                <p className="text-sm text-muted-foreground mb-4">
                  Your credentials are saved locally in your browser and never sent to our servers.
                </p>

            <div className="space-y-4">
              {/* n8n URL */}
              <div>
                <label htmlFor="n8nUrl" className="block text-sm font-medium text-foreground mb-2">
                  n8n URL
                </label>
                <input
                  type="url"
                  id="n8nUrl"
                  value={n8nUrl}
                  onChange={(e) => {
                    setN8nUrl(e.target.value);
                    setValidationSuccess('');
                  }}
                  placeholder={DEFAULT_N8N_URL}
                  className="w-full px-4 py-3 border border-border rounded-lg bg-input text-foreground focus:ring-2 focus:ring-primary focus:border-transparent"
                  disabled={generating}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Pre-filled with default n8n URL. Change if using a different instance.
                </p>
              </div>

              {/* n8n API Key */}
              <div>
                <label htmlFor="n8nApiKey" className="block text-sm font-medium text-foreground mb-2">
                  n8n API Key <span className="text-destructive">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showApiKeys ? 'text' : 'password'}
                    id="n8nApiKey"
                    value={n8nApiKey}
                    onChange={(e) => {
                      setN8nApiKey(e.target.value);
                      setValidationSuccess('');
                    }}
                    placeholder="Enter your n8n API key"
                    className="w-full px-4 py-3 border border-border rounded-lg bg-input text-foreground focus:ring-2 focus:ring-primary focus:border-transparent pr-20"
                    disabled={generating}
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKeys(!showApiKeys)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-primary hover:text-secondary transition-colors"
                  >
                    {showApiKeys ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              {/* Gemini API Key (Optional) */}
              <div>
                <label htmlFor="geminiApiKey" className="block text-sm font-medium text-foreground mb-2">
                  Google Gemini API Key <span className="text-muted-foreground">(optional - for enhanced AI)</span>
                </label>
                <div className="relative">
                  <input
                    type={showGeminiKey ? 'text' : 'password'}
                    id="geminiApiKey"
                    value={geminiApiKey}
                    onChange={(e) => setGeminiApiKey(e.target.value)}
                    placeholder="AIzaSy..."
                    className="w-full px-4 py-3 border border-border rounded-lg bg-input text-foreground focus:ring-2 focus:ring-primary focus:border-transparent pr-20"
                    disabled={generating}
                  />
                  <button
                    type="button"
                    onClick={() => setShowGeminiKey(!showGeminiKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-primary hover:text-secondary transition-colors"
                  >
                    {showGeminiKey ? 'Hide' : 'Show'}
                  </button>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Get your API key from{' '}
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:text-secondary underline"
                  >
                    Google AI Studio
                  </a>
                </p>
              </div>

              {/* Validate Button */}
              <button
                onClick={handleValidateConnection}
                disabled={validating || generating || !n8nUrl || !n8nApiKey}
                className="w-full px-4 py-2 bg-muted hover:bg-muted/80 text-foreground font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {validating ? 'Validating...' : 'Test Connection'}
              </button>

              {/* Validation Messages */}
              {validationSuccess && (
                <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                  <p className="text-sm text-green-400 flex items-center gap-2">
                    <span>✓</span> {validationSuccess}
                  </p>
                </div>
              )}

              {error && !generating && (
                <div className="p-3 bg-destructive/10 border border-destructive rounded-lg">
                  <p className="text-sm text-destructive">{error}</p>
                </div>
              )}
            </div>
              </div>
            )}
          </div>

          {/* Workflow Description Section */}
          <div className="bg-card rounded-lg shadow-lg p-6 border border-border">
            <h2 className="text-lg font-semibold text-foreground mb-4">Describe Your Workflow</h2>

            {!generationResult ? (
              <>
                <textarea
                  value={workflowDescription}
                  onChange={(e) => setWorkflowDescription(e.target.value)}
                  placeholder="Describe the workflow you want to create. For example: 'Get emails from sender@example.com, summarize with Gemini, send to Slack #general'"
                  rows={5}
                  className="w-full px-4 py-3 border border-border rounded-lg bg-input text-foreground focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
                  disabled={generating}
                />

                <div className="mt-2 flex justify-between items-center">
                  <p className="text-sm text-muted-foreground">
                    {workflowDescription.length} characters {workflowDescription.length < 10 && '(minimum 10)'}
                  </p>
                  <div className="flex items-center gap-4">
                    {workflowDescription.length > 0 && (
                      <button
                        onClick={() => setWorkflowDescription('')}
                        className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                        disabled={generating}
                      >
                        Clear
                      </button>
                    )}
                    <p className="text-sm text-muted-foreground">
                      Minimum 10 characters
                    </p>
                  </div>
                </div>

                {/* Progress indicator */}
                {generating && (
                  <div className="mt-6 space-y-3">
                    <div className="flex justify-between items-center">
                      <p className="text-sm font-medium text-primary">{generationProgress.message}</p>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div
                        className="bg-gradient-to-r from-primary to-secondary h-2 rounded-full transition-all duration-300 animate-pulse"
                        style={{ width: `${generationProgress.progress}%` }}
                      />
                    </div>
                    {currentGenerationId && (
                      <button
                        onClick={handleCancelGeneration}
                        disabled={cancelling}
                        className="w-full px-4 py-2 bg-destructive/20 hover:bg-destructive/30 text-destructive font-medium rounded-lg transition-colors disabled:opacity-50"
                      >
                        {cancelling ? 'Cancelling...' : 'Cancel Generation'}
                      </button>
                    )}
                  </div>
                )}

                {/* Generate Button */}
                <button
                  onClick={handleGenerateWorkflow}
                  disabled={generating || !isReadyToGenerate}
                  className="mt-6 w-full px-6 py-4 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-primary-foreground font-bold text-lg rounded-lg transition-all shadow-glow-blue hover:shadow-glow-blue-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
                >
                  {generating ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Generating Preview...
                    </span>
                  ) : (
                    'Generate Preview'
                  )}
                </button>

                {!isReadyToGenerate && !generating && (
                  <p className="mt-2 text-center text-sm text-muted-foreground">
                    {!n8nUrl || !n8nApiKey
                      ? 'Please enter your n8n credentials above'
                      : 'Please enter a workflow description (at least 10 characters)'}
                  </p>
                )}

                {previewResult && (
                  <div className="mt-6 space-y-4 border border-border rounded-lg p-4 bg-card">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-foreground">Preview Workflow</h3>
                      <button
                        onClick={() => setPreviewResult(null)}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                        disabled={creatingFromPreview}
                      >
                        Clear Preview
                      </button>
                    </div>

                    {/* Original User Request */}
                    {previewResult.originalDescription && (
                      <div className="p-3 bg-muted/30 border border-border rounded-lg">
                        <h4 className="text-sm font-semibold text-foreground mb-1">Your Request:</h4>
                        <p className="text-sm text-muted-foreground italic">"{previewResult.originalDescription}"</p>
                      </div>
                    )}

                    {previewResult.explanation && (
                      <p className="text-sm text-muted-foreground">{previewResult.explanation}</p>
                    )}
                    {showFlowDetails ? renderFlowPreview() : (
                      <button
                        onClick={() => setShowFlowDetails(true)}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Show Flow Preview
                      </button>
                    )}
                    <JsonSyntaxHighlight data={previewResult.workflow} />
                    <button
                      onClick={handleCreateFromPreview}
                      disabled={creatingFromPreview}
                      className="w-full px-4 py-3 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
                    >
                      {creatingFromPreview ? 'Creating in n8n...' : 'Create in n8n'}
                    </button>
                  </div>
                )}
              </>
            ) : (
              // Generation Result
              <div className="space-y-4">
                {generationResult.success ? (
                  <>
                    <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 w-10 h-10 bg-green-500 rounded-full flex items-center justify-center">
                          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold text-green-400 mb-2">Workflow Created Successfully!</h3>
                          {generationResult.originalDescription && (
                            <div className="mb-3 p-2 bg-muted/20 border border-border/30 rounded">
                              <p className="text-xs font-semibold text-green-300 mb-1">Your Request:</p>
                              <p className="text-xs text-muted-foreground italic">"{generationResult.originalDescription}"</p>
                            </div>
                          )}
                          <div className="space-y-1">
                            <p className="text-sm text-green-300">
                              <span className="font-medium">Workflow ID:</span> {generationResult.n8nWorkflowId}
                            </p>
                            <p className="text-sm text-green-300">
                              <span className="font-medium">Nodes Created:</span> {generationResult.nodesUsed}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Workflow JSON Viewer (Feature #276) */}
                    {generationResult.workflow && (
                      <div className="border border-border/50 rounded-lg overflow-hidden bg-card/50">
                        <button
                          onClick={() => setShowWorkflowJSON(!showWorkflowJSON)}
                          className="w-full p-3 flex justify-between items-center hover:bg-muted/20 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <svg className="w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                            </svg>
                            <span className="text-sm font-medium text-foreground">View Workflow JSON</span>
                          </div>
                          <svg
                            className={`w-4 h-4 text-muted-foreground transition-transform ${showWorkflowJSON ? 'rotate-180' : ''}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>

                        {showWorkflowJSON && (
                          <div className="border-t border-border/50 bg-muted/10">
                            <div className="p-4">
                              <div className="relative">
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(JSON.stringify(generationResult.workflow, null, 2));
                                  }}
                                  className="absolute top-2 right-2 px-3 py-1 text-xs bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30 rounded transition-colors"
                                  title="Copy to clipboard"
                                >
                                  Copy JSON
                                </button>
                                <pre className="text-xs text-foreground/90 bg-background/50 p-4 rounded border border-border/30 overflow-x-auto max-h-96 overflow-y-auto">
                                  <code>{JSON.stringify(generationResult.workflow, null, 2)}</code>
                                </pre>
                              </div>
                              <p className="mt-2 text-xs text-muted-foreground">
                                This is the raw workflow JSON that was created in your n8n instance.
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Credentials Required Section */}
                    {generationResult.credentials && generationResult.credentials.length > 0 && (
                      <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                        <h4 className="text-lg font-semibold text-yellow-400 mb-3">
                          Credentials Required
                        </h4>
                        <p className="text-sm text-yellow-300 mb-4">
                          This workflow requires the following credentials to be configured in n8n:
                        </p>
                        <div className="space-y-3">
                          {generationResult.credentials.map((cred, index) => {
                            const isExpanded = expandedCredentials.has(cred.type);
                            return (
                              <div key={index} className="bg-card rounded-lg border border-yellow-500/20 overflow-hidden">
                                <button
                                  onClick={() => {
                                    const newExpanded = new Set(expandedCredentials);
                                    if (isExpanded) {
                                      newExpanded.delete(cred.type);
                                    } else {
                                      newExpanded.add(cred.type);
                                    }
                                    setExpandedCredentials(newExpanded);
                                  }}
                                  className="w-full p-3 flex justify-between items-center text-left hover:bg-muted/50 transition-colors"
                                >
                                  <div>
                                    <h5 className="font-semibold text-yellow-400">
                                      {cred.displayName}
                                    </h5>
                                    <p className="text-sm text-yellow-300/80">
                                      {cred.instructions}
                                    </p>
                                  </div>
                                  <span className="text-yellow-400 text-lg ml-2">
                                    {isExpanded ? '−' : '+'}
                                  </span>
                                </button>

                                {isExpanded && (
                                  <div className="p-4 pt-0 border-t border-yellow-500/20">
                                    {cred.steps && cred.steps.length > 0 && (
                                      <div className="mb-4">
                                        <h6 className="font-medium text-foreground mb-2">Setup steps:</h6>
                                        <ol className="list-decimal list-inside space-y-1">
                                          {cred.steps.map((step, stepIndex) => (
                                            <li key={stepIndex} className="text-sm text-muted-foreground">
                                              {step}
                                            </li>
                                          ))}
                                        </ol>
                                      </div>
                                    )}

                                    <div className="flex flex-wrap gap-3">
                                      {cred.documentationUrl && (
                                        <a
                                          href={cred.documentationUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-flex items-center text-sm text-primary hover:text-secondary"
                                        >
                                          <span className="mr-1">📖</span> Documentation ↗
                                        </a>
                                      )}
                                      {cred.videoUrl && (
                                        <a
                                          href={cred.videoUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-flex items-center text-sm text-destructive hover:text-destructive/80"
                                        >
                                          <span className="mr-1">🎬</span> Video Guide ↗
                                        </a>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <a
                      href={generationResult.n8nWorkflowUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center w-full px-6 py-4 bg-gradient-to-r from-primary to-secondary hover:from-primary/90 hover:to-secondary/90 text-primary-foreground font-bold text-lg rounded-lg transition-all shadow-glow-blue hover:shadow-glow-blue-lg"
                    >
                      Open Workflow in n8n ↗
                    </a>

                    <button
                      onClick={handleNewWorkflow}
                      className="w-full px-6 py-3 bg-muted hover:bg-muted/80 text-foreground font-semibold rounded-lg transition-colors"
                    >
                      Create Another Workflow
                    </button>
                  </>
                ) : (
                  <>
                    <div className="p-4 bg-destructive/10 border border-destructive rounded-lg">
                      <h3 className="text-lg font-semibold text-destructive mb-2">Workflow Generation Failed</h3>
                      <p className="text-sm text-destructive/90">{generationResult.error}</p>
                    </div>

                    <button
                      onClick={handleNewWorkflow}
                      className="w-full px-6 py-3 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-lg transition-colors"
                    >
                      Try Again
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

        </div>
      </main>
    </div>
  );
};

export default SimplifiedWorkflowPage;
