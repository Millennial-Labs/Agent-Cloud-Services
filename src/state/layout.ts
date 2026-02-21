import os from "node:os";
import path from "node:path";
import process from "node:process";

const DEFAULT_ACS_HOME_DIR = ".acs";

export interface StateLayout {
  homePath: string;
  authDir: string;
  environmentsDir: string;
  manifestPath: string;
  contextPath: string;
  organizationPath: string;
  credentialsPath: string;
  developmentDir: string;
  developmentEnvironmentPath: string;
  developmentProjectsDir: string;
  productionDir: string;
  productionEnvironmentPath: string;
  productionProjectsDir: string;
}

export function resolveACSHome(explicitHome?: string): string {
  if (explicitHome) {
    return path.resolve(explicitHome);
  }

  const envHome = process.env.ACS_HOME;
  if (envHome) {
    return path.resolve(envHome);
  }

  return path.join(os.homedir(), DEFAULT_ACS_HOME_DIR);
}

export function getStateLayout(explicitHome?: string): StateLayout {
  const homePath = resolveACSHome(explicitHome);
  const authDir = path.join(homePath, "auth");
  const environmentsDir = path.join(homePath, "environments");

  const developmentDir = path.join(environmentsDir, "development");
  const productionDir = path.join(environmentsDir, "production");

  return {
    homePath,
    authDir,
    environmentsDir,
    manifestPath: path.join(homePath, "manifest.json"),
    contextPath: path.join(homePath, "context.json"),
    organizationPath: path.join(authDir, "organization.json"),
    credentialsPath: path.join(authDir, "credentials.json"),
    developmentDir,
    developmentEnvironmentPath: path.join(developmentDir, "environment.json"),
    developmentProjectsDir: path.join(developmentDir, "projects"),
    productionDir,
    productionEnvironmentPath: path.join(productionDir, "environment.json"),
    productionProjectsDir: path.join(productionDir, "projects")
  };
}

export function getProjectDir(
  layout: StateLayout,
  environment: "development" | "production",
  projectId: string
): string {
  const projectsRoot =
    environment === "development"
      ? layout.developmentProjectsDir
      : layout.productionProjectsDir;

  return path.join(projectsRoot, projectId);
}

export function getProjectFilePath(
  layout: StateLayout,
  environment: "development" | "production",
  projectId: string
): string {
  return path.join(getProjectDir(layout, environment, projectId), "project.json");
}

export function getInstancesDir(
  layout: StateLayout,
  environment: "development" | "production",
  projectId: string
): string {
  return path.join(getProjectDir(layout, environment, projectId), "instances");
}

export function getRunsDir(
  layout: StateLayout,
  environment: "development" | "production",
  projectId: string
): string {
  return path.join(getProjectDir(layout, environment, projectId), "runs");
}
