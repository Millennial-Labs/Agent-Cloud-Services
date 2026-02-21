import { getStateLayout } from "../state/layout";
import {
  findRunById,
  getProjectRecord,
  listEnvironmentRecords,
  listProjectRecords,
  listRunRecords,
  listRuntimeInstances,
  readContextRecord,
  readEnvironmentRecord,
  readManifestRecord,
  readOrganizationRecord,
  resolveProjectScope,
  writeCurrentContext
} from "../state/project-registry";
import type { DetailLevel, DisplayOptions } from "../types/output";
import type {
  CurrentContextRecord,
  EnvironmentName,
  EnvironmentRecord,
  ProjectRecord,
  RunRecord,
  RuntimeInstanceRecord
} from "../types/state";
import { emitOutput } from "../utils/output";

interface BaseQueryOptions extends DisplayOptions {
  home?: string;
}

interface ScopedQueryOptions extends BaseQueryOptions {
  env?: EnvironmentName;
  project?: string;
}

interface ContextSetOptions {
  env: EnvironmentName;
  project: string;
  home?: string;
}

export async function statusCommand(options: BaseQueryOptions): Promise<number> {
  try {
    const [manifest, organization, context] = await Promise.all([
      readManifestRecord(options.home),
      readOrganizationRecord(options.home),
      readContextRecord(options.home)
    ]);
    const scope = await resolveProjectScope({
      homePath: options.home,
      environment: context.environment,
      projectId: context.projectId
    });
    const [environments, instances, runs] = await Promise.all([
      listEnvironmentRecords(options.home),
      listRuntimeInstances(scope),
      listRunRecords(scope)
    ]);
    const runningCount = instances.filter(
      (item) => item.record.status === "running"
    ).length;
    const recentRun = runs[0]?.record;

    const payload = {
      organization: {
        id: organization.id,
        name: organization.name,
        keyId: organization.keyId
      },
      manifest: {
        schemaVersion: manifest.schemaVersion,
        initializedAt: manifest.initializedAt
      },
      context,
      environmentCount: environments.length,
      currentProject: {
        id: scope.project.id,
        name: scope.project.name,
        runtimeCount: scope.project.runtimeCount
      },
      instances: {
        total: instances.length,
        running: runningCount
      },
      recentRun
    };

    emitOutput(payload, options, (data, detail) => {
      const lines = [
        `Organization: ${data.organization.name} (${data.organization.id})`,
        `Context: ${data.context.environment}/${data.context.projectId}`,
        `Instances: ${data.instances.total} total, ${data.instances.running} running`
      ];

      if (detail !== "concise") {
        lines.push(`Schema: v${data.manifest.schemaVersion}`);
        lines.push(`Initialized: ${data.manifest.initializedAt}`);
        lines.push(`Key ID: ${data.organization.keyId}`);
      }

      if (detail === "full" && data.recentRun) {
        lines.push(
          `Recent run: ${data.recentRun.id} (${data.recentRun.instanceName}) status=${data.recentRun.status}`
        );
      }

      return lines;
    });
    return 0;
  } catch (error) {
    return printCommandError(error);
  }
}

export async function orgShowCommand(options: BaseQueryOptions): Promise<number> {
  try {
    const [manifest, organization] = await Promise.all([
      readManifestRecord(options.home),
      readOrganizationRecord(options.home)
    ]);
    const layout = getStateLayout(options.home);

    const payload = {
      id: organization.id,
      name: organization.name,
      keyId: organization.keyId,
      initializedAt: manifest.initializedAt,
      schemaVersion: manifest.schemaVersion,
      homePath: layout.homePath
    };

    emitOutput(payload, options, (data, detail) => {
      const lines = [`${data.name} (${data.id})`];
      if (detail !== "concise") {
        lines.push(`Key ID: ${data.keyId}`);
        lines.push(`Home: ${data.homePath}`);
      }
      if (detail === "full") {
        lines.push(`Schema version: ${data.schemaVersion}`);
        lines.push(`Initialized at: ${data.initializedAt}`);
      }
      return lines;
    });
    return 0;
  } catch (error) {
    return printCommandError(error);
  }
}

