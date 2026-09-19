import { z } from "zod";
import type { InfraiSms, SmsEventResult } from "./infrai_sms.js";

export const releaseVerificationSchema = z.object({
  operationId: z.string().min(1).max(120),
  releaseId: z.string().min(1).max(120),
  previousMessageId: z.string().min(1).max(160),
  observedState: z.enum(["queued", "sent", "delivered", "failed"]),
  build: z.object({
    eventId: z.string().min(1).max(120),
    commit: z.string().regex(/^[a-f0-9]{7,40}$/),
    state: z.enum(["passed", "failed"]),
  }),
});

export type ReleaseVerification = z.infer<typeof releaseVerificationSchema>;

export type VerificationDiagnostic =
  | { action: "held"; deliveryState: string; reason: "build_failed" | "already_delivered" }
  | { action: "resent"; deliveryState: string; messageId: string; releaseId: string };

export function latestDeliveryState(result: SmsEventResult): string {
  if (Array.isArray(result)) {
    const latest = result.at(-1);
    return latest?.status ?? latest?.state ?? "pending";
  }
  const latest = result.events?.at(-1);
  return latest?.status ?? latest?.state ?? result.status ?? result.state ?? "pending";
}

export async function diagnoseReleaseVerification(
  input: ReleaseVerification,
  infrai: InfraiSms,
): Promise<VerificationDiagnostic> {
  if (input.build.state === "failed") {
    return { action: "held", deliveryState: input.observedState, reason: "build_failed" };
  }
  if (input.observedState === "delivered") {
    return { action: "held", deliveryState: "delivered", reason: "already_delivered" };
  }

  const receipt = await infrai.sms.resend(input.previousMessageId, input.operationId);
  const events = await infrai.sms.events(receipt.message_id);
  return {
    action: "resent",
    deliveryState: latestDeliveryState(events),
    messageId: receipt.message_id,
    releaseId: input.releaseId,
  };
}
