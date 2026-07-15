import { z } from "zod";
import { describe, expect, it } from "vitest";

import { parseExpectedRevision, parseJson } from "@/lib/api";

const payloadSchema = z.object({ title: z.string() }).strict();

function jsonRequest(
  url: string,
  body: string,
  headers: Record<string, string> = {},
) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

describe("API mutation guards", () => {
  it("accepts same-origin JSON and rejects a cross-origin mutation", async () => {
    await expect(
      parseJson(
        jsonRequest("https://todo.example/api/tasks", '{"title":"ok"}', {
          origin: "https://todo.example",
        }),
        payloadSchema,
      ),
    ).resolves.toEqual({ title: "ok" });

    await expect(
      parseJson(
        jsonRequest("https://todo.example/api/tasks", '{"title":"no"}', {
          origin: "https://attacker.example",
        }),
        payloadSchema,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  });

  it("requires a JSON content type", async () => {
    const request = new Request("https://todo.example/api/tasks", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: '{"title":"no"}',
    });

    await expect(parseJson(request, payloadSchema)).rejects.toMatchObject({
      code: "UNSUPPORTED_MEDIA_TYPE",
      status: 415,
    });
  });

  it("rejects declared and actual bodies above 16 KiB", async () => {
    await expect(
      parseJson(
        jsonRequest("https://todo.example/api/tasks", "{}", {
          "content-length": String(16 * 1024 + 1),
        }),
        payloadSchema,
      ),
    ).rejects.toMatchObject({ code: "PAYLOAD_TOO_LARGE", status: 413 });

    await expect(
      parseJson(
        jsonRequest(
          "https://todo.example/api/tasks",
          `{"title":"${"x".repeat(16 * 1024)}"}`,
        ),
        payloadSchema,
      ),
    ).rejects.toMatchObject({ code: "PAYLOAD_TOO_LARGE", status: 413 });
  });

  it("accepts numeric strong or weak If-Match revisions", () => {
    expect(
      parseExpectedRevision(
        new Request("https://todo.example/api/tasks", {
          headers: { "if-match": "\"42\"" },
        }),
      ),
    ).toBe(42);
    expect(
      parseExpectedRevision(
        new Request("https://todo.example/api/tasks", {
          headers: { "if-match": "W/\"7\"" },
        }),
      ),
    ).toBe(7);
  });
});
