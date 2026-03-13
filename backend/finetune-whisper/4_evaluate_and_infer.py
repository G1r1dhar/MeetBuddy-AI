import os
import argparse
import torch
import librosa
from transformers import WhisperForConditionalGeneration, WhisperProcessor

# Suppress warnings
import warnings
warnings.filterwarnings("ignore")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.path.join(BASE_DIR, 'meetbuddy-whisper-small-finetuned')
DEFAULT_MODEL = "openai/whisper-small"

def load_model(use_finetuned=True):
    """Loads the fine-tuned model if available, else falls back to base model."""
    
    model_path = MODEL_DIR if use_finetuned and os.path.exists(MODEL_DIR) else DEFAULT_MODEL
    
    print(f"Loading Whisper model from: {model_path}...")
    
    # Load processor and model
    processor = WhisperProcessor.from_pretrained(model_path)
    model = WhisperForConditionalGeneration.from_pretrained(model_path)
    
    # Move to GPU if available
    device = "cuda:0" if torch.cuda.is_available() else "cpu"
    print(f"Moving model to {device}...")
    model = model.to(device)
    
    return processor, model, device

def transcribe_audio(audio_path, processor, model, device):
    """Transcribe a single audio file."""
    if not os.path.exists(audio_path):
        print(f"Error: File {audio_path} does not exist.")
        return None
        
    print(f"\nProcessing {os.path.basename(audio_path)}...")
    
    # Whisper requires exactly 16000Hz sampling rate
    # librosa.load will automatically resample if necessary
    try:
        y, _ = librosa.load(audio_path, sr=16000)
    except Exception as e:
        print(f"Failed to load audio: {e}")
        return None

    # Process features
    input_features = processor(
        y, 
        sampling_rate=16000, 
        return_tensors="pt"
    ).input_features.to(device)

    # Generate token IDs
    with torch.no_grad():
        predicted_ids = model.generate(
            input_features, 
            forced_decoder_ids=processor.get_decoder_prompt_ids(language="english", task="transcribe")
        )

    # Decode transcription
    transcription = processor.batch_decode(predicted_ids, skip_special_tokens=True)[0]
    
    return transcription

def main():
    parser = argparse.ArgumentParser(description="Whisper Fine-Tuned Local Inference")
    parser.add_argument("audio_file", type=str, help="Path to the .wav file to transcribe")
    parser.add_argument("--base", action="store_true", help="Use base model instead of fine-tuned model (for comparison)")
    
    args = parser.parse_args()
    
    processor, model, device = load_model(use_finetuned=not args.base)
    
    transcription = transcribe_audio(args.audio_file, processor, model, device)
    
    if transcription:
        print("\n" + "="*50)
        print("TRANSCRIPTION RESULT:")
        print("="*50)
        print(f"\n{transcription.strip()}\n")
        print("="*50)

if __name__ == "__main__":
    main()
