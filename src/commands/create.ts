import { logger } from "../observability/logger";
import { createRuntimeInstance, resolveProjectScope } from "../state/project-registry";
import type { EnvironmentName, RuntimeInstanceRecord } from "../types/state";

export interface CreateCommandOptions {
  name?: string;
  env?: EnvironmentName;
  project?: string;
  home?: string;
}

export async function createCommand(
  createInputs: string[],
  options: CreateCommandOptions
): Promise<number> {
  try {
    const parsed = parseCreateInputs(createInputs, options.name);
    const harnessSources = parsed.harnessSources;
    const explicitName = parsed.explicitName;

    if (harnessSources.length === 0) {
      process.stderr.write("At least one harness source is required.\n");
      return 1;
    }

    if (explicitName && harnessSources.length > 1) {
      process.stderr.write("--name can only be used when creating a single harness.\n");
      return 1;
    }

    const scope = await resolveProjectScope({
      homePath: options.home,
      environment: options.env,
      projectId: options.project
    });
    const target = harnessSources.length > 1 ? "swarm" : "docker";
    const created: RuntimeInstanceRecord[] = [];

    for (let index = 0; index < harnessSources.length; index += 1) {
      const source = harnessSources[index]!;
      const instance = await createRuntimeInstance(scope, {
        sourceUrl: source,
        name: index === 0 ? explicitName : undefined,
        target
      });
      created.push(instance);
    }

    logger.info(
      {
        environment: scope.environment,
        projectId: scope.projectId,
        createdCount: created.length,
        target
      },
      "Runtime instance records created."
    );

    process.stdout.write(
      `Created ${created.length} runtime instance(s) in ${scope.environment}/${scope.projectId}\n`
    );

    for (const instance of created) {
      process.stdout.write(
        `- ${instance.name} (${instance.id}) target=${instance.target} source=${instance.source.url}\n`
      );
    }

    process.stdout.write(
      "Execution is currently a placeholder; use `acs run <name>` to mark and simulate runtime start.\n"
    );

    return 0;
  } catch (error) {
    logger.error({ err: error }, "Failed to create runtime instances.");
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    return 1;
  }
}

function parseCreateInputs(
  inputs: string[],
  explicitNameFromOption?: string
): { harnessSources: string[]; explicitName?: string } {
  if (inputs.length === 0) {
    return { harnessSources: [], explicitName: explicitNameFromOption };
  }

  if (explicitNameFromOption) {
    return {
      harnessSources: inputs,
      explicitName: explicitNameFromOption
    };
  }

  if (inputs.length >= 2) {
    const maybeName = inputs.at(-1)!;
    const maybeSources = inputs.slice(0, -1);

    if (maybeSources.every(isLikelyUrl) && !isLikelyUrl(maybeName)) {
      if (maybeSources.length === 1) {
        return {
          harnessSources: maybeSources,
          explicitName: maybeName
        };
      }

      throw new Error(
        "Ambiguous create input: explicit names are only supported for single harness creation."
      );
    }
  }

  return { harnessSources: inputs };
}

function isLikelyUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}
