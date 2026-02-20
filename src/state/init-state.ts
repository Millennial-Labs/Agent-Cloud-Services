import { randomBytes, randomUUID, createHash } from "node:crypto";
import { access, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  type ACSManifest,
  type CurrentContextRecord,
  type CredentialRecord,
  type EnvironmentRecord,
  type InitStateInput,
  type InitStateResult,
  type MachineProfile,
  type OrganizationRecord
} from "../types/state";
import { createDefaultProject, writeCurrentContext } from "./project-registry";
import { getStateLayout } from "./layout";

export async function initializeState(
  input: InitStateInput
): Promise<InitStateResult> {
  const layout = getStateLayout(input.homePath);
  const alreadyInitialized = await pathExists(layout.manifestPath);

  if (alreadyInitialized && !input.force) {
    throw new Error(
      `ACS is already initialized at ${layout.homePath}. Re-run with --force to reset.`
    );
  }

  if (alreadyInitialized && input.force) {
    await rm(layout.homePath, { recursive: true, force: true });
  }

  const createdAt = new Date().toISOString();
  const organizationId = `org_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
  const apiKey = createApiKey();
  const keyId = createKeyId(apiKey);

  const manifest: ACSManifest = {
    schemaVersion: 1,
    initializedAt: createdAt,
    organizationId
  };

  const organization: OrganizationRecord = {
    id: organizationId,
    name: input.orgName,
    keyId,
    createdAt
  };

  const credentials: CredentialRecord = {
    apiKey,
    createdAt
  };

  const developmentEnvironment: EnvironmentRecord = {
    name: "development",
    createdAt,
    defaultTarget: "docker",
    projectsDirectory: layout.developmentProjectsDir,
    defaultProjectId: "prj_default",
    resourcePolicy: {
      maxCpuPercent: 80,
      maxMemoryPercent: 80
    },
    machineProfile: captureMachineProfile(createdAt)
  };

  const productionEnvironment: EnvironmentRecord = {
    name: "production",
    createdAt,
    defaultTarget: "docker",
    projectsDirectory: layout.productionProjectsDir,
    defaultProjectId: "prj_default",
    resourcePolicy: {
      maxCpuPercent: 90,
      maxMemoryPercent: 90
    }
  };

  await mkdir(layout.authDir, { recursive: true, mode: 0o700 });
  await mkdir(layout.developmentProjectsDir, { recursive: true });
  await mkdir(layout.productionProjectsDir, { recursive: true });

  await writeJsonFile(layout.manifestPath, manifest);
  await writeJsonFile(layout.organizationPath, organization);
  await writeJsonFile(layout.developmentEnvironmentPath, developmentEnvironment);
  await writeJsonFile(layout.productionEnvironmentPath, productionEnvironment);
  await writeJsonFile(layout.credentialsPath, credentials, 0o600);
  await createDefaultProject(layout.homePath, "development", createdAt);
  await createDefaultProject(layout.homePath, "production", createdAt);

  const context: CurrentContextRecord = {
    environment: "production",
    projectId: "prj_default",
    updatedAt: createdAt
  };
  await writeCurrentContext(layout.homePath, context);

  await writeFile(path.join(layout.developmentProjectsDir, ".gitkeep"), "");
  await writeFile(path.join(layout.productionProjectsDir, ".gitkeep"), "");

  return {
    homePath: layout.homePath,
    organization,
    apiKey,
    overwritten: alreadyInitialized
  };
}

function captureMachineProfile(capturedAt: string): MachineProfile {
  const cpus = os.cpus();

  return {
    capturedAt,
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    release: os.release(),
    cpuCount: cpus.length,
    cpuModel: cpus[0]?.model ?? "unknown",
    totalMemoryBytes: os.totalmem(),
    freeMemoryBytes: os.freemem(),
    loadAverage1m: os.loadavg()[0] ?? 0
  };
}

function createApiKey(): string {
  return `acs_sk_${randomBytes(32).toString("base64url")}`;
}

function createKeyId(apiKey: string): string {
  const digest = createHash("sha256").update(apiKey).digest("hex");
  return `key_${digest.slice(0, 16)}`;
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function writeJsonFile(
  targetPath: string,
  value: unknown,
  mode?: number
): Promise<void> {
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  await writeFile(targetPath, serialized, mode ? { mode } : undefined);
}
