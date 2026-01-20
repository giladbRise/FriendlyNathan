import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { io, Socket } from 'socket.io-client';

interface N8nInstance {
  id: string;
  name: string;
  url: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
}

interface GenerationResult {
  generationId: string;
  success: boolean;
  n8nWorkflowId?: string;
  n8nWorkflowUrl?: string;
  nodesUsed?: number;
  error?: string;
}

const WorkflowCreatePage: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const socketRef = useRef<Socket | null>(null);

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
  const [generationProgress, setGenerationProgress] = useState({ message: '', progress: 0 });
  const [generationResult, setGenerationResult] = useState<GenerationResult | null>(null);

  // UI state
  const [loading, setLoading] = useState(false);
  const [loadingInstances, setLoadingInstances] = useState(true);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [validationSuccess, setValidationSuccess] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);

  // Connect to socket.io for real-time updates
  useEffect(() => {
    socketRef.current = io('http://localhost:3000');

    socketRef.current.on('connect', () => {
      console.log('Socket connected:', socketRef.current?.id);
    });

    socketRef.current.on('workflow:progress', (data) => {
      console.log('Progress:', data);
      setGenerationProgress({ message: data.message, progress: data.progress });
    });

    socketRef.current.on('workflow:complete', (data: GenerationResult) => {
      console.log('Complete:', data);
      setGenerating(false);
      setGenerationResult(data);
    });

    socketRef.current.on('workflow:error', (data) => {
      console.log('Error:', data);
      setGenerating(false);
      setError(data.error || 'Workflow generation failed');
    });

    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  // Fetch saved instances on mount
  useEffect(() => {
    fetchInstances();
  }, []);

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
      setGenerationProgress({ message: 'Starting...', progress: 0 });

      const token = localStorage.getItem('token');
      const socketId = socketRef.current?.id;

      await axios.post(
        'http://localhost:3000/api/workflows/generate',
        {
          instanceId: selectedInstanceId,
          description: workflowDescription,
          socketId,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      // The result will come through the socket
    } catch (err: any) {
      console.error('Error generating workflow:', err);
      setGenerating(false);
      setError(err.response?.data?.error || 'Failed to generate workflow');
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleNewWorkflow = () => {
    setWorkflowDescription('');
    setGenerationResult(null);
    setGenerationProgress({ message: '', progress: 0 });
    setError('');
    setSuccess('');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                RISE n8n Workflow Builder
              </h1>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/dashboard')}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
              >
                Dashboard
              </button>
              <button
                onClick={() => navigate('/instances')}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
              >
                Instances
              </button>
              <button
                onClick={() => navigate('/profile')}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
              >
                Profile
              </button>
              {user?.role === 'admin' && (
                <button
                  onClick={() => navigate('/admin')}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                >
                  Admin
                </button>
              )}
              <span className="text-sm text-gray-700">{user?.email}</span>
              <button
                onClick={handleLogout}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

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
                  <p className="text-sm text-gray-500">
                    Minimum 10 characters required
                  </p>
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
                  </div>
                </div>

                {error && (
                  <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
                    <p className="text-sm text-red-800">{error}</p>
                  </div>
                )}

                {/* Progress indicator */}
                {generating && (
                  <div className="mt-4 space-y-2">
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