export async function contextShowCommand(
  options: BaseQueryOptions
): Promise<number> {
  try {
    const context = await readContextRecord(options.home);
    emitOutput(context, options, (data, detail) => {
      const lines = [`${data.environment}/${data.projectId}`];
      if (detail !== "concise") {
        lines.push(`Updated: ${data.updatedAt}`);
      }
      return lines;
    });
    return 0;
  } catch (error) {
    return printCommandError(error);
  }
}

export async function contextSetCommand(
  options: ContextSetOptions
): Promise<number> {
  try {
    const project = await getProjectRecord(options.env, options.project, options.home);
    if (!project) {
      throw new Error(
        `Project "${options.project}" does not exist in "${options.env}".`
      );
    }

    const nextContext: CurrentContextRecord = {
      environment: options.env,
      projectId: options.project,
      updatedAt: new Date().toISOString()
    };
    await writeCurrentContext(getStateLayout(options.home).homePath, nextContext);

    process.stdout.write(
      `Current context set to ${nextContext.environment}/${nextContext.projectId}\n`
    );
    return 0;
  } catch (error) {
    return printCommandError(error);
  }
}

export async function envListCommand(options: BaseQueryOptions): Promise<number> {
  try {
    const environments = await listEnvironmentRecords(options.home);
    emitOutput(environments, options, (data, detail) =>
      renderEnvironmentList(data, detail)
    );
    return 0;
  } catch (error) {
    return printCommandError(error);
  }
}

export async function envShowCommand(
  environment: EnvironmentName,
  options: BaseQueryOptions
): Promise<number> {
  try {
    const record = await readEnvironmentRecord(environment, options.home);
    emitOutput(record, options, (data, detail) =>
      renderEnvironmentDetails(data, detail)
    );
    return 0;
  } catch (error) {
    return printCommandError(error);
  }
}

export async function projectListCommand(
  options: BaseQueryOptions & { env?: EnvironmentName }
): Promise<number> {
  try {
    const targetEnvironments = options.env
      ? [options.env]
      : (["development", "production"] as const);
    const grouped: Record<EnvironmentName, ProjectRecord[]> = {
      development: [],
      production: []
    };

    for (const env of targetEnvironments) {
      grouped[env] = await listProjectRecords(env, options.home);
    }

    emitOutput(grouped, options, (data, detail) => {
      const lines: string[] = [];

      for (const env of Object.keys(data) as EnvironmentName[]) {
        const projects = data[env];
        if (projects.length === 0) {
          continue;
        }

        lines.push(`[${env}]`);
        for (const project of projects) {
          if (detail === "concise") {
            lines.push(`- ${project.id} (${project.name})`);
          } else {
            lines.push(
              `- ${project.id} (${project.name}) runtimes=${project.runtimeCount} updated=${project.updatedAt}`
            );
          }
        }
      }

      return lines.length > 0 ? lines : ["No projects found."];
    });

    return 0;
  } catch (error) {
    return printCommandError(error);
  }
}

export async function projectShowCommand(
  projectId: string,
  options: BaseQueryOptions & { env?: EnvironmentName }
): Promise<number> {
  try {
    const context = await readContextRecord(options.home);
    const environment = options.env ?? context.environment;
    const scope = await resolveProjectScope({
      homePath: options.home,
      environment,
      projectId
    });
    const instances = await listRuntimeInstances(scope);
    const runningCount = instances.filter(
      (item) => item.record.status === "running"
    ).length;

    const payload = {
      ...scope.project,
      activeContext: `${context.environment}/${context.projectId}`,
      runtimeCount: instances.length,
      runningCount
    };

    emitOutput(payload, options, (data, detail) => {
      const lines = [`${data.id} (${data.name}) [${data.environment}]`];
      lines.push(`Runtimes: ${data.runtimeCount} total, ${data.runningCount} running`);
      if (detail !== "concise") {
        lines.push(`Created: ${data.createdAt}`);
        lines.push(`Updated: ${data.updatedAt}`);
      }
      if (detail === "full") {
        lines.push(`Active context: ${data.activeContext}`);
      }
      return lines;
    });
    return 0;
  } catch (error) {
    return printCommandError(error);
  }
}

