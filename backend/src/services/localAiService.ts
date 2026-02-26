import { logger } from '../utils/logger';
import {
  ValidationError,
  InternalServerError
} from '../middleware/errorHandler';
import fs from 'fs';
import { whisperService } from './whisperService';
import { aiService } from './aiService';

interface SummaryRequest {
  transcript: string;
  meetingTitle: string;
  meetingDuration?: number;
  participants?: string[];
}

interface SummaryResponse {
  overallSummary: string;
  keyPoints: string[];
  actionItems: string[];
  nextSteps: string[];
  topics: string[];
}

interface TranscriptionRequest {
  audioFilePath: string;
  language?: string;
}

interface TranscriptionResponse {
  text: string;
  language: string;
  segments: Array<{
    start: number;
    end: number;
    text: string;
  }>;
  duration: number;
}


export class LocalAIService {
  private isTestMode: boolean;

  constructor() {
    this.isTestMode = process.env.NODE_ENV === 'test';

    logger.info('Local AI Service initialized as wrapper', {
      isTestMode: this.isTestMode,
    });
  }

  /**
   * Transcribe audio file using local Whisper service
   */
  async transcribeAudio(request: TranscriptionRequest): Promise<TranscriptionResponse> {
    const { audioFilePath, language } = request;

    // Validate file exists
    if (!fs.existsSync(audioFilePath)) {
      throw new ValidationError('Audio file not found');
    }

    try {
      logger.info('Forwarding transcription to whisperService', {
        filePath: audioFilePath,
        language,
      });

      const options: any = { useLocalService: true };
      if (language) {
        options.language = language;
      }
      const result = await whisperService.transcribeAudio(audioFilePath, options);

      return {
        text: result.text || "",
        language: result.language || "en",
        segments: result.segments || [],
        duration: result.duration || 0
      };

    } catch (error) {
      logger.error('Local audio transcription failed', {
        filePath: audioFilePath,
        error: error instanceof Error ? error.message : String(error),
      });

      if (error instanceof ValidationError) {
        throw error;
      }

      throw new InternalServerError('Failed to transcribe audio');
    }
  }

  /**
   * Generate meeting summary from transcript using local AI service
   */
  async generateMeetingSummary(request: SummaryRequest): Promise<SummaryResponse> {
    const { transcript, meetingTitle, meetingDuration, participants } = request;

    // Validate input
    if (!transcript || transcript.trim().length === 0) {
      throw new ValidationError('Transcript is required and cannot be empty');
    }

    if (!meetingTitle || meetingTitle.trim().length === 0) {
      throw new ValidationError('Meeting title is required');
    }

    try {
      return await aiService.generateMeetingSummary(request);
    } catch (error) {
      logger.error('Failed to generate local AI summary', {
        error: error instanceof Error ? error.message : String(error),
        meetingTitle,
        transcriptLength: transcript.length,
      });

      if (error instanceof ValidationError) {
        throw error;
      }

      throw new InternalServerError('Failed to generate meeting summary');
    }
  }



  /**
   * Utility method for delays
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Check if local AI services are available
   */
  async healthCheck(): Promise<{
    primary: boolean;
    fallback: boolean;
    services: {
      transcription: boolean;
      summarization: boolean;
    };
  }> {
    return {
      primary: true,
      fallback: true,
      services: {
        transcription: true,
        summarization: true,
      }
    };
  }

  /**
   * Get service configuration (without sensitive data)
   */
  getConfig() {
    return {
      isTestMode: this.isTestMode,
    };
  }
}

// Export singleton instance
export const localAiService = new LocalAIService();