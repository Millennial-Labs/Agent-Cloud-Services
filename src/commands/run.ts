import { performance } from "node:perf_hooks";

import { SpanStatusCode } from "@opentelemetry/api";

import { logger } from "../observability/logger";
import type { TelemetryContext } from "../observability/telemetry";
import {
  findRuntimeByName,
  resolveProjectScope,
  saveRuntimeRecord
} from "../state/project-registry";
import type { EnvironmentName } from "../types/state";

export interface RunCommandOptions {
  name: string;
  env?: EnvironmentName;
  project?: string;
  home?: string;
  dryRun: boolean;
}

export async function runCommand(
  options: RunCommandOptions,
  telemetry: TelemetryContext
): Promise<number> {
  let scopeEnvironment = options.env ?? "production";
  const startedAt = performance.now();
  const spanAttributes: Record<string, string> = {
    "acs.command.name": "run"
  };

  telemetry.commandRuns.add(1, {
    "acs.command.name": "run"
  });

  return telemetry.tracer.startActiveSpan(
    "acs.command.run",
    { attributes: spanAttributes },
    async (span) => {
      try {
        const scope = await resolveProjectScope({
          homePath: options.home,
          environment: options.env,
          projectId: options.project
        });

        scopeEnvironment = scope.environment;
        span.setAttribute("acs.environment", scope.environment);
        span.setAttribute("acs.project.id", scope.projectId);

        const runtime = await findRuntimeByName(scope, options.name);

        if (!runtime) {
          throw new Error(
            `No runtime instance named "${options.name}" exists in ${scope.environment}/${scope.projectId}.`
          );
        }

        span.setAttribute("acs.runtime.name", runtime.record.name);
        span.setAttribute("acs.runtime.target", runtime.record.target);

        if (!options.dryRun) {
          const now = new Date().toISOString();
          const nextRecord = {
            ...runtime.record,
            status: "running" as const,
            running: true,
            runCount: runtime.record.runCount + 1,
            lastRunAt: now,
            updatedAt: now
          };

          await saveRuntimeRecord(runtime.filePath, nextRecord);
        }

        logger.info(
          {
            environment: scope.environment,
            projectId: scope.projectId,
            runtimeName: runtime.record.name,
            dryRun: options.dryRun,
            target: runtime.record.target
          },
          "Runtime run request accepted (placeholder execution)."
        );

        process.stdout.write(
          `Runtime "${runtime.record.name}" in ${scope.environment}/${scope.projectId} is ${
            options.dryRun ? "ready to run (dry-run)" : "marked as running"
          }.\n`
        );
        process.stdout.write(
          "Execution pipeline is a placeholder in this first pass; container orchestration wiring is next.\n"
        );

        span.setStatus({ code: SpanStatusCode.OK });
        return 0;
      } catch (error) {
        telemetry.commandErrors.add(1, {
          "acs.command.name": "run",
          "acs.environment": scopeEnvironment
        });

        if (error instanceof Error) {
          span.recordException(error);
          span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
          process.stderr.write(`${error.message}\n`);
        } else {
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: "Unknown runtime error."
          });
          process.stderr.write(`${String(error)}\n`);
        }

        logger.error({ err: error }, "Run command failed.");
        return 1;
      } finally {
        telemetry.commandDuration.record(performance.now() - startedAt, {
          "acs.command.name": "run"
        });
        span.end();
      }
    }
  );
}
