// Hand-written mirrors of the component schemas in
// openapi/token-metadata-v1.yaml. Kept honest by src/conformance.test.ts,
// which validates live responses against the vendored document itself, so
// drift from the spec fails a test rather than hiding in these types.
//
// The spec's deprecated `showAccountInputFields` and its replacement
// `accountInputFieldsToShow` are omitted: CIP-0056 v1 holdings have no
// provider/accountId, and both fields default to "show nothing".

/** Map from token standard API name to supported minor version. */
export type SupportedApis = {
  [api: string]: number;
};

export interface PauseInfo {
  reason?: string;
  /** RFC 3339 timestamp (exclusive) until which the instrument is paused. */
  until?: string;
}

export interface Instrument {
  id: string;
  name: string;
  symbol: string;
  decimals: number;
  supportedApis: SupportedApis;
  /** Decimal-encoded current total supply, when the source can know it. */
  totalSupply?: string;
  totalSupplyAsOf?: string;
  paused?: boolean;
  pauseInfo?: PauseInfo;
}

export interface GetRegistryInfoResponse {
  adminId: string;
  supportedApis: SupportedApis;
}

export interface ListInstrumentsResponse {
  instruments: Instrument[];
  nextPageToken?: string;
}

export interface ErrorResponse {
  error: string;
}
