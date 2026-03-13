import { useState, useEffect, useRef } from 'react';
import { useMeeting } from '../contexts/MeetingContext';
import { whisperService } from '../services/whisperService';

interface LiveTranscriptPanelProps {
    meetingId?: string;
}

export default function LiveTranscriptPanel({ meetingId }: LiveTranscriptPanelProps) {
    const { meetings } = useMeeting();
    const meeting = meetings.find(m => m.id === meetingId);

    // Fallback to empty array if meeting or transcript is undefined
    const entries = meeting?.transcript || [];

    const [isListening, setIsListening] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [search, setSearch] = useState('');
    const [lang, setLang] = useState('en-US');

    const bottomRef = useRef<HTMLDivElement>(null);

    // Auto-scroll
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [entries.length]); // Only scroll when new entries are added

    const startListening = async () => {
        if (!meetingId) {
            setErrorMsg('No active meeting IDs found. Cannot start transcription.');
            return;
        }

        try {
            setErrorMsg('');
            // Check if backend Whisper is available
            const isAvailable = await whisperService.checkWhisperAvailability();
            if (!isAvailable) {
                console.warn("Backend Whisper availability check returned false, attempting anyway...");
            }

            // Start the actual Whisper transcription streaming (uses MediaRecorder internally)
            await whisperService.startTranscription(meetingId);
            setIsListening(true);
        } catch (err: any) {
            setErrorMsg(err.message || 'Failed to start microphone capture. Please ensure you have granted microphone permissions.');
            setIsListening(false);
        }
    };

    const stopListening = async () => {
        try {
            await whisperService.stopTranscription();
        } catch (err) {
            console.error('Error stopping transcription:', err);
        } finally {
            setIsListening(false);
        }
    };

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (isListening) {
                whisperService.stopTranscription().catch(console.error);
            }
        };
    }, [isListening]);

    const exportTxt = () => {
        const txt = entries
            .map(e => `[${new Date(e.timestamp).toLocaleTimeString()}] ${e.speaker}: ${e.text}`)
            .join('\n');
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([txt], { type: 'text/plain' }));
        a.download = `transcript-${meetingId ?? 'meeting'}.txt`;
        a.click();
    };

    const filtered = search
        ? entries.filter(e => e.text.toLowerCase().includes(search.toLowerCase()))
        : entries;

    const totalWords = entries.reduce((n, e) => n + e.text.split(/\s+/).length, 0);

    /* ── UI ─────────────────────────────────────────────────────────── */
    return (
        <div className="flex flex-col h-full bg-theme-bg transition-colors duration-300">

            {/* ── Top bar ──────────────────────────────────────────────── */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-theme-card-border bg-theme-bg sticky top-0 z-10">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-theme-text">Live Transcript (Cross-Browser)</span>
                    {isListening && (
                        <span className="flex items-center gap-1 text-xs font-medium text-green-600 bg-green-500/10 px-2 py-0.5 rounded-full border border-green-500/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" />
                            LIVE
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    <select
                        value={lang}
                        onChange={e => setLang(e.target.value)}
                        className="text-xs border border-theme-card-border bg-theme-card rounded-md px-2 py-1 text-theme-text focus:outline-none focus:ring-2 focus:ring-theme-accent"
                    >
                        <option value="en-US">English (US)</option>
                        <option value="en-GB">English (UK)</option>
                        <option value="hi-IN">Hindi</option>
                        <option value="es-ES">Spanish</option>
                        {/* More languages can be added here */}
                    </select>

                    <button
                        onClick={exportTxt}
                        disabled={entries.length === 0}
                        className="text-xs text-theme-text/70 hover:text-theme-text disabled:opacity-30 px-2 py-1 rounded border border-theme-card-border hover:bg-theme-bg transition"
                        title="Export as .txt"
                    >
                        ↓ Export
                    </button>
                </div>
            </div>

            {/* ── Error ──────────────────────────────────────────────────── */}
            {errorMsg && (
                <div className="mx-4 mt-3 px-3 py-2.5 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-500 flex items-start gap-2">
                    <span className="text-base leading-none mt-0.5">⚠️</span>
                    <span>{errorMsg}</span>
                </div>
            )}

            {/* ── Search ─────────────────────────────────────────────────── */}
            {entries.length > 0 && (
                <div className="px-4 py-2 border-b border-theme-card-border">
                    <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-theme-icon text-xs">🔍</span>
                        <input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Search active transcript…"
                            className="w-full pl-7 pr-3 py-1.5 text-xs bg-theme-bg border border-theme-card-border rounded-lg text-theme-text placeholder-theme-text/50 focus:outline-none focus:ring-2 focus:ring-theme-accent"
                        />
                    </div>
                </div>
            )}

            {/* ── Transcript body ─────────────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
                {filtered.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center py-12 gap-4">
                        {isListening ? (
                            <>
                                <div className="flex items-end gap-1 h-10">
                                    {[1, 2, 3, 4, 5].map(i => (
                                        <div
                                            key={i}
                                            className="w-1.5 bg-theme-accent rounded-full animate-bounce"
                                            style={{ animationDelay: `${i * 0.1}s`, height: `${20 + i * 8}px` }}
                                        />
                                    ))}
                                </div>
                                <p className="text-sm text-theme-text/80 font-medium">Recording audio chunks…</p>
                                <p className="text-xs text-theme-text/50">Transcriptions will appear every few seconds</p>
                            </>
                        ) : (
                            <>
                                <div className="w-16 h-16 rounded-full bg-theme-accent/10 flex items-center justify-center text-3xl">🎙️</div>
                                <div>
                                    <p className="text-sm font-semibold text-theme-text mb-1">Start Live Transcription</p>
                                    <p className="text-xs text-theme-text/60">
                                        Click the button below to stream microphone audio to the backend AI.
                                    </p>
                                </div>
                            </>
                        )}
                    </div>
                ) : (
                    <>
                        {filtered.map((entry) => {
                            const pct = Math.round(entry.confidence * 100);
                            const confColor =
                                pct >= 85 ? 'text-green-600 dark:text-green-400 bg-green-500/10' :
                                    pct >= 65 ? 'text-yellow-600 dark:text-yellow-400 bg-yellow-500/10' :
                                        'text-red-500 bg-red-500/10';
                            return (
                                <div key={entry.id} className="group flex gap-2 items-start p-2.5 rounded-xl hover:bg-theme-bg transition border border-transparent hover:border-theme-card-border">
                                    <div className="w-7 h-7 rounded-full bg-theme-accent/20 flex items-center justify-center text-xs font-semibold text-theme-accent flex-shrink-0 mt-0.5">
                                        {entry.speaker && entry.speaker.charAt(0).toUpperCase() || 'U'}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-0.5">
                                            <span className="text-xs font-semibold text-theme-text">{entry.speaker || 'You'}</span>
                                            <span className="text-xs text-theme-text/50">
                                                {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                            </span>
                                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${confColor}`}>
                                                {pct}%
                                            </span>
                                        </div>
                                        <p className="text-sm text-theme-text/90 leading-relaxed break-words">{entry.text}</p>
                                    </div>
                                </div>
                            );
                        })}

                        {/* Loading indication if listening but currently waiting on the next chunk */}
                        {isListening && (
                            <div className="flex gap-2 items-start p-2.5 rounded-xl bg-theme-accent/5 border border-theme-accent/20 mt-2">
                                <div className="w-7 h-7 rounded-full bg-theme-accent/20 flex items-center justify-center text-xs font-semibold text-theme-accent flex-shrink-0 mt-0.5">
                                    AI
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-center gap-1.5 mb-0.5">
                                        <span className="text-xs font-semibold text-theme-text">Processing next chunk…</span>
                                        <span className="flex gap-0.5">
                                            {[0, 1, 2].map(i => (
                                                <span key={i} className="w-1 h-1 rounded-full bg-theme-accent animate-bounce inline-block"
                                                    style={{ animationDelay: `${i * 0.15}s` }} />
                                            ))}
                                        </span>
                                    </div>
                                    <p className="text-sm text-theme-text/70 italic">Listening for speech...</p>
                                </div>
                            </div>
                        )}

                        <div ref={bottomRef} />
                    </>
                )}
            </div>

            {/* ── Stats ──────────────────────────────────────────────────── */}
            {entries.length > 0 && (
                <div className="px-4 py-2 border-t border-theme-card-border flex items-center gap-4 text-xs text-theme-text/50">
                    <span>{entries.length} segments</span>
                    <span>•</span>
                    <span>{totalWords} words</span>
                    {meetingId && (
                        <span className="ml-auto text-theme-text/40 text-[10px] truncate">
                            ID: {meetingId.slice(0, 12)}…
                        </span>
                    )}
                </div>
            )}

            {/* ── Mic button ─────────────────────────────────────────────── */}
            <div className="px-4 py-4 border-t border-theme-card-border bg-theme-bg">
                <button
                    id="live-transcript-btn"
                    onClick={isListening ? stopListening : startListening}
                    className={`
            w-full py-3 rounded-2xl font-semibold text-sm transition-all duration-200
            flex items-center justify-center gap-2 shadow-sm
            ${isListening
                            ? 'bg-red-500 hover:bg-red-600 text-white shadow-[0_4px_14px_0_rgba(239,68,68,0.39)] hover:shadow-[0_6px_20px_rgba(239,68,68,0.23)]'
                            : 'bg-theme-accent hover:brightness-110 text-black shadow-[0_4px_14px_0_rgba(255,193,7,0.39)] hover:shadow-[0_6px_20px_rgba(255,193,7,0.23)] hover:-translate-y-0.5'}
          `}
                >
                    {isListening ? (
                        <><span className="w-3 h-3 rounded bg-white" /> Stop Recording</>
                    ) : (
                        <><span className="text-lg">🎙️</span> Start Cross-Browser Recording</>
                    )}
                </button>

                {isListening && (
                    <p className="text-center text-xs text-theme-text/50 mt-2">
                        🔴 Using standard microphone access — supported on all browsers
                    </p>
                )}
            </div>
        </div>
    );
}
