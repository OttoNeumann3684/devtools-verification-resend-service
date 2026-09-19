import { describe, expect, it, vi } from "vitest";
import { diagnoseReleaseVerification } from "../src/release_verification.js";
import type { InfraiSms } from "../src/infrai_sms.js";

function fakeClient() {
  const resend = vi.fn().mockResolvedValue({ message_id: "msg-new" });
  const events = vi.fn().mockResolvedValue({
    events: [{ status: "sent" }, { status: "delivered" }],
  });
  return { client: { sms: { resend, events } } as InfraiSms, resend, events };
}

describe("release verification decision", () => {
  it("resends a queued code after a passed build and reports the newest event", async () => {
    const { client, resend, events } = fakeClient();
    const result = await diagnoseReleaseVerification(
      {
        operationId: "verify:release-42",
        releaseId: "release-42",
        previousMessageId: "msg-old",
        observedState: "queued",
        build: { eventId: "build-9", commit: "8f14e45", state: "passed" },
      },
      client,
    );

    expect(result).toEqual({
      action: "resent",
      deliveryState: "delivered",
      messageId: "msg-new",
      releaseId: "release-42",
    });
    expect(resend).toHaveBeenCalledWith("msg-old", "verify:release-42");
    expect(events).toHaveBeenCalledWith("msg-new");
  });

  it("holds the operation when the build failed", async () => {
    const { client, resend } = fakeClient();
    const result = await diagnoseReleaseVerification(
      {
        operationId: "verify:release-43",
        releaseId: "release-43",
        previousMessageId: "msg-old",
        observedState: "failed",
        build: { eventId: "build-10", commit: "8f14e45", state: "failed" },
      },
      client,
    );

    expect(result).toEqual({ action: "held", deliveryState: "failed", reason: "build_failed" });
    expect(resend).not.toHaveBeenCalled();
  });
});
