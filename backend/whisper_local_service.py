#!/usr/bin/env python3
"""
Local WhisperX and Hugging Face Transformers Service
"""

import os
import sys
import json
import argparse
import logging
from typing import Dict, List, Optional, Any

import whisperx
import torch
from transformers import pipeline
import gc

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class LocalWhisperService:
    def __init__(self, model_size: str = "medium", device: str = "cpu"):
        self.model_size = model_size
        self.device = device
        self.model = None
        
    def load_model(self):
        try:
            # Use appropriate compute type for device
            compute_type = "float32" if self.device == "cpu" else "float16"
            self.model = whisperx.load_model(
                self.model_size, 
                self.device, 
                compute_type=compute_type
            )
            logger.info(f"WhisperX model '{self.model_size}' loaded")
            return True
        except Exception as e:
            logger.error(f"Failed to load model: {e}")
            return False
    
    def transcribe_audio(self, audio_path: str) -> Dict[str, Any]:
        try:
            if not self.model:
                if not self.load_model():
                    raise Exception("Failed to load model")
            
            audio = whisperx.load_audio(audio_path)
            result = self.model.transcribe(audio, batch_size=16)
            
            return {
                "success": True,
                "data": {
                    "text": result.get("text", ""),
                    "language": result.get("language", "en"),
                    "segments": result.get("segments", [])
                }
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

class LocalSummarizationService:
    def __init__(self, model_name: str = "facebook/bart-large-cnn"):
        self.model_name = model_name
        self.pipeline = None
        
    def load_model(self):
        try:
            self.pipeline = pipeline("summarization", model=self.model_name)
            logger.info(f"Summarization model loaded")
            return True
        except Exception as e:
            logger.error(f"Failed to load model: {e}")
            return False
    
    def summarize_text(self, text: str) -> Dict[str, Any]:
        try:
            if not self.pipeline:
                if not self.load_model():
                    raise Exception("Failed to load model")
            
            result = self.pipeline(text, max_length=150, min_length=30, do_sample=False)
            
            return {
                "success": True,
                "data": {"summary": result[0]["summary_text"]}
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["transcribe", "summarize", "status"])
    parser.add_argument("--audio", help="Audio file path")
    parser.add_argument("--text", help="Text to summarize")
    
    args = parser.parse_args()
    
    if args.command == "status":
        print(json.dumps({"whisper_available": True, "summarization_available": True}))
    elif args.command == "transcribe" and args.audio:
        service = LocalWhisperService()
        result = service.transcribe_audio(args.audio)
        print(json.dumps(result, default=str))
    elif args.command == "summarize" and args.text:
        service = LocalSummarizationService()
        result = service.summarize_text(args.text)
        print(json.dumps(result, default=str))

if __name__ == "__main__":
    main()