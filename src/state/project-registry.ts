import { randomUUID } from "node:crypto";
import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  type CurrentContextRecord,
  type EnvironmentName,
  type ProjectRecord,
  type RuntimeInstanceRecord
} from "../types/state";
import { getInstancesDir, getProjectDir, getProjectFilePath, getStateLayout } from "./layout";

export interface ProjectScope {
  homePath: string;
  context: CurrentContextRecord;
  environment: EnvironmentName;
  projectId: string;
  project: ProjectRecord;
  instancesDir: string;
}

export interface ResolveScopeInput {
  homePath?: string;
  environment?: EnvironmentName;
  projectId?: string;
}

export interface CreateRuntimeInstanceInput {
  sourceUrl: string;
  name?: string;
  target: "docker" | "swarm";
}

export interface RuntimeRecordWithPath {
  filePath: string;
  record: RuntimeInstanceRecord;
}

export async function resolveProjectScope(
  input: ResolveScopeInput
): Promise<ProjectScope> {
  const layout = getStateLayout(input.homePath);

  if (!(await pathExists(layout.manifestPath))) {
    throw new Error("ACS is not initialized. Run `acs init` first.");
  }

  if (!(await pathExists(layout.contextPath))) {
    throw new Error(
      "ACS context was not found. Re-run `acs init --force` to refresh local state."
    );
  }

  const context = await readJson<CurrentContextRecord>(layout.contextPath);
  const environment = input.environment ?? context.environment;
  const projectId = input.projectId ?? context.projectId;
  const projectPath = getProjectFilePath(layout, environment, projectId);

  if (!(await pathExists(projectPath))) {
    throw new Error(
      `Project "${projectId}" was not found in "${environment}". Use --env/--project overrides or create the project first.`
    );
  }

  const project = await readJson<ProjectRecord>(projectPath);
  const instancesDir = getInstancesDir(layout, environment, projectId);
  await mkdir(instancesDir, { recursive: true });

  return {
    homePath: layout.homePath,
    context,
    environment,
    projectId,
    project,
    instancesDir
  };
}

export async function createDefaultProject(
  homePath: string,
  environment: EnvironmentName,
  createdAt: string,
  projectId = "prj_default",
  projectName = "default"
): Promise<ProjectRecord> {
  const layout = getStateLayout(homePath);
  const projectDir = getProjectDir(layout, environment, projectId);
  const instancesDir = getInstancesDir(layout, environment, projectId);

  await mkdir(projectDir, { recursive: true });
  await mkdir(instancesDir, { recursive: true });

  const record: ProjectRecord = {
    id: projectId,
    name: projectName,
    environment,
    createdAt,
    updatedAt: createdAt,
    runtimeCount: 0
  };

  await writeJson(getProjectFilePath(layout, environment, projectId), record);

  return record;
}

export async function writeCurrentContext(
  homePath: string,
  context: CurrentContextRecord
): Promise<void> {
  const layout = getStateLayout(homePath);
  await writeJson(layout.contextPath, context);
}

export async function createRuntimeInstance(
  scope: ProjectScope,
  input: CreateRuntimeInstanceInput
): Promise<RuntimeInstanceRecord> {
  const existing = await listRuntimeInstances(scope);
  const existingNames = new Set(existing.map((item) => item.record.name));
  const derivedRepository = parseRepositoryName(input.sourceUrl);
  const baseName = input.name ? sanitizeName(input.name) : sanitizeName(derivedRepository);

  if (!baseName) {
    throw new Error("Could not derive a valid runtime name from source. Provide --name.");
  }

  let runtimeName = baseName;

  if (!input.name) {
    runtimeName = findNextAutoName(baseName, existingNames);
  } else if (existingNames.has(baseName)) {
    throw new Error(
      `Runtime instance "${baseName}" already exists in ${scope.environment}/${scope.projectId}.`
    );
  }

  const now = new Date().toISOString();
  const record: RuntimeInstanceRecord = {
    id: `rtm_${randomUUID().replaceAll("-", "").slice(0, 16)}`,
    name: runtimeName,
    environment: scope.environment,
    projectId: scope.projectId,
    target: input.target,
    source: {
      type: "github",
      url: input.sourceUrl,
      repository: derivedRepository
    },
    status: "created",
    running: false,
    createdAt: now,
    updatedAt: now,
    runCount: 0
  };

  await writeJson(path.join(scope.instancesDir, `${record.id}.json`), record);
  await updateProjectRuntimeCount(scope);

  return record;
}

export async function findRuntimeByName(
  scope: ProjectScope,
  name: string
): Promise<RuntimeRecordWithPath | undefined> {
  const all = await listRuntimeInstances(scope);
  return all.find((item) => item.record.name === name);
}

export async function saveRuntimeRecord(
  filePath: string,
  record: RuntimeInstanceRecord
): Promise<void> {
  await writeJson(filePath, record);
}

export async function listRuntimeInstances(
  scope: Pick<ProjectScope, "instancesDir">
): Promise<RuntimeRecordWithPath[]> {
  const entries = await readdir(scope.instancesDir, { withFileTypes: true });
  const output: RuntimeRecordWithPath[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue;
    }

    const filePath = path.join(scope.instancesDir, entry.name);
    const record = await readJson<RuntimeInstanceRecord>(filePath);
    output.push({ filePath, record });
  }

  return output;
}

async function updateProjectRuntimeCount(scope: ProjectScope): Promise<void> {
  const entries = await listRuntimeInstances(scope);
  const nextProject: ProjectRecord = {
    ...scope.project,
    runtimeCount: entries.length,
    updatedAt: new Date().toISOString()
  };

  const layout = getStateLayout(scope.homePath);
  await writeJson(
    getProjectFilePath(layout, scope.environment, scope.projectId),
    nextProject
  );
}

function findNextAutoName(baseName: string, existingNames: Set<string>): string {
  let suffix = 1;
  let candidate = `${baseName}-${suffix}`;

  while (existingNames.has(candidate)) {
    suffix += 1;
    candidate = `${baseName}-${suffix}`;
  }

  return candidate;
}

function parseRepositoryName(sourceUrl: string): string {
  try {
    const parsed = new URL(sourceUrl);
    const segments = parsed.pathname.split("/").filter(Boolean);
    if (segments.length >= 2) {
      return segments[1]?.replace(/\.git$/i, "") ?? "harness";
    }
  } catch {
    // no-op
  }

  const fallback = sourceUrl.split("/").filter(Boolean).at(-1) ?? "harness";
  return fallback.replace(/\.git$/i, "");
}

function sanitizeName(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readJson<T>(targetPath: string): Promise<T> {
  const raw = await readFile(targetPath, "utf8");
  return JSON.parse(raw) as T;
}

async function writeJson(targetPath: string, value: unknown): Promise<void> {
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  await writeFile(targetPath, serialized);
}
