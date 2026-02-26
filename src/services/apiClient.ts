/**
 * API Client Service
 * 
 * Centralized HTTP client for backend API communication
 * Handles authentication, error handling, and request/response processing
 */

interface ApiResponse<T> {
  data: T;
  message?: string;
  success: boolean;
}

interface ApiError {
  message: string;
  status: number;
  code?: string;
}

class ApiClient {
  private baseURL: string;
  private token: string | null = null;

  constructor(baseURL?: string) {
    if (baseURL) {
      this.baseURL = baseURL;
    } else {
      // @ts-ignore - VITE_BACKEND_URL might not be typed
      const envUrl = typeof import_meta !== 'undefined' ? (import.meta as any).env?.VITE_BACKEND_URL : undefined;
      this.baseURL = envUrl ? `${envUrl}/api` : '/api';
    }
    this.loadToken();
  }

  private loadToken(): void {
    this.token = localStorage.getItem('meetbuddy_token');
  }

  private saveToken(token: string): void {
    this.token = token;
    localStorage.setItem('meetbuddy_token', token);
  }

  private removeToken(): void {
    this.token = null;
    localStorage.removeItem('meetbuddy_token');
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseURL}${endpoint}`;

    const headers: Record<string, string> = { ...options.headers } as Record<string, string>;

    // Only set Content-Type for non-FormData requests
    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    // Always ensure we have the latest token from storage (fixes 401 on delayed token loads)
    const currentToken = localStorage.getItem('meetbuddy_token');
    if (currentToken && currentToken !== this.token) {
      this.token = currentToken;
    }

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      console.log('API Request:', { url, method: options.method || 'GET', status: response.status });

      let data;
      try {
        const textData = await response.text();
        data = textData ? JSON.parse(textData) : {};
      } catch (parseError) {
        console.warn('Failed to parse API response as JSON', { url, status: response.status });
        data = {};
      }

      if (!response.ok) {
        console.log('API Error Response:', { status: response.status, data, url });

        // Prefer explicit validation details over generic message
        const errorMessage = data.error?.details || data.error?.message || data.error || data.message || `HTTP Error ${response.status}`;

        const error = new Error(errorMessage) as Error & ApiError;
        error.status = response.status;
        error.code = data.error?.code || data.code;
        throw error;
      }

      // Backend returns different response format, normalize it
      if (data.message && data.data !== undefined) {
        // Backend format: { message: "...", data: {...} }
        return {
          data: data.data,
          message: data.message,
          success: true,
        };
      }

      // Fallback for other formats
      return {
        data: data,
        success: true,
      };
    } catch (error) {
      if (error instanceof Error && 'status' in error) {
        // API error
        throw error;
      } else {
        // Network or other error
        const apiError: ApiError = {
          message: error instanceof Error ? error.message : 'Network error',
          status: 0,
        };
        throw apiError;
      }
    }
  }

  async get<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  async post<T>(endpoint: string, data?: any, options?: { headers?: HeadersInit }): Promise<ApiResponse<T>> {
    const requestOptions: RequestInit = {
      method: 'POST',
    };

    // Handle FormData differently from JSON
    if (data instanceof FormData) {
      requestOptions.body = data;
      // Don't set Content-Type for FormData, let browser set it with boundary
    } else if (data) {
      requestOptions.body = JSON.stringify(data);
    }

    // Merge any additional options
    if (options?.headers) {
      requestOptions.headers = { ...requestOptions.headers, ...options.headers };
    }

    return this.request<T>(endpoint, requestOptions);
  }

  async put<T>(endpoint: string, data?: any): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async patch<T>(endpoint: string, data?: any): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async delete<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }

  // Authentication methods
  setToken(token: string): void {
    this.saveToken(token);
  }

  clearToken(): void {
    this.removeToken();
  }

  getToken(): string | null {
    return this.token;
  }

  isAuthenticated(): boolean {
    return !!this.token;
  }
}

// Create singleton instance
export const apiClient = new ApiClient();

// Export types for use in other services
export type { ApiResponse, ApiError };