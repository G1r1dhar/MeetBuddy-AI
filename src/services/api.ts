/**
 * API Service
 * 
 * Re-exports the API client as 'api' for backward compatibility
 */

import { apiClient } from './apiClient';

export const api = apiClient;
export type { ApiResponse, ApiError } from './apiClient';