import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Navigation from '../components/Navigation';

interface CredentialTemplate {
  id: string;
  credentialType: string;
  displayName: string;
  instructionsMarkdown: string;
  videoUrl: string | null;
  documentationUrl: string | null;
  contactInfo: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface TemplatesResponse {
  templates: CredentialTemplate[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const AdminCredentialGuidance: React.FC = () => {
  const [templates, setTemplates] = useState<CredentialTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<CredentialTemplate | null>(null);
  const [formData, setFormData] = useState({
    credentialType: '',
    displayName: '',
    instructionsMarkdown: '',
    videoUrl: '',
    documentationUrl: '',
    contactInfo: '',
    isActive: true,
  });
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');

  useEffect(() => {
    fetchTemplates();
  }, [page, searchQuery, statusFilter]);

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      setError('');
      const token = localStorage.getItem('token');

      const params = new URLSearchParams();
      params.append('page', page.toString());
      params.append('limit', '10');
      if (searchQuery) params.append('search', searchQuery);
      if (statusFilter !== 'all') params.append('isActive', statusFilter);

      const response = await axios.get<TemplatesResponse>(
        `http://localhost:3000/api/credentials/guidance?${params.toString()}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      setTemplates(response.data.templates);
      setTotalPages(response.data.totalPages);
      setTotal(response.data.total);
    } catch (err: any) {
      console.error('Error fetching templates:', err);
      setError(err.response?.data?.error || 'Failed to load credential guidance templates');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    setSearchQuery(searchInput);
    setPage(1);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const clearFilters = () => {
    setSearchInput('');
    setSearchQuery('');
    setStatusFilter('all');
    setPage(1);
  };

  const hasActiveFilters = searchQuery || statusFilter !== 'all';

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString();
  };

  const openCreateModal = () => {
    setEditingTemplate(null);
    setFormData({
      credentialType: '',
      displayName: '',
      instructionsMarkdown: '',
      videoUrl: '',
      documentationUrl: '',
      contactInfo: '',
      isActive: true,
    });
    setFormError('');
    setFormSuccess('');
    setShowCreateModal(true);
  };

  const openEditModal = (template: CredentialTemplate) => {
    setEditingTemplate(template);
    setFormData({
      credentialType: template.credentialType,
      displayName: template.displayName,
      instructionsMarkdown: template.instructionsMarkdown,
      videoUrl: template.videoUrl || '',
      documentationUrl: template.documentationUrl || '',
      contactInfo: template.contactInfo || '',
      isActive: template.isActive,
    });
    setFormError('');
    setFormSuccess('');
    setShowCreateModal(true);
  };

  const closeModal = () => {
    setShowCreateModal(false);
    setEditingTemplate(null);
    setFormError('');
    setFormSuccess('');
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!formData.credentialType.trim()) {
      setFormError('Credential type is required');
      return;
    }
    if (!formData.displayName.trim()) {
      setFormError('Display name is required');
      return;
    }
    if (!formData.instructionsMarkdown.trim()) {
      setFormError('Instructions are required');
      return;
    }

    try {
      setFormLoading(true);
      setFormError('');
      const token = localStorage.getItem('token');

      const payload = {
        credentialType: formData.credentialType.trim(),
        displayName: formData.displayName.trim(),
        instructionsMarkdown: formData.instructionsMarkdown.trim(),
        videoUrl: formData.videoUrl.trim() || null,
        documentationUrl: formData.documentationUrl.trim() || null,
        contactInfo: formData.contactInfo.trim() || null,
        isActive: formData.isActive,
      };

      if (editingTemplate) {
        // Update existing template
        await axios.put(
          `http://localhost:3000/api/credentials/guidance/${editingTemplate.id}`,
          payload,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        setFormSuccess('Template updated successfully');
      } else {
        // Create new template
        await axios.post(
          'http://localhost:3000/api/credentials/guidance',
          payload,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        setFormSuccess('Template created successfully');
      }

      await fetchTemplates();
      setTimeout(() => {
        closeModal();
      }, 1000);
    } catch (err: any) {
      console.error('Error saving template:', err);
      setFormError(err.response?.data?.error || 'Failed to save template');
    } finally {
      setFormLoading(false);
    }
  };

  const handleDeleteTemplate = async (templateId: string) => {
    if (!confirm('Are you sure you want to delete this template? This action cannot be undone.')) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      await axios.delete(
        `http://localhost:3000/api/credentials/guidance/${templateId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      await fetchTemplates();
    } catch (err: any) {
      console.error('Error deleting template:', err);
      alert(err.response?.data?.error || 'Failed to delete template');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-6">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Credential Guidance Templates</h2>
              <p className="text-gray-600">
                Manage credential setup instructions for different services
              </p>
            </div>
            <button
              onClick={openCreateModal}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create New Template
            </button>
          </div>

          {/* Search and Filters */}
          <div className="bg-white rounded-lg shadow p-4 space-y-4">
            <div className="flex gap-4">
              <div className="flex-1">
                <input
                  type="text"
                  placeholder="Search by credential type or display name..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  className="w-full px-4 py-2 border rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <button
                onClick={handleSearch}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
              >
                Search
              </button>
            </div>

            <div className="flex flex-wrap gap-4 items-center">
              <div>
                <label className="text-sm font-medium text-gray-700 mr-2">Status:</label>
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setPage(1);
                  }}
                  className="px-3 py-1 border rounded-md text-sm"
                >
                  <option value="all">All Statuses</option>
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </select>
              </div>
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="px-3 py-1 text-sm text-red-600 hover:text-red-800"
                >
                  Clear Filters
                </button>
              )}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Templates Table */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            {loading ? (
              <div className="p-6 text-center text-gray-600">Loading templates...</div>
            ) : templates.length === 0 ? (
              <div className="p-6 text-center text-gray-600">
                {hasActiveFilters ? 'No templates found matching your filters' : 'No credential guidance templates yet. Create one to get started!'}
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Credential Type
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Display Name
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Documentation
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Updated
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {templates.map((template) => (
                        <tr key={template.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <code className="text-sm bg-gray-100 px-2 py-1 rounded">
                              {template.credentialType}
                            </code>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">
                              {template.displayName}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                template.isActive
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-gray-100 text-gray-800'
                              }`}
                            >
                              {template.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            {template.documentationUrl ? (
                              <a
                                href={template.documentationUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline"
                              >
                                View Docs
                              </a>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                            {formatDate(template.updatedAt)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <div className="flex justify-end gap-3">
                              <button
                                onClick={() => openEditModal(template)}
                                className="text-blue-600 hover:text-blue-800"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDeleteTemplate(template.id)}
                                className="text-red-600 hover:text-red-800"
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

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="px-6 py-4 border-t border-gray-200 flex justify-between items-center">
                    <p className="text-sm text-gray-600">
                      Showing {(page - 1) * 10 + 1} - {Math.min(page * 10, total)} of {total} templates
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className="px-3 py-1 text-sm border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
                      >
                        Previous
                      </button>
                      <span className="px-3 py-1 text-sm text-gray-600">
                        Page {page} of {totalPages}
                      </span>
                      <button
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                        className="px-3 py-1 text-sm border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </main>

      {/* Create/Edit Template Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                {editingTemplate ? 'Edit Template' : 'Create New Template'}
              </h3>

              <form onSubmit={handleFormSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Credential Type <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.credentialType}
                    onChange={(e) => setFormData({ ...formData, credentialType: e.target.value })}
                    placeholder="e.g., slackApi, googleSheetsOAuth2Api"
                    className="w-full px-3 py-2 border rounded-md focus:ring-blue-500 focus:border-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    The technical identifier used by n8n (e.g., slackApi)
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Display Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.displayName}
                    onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                    placeholder="e.g., Slack API"
                    className="w-full px-3 py-2 border rounded-md focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Instructions (Markdown) <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={formData.instructionsMarkdown}
                    onChange={(e) => setFormData({ ...formData, instructionsMarkdown: e.target.value })}
                    rows={8}
                    placeholder="## Setting Up Slack API Credentials&#10;&#10;1. Go to api.slack.com&#10;2. Create a new app..."
                    className="w-full px-3 py-2 border rounded-md focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Markdown formatting is supported
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Documentation URL
                  </label>
                  <input
                    type="url"
                    value={formData.documentationUrl}
                    onChange={(e) => setFormData({ ...formData, documentationUrl: e.target.value })}
                    placeholder="https://docs.n8n.io/integrations/..."
                    className="w-full px-3 py-2 border rounded-md focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Video URL
                  </label>
                  <input
                    type="url"
                    value={formData.videoUrl}
                    onChange={(e) => setFormData({ ...formData, videoUrl: e.target.value })}
                    placeholder="https://youtube.com/watch?v=..."
                    className="w-full px-3 py-2 border rounded-md focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Contact Info
                  </label>
                  <input
                    type="text"
                    value={formData.contactInfo}
                    onChange={(e) => setFormData({ ...formData, contactInfo: e.target.value })}
                    placeholder="Ask @admin or contact IT support"
                    className="w-full px-3 py-2 border rounded-md focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="isActive"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                  />
                  <label htmlFor="isActive" className="ml-2 text-sm text-gray-700">
                    Active (visible to users)
                  </label>
                </div>

                {formError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                    <p className="text-sm text-red-800">{formError}</p>
                  </div>
                )}

                {formSuccess && (
                  <div className="p-3 bg-green-50 border border-green-200 rounded-md">
                    <p className="text-sm text-green-800">{formSuccess}</p>
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={formLoading}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400"
                  >
                    {formLoading ? 'Saving...' : editingTemplate ? 'Save Changes' : 'Create Template'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminCredentialGuidance;
