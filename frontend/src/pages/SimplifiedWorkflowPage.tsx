import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import axios from 'axios';
import { io, Socket } from 'socket.io-client';
import { motion, AnimatePresence } from 'motion/react';
import { Settings, Eye, EyeOff, ExternalLink, ChevronDown, Sparkles, Copy, Check, X, Loader2, RotateCcw, Zap, ArrowRight, Sun, Heart } from 'lucide-react';
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

interface ClarificationQuestion {
  question: string;
  context: string;
  options?: string[];
}

interface PreviewResult {
  previewId: string;
  workflow: Record<string, unknown>;
  nodeCount: number;
  explanation?: string;
  credentials?: CredentialRequirement[];
  originalDescription?: string;
  clarifications?: ClarificationQuestion[];
}

const STORAGE_KEYS = {
  N8N_URL: 'rise_n8n_url',
  N8N_API_KEY: 'rise_n8n_api_key',
  VERTEX_SA_EMAIL: 'rise_vertex_sa_email',
  VERTEX_PRIVATE_KEY: 'rise_vertex_private_key',
};

const DEFAULT_N8N_URL = 'https://n8n.risecodes.com/';

// Nathan's mood states drive his expressions
type NathanMood = 'idle' | 'listening' | 'thinking' | 'excited' | 'success' | 'error';

// Friendly greeting based on time of day
const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning!';
  if (hour < 17) return 'Good afternoon!';
  return 'Good evening!';
};

