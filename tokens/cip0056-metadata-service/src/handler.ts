// The three token-metadata-v1 endpoints, as a plain WHATWG fetch handler.
//
// Routing is written out rather than delegated to a framework: three static
// GET paths on public read-only data need no router, and no CORS middleware --
// a constant wildcard is the whole policy.
import type { RegistryConfig } from "./config.ts";
import type { InstrumentSource } from "./instruments.ts";
import type { ErrorResponse, GetRegistryInfoResponse, ListInstrumentsResponse } from "./types.ts";

const PREFIX = "/registry/metadata/v1";
const INSTRUMENTS_PATH = `${PREFIX}/instruments`;
const INSTRUMENT_PATH_PREFIX = `${INSTRUMENTS_PATH}/`;

/** The spec's declared default page size. */
export const DEFAULT_PAGE_SIZE = 25;
/** Bound on `pageSize`, so one request cannot ask for an unbounded response. */
export const MAX_PAGE_SIZE = 100;

const READ_METHODS = ["GET", "OPTIONS"] as const;

// Public, read-only, unauthenticated data consumed by browser wallets on other
// origins. Because no credentials are involved there is nothing to gate, and a
// constant `*` avoids reflecting a caller-supplied Origin.
const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": READ_METHODS.join(", "),
  // A wallet's tracing SDK adding `traceparent` would otherwise turn a plain
  // GET into a preflight that fails. `*` is safe precisely because no
  // credentials are involved; echoing the requested headers back is not.
  "access-control-allow-headers": "*",
  "access-control-max-age": "86400",
};

const OK_HEADERS: Record<string, string> = {
  ...CORS_HEADERS,
  // Wallets poll; instrument metadata changes rarely.
  "cache-control": "public, max-age=60",
};

// Errors and the health probe: never cached.
const NO_STORE_HEADERS: Record<string, string> = {
  ...CORS_HEADERS,
  "cache-control": "no-store",
};

export interface HandlerOptions {
  config: RegistryConfig;
  source: InstrumentSource;
}

export type Handler = (request: Request) => Promise<Response>;

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return Response.json(body, { status, headers });
}

function fail(status: number, error: string, headers: Record<string, string> = NO_STORE_HEADERS): Response {
  return json({ error } satisfies ErrorResponse, status, headers);
}

/**
 * Clamp `pageSize` instead of rejecting it: the spec declares no 400 response
 * for these endpoints, so an out-of-range value must still produce a usable
 * page. An absent or unparseable value falls back to the declared default.
 */
function pageSizeFrom(params: URLSearchParams): number {
  const raw = params.get("pageSize");
  if (raw === null || raw.trim() === "") return DEFAULT_PAGE_SIZE;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_PAGE_SIZE;

  return Math.min(Math.max(Math.trunc(parsed), 1), MAX_PAGE_SIZE);
}

/**
 * Decode one path segment. Ids contain `:` and may contain any text the admin
 * chose, so `%3A` and `%2F` must decode, while an unencoded `/` is a different
 * path and must not be reassembled into an id.
 */
function decodeInstrumentId(rest: string): string | undefined {
  if (rest === "" || rest.includes("/")) return undefined;
  try {
    return decodeURIComponent(rest);
  } catch {
    // Malformed percent-encoding: no such instrument.
    return undefined;
  }
}

function registryInfo(config: RegistryConfig): GetRegistryInfoResponse {
  return { adminId: config.adminId, supportedApis: config.supportedApis };
}

async function listInstruments(source: InstrumentSource, params: URLSearchParams): Promise<Response> {
  const all = await source.list();
  const pageSize = pageSizeFrom(params);
  const pageToken = params.get("pageToken");

  // A page token is the last id of the previous page, taken exclusively --
  // which is what the spec's own `nextPageToken` description asks for.
  let start = 0;
  if (pageToken !== null && pageToken !== "") {
    const index = all.findIndex((instrument) => instrument.id === pageToken);
    if (index < 0) {
      // Restarting from the top would silently hand the caller duplicates and
      // hide the fact that the instrument set changed under them.
      return fail(404, `unknown pageToken ${JSON.stringify(pageToken)}`);
    }
    start = index + 1;
  }

  const instruments = all.slice(start, start + pageSize);
  const last = instruments.at(-1);
  const hasMore = start + instruments.length < all.length;

  return json(
    {
      instruments,
      ...(hasMore && last !== undefined ? { nextPageToken: last.id } : {}),
    } satisfies ListInstrumentsResponse,
    200,
    OK_HEADERS,
  );
}

async function route({ config, source }: HandlerOptions, request: Request): Promise<Response> {
  const { pathname, searchParams } = new URL(request.url);

  if (pathname === `${PREFIX}/info`) {
    return json(registryInfo(config), 200, OK_HEADERS);
  }

  if (pathname === INSTRUMENTS_PATH) {
    return listInstruments(source, searchParams);
  }

  if (pathname.startsWith(INSTRUMENT_PATH_PREFIX)) {
    const id = decodeInstrumentId(pathname.slice(INSTRUMENT_PATH_PREFIX.length));
    const instrument = id === undefined ? undefined : await source.get(id);
    if (instrument === undefined) {
      return fail(404, "no such instrument");
    }
    return json(instrument, 200, OK_HEADERS);
  }

  // Not part of the standard; operators expect somewhere to point a probe.
  if (pathname === "/healthz") {
    return json({ status: "ok" }, 200, NO_STORE_HEADERS);
  }

  return fail(404, "no such endpoint");
}

/**
 * Build the request handler for one deployment.
 *
 * Returns a plain `(Request) => Promise<Response>`, so it can be handed to
 * `Bun.serve`, mounted on any WinterCG-compatible runtime, or called directly
 * from a test with no socket in between.
 */
export function createHandler(options: HandlerOptions): Handler {
  return async (request) => {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method !== "GET") {
      return fail(405, `method ${request.method} not allowed`, {
        ...NO_STORE_HEADERS,
        allow: READ_METHODS.join(", "),
      });
    }

    try {
      return await route(options, request);
    } catch (cause) {
      // A ledger-backed InstrumentSource can fail at request time; the caller
      // gets the spec's error shape rather than a stack trace.
      console.error("token-metadata-v1: request failed", cause);
      return fail(500, "internal error");
    }
  };
}
