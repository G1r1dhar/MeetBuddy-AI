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
        <div className="flex flex-col h-full bg-white">

            {/* ── Top bar ──────────────────────────────────────────────── */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-white sticky top-0 z-10">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900">Live Transcript (Cross-Browser)</span>
                    {isListening && (
                        <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
                            LIVE
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    <select
                        value={lang}
                        onChange={e => setLang(e.target.value)}
                        className="text-xs border border-gray-200 rounded-md px-2 py-1 text-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-400"
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
                        className="text-xs text-gray-500 hover:text-gray-800 disabled:opacity-30 px-2 py-1 rounded border border-gray-200 hover:bg-gray-50 transition"
                        title="Export as .txt"
                    >
                        ↓ Export
                    </button>
                </div>
            </div>

            {/* ── Error ──────────────────────────────────────────────────── */}
            {errorMsg && (
                <div className="mx-4 mt-3 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-start gap-2">
                    <span className="text-base leading-none mt-0.5">⚠️</span>
                    <span>{errorMsg}</span>
                </div>
            )}

            {/* ── Search ─────────────────────────────────────────────────── */}
            {entries.length > 0 && (
                <div className="px-4 py-2 border-b border-gray-100">
                    <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">🔍</span>
                        <input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Search active transcript…"
                            className="w-full pl-7 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
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
                                            className="w-1.5 bg-indigo-400 rounded-full animate-bounce"
                                            style={{ animationDelay: `${i * 0.1}s`, height: `${20 + i * 8}px` }}
                                        />
                                    ))}
                                </div>
                                <p className="text-sm text-gray-500 font-medium">Recording audio chunks…</p>
                                <p className="text-xs text-gray-400">Transcriptions will appear every few seconds</p>
                            </>
                        ) : (
                            <>
                                <div className="w-16 h-16 rounded-full bg-indigo-50 flex items-center justify-center text-3xl">🎙️</div>
                                <div>
                                    <p className="text-sm font-semibold text-gray-700 mb-1">Start Live Transcription</p>
                                    <p className="text-xs text-gray-400">
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
                                pct >= 85 ? 'text-emerald-600 bg-emerald-50' :
                                    pct >= 65 ? 'text-amber-600 bg-amber-50' :
                                        'text-red-500 bg-red-50';
                            return (
                                <div key={entry.id} className="group flex gap-2 items-start p-2.5 rounded-xl hover:bg-gray-50 transition">
                                    <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-semibold text-indigo-700 flex-shrink-0 mt-0.5">
                                        {entry.speaker && entry.speaker.charAt(0).toUpperCase() || 'U'}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-0.5">
                                            <span className="text-xs font-semibold text-gray-700">{entry.speaker || 'You'}</span>
                                            <span className="text-xs text-gray-400">
                                                {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                            </span>
                                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${confColor}`}>
                                                {pct}%
                                            </span>
                                        </div>
                                        <p className="text-sm text-gray-800 leading-relaxed break-words">{entry.text}</p>
                                    </div>
                                </div>
                            );
                        })}

                        {/* Loading indication if listening but currently waiting on the next chunk */}
                        {isListening && (
                            <div className="flex gap-2 items-start p-2.5 rounded-xl bg-indigo-50 border border-indigo-100 mt-2">
                                <div className="w-7 h-7 rounded-full bg-indigo-200 flex items-center justify-center text-xs font-semibold text-indigo-700 flex-shrink-0 mt-0.5">
                                    AI
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-center gap-1.5 mb-0.5">
                                        <span className="text-xs font-semibold text-indigo-600">Processing next chunk…</span>
                                        <span className="flex gap-0.5">
                                            {[0, 1, 2].map(i => (
                                                <span key={i} className="w-1 h-1 rounded-full bg-indigo-400 animate-bounce inline-block"
                                                    style={{ animationDelay: `${i * 0.15}s` }} />
                                            ))}
                                        </span>
                                    </div>
                                    <p className="text-sm text-indigo-700 italic">Listening for speech...</p>
                                </div>
                            </div>
                        )}

                        <div ref={bottomRef} />
                    </>
                )}
            </div>

            {/* ── Stats ──────────────────────────────────────────────────── */}
            {entries.length > 0 && (
                <div className="px-4 py-2 border-t border-gray-100 flex items-center gap-4 text-xs text-gray-400">
                    <span>{entries.length} segments</span>
                    <span>•</span>
                    <span>{totalWords} words</span>
                    {meetingId && (
                        <span className="ml-auto text-gray-300 text-[10px] truncate">
                            ID: {meetingId.slice(0, 12)}…
                        </span>
                    )}
                </div>
            )}

            {/* ── Mic button ─────────────────────────────────────────────── */}
            <div className="px-4 py-4 border-t border-gray-100 bg-white">
                <button
                    id="live-transcript-btn"
                    onClick={isListening ? stopListening : startListening}
                    className={`
            w-full py-3 rounded-2xl font-semibold text-sm transition-all duration-200
            flex items-center justify-center gap-2 shadow-sm
            ${isListening
                            ? 'bg-red-500 hover:bg-red-600 text-white shadow-red-200'
                            : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200 hover:-translate-y-0.5'}
          `}
                >
                    {isListening ? (
                        <><span className="w-3 h-3 rounded bg-white" /> Stop Recording</>
                    ) : (
                        <><span className="text-lg">🎙️</span> Start Cross-Browser Recording</>
                    )}
                </button>

                {isListening && (
                    <p className="text-center text-xs text-gray-400 mt-2">
                        🔴 Using standard microphone access — supported on all browsers
                    </p>
                )}
            </div>
        </div>
    );
}
