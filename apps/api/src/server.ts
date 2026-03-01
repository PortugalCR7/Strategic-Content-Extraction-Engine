import express from "express";
import dotenv from "dotenv";

dotenv.config();

const app = express();

app.use(express.json());

app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
});

const PORT = process.env["PORT"] || 3001;
const HOST = process.env["API_HOST"] || "0.0.0.0";

app.listen(Number(PORT), HOST, () => {
    console.log(`API running on http://${HOST}:${PORT}`);
});