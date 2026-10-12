/** Shared by server and browser: where an ask ("Ask a friend for spots") stands. */
export type RequestStatus = "sent" | "opened" | "making" | "declined" | "done";

export const STATUS_LABEL: Record<RequestStatus, string> = {
  sent: "asked",
  opened: "opened it",
  making: "working on it",
  declined: "can’t help",
  done: "sent ✓",
};