export async function projectUseCommand(
  projectId: string,
  options: { env?: EnvironmentName; home?: string }
): Promise<number> {
  try {
    const current = await readContextRecord(options.home);
    const environment = options.env ?? current.environment;
    const project = await getProjectRecord(environment, projectId, options.home);
    if (!project) {
      throw new Error(`Project "${projectId}" does not exist in "${environment}".`);
    }

    const nextContext: CurrentContextRecord = {
      environment,
      projectId,
      updatedAt: new Date().toISOString()
    };
    await writeCurrentContext(getStateLayout(options.home).homePath, nextContext);
    process.stdout.write(
      `Current context set to ${nextContext.environment}/${nextContext.projectId}\n`
    );
    return 0;
  } catch (error) {
    return printCommandError(error);
  }
}

export async function instanceListCommand(
  options: ScopedQueryOptions
): Promise<number> {
  try {
    const scope = await resolveProjectScope({
      homePath: options.home,
      environment: options.env,
      projectId: options.project
    });
    const records = await listRuntimeInstances(scope);

    const payload = {
      context: `${scope.environment}/${scope.projectId}`,
      instances: records.map((item) => item.record)
    };

    emitOutput(payload, options, (data, detail) => {
      const lines = [`Using context: ${data.context}`];
      if (data.instances.length === 0) {
        lines.push("No instances found.");
        return lines;
      }

      for (const instance of data.instances) {
        lines.push(renderInstanceLine(instance, detail));
      }
      return lines;
    });
    return 0;
  } catch (error) {
    return printCommandError(error);
  }
}

export async function instanceShowCommand(
  instanceName: string,
  options: ScopedQueryOptions
): Promise<number> {
  try {
    const scope = await resolveProjectScope({
      homePath: options.home,
      environment: options.env,
      projectId: options.project
    });
    const record = await listRuntimeInstances(scope).then((items) =>
      items.find((item) => item.record.name === instanceName)
    );
    if (!record) {
      throw new Error(
        `Instance "${instanceName}" does not exist in ${scope.environment}/${scope.projectId}.`
      );
    }

    emitOutput(record.record, options, (data, detail) => {
      const lines = [
        `${data.name} (${data.id})`,
        `Status: ${data.status} target=${data.target}`
      ];
      if (detail !== "concise") {
        lines.push(`Source: ${data.source.url}`);
        lines.push(`Runs: ${data.runCount}`);
      }
      if (detail === "full") {
        lines.push(`Created: ${data.createdAt}`);
        lines.push(`Updated: ${data.updatedAt}`);
        lines.push(`Last run: ${data.lastRunAt ?? "never"}`);
      }
      return lines;
    });
    return 0;
  } catch (error) {
    return printCommandError(error);
  }
}

export async function runListCommand(options: ScopedQueryOptions): Promise<number> {
  try {
    const scope = await resolveProjectScope({
      homePath: options.home,
      environment: options.env,
      projectId: options.project
    });
    const runs = await listRunRecords(scope);

    const payload = {
      context: `${scope.environment}/${scope.projectId}`,
      runs: runs.map((item) => item.record)
    };

    emitOutput(payload, options, (data, detail) => {
      const lines = [`Using context: ${data.context}`];
      if (data.runs.length === 0) {
        lines.push("No run records found.");
        return lines;
      }

      for (const run of data.runs) {
        lines.push(renderRunLine(run, detail));
      }
      return lines;
    });

    return 0;
  } catch (error) {
    return printCommandError(error);
  }
}

