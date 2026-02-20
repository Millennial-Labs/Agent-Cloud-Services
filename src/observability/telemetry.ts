import os from "node:os";
import process from "node:process";

import {
  diag,
  DiagConsoleLogger,
  DiagLogLevel,
  metrics,
  trace,
  type Counter,
  type Histogram,
  type Meter,
  type Tracer
} from "@opentelemetry/api";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  ConsoleMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader
} from "@opentelemetry/sdk-metrics";
import {
  BatchSpanProcessor,
  ConsoleSpanExporter
} from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION
} from "@opentelemetry/semantic-conventions";

import type { ACSConfig } from "../types/config";
import { logger } from "./logger";

export interface TelemetryContext {
  tracer: Tracer;
  meter: Meter;
  commandRuns: Counter;
  commandErrors: Counter;
  commandDuration: Histogram;
  shutdown: () => Promise<void>;
}

export function initTelemetry(
  observabilityConfig: ACSConfig["observability"]
): TelemetryContext {
  const diagLevel =
    process.env.ACS_OTEL_DIAG?.toLowerCase() === "debug"
      ? DiagLogLevel.DEBUG
      : DiagLogLevel.ERROR;

  diag.setLogger(new DiagConsoleLogger(), diagLevel);

  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: observabilityConfig.serviceName,
    [ATTR_SERVICE_VERSION]: observabilityConfig.serviceVersion,
    "service.namespace": "your-org"
  });

  let tracerProvider: NodeTracerProvider | undefined;

  if (observabilityConfig.traces.enabled) {
    const spanProcessors = observabilityConfig.traces.consoleExporter
      ? [new BatchSpanProcessor(new ConsoleSpanExporter())]
      : [];

    tracerProvider = new NodeTracerProvider({
      resource,
      spanProcessors
    });
    tracerProvider.register();
  }

  let meterProvider: MeterProvider | undefined;

  if (observabilityConfig.metrics.enabled) {
    const readers = observabilityConfig.metrics.consoleExporter
      ? [
          new PeriodicExportingMetricReader({
            exporter: new ConsoleMetricExporter(),
            exportIntervalMillis:
              observabilityConfig.metrics.exportIntervalMillis
          })
        ]
      : [];

    meterProvider = new MeterProvider({
      resource,
      readers
    });
    metrics.setGlobalMeterProvider(meterProvider);
  }

  const tracer = trace.getTracer("acs-cli", observabilityConfig.serviceVersion);
  const meter = metrics.getMeter("acs-cli", observabilityConfig.serviceVersion);

  const commandRuns = meter.createCounter("acs.command.runs", {
    description: "Number of CLI command executions."
  });
  const commandErrors = meter.createCounter("acs.command.errors", {
    description: "Number of CLI command failures."
  });
  const commandDuration = meter.createHistogram("acs.command.duration.ms", {
    description: "Duration of CLI command execution.",
    unit: "ms"
  });

  registerRuntimeResourceMetrics(meter);

  return {
    tracer,
    meter,
    commandRuns,
    commandErrors,
    commandDuration,
    shutdown: async () => {
      const shutdownResults = await Promise.allSettled([
        meterProvider?.shutdown(),
        tracerProvider?.shutdown()
      ]);

      for (const result of shutdownResults) {
        if (result.status === "rejected") {
          logger.warn({ error: result.reason }, "Telemetry shutdown failed");
        }
      }
    }
  };
}

function registerRuntimeResourceMetrics(meter: Meter): void {
  const defaultAttributes = {
    "process.pid": process.pid
  };

  const processRssGauge = meter.createObservableGauge(
    "acs.process.memory.rss",
    {
      description: "Resident memory used by the acs process.",
      unit: "By"
    }
  );
  processRssGauge.addCallback((result) => {
    result.observe(process.memoryUsage().rss, defaultAttributes);
  });

  const processCpuUserGauge = meter.createObservableGauge(
    "acs.process.cpu.user",
    {
      description: "User CPU time consumed by the acs process.",
      unit: "us"
    }
  );
  processCpuUserGauge.addCallback((result) => {
    result.observe(process.cpuUsage().user, defaultAttributes);
  });

  const processCpuSystemGauge = meter.createObservableGauge(
    "acs.process.cpu.system",
    {
      description: "System CPU time consumed by the acs process.",
      unit: "us"
    }
  );
  processCpuSystemGauge.addCallback((result) => {
    result.observe(process.cpuUsage().system, defaultAttributes);
  });

  const hostLoadOneMinuteGauge = meter.createObservableGauge(
    "acs.system.load.1m",
    {
      description: "Host one-minute load average."
    }
  );
  hostLoadOneMinuteGauge.addCallback((result) => {
    result.observe(os.loadavg()[0] ?? 0);
  });

  const hostMemoryFreeGauge = meter.createObservableGauge(
    "acs.system.memory.free",
    {
      description: "Host free memory.",
      unit: "By"
    }
  );
  hostMemoryFreeGauge.addCallback((result) => {
    result.observe(os.freemem());
  });

  const hostMemoryTotalGauge = meter.createObservableGauge(
    "acs.system.memory.total",
    {
      description: "Host total memory.",
      unit: "By"
    }
  );
  hostMemoryTotalGauge.addCallback((result) => {
    result.observe(os.totalmem());
  });

  const hostCpuCountGauge = meter.createObservableGauge("acs.system.cpu.count", {
    description: "Host CPU core count."
  });
  hostCpuCountGauge.addCallback((result) => {
    result.observe(os.cpus().length);
  });
}
