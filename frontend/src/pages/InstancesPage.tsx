import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

interface N8nInstance {
  id: string;
  name: string;
  url: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
}

interface EditFormData {
  name: string;
  url: string;
  apiKey: string;
}

const InstancesPage: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [instances, setInstances] = useState<N8nInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Edit modal state
  const [editingInstance, setEditingInstance] = useState<N8nInstance | null>(null);
  const [editForm, setEditForm] = useState<EditFormData>({ name: '', url: '', apiKey: '' });
  const [editError, setEditError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  useEffect(() => {
    fetchInstances();
  }, []);

  const fetchInstances = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await axios.get('http://localhost:3000/api/n8n-instances', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setInstances(response.data.instances);
    } catch (err: any) {
      console.error('Error fetching instances:', err);
      setError('Failed to load instances');
    } finally {
      setLoading(false);
    }
  };

  const handleSetDefault = async (instanceId: string) => {
    setError('');
    setSuccess('');
    setUpdating(instanceId);

    try {
      const token = localStorage.getItem('token');
      await axios.put(
        `http://localhost:3000/api/n8n-instances/${instanceId}`,
        { isDefault: true },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setSuccess('Default instance updated successfully!');
      await fetchInstances();
    } catch (err: any) {
      console.error('Error setting default instance:', err);
      setError(err.response?.data?.error || 'Failed to set default instance');
    } finally {
      setUpdating(null);
    }
  };

  const handleDelete = async (instanceId: string, instanceName: string) => {
    if (!confirm(`Are you sure you want to delete "${instanceName}"?`)) {
      return;
    }

    setError('');
    setSuccess('');
    setUpdating(instanceId);

    try {
      const token = localStorage.getItem('token');
      await axios.delete(`http://localhost:3000/api/n8n-instances/${instanceId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setSuccess('Instance deleted successfully!');
      await fetchInstances();
    } catch (err: any) {
      console.error('Error deleting instance:', err);
      setError(err.response?.data?.error || 'Failed to delete instance');
    } finally {
      setUpdating(null);
    }
  };

  const handleEdit = (instance: N8nInstance) => {
    setEditingInstance(instance);
    setEditForm({
      name: instance.name,
      url: instance.url,
      apiKey: '', // Don't pre-populate API key for security
    });
    setEditError('');
    setShowApiKey(false);
  };

  const handleCloseEdit = () => {
    setEditingInstance(null);
    setEditForm({ name: '', url: '', apiKey: '' });
    setEditError('');
    setShowApiKey(false);
  };

  const handleEditInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setEditForm(prev => ({ ...prev, [name]: value }));
    setEditError('');
  };

  const handleSaveEdit = async () => {
    if (!editingInstance) return;

    setEditError('');

    // Validate required fields
    if (!editForm.name.trim()) {
      setEditError('Instance name is required');
      return;
    }

    if (!editForm.url.trim()) {
      setEditError('URL is required');
      return;
    }

    // Build update data - only include non-empty fields
    const updateData: { name?: string; url?: string; apiKey?: string } = {};

    if (editForm.name !== editingInstance.name) {
      updateData.name = editForm.name;
    }

    if (editForm.url !== editingInstance.url) {
      updateData.url = editForm.url;
    }

    if (editForm.apiKey) {
      updateData.apiKey = editForm.apiKey;
    }

    // Check if anything changed
    if (Object.keys(updateData).length === 0) {
      setEditError('No changes to save');
      return;
    }

    try {
      setSaving(true);
      const token = localStorage.getItem('token');

      await axios.put(
        `http://localhost:3000/api/n8n-instances/${editingInstance.id}`,
        updateData,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setSuccess('Instance updated successfully!');
      handleCloseEdit();
      await fetchInstances();
    } catch (err: any) {
      console.error('Error updating instance:', err);
      setEditError(err.response?.data?.error || 'Failed to update instance');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
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
                onClick={() => navigate('/workflow/create')}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
              >
                Create Workflow
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
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">n8n Instances</h2>
              <p className="text-gray-600">
                Manage your saved n8n instances
              </p>
            </div>
            <button
              onClick={() => navigate('/workflow/create')}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md transition-colors"
            >
              + Add New Instance
            </button>
          </div>

          {/* Messages */}
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {success && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-md">
              <p className="text-sm text-green-800">{success}</p>
            </div>
          )}

          {/* Instances List */}
          <div className="bg-white rounded-lg shadow">
            {loading ? (
              <div className="p-6 text-center text-gray-600">
                Loading instances...
              </div>
            ) : instances.length === 0 ? (
              <div className="p-6 text-center">
                <p className="text-gray-600 mb-4">No saved instances yet.</p>
                <button
                  onClick={() => navigate('/workflow/create')}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md transition-colors"
                >
                  Add Your First Instance
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        URL
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Created
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {instances.map((instance) => (
                      <tr key={instance.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <span className="text-sm font-medium text-gray-900">
                              {instance.name}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm text-gray-600">{instance.url}</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {instance.isDefault ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              Default
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                              Active
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          {new Date(instance.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => handleEdit(instance)}
                              disabled={updating === instance.id}
                              className="text-gray-600 hover:text-gray-800 disabled:text-gray-400"
                            >
                              Edit
                            </button>
                            {!instance.isDefault && (
                              <button
                                onClick={() => handleSetDefault(instance.id)}
                                disabled={updating === instance.id}
                                className="text-blue-600 hover:text-blue-800 disabled:text-gray-400"
                              >
                                {updating === instance.id ? 'Updating...' : 'Set as Default'}
                              </button>
                            )}
                            <button
                              onClick={() => handleDelete(instance.id, instance.name)}
                              disabled={updating === instance.id}
                              className="text-red-600 hover:text-red-800 disabled:text-gray-400"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Edit Modal */}
      {editingInstance && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Edit Instance
              </h3>

              <div className="space-y-4">
                <div>
                  <label htmlFor="edit-name" className="block text-sm font-medium text-gray-700 mb-1">
                    Instance Name
                  </label>
                  <input
                    type="text"
                    id="edit-name"
                    name="name"
                    value={editForm.name}
                    onChange={handleEditInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label htmlFor="edit-url" className="block text-sm font-medium text-gray-700 mb-1">
                    n8n URL
                  </label>
                  <input
                    type="url"
                    id="edit-url"
                    name="url"
                    value={editForm.url}
                    onChange={handleEditInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label htmlFor="edit-apiKey" className="block text-sm font-medium text-gray-700 mb-1">
                    API Key <span className="text-gray-500 font-normal">(leave empty to keep current)</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      id="edit-apiKey"
                      name="apiKey"
                      value={editForm.apiKey}
                      onChange={handleEditInputChange}
                      placeholder="Enter new API key"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-16"
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

                {editError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                    <p className="text-sm text-red-800">{editError}</p>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={handleCloseEdit}
                  disabled={saving}
                  className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors disabled:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={saving}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md transition-colors disabled:bg-gray-400"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InstancesPage;
