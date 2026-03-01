"use client";

import { useRef } from "react";
import { readTranscriptFile } from "@/lib/parsers";

const ACCEPTED = ".txt,.md,.json,.vtt,.srt";

interface FileUploadButtonProps {
    onFileContent: (text: string) => void;
    disabled?: boolean;
}

export default function FileUploadButton({
    onFileContent,
    disabled,
}: FileUploadButtonProps) {
    const inputRef = useRef<HTMLInputElement>(null);

    async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            const text = await readTranscriptFile(file);
            onFileContent(text);
        } catch (err) {
            console.error("File read error:", err);
        }

        // Reset so the same file can be re-selected
        if (inputRef.current) inputRef.current.value = "";
    }

    return (
        <>
            <input
                ref={inputRef}
                type="file"
                accept={ACCEPTED}
                onChange={handleChange}
                className="hidden"
            />
            <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={disabled}
                title="Upload transcript file"
                className="
                    p-1 rounded-none transition-all duration-500
                    text-zinc-600 hover:text-zinc-400
                    disabled:opacity-10 disabled:cursor-not-allowed
                "
            >
                <UploadIcon />
            </button>

        </>
    );
}

function UploadIcon() {
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
                d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12l-3-3m0 0l-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
            />
        </svg>
    );
}
