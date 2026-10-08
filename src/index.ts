import "dotenv/config";
import { startIndexer } from "./chain/indexer.js";
import { loadConfig } from "./config.js";
import { startServer } from "./server.js";
import { Store } from "./store.js";

const config = loadConfig();
const store = new Store(config.dbPath);

startServer(store, config);
void startIndexer(store, config).catch((error: unknown) => {
  console.error("[indexer] fatal", error);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void store.close().finally(() => process.exit(0));
  });
}
