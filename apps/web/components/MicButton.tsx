"use client";

import { useRef, useState, useCallback, useEffect } from "react";

/**
 * Web Speech API types — not in default TS lib.
 * Declare minimal interface to avoid external deps.
 */
interface SpeechRecognitionEvent extends Event {
    results: SpeechRecognitionResultList;
    resultIndex: number;
}

interface SpeechRecognitionErrorEvent extends Event {
    error: string;
}

interface SpeechRecognitionInstance extends EventTarget {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    start(): void;
    stop(): void;
    onresult: ((event: SpeechRecognitionEvent) => void) | null;
    onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
    onend: (() => void) | null;
}

declare global {
    interface Window {
        SpeechRecognition?: new () => SpeechRecognitionInstance;
        webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
    }
}

interface MicButtonProps {
    onTranscript: (text: string) => void;
    onListeningChange?: (listening: boolean) => void;
    disabled?: boolean;
    onPermissionError?: (error: "denied" | null) => void;
}

export default function MicButton({ onTranscript, onListeningChange, disabled, onPermissionError }: MicButtonProps) {
    const [recording, setRecording] = useState(false);
    const [supported, setSupported] = useState(true);
    const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

    useEffect(() => {
        onListeningChange?.(recording);
    }, [recording, onListeningChange]);

    useEffect(() => {
        const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
        if (!SR) setSupported(false);
    }, []);

    const toggle = useCallback(async () => {
        if (recording) {
            recognitionRef.current?.stop();
            setRecording(false);
            return;
        }

        const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
        if (!SR) {
            setSupported(false);
            return;
        }

        // ── PART 2: MICROPHONE PERMISSION HANDLING ──
        try {
            const status = await navigator.permissions.query({ name: "microphone" as any });
            if (status.state === "denied") {
                onPermissionError?.("denied");
                return;
            }
        } catch (e) {
            // Some browsers don't support quering 'microphone' permission
        }

        const recognition = new SR();
        recognition.continuous = true;
        recognition.interimResults = false;
        recognition.lang = "en-US";

        recognition.onresult = (event: SpeechRecognitionEvent) => {
            let text = "";
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const result = event.results[i];
                if (result?.[0] && result.isFinal) {
                    text += result[0].transcript;
                }
            }
            if (text) onTranscript(text);
        };

        recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
            if (event.error === "not-allowed") {
                onPermissionError?.("denied");
            } else if (event.error !== "aborted") {
                console.warn("Speech recognition notice:", event.error);
            }
            setRecording(false);
        };

        recognition.onend = () => {
            setRecording(false);
        };

        recognitionRef.current = recognition;
        try {
            recognition.start();
            setRecording(true);
            onPermissionError?.(null); // Clear any old errors
        } catch (e) {
            setRecording(false);
        }
    }, [recording, onTranscript, onPermissionError]);

    if (!supported) {
        return (
            <button
                type="button"
                disabled
                title="Microphone not supported in this browser"
                className="
          p-2.5 rounded-lg
          text-zinc-600 cursor-not-allowed
          border border-zinc-800 bg-zinc-900/40
        "
            >
                <MicOffIcon />
            </button>
        );
    }

    return (
        <button
            type="button"
            onClick={toggle}
            disabled={disabled}
            title={recording ? "Stop listening" : "Begin listening"}
            className="
                relative p-1 rounded-none transition-all duration-700
                border-none outline-none group
                text-zinc-600 hover:text-zinc-400
                disabled:opacity-10 disabled:cursor-not-allowed
            "
        >
            <MicIcon />
        </button>

    );
}

function MicIcon() {
    return (
        <svg
            className="w-6 h-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
        >
            <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
            />
        </svg>
    );
}

function MicOffIcon() {
    return (
        <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
        >
            <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3zM3 3l18 18"
            />
        </svg>
    );
}