// The friendly blob avatar for Nathan — bigger, bouncier, more expressive
const NathanAvatar: React.FC<{ mood: NathanMood; size?: 'sm' | 'md' | 'lg' | 'xl' }> = ({ mood, size = 'md' }) => {
  const sizeMap = { sm: 52, md: 80, lg: 130, xl: 160 };
  const s = sizeMap[size];

  const eyeVariants: Record<NathanMood, { left: string; right: string }> = {
    idle: { left: 'translate(0, 0)', right: 'translate(0, 0)' },
    listening: { left: 'translate(-1px, -1px)', right: 'translate(1px, -1px)' },
    thinking: { left: 'translate(3px, -1px)', right: 'translate(3px, -1px)' },
    excited: { left: 'translate(0, -2px) scale(1.3)', right: 'translate(0, -2px) scale(1.3)' },
    success: { left: 'translate(0, 0) scale(1.15)', right: 'translate(0, 0) scale(1.15)' },
    error: { left: 'translate(0, 2px)', right: 'translate(0, 2px)' },
  };

  const mouthPath: Record<NathanMood, string> = {
    idle: 'M 30 58 Q 40 66 50 58',
    listening: 'M 32 59 Q 40 65 48 59',
    thinking: 'M 34 60 Q 40 58 46 60',
    excited: 'M 27 55 Q 40 72 53 55',
    success: 'M 25 53 Q 40 74 55 53',
    error: 'M 32 63 Q 40 57 48 63',
  };

  const blobColors: Record<NathanMood, string[]> = {
    idle: ['#ff9a78', '#ffb08a'],
    listening: ['#ffb08a', '#ffd0b8'],
    thinking: ['#e6a070', '#ffc09a'],
    excited: ['#ff7a50', '#ffb08a'],
    success: ['#34d399', '#6ee7b7'],
    error: ['#fb7185', '#fda4af'],
  };

  const colors = blobColors[mood];
  const eyes = eyeVariants[mood];

  return (
    <motion.div
      className="relative inline-flex"
      animate={mood === 'thinking' ? { rotate: [0, -3, 3, -1, 0] } : mood === 'excited' ? { rotate: [0, -2, 2, 0] } : { rotate: 0 }}
      transition={{ duration: mood === 'excited' ? 0.4 : 2, repeat: mood === 'thinking' || mood === 'excited' ? Infinity : 0, ease: 'easeInOut' }}
    >
      <svg width={s} height={s} viewBox="0 0 80 80" fill="none">
        {/* Warm glow behind blob */}
        <defs>
          <radialGradient id={`nathan-glow-${mood}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={colors[0]} stopOpacity="0.35" />
            <stop offset="100%" stopColor={colors[0]} stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`nathan-fill-${mood}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={colors[0]} />
            <stop offset="100%" stopColor={colors[1]} />
          </linearGradient>
        </defs>
        {/* Ambient glow */}
        <circle cx="40" cy="40" r="38" fill={`url(#nathan-glow-${mood})`} />
        {/* Body blob */}
        <motion.ellipse
          cx="40" cy="40" rx="28" ry="26"
          fill={`url(#nathan-fill-${mood})`}
          style={{ transformOrigin: '40px 40px' }}
          animate={mood === 'idle'
            ? { scaleX: [1, 0.97, 1], scaleY: [1, 1.04, 1] }
            : mood === 'excited'
            ? { scaleX: [1, 1.06, 0.94, 1], scaleY: [1, 0.9, 1.1, 1] }
            : mood === 'success'
            ? { scaleX: [1, 1.03, 1], scaleY: [1, 1.03, 1] }
            : { scaleX: 1, scaleY: 1 }
          }
          transition={{ duration: mood === 'excited' ? 0.5 : 3, repeat: Infinity, ease: 'easeInOut' }}
        />
        {/* Left eye */}
        <motion.circle
          cx="32" cy="37" r={mood === 'success' ? 3.5 : mood === 'excited' ? 3.8 : 3}
          fill="#2d1f14"
          style={{ transform: eyes.left, transformOrigin: '32px 37px' }}
        />
        {/* Right eye */}
        <motion.circle
          cx="48" cy="37" r={mood === 'success' ? 3.5 : mood === 'excited' ? 3.8 : 3}
          fill="#2d1f14"
          style={{ transform: eyes.right, transformOrigin: '48px 37px' }}
        />
        {/* Eye sparkle highlights */}
        <circle cx="33.5" cy="35.5" r="1.2" fill="white" opacity="0.9" />
        <circle cx="49.5" cy="35.5" r="1.2" fill="white" opacity="0.9" />
        {/* Mouth */}
        <motion.path
          d={mouthPath[mood]}
          stroke="#2d1f14"
          strokeWidth="2.2"
          strokeLinecap="round"
          fill={mood === 'excited' || mood === 'success' ? '#2d1f14' : 'none'}
          fillOpacity={mood === 'excited' || mood === 'success' ? 0.15 : 0}
          initial={false}
        />
        {/* Rosy blush cheeks */}
        <circle cx="22" cy="44" r="5" fill="#ff6b6b" opacity="0.18" />
        <circle cx="58" cy="44" r="5" fill="#ff6b6b" opacity="0.18" />
        {/* Tiny sparkle for success/excited */}
        {(mood === 'success' || mood === 'excited') && (
          <>
            <motion.circle
              cx="62" cy="22" r="1.5" fill="#fbbf24"
              animate={{ opacity: [0, 1, 0], scale: [0.5, 1.2, 0.5] }}
              transition={{ duration: 1.5, repeat: Infinity, delay: 0 }}
            />
            <motion.circle
              cx="18" cy="26" r="1" fill="#fbbf24"
              animate={{ opacity: [0, 1, 0], scale: [0.5, 1, 0.5] }}
              transition={{ duration: 1.5, repeat: Infinity, delay: 0.5 }}
            />
            <motion.circle
              cx="55" cy="14" r="1" fill="#34d399"
              animate={{ opacity: [0, 1, 0], scale: [0.5, 1, 0.5] }}
              transition={{ duration: 1.5, repeat: Infinity, delay: 1 }}
            />
          </>
        )}
      </svg>
    </motion.div>
  );
};

// Sunny floating shapes background — fewer shapes on mobile for performance
const SunnyBackground: React.FC = () => {
  const isMobileDevice = typeof window !== 'undefined' && window.innerWidth < 640;
  const shapeCount = isMobileDevice ? 7 : 15;
  const shapes = useMemo(() =>
    Array.from({ length: shapeCount }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 24 + 8,
      duration: Math.random() * 12 + 18,
      delay: Math.random() * 8,
      opacity: Math.random() * 0.12 + 0.04,
      type: ['circle', 'ring', 'dot'][Math.floor(Math.random() * 3)] as string,
      color: ['hsl(14 90% 58%)', 'hsl(172 66% 50%)', 'hsl(45 96% 58%)', 'hsl(330 80% 65%)'][Math.floor(Math.random() * 4)],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    })), [shapeCount]);

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
      {shapes.map((s) => (
        <motion.div
          key={s.id}
          className="absolute"
          style={{
            width: s.size,
            height: s.size,
            left: `${s.x}%`,
            top: `${s.y}%`,
            opacity: s.opacity,
            borderRadius: s.type === 'circle' ? '50%' : s.type === 'ring' ? '50%' : '50%',
            background: s.type === 'circle' ? s.color : 'transparent',
            border: s.type === 'ring' ? `2px solid ${s.color}` : 'none',
            boxShadow: s.type === 'dot' ? `inset 0 0 0 ${s.size / 2}px ${s.color}` : 'none',
          }}
          animate={{
            y: [0, -20, 0],
            x: [0, Math.random() * 15 - 7, 0],
            rotate: [0, s.type === 'ring' ? 180 : 0, s.type === 'ring' ? 360 : 0],
            opacity: [s.opacity, s.opacity * 1.8, s.opacity],
          }}
          transition={{
            duration: s.duration,
            delay: s.delay,
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
  { emoji: '📧', text: 'Read new Gmail emails and save to Google Sheets' },
  { emoji: '🤖', text: 'Summarize Google Docs with AI daily' },
  { emoji: '🔗', text: 'Webhook receives data, process with Gemini, store in database' },
  { emoji: '📊', text: 'Monitor Google Sheet changes and send email alerts' },
];

const useIsMobile = (breakpoint = 640) => {
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth < breakpoint : false
  );
  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [breakpoint]);
  return isMobile;
};

const SimplifiedWorkflowPage: React.FC = () => {
  const socketRef = useRef<Socket | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isMobile = useIsMobile();

  // Credentials
  const [n8nUrl, setN8nUrl] = useState(() => localStorage.getItem(STORAGE_KEYS.N8N_URL) || DEFAULT_N8N_URL);
  const [n8nApiKey, setN8nApiKey] = useState(() => localStorage.getItem(STORAGE_KEYS.N8N_API_KEY) || '');
  const [vertexSaEmail, setVertexSaEmail] = useState(() => localStorage.getItem(STORAGE_KEYS.VERTEX_SA_EMAIL) || '');
  const [vertexPrivateKey, setVertexPrivateKey] = useState(() => localStorage.getItem(STORAGE_KEYS.VERTEX_PRIVATE_KEY) || '');
  const [showApiKeys, setShowApiKeys] = useState(false);
  const [showVertexKey, setShowVertexKey] = useState(false);
  const [showVertexSection, setShowVertexSection] = useState(false);

  // Workflow state — restore draft from sessionStorage
  const [workflowDescription, setWorkflowDescription] = useState(
    () => sessionStorage.getItem('workflow_draft') || ''
  );
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
  useEffect(() => { localStorage.setItem(STORAGE_KEYS.VERTEX_SA_EMAIL, vertexSaEmail); }, [vertexSaEmail]);
  useEffect(() => { localStorage.setItem(STORAGE_KEYS.VERTEX_PRIVATE_KEY, vertexPrivateKey); }, [vertexPrivateKey]);

  // Auto-save workflow description draft
  useEffect(() => {
    const timer = setTimeout(() => {
      if (workflowDescription) {
        sessionStorage.setItem('workflow_draft', workflowDescription);
      } else {
        sessionStorage.removeItem('workflow_draft');
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [workflowDescription]);

  // Socket.io connection with proper cleanup
  useEffect(() => {
    const socket = io(`${API_URL}`);
    socketRef.current = socket;

    const onConnect = () => {
      if (import.meta.env.DEV) console.log('Socket connected:', socket.id);
    };
    const onProgress = (data: any) => {
      setGenerationProgress({ message: data.message, progress: data.progress, estimatedTimeRemaining: data.estimatedTimeRemaining ?? null });
    };
    const onComplete = (data: GenerationResult) => {
      setGenerating(false);
      setCurrentGenerationId(null);
      setGenerationResult(data);
    };
    const onError = (data: any) => {
      setGenerating(false);
      setCurrentGenerationId(null);
      setError(data.error || 'Workflow generation failed');
    };
    const onCancelled = () => {
      setGenerating(false);
      setCancelling(false);
      setCurrentGenerationId(null);
    };

    socket.on('connect', onConnect);
    socket.on('workflow:progress', onProgress);
    socket.on('workflow:complete', onComplete);
    socket.on('workflow:error', onError);
    socket.on('workflow:cancelled', onCancelled);

    return () => {
      socket.off('connect', onConnect);
      socket.off('workflow:progress', onProgress);
      socket.off('workflow:complete', onComplete);
      socket.off('workflow:error', onError);
      socket.off('workflow:cancelled', onCancelled);
      socket.disconnect();
    };
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
        n8nUrl, n8nApiKey, description: workflowDescription, vertexSaEmail: vertexSaEmail.trim() || undefined, vertexPrivateKey: vertexPrivateKey.trim() || undefined,
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
    setVertexSaEmail('');
    setVertexPrivateKey('');
    localStorage.removeItem(STORAGE_KEYS.N8N_URL);
    localStorage.removeItem(STORAGE_KEYS.N8N_API_KEY);
    localStorage.removeItem(STORAGE_KEYS.VERTEX_SA_EMAIL);
    localStorage.removeItem(STORAGE_KEYS.VERTEX_PRIVATE_KEY);
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

  // Memoize flow preview column computation
  const flowPreviewColumns = useMemo(() => {
    if (!previewResult?.workflow) return null;
    const nodes = (previewResult.workflow.nodes as Array<{ id: string; name: string; type: string; position?: [number, number] }>) || [];
    const columns = new Map<number, typeof nodes>();
    for (const node of nodes) {
      const x = node.position?.[0] ?? 0;
      if (!columns.has(x)) columns.set(x, []);
      columns.get(x)!.push(node);
    }
    return Array.from(columns.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, value]) => value.sort((a, b) => (a.position?.[1] ?? 0) - (b.position?.[1] ?? 0)));
  }, [previewResult?.workflow]);

  const renderFlowPreview = useCallback(() => {
    if (!flowPreviewColumns || !showFlowDetails) return null;

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
        <div className="overflow-x-auto pb-2 -webkit-overflow-scrolling-touch">
          <div className="inline-flex items-center gap-2">
            {flowPreviewColumns.map((column, colIndex) => (
              <React.Fragment key={`col-${colIndex}`}>
                <div className="flex flex-col gap-2 min-w-[140px]">
                  {column.map((node, nodeIndex) => (
                    <motion.div
                      key={node.id}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: colIndex * 0.1 + nodeIndex * 0.05 }}
                      className="rounded-2xl border-2 border-primary/10 bg-white px-3 py-2.5 text-xs shadow-sm hover:shadow-md hover:border-primary/30 transition-all card-hover"
                    >
                      <div className="font-semibold text-sm text-foreground">{node.name}</div>
                      <div className="text-[10px] text-muted-foreground truncate mt-0.5 opacity-70">{node.type.split('.').pop()}</div>
                    </motion.div>
                  ))}
                </div>
                {colIndex < flowPreviewColumns.length - 1 && (
                  <ArrowRight className="w-4 h-4 text-primary/40 flex-shrink-0" />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      </motion.div>
    );
  }, [flowPreviewColumns, showFlowDetails]);

  return (
    <div className="min-h-screen bg-background flex flex-col relative overflow-hidden">
      {/* Dot pattern texture */}
      <div className="fixed inset-0 dot-pattern pointer-events-none" aria-hidden="true" />

      {/* Warm gradient orbs in background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute -top-32 -right-32 w-[400px] h-[400px] rounded-full bg-gradient-to-br from-primary/10 to-accent/10 blur-3xl animate-blob" />
        <div className="absolute -bottom-32 -left-32 w-[350px] h-[350px] rounded-full bg-gradient-to-tr from-secondary/10 to-primary/8 blur-3xl animate-blob" style={{ animationDelay: '3s' }} />
        <div className="absolute top-1/3 right-1/4 w-[250px] h-[250px] rounded-full bg-accent/6 blur-3xl animate-glow-pulse" />
      </div>

      <SunnyBackground />

      {/* Header — bright, cheerful */}
      <header className="relative z-10 bg-white/70 backdrop-blur-md border-b border-primary/10">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-3">
              <NathanAvatar mood={nathanMood} size="sm" />
              <div>
                <h1 className="text-lg font-display font-bold text-foreground tracking-tight flex items-center gap-1.5">
                  Friendly Nathan
                  <Sun className="w-4 h-4 text-accent inline" />
                </h1>
                <p className="text-[11px] text-primary/60 tracking-wide uppercase font-medium">
                  n8n workflow builder
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`relative p-2.5 rounded-2xl transition-all ${
                showSettings
                  ? 'bg-primary text-white shadow-md'
                  : 'text-muted-foreground hover:text-primary hover:bg-primary/5'
              }`}
              aria-label={showSettings ? 'Close settings' : 'Open settings'}
              aria-expanded={showSettings}
              title="Settings"
            >
              <Settings className="w-5 h-5" />
              {n8nApiKey && !showSettings && (
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-secondary rounded-full border-2 border-white" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Settings Panel — slides down with bright styling */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="relative z-10 overflow-hidden border-b border-primary/10 bg-white/50 backdrop-blur-sm"
          >
            <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-display font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
                  <Settings className="w-4 h-4 text-primary" />
                  Configuration
                </h2>
                <div className="flex items-center gap-3">
                  {(n8nApiKey || vertexSaEmail) && (
                    <button onClick={handleClearCredentials} className="text-xs text-muted-foreground hover:text-destructive transition-colors">
                      Clear all
                    </button>
                  )}
                  <button onClick={() => setShowSettings(false)} className="text-muted-foreground hover:text-foreground transition-colors p-1 hover:bg-primary/5 rounded-lg">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <p className="text-xs text-muted-foreground mb-5 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-secondary inline-block" />
                Saved locally in your browser. Never sent to our servers.
              </p>

              <div className="grid gap-4 sm:grid-cols-2">
                {/* n8n URL */}
                <div className="sm:col-span-2">
                  <label htmlFor="settings-n8n-url" className="block text-xs font-semibold text-foreground/70 mb-1.5 uppercase tracking-wider">
                    n8n Instance URL
                  </label>
                  <input
                    id="settings-n8n-url"
                    type="url"
                    value={n8nUrl}
                    onChange={(e) => { setN8nUrl(e.target.value); setValidationSuccess(''); }}
                    placeholder={DEFAULT_N8N_URL}
                    className="w-full px-4 py-3 border-2 border-border rounded-2xl bg-white text-foreground text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all friendly-focus"
                    disabled={generating}
                  />
                </div>

                {/* n8n API Key */}
                <div>
                  <label htmlFor="settings-n8n-key" className="block text-xs font-semibold text-foreground/70 mb-1.5 uppercase tracking-wider">
                    n8n API Key <span className="text-primary">*</span>
                  </label>
                  <div className="relative">
                    <input
                      id="settings-n8n-key"
                      type={showApiKeys ? 'text' : 'password'}
                      value={n8nApiKey}
                      onChange={(e) => { setN8nApiKey(e.target.value); setValidationSuccess(''); }}
                      placeholder="Your n8n API key"
                      className="w-full px-4 py-3 border-2 border-border rounded-2xl bg-white text-foreground text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all pr-12 friendly-focus"
                      disabled={generating}
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKeys(!showApiKeys)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors"
                      aria-label={showApiKeys ? 'Hide API key' : 'Show API key'}
                    >
                      {showApiKeys ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Vertex AI Credentials — collapsible */}
                <div>
                  <button
                    type="button"
                    onClick={() => setShowVertexSection(!showVertexSection)}
                    className="flex items-center gap-2 text-xs font-semibold text-foreground/70 uppercase tracking-wider hover:text-primary transition-colors w-full text-left"
                    disabled={generating}
                  >
                    <span
                      className="transition-transform duration-200"
                      style={{ display: 'inline-block', transform: showVertexSection ? 'rotate(90deg)' : 'rotate(0deg)' }}
                    >
                      ▶
                    </span>
                    Vertex AI Credentials
                    <span className="text-muted-foreground/50 normal-case tracking-normal font-normal">(optional — uses server default if empty)</span>
                  </button>

                  {showVertexSection && (
                    <div className="mt-3 space-y-3 pl-4 border-l-2 border-border">
                      {/* Service Account Email */}
                      <div>
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <label htmlFor="settings-vertex-email" className="text-xs font-semibold text-foreground/70 uppercase tracking-wider">
                            Service Account Email
                          </label>
                          <div className="relative group">
                            <span className="text-muted-foreground cursor-help text-xs">ⓘ</span>
                            <div className="absolute left-0 bottom-6 w-72 p-3 bg-foreground text-background text-xs rounded-xl shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 leading-relaxed">
                              Your GCP service account email.<br/>
                              Format: <code className="text-primary/80">name@project-id.iam.gserviceaccount.com</code><br/><br/>
                              Find it in GCP Console → IAM &amp; Admin → Service Accounts. The project ID is extracted automatically from this email.
                            </div>
                          </div>
                        </div>
                        <input
                          id="settings-vertex-email"
                          type="text"
                          value={vertexSaEmail}
                          onChange={(e) => setVertexSaEmail(e.target.value)}
                          placeholder="name@project-id.iam.gserviceaccount.com"
                          className="w-full px-4 py-3 border-2 border-border rounded-2xl bg-white text-foreground text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all friendly-focus"
                          disabled={generating}
                        />
                      </div>

                      {/* Private Key */}
                      <div>
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <label htmlFor="settings-vertex-key" className="text-xs font-semibold text-foreground/70 uppercase tracking-wider">
                            Private Key
                          </label>
                          <div className="relative group">
                            <span className="text-muted-foreground cursor-help text-xs">ⓘ</span>
                            <div className="absolute left-0 bottom-6 w-72 p-3 bg-foreground text-background text-xs rounded-xl shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 leading-relaxed">
                              The private key from your service account JSON file.<br/><br/>
                              Paste the full block including:<br/>
                              <code className="text-primary/80 break-all">-----BEGIN PRIVATE KEY-----</code><br/>
                              ...key data...<br/>
                              <code className="text-primary/80 break-all">-----END PRIVATE KEY-----</code><br/><br/>
                              Found under <code className="text-primary/80">&quot;private_key&quot;</code> in the downloaded JSON key file from GCP Console.
                            </div>
                          </div>
                        </div>
                        <div className="relative">
                          <textarea
                            id="settings-vertex-key"
                            rows={showVertexKey ? 6 : 2}
                            value={showVertexKey ? vertexPrivateKey : (vertexPrivateKey ? '••••••••••••••••••••••••••••••••' : '')}
                            onChange={(e) => { if (showVertexKey) setVertexPrivateKey(e.target.value); }}
                            placeholder="-----BEGIN PRIVATE KEY-----"
                            className="w-full px-4 py-3 border-2 border-border rounded-2xl bg-white text-foreground text-xs font-mono focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all pr-12 friendly-focus resize-none"
                            disabled={generating}
                            readOnly={!showVertexKey}
                          />
                          <button
                            type="button"
                            onClick={() => setShowVertexKey(!showVertexKey)}
                            className="absolute right-3 top-3 text-muted-foreground hover:text-primary transition-colors"
                            aria-label={showVertexKey ? 'Hide private key' : 'Show private key'}
                          >
                            {showVertexKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                        <p className="mt-1.5 text-[11px] text-muted-foreground">
                          Stored in your browser only. Never sent to our servers beyond this request.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Validate & Messages */}
              <div className="mt-5 space-y-3">
                <button
                  onClick={handleValidateConnection}
                  disabled={validating || generating || !n8nUrl || !n8nApiKey}
                  className="px-6 py-2.5 bg-foreground/5 hover:bg-foreground/10 text-foreground text-sm font-semibold rounded-2xl transition-all disabled:opacity-40 disabled:cursor-not-allowed border-2 border-border"
                >
                  {validating ? 'Testing...' : 'Test Connection'}
                </button>

                <AnimatePresence mode="wait">
                  {validationSuccess && (
                    <motion.p initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-sm text-secondary font-medium flex items-center gap-1.5">
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

              {/* Hero section with Nathan — bright and welcoming */}
              {!previewResult && !generating && workflowDescription.length === 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                  className="text-center mb-8 sm:mb-12"
                >
                  <motion.div
                    className="inline-block mb-5"
                    animate={{ y: [0, -10, 0] }}
                    transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                  >
                    <NathanAvatar mood="idle" size={isMobile ? 'lg' : 'xl'} />
                  </motion.div>
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    className="text-sm font-medium text-primary mb-2"
                  >
                    {getGreeting()} <span className="text-accent">&#9728;</span>
                  </motion.p>
                  <h2 className="font-display text-3xl sm:text-5xl font-extrabold text-foreground tracking-tight mb-3">
                    I'm <span className="gradient-text">Nathan</span>, your
                    <br className="hidden sm:block" />
                    <span className="relative inline-block">
                      workflow buddy
                      <motion.span
                        className="absolute -bottom-1 left-0 right-0 h-1 bg-gradient-to-r from-primary via-accent to-secondary rounded-full"
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: 1 }}
                        transition={{ delay: 0.5, duration: 0.6, ease: 'easeOut' }}
                        style={{ transformOrigin: 'left' }}
                      />
                    </span>
                  </h2>
                  <p className="text-muted-foreground text-base sm:text-lg max-w-lg mx-auto leading-relaxed mt-4">
                    Tell me what you need and I'll build it for you in n8n.
                    <br className="hidden sm:block" />
                    No coding required — just describe it in your own words!
                  </p>
                </motion.div>
              )}

              {/* Textarea — the main interaction */}
              <div className="relative">
                {generating && (
                  <motion.div
                    role="status"
                    aria-live="polite"
                    aria-label={`Workflow generation ${generationProgress.progress}% complete`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="absolute -top-16 left-0 right-0 flex items-center justify-center gap-3"
                  >
                    <NathanAvatar mood="thinking" size="sm" />
                    <div>
                      <p className="text-sm font-semibold text-foreground">{generationProgress.message || 'Thinking...'}</p>
                      <div className="mt-1.5 w-52 h-2 bg-primary/10 rounded-full overflow-hidden">
                        <motion.div
                          className="h-full bg-gradient-to-r from-primary via-accent to-secondary rounded-full"
                          animate={{ width: `${generationProgress.progress}%` }}
                          transition={{ duration: 0.5 }}
                        />
                      </div>
                    </div>
                  </motion.div>
                )}

                <div className={`relative rounded-3xl border-2 transition-all duration-300 friendly-focus ${
                  generating
                    ? 'border-primary/40 shadow-lg shadow-primary/10'
                    : workflowDescription.length > 0
                    ? 'border-primary/20 shadow-lg shadow-primary/5'
                    : 'border-border shadow-md'
                }`}>
                  <label htmlFor="workflow-description" className="sr-only">Describe the workflow you want to create</label>
                  <textarea
                    id="workflow-description"
                    ref={textareaRef}
                    value={workflowDescription}
                    onChange={(e) => setWorkflowDescription(e.target.value)}
                    placeholder="Describe the workflow you want to create..."
                    rows={4}
                    className="w-full px-5 py-4 bg-white/80 backdrop-blur-sm text-foreground rounded-3xl resize-none focus:outline-none text-base leading-relaxed placeholder:text-muted-foreground/40 max-h-64 overflow-y-auto"
                    disabled={generating}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && isReadyToGenerate && !generating) {
                        handleGenerateWorkflow();
                      }
                    }}
                  />

                  {/* Bottom bar inside textarea container */}
                  <div className="flex items-center justify-between px-5 py-3 border-t border-border/30 bg-white/40 rounded-b-3xl">
                    <div className="flex items-center gap-2">
                      {workflowDescription.length > 0 && (
                        <span className={`text-xs font-medium ${workflowDescription.length < 10 ? 'text-destructive/70' : 'text-muted-foreground/50'}`}>
                          {workflowDescription.length} chars
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {workflowDescription.length > 0 && !generating && (
                        <button
                          onClick={() => setWorkflowDescription('')}
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-xl hover:bg-foreground/5 font-medium"
                        >
                          Clear
                        </button>
                      )}
                      {generating && currentGenerationId && (
                        <button
                          onClick={handleCancelGeneration}
                          disabled={cancelling}
                          className="text-xs text-destructive/80 hover:text-destructive transition-colors px-3 py-1.5 rounded-xl hover:bg-destructive/5 font-medium"
                        >
                          {cancelling ? 'Cancelling...' : 'Cancel'}
                        </button>
                      )}
                      <motion.button
                        onClick={handleGenerateWorkflow}
                        disabled={generating || !isReadyToGenerate}
                        whileHover={isReadyToGenerate && !generating ? { scale: 1.02 } : {}}
                        whileTap={isReadyToGenerate && !generating ? { scale: 0.98 } : {}}
                        className={`inline-flex items-center gap-2 px-6 py-2.5 rounded-2xl font-bold text-sm transition-all ${
                          isReadyToGenerate && !generating
                            ? 'bg-gradient-to-r from-primary to-primary/90 text-white shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30'
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
                      </motion.button>
                    </div>
                  </div>
                </div>

                {/* Keyboard shortcut hint */}
                {isReadyToGenerate && !generating && !previewResult && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-center text-[11px] text-muted-foreground/50 mt-2.5"
                  >
                    Press <kbd className="px-1.5 py-0.5 rounded-md bg-white text-muted-foreground/60 font-mono text-[10px] border border-border shadow-sm">{navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}</kbd> + <kbd className="px-1.5 py-0.5 rounded-md bg-white text-muted-foreground/60 font-mono text-[10px] border border-border shadow-sm">Enter</kbd> to generate
                  </motion.p>
                )}

                {/* Setup prompt — shown when n8n is not configured */}
                {!n8nApiKey && !generating && !previewResult && workflowDescription.length === 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="mt-4 text-center"
                  >
                    <div className="inline-flex flex-col items-center gap-3 px-8 py-6 rounded-3xl border-2 border-dashed border-primary/20 bg-primary/3">
                      <Settings className="w-8 h-8 text-primary/40" />
                      <div>
                        <p className="text-sm font-semibold text-foreground/80 mb-1">Connect to your n8n instance</p>
                        <p className="text-xs text-muted-foreground/60 mb-3">Add your n8n URL and API key to get started</p>
                      </div>
                      <button
                        onClick={() => setShowSettings(true)}
                        className="px-5 py-2 rounded-2xl bg-primary text-white text-sm font-bold shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30 transition-all"
                      >
                        Set Up Connection
                      </button>
                    </div>
                  </motion.div>
                )}
              </div>

              {/* Suggestion chips — bigger, more playful */}
              {!generating && !previewResult && workflowDescription.length === 0 && n8nApiKey && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="mt-8 sm:mt-10"
                >
                  <p className="text-xs text-muted-foreground/60 mb-4 text-center uppercase tracking-wider font-semibold flex items-center justify-center gap-1.5">
                    <Sparkles className="w-3 h-3 text-accent" />
                    Try an idea
                  </p>
                  <div className="flex flex-wrap gap-2.5 justify-center">
                    {SUGGESTIONS.map((suggestion, i) => (
                      <motion.button
                        key={i}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4 + i * 0.08, type: 'spring', stiffness: 300, damping: 20 }}
                        whileHover={{ scale: 1.03, y: -2 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => {
                          setWorkflowDescription(suggestion.text);
                          textareaRef.current?.focus();
                        }}
                        className="px-4 py-2.5 text-sm text-foreground/70 bg-white/80 hover:bg-white border-2 border-border/50 hover:border-primary/20 rounded-2xl transition-all hover:text-foreground shadow-sm hover:shadow-md font-medium"
                      >
                        <span className="mr-1.5">{suggestion.emoji}</span>
                        {suggestion.text}
                      </motion.button>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Error display */}
              <AnimatePresence>
                {error && !generating && !showSettings && (
                  <motion.div
                    role="alert"
                    aria-live="assertive"
                    aria-atomic="true"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="mt-4 px-5 py-3.5 rounded-2xl bg-destructive/5 border-2 border-destructive/15 text-sm text-destructive flex items-start gap-2.5"
                  >
                    <X className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span className="flex-1">{error}</span>
                    <button
                      onClick={() => setError('')}
                      className="flex-shrink-0 p-0.5 rounded-lg hover:bg-destructive/10 transition-colors"
                      aria-label="Dismiss error"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
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
                        <h3 className="font-display font-bold text-foreground text-lg">Here's your workflow!</h3>
                        <p className="text-xs text-muted-foreground">Review it below and deploy when you're ready</p>
                      </div>
                      <button
                        onClick={() => setPreviewResult(null)}
                        className="ml-auto text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-xl hover:bg-foreground/5"
                        disabled={creatingFromPreview}
                      >
                        Dismiss
                      </button>
                    </div>

                    {/* Original request */}
                    {previewResult.originalDescription && (
                      <div className="px-5 py-3.5 bg-primary/5 rounded-2xl border-2 border-primary/10">
                        <p className="text-xs text-primary/60 mb-1 uppercase tracking-wider font-semibold">Your request</p>
                        <p className="text-sm text-foreground/80 italic">"{previewResult.originalDescription}"</p>
                      </div>
                    )}

                    {/* Clarification questions from gap detector */}
                    {previewResult.clarifications && previewResult.clarifications.length > 0 && (
                      <div className="px-5 py-4 bg-amber-50 rounded-2xl border-2 border-amber-200/60 space-y-3">
                        <p className="text-xs text-amber-700/80 uppercase tracking-wider font-semibold flex items-center gap-1.5">
                          <span>Tips to improve your workflow</span>
                        </p>
                        {previewResult.clarifications.map((q: ClarificationQuestion, i: number) => (
                          <div key={i} className="space-y-1.5">
                            <p className="text-sm font-semibold text-amber-900">{q.question}</p>
                            <p className="text-xs text-amber-700/70">{q.context}</p>
                            {q.options && (
                              <div className="flex flex-wrap gap-1.5 mt-1">
                                {q.options.map((opt: string, j: number) => (
                                  <button
                                    key={j}
                                    onClick={() => {
                                      setWorkflowDescription((prev: string) => `${prev}. ${opt}`);
                                      setPreviewResult(null);
                                    }}
                                    className="text-xs px-2.5 py-1 rounded-full bg-amber-100 hover:bg-amber-200 text-amber-800 border border-amber-200/80 transition-colors cursor-pointer"
                                  >
                                    {opt}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                        <p className="text-[10px] text-amber-600/60 mt-1">Click a suggestion to add it to your description and regenerate</p>
                      </div>
                    )}

                    {previewResult.explanation && (
                      <p className="text-sm text-muted-foreground leading-relaxed">{previewResult.explanation}</p>
                    )}

                    {/* Flow preview */}
                    <div className="rounded-3xl border-2 border-border/50 bg-white/60 backdrop-blur-sm p-5 space-y-4">
                      {showFlowDetails ? renderFlowPreview() : (
                        <button onClick={() => setShowFlowDetails(true)} className="text-xs text-primary hover:underline font-medium">
                          Show flow preview
                        </button>
                      )}

                      {/* JSON toggle */}
                      <div className="border-t border-border/30 pt-3">
                        <JsonSyntaxHighlight data={previewResult.workflow} />
                      </div>
                    </div>

                    {/* Deploy button — big, cheerful, inviting */}
                    <motion.button
                      onClick={handleCreateFromPreview}
                      disabled={creatingFromPreview}
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      className="w-full py-4 bg-gradient-to-r from-primary via-primary to-secondary text-white font-display font-extrabold text-lg rounded-3xl transition-all shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 disabled:opacity-50 flex items-center justify-center gap-2"
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
                  {/* Success celebration — big and joyful */}
                  <div className="text-center py-6">
                    <motion.div
                      initial={{ scale: 0, rotate: -20 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ type: 'spring', stiffness: 200, damping: 12 }}
                      className="inline-block mb-5"
                    >
                      <NathanAvatar mood="success" size={isMobile ? 'lg' : 'xl'} />
                    </motion.div>
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 }}
                    >
                      <h2 className="font-display text-3xl sm:text-4xl font-extrabold text-foreground mb-2">
                        Your workflow is <span className="text-secondary">live!</span> <span className="text-accent">&#127881;</span>
                      </h2>
                      <p className="text-muted-foreground text-lg">
                        {generationResult.nodesUsed} nodes created in your n8n instance
                      </p>
                    </motion.div>
                  </div>

                  {/* Original request */}
                  {generationResult.originalDescription && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 }}
                      className="px-5 py-3.5 bg-primary/5 rounded-2xl border-2 border-primary/10"
                    >
                      <p className="text-xs text-primary/60 mb-1 uppercase tracking-wider font-semibold">Built from your request</p>
                      <p className="text-sm text-foreground/80 italic">"{generationResult.originalDescription}"</p>
                    </motion.div>
                  )}

                  {/* Workflow JSON viewer */}
                  {generationResult.workflow && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4 }}
                      className="rounded-3xl border-2 border-border/50 overflow-hidden bg-white/60"
                    >
                      <button
                        onClick={() => setShowWorkflowJSON(!showWorkflowJSON)}
                        className="w-full px-5 py-3.5 flex items-center justify-between hover:bg-foreground/3 transition-colors"
                      >
                        <span className="text-sm font-semibold text-foreground flex items-center gap-2">
                          <span className="text-xs font-mono text-primary/50 bg-primary/5 px-2 py-0.5 rounded-lg">{'{ }'}</span>
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
                            <div className="p-5 relative">
                              <button
                                onClick={handleCopyJSON}
                                className="absolute top-7 right-7 z-10 px-3.5 py-2 text-xs bg-white hover:bg-foreground/5 text-foreground rounded-xl transition-colors flex items-center gap-1.5 shadow-sm border border-border font-medium"
                              >
                                {copiedJSON ? <Check className="w-3 h-3 text-secondary" /> : <Copy className="w-3 h-3" />}
                                {copiedJSON ? 'Copied!' : 'Copy'}
                              </button>
                              <pre className="text-xs text-foreground/80 bg-foreground/3 p-4 rounded-2xl border border-border/30 overflow-x-auto max-h-96 overflow-y-auto font-mono">
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
                      className="rounded-3xl border-2 border-secondary/20 bg-secondary/5 p-6"
                    >
                      <h4 className="font-display font-bold text-secondary text-lg mb-1">Credentials Needed</h4>
                      <p className="text-xs text-muted-foreground mb-4">
                        Configure these in your n8n instance to activate the workflow
                      </p>
                      <div className="space-y-2">
                        {generationResult.credentials.map((cred, index) => {
                          const isExpanded = expandedCredentials.has(cred.type);
                          return (
                            <div key={index} className="rounded-2xl border-2 border-secondary/10 bg-white/60 overflow-hidden">
                              <button
                                onClick={() => {
                                  const newExpanded = new Set(expandedCredentials);
                                  isExpanded ? newExpanded.delete(cred.type) : newExpanded.add(cred.type);
                                  setExpandedCredentials(newExpanded);
                                }}
                                className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-foreground/3 transition-colors"
                              >
                                <div>
                                  <h5 className="font-bold text-sm text-foreground">{cred.displayName}</h5>
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
                                        <ol className="list-decimal list-inside space-y-1.5 mb-3">
                                          {cred.steps.map((step, si) => (
                                            <li key={si} className="text-sm text-muted-foreground">{step}</li>
                                          ))}
                                        </ol>
                                      )}
                                      <div className="flex flex-wrap gap-3">
                                        {cred.documentationUrl && (
                                          <a href={cred.documentationUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline inline-flex items-center gap-1 font-medium">
                                            Docs <ExternalLink className="w-3 h-3" />
                                          </a>
                                        )}
                                        {cred.videoUrl && (
                                          <a href={cred.videoUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline inline-flex items-center gap-1 font-medium">
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
                    <motion.a
                      href={generationResult.n8nWorkflowUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      className="flex items-center justify-center gap-2 w-full py-4 bg-gradient-to-r from-primary via-primary to-secondary text-white font-display font-extrabold text-lg rounded-3xl transition-all shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30"
                    >
                      Open in n8n <ExternalLink className="w-5 h-5" />
                    </motion.a>
                    <button
                      onClick={handleNewWorkflow}
                      className="flex items-center justify-center gap-2 w-full py-3.5 bg-white/80 hover:bg-white text-foreground font-semibold rounded-3xl transition-all border-2 border-border/50 hover:border-primary/20 shadow-sm hover:shadow-md"
                    >
                      <RotateCcw className="w-4 h-4" /> Create another workflow
                    </button>
                  </motion.div>
                </>
              ) : (
                /* Error result */
                <div className="text-center py-8">
                  <NathanAvatar mood="error" size="lg" />
                  <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-foreground mt-5 mb-2">
                    Oops, something went wrong
                  </h2>
                  <p className="text-muted-foreground mb-6 max-w-md mx-auto">{generationResult.error}</p>
                  <motion.button
                    onClick={handleNewWorkflow}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="inline-flex items-center gap-2 px-8 py-3.5 bg-gradient-to-r from-primary to-primary/90 text-white font-bold rounded-3xl transition-all shadow-md shadow-primary/20 hover:shadow-lg"
                  >
                    <RotateCcw className="w-4 h-4" /> Let's try again
                  </motion.button>
                </div>
              )}
            </motion.div>
          )}
        </div>
      </main>

      {/* Cheerful footer */}
      <footer className="relative z-10 border-t border-primary/5 py-4 bg-white/30">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 flex items-center justify-between">
          <p className="text-[11px] text-muted-foreground/50 font-medium flex items-center gap-1">
            Made with <Heart className="w-3 h-3 text-primary/40 inline fill-current" /> by Friendly Nathan
          </p>
          <p className="text-[11px] text-muted-foreground/40">
            Powered by Gemini
          </p>
        </div>
      </footer>
    </div>
  );
};

export default SimplifiedWorkflowPage;
