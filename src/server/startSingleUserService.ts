import { appConfig } from "../config/AppConfig.js";
import { createManagedBaileysConnectionController } from "./ConnectionController.js";
import { startSingleUserService } from "./SingleUserService.js";

const managedConnection = createManagedBaileysConnectionController();
const service = await startSingleUserService({
  adapter: managedConnection.adapter,
  connection: managedConnection.connection
});

console.log(
  `Timer Bot service listening at http://${appConfig.serviceBindHost}:${appConfig.webPort} pollMs=${appConfig.servicePollMs}`
);

process.once("SIGINT", () => closeAndExit(130));
process.once("SIGTERM", () => closeAndExit(143));

function closeAndExit(exitCode: number): void {
  void service.stop().finally(() => process.exit(exitCode));
}
