import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { env } from "../env.js";

const ALGORITHM = "aes-256-cbc";
const KEY_LENGTH = 32;
const IV_LENGTH = 16;

/**
 * Encrypts text using AES-256-CBC
 */
export function encrypt(text: string): string {
    const secret = env.SESSION_ENCRYPTION_SECRET;
    if (!secret) throw new Error("SESSION_ENCRYPTION_SECRET not set");

    const salt = randomBytes(16);
    const key = scryptSync(secret, salt, KEY_LENGTH);
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");

    // Return salt:iv:encrypted text
    return `${salt.toString("hex")}:${iv.toString("hex")}:${encrypted}`;
}

/**
 * Decrypts text using AES-256-CBC
 */
export function decrypt(encryptedData: string): string {
    const secret = env.SESSION_ENCRYPTION_SECRET;
    if (!secret) throw new Error("SESSION_ENCRYPTION_SECRET not set");

    const [saltHex, ivHex, encryptedText] = encryptedData.split(":");
    if (!saltHex || !ivHex || !encryptedText) {
        throw new Error("Invalid encrypted data format");
    }

    const salt = Buffer.from(saltHex, "hex");
    const iv = Buffer.from(ivHex, "hex");
    const key = scryptSync(secret, salt, KEY_LENGTH);
    const decipher = createDecipheriv(ALGORITHM, key, iv);

    let decrypted = decipher.update(encryptedText, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
}
