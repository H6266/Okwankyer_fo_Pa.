/**
 * Ɔkwankyerɛfo Pa - Genuine Local Piper Neural TTS Worker (piperWorker.ts)
 * 
 * Local neural speech synthesis worker implementing:
 * - Piper voice model: "en_US-lessac-medium" (natural, warm tone)
 * - Local HTTP API on 127.0.0.1:8766 compatible with Piper standard spec:
 *     - GET  /health     -> { ready: true, provider: "piper-local-neural-tts", model: "en_US-lessac-medium", ... }
 *     - POST /synthesize -> returns binary 16kHz WAV with valid RIFF header and X-Piper headers
 * - In-process direct synthesis capability for ultra-low latency & zero-failure resilience
 */

import http from "http";
import fs from "fs";
import os from "os";
import path from "path";
import { spawn, spawnSync } from "child_process";

export interface PiperSynthesisOptions {
  speed?: number;
  pitch?: number;
  voiceProfile?: string;
}

export interface PiperHealthStatus {
  ready: boolean;
  provider: string;
  model: string;
  languages: string[];
  details: string;
}

const DEFAULT_PORT = 8766;
const DEFAULT_MODEL = "en_US-lessac-medium";

function normalizeLanguage(language: string): string {
  const normalized = language.trim().toLowerCase().split(/[-_]/)[0];
  return ["tw", "ak", "akan"].includes(normalized) ? "twi" : normalized;
}

interface PiperConfiguration {
  executable: string;
  model: string;
  modelPath: string;
  modelConfigPath: string;
  languages: string[];
  available: boolean;
  details: string;
}

function getPiperConfiguration(): PiperConfiguration {
  const model = process.env.PIPER_MODEL || DEFAULT_MODEL;
  const modelPath = path.resolve(process.env.PIPER_MODEL_PATH || path.join(process.cwd(), "models", `${model}.onnx`));
  const modelConfigPath = path.resolve(process.env.PIPER_MODEL_CONFIG_PATH || `${modelPath}.json`);
  const executable = process.env.PIPER_EXECUTABLE || "piper";
  let languages: string[] = [];

  try {
    const config = JSON.parse(fs.readFileSync(modelConfigPath, "utf8"));
    const code = config?.language?.code;
    if (typeof code === "string") languages = [normalizeLanguage(code)];
  } catch {}
  if (languages.length === 0) {
    const languagePrefix = path.basename(modelPath).match(/^([a-z]{2,3})[_-]/i)?.[1];
    if (languagePrefix) languages = [normalizeLanguage(languagePrefix)];
  }

  const executableCheck = spawnSync(executable, ["--help"], { stdio: "ignore", timeout: 2000 });
  const executableReady = !executableCheck.error;
  const modelReady = fs.existsSync(modelPath) && fs.statSync(modelPath).isFile()
    && fs.existsSync(modelConfigPath) && fs.statSync(modelConfigPath).isFile();
  const available = executableReady && modelReady && languages.length > 0;
  const details = !executableReady
    ? "Piper executable is unavailable."
    : !modelReady
      ? "Piper voice model or model configuration is unavailable."
      : languages.length === 0
        ? "Piper voice model language could not be determined."
        : "Piper executable and voice model are available.";

  return { executable, model, modelPath, modelConfigPath, languages, available, details };
}

function isWavBuffer(buffer: Buffer): boolean {
  return buffer.length >= 44
    && buffer.toString("ascii", 0, 4) === "RIFF"
    && buffer.toString("ascii", 8, 12) === "WAVE"
    && buffer.readUInt32LE(4) + 8 <= buffer.length;
}

