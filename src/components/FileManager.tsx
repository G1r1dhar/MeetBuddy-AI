/**
 * File Manager Component
 * 
 * Displays and manages user uploaded files with filtering and actions
 */

import { useState, useEffect } from 'react';
import {
  File,
  Download,
  Trash2,
  Eye,
  Search,
  HardDrive,
  Image,
  Video,
  Music,
  FileText,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { apiClient } from '../services/apiClient';

interface FileData {
  id: string;
  originalName: string;
  fileName: string;
  publicUrl: string;
  mimeType: string;
  size: number;
  category: string;
  createdAt: string;
  metadata?: any;
}

interface FileManagerProps {
  category?: 'avatar' | 'recording' | 'attachment' | 'export';
  onFileSelect?: (file: FileData) => void;
  className?: string;
}

export default function FileManager({
  category,
  onFileSelect,
  className = ''
}: FileManagerProps) {
  const [files, setFiles] = useState<FileData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>(category || 'all');
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'size'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [totalFiles, setTotalFiles] = useState(0);
  const [storageStats, setStorageStats] = useState<any>(null);

  const limit = 20;

  useEffect(() => {
    loadFiles();
    loadStorageStats();
  }, [selectedCategory, page]);

  const loadFiles = async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      });

      if (selectedCategory !== 'all') {
        params.append('category', selectedCategory);
      }

      const response = await apiClient.get(`/files?${params.toString()}`);

      const data = response.data as any;
      if (response.success) {
        setFiles(data.files);
        setTotalFiles(data.total);
      }
    } catch (error: any) {
      setError(error.message || 'Failed to load files');
    } finally {
      setLoading(false);
    }
  };

  const loadStorageStats = async () => {
    try {
      const response = await apiClient.get('/files/stats');
      const data = response.data as any;
      if (response.success) {
        setStorageStats(data.stats);
      }
    } catch (error) {
      console.warn('Failed to load storage stats:', error);
    }
  };

  const deleteFile = async (fileId: string) => {
    if (!confirm('Are you sure you want to delete this file?')) {
      return;
    }

    try {
      await apiClient.delete(`/files/${fileId}`);
      setFiles(prev => prev.filter(f => f.id !== fileId));
      loadStorageStats(); // Refresh stats
    } catch (error: any) {
      alert(error.message || 'Failed to delete file');
    }
  };

  const downloadFile = (file: FileData) => {
    const link = document.createElement('a');
    link.href = file.publicUrl;
    link.download = file.originalName;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) {
      return <Image className="w-5 h-5 text-blue-500" />;
    } else if (mimeType.startsWith('video/')) {
      return <Video className="w-5 h-5 text-purple-500" />;
    } else if (mimeType.startsWith('audio/')) {
      return <Music className="w-5 h-5 text-green-500" />;
    } else if (mimeType.includes('pdf') || mimeType.includes('document')) {
      return <FileText className="w-5 h-5 text-red-500" />;
    }
    return <File className="w-5 h-5 text-theme-icon" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const filteredFiles = files
    .filter(file =>
      file.originalName.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      let aValue, bValue;

      switch (sortBy) {
        case 'name':
          aValue = a.originalName.toLowerCase();
          bValue = b.originalName.toLowerCase();
          break;
        case 'size':
          aValue = a.size;
          bValue = b.size;
          break;
        case 'date':
        default:
          aValue = new Date(a.createdAt).getTime();
          bValue = new Date(b.createdAt).getTime();
          break;
      }

      if (sortOrder === 'asc') {
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      } else {
        return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
      }
    });

  const totalPages = Math.ceil(totalFiles / limit);

  return (
    <div className={`bg-theme-card rounded-lg border border-theme-card-border overflow-hidden transition-colors duration-300 ${className}`}>
      {/* Header */}
      <div className="p-6 border-b border-theme-card-border">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-theme-text">File Manager</h2>

          {storageStats && (
            <div className="flex items-center space-x-2 text-sm text-theme-text/70">
              <HardDrive className="w-4 h-4" />
              <span>
                {formatFileSize(storageStats.totalSize)} used • {storageStats.totalFiles} files
              </span>
            </div>
          )}
        </div>

        {/* Filters and Search */}
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-theme-icon" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search files..."
              className="w-full pl-10 pr-4 py-2 bg-theme-bg border border-theme-card-border rounded-lg text-sm text-theme-text placeholder-theme-text/40 focus:ring-2 focus:ring-theme-accent focus:border-transparent transition-colors"
            />
          </div>

          {/* Category Filter */}
          <select
            value={selectedCategory}
            onChange={(e) => {
              setSelectedCategory(e.target.value);
              setPage(1);
            }}
            className="bg-theme-bg border border-theme-card-border text-theme-text rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-theme-accent focus:border-transparent cursor-pointer transition-colors"
          >
            <option value="all">All Categories</option>
            <option value="avatar">Avatars</option>
            <option value="recording">Recordings</option>
            <option value="attachment">Attachments</option>
            <option value="export">Exports</option>
          </select>

          {/* Sort */}
          <select
            value={`${sortBy}-${sortOrder}`}
            onChange={(e) => {
              const [field, order] = e.target.value.split('-');
              setSortBy(field as any);
              setSortOrder(order as any);
            }}
            className="bg-theme-bg border border-theme-card-border text-theme-text rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-theme-accent focus:border-transparent cursor-pointer transition-colors"
          >
            <option value="date-desc">Newest First</option>
            <option value="date-asc">Oldest First</option>
            <option value="name-asc">Name A-Z</option>
            <option value="name-desc">Name Z-A</option>
            <option value="size-desc">Largest First</option>
            <option value="size-asc">Smallest First</option>
          </select>
        </div>
      </div>

      {/* File List */}
      <div className="p-6 bg-theme-bg/50">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-theme-accent animate-spin" />
            <span className="ml-2 text-theme-text/70">Loading files...</span>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-12 text-red-500">
            <AlertCircle className="w-8 h-8 mr-2" />
            <span>{error}</span>
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="text-center py-12 text-theme-text/60">
            <File className="w-12 h-12 mx-auto mb-4 text-theme-icon opacity-50" />
            <p>No files found</p>
            {searchTerm && (
              <p className="text-sm mt-2 opacity-70">Try adjusting your search or filters</p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredFiles.map((file) => (
              <div
                key={file.id}
                className="flex items-center justify-between p-4 bg-theme-card border border-theme-card-border rounded-lg hover:brightness-95 dark:hover:brightness-110 transition-all shadow-sm"
              >
                <div className="flex items-center space-x-4 flex-1 min-w-0">
                  {getFileIcon(file.mimeType)}

                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium text-theme-text truncate">
                      {file.originalName}
                    </h3>
                    <div className="flex items-center space-x-4 text-xs text-theme-text/60 mt-1">
                      <span>{formatFileSize(file.size)}</span>
                      <span>•</span>
                      <span>{formatDate(file.createdAt)}</span>
                      <span>•</span>
                      <span className="capitalize">{file.category}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => onFileSelect?.(file)}
                    className="p-2 text-theme-icon hover:text-theme-accent transition-colors"
                    title="View file"
                  >
                    <Eye className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => downloadFile(file)}
                    className="p-2 text-theme-icon hover:text-theme-accent transition-colors"
                    title="Download file"
                  >
                    <Download className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => deleteFile(file.id)}
                    className="p-2 text-theme-icon hover:text-red-500 transition-colors"
                    title="Delete file"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-6 pt-6 border-t border-theme-card-border">
            <div className="text-sm text-theme-text/70">
              Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, totalFiles)} of {totalFiles} files
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 bg-theme-bg border border-theme-card-border text-theme-text rounded text-sm hover:brightness-95 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Previous
              </button>

              <span className="text-sm text-theme-text/80 font-medium px-2">
                Page {page} of {totalPages}
              </span>

              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 bg-theme-bg border border-theme-card-border text-theme-text rounded text-sm hover:brightness-95 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}