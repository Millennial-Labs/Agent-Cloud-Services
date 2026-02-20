import { spawn } from "node:child_process";

import { logger } from "../observability/logger";
import type { ACSConfig, RuntimeTarget } from "../types/config";

interface RuntimeExecutionInput {
  name: string;
  target: RuntimeTarget;
  dryRun: boolean;
  config: ACSConfig;
}

interface BuiltCommand {
  command: string;
  args: string[];
}

export async function executeRuntime(input: RuntimeExecutionInput): Promise<void> {
  const builtCommand = buildTargetCommand(input);
  const commandString = formatCommand(builtCommand.command, builtCommand.args);

  logger.info(
    {
      target: input.target,
      dryRun: input.dryRun,
      command: commandString
    },
    "Prepared runtime command."
  );

  if (input.dryRun) {
    return;
  }

  await runProcess(builtCommand.command, builtCommand.args);
}

function buildTargetCommand(input: RuntimeExecutionInput): BuiltCommand {
  switch (input.target) {
    case "docker":
      return buildDockerCommand(input.config, input.name);
    case "swarm":
      return buildSwarmCommand(input.config, input.name);
    default:
      return assertNever(input.target);
  }
}

function buildDockerCommand(config: ACSConfig, name: string): BuiltCommand {
  if (!config.runtime.image) {
    throw new Error(
      "runtime.image is required when target=docker. Set it in acs.config.yaml."
    );
  }

  return {
    command: "docker",
    args: [
      "run",
      "--rm",
      "--name",
      name,
      config.runtime.image,
      config.runtime.command,
      ...config.runtime.args
    ]
  };
}

function buildSwarmCommand(config: ACSConfig, name: string): BuiltCommand {
  return {
    command: "echo",
    args: [
      `swarm placeholder deployment for ${name} in namespace ${config.runtime.swarm.namespace}`
    ]
  };
}

function runProcess(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });

    child.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        reject(
          new Error(
            `Could not execute "${command}". Ensure it is installed and available in PATH.`
          )
        );
        return;
      }

      reject(error);
    });

    child.on("close", (code, signal) => {
      if (signal) {
        reject(new Error(`Runtime command was interrupted by signal "${signal}".`));
        return;
      }

      if (code !== 0) {
        reject(new Error(`Runtime command exited with code ${code}.`));
        return;
      }

      resolve();
    });
  });
}

function formatCommand(command: string, args: string[]): string {
  return [command, ...args.map(quoteArgument)].join(" ");
}

function quoteArgument(arg: string): string {
  return /\s/.test(arg) ? JSON.stringify(arg) : arg;
}

function assertNever(value: never): never {
  throw new Error(`Unsupported runtime target: ${String(value)}`);
}
