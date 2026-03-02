import { google } from "googleapis";
import { env } from "./env";

const SCOPES = [
    "https://www.googleapis.com/auth/documents",
    "https://www.googleapis.com/auth/drive",
];

export function getGoogleAuth() {
    return new google.auth.JWT({
        email: env.GOOGLE_CLIENT_EMAIL,
        key: env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
        scopes: SCOPES,
        subject: undefined,
        additionalClaims: {
            target_audience: undefined,
        },
    });
}
