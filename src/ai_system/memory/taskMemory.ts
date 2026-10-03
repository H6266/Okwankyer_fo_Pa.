/**
 * Ɔkwankyerɛfo Pa - Task Memory & Continuity
 * Tracks active tasks, interrupted tasks, and provides task resumption.
 */

import { IntentName, EntitySlotMap } from "../core/aiTypes";

export interface TaskRecord {
  taskId: string;
  intent: IntentName;
  slots: EntitySlotMap;
  status: "ACTIVE" | "SUSPENDED" | "COMPLETED" | "CANCELLED";
  step: string;
  createdAt: number;
  resumptionPrompt?: {
    en: string;
    twi: string;
  };
}

export class TaskMemory {
  private activeTasks = new Map<string, TaskRecord>();
  private suspendedTasks = new Map<string, TaskRecord[]>();

  public getActiveTask(sessionId: string): TaskRecord | undefined {
    return this.activeTasks.get(sessionId);
  }

  public setPrimaryTask(sessionId: string, intent: IntentName, slots: EntitySlotMap, step: string): TaskRecord {
    const task: TaskRecord = {
      taskId: `task_${Date.now()}`,
      intent,
      slots: { ...slots },
      status: "ACTIVE",
      step,
      createdAt: Date.now(),
      resumptionPrompt: {
        en: `Would you like to continue with sending ${slots.amount ? `${slots.amount} GHS` : "money"}${slots.recipientName ? ` to ${slots.recipientName}` : ""}?`,
        twi: `Wopɛ sɛ wokɔ so mane sika${slots.amount ? ` cedi ${slots.amount}` : ""}${slots.recipientName ? ` kɔma ${slots.recipientName}` : ""}?`,
      },
    };
    this.activeTasks.set(sessionId, task);
    return task;
  }

  /**
   * Suspends the current task to handle an interrupting inquiry (e.g. balance check)
   */
  public interruptWithTask(sessionId: string, interruptingIntent: IntentName): TaskRecord {
    const current = this.activeTasks.get(sessionId);
    if (current && current.status === "ACTIVE") {
      current.status = "SUSPENDED";
      const stack = this.suspendedTasks.get(sessionId) || [];
      stack.push(current);
      this.suspendedTasks.set(sessionId, stack);
    }

    const interruptingTask: TaskRecord = {
      taskId: `task_interrupt_${Date.now()}`,
      intent: interruptingIntent,
      slots: {},
      status: "ACTIVE",
      step: "zero_pin",
      createdAt: Date.now(),
    };
    this.activeTasks.set(sessionId, interruptingTask);
    return interruptingTask;
  }

  /**
   * Completes current task and returns any suspended task awaiting resumption.
   */
  public completeAndResume(sessionId: string): TaskRecord | null {
    this.activeTasks.delete(sessionId);
    const stack = this.suspendedTasks.get(sessionId) || [];
    const suspended = stack.pop();
    if (suspended) {
      suspended.status = "ACTIVE";
      this.activeTasks.set(sessionId, suspended);
      this.suspendedTasks.set(sessionId, stack);
      return suspended;
    }
    return null;
  }

  public clear(sessionId: string): void {
    this.activeTasks.delete(sessionId);
    this.suspendedTasks.delete(sessionId);
  }
}

export const taskMemory = new TaskMemory();
