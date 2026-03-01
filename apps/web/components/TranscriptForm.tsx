"use client";

import { useState, useRef, useEffect } from "react";
import { submitTranscript, getSession, AUTH_URL, type WebhookResponse } from "@/lib/api";
import MicButton from "@/components/MicButton";
import FileUploadButton from "@/components/FileUploadButton";

const PHASES = [
    "Ingesting…",
    "Cleaning…",
    "Extracting Themes…",
    "Building Matrix…",
    "Exporting…"
] as const;

export default function TranscriptForm() {
    const [transcript, setTranscript] = useState("");
    const [processing, setProcessing] = useState(false);
    const [phaseIndex, setPhaseIndex] = useState(-1);
    const [result, setResult] = useState<WebhookResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [hasContainer, setHasContainer] = useState(false);
    const [notionChecked, setNotionChecked] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [isPasteModalOpen, setIsPasteModalOpen] = useState(false);
    const [completionStage, setCompletionStage] = useState<"none" | "restored" | "button">("none");
    const [micError, setMicError] = useState<"denied" | null>(null);

    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        async function checkSession() {
            try {
                const session = await getSession();
                setIsConnected(session.connected);
                setHasContainer(!!session.root_page_id);
                setNotionChecked(true);

                if (session.connected && !session.root_page_id) {
                    window.location.href = "/select-container";
                }
            } catch (err) {
                console.error("Session authority check failed:", err);
                setNotionChecked(true);
            }
        }
        checkSession();
    }, []);

    useEffect(() => {
        if (!processing) {
            setPhaseIndex(-1);
            return;
        }

        setPhaseIndex(0);
        setCompletionStage("none");

        let currentIdx = 0;
        timerRef.current = setInterval(() => {
            if (currentIdx < PHASES.length - 1) {
                currentIdx++;
                setPhaseIndex(currentIdx);
            } else {
                if (timerRef.current) clearInterval(timerRef.current);
            }
        }, 2200);

        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, [processing]);

    const handleSubmit = async () => {
        if (!transcript.trim()) return;
        setProcessing(true);
        setResult(null);
        setError(null);
        setIsPasteModalOpen(false);
        setCompletionStage("none");
        try {
            const data = await submitTranscript(transcript);
            setResult(data);
            setTimeout(() => {
                setCompletionStage("restored");
                setTimeout(() => {
                    setCompletionStage("button");
                }, 2000);
            }, 1000);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setProcessing(false);
        }
    };

    const handleFileContent = (text: string) => {
        setTranscript(text);
        setIsPasteModalOpen(true);
    };

    const handleTranscriptResult = (text: string) => {
        setTranscript((prev) => prev ? prev + " " + text : text);
    };

    const canInteract = notionChecked && isConnected && hasContainer;

    return (
        <div className="w-full max-w-2xl flex flex-col items-center relative z-20">

            {/* ── TOP RIGHT: CONNECTION (STABLE) ── */}
            {notionChecked && isConnected && (
                <div className="absolute -top-32 right-0 flex items-center gap-3 animate-in fade-in slide-in-from-right-4 duration-1000">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.5)]" />
                    <span className="text-[11px] tracking-[0.2em] uppercase text-emerald-500 font-bold opacity-80">Connected</span>
                </div>
            )}

            {/* ── CORE HUB: Orb Zone (No Pop, Constant Height) ── */}
            <div className="w-full h-[320px] flex items-center justify-center relative mb-12">

                {/* AMBIENT ORB DIFFUSION */}
                <div className="absolute inset-0 ambient-gradient opacity-10 blur-3xl pointer-events-none" />

                {/* ORB (Always Present, Dimensional Depth) */}
                <div className={`flex flex-col items-center transition-all duration-1000 ${notionChecked && !isConnected ? 'opacity-40 blur-[0.2px] scale-90' : 'opacity-100 scale-100'}`}>
                    <div
                        className={`
                            w-80 h-80 rounded-full flex items-center justify-center
                            bg-[#0B0D10] border border-white/5 shadow-inner
                            transition-all duration-1000 relative overflow-visible
                            ${processing ? 'animate-orb-processing' : isListening ? 'animate-orb-listening' : 'animate-orb-breathe'}
                        `}
                    >
                        <div className="scale-[3.2] relative z-20">
                            <MicButton
                                onTranscript={handleTranscriptResult}
                                disabled={!canInteract || processing}
                                onListeningChange={setIsListening}
                                onPermissionError={setMicError}
                            />
                        </div>
                    </div>
                </div>

                {/* CONNECT TO NOTION (Centered over orb if not connected) */}
                {notionChecked && !isConnected && (
                    <div className="absolute inset-0 flex items-center justify-center z-40 pointer-events-none">
                        <a
                            href={AUTH_URL}
                            className="pointer-events-auto px-20 py-7 bg-white text-black text-[15px] tracking-[0.5em] font-bold uppercase transition-all hover:scale-105 active:scale-95 shadow-[0_30px_60px_rgba(255,255,255,0.1)] drop-shadow-2xl"
                        >
                            Connect to Notion
                        </a>
                    </div>
                )}

                {/* ERROR OVERLAY */}
                {error && !processing && (
                    <div className="absolute inset-0 bg-[#0B0D10]/98 flex flex-col items-center justify-center text-center px-8 z-50 animate-in fade-in duration-500">
                        <span className="text-[11px] tracking-[0.4em] font-bold text-red-500/80 uppercase mb-8">Signal Lost</span>
                        <p className="text-base text-zinc-300 font-light max-w-sm leading-relaxed">{error}</p>
                        <button onClick={() => setError(null)} className="mt-12 text-[12px] font-bold tracking-[0.6em] uppercase text-white hover:text-zinc-500 transition-colors">Acknowledge</button>
                    </div>
                )}
            </div>

            {/* ── ACTION ROW (Constant Placement, Pure White) ── */}
            <div className="w-full flex items-center justify-center gap-28 mb-16 px-12">
                {/* RECORD */}
                <div className={`group flex flex-col items-center gap-7 transition-all duration-700 ${canInteract && !processing ? 'opacity-100' : 'opacity-20'} ${isListening ? 'scale-110' : ''}`}>
                    <span className={`transition-all duration-300 ${isListening ? 'text-indigo-400' : 'text-white'}`}>
                        <svg className="w-11 h-11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                        </svg>
                    </span>
                    <span className="text-[12px] tracking-[0.4em] uppercase text-white font-bold select-none cursor-default opacity-80 group-hover:opacity-100 transition-opacity">Record</span>
                </div>

                {/* PASTE */}
                <div
                    onClick={() => canInteract && !processing && setIsPasteModalOpen(true)}
                    className={`group flex flex-col items-center gap-7 transition-all duration-700 ${canInteract && !processing ? 'cursor-pointer opacity-100' : 'opacity-20 cursor-not-allowed'}`}
                >
                    <span className="text-white">
                        <svg className="w-11 h-11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0c0 .414-.336.75-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                        </svg>
                    </span>
                    <span className="text-[12px] tracking-[0.4em] uppercase text-white font-bold select-none opacity-80 group-hover:opacity-100 transition-opacity">Paste</span>
                </div>

                {/* UPLOAD */}
                <div className={`group flex flex-col items-center gap-7 transition-all duration-700 ${canInteract && !processing ? 'opacity-100' : 'opacity-20'}`}>
                    <div className="scale-[1.8] text-white">
                        <FileUploadButton onFileContent={handleFileContent} disabled={!canInteract || processing} />
                    </div>
                    <span className="text-[12px] tracking-[0.4em] uppercase text-white font-bold select-none cursor-default opacity-80 group-hover:opacity-100 transition-opacity">Upload</span>
                </div>
            </div>

            {/* ── FORM FIELD AREA (Always Present, Luminous Ground) ── */}
            <div className="w-full max-w-xl mb-14 relative group">
                <div className="absolute inset-0 bg-white/[0.01] rounded-none opacity-0 group-hover:opacity-100 transition-opacity blur-md" />
                <div
                    onClick={() => canInteract && !processing && setIsPasteModalOpen(true)}
                    className={`
                        w-full py-8 px-12 border border-white/5 bg-white/[0.02] 
                        text-center text-zinc-500 text-[16px] tracking-[0.05em] font-light
                        transition-all duration-1000 relative
                        ${canInteract && !processing ? 'cursor-text hover:bg-white/[0.04] hover:border-white/10' : 'opacity-10 cursor-not-allowed'}
                        shadow-[inset_0_1px_1px_rgba(255,255,255,0.02)]
                    `}
                >
                    Paste your transcript here...
                    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3/4 h-[1px] bg-gradient-to-r from-transparent via-white/5 to-transparent" />
                </div>
            </div>

            {/* ── STATUS ZONE (Unified Step Indicator) ── */}
            <div className="w-full h-[140px] flex flex-col items-center justify-center relative select-none">

                {/* 1. MIC PERMISSION ERRORS */}
                {micError === "denied" && !processing && (
                    <div className="flex flex-col items-center gap-6 animate-in fade-in slide-in-from-top-4 duration-700">
                        <span className="text-[14px] font-medium tracking-wide text-red-400 opacity-90">
                            Microphone access blocked in browser settings
                        </span>
                        <button
                            onClick={() => setMicError(null)}
                            className="px-10 py-3 border border-white/10 text-[11px] font-bold tracking-[0.4em] uppercase text-zinc-400 hover:text-white hover:border-white/20 transition-all"
                        >
                            Enable Microphone
                        </button>
                    </div>
                )}

                {/* 2. PROCESSING PHASES (Step Indicator, Fade Sequential) */}
                {processing && phaseIndex >= 0 && !micError && (
                    <div key={phaseIndex} className="flex flex-col items-center text-center animate-in fade-in duration-1000">
                        <div className="absolute inset-0 ambient-gradient opacity-10 pointer-events-none" />
                        <span className="text-[16px] font-light tracking-[0.8em] uppercase text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]">
                            {PHASES[phaseIndex]}
                        </span>
                    </div>
                )}

                {/* 3. COMPLETION STAGE */}
                {!processing && completionStage !== "none" && !micError && (
                    <div className="flex flex-col items-center text-center">
                        {completionStage === "restored" && (
                            <span className="text-[16px] font-bold tracking-[0.8em] text-indigo-400 uppercase animate-in fade-in duration-1000 drop-shadow-[0_0_10px_rgba(99,102,241,0.5)]">
                                SYNTHESIS RESTORED
                            </span>
                        )}
                        {completionStage === "button" && result && (
                            <a
                                href={result.notion_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-16 py-6 border border-white/10 hover:border-white/20 bg-white/[0.04] text-[13px] font-bold tracking-[0.7em] uppercase text-white transition-all active:scale-95 animate-in fade-in zoom-in-95 duration-1000 shadow-[0_40px_100px_rgba(0,0,0,0.8)]"
                            >
                                Open in Notion
                            </a>
                        )}
                    </div>
                )}
            </div>

            {/* PASTE MODAL (Premium Source Input) */}
            {isPasteModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-[#0B0D10]/98 animate-in fade-in duration-500 overflow-hidden">
                    <div className="absolute inset-0 ambient-gradient opacity-20 pointer-events-none" />
                    <div className="w-full max-w-3xl bg-[#0B0D10] border border-white/5 p-20 flex flex-col items-center shadow-[0_60px_200px_rgba(0,0,0,1)] relative overflow-hidden">
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent" />

                        <span className="text-[11px] tracking-[0.8em] font-bold text-zinc-700 uppercase mb-20">Source Matrix Input</span>

                        <textarea
                            value={transcript}
                            onChange={(e) => setTranscript(e.target.value)}
                            placeholder="Paste your transcript here..."
                            className="w-full bg-transparent border-none text-center px-10 py-6 text-3xl font-light tracking-tight text-[#F5F5F5] placeholder:text-zinc-900 focus:ring-0 outline-none resize-none min-h-[450px] custom-scrollbar"
                            autoFocus
                        />

                        <div className="flex gap-20 mt-16 w-full justify-center relative z-10">
                            <button
                                onClick={() => setIsPasteModalOpen(false)}
                                className="text-[14px] font-bold tracking-[0.6em] uppercase text-zinc-600 hover:text-white transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSubmit}
                                disabled={transcript.trim().length === 0}
                                className="px-20 py-6 bg-white text-black text-[14px] font-bold tracking-[0.7em] uppercase transition-all hover:scale-105 active:scale-95 disabled:opacity-10 drop-shadow-xl"
                            >
                                Extract
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
