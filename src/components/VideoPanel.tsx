import { useState, useRef, useEffect } from "react"
import { ExternalLink, Mic, Video, VideoOff, Circle, Square, UploadCloud } from "lucide-react"
import type { Meeting } from "../contexts/MeetingContext"
import { useMeeting } from "../contexts/MeetingContext"
import { apiClient } from "../services/apiClient"

interface VideoPanelProps {
  meeting: Meeting
}

export default function VideoPanel({ meeting }: VideoPanelProps) {
  const [joined, setJoined] = useState(false)
  const [isRecordingVideo, setIsRecordingVideo] = useState(false)
  const [isUploading, setIsUploading] = useState(false)

  const { getMeetingById } = useMeeting()
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const startVideoRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true
      });

      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        await uploadRecording(blob);
        // Clean up tracks
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecordingVideo(true);
    } catch (err) {
      console.error("Failed to start recording:", err);
      alert("Microphone/Screen sharing permission is required to record.");
    }
  };

  const stopVideoRecording = () => {
    if (mediaRecorderRef.current && isRecordingVideo) {
      mediaRecorderRef.current.stop();
      setIsRecordingVideo(false);
    }
  };

  // Automatically stop recording when the meeting ends
  useEffect(() => {
    if (meeting.status === "COMPLETED" && isRecordingVideo) {
      stopVideoRecording();
    }
  }, [meeting.status, isRecordingVideo]);

  const [localRecordingUrl, setLocalRecordingUrl] = useState<string | null>(meeting.recordingUrl || null)

  const uploadRecording = async (blob: Blob) => {
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('video', blob, `recording-${meeting.id}.webm`);

      await apiClient.post(`/meetings/${meeting.id}/recording`, formData);
      // Refresh context map
      const freshMeeting = await getMeetingById(meeting.id);

      // Force UI to show video immediately by using local state
      if (freshMeeting && freshMeeting.recordingUrl) {
        setLocalRecordingUrl(freshMeeting.recordingUrl);
      }
      alert('Recording saved successfully!');
    } catch (err) {
      console.error('Failed to upload recording:', err);
      alert('Failed to upload recording.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-transparent p-8 gap-6 z-20">

      {/* Meeting card */}
      <div className="w-full max-w-lg bg-theme-bg backdrop-blur-xl border border-theme-card-border rounded-3xl p-8 space-y-6 shadow-2xl relative overflow-hidden group dark:shadow-theme-accent/5 transition-colors duration-300">
        <div className="absolute inset-0 bg-theme-accent/5 pointer-events-none" />

        <div className="flex items-center gap-4 relative z-10">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-theme-accent/80 to-yellow-600 flex items-center justify-center flex-shrink-0 shadow-[0_0_15px_var(--accent-yellow-translucent)] transform group-hover:scale-105 transition-transform duration-300 border border-theme-accent/20">
            <Video className="w-6 h-6 text-black" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-theme-text">{meeting.title}</h2>
            <p className="text-sm text-theme-text/80 font-medium mt-0.5">{meeting.platform}</p>
          </div>
          {meeting.status === "RECORDING" && (
            <span className="ml-auto flex items-center gap-2 bg-red-500/10 text-red-500 text-xs font-bold px-3 py-1.5 rounded-full border border-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.15)]">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
              </span>
              LIVE
            </span>
          )}
        </div>

        {meeting.description && (
          <p className="text-sm text-theme-text/70 border-t border-theme-card-border pt-5 relative z-10 leading-relaxed font-medium">{meeting.description}</p>
        )}

        {/* Video Recording Controls */}
        <div className="bg-theme-card border border-theme-card-border rounded-2xl p-5 flex flex-col gap-4 relative z-10 backdrop-blur-sm shadow-inner transition-colors duration-300">
          <p className="text-sm text-theme-text font-semibold border-b border-theme-card-border pb-3 flex items-center gap-2">
            Local Video Recording
          </p>

          {localRecordingUrl ? (
            <div className="space-y-3">
              <span className="text-xs text-green-500 font-bold flex items-center gap-1.5 bg-green-500/10 w-fit px-2.5 py-1 rounded-md border border-green-500/20">
                ✅ Recording Saved
              </span>
              <video
                src={`${apiClient['baseURL'].replace('/api', '')}${localRecordingUrl}`}
                controls
                className="w-full rounded-xl bg-black shadow-lg border border-theme-card-border"
              />
            </div>
          ) : (
            <div className="flex items-center gap-3">
              {isRecordingVideo ? (
                <button onClick={stopVideoRecording} className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-red-500 hover:bg-red-600 text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-red-500/25 transform hover:-translate-y-0.5 border border-red-500/30">
                  <Square className="w-4 h-4 fill-white" /> Stop Recording
                </button>
              ) : (
                <button onClick={startVideoRecording} disabled={isUploading} className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-theme-accent text-black text-sm font-bold rounded-xl transition-all disabled:opacity-50 disabled:transform-none hover:brightness-110 shadow-[0_4px_14px_0_rgba(255,193,7,0.39)] hover:shadow-[0_6px_20px_rgba(255,193,7,0.23)] transform hover:-translate-y-0.5">
                  {isUploading ? <UploadCloud className="w-4 h-4 animate-bounce" /> : <Circle className="w-4 h-4 fill-black" />}
                  {isUploading ? "Uploading..." : "Record Screen & Audio"}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Join external meeting */}
        {meeting.meetingUrl && (
          <a
            href={meeting.meetingUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setJoined(true)}
            className="flex items-center justify-center gap-2 w-full py-3.5 bg-theme-bg hover:brightness-95 dark:hover:brightness-110 border border-theme-card-border text-theme-text font-bold rounded-xl transition-all duration-300 relative z-10 shadow-sm group"
          >
            <ExternalLink className="w-4 h-4 text-theme-icon group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            Open Meeting in Browser
          </a>
        )}

        {/* Instructions */}
        <div className="bg-theme-card border border-theme-card-border rounded-2xl p-5 text-sm space-y-3 relative z-10 backdrop-blur-md shadow-inner transition-colors duration-300">
          <p className="font-bold text-theme-accent text-xs uppercase tracking-wider flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-theme-accent"></span> How to use
          </p>
          <ol className="space-y-2.5 text-xs text-theme-text/80 list-decimal list-inside font-medium marker:text-theme-accent">
            {meeting.meetingUrl && <li>Open your meeting using the button above</li>}
            <li>To record, click <span className="font-bold text-theme-accent">Record Screen & Audio</span> and select the meeting tab.</li>
            <li>Switch to the <span className="font-bold text-theme-accent">🎙️ Live</span> tab on the right</li>
            <li>Click <span className="font-bold text-theme-accent">Start Listening</span> to generate AI transcripts</li>
          </ol>
        </div>

        {/* Status row */}
        <div className="flex items-center gap-5 pt-3 border-t border-theme-card-border text-xs text-theme-text/60 font-medium relative z-10">
          <span className="flex items-center gap-1.5">
            <Mic className="w-3.5 h-3.5" />
            Mic: use Live tab →
          </span>
          <span className="flex items-center gap-1.5">
            <VideoOff className="w-3.5 h-3.5" />
            Video: external platform
          </span>
          {joined && (
            <span className="ml-auto flex items-center gap-1.5 text-green-500 bg-green-500/10 px-2 py-0.5 rounded-md border border-green-500/20">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
              Joined
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
