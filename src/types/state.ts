import type { RuntimeTarget } from "./config";

export type EnvironmentName = "development" | "production";

export interface ACSManifest {
  schemaVersion: number;
  initializedAt: string;
  organizationId: string;
}

export interface OrganizationRecord {
  id: string;
  name: string;
  keyId: string;
  createdAt: string;
}

export interface CredentialRecord {
  apiKey: string;
  createdAt: string;
}

export interface MachineProfile {
  capturedAt: string;
  hostname: string;
  platform: NodeJS.Platform;
  arch: string;
  release: string;
  cpuCount: number;
  cpuModel: string;
  totalMemoryBytes: number;
  freeMemoryBytes: number;
  loadAverage1m: number;
}

export interface EnvironmentRecord {
  name: EnvironmentName;
  createdAt: string;
  defaultTarget: RuntimeTarget;
  projectsDirectory: string;
  defaultProjectId: string;
  resourcePolicy: {
    maxCpuPercent: number;
    maxMemoryPercent: number;
  };
  machineProfile?: MachineProfile;
}

export interface ProjectRecord {
  id: string;
  name: string;
  environment: EnvironmentName;
  createdAt: string;
  updatedAt: string;
  runtimeCount: number;
}

export interface CurrentContextRecord {
  environment: EnvironmentName;
  projectId: string;
  updatedAt: string;
}

export type RuntimeInstanceStatus = "created" | "running" | "stopped" | "error";

export interface RuntimeInstanceRecord {
  id: string;
  name: string;
  environment: EnvironmentName;
  projectId: string;
  target: RuntimeTarget;
  source: {
    type: "github";
    url: string;
    repository: string;
  };
  status: RuntimeInstanceStatus;
  running: boolean;
  createdAt: string;
  updatedAt: string;
  runCount: number;
  lastRunAt?: string;
}

export type RunRecordStatus = "queued" | "running" | "completed" | "failed";

export interface RunRecord {
  id: string;
  instanceId: string;
  instanceName: string;
  environment: EnvironmentName;
  projectId: string;
  target: RuntimeTarget;
  sourceUrl: string;
  status: RunRecordStatus;
  dryRun: boolean;
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  message?: string;
}

export interface InitStateInput {
  orgName: string;
  homePath?: string;
  force: boolean;
}

export interface InitStateResult {
  homePath: string;
  organization: OrganizationRecord;
  apiKey: string;
  overwritten: boolean;
}
