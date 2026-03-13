import fs from 'fs';
import { WaveFile } from 'wavefile';

let pipeline: any = null;
let env: any = null;
let transcriber: any = null;

async function init() {
  if (!pipeline || !env) {
    const transformers = await Function('return import("@xenova/transformers")')();
    pipeline = transformers.pipeline;
    env = transformers.env;
    env.allowLocalModels = true;
    transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-base.en');
  }
}

function cleanTranscriptText(text: string): string {
    if (!text) return '';
    let cleaned = text.replace(/\[.*?\]/gi, '').replace(/\(.*?\)/gi, '').replace(/\*.*?\*/gi, '');
    let trimmed = cleaned.trim();
    const lowerTrimmed = trimmed.toLowerCase();
    
    const exactHallucinations = [
      'thank you', 'thanks for watching', 'thank you for watching', 'thanks',
      'subscribe', 'please subscribe', 'bye', 'bye bye', 'you', 'silence',
      'blankaudio', 'amaraorg', 'youre welcome', 'vanilla extract', 'cake',
      '1 egg', 'lets get started', 'let us get started', 'thank you.', 'thanks.'
    ];
    
    const punctuationLess = lowerTrimmed.replace(/[^a-z0-9\s]/g, '').trim();
    if (exactHallucinations.includes(punctuationLess)) return '';
    
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
    
    if (lowerTrimmed.includes('vanilla extract') && lowerTrimmed.split('vanilla extract').length > 2) return '';
    if (!/[a-zA-Z0-9]/.test(trimmed)) return '';
    
    return trimmed;
}

process.on('message', async (msg: any) => {
  if (msg.type === 'init') {
    try {
      await init();
      process.send?.({ type: 'ready' });
    } catch (error: any) {
      process.send?.({ type: 'error', error: error.message || String(error) });
    }
  } else if (msg.type === 'transcribe') {
    try {
      const { tempWav, options, id } = msg;

      if (!transcriber) await init();

      const buffer = fs.readFileSync(tempWav);
      const wav = new WaveFile(buffer);
      wav.toBitDepth('32f');
      wav.toSampleRate(16000);

      let audioData: any = wav.getSamples(false, Float32Array);
      if (Array.isArray(audioData)) {
        if (audioData.length > 0) audioData = audioData[0];
        else audioData = new Float32Array(0);
      }

      let sumSquares = 0;
      for (let i = 0; i < audioData.length; i++) {
        sumSquares += audioData[i] * audioData[i];
      }
      const rms = Math.sqrt(sumSquares / audioData.length);

      if (rms < 0.005) {
        process.send?.({ type: 'result', id, result: { text: '[Silence]', duration: 0, language: 'en', model: 'Local' }});
        return;
      }

      const transcriberOptions = {
        language: options.language || 'en',
        temperature: options.temperature !== undefined ? options.temperature : [0.0, 0.2, 0.4, 0.6, 0.8, 1.0],
        condition_on_previous_text: false,
      };

      const output = await transcriber(audioData, transcriberOptions);
      const cleanedText = cleanTranscriptText(output.text || '');

      process.send?.({
        type: 'result',
        id,
        result: {
          text: cleanedText || '[Silence]',
          duration: 0,
          language: 'en',
          model: 'Local'
        }
      });
    } catch (error: any) {
      process.send?.({ type: 'error', id: msg.id, error: error.message || String(error) });
    }
  }
});
