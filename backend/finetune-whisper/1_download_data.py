import os
import json
import logging
from typing import List, Dict, Optional
import yt_dlp
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api.formatters import JSONFormatter

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Directory setup
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'dataset', 'raw')
AUDIO_DIR = os.path.join(DATA_DIR, 'audio')
TRANSCRIPT_DIR = os.path.join(DATA_DIR, 'transcripts')

os.makedirs(AUDIO_DIR, exist_ok=True)
os.makedirs(TRANSCRIPT_DIR, exist_ok=True)

def extract_video_id(url: str) -> str:
    """Extract YouTube video ID from various URL formats."""
    # Handle youtu.be/ID
    if "youtu.be" in url:
        return url.split("/")[-1].split("?")[0]
    # Handle youtube.com/watch?v=ID
    if "v=" in url:
        return url.split("v=")[1].split("&")[0]
    return url

def download_youtube_audio(youtube_url: str, output_path: str) -> bool:
    """
    Download BEST audio from YouTube and convert it specifically
    to 16kHz WAV format (the format required by Whisper).
    """
    logger.info(f"Downloading audio from {youtube_url}...")
    
    ydl_opts = {
        'format': 'bestaudio/best',
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'wav',
        }],
        # Whisper strictly requires 16000 Hz sample rate
        'postprocessor_args': [
            '-ar', '16000',
            '-ac', '1', # mono
        ],
        'outtmpl': output_path, # Removed .%(ext)s to avoid .webm.wav
        'quiet': False,
        'no_warnings': True,
    }
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([youtube_url])
        return True
    except Exception as e:
        logger.error(f"Failed to download audio for {youtube_url}: {e}")
        return False

def download_youtube_transcript(video_id: str, output_path: str, languages: List[str] = ['en', 'nl', 'es', 'de', 'fr']) -> Optional[List[Dict]]:
    """
    Fetch the auto-generated or manual transcript for a video using its ID.
    Translates to English if native English is unavailable.
    """
    logger.info(f"Fetching transcript for video ID: {video_id}...")
    
    try:
        # Get the transcript list
        transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
        
        # Try to find a manual or generated transcript matching our languages
        transcript = transcript_list.find_transcript(languages)
        
        # Always translate to English for Whisper fine-tuning dataset consistency
        if transcript.language_code != 'en':
            logger.info(f"Translating {transcript.language_code} transcript to English...")
            transcript = transcript.translate('en')
            
        fetched_data = transcript.fetch()
        
        # Fix: Convert FetchedTranscript to JSON serializable list of dicts
        data = [
            {"text": t['text'], "start": t['start'], "duration": t['duration']}
            for t in fetched_data
        ]
        
        # Save raw JSON
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            
        return data
        
    except Exception as e:
        logger.error(f"Failed to fetch transcript for {video_id}: {e}")
        return None

def get_urls_from_input(url: str) -> List[str]:
    """Uses yt-dlp to extract all video URLs from a playlist or single video URL."""
    ydl_opts = {
        'extract_flat': 'in_playlist',
        'quiet': True,
        'no_warnings': True,
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            if 'entries' in info:
                # It's a playlist
                urls = [entry['url'] for entry in info['entries'] if entry.get('url')]
                logger.info(f"Found {len(urls)} videos in playlist.")
                return urls
            else:
                # It's a single video
                return [url]
    except Exception as e:
        logger.error(f"Failed to extract info from {url}: {e}")
        return []

def process_video(url: str):
    """Run the entire extraction pipeline for a single video."""
    video_id = extract_video_id(url)
    logger.info(f"Processing Video ID: {video_id}")
    
    audio_path = os.path.join(AUDIO_DIR, video_id)
    transcript_path = os.path.join(TRANSCRIPT_DIR, f"{video_id}.json")
    
    # 1. Download Transcript FIRST (to avoid downloading audio if no transcript exists)
    transcript_data = download_youtube_transcript(video_id, transcript_path)
    
    if not transcript_data:
        logger.warning(f"Skipping {video_id} - No usable transcript found.")
        return False
        
    # 2. Download Audio
    # yt-dlp automatically appends .wav to our output_path template
    wav_path = f"{audio_path}.wav"
    if not os.path.exists(wav_path):
        success = download_youtube_audio(url, audio_path)
        if not success:
            logger.error(f"Failed to process audio for {video_id}")
            return False
    else:
        logger.info(f"Audio for {video_id} already exists. Skipping download.")
        
    logger.info(f"Successfully processed video {video_id}!")
    return True

if __name__ == "__main__":
    print("-" * 50)
    print("YouTube to Whisper Dataset Downloader")
    print("-" * 50)
    print("Provide a comma-separated list of YouTube video OR playlist URLs to process.")
    
    urls_input = input("YouTube URLs: ")
    input_urls = [url.strip() for url in urls_input.split(",") if url.strip()]
    
    all_target_urls = []
    for input_url in input_urls:
         all_target_urls.extend(get_urls_from_input(input_url))
    
    if all_target_urls:
        print(f"\nProcessing {len(all_target_urls)} total videos...\n")
        successful = 0
        for url in all_target_urls:
            if process_video(url):
                successful += 1
                
        print(f"\nDone! Successfully processed {successful}/{len(all_target_urls)} videos.")
        print(f"Data saved to {DATA_DIR}")
    else:
        print("No Valid URLs provided.")
