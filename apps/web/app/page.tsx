export const dynamic = "force-dynamic";
import Workspace from "@/components/Workspace";
import { getSession } from "@/lib/api";

export default async function Home() {
    // ── Pre-fetch session for instant server-side state (if possible) ──
    let isConnected = false;
    let hasContainer = false;
    try {
        const session = await getSession();
        if (session && session.connected) isConnected = true;
        if (session && session.root_page_id) hasContainer = true;
    } catch (e) {
        // Hydrate gracefully
    }

    return (
        <main className="min-h-screen bg-[#0B0D10] relative overflow-hidden flex flex-col font-sans text-white">

            {/* ── AMBIENT DEPTH LAYERS ── */}
            <div className="absolute top-0 right-0 w-[50%] h-full ambient-gradient opacity-10 pointer-events-none" />

            {/* ── MINIMAL HEADER ── */}
            <header className="w-full flex justify-between items-center px-12 py-8 relative z-20">
                <div className="flex items-center gap-4">
                    <div className="w-8 h-8 rounded-full border border-white/20 flex items-center justify-center">
                        <div className="w-2.5 h-2.5 bg-white rounded-full"></div>
                    </div>
                    <span className="text-[17px] tracking-widest font-bold">PONO <span className="font-light text-white/50 small-caps">AI</span></span>
                </div>

                <div className="flex items-center gap-8">
                    {isConnected && (
                        <div className="flex items-center gap-3">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                            <span className="text-[11px] tracking-[0.2em] uppercase text-emerald-500 font-bold opacity-80">Connected</span>
                        </div>
                    )}
                </div>
            </header>

            {/* ── DESKTOP GRID LAYOUT ── */}
            <div className="flex-1 w-full max-w-[1600px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 px-12 pb-20 mt-12 relative z-10">

                {/* LEFT COLUMN: HERO COPY */}
                <div className="lg:col-span-5 flex flex-col justify-center animate-in fade-in slide-in-from-left-8 duration-1000 pl-8">
                    <h1 className="text-[64px] leading-[1.05] font-bold tracking-tight text-white mb-8">
                        Your Voice.<br />Your Truth.<br />Your Genius.
                    </h1>

                    <h2 className="text-[22px] font-medium text-white/80 mb-6 tracking-wide">
                        Signal Over Noise.
                    </h2>

                    <p className="text-[18px] font-light text-zinc-400 leading-relaxed max-w-md">
                        Turn your spoken or written words into compelling, structured narrative assets.
                    </p>
                </div>

                {/* RIGHT COLUMN: WORKSPACE CONTAINER */}
                <div className="lg:col-span-7 flex flex-col justify-center items-center h-full relative">
                    <Workspace isConnected={isConnected} hasContainer={hasContainer} />
                </div>

            </div>
        </main>
    );
}
