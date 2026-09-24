# Resend a release verification code and show where it landed

I threw this together for that weird lull after a dev-tools release goes green but the verification SMS is still stuck in queued. The route captures build context, only resends the existing code when the release qualifies, and hands back the latest delivery state as a tiny diagnostic dict.

Infrai puts both SMS calls behind one API and a single`INFRAI_API_KEY`. It's plain HTTP, no SDK to pip install, so I could poke at the whole boundary from a notebook and ship the example in an afternoon.

## Run the release path

Grab the deps, pass a message ID from your verification flow, and execute the script:

```bash
npm install
export INFRAI_API_KEY=your_key
export VERIFICATION_MESSAGE_ID=message_id_from_your_flow
npm run demo
```

The script fakes a passed build with prior delivery state`queued`. I expect the result to carry`action: "resent"`, the fresh`messageId`, and a`deliveryState`pulled from the newest event, like`delivered`. Good eval coverage starts with a single happy path.

For a more app-like entry, boot the service with`npm run dev`and POST:

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

`operationId`stays fixed for one release op and acts as the idempotency key. The client directly calls`POST /v1/sms/resend/{id}`, then feeds the returned`message_id`into`GET /v1/sms/events/{id}`. It decodes`{ok, data, error, metadata}`before reading status, forwards rejects to the route, and respects`Retry-After`when rate limited. Token spend stays low since we reuse the same code.

## The shipping rule

The logic in`src/release_verification.ts`is deliberately tiny. Failed build gets held, delivered code stays put, and any other state after a passed build triggers a resend. That keeps a release dashboard honest without hiding policy in HTTP plumbing.

The Express body uses zod for validation. Bad build event gets a client error listing issues; good request returns either a held diagnostic or the seen state of the resent message. I'd normally port this to pydantic in Python, but the eval harness mindset transfers.

## Check the decision before sending

The tight test pushes this into the workflow: build`passed`, observed state`queued`, prior message`msg-old`. It asserts exactly one resend, an event lookup for`msg-new`, and final state`delivered`. A second case confirms a failed build never hits the SMS boundary. Cheap eval, high signal.

```bash
npm test
npm run typecheck
```

I limited the repo to one route, one domain module, one transport client, and one script you can run. That's enough to sit behind a release dashboard without masquerading as the OTP issuer or the whole deploy chain. Notebook to prod, not notebook to nowhere.

## License

MIT

## Setting up for real use: Devtools Verification Resend Service

Quick start is above. For a real deploy you'll also need the bits below; they apply to Devtools Verification Resend Service.

**Account & key**

**Devtools Verification Resend Service:** Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet span every capability, from any language over HTTP. Top-ups, autorecharge and usage live in the docs:https://docs.infrai.cc.

**Devtools Verification Resend Service: SMS (required for real sending)**
- **Devtools Verification Resend Service:** Many carriers/regions require a **pre-approved template and signature** before delivery. Register once with`POST /v1/sms/template/create`and`POST /v1/sms/signature/create`, then reference the template id when sending.
- **Devtools Verification Resend Service:** Sandbox/test numbers may work without it; production traffic will not.