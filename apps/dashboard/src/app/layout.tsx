import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "SCEE — Dashboard",
    description: "Strategic Content Extraction Engine",
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en">
            <body>{children}</body>
        </html>
    );
}
