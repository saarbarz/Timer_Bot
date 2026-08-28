import { appConfig } from "../config/AppConfig.js";
import { createBaileysConnectionController } from "./ConnectionController.js";
import { createLocalWebServer } from "./LocalWebServer.js";

const connection = createBaileysConnectionController();
const server = createLocalWebServer({ connection });

server.listen(appConfig.webPort, "127.0.0.1", () => {
  console.log(`Timer Bot web UI listening at http://127.0.0.1:${appConfig.webPort}`);
});

process.once("SIGINT", () => closeAndExit(130));
process.once("SIGTERM", () => closeAndExit(143));

function closeAndExit(exitCode: number): void {
  void connection.disconnect().finally(() => {
    server.close(() => process.exit(exitCode));
  });
}
