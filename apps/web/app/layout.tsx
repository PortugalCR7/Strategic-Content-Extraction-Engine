import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
    title: "SCEE — Transcript Processor",
    description: "Strategic Content Extraction Engine",
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en">
            <body className="min-h-screen bg-zinc-950 text-zinc-100">
                {children}
            </body>
        </html>
    );
}
