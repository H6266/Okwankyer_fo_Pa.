import express, { Express, Request, Response } from "express";

const TARGET = process.env.AT_FORWARD_TARGET || "sip:test@okwankyer.sip.telnyx.com";

export function addAfricasTalkingForward(app: Express) {
  const form = express.urlencoded({ extended: false });

  app.post("/africastalking/forward", form, (req: Request, res: Response) => {
    console.log("AT forward call:", req.body?.sessionId, req.body?.callerNumber);
    res
      .type("text/plain")
      .send(`<?xml version="1.0" encoding="UTF-8"?><Response><Dial phoneNumbers="${TARGET}"/></Response>`);
  });

  app.post("/africastalking/events", form, (req: Request, res: Response) => {
    console.log("AT event:", JSON.stringify(req.body));
    res.sendStatus(200);
  });
}
