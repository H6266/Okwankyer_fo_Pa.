# Ɔkwankyerɛfo Pa - Capability-Based Model Router (AI_MODEL_ROUTING.md)

## 1. Architectural Philosophy
The `ModelRouter` decouples application logic from specific AI providers. System components request **capabilities** rather than named models.

The system registers providers with capability descriptors:
```typescript
export type CognitiveCapability =
  | "LOCAL_NLU"
  | "LOCAL_ASR"
  | "LOCAL_TTS"
  | "LOCAL_LLM"
  | "GEMINI_REASONING"
  | "GEMINI_LIVE"
  | "GEMINI_TTS"
  | "EMBEDDINGS";

export interface ProviderDescriptor {
  id: string;
  name: string;
  capabilities: Set<CognitiveCapability>;
  isLocal: boolean;
  priority: number; // lower number = higher priority
  averageLatencyMs: number;
  failureCount: number;
  circuitBreakerOpen: boolean;
  cooldownUntil: number;
}
```

---

## 2. Dynamic Routing Cascade

When a capability is requested, the `ModelRouter` evaluates providers matching that capability in priority order:

1. **Check Circuit Breaker**: If `circuitBreakerOpen` is true and `Date.now() < cooldownUntil`, skip immediately without attempting network calls.
2. **Execute with Bounded Timeout**: All provider invocations are wrapped with an `AbortController` timeout (e.g., 2500ms for reasoning, 3000ms for TTS).
3. **Trip Circuit Breaker on Consecutive Failures**:
   - 3 consecutive failures (timeouts, 5xx errors, HTTP 429 quota exhaustion) trips the circuit breaker for **60 seconds**.
   - During the cooldown period, traffic automatically falls through to the next tier (e.g., Local Ghanaian NLU or Local TTS).
4. **Half-Open Probe**: After the cooldown expires, one trial request is permitted. If successful, the circuit resets to `CLOSED`.

---

## 3. Capability Routing Matrix

| Capability | Priority 1 | Priority 2 | Priority 3 | Fallback Behavior on Failure |
|---|---|---|---|---|
| `INTENT_CLASSIFICATION` | Local Ghanaian NLU | Local Compact SLM | Gemini Flash | Local NLU (Zero Downtime) |
| `ENTITY_EXTRACTION` | Local Grammar & Regex | Local NLU Extractor | Gemini Flash | Deterministic Phone/Amount Regex |
| `SPEECH_RECOGNITION` | Local Ghanaian ASR | Audio Prompt Matcher | Gemini Transcribe | Keypad DTMF Prompt |
| `SPEECH_SYNTHESIS` | Local Ghanaian Synthesizer | Pre-recorded Studio Audio | Gemini Cloud TTS | Local Synthesizer WAV Buffer |
| `COMPLEX_REASONING` | Gemini Flash Reasoning | Local Context Reasoner | Deterministic State Engine | Deterministic State Engine |
| `EMBEDDINGS` | Local Lexical Vector Hash | Gemini Text-Embedding | *None* | Lexical Jaccard / Token Similarity |
