#!/usr/bin/env node
import { startServer } from "./server.js";

startServer().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}
`);
  process.exit(1);
});
