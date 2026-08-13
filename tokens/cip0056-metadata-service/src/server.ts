// Entrypoint: load a deployment's config and serve the metadata API.
//
//   bun run src/server.ts --config config/example.instruments.json
//
// PORT and METADATA_CONFIG environment variables are honoured too, for
// container deployments where passing argv is awkward.
import { loadConfig } from "./config.ts";
import { createHandler } from "./handler.ts";
import { configInstrumentSource } from "./instruments.ts";

const DEFAULT_PORT = 8080;

function configPathFromArgv(argv: string[]): string | undefined {
  const flag = argv.indexOf("--config");
  // A trailing `--config` yields "" to force the usage error below, rather
  // than silently falling back to METADATA_CONFIG.
  if (flag >= 0) return argv[flag + 1] ?? "";
  return argv.find((arg) => arg.startsWith("--config="))?.slice("--config=".length);
}

const configPath = configPathFromArgv(Bun.argv) ?? Bun.env.METADATA_CONFIG;
if (configPath === undefined || configPath === "") {
  console.error("usage: bun run src/server.ts --config <path>   (or set METADATA_CONFIG)");
  process.exit(2);
}

const config = await loadConfig(configPath);
const handler = createHandler({ config, source: configInstrumentSource(config) });

// An unset variable in a compose file arrives as "", which Number() would turn
// into 0 -- a random ephemeral port rather than the documented default.
const portEnv = Bun.env.PORT?.trim();
const port = portEnv === undefined || portEnv === "" ? DEFAULT_PORT : Number(portEnv);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  console.error(`PORT must be an integer in [0, 65535], got ${JSON.stringify(Bun.env.PORT)}`);
  process.exit(2);
}

const server = Bun.serve({ port, fetch: handler });

console.log(
  `token-metadata-v1 registry for ${config.adminId}: ${config.instruments.length} instrument(s) on ${server.url}`,
);
