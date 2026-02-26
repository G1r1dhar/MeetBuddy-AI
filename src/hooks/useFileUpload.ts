/**
 * File Upload Hook
 * 
 * Custom React hook for handling file uploads with progress tracking and validation
 */

import { useState, useCallback } from 'react';
import { apiClient } from '../services/apiClient';

export interface FileUploadOptions {
  endpoint: string;
  maxSize?: number;
  allowedTypes?: string[];
  onProgress?: (progress: number) => void;
  onSuccess?: (response: any) => void;
  onError?: (error: string) => void;
}

export interface FileUploadState {
  isUploading: boolean;
  progress: number;
  error: string | null;
  success: boolean;
}

export const useFileUpload = () => {
  const [uploadState, setUploadState] = useState<FileUploadState>({
    isUploading: false,
    progress: 0,
    error: null,
    success: false,
  });

  const validateFile = useCallback((file: File, options: FileUploadOptions): string | null => {
    // Check file size
    if (options.maxSize && file.size > options.maxSize) {
      return `File size exceeds ${Math.round(options.maxSize / 1024 / 1024)}MB limit`;
    }

    // Check file type
    if (options.allowedTypes && !options.allowedTypes.includes(file.type)) {
      return `File type ${file.type} is not allowed. Allowed types: ${options.allowedTypes.join(', ')}`;
    }

    return null;
  }, []);

  const uploadFile = useCallback(async (file: File, options: FileUploadOptions, additionalData?: Record<string, any>) => {
    // Validate file
    const validationError = validateFile(file, options);
    if (validationError) {
      setUploadState(prev => ({ ...prev, error: validationError }));
      options.onError?.(validationError);
      return null;
    }

    // Reset state
    setUploadState({
      isUploading: true,
      progress: 0,
      error: null,
      success: false,
    });

    try {
      // Create FormData
      const formData = new FormData();
      
      // Determine field name based on endpoint
      let fieldName = 'file';
      if (options.endpoint.includes('avatar')) {
        fieldName = 'avatar';
      } else if (options.endpoint.includes('recording')) {
        fieldName = 'recording';
      } else if (options.endpoint.includes('attachment')) {
        fieldName = 'attachment';
      }
      
      formData.append(fieldName, file);

      // Add additional data
      if (additionalData) {
        Object.entries(additionalData).forEach(([key, value]) => {
          formData.append(key, String(value));
        });
      }

      // Create XMLHttpRequest for progress tracking
      const xhr = new XMLHttpRequest();
      
      return new Promise((resolve, reject) => {
        // Track upload progress
        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const progress = Math.round((event.loaded / event.total) * 100);
            setUploadState(prev => ({ ...prev, progress }));
            options.onProgress?.(progress);
          }
        });

        // Handle completion
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const response = JSON.parse(xhr.responseText);
              setUploadState({
                isUploading: false,
                progress: 100,
                error: null,
                success: true,
              });
              options.onSuccess?.(response);
              resolve(response);
            } catch (error) {
              const errorMessage = 'Invalid response from server';
              setUploadState(prev => ({
                ...prev,
                isUploading: false,
                error: errorMessage,
              }));
              options.onError?.(errorMessage);
              reject(new Error(errorMessage));
            }
          } else {
            try {
              const errorResponse = JSON.parse(xhr.responseText);
              const errorMessage = errorResponse.error?.message || `Upload failed with status ${xhr.status}`;
              setUploadState(prev => ({
                ...prev,
                isUploading: false,
                error: errorMessage,
              }));
              options.onError?.(errorMessage);
              reject(new Error(errorMessage));
            } catch (error) {
              const errorMessage = `Upload failed with status ${xhr.status}`;
              setUploadState(prev => ({
                ...prev,
                isUploading: false,
                error: errorMessage,
              }));
              options.onError?.(errorMessage);
              reject(new Error(errorMessage));
            }
          }
        });

        // Handle errors
        xhr.addEventListener('error', () => {
          const errorMessage = 'Network error during upload';
          setUploadState(prev => ({
            ...prev,
            isUploading: false,
            error: errorMessage,
          }));
          options.onError?.(errorMessage);
          reject(new Error(errorMessage));
        });

        // Handle abort
        xhr.addEventListener('abort', () => {
          const errorMessage = 'Upload cancelled';
          setUploadState(prev => ({
            ...prev,
            isUploading: false,
            error: errorMessage,
          }));
          options.onError?.(errorMessage);
          reject(new Error(errorMessage));
        });

        // Set up request
        const token = apiClient.getToken();
        if (token) {
          xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        }

        // Start upload
        xhr.open('POST', `${import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000'}/api/files${options.endpoint}`);
        xhr.send(formData);
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Upload failed';
      setUploadState(prev => ({
        ...prev,
        isUploading: false,
        error: errorMessage,
      }));
      options.onError?.(errorMessage);
      throw error;
    }
  }, [validateFile]);

  const resetState = useCallback(() => {
    setUploadState({
      isUploading: false,
      progress: 0,
      error: null,
      success: false,
    });
  }, []);

  return {
    uploadState,
    uploadFile,
    resetState,
  };
};