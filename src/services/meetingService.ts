/**
 * Meeting Service
 * 
 * Handles all meeting-related API calls
 * Replaces mock meeting logic with real backend integration
 */

import { apiClient } from './apiClient';

export interface Meeting {
  id: string;
  title: string;
  description: string;
  scheduledTime: Date;
  startTime: Date;
  endTime?: Date;
  status: "SCHEDULED" | "RECORDING" | "COMPLETED" | "CANCELLED";
  participants: string[];
  platform: string;
  meetingUrl?: string;
  recordingUrl?: string;
  summary?: string;
  topics?: string[];
  notes?: string;
  mindMap?: MindMapNode;
  transcript?: TranscriptEntry[];
  createdBy: string;
  storageSize?: number;
}

export interface TranscriptEntry {
  id: string;
  speaker: string;
  text: string;
  timestamp: Date;
  confidence: number;
  isHallucination?: boolean;
}

export interface MindMapNode {
  id: string;
  text: string;
  children: MindMapNode[];
  x: number;
  y: number;
}

export interface CreateMeetingRequest {
  title: string;
  description: string;
  scheduledTime: Date;
  platform: string;
  meetingUrl?: string;
}

export interface UpdateMeetingRequest {
  title?: string;
  description?: string;
  scheduledTime?: Date;
  status?: Meeting['status'];
  notes?: string;
  participants?: string[];
}

export interface MeetingStats {
  totalMeetings: number;
  meetingsThisMonth: number;
  meetingsThisWeek: number;
  totalStorageUsed: number;
  completedMeetings: number;
  scheduledMeetings: number;
  recordingMeetings: number;
}

class MeetingService {
  async getAllMeetings(): Promise<Meeting[]> {
    try {
      console.log('🔍 Fetching meetings from API...');
      const response = await apiClient.get<any>('/meetings');
      console.log('📥 Raw API response:', response);

      // Backend returns: { message: "...", data: { meetings: [...], pagination: {...} } }
      // apiClient returns this entire response object
      if (response && response.data && response.data.meetings) {
        console.log('✅ Found meetings in response:', response.data.meetings.length);
        const transformedMeetings = response.data.meetings.map((meeting: any) => {
          console.log('🔄 Transforming meeting:', meeting.id, meeting.title);
          return {
            ...meeting,
            scheduledTime: new Date(meeting.scheduledTime),
            startTime: meeting.startTime ? new Date(meeting.startTime) : new Date(meeting.scheduledTime),
            endTime: meeting.endTime ? new Date(meeting.endTime) : undefined,
            transcript: (meeting.transcripts || meeting.transcript)?.map((entry: any) => ({
              ...entry,
              timestamp: new Date(entry.timestamp),
            })) || [],
            createdBy: meeting.userId, // Map userId to createdBy for compatibility
            // Restore summary from nested summaries[0] returned by the list endpoint
            summary: meeting.summaries?.[0]?.overallSummary || meeting.summary || undefined,
            topics: (() => {
              const t = meeting.summaries?.[0]?.topics;
              if (!t) return meeting.topics || [];
              try { return typeof t === 'string' ? JSON.parse(t) : t; } catch { return meeting.topics || []; }
            })(),
            notes: (() => {
              const s = meeting.summaries?.[0];
              if (!s) return meeting.notes || undefined;
              try {
                const kp: string[] = typeof s.keyPoints === 'string' ? JSON.parse(s.keyPoints || '[]') : (s.keyPoints || []);
                const ai: string[] = typeof s.actionItems === 'string' ? JSON.parse(s.actionItems || '[]') : (s.actionItems || []);
                const ns: string[] = typeof s.nextSteps === 'string' ? JSON.parse(s.nextSteps || '[]') : (s.nextSteps || []);
                return [...kp, ...ai, ...ns].join('\n') || meeting.notes || undefined;
              } catch { return meeting.notes || undefined; }
            })(),
          };
        });
        console.log('✅ Transformed meetings:', transformedMeetings);
        return transformedMeetings;
      }

      console.error('❌ Invalid meetings response format:', response);
      throw new Error('Invalid meetings response format');
    } catch (error: any) {
      console.error('❌ Get meetings error:', error);
      throw new Error(error.message || 'Failed to get meetings');
    }
  }

