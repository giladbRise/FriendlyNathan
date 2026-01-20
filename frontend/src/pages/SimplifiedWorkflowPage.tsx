import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { io, Socket } from 'socket.io-client';
import Footer from '../components/Footer';

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
}

// Local storage keys
const STORAGE_KEYS = {
  N8N_URL: 'rise_n8n_url',
  N8N_API_KEY: 'rise_n8n_api_key',
  GEMINI_API_KEY: 'rise_gemini_api_key',
};

// Default RISE n8n URL
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
    socketRef.current = io('http://localhost:3000');

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
        'http://localhost:3000/api/public/validate-n8n',
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
      setError(err.response?.data?.error || 'Failed to validate n8n connection');
    } finally {
      setValidating(false);
    }
  };

  const handleGenerateWorkflow = async () => {
    setError('');
    setGenerationResult(null);

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

      const socketId = socketRef.current?.id;

      // Call the public workflow generation endpoint (no auth required)
      const response = await axios.post(
        'http://localhost:3000/api/public/generate-workflow',
        {
          n8nUrl,
          n8nApiKey,
          description: workflowDescription,
          socketId,
          geminiApiKey: geminiApiKey.trim() || undefined,
        }
      );

      // Store the generation ID for potential cancellation
      setCurrentGenerationId(response.data.generationId);

      // The result will come through the socket
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

  const handleCancelGeneration = async () => {
    if (!currentGenerationId) return;

    try {
      setCancelling(true);
      const socketId = socketRef.current?.id;

      await axios.post(
        `http://localhost:3000/api/public/cancel-workflow/${currentGenerationId}`,
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
                <span className="text-primary-foreground font-bold text-lg">R</span>
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">RISE n8n Workflow Builder</h1>
                <p className="text-xs text-muted-foreground">AI-Powered Workflow Generation</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main id="main-content" className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full">
        <div className="space-y-6">

          {/* Credentials Section */}
          <div className="bg-card rounded-lg shadow-lg p-6 border border-border">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-foreground">Configuration</h2>
              {(n8nApiKey || geminiApiKey) && (
                <button
                  onClick={handleClearCredentials}
                  className="text-sm text-muted-foreground hover:text-destructive transition-colors"
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
                  Pre-filled with RISE n8n URL. Change if using a different instance.
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

          {/* Workflow Description Section */}
          <div className="bg-card rounded-lg shadow-lg p-6 border border-border">
            <h2 className="text-lg font-semibold text-foreground mb-4">Describe Your Workflow</h2>

            {!generationResult ? (
              <>
                <textarea
                  value={workflowDescription}
                  onChange={(e) => setWorkflowDescription(e.target.value)}
                  placeholder="Describe the workflow you want to create. For example: 'Send a webhook POST request to https://example.com/hook with static JSON data' or 'Send a Slack message to #general channel'"
                  rows={5}
                  className="w-full px-4 py-3 border border-border rounded-lg bg-input text-foreground focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
                  disabled={generating}
                />

                <div className="mt-2 flex justify-between items-center">
                  <p className="text-sm text-muted-foreground">
                    {workflowDescription.length} characters
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

                {/* Example prompts */}
                <div className="mt-4">
                  <p className="text-sm font-medium text-foreground mb-2">Quick examples:</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setWorkflowDescription('Send a webhook POST request to https://example.com/hook with static JSON data')}
                      className="text-xs px-3 py-1.5 bg-muted hover:bg-muted/80 rounded-full text-foreground transition-colors"
                      disabled={generating}
                    >
                      HTTP Request
                    </button>
                    <button
                      onClick={() => setWorkflowDescription('Send a Slack message to #general channel with a greeting')}
                      className="text-xs px-3 py-1.5 bg-muted hover:bg-muted/80 rounded-full text-foreground transition-colors"
                      disabled={generating}
                    >
                      Slack Message
                    </button>
                    <button
                      onClick={() => setWorkflowDescription('Send an email notification to recipient@example.com with a summary')}
                      className="text-xs px-3 py-1.5 bg-muted hover:bg-muted/80 rounded-full text-foreground transition-colors"
                      disabled={generating}
                    >
                      Send Email
                    </button>
                    <button
                      onClick={() => setWorkflowDescription('Get data from Google Sheets and send to Slack')}
                      className="text-xs px-3 py-1.5 bg-yellow-500/20 hover:bg-yellow-500/30 rounded-full text-yellow-400 transition-colors"
                      disabled={generating}
                    >
                      Google Sheets + Slack
                    </button>
                  </div>
                </div>

                {/* Progress indicator */}
                {generating && (
                  <div className="mt-6 space-y-3">
                    <div className="flex justify-between items-center">
                      <p className="text-sm font-medium text-primary">{generationProgress.message}</p>
                      <p className="text-sm text-muted-foreground">{generationProgress.progress}%</p>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div
                        className="bg-gradient-to-r from-primary to-secondary h-2 rounded-full transition-all duration-300 animate-pulse"
                        style={{ width: `${generationProgress.progress}%` }}
                      />
                    </div>
                    {generationProgress.estimatedTimeRemaining !== null && generationProgress.estimatedTimeRemaining > 0 && (
                      <p className="text-xs text-muted-foreground text-center">
                        {formatTimeRemaining(generationProgress.estimatedTimeRemaining)}
                      </p>
                    )}
                    <button
                      onClick={handleCancelGeneration}
                      disabled={cancelling}
                      className="w-full px-4 py-2 bg-destructive/20 hover:bg-destructive/30 text-destructive font-medium rounded-lg transition-colors disabled:opacity-50"
                    >
                      {cancelling ? 'Cancelling...' : 'Cancel Generation'}
                    </button>
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
                      Generating Workflow...
                    </span>
                  ) : (
                    'Generate Workflow'
                  )}
                </button>

                {!isReadyToGenerate && !generating && (
                  <p className="mt-2 text-center text-sm text-muted-foreground">
                    {!n8nUrl || !n8nApiKey
                      ? 'Please enter your n8n credentials above'
                      : 'Please enter a workflow description (at least 10 characters)'}
                  </p>
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

          {/* Info Section */}
          <div className="bg-card/50 rounded-lg p-4 border border-border/50">
            <p className="text-sm text-muted-foreground text-center">
              Your API keys are stored locally in your browser and are only sent directly to n8n and Google AI services.
              <br />
              <span className="text-primary">No account required</span> - just enter your credentials and start creating workflows.
            </p>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default SimplifiedWorkflowPage;
