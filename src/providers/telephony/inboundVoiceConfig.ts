export function isInboundVoiceEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NODE_ENV === "production") return true;
  if (env.AT_CALL_PIPELINE?.toLowerCase() === "unified") return true;
  return env.AT_INBOUND_VOICE_ENABLED?.toLowerCase() !== "false";
}
