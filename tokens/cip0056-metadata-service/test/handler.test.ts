// HTTP behaviour of the three token-metadata-v1 endpoints.
//
// `createHandler` returns a plain (Request) => Response, so these run with no
// socket and no test client: construct a Request, assert on the Response.
import { describe, expect, test } from "bun:test";

import { parseConfig } from "../src/config.ts";
import { createHandler } from "../src/handler.ts";
import { configInstrumentSource } from "../src/instruments.ts";
import { readJson } from "./testing.ts";

const ADMIN_ID = "gg::1220aabbccdd";
const BASE = "https://registry.example.com";
const PREFIX = "/registry/metadata/v1";

// Instruments from w7-registry, keyed by the underlying asset's Solana mint.
const W_ID = "solana:85VBFQZC9TZkfaptBWjvUw7YbZjy52A6mjtPGjstQAmQ";
const USDC_ID = "solana:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SPCX_ID = "solana:SPCXxcqXj6e5dJDVNovHN8744zkbhM2bYudU45BimGb";

// Deliberately not in sorted order: pagination must impose its own ordering.
const INSTRUMENTS = [
  { id: SPCX_ID, name: "SpaceX", symbol: "SPCX", decimals: 6 },
  { id: W_ID, name: "Wormhole", symbol: "W", decimals: 6 },
  { id: USDC_ID, name: "USD Coin", symbol: "USDC", decimals: 6 },
];

const SORTED_IDS = [W_ID, USDC_ID, SPCX_ID];

function harness(instruments: unknown[] = INSTRUMENTS) {
  const config = parseConfig({ adminId: ADMIN_ID, instruments });
  return createHandler({ config, source: configInstrumentSource(config) });
}

function get(handler: ReturnType<typeof harness>, path: string) {
  return handler(new Request(`${BASE}${path}`));
}

