import type { ErrorEvent } from "@sentry/nextjs";
import { describe, expect, it } from "vitest";
import { scrubEvent, sentryOptions } from "./sentry-options";

describe("scrubEvent", () => {
  it("remove cookies, corpo, headers sensíveis e dados pessoais do usuário", () => {
    const event = {
      type: undefined,
      request: {
        cookies: { sb: "x" },
        data: { senha: "123" },
        headers: { Authorization: "Bearer x", Cookie: "a=b", "user-agent": "ua" },
      },
      user: { id: "u1", email: "a@b.com", ip_address: "1.2.3.4" },
    } as ErrorEvent;

    const out = scrubEvent(event);

    expect(out.request).toEqual({ headers: { "user-agent": "ua" } });
    expect(out.user).toEqual({ id: "u1" });
  });
});

describe("sentryOptions", () => {
  it("fica desligado sem DSN e nunca envia PII por padrão", () => {
    expect(sentryOptions(undefined)).toMatchObject({ enabled: false, sendDefaultPii: false });
    expect(sentryOptions("https://k@o1.ingest.sentry.io/1")).toMatchObject({ enabled: true });
  });
});
