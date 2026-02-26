
import { logger } from '../utils/logger';
import { ValidationError } from '../middleware/errorHandler';
import { localAiService } from './localAiService';
import fs from 'fs';
import path from 'path';

// We will load @xenova/transformers dynamically to avoid ERR_REQUIRE_ESM when compiled to CommonJS.
let pipeline: any = null;
let env: any = null;
import ffmpeg from 'fluent-ffmpeg';
// @ts-ignore
import ffmpegStatic from 'ffmpeg-static';
import { WaveFile } from 'wavefile';

if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

/**
 * Service for handling real-time transcription using OpenAI Whisper
 */
export class WhisperService {
  private transcriber: any = null;
  private isInitializing = false;

  constructor() {
    logger.info('Initializing WhisperService', {
      colabUrl: process.env.COLAB_WHISPER_URL ? 'PRESENT' : 'MISSING',
      urlValue: process.env.COLAB_WHISPER_URL
    });
    this.initLocalModel();
  }

  private async initLocalModel() {
    if (this.transcriber || this.isInitializing) return;
    try {
      this.isInitializing = true;
      if (!pipeline || !env) {
        // Use Function to prevent TypeScript from transpiling import() to require()
        const transformers = await Function('return import("@xenova/transformers")')();
        pipeline = transformers.pipeline;
        env = transformers.env;
      }

      env.allowLocalModels = true;
      this.transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-base.en');
      logger.info('Local Whisper model initialized successfully.');
    } catch (error) {
      logger.error('Failed to initialize local Whisper model', { error });
    } finally {
      this.isInitializing = false;
    }
  }

