#!/bin/bash

echo "🎤 Installing OpenAI Whisper for MeetBuddy AI..."

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is required but not installed."
    echo "Please install Python 3 and try again."
    exit 1
fi

# Check if pip is installed
if ! command -v pip3 &> /dev/null; then
    echo "❌ pip3 is required but not installed."
    echo "Please install pip3 and try again."
    exit 1
fi

echo "✅ Python 3 and pip3 found"

# Install Whisper
echo "📦 Installing OpenAI Whisper..."
pip3 install openai-whisper

# Verify installation
if command -v whisper &> /dev/null; then
    echo "✅ Whisper installed successfully!"
    echo "🔍 Whisper version: $(whisper --version)"
    
    # Download base model (recommended for balance of speed and accuracy)
    echo "📥 Downloading base model..."
    whisper --model base --help > /dev/null 2>&1
    
    echo "🎉 Whisper setup complete!"
    echo ""
    echo "Available models:"
    echo "  - tiny: Fastest, least accurate"
    echo "  - base: Good balance (recommended)"
    echo "  - small: Better accuracy, slower"
    echo "  - medium: Even better accuracy"
    echo "  - large: Best accuracy, slowest"
    echo ""
    echo "You can now use real-time transcription in MeetBuddy AI!"
    
else
    echo "❌ Whisper installation failed."
    echo "Please check the error messages above and try again."
    exit 1
fi