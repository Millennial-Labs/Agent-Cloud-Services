#!/usr/bin/env node

import process from "node:process";

import { Command, InvalidArgumentError } from "commander";

import { createCommand } from "./commands/create";
import { initCommand } from "./commands/init";
import { runCommand } from "./commands/run";
import { loadConfig } from "./config/load-config";
import { logger } from "./observability/logger";
import { initTelemetry } from "./observability/telemetry";
import type { EnvironmentName } from "./types/state";

interface GlobalCliOptions {
  config?: string;
}

interface InitCliOptions {
  org?: string;
  home?: string;
  force?: boolean;
}

interface ScopeCliOptions {
  env?: EnvironmentName;
  project?: string;
  home?: string;
}

interface CreateCliOptions extends ScopeCliOptions {
  name?: string;
}

interface RunCliOptions extends ScopeCliOptions {
  dryRun?: boolean;
}

async function main(): Promise<void> {
  const program = new Command();

  program
    .name("acs")
    .description(
      "Run agent harness runtimes in Docker and swarm modes with observability."
    )
    .version("0.1.0")
    .option(
      "-c, --config <path>",
      "Path to YAML config file (default: ./acs.config.yaml if present)."
    )
    .showHelpAfterError();

  program
    .command("init")
    .description(
      "Initialize ACS tenancy root, organization credentials, and environment folders."
    )
    .option("-o, --org <name>", "Organization name for this installation.")
    .option(
      "--home <path>",
      "Override ACS home path (default: $ACS_HOME or ~/.acs)."
    )
    .option(
      "--force",
      "Reset and recreate existing ACS home state if already initialized.",
      false
    )
    .action(async (options: InitCliOptions) => {
      const exitCode = await initCommand({
        org: options.org,
        home: options.home,
        force: options.force ?? false
      });
      process.exitCode = exitCode;
    });

  program
    .command("create")
    .description("Create runtime instance record(s) from GitHub harness source links.")
    .argument("<harness...>", "GitHub harness URL(s).")
    .option("-n, --name <name>", "Explicit name (single harness only).")
    .option(
      "--env <environment>",
      "Override environment context: development | production.",
      parseEnvironmentName
    )
    .option(
      "--project <project-id>",
      "Override project context (default comes from current context)."
    )
    .option(
      "--home <path>",
      "Override ACS home path (default: $ACS_HOME or ~/.acs)."
    )
    .action(async (harness: string[], options: CreateCliOptions) => {
      const exitCode = await createCommand(harness, {
        name: options.name,
        env: options.env,
        project: options.project,
        home: options.home
      });
      process.exitCode = exitCode;
    });

  program
    .command("run")
    .description("Run an existing runtime instance under current or overridden context.")
    .argument("<name>", "Runtime instance name.")
    .option(
      "--env <environment>",
      "Override environment context: development | production.",
      parseEnvironmentName
    )
    .option(
      "--project <project-id>",
      "Override project context (default comes from current context)."
    )
    .option(
      "--home <path>",
      "Override ACS home path (default: $ACS_HOME or ~/.acs)."
    )
    .option("--dry-run", "Validate and simulate run without changing runtime state.", false)
    .action(async (name: string, options: RunCliOptions, command: Command) => {
      const globalOptions = command.optsWithGlobals<GlobalCliOptions>();
      const config = await loadConfig(globalOptions.config);
      const telemetry = initTelemetry(config.observability);

      try {
        const exitCode = await runCommand(
          {
            name,
            env: options.env,
            project: options.project,
            home: options.home,
            dryRun: options.dryRun ?? false
          },
          telemetry
        );

        process.exitCode = exitCode;
      } finally {
        await telemetry.shutdown();
      }
    });

  await program.parseAsync(process.argv);
}

function parseEnvironmentName(input: string): EnvironmentName {
  const normalized = input.toLowerCase();

  if (normalized === "development" || normalized === "production") {
    return normalized;
  }

  throw new InvalidArgumentError(
    `Invalid environment "${input}". Expected one of: development, production.`
  );
}

main().catch((error) => {
  logger.error({ err: error }, "ACS crashed.");
  process.exit(1);
});
