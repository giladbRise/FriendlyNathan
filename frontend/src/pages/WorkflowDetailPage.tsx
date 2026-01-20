import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import Navigation from '../components/Navigation';

interface N8nInstanceInfo {
  id: string;
  name: string;
  url: string;
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

interface WorkflowGeneration {
  id: string;
  workflowDescription: string;
  status: 'pending' | 'in_progress' | 'success' | 'failed' | 'cancelled';
  n8nWorkflowId: string | null;
  n8nWorkflowUrl: string | null;
  nodesUsedCount: number | null;
  aiTokensUsed: number | null;
  durationMs: number | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
  n8nInstance: N8nInstanceInfo | null;
  generatedWorkflowJson: Record<string, unknown> | null;
  credentialsRequired: CredentialRequirement[] | null;
}

const WorkflowDetailPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const [workflow, setWorkflow] = useState<WorkflowGeneration | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showJson, setShowJson] = useState(false);
  const [expandedCredentials, setExpandedCredentials] = useState<Set<string>>(new Set());
  const [copySuccess, setCopySuccess] = useState(false);

  const copyDescription = async () => {
    if (!workflow) return;
    try {
      await navigator.clipboard.writeText(workflow.workflowDescription);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  useEffect(() => {
    fetchWorkflow();
  }, [id]);

  const fetchWorkflow = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await axios.get(
        `http://localhost:3000/api/workflows/${id}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setWorkflow(response.data.generation);
    } catch (err: any) {
      console.error('Error fetching workflow:', err);
      if (err.response?.status === 404) {
        setError('Workflow not found');
      } else {
        setError('Failed to load workflow details');
      }
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: WorkflowGeneration['status']) => {
    const styles: Record<string, string> = {
      pending: 'bg-gray-100 text-gray-800',
      in_progress: 'bg-blue-100 text-blue-800',
      success: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800',
      cancelled: 'bg-yellow-100 text-yellow-800',
    };
    const labels: Record<string, string> = {
      pending: 'Pending',
      in_progress: 'In Progress',
      success: 'Success',
      failed: 'Failed',
      cancelled: 'Cancelled',
    };
    return (
      <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${styles[status]}`}>
        {labels[status]}
      </span>
    );
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  const formatDuration = (ms: number | null) => {
    if (ms === null) return '-';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const toggleCredential = (type: string) => {
    setExpandedCredentials(prev => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-600">Loading workflow details...</p>
      </div>
    );
  }

  if (error || !workflow) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-red-600">{error || 'Workflow not found'}</p>
            <button
              onClick={() => navigate('/workflow/history')}
              className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md transition-colors"
            >
              Back to History
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-6">
          {/* Back Button & Title */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/workflow/history')}
              className="text-blue-600 hover:text-blue-800 text-sm font-medium"
            >
              ← Back to History
            </button>
          </div>

          {/* Header Card */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                  Workflow Generation Details
                </h2>
                <p className="text-sm text-gray-500">
                  ID: {workflow.id}
                </p>
              </div>
              <div className="flex items-center gap-4">
                {getStatusBadge(workflow.status)}
                {workflow.status === 'success' && workflow.n8nWorkflowUrl && (
                  <a
                    href={workflow.n8nWorkflowUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-md transition-colors"
                  >
                    Open in n8n ↗
                  </a>
                )}
                {workflow.status === 'failed' && (
                  <button
                    onClick={() => navigate('/workflow/create', {
                      state: {
                        retryDescription: workflow.workflowDescription,
                        retryInstanceId: workflow.n8nInstance?.id,
                      }
                    })}
                    className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white font-medium rounded-md transition-colors"
                  >
                    Retry Generation
                  </button>
                )}
              </div>
            </div>

            {/* Description */}
            <div className="mb-6">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-sm font-medium text-gray-500">Description</h3>
                <button
                  onClick={copyDescription}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  {copySuccess ? '✓ Copied!' : 'Copy Description'}
                </button>
              </div>
              <p className="text-gray-900 bg-gray-50 p-4 rounded-md whitespace-pre-wrap">
                {workflow.workflowDescription}
              </p>
            </div>

            {/* Details Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <h4 className="text-sm font-medium text-gray-500">Created</h4>
                <p className="text-gray-900">{formatDate(workflow.createdAt)}</p>
              </div>
              <div>
                <h4 className="text-sm font-medium text-gray-500">Completed</h4>
                <p className="text-gray-900">
                  {workflow.completedAt ? formatDate(workflow.completedAt) : '-'}
                </p>
              </div>
              <div>
                <h4 className="text-sm font-medium text-gray-500">Duration</h4>
                <p className="text-gray-900">{formatDuration(workflow.durationMs)}</p>
              </div>
              <div>
                <h4 className="text-sm font-medium text-gray-500">Nodes Used</h4>
                <p className="text-gray-900">{workflow.nodesUsedCount ?? '-'}</p>
              </div>
              <div>
                <h4 className="text-sm font-medium text-gray-500">AI Tokens Used</h4>
                <p className="text-gray-900">{workflow.aiTokensUsed?.toLocaleString() ?? '-'}</p>
              </div>
            </div>
          </div>

          {/* n8n Instance Card */}
          {workflow.n8nInstance && (
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">n8n Instance</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-medium text-gray-500">Name</h4>
                  <p className="text-gray-900">{workflow.n8nInstance.name}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-gray-500">URL</h4>
                  <a
                    href={workflow.n8nInstance.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800"
                  >
                    {workflow.n8nInstance.url} ↗
                  </a>
                </div>
                {workflow.n8nWorkflowId && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-500">Workflow ID</h4>
                    <p className="text-gray-900 font-mono">{workflow.n8nWorkflowId}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Error Message Card */}
          {workflow.status === 'failed' && workflow.errorMessage && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-6">
              <h3 className="text-lg font-medium text-red-800 mb-2">Error Message</h3>
              <p className="text-red-700 font-mono text-sm whitespace-pre-wrap">
                {workflow.errorMessage}
              </p>
            </div>
          )}

          {/* Credentials Required Card */}
          {workflow.credentialsRequired && workflow.credentialsRequired.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
              <h3 className="text-lg font-medium text-yellow-800 mb-4">
                Credentials Required ({workflow.credentialsRequired.length})
              </h3>
              <div className="space-y-3">
                {workflow.credentialsRequired.map((cred) => (
                  <div
                    key={cred.type}
                    className="bg-white rounded-md border border-yellow-200 overflow-hidden"
                  >
                    <button
                      onClick={() => toggleCredential(cred.type)}
                      className="w-full px-4 py-3 flex justify-between items-center hover:bg-yellow-50 transition-colors"
                    >
                      <span className="font-medium text-gray-900">{cred.displayName}</span>
                      <span className="text-gray-500">
                        {expandedCredentials.has(cred.type) ? '▼' : '▶'}
                      </span>
                    </button>
                    {expandedCredentials.has(cred.type) && (
                      <div className="px-4 pb-4 border-t border-yellow-100">
                        <p className="text-sm text-gray-600 mt-3 mb-3">{cred.instructions}</p>
                        {cred.steps && cred.steps.length > 0 && (
                          <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700 mb-3">
                            {cred.steps.map((step, index) => (
                              <li key={index}>{step}</li>
                            ))}
                          </ol>
                        )}
                        <div className="flex flex-wrap gap-3 mt-3">
                          {cred.documentationUrl && (
                            <a
                              href={cred.documentationUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-blue-600 hover:text-blue-800"
                            >
                              Documentation ↗
                            </a>
                          )}
                          {cred.videoUrl && (
                            <a
                              href={cred.videoUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-blue-600 hover:text-blue-800"
                            >
                              Video Guide ↗
                            </a>
                          )}
                        </div>
                        {cred.contactInfo && (
                          <p className="text-xs text-gray-500 mt-2">{cred.contactInfo}</p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Generated Workflow JSON Card */}
          {workflow.generatedWorkflowJson && (
            <div className="bg-white rounded-lg shadow p-6">
              <button
                onClick={() => setShowJson(!showJson)}
                className="w-full flex justify-between items-center"
              >
                <h3 className="text-lg font-medium text-gray-900">
                  Generated Workflow JSON
                </h3>
                <span className="text-gray-500 text-sm">
                  {showJson ? 'Hide ▲' : 'Show ▼'}
                </span>
              </button>
              {showJson && (
                <div className="mt-4">
                  <pre className="bg-gray-900 text-green-400 p-4 rounded-md overflow-x-auto text-sm max-h-96 overflow-y-auto">
                    {JSON.stringify(workflow.generatedWorkflowJson, null, 2)}
                  </pre>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(
                        JSON.stringify(workflow.generatedWorkflowJson, null, 2)
                      );
                    }}
                    className="mt-2 px-3 py-1 text-sm bg-gray-200 hover:bg-gray-300 rounded-md transition-colors"
                  >
                    Copy to Clipboard
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default WorkflowDetailPage;