  async getMeeting(id: string): Promise<Meeting> {
    try {
      const response = await apiClient.get<any>(`/meetings/${id}`);

      // Backend returns the meeting object directly for single meeting requests
      if (response && response.data) {
        const meeting = response.data;
        return {
          ...meeting,
          scheduledTime: new Date(meeting.scheduledTime),
          startTime: meeting.startTime ? new Date(meeting.startTime) : new Date(meeting.scheduledTime),
          endTime: meeting.endTime ? new Date(meeting.endTime) : undefined,
          transcript: (meeting.transcripts || meeting.transcript)?.map((entry: any) => ({
            ...entry,
            timestamp: new Date(entry.timestamp),
          })) || [],
          // Restore summary fields from nested summaries[] returned by the single-meeting endpoint
          summary: meeting.summaries?.[0]?.overallSummary || meeting.summary || undefined,
          topics: (() => {
            const t = meeting.summaries?.[0]?.topics;
            if (!t) return meeting.topics || [];
            try { return typeof t === 'string' ? JSON.parse(t) : t; } catch { return meeting.topics || []; }
          })(),
          notes: (() => {
            const s = meeting.summaries?.[0];
            if (!s) return meeting.notes || undefined;
            try {
              const kp: string[] = typeof s.keyPoints === 'string' ? JSON.parse(s.keyPoints || '[]') : (s.keyPoints || []);
              const ai: string[] = typeof s.actionItems === 'string' ? JSON.parse(s.actionItems || '[]') : (s.actionItems || []);
              const ns: string[] = typeof s.nextSteps === 'string' ? JSON.parse(s.nextSteps || '[]') : (s.nextSteps || []);
              return [...kp, ...ai, ...ns].join('\n') || meeting.notes || undefined;
            } catch { return meeting.notes || undefined; }
          })(),
        };
      }

      throw new Error('Failed to get meeting');
    } catch (error: any) {
      console.error('Get meeting error:', error);
      throw new Error(error.message || 'Failed to get meeting');
    }
  }

  async createMeeting(meetingData: CreateMeetingRequest): Promise<Meeting> {
    try {
      // Convert Date to ISO string for backend validation
      const requestData = {
        ...meetingData,
        scheduledTime: meetingData.scheduledTime.toISOString(),
      };

      const response = await apiClient.post<any>('/meetings', requestData);

      // Backend returns: { message: "Meeting created successfully", data: { meeting: {...} } }
      if (response && response.data && response.data.meeting) {
        const meeting = response.data.meeting;
        return {
          ...meeting,
          scheduledTime: new Date(meeting.scheduledTime),
          startTime: meeting.startTime ? new Date(meeting.startTime) : undefined,
          endTime: meeting.endTime ? new Date(meeting.endTime) : undefined,
        };
      }

      throw new Error('Invalid meeting creation response format');
    } catch (error: any) {
      console.error('Create meeting error:', error);
      console.error('Meeting data sent:', meetingData);
      throw new Error(error.message || 'Failed to create meeting');
    }
  }

  async updateMeeting(id: string, updates: UpdateMeetingRequest): Promise<Meeting> {
    try {
      const response = await apiClient.put<any>(`/meetings/${id}`, updates);

      // Backend returns the updated meeting object directly
      if (response && response.data) {
        const meeting = response.data;
        return {
          ...meeting,
          scheduledTime: new Date(meeting.scheduledTime),
          startTime: meeting.startTime ? new Date(meeting.startTime) : new Date(meeting.scheduledTime),
          endTime: meeting.endTime ? new Date(meeting.endTime) : undefined,
          transcript: (meeting.transcripts || meeting.transcript)?.map((entry: any) => ({
            ...entry,
            timestamp: new Date(entry.timestamp),
          })) || [],
        };
      }

      throw new Error('Failed to update meeting');
    } catch (error: any) {
      console.error('Update meeting error:', error);
      throw new Error(error.message || 'Failed to update meeting');
    }
  }