export async function runShowCommand(
  runId: string,
  options: ScopedQueryOptions
): Promise<number> {
  try {
    const scope = await resolveProjectScope({
      homePath: options.home,
      environment: options.env,
      projectId: options.project
    });
    const run = await findRunById(scope, runId);
    if (!run) {
      throw new Error(
        `Run "${runId}" does not exist in ${scope.environment}/${scope.projectId}.`
      );
    }

    emitOutput(run.record, options, (data, detail) => {
      const lines = [
        `${data.id} instance=${data.instanceName}`,
        `Status: ${data.status} dryRun=${data.dryRun ? "yes" : "no"}`
      ];
      if (detail !== "concise") {
        lines.push(`Started: ${data.startedAt}`);
        lines.push(`Ended: ${data.endedAt ?? "n/a"}`);
        lines.push(`Duration ms: ${data.durationMs ?? "n/a"}`);
      }
      if (detail === "full") {
        lines.push(`Environment: ${data.environment}`);
        lines.push(`Project: ${data.projectId}`);
        lines.push(`Target: ${data.target}`);
        lines.push(`Source: ${data.sourceUrl}`);
        lines.push(`Message: ${data.message ?? ""}`);
      }
      return lines;
    });
    return 0;
  } catch (error) {
    return printCommandError(error);
  }
}

function renderEnvironmentList(
  records: EnvironmentRecord[],
  detail: DetailLevel
): string[] {
  const lines: string[] = [];
  for (const record of records) {
    if (detail === "concise") {
      lines.push(`${record.name} target=${record.defaultTarget}`);
    } else {
      lines.push(
        `${record.name} target=${record.defaultTarget} project=${record.defaultProjectId} created=${record.createdAt}`
      );
    }
  }
  return lines;
}

function renderEnvironmentDetails(
  record: EnvironmentRecord,
  detail: DetailLevel
): string[] {
  const lines = [
    `${record.name}`,
    `Default target: ${record.defaultTarget}`,
    `Default project: ${record.defaultProjectId}`
  ];
  if (detail !== "concise") {
    lines.push(
      `Resource policy: cpu<=${record.resourcePolicy.maxCpuPercent}% mem<=${record.resourcePolicy.maxMemoryPercent}%`
    );
  }
  if (detail === "full" && record.machineProfile) {
    lines.push(
      `Machine profile: ${record.machineProfile.hostname} ${record.machineProfile.platform}/${record.machineProfile.arch}`
    );
    lines.push(
      `Machine capacity: cpu=${record.machineProfile.cpuCount} totalMem=${record.machineProfile.totalMemoryBytes}`
    );
  }
  return lines;
}

function renderInstanceLine(
  instance: RuntimeInstanceRecord,
  detail: DetailLevel
): string {
  if (detail === "concise") {
    return `${instance.name} status=${instance.status} target=${instance.target}`;
  }
  if (detail === "standard") {
    return `${instance.name} status=${instance.status} target=${instance.target} runs=${instance.runCount} updated=${instance.updatedAt}`;
  }
  return `${instance.name} (${instance.id}) status=${instance.status} target=${instance.target} source=${instance.source.url} runs=${instance.runCount} lastRun=${instance.lastRunAt ?? "never"}`;
}

function renderRunLine(run: RunRecord, detail: DetailLevel): string {
  if (detail === "concise") {
    return `${run.id} instance=${run.instanceName} status=${run.status}`;
  }
  if (detail === "standard") {
    return `${run.id} instance=${run.instanceName} status=${run.status} started=${run.startedAt}`;
  }
  return `${run.id} instance=${run.instanceName} status=${run.status} target=${run.target} dryRun=${run.dryRun ? "yes" : "no"} durationMs=${run.durationMs ?? "n/a"} source=${run.sourceUrl}`;
}

function printCommandError(error: unknown): number {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  return 1;
}