describe("GET /registry/metadata/v1/info", () => {
  test("serves the registry admin party and its registry-wide supportedApis", async () => {
    const res = await get(harness(), `${PREFIX}/info`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");

    const body = await readJson(res);
    expect(body.adminId).toBe(ADMIN_ID);
    expect(body.supportedApis["splice-api-token-metadata-v1"]).toBe(1);
  });
});

describe("GET /registry/metadata/v1/instruments/{instrumentId}", () => {
  test("serves every field the standard requires", async () => {
    const res = await get(harness(), `${PREFIX}/instruments/${W_ID}`);
    expect(res.status).toBe(200);

    const body = await readJson(res);
    expect(body).toMatchObject({
      id: W_ID,
      name: "Wormhole",
      symbol: "W",
      decimals: 6,
    });
    expect(typeof body.decimals).toBe("number");
    expect(body.decimals).toBeGreaterThanOrEqual(0);
    expect(body.decimals).toBeLessThanOrEqual(10);
    expect(body.supportedApis["splice-api-token-holding-v1"]).toBe(1);
  });

  // Our ids contain ':', which is legal unencoded in a path segment but which
  // clients will percent-encode. Both have to resolve to the same instrument.
  test("resolves a percent-encoded id identically to a raw one", async () => {
    const handler = harness();
    const raw = await get(handler, `${PREFIX}/instruments/${W_ID}`);
    const encoded = await get(handler, `${PREFIX}/instruments/${encodeURIComponent(W_ID)}`);

    expect(encoded.status).toBe(200);
    expect(await readJson(encoded)).toEqual(await readJson(raw));
  });

  test("404s an unknown instrument with exactly the spec's error shape", async () => {
    const res = await get(harness(), `${PREFIX}/instruments/solana:nope`);
    expect(res.status).toBe(404);

    const body = await readJson(res);
    expect(Object.keys(body)).toEqual(["error"]);
    expect(typeof body.error).toBe("string");
  });

  test("404s rather than mis-resolving an id containing an unencoded slash", async () => {
    const res = await get(harness(), `${PREFIX}/instruments/${W_ID}/extra`);
    expect(res.status).toBe(404);
  });

  test("404s an empty instrument id", async () => {
    const res = await get(harness(), `${PREFIX}/instruments/`);
    expect(res.status).toBe(404);
  });

  test("404s malformed percent-encoding rather than throwing", async () => {
    const res = await get(harness(), `${PREFIX}/instruments/solana%zz`);
    expect(res.status).toBe(404);
    expect(Object.keys(await readJson(res))).toEqual(["error"]);
  });
});

describe("GET /registry/metadata/v1/instruments", () => {
  test("returns every instrument in id order, with no page token when one page suffices", async () => {
    const res = await get(harness(), `${PREFIX}/instruments`);
    expect(res.status).toBe(200);

    const body = await readJson(res);
    expect(body.instruments.map((i: { id: string }) => i.id)).toEqual(SORTED_IDS);
    expect(body.nextPageToken).toBeUndefined();
  });

  test("walks all pages at pageSize=1 without gaps or repeats", async () => {
    const handler = harness();
    const seen: string[] = [];
    let path = `${PREFIX}/instruments?pageSize=1`;

    for (let page = 0; page < 10; page++) {
      const body = await readJson(await get(handler, path));
      expect(body.instruments).toHaveLength(1);
      seen.push(...body.instruments.map((i: { id: string }) => i.id));
      if (body.nextPageToken === undefined) break;
      path = `${PREFIX}/instruments?pageSize=1&pageToken=${encodeURIComponent(body.nextPageToken)}`;
    }

    expect(seen).toEqual(SORTED_IDS);
    expect(new Set(seen).size).toBe(seen.length);
  });

  test("the last page omits nextPageToken even when it is exactly full", async () => {
    const body = await readJson(await get(harness(), `${PREFIX}/instruments?pageSize=3`));
    expect(body.instruments).toHaveLength(3);
    expect(body.nextPageToken).toBeUndefined();
  });

  test.each([
    ["pageSize=0", 1],
    ["pageSize=-5", 1],
    ["pageSize=1000", 3],
    ["pageSize=notanumber", 3],
  ])("clamps %s to a usable page", async (query, expected) => {
    const body = await readJson(await get(harness(), `${PREFIX}/instruments?${query}`));
    expect(body.instruments).toHaveLength(expected);
  });

  test("404s an unknown pageToken instead of silently restarting from the top", async () => {
    const res = await get(harness(), `${PREFIX}/instruments?pageToken=solana:gone`);
    expect(res.status).toBe(404);
    expect(Object.keys(await readJson(res))).toEqual(["error"]);
  });

  test("a pageToken naming the final instrument yields an empty terminal page", async () => {
    const res = await get(harness(), `${PREFIX}/instruments?pageToken=${encodeURIComponent(SPCX_ID)}`);
    expect(res.status).toBe(200);

    const body = await readJson(res);
    expect(body.instruments).toEqual([]);
    expect(body.nextPageToken).toBeUndefined();
  });

  test("serves an empty list for a registry with no instruments", async () => {
    const body = await readJson(await get(harness([]), `${PREFIX}/instruments`));
    expect(body.instruments).toEqual([]);
    expect(body.nextPageToken).toBeUndefined();
  });
});

describe("pause state", () => {
  test("a paused instrument advertises paused and its pauseInfo", async () => {
    const pauseInfo = { reason: "guardian governance halt", until: "2026-09-01T00:00:00Z" };
    const handler = harness([{ ...INSTRUMENTS[0], paused: true, pauseInfo }]);

    const body = await readJson(await get(handler, `${PREFIX}/instruments/${INSTRUMENTS[0]!.id}`));
    expect(body.paused).toBe(true);
    expect(body.pauseInfo).toEqual(pauseInfo);
  });

  test("an unpaused instrument still states paused: false explicitly", async () => {
    const body = await readJson(await get(harness(), `${PREFIX}/instruments/${W_ID}`));
    expect(body.paused).toBe(false);
    expect(body.pauseInfo).toBeUndefined();
  });
});

describe("browser and cache headers", () => {
  // Wallets are browser apps served from another origin, and this is public
  // read-only data, so a constant wildcard is correct -- no Origin reflection.
  test("every GET carries a wildcard CORS header and a cache hint", async () => {
    const res = await get(harness(), `${PREFIX}/info`);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("cache-control")).toContain("max-age");
  });

  test("answers a CORS preflight", async () => {
    const res = await harness()(new Request(`${BASE}${PREFIX}/info`, { method: "OPTIONS" }));
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-methods")).toContain("GET");
  });

  test("does not tell caches to keep a 404", async () => {
    const res = await get(harness(), `${PREFIX}/instruments/solana:nope`);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});

describe("a failing InstrumentSource", () => {
  // A ledger-backed source can fail at request time. The caller must get the
  // spec's error shape, not a stack trace or a hung request.
  function brokenHarness() {
    const config = parseConfig({ adminId: ADMIN_ID, instruments: INSTRUMENTS });
    return createHandler({
      config,
      source: {
        list: async () => {
          throw new Error("ledger unavailable");
        },
        get: async () => {
          throw new Error("ledger unavailable");
        },
      },
    });
  }

  test.each([`${PREFIX}/instruments`, `${PREFIX}/instruments/${W_ID}`])(
    "500s %s with the spec's error shape",
    async (path) => {
      const res = await get(brokenHarness(), path);
      expect(res.status).toBe(500);
      expect(res.headers.get("cache-control")).toBe("no-store");

      const body = await readJson(res);
      expect(Object.keys(body)).toEqual(["error"]);
      expect(body.error).not.toContain("ledger unavailable");
    },
  );

  test("/info still works, since it does not touch the source", async () => {
    const res = await get(brokenHarness(), `${PREFIX}/info`);
    expect(res.status).toBe(200);
  });
});

describe("routing", () => {
  test("serves a health endpoint for operators", async () => {
    const res = await get(harness(), "/healthz");
    expect(res.status).toBe(200);
  });

  test("404s an unknown path", async () => {
    const res = await get(harness(), "/registry/metadata/v2/info");
    expect(res.status).toBe(404);
    expect(Object.keys(await readJson(res))).toEqual(["error"]);
  });

  test("405s a write method on a read-only API", async () => {
    const res = await harness()(new Request(`${BASE}${PREFIX}/info`, { method: "POST" }));
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toContain("GET");
    expect(Object.keys(await readJson(res))).toEqual(["error"]);
  });

});
