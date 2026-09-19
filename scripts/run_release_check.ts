import { createInfraiSms } from "../src/infrai_sms.js";
import {
  diagnoseReleaseVerification,
  releaseVerificationSchema,
} from "../src/release_verification.js";

const apiKey = process.env.INFRAI_API_KEY;
const messageId = process.env.VERIFICATION_MESSAGE_ID;
if (!apiKey || !messageId) {
  throw new Error("INFRAI_API_KEY and VERIFICATION_MESSAGE_ID are required");
}

const input = releaseVerificationSchema.parse({
  operationId: process.env.RELEASE_OPERATION_ID ?? `manual-${messageId}`,
  releaseId: process.env.RELEASE_ID ?? "release-local",
  previousMessageId: messageId,
  observedState: "queued",
  build: { eventId: "build-local", commit: "8f14e45", state: "passed" },
});

const result = await diagnoseReleaseVerification(input, createInfraiSms(apiKey));
console.log(JSON.stringify(result, null, 2));