  private convertAudioToWav(inputPath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .toFormat('wav')
        .audioChannels(1)
        .audioFrequency(16000)
        .on('end', () => resolve())
        .on('error', (err: any) => reject(err))
        .save(outputPath);
    });
  }

  private cleanTranscriptText(text: string): string {
    if (!text) return '';

    // Remove tags like [BLANK_AUDIO], (music), *clears throat*
    let cleaned = text.replace(/\[.*?\]/gi, '').replace(/\(.*?\)/gi, '').replace(/\*.*?\*/gi, '');

    let trimmed = cleaned.trim();
    const lowerTrimmed = trimmed.toLowerCase();

    // Drop common whisper hallucinations if they are the entire text (ignoring punctuation)
    const exactHallucinations = [
      'thank you', 'thanks for watching', 'thank you for watching', 'thanks',
      'subscribe', 'please subscribe', 'bye', 'bye bye', 'you', 'silence',
      'blankaudio', 'amaraorg', 'youre welcome', 'vanilla extract', 'cake',
      '1 egg', 'lets get started', 'let us get started'
    ];

    const punctuationLess = lowerTrimmed.replace(/[^a-z0-9\s]/g, '').trim();
    if (exactHallucinations.includes(punctuationLess)) {
      return '';
    }

    // Drop if contains known subtitle credits or irritating common hallucinations
    if (
      punctuationLess.includes('subtitles by') ||
      punctuationLess.includes('amara') ||
      punctuationLess.includes('translated by') ||
      punctuationLess.includes('welcome to my channel') ||
      punctuationLess.includes('in this video i will show you') ||
      punctuationLess.includes('press the bell icon') ||
      punctuationLess.includes('receive all new video notifications')
    ) {
      return '';
    }

    // Handle repetitive hallucinations like "1 tsp vanilla extract" repeating
    if (lowerTrimmed.includes('vanilla extract') && lowerTrimmed.split('vanilla extract').length > 2) {
      return '';
    }

    // Drop if no alphanumeric characters present
    if (!/[a-zA-Z0-9]/.test(trimmed)) {
      return '';
    }

    return trimmed;
  }

  /**
   * Transcribe audio file using Whisper
   */
  async transcribeAudio(
    audioFilePath: string,
    options: {
      language?: string;
      prompt?: string;
      temperature?: number;
      response_format?: 'json' | 'text' | 'srt' | 'verbose_json' | 'vtt';
      useLocalService?: boolean;
    } = {}
  ): Promise<any> {
    try {
      // Validate file exists
      if (!fs.existsSync(audioFilePath)) {
        throw new ValidationError('Audio file not found');
      }

      // Check file size (Whisper API has 25MB limit)
      const stats = fs.statSync(audioFilePath);
      const fileSizeInMB = stats.size / (1024 * 1024);

      if (fileSizeInMB > 25) {
        throw new ValidationError('Audio file too large. Maximum size is 25MB');
      }

      logger.info('Starting audio transcription', {
        filePath: audioFilePath,
        fileSize: `${fileSizeInMB.toFixed(2)}MB`,
        options,
        useLocalService: true,
      });

      const tempWav = audioFilePath + '.wav';
      await this.convertAudioToWav(audioFilePath, tempWav);
      const buffer = fs.readFileSync(tempWav);

      // --- NEW COLAB API INTEGRATION ---
      const colabUrl = process.env.COLAB_WHISPER_URL;

      if (colabUrl) {
        try {
          const colabUrlTrimmed = colabUrl.endsWith('/') ? colabUrl.slice(0, -1) : colabUrl;
          logger.info(`Attempting transcription via Colab Backend: ${colabUrlTrimmed}/transcribe`);

          const formData = new FormData();
          const fileBlob = new Blob([buffer], { type: 'audio/wav' });
          formData.append('file', fileBlob, 'audio.wav');
          formData.append('language', options.language || 'en');
          formData.append('temperature', (options.temperature !== undefined ? options.temperature : 0.0).toString());

          // We use global fetch since Node 18+ supports it
          const colabResponse = await fetch(`${colabUrlTrimmed}/transcribe`, {
            method: 'POST',
            body: formData as any,
            headers: {
              'ngrok-skip-browser-warning': 'true'
            }
          });

          if (!colabResponse.ok) {
            const errorText = await colabResponse.text();
            throw new Error(`Colab API returned ${colabResponse.status}: ${errorText}`);
          }

          const colabData = await colabResponse.json() as { text: string; confidence: number };

          if (fs.existsSync(tempWav)) fs.unlinkSync(tempWav);

          const cleanedText = this.cleanTranscriptText(colabData.text || '');

          logger.info('Colab transcription successful', {
            originalTextLength: colabData.text?.length,
            cleanedTextLength: cleanedText.length,
            confidence: colabData.confidence
          });

          return {
            text: cleanedText || '[No Audio]',
            duration: 0,
            language: options.language || 'en',
            model: 'Large'
          };

        } catch (colabError) {
          logger.warn('Colab transcription failed, falling back to local Xenova model', { error: colabError });
          // Fall through to Xenova
        }
      }

      // --- FALLBACK LOCAL XENOVA MODEL ---
      if (!this.transcriber) await this.initLocalModel();
      if (!this.transcriber) throw new Error("Local Whisper model failed to initialize");

      const wav = new WaveFile(buffer);
      wav.toBitDepth('32f');
      wav.toSampleRate(16000);

      let audioData: any = wav.getSamples(false, Float32Array);
      if (Array.isArray(audioData)) {
        if (audioData.length > 0) audioData = audioData[0];
        else audioData = new Float32Array(0);
      }

      // Calculate RMS to detect silence and prevent hallucinations
      let sumSquares = 0;
      for (let i = 0; i < audioData.length; i++) {
        sumSquares += audioData[i] * audioData[i];
      }
      const rms = Math.sqrt(sumSquares / audioData.length);

      logger.info('Audio RMS calculated', { rms, length: audioData.length });

      // If RMS is very low, it's likely just silence/noise.
      // Skip transcription to prevent the local Whisper model from hallucinating.
      if (rms < 0.005) {
        logger.info('Audio is likely silence, skipping transcription to prevent hallucinations');
        if (fs.existsSync(tempWav)) fs.unlinkSync(tempWav);
        return {
          text: '[Silence]',
          duration: 0,
          language: 'en',
          model: 'Local'
        };
      }

      logger.info('Calling local Xenova transcriber', {
        audioDataLength: audioData.length,
        options
      });

      // Pass options directly to transcribers
      const transcriberOptions = {
        language: options.language || 'en',
        temperature: options.temperature !== undefined ? options.temperature : [0.0, 0.2, 0.4, 0.6, 0.8, 1.0],
      };

      const output = await this.transcriber(audioData, transcriberOptions);

      if (fs.existsSync(tempWav)) fs.existsSync(tempWav) && fs.unlinkSync(tempWav);

      const cleanedText = this.cleanTranscriptText(output.text || '');

      logger.info('Local Xenova audio transcription completed', {
        filePath: audioFilePath,
        originalTextLength: output.text?.length,
        cleanedTextLength: cleanedText.length,
        rawOutput: output
      });

      return {
        text: cleanedText || '[Silence]',
        duration: 0,
        language: 'en',
        model: 'Local'
      };


    } catch (error: any) {
      logger.error('Audio transcription failed', {
        filePath: audioFilePath,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Transcribe audio buffer (for real-time streaming)
   */
  async transcribeBuffer(
    audioBuffer: Buffer,
    filename: string,
    options: {
      language?: string;
      prompt?: string;
      temperature?: number;
    } = {}
  ): Promise<any> {
    try {
      // Create temporary file
      const tempDir = process.env.TEMP_DIR || '/tmp';
      const tempFilePath = path.join(tempDir, `whisper_${Date.now()}_${filename}`);

      // Write buffer to temporary file
      fs.writeFileSync(tempFilePath, audioBuffer);

      try {
        // Transcribe the temporary file
        const result = await this.transcribeAudio(tempFilePath, {
          ...options,
          response_format: 'verbose_json'
        });

        return result;
      } finally {
        // Clean up temporary file
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
        }
      }

    } catch (error: any) {
      logger.error('Buffer transcription failed', {
        bufferSize: audioBuffer.length,
        filename,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Process real-time audio chunks for live transcription
   */
  async processAudioChunk(
    audioChunk: Buffer,
    meetingId: string,
    chunkIndex: number,
    options: {
      language?: string;
      speaker?: string;
      timestamp?: Date;
    } = {}
  ): Promise<{
    text: string;
    confidence: number;
    timestamp: Date;
    speaker: string;
    isFinal: boolean;
    model: string;
  }> {
    try {
      const filename = `meeting_${meetingId}_chunk_${chunkIndex}.webm`;

      // Transcribe the audio chunk
      const transcription = await this.transcribeBuffer(audioChunk, filename, {
        ...(options.language && { language: options.language }),
        temperature: 0.1, // Lower temperature for more consistent results
      });

      // Extract text and confidence
      const text = transcription.text || '';
      const segments = (transcription as any).segments || [];

      // Calculate average confidence from segments
      let totalConfidence = 0;
      let segmentCount = 0;

      if (segments.length > 0) {
        segments.forEach((segment: any) => {
          if (segment.avg_logprob !== undefined) {
            // Convert log probability to confidence (0-1)
            const confidence = Math.exp(segment.avg_logprob);
            totalConfidence += confidence;
            segmentCount++;
          }
        });
      }

      const averageConfidence = segmentCount > 0 ? totalConfidence / segmentCount : 0.8;

      const result = {
        text: text.trim() || '[No Audio]',
        confidence: Math.min(Math.max(averageConfidence, 0), 1), // Clamp between 0 and 1
        timestamp: options.timestamp || new Date(),
        speaker: options.speaker || 'Unknown',
        isFinal: true, // Whisper API always returns final results
        model: transcription.model || 'Unknown'
      };

      logger.debug('Audio chunk processed', {
        meetingId,
        chunkIndex,
        textLength: result.text.length,
        confidence: result.confidence,
        speaker: result.speaker,
        model: result.model
      });

      return result;

    } catch (error: any) {
      logger.error('Audio chunk processing failed', {
        meetingId,
        chunkIndex,
        chunkSize: audioChunk.length,
        error: error.message
      });

      // Return empty result on error
      return {
        text: '',
        confidence: 0,
        timestamp: options.timestamp || new Date(),
        speaker: options.speaker || 'Unknown',
        isFinal: false,
        model: 'Unknown'
      };
    }
  }

  /**
   * Get supported languages for Whisper
   */
  getSupportedLanguages(): string[] {
    return [
      'af', 'am', 'ar', 'as', 'az', 'ba', 'be', 'bg', 'bn', 'bo', 'br', 'bs', 'ca', 'cs', 'cy', 'da', 'de', 'el', 'en', 'es', 'et', 'eu', 'fa', 'fi', 'fo', 'fr', 'gl', 'gu', 'ha', 'haw', 'he', 'hi', 'hr', 'ht', 'hu', 'hy', 'id', 'is', 'it', 'ja', 'jw', 'ka', 'kk', 'km', 'kn', 'ko', 'la', 'lb', 'ln', 'lo', 'lt', 'lv', 'mg', 'mi', 'mk', 'ml', 'mn', 'mr', 'ms', 'mt', 'my', 'ne', 'nl', 'nn', 'no', 'oc', 'pa', 'pl', 'ps', 'pt', 'ro', 'ru', 'sa', 'sd', 'si', 'sk', 'sl', 'sn', 'so', 'sq', 'sr', 'su', 'sv', 'sw', 'ta', 'te', 'tg', 'th', 'tk', 'tl', 'tr', 'tt', 'uk', 'ur', 'uz', 'vi', 'yi', 'yo', 'zh'
    ];
  }

  /**
   * Validate audio file format
   */
  isValidAudioFormat(filename: string): boolean {
    const supportedFormats = [
      '.mp3', '.mp4', '.mpeg', '.mpga', '.m4a', '.wav', '.webm'
    ];

    const ext = path.extname(filename).toLowerCase();
    return supportedFormats.includes(ext);
  }

  /**
   * Check health of Colab backend service
   */
  private async checkColabHealth(): Promise<{ available: boolean; model?: string }> {
    const colabUrl = process.env.COLAB_WHISPER_URL;
    if (!colabUrl) return { available: false };

    try {
      const colabUrlTrimmed = colabUrl.endsWith('/') ? colabUrl.slice(0, -1) : colabUrl;
      const response = await fetch(`${colabUrlTrimmed}/health`, {
        headers: {
          'ngrok-skip-browser-warning': 'true'
        }
      });

      if (response.ok) {
        return { available: true, model: 'Large' };
      }

      // If /health returns 404, try hitting /transcribe with GET or empty POST
      // to see if it exists (usually returns 405 or 422 if it exists)
      if (response.status === 404) {
        const transcribeResp = await fetch(`${colabUrlTrimmed}/transcribe`, {
          method: 'POST',
          headers: {
            'ngrok-skip-browser-warning': 'true'
          }
        });
        // 422 Unprocessable Entity or 405 Method Not Allowed means it exists
        if (transcribeResp.status !== 404) {
          return { available: true, model: 'Large' };
        }
      }

      return { available: false };
    } catch (error) {
      return { available: false };
    }
  }

  /**
   * Get service status
   */
  async getStatus(): Promise<{
    available: boolean;
    model: string;
    supportedFormats: string[];
    maxFileSize: string;
    colabAvailable: boolean;
    openaiService: {
      available: boolean;
    };
  }> {
    try {
      const colabStatus = await this.checkColabHealth();
      const localModel = 'Local';

      return {
        available: true,
        model: colabStatus.available ? (colabStatus.model || 'Large') : localModel,
        supportedFormats: ['.mp3', '.mp4', '.mpeg', '.mpga', '.m4a', '.wav', '.webm'],
        maxFileSize: colabStatus.available ? '100MB' : 'Unlimited (Local)',
        colabAvailable: colabStatus.available,
        openaiService: {
          available: false,
        },
      };
    } catch (error) {
      logger.error('Whisper service status check failed', { error });
      return {
        available: true,
        model: 'Local',
        supportedFormats: ['.mp3', '.mp4', '.mpeg', '.mpga', '.m4a', '.wav', '.webm'],
        maxFileSize: 'Unlimited (Local)',
        colabAvailable: false,
        openaiService: {
          available: false,
        },
      };
    }
  }
}

// Export singleton instance
export const whisperService = new WhisperService();