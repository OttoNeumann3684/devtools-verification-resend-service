import express from "express";
import { ZodError } from "zod";
import { createInfraiSms, InfraiError } from "./infrai_sms.js";
import {
  diagnoseReleaseVerification,
  releaseVerificationSchema,
} from "./release_verification.js";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("INFRAI_API_KEY is required");

const infrai = createInfraiSms(apiKey);
const app = express();
app.use(express.json());

app.post("/release-verifications/resend", async (request, response) => {
  try {
    const input = releaseVerificationSchema.parse(request.body);
    response.json(await diagnoseReleaseVerification(input, infrai));
  } catch (error) {
    if (error instanceof ZodError) {
      response.status(400).json({ error: "invalid_request", issues: error.issues });
      return;
    }
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      response.status(status).json({ error: error.code, message: error.message });
      return;
    }
    response.status(502).json({ error: "delivery_check_failed" });
  }
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`Verification diagnostics listening on http://localhost:${port}`));
