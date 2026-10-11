/**
 * Ɔkwankyerɛfo Pa - Pilot Runtime Controls (pilotControls.ts)
 * 
 * Provides production operational safeguards:
 * 1. Dynamic Kill Switch: Forces offline_only mode immediately without redeployment.
 * 2. Per-Number Allowlist: Ensures pilot model execution only affects specified test numbers.
 *    Non-allowlisted numbers are automatically routed to deterministic offline_only mode.
 */

import fs from 'fs';
import path from 'path';
import { BrainMode } from '../ai_system/brain/types';
import { auditLogger } from './auditLogger';

export interface PilotControlsState {
  killSwitch: boolean;
  killSwitchReason?: string;
  killSwitchActivatedAt?: string | null;
  allowlistEnabled: boolean;
  allowedNumbers: string[];
  maxClarificationAttempts: number;
  consentNoticeEnabled: boolean;
}

const STORAGE_PATH = path.resolve(process.cwd(), 'data/pilot_controls.json');

export class PilotControlsService {
  private static instance: PilotControlsService;
  private state: PilotControlsState;

  constructor() {
    this.state = this.loadState();
  }

  public static getInstance(): PilotControlsService {
    if (!PilotControlsService.instance) {
      PilotControlsService.instance = new PilotControlsService();
    }
    return PilotControlsService.instance;
  }

  private loadState(): PilotControlsState {
    const envKillSwitch = process.env.PILOT_KILL_SWITCH === 'true' || process.env.FORCE_OFFLINE_ONLY === 'true';
    const envAllowlist = process.env.PILOT_ALLOWED_NUMBERS
      ? process.env.PILOT_ALLOWED_NUMBERS.split(',').map((n) => this.normalizeNumber(n)).filter(Boolean)
      : [];

    const defaultState: PilotControlsState = {
      killSwitch: envKillSwitch,
      killSwitchReason: envKillSwitch ? 'Activated via environment variable' : undefined,
      killSwitchActivatedAt: envKillSwitch ? new Date().toISOString() : null,
      allowlistEnabled: envAllowlist.length > 0 || process.env.PILOT_ALLOWLIST_ENABLED === 'true',
      allowedNumbers: envAllowlist,
      maxClarificationAttempts: parseInt(process.env.MAX_CLARIFICATION_ATTEMPTS || '3', 10) || 3,
      consentNoticeEnabled: process.env.PILOT_CONSENT_NOTICE_ENABLED !== 'false',
    };

    if (fs.existsSync(STORAGE_PATH)) {
      try {
        const raw = fs.readFileSync(STORAGE_PATH, 'utf-8');
        const parsed = JSON.parse(raw);
        return {
          ...defaultState,
          ...parsed,
          // Environment kill switch override takes precedence if true
          killSwitch: envKillSwitch || Boolean(parsed.killSwitch),
          allowedNumbers: Array.from(new Set([...defaultState.allowedNumbers, ...(parsed.allowedNumbers || [])])),
        };
      } catch (err) {
        console.warn('[PilotControls] Could not parse pilot_controls.json; using defaults:', err);
      }
    }

    return defaultState;
  }

