#!/usr/bin/env node

import process from "node:process";

import { Command, InvalidArgumentError } from "commander";

import { createCommand } from "./commands/create";
import { initCommand } from "./commands/init";
import {
  contextSetCommand,
  contextShowCommand,
  envListCommand,
  envShowCommand,
  instanceListCommand,
  instanceShowCommand,
  orgShowCommand,
  projectListCommand,
  projectShowCommand,
  projectUseCommand,
  runListCommand,
  runShowCommand,
  statusCommand
} from "./commands/resources";
import { runCommand } from "./commands/run";
import { loadConfig } from "./config/load-config";
import { logger } from "./observability/logger";
import { initTelemetry } from "./observability/telemetry";
import type { DetailLevel } from "./types/output";
import type { EnvironmentName } from "./types/state";
import { resolveDetailLevel } from "./utils/output";

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

interface QueryCliOptions extends ScopeCliOptions {
  detail?: DetailLevel;
  json?: boolean;
}

interface ContextSetCliOptions {
  env: EnvironmentName;
  project: string;
  home?: string;
}

interface CreateCliOptions extends ScopeCliOptions {
  name?: string;
}

interface RunCliOptions extends ScopeCliOptions {
  dryRun?: boolean;
  detail?: DetailLevel;
  json?: boolean;
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
      process.exitCode = await initCommand({
        org: options.org,
        home: options.home,
        force: options.force ?? false
      });
    });

  withDisplayOptions(
    program
      .command("status")
      .description("Show high-level org/context/project/runtime status.")
      .option(
        "--home <path>",
        "Override ACS home path (default: $ACS_HOME or ~/.acs)."
      )
  ).action(async (options: QueryCliOptions) => {
    process.exitCode = await statusCommand({
      home: options.home,
      detail: options.detail,
      json: options.json
    });
  });

  const org = program.command("org").description("Organization information commands.");
  withDisplayOptions(org.command("show").description("Show organization details."))
    .option(
      "--home <path>",
      "Override ACS home path (default: $ACS_HOME or ~/.acs)."
    )
    .action(async (options: QueryCliOptions) => {
      process.exitCode = await orgShowCommand(options);
    });

  const context = program
    .command("context")
    .description("Current environment/project context commands.");
  withDisplayOptions(context.command("show").description("Show current context."))
    .option(
      "--home <path>",
      "Override ACS home path (default: $ACS_HOME or ~/.acs)."
    )
    .action(async (options: QueryCliOptions) => {
      process.exitCode = await contextShowCommand(options);
    });
  context
    .command("set")
    .description("Set current environment and project context.")
    .requiredOption(
      "--env <environment>",
      "Target environment: development | production.",
      parseEnvironmentName
    )
    .requiredOption("--project <project-id>", "Target project id.")
    .option(
      "--home <path>",
      "Override ACS home path (default: $ACS_HOME or ~/.acs)."
    )
    .action(async (options: ContextSetCliOptions) => {
      process.exitCode = await contextSetCommand(options);
    });

  const env = program.command("env").description("Environment metadata commands.");
  withDisplayOptions(
    env.command("list").description("List known environments.")
  )
    .option(
      "--home <path>",
      "Override ACS home path (default: $ACS_HOME or ~/.acs)."
    )
    .action(async (options: QueryCliOptions) => {
      process.exitCode = await envListCommand(options);
    });
  withDisplayOptions(
    env
      .command("show")
      .description("Show environment details.")
      .argument("<name>", "Environment name: development | production.")
  )
    .option(
      "--home <path>",
      "Override ACS home path (default: $ACS_HOME or ~/.acs)."
    )
    .action(async (name: string, options: QueryCliOptions) => {
      process.exitCode = await envShowCommand(parseEnvironmentName(name), options);
    });

  const project = program.command("project").description("Project commands.");
  withDisplayOptions(
    project.command("list").description("List projects.")
  )
    .option(
      "--env <environment>",
      "Limit list to one environment: development | production.",
      parseEnvironmentName
    )
    .option(
      "--home <path>",
      "Override ACS home path (default: $ACS_HOME or ~/.acs)."
    )
    .action(async (options: QueryCliOptions) => {
      process.exitCode = await projectListCommand(options);
    });
  withDisplayOptions(
    project
      .command("show")
      .description("Show one project.")
      .argument("<project-id>", "Project id.")
  )
    .option(
      "--env <environment>",
      "Override environment: development | production.",
      parseEnvironmentName
    )
    .option(
      "--home <path>",
      "Override ACS home path (default: $ACS_HOME or ~/.acs)."
    )
    .action(async (projectId: string, options: QueryCliOptions) => {
      process.exitCode = await projectShowCommand(projectId, options);
    });
  project
    .command("use")
    .description("Set current context project (and optional environment).")
    .argument("<project-id>", "Project id.")
    .option(
      "--env <environment>",
      "Override environment: development | production.",
      parseEnvironmentName
    )
    .option(
      "--home <path>",
      "Override ACS home path (default: $ACS_HOME or ~/.acs)."
    )
    .action(async (projectId: string, options: ScopeCliOptions) => {
      process.exitCode = await projectUseCommand(projectId, options);
    });

  const instance = program.command("instance").description("Runtime instance commands.");
  withDisplayOptions(
    withScopeOptions(
      instance.command("list").description("List instances in current or overridden scope.")
    )
  ).action(async (options: QueryCliOptions) => {
    process.exitCode = await instanceListCommand(options);
  });
  withDisplayOptions(
    withScopeOptions(
      instance
        .command("show")
        .description("Show one runtime instance.")
        .argument("<name>", "Runtime instance name.")
    )
  ).action(async (name: string, options: QueryCliOptions) => {
    process.exitCode = await instanceShowCommand(name, options);
  });
  withScopeOptions(
    instance
      .command("create")
      .description("Create runtime instance record(s) from GitHub harness source links.")
      .argument("<harness...>", "GitHub harness URL(s).")
      .option("-n, --name <name>", "Explicit name (single harness only).")
  ).action(async (harness: string[], options: CreateCliOptions) => {
    process.exitCode = await createCommand(harness, options);
  });
  withScopeOptions(
    instance
      .command("run")
      .description("Run an existing runtime instance.")
      .argument("<name>", "Runtime instance name.")
      .option(
        "--dry-run",
        "Validate and simulate run without changing runtime state.",
        false
      )
  ).action(async (name: string, options: RunCliOptions, command: Command) => {
    process.exitCode = await executeInstanceRun(name, options, command);
  });

  // Top-level aliases for fast path.
  withScopeOptions(
    program
      .command("create")
      .description("Alias: instance create")
      .argument("<harness...>", "GitHub harness URL(s).")
      .option("-n, --name <name>", "Explicit name (single harness only).")
  ).action(async (harness: string[], options: CreateCliOptions) => {
    process.exitCode = await createCommand(harness, options);
  });

  withDisplayOptions(
    withScopeOptions(
      program
        .command("run")
        .description(
          "Alias: instance run. Also supports `acs run list` and `acs run show <run-id>`."
        )
        .argument("<name-or-action>", "Runtime instance name, or: list, show")
        .argument("[run-id]", "Run id when action is show.")
        .option(
          "--dry-run",
          "Validate and simulate run without changing runtime state.",
          false
        )
    )
  ).action(
    async (
      nameOrAction: string,
      runId: string | undefined,
      options: RunCliOptions,
      command: Command
    ) => {
      if (nameOrAction === "list") {
        process.exitCode = await runListCommand(options);
        return;
      }

      if (nameOrAction === "show") {
        if (!runId) {
          process.stderr.write("Run id is required: `acs run show <run-id>`.\n");
          process.exitCode = 1;
          return;
        }
        process.exitCode = await runShowCommand(runId, options);
        return;
      }

      process.exitCode = await executeInstanceRun(nameOrAction, options, command);
    }
  );

  await program.parseAsync(process.argv);
}

function withScopeOptions<T extends Command>(command: T): T {
  return command
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
    ) as T;
}

function withDisplayOptions<T extends Command>(command: T): T {
  return command
    .option(
      "--detail <level>",
      "Detail level: concise | standard | full.",
      parseDetailLevel
    )
    .option("--json", "Render machine-readable JSON output.", false) as T;
}

async function executeInstanceRun(
  name: string,
  options: RunCliOptions,
  command: Command
): Promise<number> {
  const globalOptions = command.optsWithGlobals<GlobalCliOptions>();
  const config = await loadConfig(globalOptions.config);
  const telemetry = initTelemetry(config.observability);

  try {
    return await runCommand(
      {
        name,
        env: options.env,
        project: options.project,
        home: options.home,
        dryRun: options.dryRun ?? false
      },
      telemetry
    );
  } finally {
    await telemetry.shutdown();
  }
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

function parseDetailLevel(input: string): DetailLevel {
  try {
    return resolveDetailLevel(input);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new InvalidArgumentError(message);
  }
}

main().catch((error) => {
  logger.error({ err: error }, "ACS crashed.");
  process.exit(1);
});
