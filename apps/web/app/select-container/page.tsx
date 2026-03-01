"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getContainers, setContainer, type NotionContainer } from "@/lib/api";

export default function SelectContainer() {
    const [containers, setContainers] = useState<NotionContainer[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();

    useEffect(() => {
        async function fetchContainers() {
            try {
                const data = await getContainers();
                setContainers(data);
            } catch (err) {
                setError("Failed to load Notion pages. Please ensure you have shared at least one page with the SCEE integration.");
            } finally {
                setLoading(false);
            }
        }
        fetchContainers();
    }, []);

    async function handleSelect(pageId: string) {
        setLoading(true);
        try {
            await setContainer(pageId);
            router.push("/");
        } catch (err) {
            setError("Failed to set root container.");
            setLoading(false);
        }
    }

    if (loading && containers.length === 0) {
        return (
            <main className="flex min-h-screen flex-col items-center justify-center bg-black text-zinc-400">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-8 h-8 rounded-full border-2 border-zinc-700 border-t-zinc-400 animate-spin" />
                    <p className="text-xs tracking-widest uppercase opacity-50">Loading Workspace...</p>
                </div>
            </main>
        );
    }

    return (
        <main className="flex min-h-screen flex-col items-center justify-center px-4 py-16 bg-black">
            <div className="w-full max-w-md space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-1000">
                <div className="text-center">
                    <h1 className="text-lg font-semibold tracking-[0.2em] uppercase text-zinc-100">
                        Select Destination
                    </h1>
                    <p className="mt-2 text-[13px] text-zinc-500">
                        Choose the Notion page where you want results exported.
                    </p>
                </div>

                {error && (
                    <div className="rounded-xl border border-red-500/20 bg-red-950/20 px-4 py-3 text-xs text-red-400 text-center">
                        {error}
                    </div>
                )}

                <div className="space-y-3">
                    {containers.map((container) => (
                        <button
                            key={container.id}
                            onClick={() => handleSelect(container.id)}
                            disabled={loading}
                            className="
                                w-full flex items-center justify-between px-5 py-4
                                rounded-xl border border-zinc-800 bg-zinc-900/40
                                text-sm font-medium text-zinc-300
                                hover:border-zinc-500 hover:bg-zinc-800 transition-all active:scale-[0.98]
                                disabled:opacity-50 disabled:cursor-not-allowed
                            "
                        >
                            <span>{container.title}</span>
                            <svg className="w-4 h-4 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                        </button>
                    ))}

                    {containers.length === 0 && !loading && !error && (
                        <div className="text-center py-8">
                            <p className="text-sm text-zinc-600 italic">No accessible pages found.</p>
                        </div>
                    )}
                </div>

                <div className="text-center">
                    <p className="text-[11px] text-zinc-700 uppercase tracking-widest leading-loose">
                        Sharing a Notion page with the integration <br />
                        will make it appear in this list.
                    </p>
                </div>
            </div>
        </main>
    );
}
