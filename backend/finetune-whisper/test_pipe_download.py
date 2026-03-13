import os
import json
import logging
from typing import List, Dict, Optional
import yt_dlp
from youtube_transcript_api import YouTubeTranscriptApi

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

DATA_DIR = os.path.join(os.getcwd(), 'dataset', 'raw')
AUDIO_DIR = os.path.join(DATA_DIR, 'audio')
TRANSCRIPT_DIR = os.path.join(DATA_DIR, 'transcripts')
os.makedirs(AUDIO_DIR, exist_ok=True)
os.makedirs(TRANSCRIPT_DIR, exist_ok=True)

def extract_video_id(url: str) -> str:
    if "youtu.be" in url: return url.split("/")[-1].split("?")[0]
    if "v=" in url: return url.split("v=")[1].split("&")[0]
    return url

def get_urls_from_input(url: str) -> List[str]:
    ydl_opts = {'extract_flat': 'in_playlist', 'quiet': True, 'no_warnings': True}
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            if 'entries' in info: 
                logger.info(f"Playlist detected! Found {len(info['entries'])} videos.")
                return [entry['url'] for entry in info['entries'] if entry.get('url')]
            return [url]
    except Exception as e:
        logger.error(f"Failed to extract info from {url}. Ensure it is a valid link (e.g. ?list=ID). Error: {e}")
        return []

def download_youtube_audio(youtube_url: str, output_path: str) -> bool:
    logger.info(f"Downloading audio from {youtube_url}...")
    ydl_opts = {
        'format': 'bestaudio/best',
        'postprocessors': [{'key': 'FFmpegExtractAudio', 'preferredcodec': 'wav'}],
        'postprocessor_args': ['-ar', '16000', '-ac', '1'], # 16kHz mono required for Whisper
        'outtmpl': output_path, # Fixed output template (.wav gets added by yt-dlp automatically)
        'quiet': False,
        'no_warnings': True,
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl: ydl.download([youtube_url])
        return True
    except Exception as e:
        logger.error(f"Failed to download audio for {youtube_url}: {e}")
        return False

def download_youtube_transcript(video_id: str, output_path: str, languages: List[str] = ['en', 'nl', 'es', 'de', 'fr', 'ja', 'it', 'ko', 'zh-Hans', 'ru']) -> Optional[List[Dict]]:
    logger.info(f"Fetching transcript for video ID: {video_id}...")
    try:
        # Fixed: Usage of instance method based on modern youtube_transcript_api versions!!!
        transcript_list = YouTubeTranscriptApi().list(video_id)
        
        # Try to find transcript in our widespread supported language list
        transcript = transcript_list.find_transcript(languages)
        
        # Always normalize and translate to English to guarantee Whisper learns English text mapping
        if transcript.language_code != 'en':
            logger.info(f"Translating video {video_id} ({transcript.language_code}) native transcript to English...")
            transcript = transcript.translate('en')
            
        fetched_data = transcript.fetch()
        
        # Fixed: Safely enforce JSON Serialization from FetchedTranscriptSnippet using attribute dot-notation
        data = [
            {"text": t.text, "start": t.start, "duration": t.duration} 
            for t in fetched_data
        ]
        
        with open(output_path, 'w', encoding='utf-8') as f: 
            json.dump(data, f, ensure_ascii=False, indent=2)
        return data
        
    except Exception as e:
        logger.error(f"Failed to fetch transcript for {video_id}: {e}")
        return None

def process_video(url: str):
    video_id = extract_video_id(url)
    logger.info(f"\n{'='*40}\nProcessing Video ID: {video_id}\n{'='*40}")
    
    transcript_data = download_youtube_transcript(video_id, os.path.join(TRANSCRIPT_DIR, f"{video_id}.json"))
    if not transcript_data: 
        logger.warning(f"Skipping {video_id} due to missing transcripts.")
        return False
        
    audio_path = os.path.join(AUDIO_DIR, video_id)
    if not os.path.exists(f"{audio_path}.wav"):
        if not download_youtube_audio(url, audio_path): return False
    return True

if __name__ == "__main__":
    import sys
    input_urls = [u.strip() for u in sys.argv[1].split(",") if u.strip()]
    target_urls = []
    for u in input_urls: target_urls.extend(get_urls_from_input(u))
    logger.info(f"Total discovered videos to process: {len(target_urls)}")
    for url in target_urls: process_video(url)
    logger.info("\n\n✅ Phase 1: Downloading & Extraction Completed! ✓")