  async deleteMeeting(id: string): Promise<void> {
    try {
      await apiClient.delete(`/meetings/${id}`);
      // If no error is thrown, the deletion was successful
    } catch (error: any) {
      console.error('Delete meeting error:', error);
      throw new Error(error.message || 'Failed to delete meeting');
    }
  }

  async startMeeting(id: string): Promise<Meeting> {
    try {
      const response = await apiClient.post<any>(`/meetings/${id}/start`);

      if (response && response.data) {
        const meeting = response.data;
        return {
          ...meeting,
          scheduledTime: new Date(meeting.scheduledTime),
          startTime: meeting.startTime ? new Date(meeting.startTime) : new Date(),
          endTime: meeting.endTime ? new Date(meeting.endTime) : undefined,
        };
      }

      throw new Error('Failed to start meeting');
    } catch (error: any) {
      console.error('Start meeting error:', error);
      throw new Error(error.message || 'Failed to start meeting');
    }
  }

  async endMeeting(id: string): Promise<Meeting> {
    try {
      const response = await apiClient.post<any>(`/meetings/${id}/end`);

      if (response && response.data) {
        const meeting = response.data;
        return {
          ...meeting,
          scheduledTime: new Date(meeting.scheduledTime),
          startTime: meeting.startTime ? new Date(meeting.startTime) : new Date(),
          endTime: meeting.endTime ? new Date(meeting.endTime) : new Date(),
          transcript: (meeting.transcripts || meeting.transcript)?.map((entry: any) => ({
            ...entry,
            timestamp: new Date(entry.timestamp),
          })) || [],
          // Restore summary fields from nested summaries[] returned by endMeeting
          summary: meeting.summaries?.[0]?.overallSummary || meeting.summary || undefined,
          topics: (() => {
            const t = meeting.summaries?.[0]?.topics;
            if (!t) return meeting.topics || [];
            try { return typeof t === 'string' ? JSON.parse(t) : t; } catch { return meeting.topics || []; }
          })(),
          notes: (() => {
            const s = meeting.summaries?.[0];
            if (!s) return meeting.notes || undefined;
            try {
              const kp: string[] = typeof s.keyPoints === 'string' ? JSON.parse(s.keyPoints || '[]') : (s.keyPoints || []);
              const ai: string[] = typeof s.actionItems === 'string' ? JSON.parse(s.actionItems || '[]') : (s.actionItems || []);
              const ns: string[] = typeof s.nextSteps === 'string' ? JSON.parse(s.nextSteps || '[]') : (s.nextSteps || []);
              return [...kp, ...ai, ...ns].join('\n') || meeting.notes || undefined;
            } catch { return meeting.notes || undefined; }
          })(),
        };
      }

      throw new Error('Failed to end meeting');
    } catch (error: any) {
      console.error('End meeting error:', error);
      throw new Error(error.message || 'Failed to end meeting');
    }
  }

  async addTranscriptEntry(meetingId: string, entry: Omit<TranscriptEntry, 'id'>): Promise<TranscriptEntry> {
    try {
      const response = await apiClient.post<any>(`/meetings/${meetingId}/transcript`, entry);

      if (response && response.data) {
        return {
          ...response.data,
          timestamp: new Date(response.data.timestamp),
        };
      }

      throw new Error('Failed to add transcript entry');
    } catch (error: any) {
      console.error('Add transcript entry error:', error);
      throw new Error(error.message || 'Failed to add transcript entry');
    }
  }

  async generateSummary(meetingId: string): Promise<{ summary: string; topics: string[]; notes: string }> {
    try {
      const response = await apiClient.post<any>(`/summaries/generate`, { meetingId });

      if (response && response.data) {
        const data = response.data;
        const notes = [
          ...((data.keyPoints as string[]) || []),
          ...((data.actionItems as string[]) || []),
          ...((data.nextSteps as string[]) || [])
        ].join('\n');

        return {
          summary: data.overallSummary || 'No summary generated.',
          topics: data.topics || [],
          notes: notes || 'No notes available.',
        };
      }

      throw new Error('Failed to generate summary');
    } catch (error: any) {
      console.error('Generate summary error:', error);
      throw new Error(error.message || 'Failed to generate summary');
    }
  }

