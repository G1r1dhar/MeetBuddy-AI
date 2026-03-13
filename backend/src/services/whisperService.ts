
import { logger } from '../utils/logger';
import { ValidationError } from '../middleware/errorHandler';
import { localAiService } from './localAiService';
import fs from 'fs';
import path from 'path';

import { fork, ChildProcess } from 'child_process';
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
  private workerProcess: ChildProcess | null = null;
  private workerCallbacks = new Map<string, { resolve: Function, reject: Function }>();
  private messageIdCounter = 0;
  private isInitializing = false;

  constructor() {
    logger.info('Initializing WhisperService', {
      colabUrl: process.env.COLAB_WHISPER_URL ? 'PRESENT' : 'MISSING',
      urlValue: process.env.COLAB_WHISPER_URL
    });
    this.initLocalModel();
  }

  private async initLocalModel() {
    if (this.workerProcess || this.isInitializing) return;
    try {
      this.isInitializing = true;
      
      const isTs = path.extname(__filename) === '.ts';
      const workerPath = isTs
        ? path.join(__dirname, 'whisperWorker.ts')
        : path.join(__dirname, 'whisperWorker.js');
        
      this.workerProcess = fork(workerPath, [], {
        execArgv: isTs ? ['--import', 'tsx'] : []
      });

      this.workerProcess.on('message', (msg: any) => {
        if (msg.type === 'ready') {
          logger.info('Local Whisper worker initialized successfully.');
        } else if (msg.type === 'result' || msg.type === 'error') {
          const callback = this.workerCallbacks.get(msg.id);
          if (callback) {
            if (msg.type === 'error') callback.reject(new Error(msg.error));
            else callback.resolve(msg.result);
            this.workerCallbacks.delete(msg.id);
          }
        }
      });

      this.workerProcess.on('error', (err) => {
        logger.error('Whisper worker error', { error: err.message });
      });

      this.workerProcess.on('exit', (code) => {
        logger.warn('Whisper worker exited', { code });
        this.workerProcess = null;
        for (const [id, callback] of this.workerCallbacks.entries()) {
          callback.reject(new Error('Worker exited unexpectedly'));
        }
        this.workerCallbacks.clear();
      });

      this.workerProcess.send({ type: 'init' });
    } catch (error) {
      logger.error('Failed to initialize local Whisper worker', { error });
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

    // Remove noise tags like [BLANK_AUDIO], (music), *clears throat*
    let cleaned = text.replace(/\[.*?\]/gi, '').replace(/\(.*?\)/gi, '').replace(/\*.*?\*/gi, '');

    let trimmed = cleaned.trim();
    if (!trimmed) return '';

    const lowerTrimmed = trimmed.toLowerCase();
    const punctuationLess = lowerTrimmed.replace(/[^a-z0-9\s]/g, '').trim();

    // ── Exact-match hallucinations (whole transcript matches one of these) ─────
    const exactHallucinations = [
      'thank you', 'thanks for watching', 'thank you for watching',
      'thank you for watching this video', 'thanks', 'subscribe',
      'please subscribe', 'bye', 'bye bye', 'you', 'silence',
      'blankaudio', 'amaraorg', 'youre welcome', 'vanilla extract', 'cake',
      '1 egg', 'lets get started', 'let us get started', 'like and subscribe',
      'see you next time', 'see you in the next video', 'have a nice day',
      'have a good day', 'good luck', 'stay tuned', 'dont forget to like',
      'dont forget to subscribe', 'smash the like button', 'hit the bell icon',
      'click the bell icon', 'click subscribe', 'click like', 'peace out',
      'thats all for today', 'thats it for today', 'i hope you enjoyed',
      'i hope you liked', 'hope you enjoyed', 'hope you liked',
    ];
    if (exactHallucinations.includes(punctuationLess)) return '';

    // ── Substring hallucinations (transcript contains any of these phrases) ─────
    const substringHallucinations = [
      'subscribe to my channel',
      'subscribe to the channel',
      'please subscribe',
      'like this video',
      'like and subscribe',
      'if you like this video',
      'if you enjoyed this video',
      'thank you for watching',
      'thanks for watching',
      'thank you for your support',
      'see you in the next video',
      'see you next time',
      'dont forget to like',
      'dont forget to subscribe',
      'hit the bell',
      'press the bell',
      'click the bell',
      'bell notification',
      'turn on notifications',
      'subtitles by',
      'captions by',
      'amara.org',
      'translated by',
      'welcome to my channel',
      'welcome to the channel',
      'in this video i will show',
      'in this video ill show',
      'receive all new video',
      'smash the like',
      'drop a like',
      'leave a like',
      'new video every',
      'upload every',
      'share this video',
      'delicious and delicious',
      'fried egg',
      'variety of ingredients',
      'how to make it',
      'ill show you how to',
    ];
    for (const phrase of substringHallucinations) {
      if (punctuationLess.includes(phrase)) return '';
    }

    // ── Repetitive hallucinations (same phrase repeating) ─────────────────────
    if (lowerTrimmed.includes('vanilla extract') && lowerTrimmed.split('vanilla extract').length > 2) return '';

    // ── Drop if no real alphanumeric content ──────────────────────────────────
    if (!/[a-zA-Z0-9]/.test(trimmed)) return '';

    return trimmed;
  }

  /**
   * RMS-based Voice Activity Detection.
   * Reads 16-bit PCM samples from a WAV buffer and returns true only if
   * meaningful speech energy is detected above the given threshold.
   * This is the primary hallucination prevention — we never call Whisper on silence.
   */
  private checkAudioHasSpeech(wavBuffer: Buffer, rmsThreshold = 0.008): boolean {
    try {
      // WAV PCM data starts after the 44-byte header
      const dataStart = 44;
      if (wavBuffer.length <= dataStart) return false;

      const samples = (wavBuffer.length - dataStart) / 2; // 16-bit = 2 bytes per sample
      if (samples === 0) return false;

      let sumSquares = 0;
      for (let i = dataStart; i < wavBuffer.length - 1; i += 2) {
        // Read 16-bit signed PCM sample, normalize to [-1, 1]
        const sample = wavBuffer.readInt16LE(i) / 32768.0;
        sumSquares += sample * sample;
      }
      const rms = Math.sqrt(sumSquares / samples);

      logger.debug('VAD RMS check', { rms: rms.toFixed(6), threshold: rmsThreshold, hasSpeech: rms >= rmsThreshold });
      return rms >= rmsThreshold;
    } catch (err) {
      // If we can't read the WAV, allow through (fail-safe)
      logger.warn('VAD check failed, allowing through', { err });
      return true;
    }
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

      // ── VAD: Skip everything if audio is silent ────────────────────────────
      const hasSpeech = this.checkAudioHasSpeech(buffer);
      if (!hasSpeech) {
        if (fs.existsSync(tempWav)) fs.unlinkSync(tempWav);
        logger.info('VAD: Silent audio detected — skipping transcription entirely.');
        return { text: '[Silent]', duration: 0, language: options.language || 'en', model: 'VAD' };
      }

      // --- COLAB API (GPU Whisper) ---
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
          // Tell the Colab server to be strict: suppress hallucinations server-side too
          formData.append('no_speech_threshold', '0.6');
          formData.append('condition_on_previous_text', 'false');
          formData.append('compression_ratio_threshold', '2.2');

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
            text: cleanedText || '[Silent]',
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
      if (!this.workerProcess) await this.initLocalModel();
      if (!this.workerProcess) throw new Error("Local Whisper worker failed to initialize");

      logger.info('Calling local Xenova transcriber worker', { options });

      const messageId = `msg_${this.messageIdCounter++}`;
      
      const output = await new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(() => {
          this.workerCallbacks.delete(messageId);
          reject(new Error('Whisper worker transcription timed out'));
        }, 120000); // 2 minutes timeout for slow CPUs

        this.workerCallbacks.set(messageId, {
          resolve: (result: any) => {
            clearTimeout(timeout);
            resolve(result);
          },
          reject: (error: any) => {
            clearTimeout(timeout);
            reject(error);
          }
        });

        this.workerProcess?.send({
          type: 'transcribe',
          id: messageId,
          tempWav,
          options
        });
      });

      if (fs.existsSync(tempWav)) fs.unlinkSync(tempWav);

      logger.info('Local Xenova audio transcription completed', {
        filePath: audioFilePath,
        textLength: output.text?.length
      });

      return output;


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
        text: text.trim() || '[Silent]',
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