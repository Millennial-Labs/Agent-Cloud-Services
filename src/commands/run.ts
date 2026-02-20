import { performance } from "node:perf_hooks";

import { SpanStatusCode } from "@opentelemetry/api";

import { logger } from "../observability/logger";
import type { TelemetryContext } from "../observability/telemetry";
import { executeRuntime } from "../runtime/execute-runtime";
import type { ACSConfig, RuntimeTarget } from "../types/config";

export interface RunCommandOptions {
  name: string;
  target?: RuntimeTarget;
  dryRun: boolean;
}

export async function runCommand(
  options: RunCommandOptions,
  config: ACSConfig,
  telemetry: TelemetryContext
): Promise<number> {
  const target = options.target ?? config.runtime.target;
  const attributes = {
    "acs.command.name": "run",
    "acs.runtime.target": target
  };
  const startedAt = performance.now();

  telemetry.commandRuns.add(1, attributes);

  return telemetry.tracer.startActiveSpan(
    "acs.command.run",
    {
      attributes
    },
    async (span) => {
      try {
        await executeRuntime({
          name: options.name,
          target,
          dryRun: options.dryRun,
          config
        });

        span.setStatus({ code: SpanStatusCode.OK });
        return 0;
      } catch (error) {
        telemetry.commandErrors.add(1, attributes);

        if (error instanceof Error) {
          span.recordException(error);
          span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
        } else {
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: "Unknown runtime error."
          });
        }

        logger.error({ error, target }, "Run command failed.");
        return 1;
      } finally {
        telemetry.commandDuration.record(performance.now() - startedAt, attributes);
        span.end();
      }
    }
  );
}
