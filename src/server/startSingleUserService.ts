import { appConfig } from "../config/AppConfig.js";
import { createManagedBaileysConnectionController } from "./ConnectionController.js";
import { startSingleUserService } from "./SingleUserService.js";

const service = await startServiceOrExit();

console.log(
  `Timer Bot service listening at http://${appConfig.serviceBindHost}:${appConfig.webPort} pollMs=${appConfig.servicePollMs}`
);

process.once("SIGINT", () => closeAndExit(130));
process.once("SIGTERM", () => closeAndExit(143));

function closeAndExit(exitCode: number): void {
  void service.stop().finally(() => process.exit(exitCode));
}

async function startServiceOrExit() {
  const managedConnection = createManagedBaileysConnectionController();
  try {
    return await startSingleUserService({
      adapter: managedConnection.adapter,
      connection: managedConnection.connection
    });
  } catch (error: unknown) {
    if (isAddressInUseError(error)) {
      console.error(
        `Timer Bot service could not start because ${appConfig.serviceBindHost}:${appConfig.webPort} is already in use. Stop the existing web/service process or set PORT to another value.`
      );
      process.exit(1);
    }

    console.error(`Timer Bot service failed to start. errorName=${error instanceof Error ? error.name : typeof error}`);
    process.exit(1);
  }
}

function isAddressInUseError(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "EADDRINUSE"
  );
}
