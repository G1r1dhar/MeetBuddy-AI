import { logger } from '../utils/logger';
import {
  ValidationError,
  InternalServerError
} from '../middleware/errorHandler';
// The transformers library uses ES Modules.
// We must use dynamic imports for it since our backend is compiled to CommonJS.
let pipeline: any;
let env: any;

async function loadTransformers() {
  if (!pipeline || !env) {
    const transformers = await Function('return import("@xenova/transformers")')();
    pipeline = transformers.pipeline;
    env = transformers.env;
  }
}

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

export interface MindMapNode {
  id: string;
  label: string;
  children: MindMapNode[];
}

export class AIService {
  private isTestMode: boolean;
  private summarizer: any = null;
  private isInitializing = false;

  constructor() {
    this.isTestMode = process.env.NODE_ENV === 'test';
    logger.info('AI Service initialized for Local Summarization', {
      isTestMode: this.isTestMode,
      colabUrl: process.env.COLAB_WHISPER_URL ? 'PRESENT' : 'MISSING'
    });
    // Pre-warm local model in background (only used as fallback)
    this.initLocalModel().catch(() => {});
  }

  private async initLocalModel() {
    if (this.summarizer || this.isInitializing) return;
    try {
      this.isInitializing = true;
      await loadTransformers();
      env.allowLocalModels = true;
      this.summarizer = await pipeline('summarization', 'Xenova/distilbart-cnn-6-6');
      logger.info('Local Summarization model initialized successfully.');
    } catch (error) {
      logger.error('Failed to initialize local Summarization model', {
        error: error instanceof Error ? error.message : String(error)
      });
    } finally {
      this.isInitializing = false;
    }
  }

  // ─── Helpers for Map-Reduce Chunked Summarization ──────────────────────────

