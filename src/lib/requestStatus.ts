/** Shared by server and browser: where a guide request ("Ask a friend for a guide") stands. */
export type RequestStatus = "sent" | "opened" | "making" | "declined" | "done";

export const STATUS_LABEL: Record<RequestStatus, string> = {
  sent: "asked",
  opened: "opened it",
  making: "working on it",
  declined: "can’t help",
  done: "guide sent ✓",
};
