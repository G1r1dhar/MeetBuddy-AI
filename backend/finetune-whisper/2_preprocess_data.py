import os
import json
import logging
from pydub import AudioSegment
from datasets import Dataset, DatasetDict
from transformers import WhisperFeatureExtractor, WhisperTokenizer
import warnings
import torch

# Suppress PyDub warnings
warnings.filterwarnings("ignore")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Directory setup
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, 'dataset', 'raw')
AUDIO_DIR = os.path.join(DATA_DIR, 'audio')
TRANSCRIPT_DIR = os.path.join(DATA_DIR, 'transcripts')
PROCESSED_DATA_DIR = os.path.join(BASE_DIR, 'dataset', 'processed')

os.makedirs(PROCESSED_DATA_DIR, exist_ok=True)

# Whisper Model Configuration
MODEL_ID = "openai/whisper-small"
LANGUAGE = "english"
TASK = "transcribe"

def load_data_from_raw():
    """Reads raw JSON transcripts and maps them to their respective audio files."""
    audio_paths = []
    transcripts = []
    
    for filename in os.listdir(TRANSCRIPT_DIR):
        if not filename.endswith('.json'):
            continue
            
        video_id = filename.replace('.json', '')
        audio_file = os.path.join(AUDIO_DIR, f"{video_id}.wav")
        transcript_file = os.path.join(TRANSCRIPT_DIR, filename)
        
        if not os.path.exists(audio_file):
            logger.warning(f"Audio file missing for {video_id}. Skipping.")
            continue
            
        with open(transcript_file, 'r', encoding='utf-8') as f:
            transcript_data = json.load(f)
            
        audio_paths.append(audio_file)
        transcripts.append(transcript_data)
        
    return audio_paths, transcripts

def chunk_audio_and_transcripts(audio_paths, transcripts, max_duration_sec=30):
    """
    Slices the long .wav file into smaller chunks based on transcript timestamps.
    Whisper handles up to 30 second chunks natively.
    """
    logger.info("Slicing audio files and generating Hugging Face dataset rows...")
    dataset_rows = []
    
    for audio_path, transcript_data in zip(audio_paths, transcripts):
        video_id = os.path.basename(audio_path).replace('.wav', '')
        logger.info(f"Processing chunking for {video_id}")
        
        try:
            # Load the full audio file into memory
            audio = AudioSegment.from_wav(audio_path)
            
            # Directory to save the sliced chunks
            chunk_dir = os.path.join(PROCESSED_DATA_DIR, 'chunks', video_id)
            os.makedirs(chunk_dir, exist_ok=True)
            
            for i, segment in enumerate(transcript_data):
                # YouTube timestamps are in seconds
                start_ms = int(segment['start'] * 1000)
                duration_ms = int(segment['duration'] * 1000)
                end_ms = start_ms + duration_ms
                text = segment['text'].strip()
                
                # Skip empty or very short segments
                if not text or duration_ms < 500:
                    continue
                    
                # We enforce max 30s per chunk for Whisper
                if duration_ms > max_duration_sec * 1000:
                    continue 

                # Extract audio chunk
                chunk = audio[start_ms:end_ms]
                
                # Save chunk to disk temporarily
                chunk_filename = f"{video_id}_chunk_{i}.wav"
                chunk_filepath = os.path.join(chunk_dir, chunk_filename)
                
                # Whisper strictly requires 16000 Hz sample rate and 1 channel
                chunk = chunk.set_frame_rate(16000).set_channels(1)
                chunk.export(chunk_filepath, format="wav")
                
                dataset_rows.append({
                    "audio_path": chunk_filepath,
                    "text": text,
                })
        except Exception as e:
            logger.error(f"Error chunking {video_id}: {e}")
            
    return dataset_rows

def load_audio(batch):
    """Loads array data from the physical path required by datasets map"""
    import librosa
    audio_path = batch["audio_path"]
    # Load with explicitly enforced 16kHz
    speech_array, sampling_rate = librosa.load(audio_path, sr=16000)
    batch["audio"] = {"array": speech_array, "sampling_rate": sampling_rate}
    return batch

def prepare_dataset(batch, feature_extractor, tokenizer):
    """
    Tokenizes text and extracts log-mel spectrograms.
    """
    # 1. Audio processing: Compute log-mel spectrograms from audio array
    audio = batch["audio"]
    batch["input_features"] = feature_extractor(
        audio["array"], sampling_rate=audio["sampling_rate"]
    ).input_features[0]

    # 2. Text processing: Encode the target text to label IDs
    batch["labels"] = tokenizer(batch["text"]).input_ids
    
    return batch

def main():
    logger.info("Initializing Preprocessing Pipeline...")
    
    # Load Whisper Processors
    feature_extractor = WhisperFeatureExtractor.from_pretrained(MODEL_ID)
    tokenizer = WhisperTokenizer.from_pretrained(MODEL_ID, language=LANGUAGE, task=TASK)
    
    # 1. Chunking
    audio_paths, transcripts = load_data_from_raw()
    
    if not audio_paths:
        logger.error("No raw data found in dataset/raw/. Run 1_download_data.py first.")
        return
        
    dataset_rows = chunk_audio_and_transcripts(audio_paths, transcripts)
    logger.info(f"Generated {len(dataset_rows)} audio-text pairs.")
    
    # 2. Convert to Hugging Face Dataset
    raw_dataset = Dataset.from_list(dataset_rows)
    
    # 3. Load Audio Arrays into memory
    logger.info("Loading audio arrays from disk... This might take a while.")
    audio_dataset = raw_dataset.map(load_audio, num_proc=4)
    
    # 4. Extract Features and Tokenize
    logger.info("Extracting Log-Mel Spectrograms and Tokenizing Text...")
    processed_dataset = audio_dataset.map(
        lambda batch: prepare_dataset(batch, feature_extractor, tokenizer),
        remove_columns=audio_dataset.column_names, # We only need input_features and labels for training
        num_proc=4
    )
    
    # 5. Split Dataset into Train/Test (90/10 split)
    split_dataset = processed_dataset.train_test_split(test_size=0.1)
    
    # Save the ready-to-train dataset
    output_path = os.path.join(PROCESSED_DATA_DIR, "whisper_dataset")
    split_dataset.save_to_disk(output_path)
    
    logger.info(f"Preprocessing Complete! Saved fully tokenized dataset to {output_path}")

if __name__ == "__main__":
    main()
