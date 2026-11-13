// COSGRAL W3: which Needs you cards a phone may answer. Questions without secrets, approvals of a command or file
// changes, and drafts (Send / Edit / Keep draft) are answered on the phone; everything that grants a permission, asks
// for a secret, confirms a payment or a program consent, or needs the screen stays on the computer.

import type { PendingAgentRequest } from "@openbot/contracts/ipc";

/** Null when the phone may answer the card, otherwise why it must be answered on the computer. */
export function phoneAnswerPolicy(request: PendingAgentRequest): string | null {
  switch (request.kind) {
    case "prompt":
      return request.questions.some((question) => question.isSecret)
        ? "This question asks for a secret; answer it on the computer."
        : null;
    case "approval":
      return request.approval.kind === "command" || request.approval.kind === "file-change"
        ? null
        : "Permission, screen and camera approvals are answered on the computer.";
    case "draft-preview":
      return request.card.variant === "draft"
        ? null
        : "Confirmations (payments, Computer Use, pairing and other consents) are answered on the computer.";
    case "browser-takeover":
      return "Taking over the browser needs the computer.";
    case "vault-request":
      return "Vault items are added and chosen on the computer.";
  }
}