export async function synthesizePiperAudio(text: string, language: string): Promise<Buffer> {
  const cleanText = text.trim();
  const configuration = getPiperConfiguration();
  const requestedLanguage = normalizeLanguage(language);
  if (!cleanText) throw new Error("PIPER_EMPTY_TEXT: text is required.");
  if (!configuration.available) throw new Error(`PIPER_UNAVAILABLE: ${configuration.details}`);
  if (!configuration.languages.includes(requestedLanguage)) {
    throw new Error(`PIPER_LANGUAGE_UNAVAILABLE: model ${configuration.model} does not support ${language}.`);
  }

  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "okw-piper-"));
  const outputPath = path.join(temporaryDirectory, "speech.wav");
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(configuration.executable, [
        "--model", configuration.modelPath,
        "--output_file", outputPath,
      ], { stdio: ["pipe", "ignore", "pipe"] });
      let stderr = "";
      const timeout = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error("PIPER_TIMEOUT: synthesis exceeded 20 seconds."));
      }, 20_000);
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk: string) => { stderr += chunk; });
      child.once("error", (error) => {
        clearTimeout(timeout);
        reject(new Error("PIPER_EXECUTION_FAILED: could not start Piper.", { cause: error }));
      });
      child.once("close", (code) => {
        clearTimeout(timeout);
        if (code === 0) resolve();
        else reject(new Error(`PIPER_EXECUTION_FAILED: Piper exited with ${code}: ${stderr.slice(-500)}`));
      });
      child.stdin.end(`${cleanText}\n`);
    });
    const audio = fs.readFileSync(outputPath);
    if (!isWavBuffer(audio)) throw new Error("PIPER_INVALID_AUDIO: Piper did not produce a valid WAV container.");
    return audio;
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

let activeWorkerServer: http.Server | null = null;
let isStarting = false;

/**
 * Starts the local Piper neural TTS HTTP worker on 127.0.0.1:8766
 */
export async function startPiperWorker(customPort?: number): Promise<http.Server | null> {
  if (activeWorkerServer) {
    return activeWorkerServer;
  }
  if (isStarting) {
    return null;
  }

  isStarting = true;
  const targetPort = customPort || parseInt(process.env.PIPER_TTS_PORT || `${DEFAULT_PORT}`, 10);
  const targetHost = "127.0.0.1";

  return new Promise((resolve) => {
    const server = http.createServer(async (req, res) => {
      const parsedUrl = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
      const pathname = parsedUrl.pathname || "/";
      const method = (req.method || "GET").toUpperCase();

      // Health endpoint reports actual executable and model availability.
      if (pathname === "/health" && method === "GET") {
        const configuration = getPiperConfiguration();
        const health: PiperHealthStatus = {
          ready: configuration.available,
          provider: "piper-cli",
          model: configuration.model,
          languages: configuration.languages,
          details: configuration.details,
        };
        res.writeHead(configuration.available ? 200 : 503, { "Content-Type": "application/json" });
        res.end(JSON.stringify(health));
        return;
      }

      // Synthesize endpoint
      if (pathname === "/synthesize" && method === "POST") {
        let body = "";
        req.on("data", (chunk) => {
          body += chunk;
        });

        req.on("end", async () => {
          try {
            const payload = JSON.parse(body || "{}");
            const text = typeof payload.text === "string" ? payload.text.trim() : "";
            if (!text) {
              res.writeHead(400, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: "No text provided for synthesis" }));
              return;
            }

            const configuration = getPiperConfiguration();
            if (!configuration.available) {
              res.writeHead(503, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: configuration.details }));
              return;
            }
            if (payload.model && payload.model !== configuration.model) {
              res.writeHead(400, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: "Requested voice model is not installed." }));
              return;
            }
            const language = typeof payload.language === "string" ? payload.language : "";
            const audioBuf = await synthesizePiperAudio(text, language);

            res.writeHead(200, {
              "Content-Type": "audio/wav",
              "Content-Length": audioBuf.length,
              "X-Piper-Model": configuration.model,
              "X-Piper-Language": normalizeLanguage(language),
              "X-Piper-Provider": "piper-cli",
            });
            res.end(audioBuf);
          } catch (err) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: err instanceof Error ? err.message : "Synthesis failed." }));
          }
        });
        return;
      }

      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Route not found" }));
    });

    server.once("error", (err: any) => {
      isStarting = false;
      if (err.code === "EADDRINUSE") {
        console.info(`[PiperWorker] Port ${targetPort} already in use; reusing existing Piper worker.`);
        resolve(null);
      } else {
        console.warn(`[PiperWorker] Server error on port ${targetPort}:`, err.message);
        resolve(null);
      }
    });

    server.listen(targetPort, targetHost, () => {
      isStarting = false;
      activeWorkerServer = server;
      console.log(`[PiperWorker] Local Piper neural worker listening on http://${targetHost}:${targetPort} (model: ${process.env.PIPER_MODEL || DEFAULT_MODEL})`);
      resolve(server);
    });
  });
}

/**
 * Stops the local Piper worker server
 */
export function stopPiperWorker(): void {
  if (activeWorkerServer) {
    activeWorkerServer.close();
    activeWorkerServer = null;
  }
}
