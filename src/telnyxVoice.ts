import type { Express, Request, Response } from "express";
import type { Server } from "http";
import { WebSocketServer, WebSocket } from "ws";

const TELNYX_API_KEY = process.env.TELNYX_API_KEY || "";
const PUBLIC_HOST = "okwankyer-fo-pa.onrender.com";

// Send a command to Telnyx for an active call
async function callControl(callControlId: string, action: string, body: object) {
  const res = await fetch(
    `https://api.telnyx.com/v2/calls/${callControlId}/actions/${action}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TELNYX_API_KEY}`,
      },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) {
    console.error("Telnyx", action, "failed:", res.status, await res.text());
  }
}

// Part 1: the webhook. Telnyx sends call events here.
export function addTelnyxWebhook(app: Express) {
  app.post("/telnyx/voice", async (req: Request, res: Response) => {
    // Reply fast so Telnyx knows we got it
    res.sendStatus(200);

    const event = req.body?.data;
    const type = event?.event_type;
    const callControlId = event?.payload?.call_control_id;
    console.log("Telnyx event:", type);

    if (type === "call.initiated" && event?.payload?.direction === "incoming") {
      await callControl(callControlId, "answer", {});
    }

    if (type === "call.answered") {
      // Start streaming the caller's audio to our WebSocket
      await callControl(callControlId, "streaming_start", {
        stream_url: `wss://${PUBLIC_HOST}/telnyx/stream`,
        stream_track: "inbound_track",
      });
    }

    if (type === "call.hangup") {
      console.log("Call ended");
    }
  });
}

// Part 2: the WebSocket. Telnyx sends live audio here.
export function addTelnyxStream(server: Server) {
  const wss = new WebSocketServer({ server, path: "/telnyx/stream" });

  wss.on("connection", (ws: WebSocket) => {
    console.log("Telnyx stream connected");

    ws.on("message", (raw) => {
      const msg = JSON.parse(raw.toString());

      if (msg.event === "start") {
        console.log("Stream started");
      }

      if (msg.event === "media") {
        // msg.media.payload is base64 audio from the caller
        const audio = Buffer.from(msg.media.payload, "base64");
        // TODO: send `audio` to your ASR here
        console.log("Got audio bytes:", audio.length);
      }

      if (msg.event === "stop") {
        console.log("Stream stopped");
      }
    });

    ws.on("close", () => console.log("Stream closed"));
  });
}