import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { Client } from "@notionhq/client";

export async function GET() {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const client = new Client({ auth: session.accessToken });
    const response = await client.search({
        filter: { property: "object", value: "page" },
    });

    const containers = response.results
        .filter((page: any) => page.object === "page")
        .map((page: any) => {
            const titleProperty = Object.values(page.properties || {}).find(
                (p: any) => p.type === "title",
            ) as any;
            const title = titleProperty?.title?.[0]?.plain_text || "Untitled";
            return { id: page.id, title };
        });

    return NextResponse.json(containers);
}
