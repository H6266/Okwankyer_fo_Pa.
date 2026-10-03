/**
 * Ɔkwankyerɛfo Pa - AI System Error Hierarchy
 */

export class AiSystemError extends Error {
  public readonly code: string;
  public readonly isRecoverable: boolean;

  constructor(message: string, code: string = "AI_SYSTEM_ERROR", isRecoverable: boolean = true) {
    super(message);
    this.name = "AiSystemError";
    this.code = code;
    this.isRecoverable = isRecoverable;
  }
}

export class SecurityGateError extends AiSystemError {
  constructor(message: string) {
    super(message, "SECURITY_GATE_VIOLATION", false);
    this.name = "SecurityGateError";
  }
}

export class AmbiguityError extends AiSystemError {
  public readonly options: string[];

  constructor(message: string, options: string[]) {
    super(message, "AMBIGUOUS_INTENT", true);
    this.name = "AmbiguityError";
    this.options = options;
  }
}

export class ModelUnavailableError extends AiSystemError {
  constructor(message: string = "AI model reasoning service unavailable") {
    super(message, "MODEL_UNAVAILABLE", true);
    this.name = "ModelUnavailableError";
  }
}
