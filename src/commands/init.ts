import os from "node:os";

import { logger } from "../observability/logger";
import { initializeState } from "../state/init-state";

export interface InitCommandOptions {
  org?: string;
  home?: string;
  force: boolean;
}

export async function initCommand(options: InitCommandOptions): Promise<number> {
  const orgName = (options.org?.trim() || os.userInfo().username).trim();

  try {
    const result = await initializeState({
      orgName,
      homePath: options.home,
      force: options.force
    });

    const action = result.overwritten ? "reinitialized" : "initialized";

    logger.info(
      {
        homePath: result.homePath,
        organizationId: result.organization.id,
        organizationName: result.organization.name,
        keyId: result.organization.keyId,
        action
      },
      "ACS state ready."
    );

    process.stdout.write(`ACS ${action} at ${result.homePath}\n`);
    process.stdout.write(`Organization: ${result.organization.name}\n`);
    process.stdout.write(`Organization ID: ${result.organization.id}\n`);
    process.stdout.write(`Key ID: ${result.organization.keyId}\n`);
    process.stdout.write("Current context: production/prj_default\n");
    process.stdout.write(
      `Generated API key (stored in auth/credentials.json): ${result.apiKey}\n`
    );

    return 0;
  } catch (error) {
    logger.error({ err: error }, "Failed to initialize ACS.");
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    return 1;
  }
}