    async generateMindMap(meetingId: string): Promise<MindMapNode> {
    try {
      // Use apiClient.post so the baseURL and auth token are resolved correctly
      const response = await apiClient.post<any>(`/meetings/${meetingId}/mindmap`);

      // apiClient unwraps { message, data } from the backend response,
      // so response.data is the raw MindMapNode from the server.
      const rawNode = response.data;

      if (!rawNode || typeof rawNode !== 'object') {
        throw new Error('Invalid mind map response from server');
      }

      const mapNode = (node: any, cx: number, cy: number, radius: number, angleOffset: number = 0): MindMapNode => {
        const children = Array.isArray(node.children) ? node.children : [];
        return {
          id: node.id || Math.random().toString(36).substring(7),
          text: node.label || node.text || 'Topic',
          x: cx,
          y: cy,
          children: children.map((child: any, i: number) => {
            const angle = angleOffset + (i / Math.max(children.length, 1)) * 2 * Math.PI - Math.PI / 2;
            const newRadius = radius * 0.7;
            const childX = cx + radius * Math.cos(angle);
            const childY = cy + radius * Math.sin(angle);
            return mapNode(child, childX, childY, newRadius, angle);
          })
        };
      };

      return mapNode(rawNode, 400, 300, 220);
    } catch (error: any) {
      console.error('Generate mind map error:', error);
      throw new Error(error.message || 'Failed to generate mind map');
    }
  }

  async exportMeeting(meetingId: string, format: 'json' | 'pdf' | 'txt'): Promise<Blob> {
    try {
      const response = await fetch(`${apiClient['baseURL']}/meetings/${meetingId}/export?format=${format}`, {
        headers: {
          'Authorization': `Bearer ${apiClient.getToken()}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to export meeting');
      }

      return await response.blob();
    } catch (error: any) {
      console.error('Export meeting error:', error);
      throw new Error(error.message || 'Failed to export meeting');
    }
  }

  async getMeetingStats(): Promise<MeetingStats> {
    try {
      const response = await apiClient.get<any>('/meetings/stats');

      if (response && response.data) {
        return response.data;
      }

      throw new Error('Failed to get meeting stats');
    } catch (error: any) {
      console.error('Get meeting stats error:', error);
      throw new Error(error.message || 'Failed to get meeting stats');
    }
  }

  async searchMeetings(query: string, filters?: {
    status?: Meeting['status'];
    platform?: string;
    dateFrom?: Date;
    dateTo?: Date;
  }): Promise<Meeting[]> {
    try {
      const params = new URLSearchParams({ q: query });

      if (filters?.status) params.append('status', filters.status);
      if (filters?.platform) params.append('platform', filters.platform);
      if (filters?.dateFrom) params.append('dateFrom', filters.dateFrom.toISOString());
      if (filters?.dateTo) params.append('dateTo', filters.dateTo.toISOString());

      const response = await apiClient.get<any>(`/meetings/search?${params.toString()}`);

      if (response && Array.isArray(response)) {
        return response.map((meeting: any) => ({
          ...meeting,
          scheduledTime: new Date(meeting.scheduledTime),
          startTime: meeting.startTime ? new Date(meeting.startTime) : new Date(meeting.scheduledTime),
          endTime: meeting.endTime ? new Date(meeting.endTime) : undefined,
          transcript: (meeting.transcripts || meeting.transcript)?.map((entry: any) => ({
            ...entry,
            timestamp: new Date(entry.timestamp),
          })) || [],
        }));
      }

      throw new Error('Failed to search meetings');
    } catch (error: any) {
      console.error('Search meetings error:', error);
      throw new Error(error.message || 'Failed to search meetings');
    }
  }

  // Utility methods for local calculations (fallback if API doesn't provide)
  calculateMeetingsThisMonth(meetings: Meeting[]): number {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    return meetings.filter(m => m.startTime >= startOfMonth).length;
  }

  calculateMeetingsThisWeek(meetings: Meeting[]): number {
    const now = new Date();
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
    return meetings.filter(m => m.startTime >= startOfWeek).length;
  }

  calculateTotalStorageUsed(meetings: Meeting[]): number {
    return meetings.reduce((total, meeting) => total + (meeting.storageSize || 0), 0);
  }
}

// Create singleton instance
export const meetingService = new MeetingService();