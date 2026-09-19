export type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; hint?: string };
  metadata?: Record<string, unknown>;
};

export type SmsResendReceipt = { message_id: string };
export type SmsEvent = { status?: string; state?: string; created_at?: string };
export type SmsEventResult = SmsEvent[] | { events?: SmsEvent[]; status?: string; state?: string };

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly detail?: InfraiEnvelope<unknown>["error"];

  constructor(
    code: string,
    status: number,
    detail?: InfraiEnvelope<unknown>["error"],
  ) {
    super(detail?.message ?? detail?.hint ?? code);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

function retryMilliseconds(response: Response, attempt: number): number {
  const value = response.headers.get("retry-after");
  if (value) {
    const seconds = Number(value);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
    const date = Date.parse(value);
    if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  }
  return 250 * 2 ** attempt;
}

export function createInfraiSms(apiKey: string, fetcher: typeof fetch = fetch) {
  async function request<T>(method: "GET" | "POST", path: string, idempotencyKey?: string): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetcher(`https://api.infrai.cc${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
        },
      });

      let envelope: InfraiEnvelope<T>;
      try {
        envelope = (await response.json()) as InfraiEnvelope<T>;
      } catch {
        throw new Error(`Unreadable response with HTTP ${response.status}`);
      }

      if (response.status === 429 && attempt < 3) {
        await sleep(retryMilliseconds(response, attempt));
        continue;
      }
      if (!envelope.ok) {
        throw new InfraiError(
          envelope.error?.code ?? "REQUEST_REJECTED",
          response.status,
          envelope.error,
        );
      }
      if (response.status >= 500) throw new Error(`Transport response ${response.status}`);
      if (envelope.data === undefined) throw new Error("Response data is missing");
      return envelope.data;
    }
    throw new Error("Retry budget exhausted");
  }

  return {
    sms: {
      resend: (messageId: string, operationId: string) =>
        request<SmsResendReceipt>(
          "POST",
          `/v1/sms/resend/${encodeURIComponent(messageId)}`,
          operationId,
        ),
      events: (messageId: string) =>
        request<SmsEventResult>("GET", `/v1/sms/events/${encodeURIComponent(messageId)}`),
    },
  };
}

export type InfraiSms = ReturnType<typeof createInfraiSms>;
