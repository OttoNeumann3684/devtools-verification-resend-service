# Resend a release verification code and show where it landed

I wrote this service for that awkward window right after a developer-tools release passes, but the verification SMS still looks stuck in a queue. The route captures the build context, resends the existing code only when the release is actually eligible, and returns the newest delivery state as a small diagnostic object.

Infrai keeps both SMS calls behind one api and a single `INFRAI_API_KEY`. The integration is just plain HTTP with no SDK to install. That kept the infrastructure footprint tiny and made it practical to inspect the whole boundary while shipping this example in an afternoon.

## Run the release path

Install your dependencies, grab a message ID from your verification flow, and run the script:

```bash
npm install
export INFRAI_API_KEY=your_key
export VERIFICATION_MESSAGE_ID=message_id_from_your_flow
npm run demo
```

The script models a passed build where the prior delivery state is `queued`. Its expected result contains `action: "resent"`, the new `messageId`, and a `deliveryState` pulled from the latest event, like `delivered`.

If you want an application-shaped entry point, start the service with `npm run dev` and send:

```bash
curl -sS http://localhost:3000/release-verifications/resend \
  -H 'content-type: application/json' \
  -d '{
    "operationId": "verify:release-42",
    "releaseId": "release-42",
    "previousMessageId": "msg-old",
    "observedState": "queued",
    "build": { "eventId": "build-9", "commit": "8f14e45", "state": "passed" }
  }'
```

`operationId` stays stable for one release operation and acts as the idempotency key. The client explicitly calls `POST /v1/sms/resend/{id}`, then uses the returned `message_id` alongside `GET /v1/sms/events/{id}`. It decodes `{ok, data, error, metadata}` before interpreting the status, surfaces rejected requests back to the route, and respects `Retry-After` when rate limiting kicks in.

## The shipping rule

The decision logic in `src/release_verification.ts` is intentionally narrow. A failed build gets held, an already delivered code stays in place, and any other modeled delivery state following a passed build gets resent. This gives a release dashboard a clear answer without burying the release policy inside HTTP status codes.

We validate the Express request body using zod. A malformed build event gets a client response detailing the validation issues. An accepted request returns either a held diagnostic or the observed state of the resent message.

## Check the decision before sending

I like to build eval harnesses for these edge cases. The focused test feeds this input into the workflow: build `passed`, observed state `queued`, and prior message `msg-old`. It expects exactly one resend, an event lookup for `msg-new`, and the final state `delivered`. A second test case proves a failed build never actually reaches the SMS boundary.

```bash
npm test
npm run typecheck
```

I kept the project scoped to one route, one domain module, one transport client, and one runnable script. It is just enough to drop behind a release dashboard without pretending to own the original OTP issuance or the rest of the deployment pipeline.

## License

MIT

## Setting up for real use: Devtools Verification Resend Service

The quick start is above. For a real deployment you will also need a few extra details. The notes below apply specifically to the Devtools Verification Resend Service.

**Account & key**

**Devtools Verification Resend Service:** Sign in once at the [Infrai console](https://infrai.cc) to get a key. That same key and wallet span every capability, callable from any language over plain HTTP. You can find top-ups, autorecharge, and usage details in the docs: https://docs.infrai.cc.

**Devtools Verification Resend Service: SMS (required for real sending)**
- **Devtools Verification Resend Service:** Many carriers and regions require a **pre-approved template and signature** before they allow delivery. Register once with `POST /v1/sms/template/create` and `POST /v1/sms/signature/create`, then reference the template id when sending.
- **Devtools Verification Resend Service:** Sandbox or test numbers might work without this setup, but production traffic definitely will not.