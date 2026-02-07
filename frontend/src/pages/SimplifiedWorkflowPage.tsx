import React, { useState, useEffect, useRef, useMemo } from 'react';
import axios from 'axios';
import { io, Socket } from 'socket.io-client';
import { motion, AnimatePresence } from 'motion/react';
import { Settings, Eye, EyeOff, ExternalLink, ChevronDown, Sparkles, Copy, Check, X, Loader2, RotateCcw, Zap, ArrowRight } from 'lucide-react';
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
  workflow?: Record<string, any>;
}

interface PreviewResult {
  previewId: string;
  workflow: Record<string, unknown>;
  nodeCount: number;
  explanation?: string;
  credentials?: CredentialRequirement[];
  originalDescription?: string;
}

const STORAGE_KEYS = {
  N8N_URL: 'rise_n8n_url',
  N8N_API_KEY: 'rise_n8n_api_key',
  GEMINI_API_KEY: 'rise_gemini_api_key',
};

const DEFAULT_N8N_URL = 'https://n8n.risecodes.com/';

// Nathan's mood states drive his expressions
type NathanMood = 'idle' | 'listening' | 'thinking' | 'excited' | 'success' | 'error';

// The friendly blob avatar for Nathan
const NathanAvatar: React.FC<{ mood: NathanMood; size?: 'sm' | 'md' | 'lg' }> = ({ mood, size = 'md' }) => {
  const sizeMap = { sm: 48, md: 80, lg: 120 };
  const s = sizeMap[size];

  const eyeVariants: Record<NathanMood, { left: string; right: string }> = {
    idle: { left: 'translate(0, 0)', right: 'translate(0, 0)' },
    listening: { left: 'translate(-1px, -1px)', right: 'translate(1px, -1px)' },
    thinking: { left: 'translate(2px, -1px)', right: 'translate(2px, -1px)' },
    excited: { left: 'translate(0, -2px) scale(1.2)', right: 'translate(0, -2px) scale(1.2)' },
    success: { left: 'translate(0, 0) scale(1.1)', right: 'translate(0, 0) scale(1.1)' },
    error: { left: 'translate(0, 2px)', right: 'translate(0, 2px)' },
  };

  const mouthPath: Record<NathanMood, string> = {
    idle: 'M 30 58 Q 40 64 50 58',
    listening: 'M 32 60 Q 40 63 48 60',
    thinking: 'M 33 58 Q 40 60 47 58',
    excited: 'M 28 56 Q 40 68 52 56',
    success: 'M 26 54 Q 40 70 54 54',
    error: 'M 32 62 Q 40 56 48 62',
  };

  const blobColors: Record<NathanMood, string[]> = {
    idle: ['#ff9a78', '#ffb08a'],
    listening: ['#ffb08a', '#ffd0b8'],
    thinking: ['#e6a070', '#ff9a78'],
    excited: ['#ff7a50', '#ffb08a'],
    success: ['#4ade80', '#86efac'],
    error: ['#f87171', '#fca5a5'],
  };

  const colors = blobColors[mood];
  const eyes = eyeVariants[mood];

  return (
    <motion.div
      className="relative inline-flex"
      animate={mood === 'thinking' ? { rotate: [0, -2, 2, -1, 0] } : { rotate: 0 }}
      transition={{ duration: 2, repeat: mood === 'thinking' ? Infinity : 0, ease: 'easeInOut' }}
    >
      <svg width={s} height={s} viewBox="0 0 80 80" fill="none">
        {/* Glow behind blob */}
        <defs>
          <radialGradient id={`nathan-glow-${mood}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={colors[0]} stopOpacity="0.3" />
            <stop offset="100%" stopColor={colors[0]} stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`nathan-fill-${mood}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={colors[0]} />
            <stop offset="100%" stopColor={colors[1]} />
          </linearGradient>
        </defs>
        {/* Ambient glow */}
        <circle cx="40" cy="40" r="38" fill={`url(#nathan-glow-${mood})`} />
        {/* Body blob — use CSS scale instead of SVG attribute animation */}
        <motion.ellipse
          cx="40" cy="40" rx="28" ry="26"
          fill={`url(#nathan-fill-${mood})`}
          style={{ transformOrigin: '40px 40px' }}
          animate={mood === 'idle'
            ? { scaleX: [1, 0.98, 1], scaleY: [1, 1.03, 1] }
            : mood === 'excited'
            ? { scaleX: [1, 1.04, 0.96, 1], scaleY: [1, 0.92, 1.08, 1] }
            : { scaleX: 1, scaleY: 1 }
          }
          transition={{ duration: mood === 'excited' ? 0.6 : 3, repeat: Infinity, ease: 'easeInOut' }}
        />
        {/* Left eye */}
        <motion.circle
          cx="32" cy="38" r={mood === 'success' ? 3.5 : 3}
          fill="#1e1814"
          style={{ transform: eyes.left, transformOrigin: '32px 38px' }}
        />
        {/* Right eye */}
        <motion.circle
          cx="48" cy="38" r={mood === 'success' ? 3.5 : 3}
          fill="#1e1814"
          style={{ transform: eyes.right, transformOrigin: '48px 38px' }}
        />
        {/* Eye highlights */}
        <circle cx="33.5" cy="36.5" r="1" fill="white" opacity="0.8" />
        <circle cx="49.5" cy="36.5" r="1" fill="white" opacity="0.8" />
        {/* Mouth */}
        <motion.path
          d={mouthPath[mood]}
          stroke="#1e1814"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
          initial={false}
        />
        {/* Blush cheeks */}
        <circle cx="24" cy="44" r="4" fill={colors[0]} opacity="0.3" />
        <circle cx="56" cy="44" r="4" fill={colors[0]} opacity="0.3" />
      </svg>
    </motion.div>
  );
};

// Floating particles background
const FloatingParticles: React.FC = () => {
  const particles = useMemo(() =>
    Array.from({ length: 20 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 3 + 1,
      duration: Math.random() * 10 + 15,
      delay: Math.random() * 5,
      opacity: Math.random() * 0.15 + 0.05,
    })), []);

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full bg-primary/30"
          style={{
            width: p.size,
            height: p.size,
            left: `${p.x}%`,
            top: `${p.y}%`,
            opacity: p.opacity,
          }}
          animate={{
            y: [0, -30, 0],
            x: [0, Math.random() * 20 - 10, 0],
            opacity: [p.opacity, p.opacity * 1.5, p.opacity],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
};

// Suggestion chips for quick workflow ideas
const SUGGESTIONS = [
  'Read new Gmail emails and save to Google Sheets',
  'Summarize Google Docs with AI daily',
  'Webhook receives data, process with Gemini, store in database',
  'Monitor Google Sheet changes and send email alerts',
];

const SimplifiedWorkflowPage: React.FC = () => {
  const socketRef = useRef<Socket | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Credentials
  const [n8nUrl, setN8nUrl] = useState(() => localStorage.getItem(STORAGE_KEYS.N8N_URL) || DEFAULT_N8N_URL);
  const [n8nApiKey, setN8nApiKey] = useState(() => localStorage.getItem(STORAGE_KEYS.N8N_API_KEY) || '');
  const [geminiApiKey, setGeminiApiKey] = useState(() => localStorage.getItem(STORAGE_KEYS.GEMINI_API_KEY) || '');
  const [showApiKeys, setShowApiKeys] = useState(false);
  const [showGeminiKey, setShowGeminiKey] = useState(false);

  // Workflow state
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
  const [copiedJSON, setCopiedJSON] = useState(false);

  // UI state
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState('');
  const [validationSuccess, setValidationSuccess] = useState('');

  // Nathan's mood
  const nathanMood: NathanMood = generationResult?.success
    ? 'success'
    : generationResult && !generationResult.success
    ? 'error'
    : generating
    ? 'thinking'
    : workflowDescription.length > 0
    ? 'listening'
    : previewResult
    ? 'excited'
    : 'idle';

  // Persist credentials
  useEffect(() => { localStorage.setItem(STORAGE_KEYS.N8N_URL, n8nUrl); }, [n8nUrl]);
  useEffect(() => { localStorage.setItem(STORAGE_KEYS.N8N_API_KEY, n8nApiKey); }, [n8nApiKey]);
  useEffect(() => { localStorage.setItem(STORAGE_KEYS.GEMINI_API_KEY, geminiApiKey); }, [geminiApiKey]);

  // Socket.io connection
  useEffect(() => {
    socketRef.current = io(`${API_URL}`);
    socketRef.current.on('connect', () => console.log('Socket connected:', socketRef.current?.id));
    socketRef.current.on('workflow:progress', (data) => {
      setGenerationProgress({ message: data.message, progress: data.progress, estimatedTimeRemaining: data.estimatedTimeRemaining ?? null });
    });
    socketRef.current.on('workflow:complete', (data: GenerationResult) => {
      setGenerating(false);
      setCurrentGenerationId(null);
      setGenerationResult(data);
    });
    socketRef.current.on('workflow:error', (data) => {
      setGenerating(false);
      setCurrentGenerationId(null);
      setError(data.error || 'Workflow generation failed');
    });
    socketRef.current.on('workflow:cancelled', () => {
      setGenerating(false);
      setCancelling(false);
      setCurrentGenerationId(null);
    });
    return () => { socketRef.current?.disconnect(); };
  }, []);

  const handleValidateConnection = async () => {
    setError('');
    setValidationSuccess('');
    if (!n8nUrl || !n8nApiKey) { setError('Please enter both n8n URL and API key'); return; }
    try {
      setValidating(true);
      const response = await axios.post(`${API_URL}/api/public/validate-n8n`, { url: n8nUrl, apiKey: n8nApiKey });
      if (response.data.valid) setValidationSuccess(response.data.message || 'Connection successful!');
    } catch (err: any) {
      if (err.code === 'ERR_NETWORK' || !err.response) setError('Cannot reach backend server. Is it running on localhost:3000?');
      else setError(err.response?.data?.error || 'Failed to validate n8n connection');
    } finally { setValidating(false); }
  };

  const handleGenerateWorkflow = async () => {
    setError('');
    setGenerationResult(null);
    setPreviewResult(null);
    if (!n8nUrl || !n8nApiKey) { setError('Please configure your n8n credentials first'); setShowSettings(true); return; }
    if (!workflowDescription.trim() || workflowDescription.trim().length < 10) { setError('Tell me more about what you need (at least 10 characters)'); return; }
    try {
      setGenerating(true);
      setGenerationProgress({ message: 'Generating preview...', progress: 50, estimatedTimeRemaining: null });
      const response = await axios.post(`${API_URL}/api/public/preview-workflow`, {
        n8nUrl, n8nApiKey, description: workflowDescription, geminiApiKey: geminiApiKey.trim() || undefined,
      });
      setPreviewResult(response.data);
      setGenerating(false);
      setGenerationProgress({ message: '', progress: 0, estimatedTimeRemaining: null });
    } catch (err: any) {
      setGenerating(false);
      if (!err.response) setError('Connection failed. Check your network and try again.');
      else if (err.response.status === 429) setError(`Too many requests. Wait ${err.response.data?.retryAfter || '15 minutes'} and try again.`);
      else if (err.response.status >= 500) setError('Server error. Please try again later.');
      else setError(err.response.data?.error || 'Failed to generate workflow.');
    }
  };

  const handleCreateFromPreview = async () => {
    if (!previewResult) return;
    setCreatingFromPreview(true);
    setError('');
    try {
      const response = await axios.post(`${API_URL}/api/public/create-workflow`, {
        n8nUrl, n8nApiKey, previewId: previewResult.previewId,
      });
      setGenerationResult({
        generationId: response.data.generationId || 'preview',
        success: response.data.success,
        n8nWorkflowId: response.data.n8nWorkflowId,
        n8nWorkflowUrl: response.data.n8nWorkflowUrl,
        nodesUsed: response.data.nodesUsed,
        credentials: previewResult.credentials,
        originalDescription: previewResult.originalDescription,
        workflow: response.data.workflow || previewResult.workflow,
      });
      setPreviewResult(null);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create workflow in n8n');
    } finally { setCreatingFromPreview(false); }
  };

  const handleCancelGeneration = async () => {
    if (!currentGenerationId) return;
    try {
      setCancelling(true);
      await axios.post(`${API_URL}/api/public/cancel-workflow/${currentGenerationId}`, { socketId: socketRef.current?.id });
    } catch (err: any) {
      setCancelling(false);
      setError(err.response?.data?.error || 'Failed to cancel');
    }
  };

  const handleNewWorkflow = () => {
    setWorkflowDescription('');
    setGenerationResult(null);
    setCurrentGenerationId(null);
    setCancelling(false);
    setGenerationProgress({ message: '', progress: 0, estimatedTimeRemaining: null });
    setPreviewResult(null);
    setError('');
    setShowWorkflowJSON(false);
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

  const handleCopyJSON = () => {
    if (generationResult?.workflow) {
      navigator.clipboard.writeText(JSON.stringify(generationResult.workflow, null, 2));
      setCopiedJSON(true);
      setTimeout(() => setCopiedJSON(false), 2000);
    }
  };

  const isReadyToGenerate = n8nUrl && n8nApiKey && workflowDescription.length >= 10;

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
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-3"
      >
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-foreground font-display">Workflow Flow</h4>
          <button onClick={() => setShowFlowDetails(false)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            Hide
          </button>
        </div>
        <div className="overflow-x-auto pb-2">
          <div className="inline-flex items-center gap-2">
            {sortedColumns.map((column, colIndex) => (
              <React.Fragment key={`col-${colIndex}`}>
                <div className="flex flex-col gap-2 min-w-[140px]">
                  {column.map((node, nodeIndex) => (
                    <motion.div
                      key={node.id}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: colIndex * 0.1 + nodeIndex * 0.05 }}
                      className="rounded-xl border border-border bg-card/80 px-3 py-2.5 text-xs shadow-soft hover:shadow-soft-lg hover:border-primary/30 transition-all"
                    >
                      <div className="font-semibold text-sm text-foreground">{node.name}</div>
                      <div className="text-[10px] text-muted-foreground truncate mt-0.5 opacity-70">{node.type.split('.').pop()}</div>
                    </motion.div>
                  ))}
                </div>
                {colIndex < sortedColumns.length - 1 && (
                  <ArrowRight className="w-4 h-4 text-primary/40 flex-shrink-0" />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      </motion.div>
    );
  };

  return (
    <div className="min-h-screen bg-background flex flex-col relative overflow-hidden">
      {/* Subtle noise texture */}
      <div className="noise-overlay" />

      {/* Warm gradient orbs in background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-primary/5 blur-3xl animate-blob" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-secondary/5 blur-3xl animate-blob" style={{ animationDelay: '3s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-primary/3 blur-3xl animate-glow-pulse" />
      </div>

      <FloatingParticles />

      {/* Header — minimal, warm */}
      <header className="relative z-10 border-b border-border/50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-3">
              <NathanAvatar mood={nathanMood} size="sm" />
              <div>
                <h1 className="text-lg font-display font-bold text-foreground tracking-tight">
                  Friendly Nathan
                </h1>
                <p className="text-[11px] text-muted-foreground tracking-wide uppercase">
                  n8n workflow builder
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`p-2.5 rounded-xl transition-all ${
                showSettings
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
              title="Settings"
            >
              <Settings className="w-5 h-5" />
              {validationSuccess && !showSettings && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-accent rounded-full" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Settings Panel — slides down */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="relative z-10 overflow-hidden border-b border-border/50"
          >
            <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-display font-semibold text-foreground uppercase tracking-wider">Configuration</h2>
                <div className="flex items-center gap-3">
                  {(n8nApiKey || geminiApiKey) && (
                    <button onClick={handleClearCredentials} className="text-xs text-muted-foreground hover:text-destructive transition-colors">
                      Clear all
                    </button>
                  )}
                  <button onClick={() => setShowSettings(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <p className="text-xs text-muted-foreground mb-5">
                Saved locally in your browser. Never sent to our servers.
              </p>

              <div className="grid gap-4 sm:grid-cols-2">
                {/* n8n URL */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">
                    n8n Instance URL
                  </label>
                  <input
                    type="url"
                    value={n8nUrl}
                    onChange={(e) => { setN8nUrl(e.target.value); setValidationSuccess(''); }}
                    placeholder={DEFAULT_N8N_URL}
                    className="w-full px-3.5 py-2.5 border border-border rounded-xl bg-input text-foreground text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all warm-focus"
                    disabled={generating}
                  />
                </div>

                {/* n8n API Key */}
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">
                    n8n API Key <span className="text-primary">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showApiKeys ? 'text' : 'password'}
                      value={n8nApiKey}
                      onChange={(e) => { setN8nApiKey(e.target.value); setValidationSuccess(''); }}
                      placeholder="Your n8n API key"
                      className="w-full px-3.5 py-2.5 border border-border rounded-xl bg-input text-foreground text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all pr-12 warm-focus"
                      disabled={generating}
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKeys(!showApiKeys)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showApiKeys ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Gemini API Key */}
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">
                    Gemini API Key <span className="text-muted-foreground/50">(optional)</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showGeminiKey ? 'text' : 'password'}
                      value={geminiApiKey}
                      onChange={(e) => setGeminiApiKey(e.target.value)}
                      placeholder="AIzaSy..."
                      className="w-full px-3.5 py-2.5 border border-border rounded-xl bg-input text-foreground text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all pr-12 warm-focus"
                      disabled={generating}
                    />
                    <button
                      type="button"
                      onClick={() => setShowGeminiKey(!showGeminiKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showGeminiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    From{' '}
                    <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      Google AI Studio
                    </a>
                  </p>
                </div>
              </div>

              {/* Validate & Messages */}
              <div className="mt-5 space-y-3">
                <button
                  onClick={handleValidateConnection}
                  disabled={validating || generating || !n8nUrl || !n8nApiKey}
                  className="px-5 py-2 bg-muted hover:bg-muted/80 text-foreground text-sm font-medium rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {validating ? 'Testing...' : 'Test Connection'}
                </button>

                <AnimatePresence mode="wait">
                  {validationSuccess && (
                    <motion.p initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-sm text-accent flex items-center gap-1.5">
                      <Check className="w-4 h-4" /> {validationSuccess}
                    </motion.p>
                  )}
                  {error && !generating && (
                    <motion.p initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-sm text-destructive">
                      {error}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main id="main-content" className="relative z-10 flex-1 flex flex-col">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 w-full flex-1 flex flex-col py-8 sm:py-12">

          {!generationResult ? (
            <div className="flex-1 flex flex-col">

              {/* Hero section with Nathan */}
              {!previewResult && !generating && workflowDescription.length === 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                  className="text-center mb-8 sm:mb-12"
                >
                  <motion.div
                    className="inline-block mb-4"
                    animate={{ y: [0, -8, 0] }}
                    transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                  >
                    <NathanAvatar mood="idle" size="lg" />
                  </motion.div>
                  <h2 className="font-display text-3xl sm:text-4xl font-bold text-foreground tracking-tight mb-3">
                    Hey, I'm <span className="gradient-text">Nathan</span>
                  </h2>
                  <p className="text-muted-foreground text-base sm:text-lg max-w-md mx-auto leading-relaxed">
                    Tell me what workflow you need and I'll build it for you in n8n. No coding required.
                  </p>
                </motion.div>
              )}

              {/* Textarea — the main interaction */}
              <div className="relative">
                {generating && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="absolute -top-14 left-0 right-0 flex items-center justify-center gap-3"
                  >
                    <NathanAvatar mood="thinking" size="sm" />
                    <div>
                      <p className="text-sm font-medium text-foreground">{generationProgress.message || 'Thinking...'}</p>
                      <div className="mt-1.5 w-48 h-1.5 bg-muted rounded-full overflow-hidden">
                        <motion.div
                          className="h-full bg-gradient-to-r from-primary to-secondary rounded-full"
                          animate={{ width: `${generationProgress.progress}%` }}
                          transition={{ duration: 0.5 }}
                        />
                      </div>
                    </div>
                  </motion.div>
                )}

                <div className={`relative rounded-2xl border transition-all duration-300 ${
                  generating
                    ? 'border-primary/30 shadow-glow-peach'
                    : workflowDescription.length > 0
                    ? 'border-border/80 shadow-soft-lg'
                    : 'border-border/50 shadow-soft'
                }`}>
                  <textarea
                    ref={textareaRef}
                    value={workflowDescription}
                    onChange={(e) => setWorkflowDescription(e.target.value)}
                    placeholder="Describe the workflow you want to create..."
                    rows={4}
                    className="w-full px-5 py-4 bg-card/60 text-foreground rounded-2xl resize-none focus:outline-none text-base leading-relaxed placeholder:text-muted-foreground/50"
                    disabled={generating}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && isReadyToGenerate && !generating) {
                        handleGenerateWorkflow();
                      }
                    }}
                  />

                  {/* Bottom bar inside textarea container */}
                  <div className="flex items-center justify-between px-5 py-3 border-t border-border/30">
                    <div className="flex items-center gap-2">
                      {workflowDescription.length > 0 && (
                        <span className={`text-xs ${workflowDescription.length < 10 ? 'text-destructive/70' : 'text-muted-foreground/50'}`}>
                          {workflowDescription.length} chars
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {workflowDescription.length > 0 && !generating && (
                        <button
                          onClick={() => setWorkflowDescription('')}
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-lg hover:bg-muted/50"
                        >
                          Clear
                        </button>
                      )}
                      {generating && currentGenerationId && (
                        <button
                          onClick={handleCancelGeneration}
                          disabled={cancelling}
                          className="text-xs text-destructive/80 hover:text-destructive transition-colors px-2 py-1 rounded-lg hover:bg-destructive/10"
                        >
                          {cancelling ? 'Cancelling...' : 'Cancel'}
                        </button>
                      )}
                      <button
                        onClick={handleGenerateWorkflow}
                        disabled={generating || !isReadyToGenerate}
                        className={`inline-flex items-center gap-2 px-5 py-2 rounded-xl font-medium text-sm transition-all ${
                          isReadyToGenerate && !generating
                            ? 'bg-primary text-primary-foreground hover:shadow-glow-peach active:scale-[0.98]'
                            : 'bg-muted text-muted-foreground cursor-not-allowed opacity-50'
                        }`}
                      >
                        {generating ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Building...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4" />
                            Generate
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Keyboard shortcut hint */}
                {isReadyToGenerate && !generating && !previewResult && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-center text-[11px] text-muted-foreground/40 mt-2"
                  >
                    Press <kbd className="px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground/60 font-mono text-[10px]">{navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}</kbd> + <kbd className="px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground/60 font-mono text-[10px]">Enter</kbd> to generate
                  </motion.p>
                )}

                {/* Not ready hint */}
                {!isReadyToGenerate && !generating && !previewResult && workflowDescription.length === 0 && (
                  <div className="mt-1.5">
                    {!n8nApiKey && (
                      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center text-xs text-muted-foreground/60">
                        <button onClick={() => setShowSettings(true)} className="text-primary/70 hover:text-primary underline underline-offset-2 transition-colors">
                          Set up your n8n connection
                        </button>
                        {' '}to get started
                      </motion.p>
                    )}
                  </div>
                )}
              </div>

              {/* Suggestion chips */}
              {!generating && !previewResult && workflowDescription.length === 0 && n8nApiKey && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="mt-6 sm:mt-8"
                >
                  <p className="text-xs text-muted-foreground/50 mb-3 text-center uppercase tracking-wider font-medium">Try an idea</p>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {SUGGESTIONS.map((suggestion, i) => (
                      <motion.button
                        key={i}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.4 + i * 0.08 }}
                        onClick={() => {
                          setWorkflowDescription(suggestion);
                          textareaRef.current?.focus();
                        }}
                        className="px-3.5 py-2 text-xs text-muted-foreground bg-muted/30 hover:bg-muted/50 border border-border/30 hover:border-primary/20 rounded-full transition-all hover:text-foreground hover:shadow-soft"
                      >
                        {suggestion}
                      </motion.button>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Error display */}
              <AnimatePresence>
                {error && !generating && !showSettings && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="mt-4 px-4 py-3 rounded-xl bg-destructive/10 border border-destructive/20 text-sm text-destructive flex items-start gap-2"
                  >
                    <X className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Preview Result */}
              <AnimatePresence>
                {previewResult && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className="mt-6 space-y-4"
                  >
                    {/* Preview header */}
                    <div className="flex items-center gap-3">
                      <NathanAvatar mood="excited" size="sm" />
                      <div>
                        <h3 className="font-display font-semibold text-foreground">Here's your workflow!</h3>
                        <p className="text-xs text-muted-foreground">Review it below and deploy when ready</p>
                      </div>
                      <button
                        onClick={() => setPreviewResult(null)}
                        className="ml-auto text-xs text-muted-foreground hover:text-foreground transition-colors"
                        disabled={creatingFromPreview}
                      >
                        Dismiss
                      </button>
                    </div>

                    {/* Original request */}
                    {previewResult.originalDescription && (
                      <div className="px-4 py-3 bg-muted/20 rounded-xl border border-border/30">
                        <p className="text-xs text-muted-foreground/70 mb-1 uppercase tracking-wider font-medium">Your request</p>
                        <p className="text-sm text-foreground/80 italic">"{previewResult.originalDescription}"</p>
                      </div>
                    )}

                    {previewResult.explanation && (
                      <p className="text-sm text-muted-foreground leading-relaxed">{previewResult.explanation}</p>
                    )}

                    {/* Flow preview */}
                    <div className="rounded-2xl border border-border/50 bg-card/40 p-4 space-y-4">
                      {showFlowDetails ? renderFlowPreview() : (
                        <button onClick={() => setShowFlowDetails(true)} className="text-xs text-primary hover:underline">
                          Show flow preview
                        </button>
                      )}

                      {/* JSON toggle */}
                      <div className="border-t border-border/30 pt-3">
                        <JsonSyntaxHighlight data={previewResult.workflow} />
                      </div>
                    </div>

                    {/* Deploy button */}
                    <motion.button
                      onClick={handleCreateFromPreview}
                      disabled={creatingFromPreview}
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      className="w-full py-4 bg-gradient-to-r from-primary via-primary to-secondary text-primary-foreground font-display font-bold text-lg rounded-2xl transition-all shadow-glow-peach hover:shadow-glow-peach-lg disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {creatingFromPreview ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Deploying to n8n...
                        </>
                      ) : (
                        <>
                          <Zap className="w-5 h-5" />
                          Deploy to n8n
                        </>
                      )}
                    </motion.button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            /* Generation Result */
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              {generationResult.success ? (
                <>
                  {/* Success celebration */}
                  <div className="text-center py-4">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                      className="inline-block mb-4"
                    >
                      <NathanAvatar mood="success" size="lg" />
                    </motion.div>
                    <motion.h2
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                      className="font-display text-2xl sm:text-3xl font-bold text-foreground mb-2"
                    >
                      Workflow is <span className="text-accent">live!</span>
                    </motion.h2>
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.4 }}
                      className="text-muted-foreground"
                    >
                      {generationResult.nodesUsed} nodes created in your n8n instance
                    </motion.p>
                  </div>

                  {/* Original request */}
                  {generationResult.originalDescription && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 }}
                      className="px-4 py-3 bg-muted/20 rounded-xl border border-border/30"
                    >
                      <p className="text-xs text-muted-foreground/70 mb-1 uppercase tracking-wider font-medium">Built from your request</p>
                      <p className="text-sm text-foreground/80 italic">"{generationResult.originalDescription}"</p>
                    </motion.div>
                  )}

                  {/* Workflow JSON viewer */}
                  {generationResult.workflow && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4 }}
                      className="rounded-2xl border border-border/50 overflow-hidden"
                    >
                      <button
                        onClick={() => setShowWorkflowJSON(!showWorkflowJSON)}
                        className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/20 transition-colors"
                      >
                        <span className="text-sm font-medium text-foreground flex items-center gap-2">
                          <span className="text-xs font-mono text-muted-foreground">{'{ }'}</span>
                          Workflow JSON
                        </span>
                        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${showWorkflowJSON ? 'rotate-180' : ''}`} />
                      </button>
                      <AnimatePresence>
                        {showWorkflowJSON && (
                          <motion.div
                            initial={{ height: 0 }}
                            animate={{ height: 'auto' }}
                            exit={{ height: 0 }}
                            className="overflow-hidden border-t border-border/30"
                          >
                            <div className="p-4 relative">
                              <button
                                onClick={handleCopyJSON}
                                className="absolute top-6 right-6 z-10 px-3 py-1.5 text-xs bg-muted/80 hover:bg-muted text-foreground rounded-lg transition-colors flex items-center gap-1.5"
                              >
                                {copiedJSON ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                {copiedJSON ? 'Copied!' : 'Copy'}
                              </button>
                              <pre className="text-xs text-foreground/80 bg-background/50 p-4 rounded-xl border border-border/30 overflow-x-auto max-h-96 overflow-y-auto font-mono">
                                <code>{JSON.stringify(generationResult.workflow, null, 2)}</code>
                              </pre>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  )}

                  {/* Credentials */}
                  {generationResult.credentials && generationResult.credentials.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.5 }}
                      className="rounded-2xl border border-secondary/20 bg-secondary/5 p-5"
                    >
                      <h4 className="font-display font-semibold text-secondary mb-1">Credentials Needed</h4>
                      <p className="text-xs text-muted-foreground mb-4">
                        Configure these in your n8n instance to activate the workflow
                      </p>
                      <div className="space-y-2">
                        {generationResult.credentials.map((cred, index) => {
                          const isExpanded = expandedCredentials.has(cred.type);
                          return (
                            <div key={index} className="rounded-xl border border-secondary/10 bg-card/50 overflow-hidden">
                              <button
                                onClick={() => {
                                  const newExpanded = new Set(expandedCredentials);
                                  isExpanded ? newExpanded.delete(cred.type) : newExpanded.add(cred.type);
                                  setExpandedCredentials(newExpanded);
                                }}
                                className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-muted/30 transition-colors"
                              >
                                <div>
                                  <h5 className="font-semibold text-sm text-foreground">{cred.displayName}</h5>
                                  <p className="text-xs text-muted-foreground">{cred.instructions}</p>
                                </div>
                                <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform flex-shrink-0 ml-2 ${isExpanded ? 'rotate-180' : ''}`} />
                              </button>
                              <AnimatePresence>
                                {isExpanded && (
                                  <motion.div
                                    initial={{ height: 0 }}
                                    animate={{ height: 'auto' }}
                                    exit={{ height: 0 }}
                                    className="overflow-hidden"
                                  >
                                    <div className="px-4 pb-4 border-t border-border/30 pt-3">
                                      {cred.steps?.length > 0 && (
                                        <ol className="list-decimal list-inside space-y-1 mb-3">
                                          {cred.steps.map((step, si) => (
                                            <li key={si} className="text-sm text-muted-foreground">{step}</li>
                                          ))}
                                        </ol>
                                      )}
                                      <div className="flex flex-wrap gap-3">
                                        {cred.documentationUrl && (
                                          <a href={cred.documentationUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                                            Docs <ExternalLink className="w-3 h-3" />
                                          </a>
                                        )}
                                        {cred.videoUrl && (
                                          <a href={cred.videoUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                                            Video guide <ExternalLink className="w-3 h-3" />
                                          </a>
                                        )}
                                      </div>
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}

                  {/* Action buttons */}
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6 }}
                    className="space-y-3"
                  >
                    <a
                      href={generationResult.n8nWorkflowUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full py-4 bg-gradient-to-r from-primary via-primary to-secondary text-primary-foreground font-display font-bold text-lg rounded-2xl transition-all shadow-glow-peach hover:shadow-glow-peach-lg"
                    >
                      Open in n8n <ExternalLink className="w-5 h-5" />
                    </a>
                    <button
                      onClick={handleNewWorkflow}
                      className="flex items-center justify-center gap-2 w-full py-3 bg-muted/30 hover:bg-muted/50 text-foreground font-medium rounded-2xl transition-all border border-border/30"
                    >
                      <RotateCcw className="w-4 h-4" /> Create another
                    </button>
                  </motion.div>
                </>
              ) : (
                /* Error result */
                <div className="text-center py-8">
                  <NathanAvatar mood="error" size="lg" />
                  <h2 className="font-display text-2xl font-bold text-foreground mt-4 mb-2">Oops, something went wrong</h2>
                  <p className="text-muted-foreground mb-6">{generationResult.error}</p>
                  <button
                    onClick={handleNewWorkflow}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground font-medium rounded-2xl transition-all hover:shadow-glow-peach"
                  >
                    <RotateCcw className="w-4 h-4" /> Let's try again
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </div>
      </main>

      {/* Minimal footer */}
      <footer className="relative z-10 border-t border-border/30 py-4">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 flex items-center justify-between">
          <p className="text-[11px] text-muted-foreground/40">
            Friendly Nathan &middot; AI-powered n8n workflows
          </p>
          <p className="text-[11px] text-muted-foreground/30">
            Powered by Gemini
          </p>
        </div>
      </footer>
    </div>
  );
};

export default SimplifiedWorkflowPage;
