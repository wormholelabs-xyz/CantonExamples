// Test-only helpers. Not imported by the service itself.

/**
 * Read a response body for structural assertions.
 *
 * Deliberately untyped: the tests assert what actually went over the wire,
 * including fields the service should *not* have sent, so casting to the
 * generated types here would assume the very thing under test. Agreement with
 * the spec's declared shapes is checked in `conformance.test.ts`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function readJson(response: Response): Promise<any> {
  return response.json();
}
