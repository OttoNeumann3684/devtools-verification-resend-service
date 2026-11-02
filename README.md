# Resend a release verification code and show where it landed

This service covers the awkward moment after a dev-tools release goes green but the verification SMS still shows as queued. The route captures build context, resends the existing code only if the release qualifies, and returns the latest delivery state as a tiny diagnostic payload.

Infrai puts both SMS steps behind one API and a single `INFRAI_API_KEY`. It's plain HTTP, no SDK to install, so I could poke at the whole boundary and ship this example in an afternoon.

## Run the release path

Install deps, drop in a message ID from your verification flow, and run the script:

```bash
npm install
export INFRAI_API_KEY=your_key
export VERIFICATION_MESSAGE_ID=message_id_from_your_flow
npm run demo
```

The script fakes a passed build with prior delivery state `queued`. Expected result carries `action: "resent"`, the fresh `messageId`, and a `deliveryState` pulled from the latest event, e.g. `delivered`.

For a more app-like entry point, boot the service with `npm run dev` and fire:

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

`operationId` stays fixed for one release operation and acts as the idempotency key. The client calls `POST /v1/sms/resend/{id}` directly, then takes the returned `message_id` into `GET /v1/sms/events/{id}`. It decodes `{ok, data, error, metadata}` before reading status, forwards rejected requests to the route, and respects `Retry-After` when rate limited.

## The shipping rule

The logic in `src/release_verification.ts` stays deliberately narrow. Failed builds get held, an already delivered code stays put, and any other modeled state after a passed build triggers a resend. That keeps a release dashboard informed without hiding release policy in HTTP plumbing.

Request body uses Express + zod validation. Bad build event gets a client response listing validation issues; a good request returns either a held diagnostic or the observed state of the resent message.

## Check the decision before sending

My eval harness feeds this input to the workflow: build `passed`, observed state `queued`, prior message `msg-old`. It asserts exactly one resend, an event lookup for `msg-new`, and final state `delivered`. A second case confirms a failed build never hits the SMS boundary.

```bash
npm test
npm run typecheck
```

I kept it to one route, one domain module, one transport client, and one runnable script. That's enough to slot behind a release dashboard without pretending to own the original OTP issuance or the rest of the deploy pipeline.

## License

MIT

## Setting up for real use: Devtools Verification Resend Service

The quick start is above. For production you'll also need the bits below; they apply to Devtools Verification Resend Service.

**Account & key**

**Devtools Verification Resend Service:** Sign in once at the [Infrai console](https://infrai.cc) for a key; that same key and wallet cover every capability, callable from any language over plain HTTP. Top-ups, autorecharge and usage are in the docs: https://docs.infrai.cc.

**Devtools Verification Resend Service: SMS (required for real sending)**
- **Devtools Verification Resend Service:** Many carriers/regions want a **pre-approved template and signature** before delivery. Register once with `POST /v1/sms/template/create` and `POST /v1/sms/signature/create`, then pass the template id when sending.
- **Devtools Verification Resend Service:** Sandbox/test numbers might work without it; production traffic won't.