  private persistState(): void {
    try {
      const dir = path.dirname(STORAGE_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(STORAGE_PATH, JSON.stringify(this.state, null, 2), 'utf-8');
    } catch (err) {
      console.warn('[PilotControls] Failed to persist state to disk:', err);
    }
  }

  public normalizeNumber(phone: string): string {
    if (!phone) return '';
    const digits = phone.replace(/\D/g, '');
    if (digits.startsWith('233') && digits.length === 12) {
      return `0${digits.slice(3)}`;
    }
    if (digits.length === 10 && digits.startsWith('0')) {
      return digits;
    }
    if (digits.length === 9) {
      return `0${digits}`;
    }
    return digits;
  }

  // ── Kill Switch API ─────────────────────────────────────────────────────────

  public isKillSwitchActive(): boolean {
    return this.state.killSwitch;
  }

  public setKillSwitch(active: boolean, reason?: string): void {
    const prev = this.state.killSwitch;
    this.state.killSwitch = active;
    this.state.killSwitchReason = reason || (active ? 'Manually engaged by operator' : undefined);
    this.state.killSwitchActivatedAt = active ? new Date().toISOString() : null;
    this.persistState();

    if (prev !== active) {
      auditLogger.log(
        active ? 'warn' : 'info',
        'PILOT_CONTROLS',
        `Kill switch ${active ? 'ENGAGED' : 'DISENGAGED'}. Reason: ${this.state.killSwitchReason || 'N/A'}`
      );
    }
  }

  // ── Allowlist API ──────────────────────────────────────────────────────────

  public isAllowlistEnabled(): boolean {
    return this.state.allowlistEnabled;
  }

  public setAllowlistEnabled(enabled: boolean): void {
    this.state.allowlistEnabled = enabled;
    this.persistState();
    auditLogger.log('info', 'PILOT_CONTROLS', `Allowlist ${enabled ? 'ENABLED' : 'DISABLED'}`);
  }

  public addAllowedNumber(phone: string): boolean {
    const normalized = this.normalizeNumber(phone);
    if (!normalized || normalized.length < 9) return false;
    if (!this.state.allowedNumbers.includes(normalized)) {
      this.state.allowedNumbers.push(normalized);
      this.persistState();
      const masked = `${normalized.slice(0, 3)}****${normalized.slice(-3)}`;
      auditLogger.log('info', 'PILOT_CONTROLS', `Added number to pilot allowlist: ${masked}`);
    }
    return true;
  }

  public removeAllowedNumber(phone: string): boolean {
    const normalized = this.normalizeNumber(phone);
    const prevLen = this.state.allowedNumbers.length;
    this.state.allowedNumbers = this.state.allowedNumbers.filter((n) => n !== normalized);
    if (this.state.allowedNumbers.length !== prevLen) {
      this.persistState();
      const masked = `${normalized.slice(0, 3)}****${normalized.slice(-3)}`;
      auditLogger.log('info', 'PILOT_CONTROLS', `Removed number from pilot allowlist: ${masked}`);
      return true;
    }
    return false;
  }

  public getAllowedNumbers(masked: boolean = true): string[] {
    if (!masked) return [...this.state.allowedNumbers];
    return this.state.allowedNumbers.map((n) =>
      n.length >= 7 ? `${n.slice(0, 3)}****${n.slice(-3)}` : '****'
    );
  }

  public isNumberAllowed(phone: string): boolean {
    if (!this.state.allowlistEnabled) return true;
    if (this.state.allowedNumbers.length === 0) return true; // Empty allowlist allows all if not explicitly restricted
    const normalized = this.normalizeNumber(phone);
    return this.state.allowedNumbers.includes(normalized);
  }

  // ── Effective Mode Resolver ────────────────────────────────────────────────

  /**
   * Resolves the effective Brain execution mode for an incoming caller.
   * 1. If Kill Switch is active -> ALWAYS returns 'offline_only'.
   * 2. If Allowlist is enabled and caller is NOT in allowlist -> forces 'offline_only'.
   * 3. Otherwise returns the system/session configured mode (e.g. 'live' or 'shadow').
   */
  public getEffectiveBrainMode(callerPhone?: string, requestedMode?: BrainMode): BrainMode {
    if (this.isKillSwitchActive()) {
      return 'offline_only';
    }

    if (callerPhone && this.state.allowlistEnabled && this.state.allowedNumbers.length > 0) {
      const allowed = this.isNumberAllowed(callerPhone);
      if (!allowed) {
        return 'offline_only';
      }
    }

    return requestedMode || 'shadow';
  }

  public getMaxClarificationAttempts(): number {
    return this.state.maxClarificationAttempts;
  }

  public setMaxClarificationAttempts(count: number): void {
    if (count > 0 && count <= 10) {
      this.state.maxClarificationAttempts = count;
      this.persistState();
    }
  }

  public isConsentNoticeEnabled(): boolean {
    return this.state.consentNoticeEnabled;
  }

  public setConsentNoticeEnabled(enabled: boolean): void {
    this.state.consentNoticeEnabled = enabled;
    this.persistState();
  }

  public getStatus(): PilotControlsState & { effectiveModeSummary: string } {
    return {
      ...this.state,
      allowedNumbers: this.getAllowedNumbers(true),
      effectiveModeSummary: this.isKillSwitchActive()
        ? 'FORCED_OFFLINE_BY_KILL_SWITCH'
        : this.state.allowlistEnabled
        ? 'RESTRICTED_BY_ALLOWLIST'
        : 'NORMAL_CONFIGURED_MODE',
    };
  }
}

export const pilotControls = PilotControlsService.getInstance();
