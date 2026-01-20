import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import axios from 'axios';
import { io, Socket } from 'socket.io-client';
import Navigation from '../components/Navigation';

interface N8nInstance {
  id: string;
  name: string;
  url: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
}

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

interface LocationState {
  retryDescription?: string;
  retryInstanceId?: string;
}

const WorkflowCreatePage: React.FC = () => {
  const location = useLocation();
  const socketRef = useRef<Socket | null>(null);

  // Check for retry description from navigation state
  const locationState = location.state as LocationState | null;

  // State for n8n instances
  const [instances, setInstances] = useState<N8nInstance[]>([]);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string>('');
  const [showManualEntry, setShowManualEntry] = useState(false);

  // State for manual entry form
  const [manualForm, setManualForm] = useState({
    name: '',
    url: '',
    apiKey: '',
    saveInstance: false,
  });

  // State for workflow
  const [workflowDescription, setWorkflowDescription] = useState('');
  const [generating, setGenerating] = useState(false);
  const [currentGenerationId, setCurrentGenerationId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [generationProgress, setGenerationProgress] = useState({ message: '', progress: 0, estimatedTimeRemaining: null as number | null });
  const [generationResult, setGenerationResult] = useState<GenerationResult | null>(null);
  const [expandedCredentials, setExpandedCredentials] = useState<Set<string>>(new Set());

  // UI state
  const [loading, setLoading] = useState(false);
  const [loadingInstances, setLoadingInstances] = useState(true);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [validationSuccess, setValidationSuccess] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<{ existingId: string; createdAt: string } | null>(null);

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
      setSuccess('Workflow generation cancelled');
    });

    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  // Fetch saved instances on mount
  useEffect(() => {
    fetchInstances();
  }, []);

  // Pre-fill description and instance from retry state
  useEffect(() => {
    if (locationState?.retryDescription) {
      setWorkflowDescription(locationState.retryDescription);
    }
    if (locationState?.retryInstanceId && instances.length > 0) {
      // Check if the retry instance exists in user's instances
      const instanceExists = instances.some(inst => inst.id === locationState.retryInstanceId);
      if (instanceExists) {
        setSelectedInstanceId(locationState.retryInstanceId);
      }
    }
    // Clear the state so refreshing doesn't re-populate
    if (locationState?.retryDescription || locationState?.retryInstanceId) {
      window.history.replaceState({}, document.title);
    }
  }, [locationState, instances]);

  const fetchInstances = async () => {
    try {
      setLoadingInstances(true);
      const token = localStorage.getItem('token');
      const response = await axios.get('http://localhost:3000/api/n8n-instances', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setInstances(response.data.instances);

      // Auto-select default instance if exists
      const defaultInstance = response.data.instances.find((inst: N8nInstance) => inst.isDefault);
      if (defaultInstance) {
        setSelectedInstanceId(defaultInstance.id);
      }
    } catch (err: any) {
      console.error('Error fetching instances:', err);
    } finally {
      setLoadingInstances(false);
    }
  };

  const handleManualInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setManualForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
    setValidationSuccess('');
    setError('');
  };

  const handleValidateInstance = async () => {
    setError('');
    setSuccess('');
    setValidationSuccess('');

    if (!manualForm.url || !manualForm.apiKey) {
      setError('Please enter both n8n URL and API key to validate');
      return;
    }

    try {
      setValidating(true);
      const token = localStorage.getItem('token');

      const response = await axios.post(
        'http://localhost:3000/api/n8n-instances/validate',
        {
          url: manualForm.url,
          apiKey: manualForm.apiKey,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (response.data.valid) {
        setValidationSuccess(response.data.message || 'Connection successful! Credentials are valid.');
      }
    } catch (err: any) {
      console.error('Error validating instance:', err);
      setError(err.response?.data?.error || 'Failed to validate n8n instance');
    } finally {
      setValidating(false);
    }
  };

  const handleSubmitManualInstance = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!manualForm.name || !manualForm.url || !manualForm.apiKey) {
      setError('Please fill in all fields');
      return;
    }

    if (!manualForm.saveInstance) {
      setSuccess('Instance configuration ready. You can now create workflows.');
      return;
    }

    try {
      setLoading(true);
      const token = localStorage.getItem('token');

      const response = await axios.post(
        'http://localhost:3000/api/n8n-instances',
        {
          name: manualForm.name,
          url: manualForm.url,
          apiKey: manualForm.apiKey,
          isDefault: instances.length === 0,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      setSuccess('n8n instance saved successfully!');
      await fetchInstances();
      setSelectedInstanceId(response.data.instance.id);
      setManualForm({
        name: '',
        url: '',
        apiKey: '',
        saveInstance: false,
      });

      setTimeout(() => {
        setShowManualEntry(false);
      }, 1500);
    } catch (err: any) {
      console.error('Error saving instance:', err);
      setError(err.response?.data?.error || 'Failed to save n8n instance');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateWorkflow = async () => {
    setError('');
    setSuccess('');
    setGenerationResult(null);

    if (!selectedInstanceId) {
      setError('Please select an n8n instance');
      return;
    }

    if (!workflowDescription.trim() || workflowDescription.trim().length < 10) {
      setError('Please enter a workflow description (at least 10 characters)');
      return;
    }

    try {
      setGenerating(true);
      setGenerationProgress({ message: 'Starting...', progress: 0, estimatedTimeRemaining: null });

      const token = localStorage.getItem('token');
      const socketId = socketRef.current?.id;

      const response = await axios.post(
        'http://localhost:3000/api/workflows/generate',
        {
          instanceId: selectedInstanceId,
          description: workflowDescription,
          socketId,
          skipDuplicateCheck: duplicateWarning !== null, // Skip if user already saw warning
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      // Check if duplicate warning returned
      if (response.data.duplicateWarning) {
        setGenerating(false);
        setDuplicateWarning({
          existingId: response.data.duplicateWarning.existingId,
          createdAt: response.data.duplicateWarning.createdAt,
        });
        return;
      }

      // Store the generation ID for potential cancellation
      setCurrentGenerationId(response.data.generationId);
      setDuplicateWarning(null);

      // The result will come through the socket
    } catch (err: any) {
      console.error('Error generating workflow:', err);
      setGenerating(false);
      // Handle different error types with user-friendly messages
      if (!err.response) {
        // Network error - no response from server
        setError('Connection failed, please check your network and try again.');
      } else if (err.response.status === 429) {
        const retryAfter = err.response.data?.retryAfter || '15 minutes';
        setError(`Rate limit exceeded, please wait ${retryAfter} before generating another workflow.`);
      } else if (err.response.status >= 500) {
        setError('Server error. Please try again later or contact support.');
      } else {
        setError(err.response.data?.error || 'Failed to generate workflow. Please try again.');
      }
    }
  };

  const handleCancelGeneration = async () => {
    if (!currentGenerationId) return;

    try {
      setCancelling(true);
      const token = localStorage.getItem('token');
      const socketId = socketRef.current?.id;

      await axios.post(
        `http://localhost:3000/api/workflows/${currentGenerationId}/cancel`,
        { socketId },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
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
    setSuccess('');
    setDuplicateWarning(null);
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

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Create Workflow</h2>
            <p className="text-gray-600">
              Generate n8n workflows using AI-powered natural language descriptions
            </p>
          </div>

          {/* n8n Instance Selection */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">n8n Instance</h3>

            {loadingInstances ? (
              <div className="text-gray-600">Loading instances...</div>
            ) : (
              <>
                {instances.length > 0 && !showManualEntry && (
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="instance-select" className="block text-sm font-medium text-gray-700 mb-2">
                        Select Saved Instance
                      </label>
                      <select
                        id="instance-select"
                        value={selectedInstanceId}
                        onChange={(e) => setSelectedInstanceId(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        disabled={generating}
                      >
                        <option value="">-- Select an instance --</option>
                        {instances.map((instance) => (
                          <option key={instance.id} value={instance.id}>
                            {instance.name} ({instance.url})
                            {instance.isDefault && ' - Default'}
                          </option>
                        ))}
                      </select>
                    </div>

                    {selectedInstanceId && (() => {
                      const selectedInstance = instances.find(inst => inst.id === selectedInstanceId);
                      if (!selectedInstance) return null;
                      return (
                        <div className="p-4 bg-blue-50 border border-blue-200 rounded-md">
                          <h4 className="text-sm font-semibold text-blue-900 mb-2">Selected Instance</h4>
                          <div className="space-y-1">
                            <p className="text-sm text-blue-800">
                              <span className="font-medium">Name:</span> {selectedInstance.name}
                            </p>
                            <p className="text-sm text-blue-800">
                              <span className="font-medium">URL:</span> {selectedInstance.url}
                            </p>
                            <p className="text-sm text-blue-800">
                              <span className="font-medium">API Key:</span> ••••••••••••• (stored securely)
                            </p>
                            {selectedInstance.isDefault && (
                              <p className="text-xs text-blue-600 mt-1">✓ Default instance</p>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    <button
                      onClick={() => setShowManualEntry(true)}
                      className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                      disabled={generating}
                    >
                      + Add New Instance
                    </button>
                  </div>
                )}

                {(instances.length === 0 || showManualEntry) && (
                  <form onSubmit={handleSubmitManualInstance} className="space-y-4">
                    {instances.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowManualEntry(false)}
                        className="text-sm text-gray-600 hover:text-gray-800 mb-2"
                      >
                        ← Back to saved instances
                      </button>
                    )}

                    <div>
                      <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                        Instance Name
                      </label>
                      <input
                        type="text"
                        id="name"
                        name="name"
                        value={manualForm.name}
                        onChange={handleManualInputChange}
                        placeholder="e.g., Customer ABC"
                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>

                    <div>
                      <label htmlFor="url" className="block text-sm font-medium text-gray-700 mb-2">
                        n8n URL
                      </label>
                      <input
                        type="url"
                        id="url"
                        name="url"
                        value={manualForm.url}
                        onChange={handleManualInputChange}
                        placeholder="https://your-n8n-instance.com"
                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>

                    <div>
                      <label htmlFor="apiKey" className="block text-sm font-medium text-gray-700 mb-2">
                        API Key
                      </label>
                      <div className="relative">
                        <input
                          type={showApiKey ? 'text' : 'password'}
                          id="apiKey"
                          name="apiKey"
                          value={manualForm.apiKey}
                          onChange={handleManualInputChange}
                          placeholder="Enter your n8n API key"
                          className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-24"
                        />
                        <button
                          type="button"
                          onClick={() => setShowApiKey(!showApiKey)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-blue-600 hover:text-blue-700"
                        >
                          {showApiKey ? 'Hide' : 'Show'}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="saveInstance"
                        name="saveInstance"
                        checked={manualForm.saveInstance}
                        onChange={handleManualInputChange}
                        className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <label htmlFor="saveInstance" className="ml-2 text-sm text-gray-700">
                        Save this instance for future use
                      </label>
                    </div>

                    {error && !generating && (
                      <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                        <p className="text-sm text-red-800">{error}</p>
                      </div>
                    )}

                    {success && (
                      <div className="p-3 bg-green-50 border border-green-200 rounded-md">
                        <p className="text-sm text-green-800">{success}</p>
                      </div>
                    )}

                    {validationSuccess && (
                      <div className="p-3 bg-green-50 border border-green-200 rounded-md">
                        <p className="text-sm text-green-800">{validationSuccess}</p>
                      </div>
                    )}

                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={handleValidateInstance}
                        disabled={validating || loading}
                        className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white font-medium rounded-md transition-colors disabled:bg-gray-400"
                      >
                        {validating ? 'Validating...' : 'Validate'}
                      </button>
                      <button
                        type="submit"
                        disabled={loading || validating}
                        className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md transition-colors disabled:bg-gray-400"
                      >
                        {loading ? 'Saving...' : 'Save Instance'}
                      </button>
                    </div>
                  </form>
                )}
              </>
            )}
          </div>

          {/* Workflow Description */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Workflow Description</h3>

            {!generationResult ? (
              <>
                <textarea
                  value={workflowDescription}
                  onChange={(e) => setWorkflowDescription(e.target.value)}
                  placeholder="Describe the workflow you want to create. For example: 'Send a webhook POST request to https://example.com/hook with static JSON data' or 'Send a Slack message to #general channel'"
                  rows={6}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={generating}
                />

                <div className="mt-2 flex justify-between items-center">
                  <p className="text-sm text-gray-500">
                    {workflowDescription.length} characters
                  </p>
                  <div className="flex items-center gap-4">
                    {workflowDescription.length > 0 && (
                      <button
                        onClick={() => setWorkflowDescription('')}
                        className="text-sm text-gray-500 hover:text-gray-700"
                        disabled={generating}
                      >
                        Clear
                      </button>
                    )}
                    <p className="text-sm text-gray-500">
                      Minimum 10 characters required
                    </p>
                  </div>
                </div>

                {/* Example prompts */}
                <div className="mt-4">
                  <p className="text-sm font-medium text-gray-700 mb-2">Example prompts:</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setWorkflowDescription('Send a webhook POST request to https://example.com/hook with static JSON data')}
                      className="text-xs px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-700"
                      disabled={generating}
                    >
                      HTTP Request
                    </button>
                    <button
                      onClick={() => setWorkflowDescription('Send a Slack message to #general channel with a greeting')}
                      className="text-xs px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-700"
                      disabled={generating}
                    >
                      Slack Message
                    </button>
                    <button
                      onClick={() => setWorkflowDescription('Send an email notification to recipient@example.com with a summary')}
                      className="text-xs px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-700"
                      disabled={generating}
                    >
                      Send Email
                    </button>
                    <button
                      onClick={() => setWorkflowDescription('Get data from Google Sheets and send to Slack')}
                      className="text-xs px-3 py-1 bg-yellow-100 hover:bg-yellow-200 rounded-full text-yellow-800"
                      disabled={generating}
                    >
                      Google Sheets + Slack (requires credentials)
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
                    <p className="text-sm text-red-800">{error}</p>
                  </div>
                )}

                {/* Duplicate warning */}
                {duplicateWarning && (
                  <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-md">
                    <h4 className="text-sm font-semibold text-yellow-800 mb-2">Similar Workflow Found</h4>
                    <p className="text-sm text-yellow-700 mb-3">
                      You created a workflow with the same description on{' '}
                      {new Date(duplicateWarning.createdAt).toLocaleString()}.
                    </p>
                    <div className="flex gap-3">
                      <button
                        onClick={() => {
                          setDuplicateWarning(null);
                          handleGenerateWorkflow();
                        }}
                        className="px-3 py-1 text-sm bg-yellow-600 hover:bg-yellow-700 text-white rounded-md"
                      >
                        Create Anyway
                      </button>
                      <button
                        onClick={() => window.open(`/workflow/${duplicateWarning.existingId}`, '_blank')}
                        className="px-3 py-1 text-sm bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-md"
                      >
                        View Existing
                      </button>
                      <button
                        onClick={() => setDuplicateWarning(null)}
                        className="px-3 py-1 text-sm text-gray-500 hover:text-gray-700"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Progress indicator */}
                {generating && (
                  <div className="mt-4 space-y-3">
                    <div className="flex justify-between items-center">
                      <p className="text-sm font-medium text-blue-700">{generationProgress.message}</p>
                      <p className="text-sm text-gray-500">{generationProgress.progress}%</p>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${generationProgress.progress}%` }}
                      />
                    </div>
                    {generationProgress.estimatedTimeRemaining !== null && generationProgress.estimatedTimeRemaining > 0 && (
                      <p className="text-xs text-gray-500 text-center">
                        {formatTimeRemaining(generationProgress.estimatedTimeRemaining)}
                      </p>
                    )}
                    <button
                      onClick={handleCancelGeneration}
                      disabled={cancelling}
                      className="w-full px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 font-medium rounded-md transition-colors disabled:opacity-50"
                    >
                      {cancelling ? 'Cancelling...' : 'Cancel Generation'}
                    </button>
                  </div>
                )}

                <button
                  onClick={handleGenerateWorkflow}
                  disabled={generating || !selectedInstanceId || workflowDescription.length < 10}
                  className="mt-4 w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-md transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {generating ? 'Generating Workflow...' : 'Generate Workflow'}
                </button>
              </>
            ) : (
              // Generation Result
              <div className="space-y-4">
                {generationResult.success ? (
                  <>
                    <div className="p-4 bg-green-50 border border-green-200 rounded-md">
                      <h4 className="text-lg font-semibold text-green-800 mb-2">Workflow Created Successfully!</h4>
                      <div className="space-y-2">
                        <p className="text-sm text-green-700">
                          <span className="font-medium">Workflow ID:</span> {generationResult.n8nWorkflowId}
                        </p>
                        <p className="text-sm text-green-700">
                          <span className="font-medium">Nodes Created:</span> {generationResult.nodesUsed}
                        </p>
                      </div>
                    </div>

                    {/* Credentials Required Section */}
                    {generationResult.credentials && generationResult.credentials.length > 0 && (
                      <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-md">
                        <h4 className="text-lg font-semibold text-yellow-800 mb-3">
                          Credentials Required
                        </h4>
                        <p className="text-sm text-yellow-700 mb-4">
                          This workflow requires the following credentials to be configured in n8n. Click on each credential to see detailed setup instructions.
                        </p>
                        <div className="space-y-3">
                          {generationResult.credentials.map((cred, index) => {
                            const isExpanded = expandedCredentials.has(cred.type);
                            return (
                              <div key={index} className="bg-white rounded border border-yellow-200 overflow-hidden">
                                {/* Collapsible Header */}
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
                                  className="w-full p-3 flex justify-between items-center text-left hover:bg-yellow-50 transition-colors"
                                >
                                  <div>
                                    <h5 className="font-semibold text-yellow-900">
                                      {cred.displayName}
                                    </h5>
                                    <p className="text-sm text-yellow-700">
                                      {cred.instructions}
                                    </p>
                                  </div>
                                  <span className="text-yellow-600 text-lg ml-2">
                                    {isExpanded ? '−' : '+'}
                                  </span>
                                </button>

                                {/* Expanded Content */}
                                {isExpanded && (
                                  <div className="p-4 pt-0 border-t border-yellow-100">
                                    {/* Step-by-step instructions */}
                                    {cred.steps && cred.steps.length > 0 && (
                                      <div className="mb-4">
                                        <h6 className="font-medium text-gray-900 mb-2">Step-by-step instructions:</h6>
                                        <ol className="list-decimal list-inside space-y-1">
                                          {cred.steps.map((step, stepIndex) => (
                                            <li key={stepIndex} className="text-sm text-gray-700">
                                              {step}
                                            </li>
                                          ))}
                                        </ol>
                                      </div>
                                    )}

                                    {/* Links section */}
                                    <div className="flex flex-wrap gap-3">
                                      {cred.documentationUrl && (
                                        <a
                                          href={cred.documentationUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-flex items-center text-sm text-blue-600 hover:text-blue-700"
                                        >
                                          <span className="mr-1">📖</span> Documentation ↗
                                        </a>
                                      )}
                                      {cred.videoUrl && (
                                        <a
                                          href={cred.videoUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-flex items-center text-sm text-red-600 hover:text-red-700"
                                        >
                                          <span className="mr-1">🎬</span> Video Guide ↗
                                        </a>
                                      )}
                                    </div>

                                    {/* Contact info */}
                                    {cred.contactInfo && (
                                      <div className="mt-3 pt-3 border-t border-gray-100">
                                        <p className="text-sm text-gray-600">
                                          <span className="font-medium">Need help?</span> {cred.contactInfo}
                                        </p>
                                      </div>
                                    )}
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
                      className="inline-flex items-center justify-center w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-md transition-colors"
                    >
                      View Workflow in n8n ↗
                    </a>

                    <button
                      onClick={handleNewWorkflow}
                      className="w-full px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-md transition-colors"
                    >
                      Create Another Workflow
                    </button>
                  </>
                ) : (
                  <>
                    <div className="p-4 bg-red-50 border border-red-200 rounded-md">
                      <h4 className="text-lg font-semibold text-red-800 mb-2">Workflow Generation Failed</h4>
                      <p className="text-sm text-red-700">{generationResult.error}</p>
                    </div>

                    <button
                      onClick={handleNewWorkflow}
                      className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-md transition-colors"
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

export default WorkflowCreatePage;