  /**
   * Split a transcript into overlapping chunks so that each chunk fits comfortably
   * within ngrok's payload limits and Llama's context window.
   */
  private chunkTranscript(text: string, chunkSize = 6000, overlap = 300): string[] {
    if (text.length <= chunkSize) return [text];
    const chunks: string[] = [];
    let start = 0;
    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      chunks.push(text.slice(start, end));
      if (end === text.length) break;
      // Try to break at a newline within the overlap zone so speaker turns stay intact
      const nextStart = end - overlap;
      const newlineIdx = text.indexOf('\n', nextStart);
      start = (newlineIdx !== -1 && newlineIdx < end) ? newlineIdx + 1 : nextStart;
    }
    return chunks;
  }

  /**
   * Summarize a single chunk into a short paragraph.
   * Retries up to `maxRetries` times on 429 (ngrok rate-limit) with exponential back-off.
   */
  private async summarizeChunkViaColab(
    baseUrl: string,
    chunk: string,
    chunkIndex: number,
    totalChunks: number,
    maxRetries = 3
  ): Promise<string | null> {
    const prompt = `You are a meeting assistant. Summarize the key points, decisions and action items from this portion (part ${chunkIndex + 1} of ${totalChunks}) of a meeting transcript. Be concise (3-5 sentences max). Do NOT output JSON.

TRANSCRIPT SEGMENT:
${chunk}

Concise summary:`;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await fetch(`${baseUrl}/summarize`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'ngrok-skip-browser-warning': 'true',
          },
          body: JSON.stringify({ prompt, model: 'llama3.2' }),
          signal: AbortSignal.timeout(90000),
        });

        if (response.status === 429) {
          const waitMs = Math.pow(2, attempt + 1) * 1500; // 3s, 6s, 12s
          logger.warn(`Colab returned 429 on chunk ${chunkIndex + 1}, retrying in ${waitMs}ms (attempt ${attempt + 1}/${maxRetries})`);
          await new Promise(r => setTimeout(r, waitMs));
          continue;
        }

        if (!response.ok) {
          logger.warn(`Colab chunk ${chunkIndex + 1} returned ${response.status}`);
          return null;
        }

        const data = await response.json() as { response?: string; text?: string };
        return (data.response || data.text || '').trim() || null;
      } catch (error) {
        logger.warn(`Colab chunk ${chunkIndex + 1} attempt ${attempt + 1} failed`, {
          error: error instanceof Error ? error.message : String(error),
        });
        if (attempt < maxRetries - 1) {
          await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
        }
      }
    }
    return null;
  }

  /**
   * Try to summarize via Colab Ollama (llama3.2) — much better quality than local model.
   * For long transcripts, uses map-reduce chunking to avoid ngrok 429 rate limits.
   */
  private async summarizeViaColab(request: SummaryRequest): Promise<SummaryResponse | null> {
    const colabUrl = process.env.COLAB_WHISPER_URL;
    if (!colabUrl) return null;

    const baseUrl = colabUrl.endsWith('/') ? colabUrl.slice(0, -1) : colabUrl;
    const { transcript, meetingTitle, meetingDuration, participants } = request;

    const durationStr = meetingDuration
      ? `${Math.round(meetingDuration / 60000)} minutes`
      : 'unknown duration';
    const participantStr = participants && participants.length > 0
      ? participants.join(', ')
      : 'unknown participants';

    // ── Map phase: chunk + summarize each piece separately ──────────────────
    const CHUNK_SIZE = 6000;
    const chunks = this.chunkTranscript(transcript, CHUNK_SIZE, 300);
    let condensedTranscript = transcript; // used as-is for short meetings

    if (chunks.length > 1) {
      logger.info(`Chunking transcript into ${chunks.length} chunks for map-reduce summarization`, {
        meetingTitle,
        totalChars: transcript.length,
        chunkCount: chunks.length,
      });

      const chunkSummaries: string[] = [];
      // Process chunks in parallel batches of 3 to speed up long meetings
      // while staying within ngrok/Ollama rate limits.
      const BATCH_SIZE = 3;
      for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
        const batch = chunks.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(
          batch.map((chunk, j) => this.summarizeChunkViaColab(baseUrl, chunk, i + j, chunks.length))
        );
        results.forEach((chunkSummary, j) => {
          const idx = i + j;
          if (chunkSummary) {
            logger.info(`Map phase: summarized chunk ${idx + 1}/${chunks.length}`);
            chunkSummaries.push(`[Part ${idx + 1}/${chunks.length}]: ${chunkSummary}`);
          } else {
            logger.warn(`Map phase: chunk ${idx + 1}/${chunks.length} failed, skipping`);
          }
        });
      }

      if (chunkSummaries.length === 0) {
        logger.warn('All chunk summarizations failed, falling back to local model');
        return null;
      }

      // Replace full transcript with the condensed chunk summaries for the reduce call
      condensedTranscript = chunkSummaries.join('\n\n');
      logger.info('Reduce phase: merging chunk summaries into final structured summary', {
        chunkSummaryChars: condensedTranscript.length,
      });
    }

    // ── Reduce phase: one structured JSON call using condensed text ──────────
    const reducePrompt = `You are an expert meeting assistant. Based on the following ${chunks.length > 1 ? 'combined segment summaries' : 'transcript'} from a meeting, produce a final structured summary.

Meeting Title: ${meetingTitle}
Duration: ${durationStr}
Participants: ${participantStr}

${chunks.length > 1 ? 'COMBINED SEGMENT SUMMARIES' : 'TRANSCRIPT'}:
${condensedTranscript}

Respond ONLY with a valid JSON object in exactly this format (no markdown, no extra text):
{
  "overallSummary": "2-3 sentence executive summary of what was discussed and decided",
  "keyPoints": ["key point 1", "key point 2", "key point 3"],
  "actionItems": ["action item 1", "action item 2"],
  "nextSteps": ["next step 1", "next step 2"],
  "topics": ["topic 1", "topic 2", "topic 3"]
}`;

    try {
      logger.info('Requesting final structured summary from Colab Ollama (llama3.2)...');

      const response = await fetch(`${baseUrl}/summarize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true',
        },
        body: JSON.stringify({ prompt: reducePrompt, model: 'llama3.2' }),
        signal: AbortSignal.timeout(120000),
      });

      if (!response.ok) {
        logger.warn(`Colab reduce call returned ${response.status}, will fall back`);
        return null;
      }

      const data = await response.json() as { response?: string; text?: string };
      const rawText = (data.response || data.text || '').trim();

      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        logger.warn('Colab reduce response had no JSON, falling back', { rawText: rawText.substring(0, 200) });
        return null;
      }

      const parsed = JSON.parse(jsonMatch[0]) as SummaryResponse;

      if (!parsed.overallSummary) {
        logger.warn('Parsed reduce summary missing overallSummary, falling back');
        return null;
      }

      logger.info('Colab Ollama summary generated successfully', {
        chunks: chunks.length,
        keyPointsCount: parsed.keyPoints?.length,
        actionItemsCount: parsed.actionItems?.length,
      });

      return {
        overallSummary: parsed.overallSummary || '',
        keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [],
        actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems : [],
        nextSteps: Array.isArray(parsed.nextSteps) ? parsed.nextSteps : [],
        topics: Array.isArray(parsed.topics) ? parsed.topics : [],
      };
    } catch (error) {
      logger.warn('Colab reduce summary request failed, falling back', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Rule-based fallback summary — no ML model required.
   * Uses TF-IDF-inspired keyword extraction and sentence scoring.
   * Always produces a usable summary, even without Colab or local models.
   */
  private generateRuleBasedSummary(request: SummaryRequest): SummaryResponse {
    const { transcript, meetingTitle } = request;

    // Split transcript into sentences
    const sentences = transcript
      .split(/(?<=[.!?])\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 20); // ignore very short fragments

    // Extract speaker turns
    const lines = transcript.split('\n').map(l => l.trim()).filter(Boolean);
    const speakers = new Set<string>();
    const speakerLines: Record<string, string[]> = {};

    for (const line of lines) {
      const match = line.match(/^([^:]+):\s*(.+)$/);
      if (match) {
        const speaker = match[1]!.trim();
        const text = match[2]!.trim();
        speakers.add(speaker);
        speakerLines[speaker] = [...(speakerLines[speaker] || []), text];
      }
    }

    // Keyword extraction: count word frequency, skip stop words
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
      'this', 'that', 'it', 'we', 'i', 'you', 'he', 'she', 'they', 'my',
      'our', 'your', 'their', 'will', 'would', 'can', 'could', 'should',
      'have', 'has', 'had', 'do', 'does', 'did', 'so', 'as', 'up', 'out',
      'what', 'which', 'who', 'how', 'when', 'where', 'if', 'then', 'than',
      'not', 'no', 'just', 'about', 'also', 'all', 'any', 'each', 'more',
      'after', 'before', 'like', 'get', 'make', 'go', 'see', 'know', 'there'
    ]);

    const wordFreq: Record<string, number> = {};
    const words = transcript.toLowerCase().match(/\b[a-z]{3,}\b/g) || [];
    for (const w of words) {
      if (!stopWords.has(w)) {
        wordFreq[w] = (wordFreq[w] || 0) + 1;
      }
    }

    // Score sentences by keyword density
    const scoredSentences = sentences.map(s => {
      const ws = s.toLowerCase().match(/\b[a-z]{3,}\b/g) || [];
      const score = ws.reduce((sum, w) => sum + (stopWords.has(w) ? 0 : (wordFreq[w] || 0)), 0)
        / Math.max(ws.length, 1);
      
      // Strip speaker prefix if present (e.g., "Alice: ")
      const cleanS = s.replace(/^[^:]+:\s*/, '').trim();
      return { s: cleanS, score };
    });

    scoredSentences.sort((a, b) => b.score - a.score);
    // Deduplicate exact sentences
    const topSentences: string[] = [];
    for (const item of scoredSentences) {
      if (item.s.length > 20 && !topSentences.includes(item.s)) topSentences.push(item.s);
      if (topSentences.length >= 3) break;
    }

    // Action item detection — lines containing action verbs or keywords
    const actionIndicators = ['will', 'should', 'need to', 'action', 'todo', 'to do', 'please', 'follow up', 'review', 'schedule', 'send', 'prepare', 'ensure', 'complete'];
    const actionItems: string[] = [];
    for (const line of lines) {
      const lower = line.toLowerCase();
      if (actionIndicators.some(kw => lower.includes(kw))) {
        const cleaned = line.replace(/^[^:]+:\s*/, '').trim();
        if (cleaned.length > 10 && !actionItems.includes(cleaned)) {
          actionItems.push(cleaned);
        }
      }
    }

    // Top keywords become topics (exclude speaker names)
    const speakerNamesLower = Array.from(speakers).map(s => s.toLowerCase());
    const sortedKeywords = Object.entries(wordFreq)
      .filter(([w]) => !speakerNamesLower.includes(w) && w !== 'unknown')
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([w]) => w.charAt(0).toUpperCase() + w.slice(1));

    // Build overall summary
    const speakerList = Array.from(speakers).filter(s => s !== 'Unknown').join(', ');
    const durationNote = request.meetingDuration
      ? ` over ${Math.round(request.meetingDuration / 60000)} minutes`
      : '';
    const participantNote = speakerList ? `Discussion involved ${speakerList}.` : '';

    const overallSummary = topSentences.length > 0
      ? `${meetingTitle} meeting${durationNote}. ${topSentences.slice(0, 2).join(' ')} ${participantNote}`.trim()
      : `${meetingTitle} meeting${durationNote} covered the following topics: ${sortedKeywords.slice(0, 4).join(', ')}. ${participantNote}`.trim();

    logger.info('Rule-based summary generated', {
      meetingTitle,
      sentenceCount: sentences.length,
      keywordCount: Object.keys(wordFreq).length,
      actionItemsFound: actionItems.length,
      topicsFound: sortedKeywords.length,
    });

    return {
      overallSummary,
      keyPoints: topSentences.slice(0, 3),
      actionItems: actionItems.slice(0, 5),
      nextSteps: actionItems.slice(0, 2),
      topics: sortedKeywords.slice(0, 5),
    };
  }

  /**
   * Generate meeting summary from transcript.
   * Tries Colab (llama3.2) first, then local distilbart, then rule-based fallback.
   */
  async generateMeetingSummary(request: SummaryRequest): Promise<SummaryResponse> {
    const { transcript, meetingTitle } = request;

    const validatedTranscript = (transcript && transcript.trim().length > 0) ? transcript : 'No content discussed.';
    const validatedTitle = (meetingTitle && meetingTitle.trim().length > 0) ? meetingTitle : 'Untitled Meeting';

    // Test mode shortcut
    if (this.isTestMode) {
      return {
        overallSummary: `Mock AI summary for ${validatedTitle}.`,
        keyPoints: ['Key point 1', 'Key point 2'],
        actionItems: ['Action item 1'],
        nextSteps: ['Next step 1'],
        topics: ['Topic 1'],
      };
    }

    // ── Try Colab first ─────────────────────────────────────────────────────
    try {
      const colabResult = await this.summarizeViaColab({
        ...request,
        transcript: validatedTranscript,
        meetingTitle: validatedTitle
      });
      if (colabResult) return colabResult;
    } catch (e) {
      logger.warn('Colab summary attempt threw unexpectedly, falling back', { e });
    }

    // ── Fallback 1: Local distilbart model ───────────────────────────────────
    logger.info('Falling back to local Xenova summarizer', { meetingTitle: validatedTitle });

    try {
      if (!this.summarizer) await this.initLocalModel();
      if (this.summarizer) {
        const chunkLength = 3000;
        let combinedSummary = '';
        const safeTranscript = validatedTranscript.length > 9000
          ? validatedTranscript.substring(validatedTranscript.length - 9000)
          : validatedTranscript;

        for (let i = 0; i < safeTranscript.length; i += chunkLength) {
          const chunk = safeTranscript.substring(i, i + chunkLength);
          const out = await this.summarizer(chunk, { max_new_tokens: 100, min_length: 20 });
          if (out && out.length > 0) combinedSummary += ' ' + out[0].summary_text;
        }

        const [actionItems, topics] = await Promise.all([
          this.generateActionItems(safeTranscript, validatedTitle),
          this.generateKeyTopics(safeTranscript, validatedTitle)
        ]);

        return {
          overallSummary: combinedSummary.trim() || 'Meeting concluded.',
          keyPoints: topics,
          actionItems,
          nextSteps: actionItems.slice(0, 2),
          topics,
        };
      }
    } catch (error) {
      logger.warn('Local distilbart summarizer failed, using rule-based fallback', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // ── Fallback 2: Rule-based summary (always works) ────────────────────────
    logger.info('Using rule-based fallback summarizer', { meetingTitle: validatedTitle });
    try {
      return this.generateRuleBasedSummary({
        ...request,
        transcript: validatedTranscript,
        meetingTitle: validatedTitle,
      });
    } catch (error) {
      logger.error('Even rule-based summary failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new InternalServerError('Failed to generate meeting summary');
    }
  }

  async generateActionItems(transcript: string, meetingTitle: string): Promise<string[]> {
    if (!transcript || transcript.trim().length === 0) throw new ValidationError('Transcript is required');
    try {
      if (!this.summarizer) await this.initLocalModel();
      if (!this.summarizer) throw new Error('Local summarizer failed to initialize');
      const chunk = transcript.substring(0, 3000);
      const out = await this.summarizer('Identify the key actions from this: ' + chunk, { max_new_tokens: 50, min_length: 10 });
      let items = ['Review meeting notes'];
      if (out && out.length > 0) items.push(out[0].summary_text);
      return items;
    } catch (error) {
      logger.error('Failed to generate action items', { error: error instanceof Error ? error.message : String(error) });
      throw new InternalServerError('Failed to generate action items');
    }
  }

  async generateKeyTopics(transcript: string, meetingTitle: string): Promise<string[]> {
    if (!transcript || transcript.trim().length === 0) throw new ValidationError('Transcript is required');
    try {
      if (!this.summarizer) await this.initLocalModel();
      if (!this.summarizer) throw new Error('Local summarizer failed to initialize');
      const chunk = transcript.substring(0, 3000);
      const out = await this.summarizer('Identify main topics from this: ' + chunk, { max_new_tokens: 50, min_length: 10 });
      let topics = [meetingTitle];
      if (out && out.length > 0) topics.push(out[0].summary_text);
      return topics;
    } catch (error) {
      logger.error('Failed to generate key topics', { error: error instanceof Error ? error.message : String(error) });
      throw new InternalServerError('Failed to generate key topics');
    }
  }

  /**
   * Generates a nested MindMapNode tree from the transcript using Llama 3.2 on Colab.
   * For long transcripts, first condenses via map-reduce chunking before the mind-map call.
   */
  async generateMindMap(request: SummaryRequest): Promise<MindMapNode> {
    const colabUrl = process.env.COLAB_WHISPER_URL;
    const { transcript, meetingTitle } = request;

    // We only attempt Colab for Mind Maps because local models struggle with deep JSON trees
    if (colabUrl && transcript && transcript.trim().length > 0) {
      const baseUrl = colabUrl.endsWith('/') ? colabUrl.slice(0, -1) : colabUrl;

      // ── Condense long transcripts the same way as summarization ─────────────
      const CHUNK_SIZE = 6000;
      const chunks = this.chunkTranscript(transcript, CHUNK_SIZE, 300);
      let inputText = transcript;

      if (chunks.length > 1) {
        logger.info(`Mind map: chunking transcript into ${chunks.length} segments for condensation`, {
          meetingTitle,
          totalChars: transcript.length,
        });
        const chunkSummaries: string[] = [];
        // Parallel batches of 3 for mind-map condensation — same strategy as summarization
        const MM_BATCH_SIZE = 3;
        for (let i = 0; i < chunks.length; i += MM_BATCH_SIZE) {
          const batch = chunks.slice(i, i + MM_BATCH_SIZE);
          const results = await Promise.all(
            batch.map((chunk, j) => this.summarizeChunkViaColab(baseUrl, chunk, i + j, chunks.length))
          );
          results.forEach((s, j) => {
            if (s) chunkSummaries.push(`[Part ${i + j + 1}/${chunks.length}]: ${s}`);
          });
        }
        if (chunkSummaries.length > 0) {
          inputText = chunkSummaries.join('\n\n');
          logger.info('Mind map: using condensed chunk summaries as input', {
            condensedChars: inputText.length,
          });
        }
      }

      const prompt = `You are an expert systems thinker and meeting analyst. Create a comprehensive mind map of the following meeting content.

Meeting Title: ${meetingTitle}

${chunks.length > 1 ? 'CONDENSED MEETING SUMMARY' : 'TRANSCRIPT'}:
${inputText}

INSTRUCTIONS:
1. Extract the central theme, major subtopics, and specific details.
2. Structure them into a strict hierarchical tree.
3. Respond ONLY with a valid JSON object matching the exact structure below. Do not include any markdown formatting, code blocks, or explanations.
4. Provide 3-5 major branches (children of the root), and 2-4 leaf details per branch.

REQUIRED JSON FORMAT:
{
  "id": "root",
  "label": "Central Meeting Theme",
  "children": [
    {
      "id": "node-1",
      "label": "Major Topic 1",
      "children": [
        {
          "id": "node-1-1",
          "label": "Specific detail or decision",
          "children": []
        }
      ]
    }
  ]
}`;

      try {
        logger.info('Requesting Mind Map from Colab Ollama (llama3.2)...');
        const response = await fetch(`${baseUrl}/summarize`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'ngrok-skip-browser-warning': 'true',
          },
          body: JSON.stringify({ prompt, model: 'llama3.2' }),
          signal: AbortSignal.timeout(120000),
        });

        if (response.ok) {
          const data = await response.json() as { response?: string; text?: string };
          const rawText = (data.response || data.text || '').trim();
          const jsonMatch = rawText.match(/\{[\s\S]*}/);

          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]) as MindMapNode;
            if (parsed.id && parsed.label && Array.isArray(parsed.children)) {
              logger.info('AI Mind Map generated successfully', { chunks: chunks.length });
              return parsed;
            }
          }
        }
      } catch (error) {
        logger.warn('Colab Mind Map request failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    logger.info('Falling back to basic Mind Map generation');
    // If Colab fails or is missing, fall back to extracting topics via existing logic
    const fallbackSummary = await this.generateMeetingSummary(request);
    
    const rootNode: MindMapNode = {
      id: 'root',
      label: meetingTitle || 'Meeting',
      children: fallbackSummary.keyPoints.map((kp, i) => ({
        id: `kp-${i}`,
        label: kp,
        children: []
      }))
    };
    
    // Add action items as a branch
    if (fallbackSummary.actionItems.length > 0) {
      rootNode.children.push({
        id: 'actions',
        label: 'Action Items',
        children: fallbackSummary.actionItems.map((ai, i) => ({
          id: `ai-${i}`,
          label: ai,
          children: []
        }))
      });
    }

    return rootNode;
  }
}

// Export singleton instance
export const aiService = new AIService();