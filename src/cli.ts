#!/usr/bin/env node

import process from "node:process";

import { Command, InvalidArgumentError } from "commander";

import { runCommand } from "./commands/run";
import { loadConfig } from "./config/load-config";
import { logger } from "./observability/logger";
import { initTelemetry } from "./observability/telemetry";
import type { RuntimeTarget } from "./types/config";

interface GlobalCliOptions {
  config?: string;
}

interface RunCliOptions {
  target?: RuntimeTarget;
  dryRun?: boolean;
}

async function main(): Promise<void> {
  const program = new Command();

  program
    .name("acs")
    .description(
      "Run agent harness runtimes on local, Docker, or Kubernetes with observability."
    )
    .version("0.1.0")
    .option(
      "-c, --config <path>",
      "Path to YAML config file (default: ./acs.config.yaml if present)."
    )
    .showHelpAfterError();

  program
    .command("run")
    .description("Run an agent harness runtime.")
    .argument("[name]", "Runtime name.", "acs-runtime")
    .option(
      "-t, --target <target>",
      "Runtime target: local | docker | kubernetes.",
      parseRuntimeTarget
    )
    .option("--dry-run", "Print runtime command and exit.", false)
    .action(async (name: string, options: RunCliOptions, command: Command) => {
      const globalOptions = command.optsWithGlobals<GlobalCliOptions>();
      const config = await loadConfig(globalOptions.config);
      const telemetry = initTelemetry(config.observability);

      try {
        const exitCode = await runCommand(
          {
            name,
            target: options.target,
            dryRun: options.dryRun ?? false
          },
          config,
          telemetry
        );

        process.exitCode = exitCode;
      } finally {
        await telemetry.shutdown();
      }
    });

  await program.parseAsync(process.argv);
}

function parseRuntimeTarget(input: string): RuntimeTarget {
  const normalized = input.toLowerCase();

  if (
    normalized === "local" ||
    normalized === "docker" ||
    normalized === "kubernetes"
  ) {
    return normalized;
  }

  throw new InvalidArgumentError(
    `Invalid target "${input}". Expected one of: local, docker, kubernetes.`
  );
}

main().catch((error) => {
  logger.error({ error }, "ACS crashed.");
  process.exit(1);
});
