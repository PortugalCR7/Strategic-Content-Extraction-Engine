import { google } from "googleapis";
import { getGoogleAuth } from "./googleAuth.js";
import { env } from "../env.js";

export async function createGoogleDoc(title: string) {
    const auth = getGoogleAuth();
    const drive = google.drive({ version: "v3", auth });

    const res = await drive.files.create({
        requestBody: {
            name: title,
            mimeType: "application/vnd.google-apps.document",
            parents: [env.GOOGLE_DOCS_FOLDER_ID],
        },
        fields: "id",
    });

    const documentId = res.data.id!;
    const documentUrl = `https://docs.google.com/document/d/${documentId}/edit`;

    return { documentId, documentUrl };
}
