"use client";

import { useState, useRef, useEffect } from "react";
import { submitTranscript, AUTH_URL, getSession, type WebhookResponse } from "@/lib/api";
import MicButton from "@/components/MicButton";
import FileUploadButton from "@/components/FileUploadButton";

// Move props interface for clean separation from session
interface WorkspaceProps {
    isConnected: boolean;
    hasContainer: boolean;
}

const PHASES = [
    "Ingesting…",
    "Cleaning…",
    "Extracting Themes…",
    "Building Matrix…",
    "Exporting…"
] as const;

type ModeState = "record" | "paste" | "upload";

export default function Workspace({ isConnected: initialIsConnected, hasContainer: initialHasContainer }: WorkspaceProps) {
    // ── Local Session State (Rehydrated on Focus/Mount) ──
    const [localIsConnected, setLocalIsConnected] = useState(initialIsConnected);
    const [localHasContainer, setLocalHasContainer] = useState(initialHasContainer);

    useEffect(() => {
        let isMounted = true;
        const syncSession = async () => {
            try {
                const session = await getSession();
                if (isMounted) {
                    setLocalIsConnected(session.connected);
                    setLocalHasContainer(!!session.root_page_id);
                }
            } catch (err) {
                // Ignore sync errors
            }
        };

        syncSession(); // Run on mount

        const handleFocus = () => syncSession();
        window.addEventListener("focus", handleFocus);
        return () => {
            isMounted = false;
            window.removeEventListener("focus", handleFocus);
        };
    }, []);

    const isWorkspaceLocked = !localHasContainer;
    const canInteract = localIsConnected && localHasContainer;

    const [mode, setMode] = useState<ModeState>("record");
    const [transcript, setTranscript] = useState("");

    // Processing & State
    const [processing, setProcessing] = useState(false);
    const [phaseIndex, setPhaseIndex] = useState(-1);
    const [result, setResult] = useState<WebhookResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isListening, setIsListening] = useState(false);
    const [completionStage, setCompletionStage] = useState<"none" | "restored" | "button">("none");
    const [micError, setMicError] = useState<"denied" | null>(null);

    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // If mic is denied, gracefully switch to paste mode
    useEffect(() => {
        if (micError === "denied" && mode === "record") {
            setMode("paste");
        }
    }, [micError, mode]);

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
        setMode("paste");
    };

    const handleTranscriptResult = (text: string) => {
        setTranscript((prev) => prev ? prev + " " + text : text);
    };

    const textInput = transcript || "";
    const wordCount = textInput.trim().split(/\s+/).filter(Boolean).length;
    const charCount = textInput.length;
    const limitExceeded = wordCount > 10000;

    return (
        <div className="w-full max-w-3xl flex flex-col items-center relative z-20 animate-in fade-in slide-in-from-bottom-8 duration-1000">

            {/* ── FEATURE TABS ── */}
            <div className="flex w-full mb-4 gap-2">
                {(["record", "paste", "upload"] as const).map((tab) => (
                    <button
                        key={tab}
                        onClick={() => !processing && setMode(tab)}
                        disabled={processing || (!canInteract && tab !== "paste")}
                        className={`
                            flex-1 py-4 px-6 text-[13px] tracking-widest font-bold uppercase transition-all duration-300
                            border border-white/5 shadow-sm rounded-t-xl
                            ${mode === tab
                                ? 'bg-[#121214] text-white border-b-0 shadow-[inset_0_2px_10px_rgba(255,255,255,0.02)] relative z-10 scale-[1.02] transform origin-bottom'
                                : 'bg-[#0B0D10]/50 text-zinc-500 hover:bg-[#121214]/50 hover:text-zinc-300 cursor-pointer'}
                            disabled:opacity-30 disabled:cursor-not-allowed
                        `}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            {/* ── COMMAND CONTAINER (Matte, Structured) ── */}
            <div className="w-full bg-[#121214] border border-white/5 rounded-b-xl rounded-t-sm shadow-[0_20px_50px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.05)] relative overflow-hidden flex flex-col min-h-[500px]">

                {/* Subtle depth gradient */}
                <div className="absolute top-0 left-0 w-full h-[30%] bg-gradient-to-b from-white/[0.02] to-transparent pointer-events-none z-0" />

                {/* NOT CONNECTED STATE OVERLAY */}
                {isWorkspaceLocked && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center z-40 bg-[#121214]/90 backdrop-blur-sm transition-all">
                        <span className="text-zinc-400 mb-6 text-sm tracking-widest">WORKSPACE LOCKED</span>
                        <a
                            href={AUTH_URL}
                            className="px-16 py-5 bg-white text-black text-[13px] tracking-[0.3em] font-bold uppercase transition-all hover:scale-105 active:scale-95 shadow-xl"
                        >
                            Connect to Notion
                        </a>
                    </div>
                )}

                {/* TEXT INPUT AREA (Always present) */}
                <div className="flex-1 w-full relative z-10 p-8 flex flex-col">
                    <textarea
                        value={transcript}
                        onChange={(e) => setTranscript(e.target.value)}
                        placeholder="Describe your goal. I'll handle the execution...."
                        disabled={processing || mode === "record" || !canInteract}
                        className={`
                            flex-1 w-full bg-transparent border-none text-[20px] font-light leading-relaxed tracking-wide text-[#F5F5F5] placeholder:text-zinc-600 focus:ring-0 outline-none resize-none custom-scrollbar transition-opacity duration-500
                            ${(processing || completionStage !== "none") ? 'opacity-10' : 'opacity-100'}
                        `}
                    />

                    {/* WORD + CHAR COUNTS */}
                    <div className="mt-4 flex flex-col gap-1 relative z-20 shrink-0">
                        <div className={`text-xs ${limitExceeded ? 'text-red-400 font-bold' : 'text-zinc-500'}`}>
                            {wordCount.toLocaleString()} words | {charCount.toLocaleString()} characters
                        </div>
                        {limitExceeded ? (
                            <div className="text-red-400 text-xs mb-1">
                                Maximum submission size is 10,000 words.<br />
                                Please split into multiple parts.
                            </div>
                        ) : (
                            <div className="text-zinc-600 text-[11px] mt-1">
                                For best results, keep submissions under 8,000 words.<br />
                                If longer, break into multiple parts.
                            </div>
                        )}
                    </div>

                    {/* PROCESSING OVERLAY (In-place) */}
                    {(processing || completionStage !== "none") && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-30">
                            {processing && phaseIndex >= 0 && (
                                <span className="text-[16px] font-light tracking-[0.6em] uppercase text-white animate-in fade-in duration-1000">
                                    {PHASES[phaseIndex]}
                                </span>
                            )}

                            {!processing && completionStage !== "none" && (
                                <div className="flex flex-col items-center">
                                    {completionStage === "restored" && (
                                        <span className="text-[16px] font-bold tracking-[0.6em] text-indigo-400 uppercase animate-in fade-in duration-1000 drop-shadow-[0_0_10px_rgba(99,102,241,0.5)]">
                                            SYNTHESIS RESTORED
                                        </span>
                                    )}
                                    {completionStage === "button" && result && (
                                        <a
                                            href={result.notion_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="mt-12 pointer-events-auto px-12 py-5 border border-white/10 hover:border-white/20 bg-white/[0.04] text-[12px] font-bold tracking-[0.6em] uppercase text-white transition-all active:scale-95 animate-in fade-in zoom-in-95 duration-1000 shadow-2xl"
                                        >
                                            Open in Notion
                                        </a>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* ERRORS (Displayed at top if present) */}
                {(error || micError === "denied") && !processing && (
                    <div className="absolute inset-x-0 top-0 bg-red-500/10 border-b border-red-500/20 px-8 py-4 flex justify-between items-center z-50">
                        <span className="text-[12px] tracking-widest text-red-400">
                            {micError === "denied" ? "Microphone access blocked. Reverted to Paste." : "Signal Lost: " + error}
                        </span>
                        <button onClick={() => { setError(null); setMicError(null) }} className="text-xs text-zinc-400 hover:text-white uppercase tracking-widest">Dismiss</button>
                    </div>
                )}

                {/* COMMAND TOOLBAR (Bottom anchored) */}
                <div className="w-full border-t border-white/5 bg-[#0B0D10]/40 p-6 flex justify-between items-center relative z-10">

                    {/* LEFT CONTROLS */}
                    <div className="flex items-center gap-6">
                        {/* Mic */}
                        <div className={`relative flex items-center justify-center transition-all ${mode === "record" ? 'scale-110' : 'opacity-60 hover:opacity-100'}`}>
                            {mode === "record" && isListening && (
                                <div className="absolute inset-0 bg-indigo-500/20 blur-xl rounded-full animate-pulse" />
                            )}
                            <div className="scale-125 z-10 text-white">
                                <MicButton
                                    onTranscript={handleTranscriptResult}
                                    disabled={!canInteract || processing || mode !== "record"}
                                    onListeningChange={setIsListening}
                                    onPermissionError={setMicError}
                                />
                            </div>
                        </div>

                        {/* Upload */}
                        <div className={`transition-all hover:scale-110 text-white ${mode === "upload" ? 'opacity-100' : 'opacity-60'}`}>
                            <div className="scale-125">
                                <FileUploadButton onFileContent={handleFileContent} disabled={!canInteract || processing || mode !== "upload"} />
                            </div>
                        </div>

                        {/* Paste icon visual only */}
                        <button onClick={() => setMode("paste")} className={`transition-all hover:scale-110 text-white ${mode === "paste" ? 'opacity-100' : 'opacity-60'}`}>
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0c0 .414-.336.75-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                            </svg>
                        </button>
                    </div>

                    {/* RIGHT CONTROLS (SEND) */}
                    <button
                        onClick={handleSubmit}
                        disabled={!canInteract || processing || transcript.trim().length === 0 || limitExceeded}
                        className={`
                            px-8 py-3 rounded-full text-[13px] font-bold tracking-widest uppercase transition-all duration-300 flex items-center gap-3
                            ${transcript.trim().length > 0 && !processing && !limitExceeded
                                ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-[0_4px_20px_rgba(99,102,241,0.3)] hover:shadow-[0_4px_25px_rgba(99,102,241,0.5)] transform hover:-translate-y-0.5'
                                : 'bg-white/5 text-white/30 cursor-not-allowed'}
                        `}
                    >
                        <span>Extract</span>
                        {transcript.trim().length > 0 && !processing && !limitExceeded && (
                            <div className="w-4 h-4 flex items-center justify-center">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                                </svg>
                            </div>
                        )}
                    </button>

                </div>
            </div>
        </div>
    );
}
