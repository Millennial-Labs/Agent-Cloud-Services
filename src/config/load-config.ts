import { access, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import YAML from "yaml";
import { z } from "zod";

import { logger } from "../observability/logger";
import { DEFAULT_CONFIG, type ACSConfig } from "../types/config";

const DEFAULT_CONFIG_FILE = "acs.config.yaml";

const RuntimeConfigSchema = z.object({
  target: z.enum(["local", "docker", "kubernetes"]),
  image: z.string().min(1).optional(),
  command: z.string().min(1),
  args: z.array(z.string()),
  kubernetes: z.object({
    namespace: z.string().min(1),
    context: z.string().min(1).optional()
  })
});

const ObservabilityConfigSchema = z.object({
  serviceName: z.string().min(1),
  serviceVersion: z.string().min(1),
  traces: z.object({
    enabled: z.boolean(),
    consoleExporter: z.boolean()
  }),
  metrics: z.object({
    enabled: z.boolean(),
    consoleExporter: z.boolean(),
    exportIntervalMillis: z.number().int().positive()
  })
});

const ConfigSchema = z.object({
  runtime: RuntimeConfigSchema,
  observability: ObservabilityConfigSchema
});

interface PartialConfig {
  runtime?: {
    target?: unknown;
    image?: unknown;
    command?: unknown;
    args?: unknown;
    kubernetes?: {
      namespace?: unknown;
      context?: unknown;
    };
  };
  observability?: {
    serviceName?: unknown;
    serviceVersion?: unknown;
    traces?: {
      enabled?: unknown;
      consoleExporter?: unknown;
    };
    metrics?: {
      enabled?: unknown;
      consoleExporter?: unknown;
      exportIntervalMillis?: unknown;
    };
  };
}

export async function loadConfig(configPath?: string): Promise<ACSConfig> {
  const resolvedPath = configPath
    ? path.resolve(process.cwd(), configPath)
    : path.resolve(process.cwd(), DEFAULT_CONFIG_FILE);
  const hasConfigFile = await fileExists(resolvedPath);

  if (!hasConfigFile) {
    if (configPath) {
      throw new Error(`Config file not found: ${resolvedPath}`);
    }

    logger.info(
      { configPath: DEFAULT_CONFIG_FILE },
      "No config file found. Using built-in defaults."
    );

    return {
      ...DEFAULT_CONFIG,
      runtime: {
        ...DEFAULT_CONFIG.runtime,
        args: [...DEFAULT_CONFIG.runtime.args],
        kubernetes: {
          ...DEFAULT_CONFIG.runtime.kubernetes
        }
      },
      observability: {
        ...DEFAULT_CONFIG.observability,
        traces: {
          ...DEFAULT_CONFIG.observability.traces
        },
        metrics: {
          ...DEFAULT_CONFIG.observability.metrics
        }
      }
    };
  }

  const yamlText = await readFile(resolvedPath, "utf8");
  const parsed = (YAML.parse(yamlText) ?? {}) as PartialConfig;

  const merged = {
    runtime: {
      target: parsed.runtime?.target ?? DEFAULT_CONFIG.runtime.target,
      image: parsed.runtime?.image ?? DEFAULT_CONFIG.runtime.image,
      command: parsed.runtime?.command ?? DEFAULT_CONFIG.runtime.command,
      args: parsed.runtime?.args ?? [...DEFAULT_CONFIG.runtime.args],
      kubernetes: {
        namespace:
          parsed.runtime?.kubernetes?.namespace ??
          DEFAULT_CONFIG.runtime.kubernetes.namespace,
        context:
          parsed.runtime?.kubernetes?.context ??
          DEFAULT_CONFIG.runtime.kubernetes.context
      }
    },
    observability: {
      serviceName:
        parsed.observability?.serviceName ??
        DEFAULT_CONFIG.observability.serviceName,
      serviceVersion:
        parsed.observability?.serviceVersion ??
        DEFAULT_CONFIG.observability.serviceVersion,
      traces: {
        enabled:
          parsed.observability?.traces?.enabled ??
          DEFAULT_CONFIG.observability.traces.enabled,
        consoleExporter:
          parsed.observability?.traces?.consoleExporter ??
          DEFAULT_CONFIG.observability.traces.consoleExporter
      },
      metrics: {
        enabled:
          parsed.observability?.metrics?.enabled ??
          DEFAULT_CONFIG.observability.metrics.enabled,
        consoleExporter:
          parsed.observability?.metrics?.consoleExporter ??
          DEFAULT_CONFIG.observability.metrics.consoleExporter,
        exportIntervalMillis:
          parsed.observability?.metrics?.exportIntervalMillis ??
          DEFAULT_CONFIG.observability.metrics.exportIntervalMillis
      }
    }
  };

  const validation = ConfigSchema.safeParse(merged);

  if (!validation.success) {
    const details = validation.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid config file (${resolvedPath}): ${details}`);
  }

  return validation.data;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
