export type RuntimeTarget = "docker" | "swarm";

export interface ACSConfig {
  runtime: {
    target: RuntimeTarget;
    image?: string;
    command: string;
    args: string[];
    swarm: {
      namespace: string;
      context?: string;
    };
  };
  observability: {
    serviceName: string;
    serviceVersion: string;
    traces: {
      enabled: boolean;
      consoleExporter: boolean;
    };
    metrics: {
      enabled: boolean;
      consoleExporter: boolean;
      exportIntervalMillis: number;
    };
  };
}

export const DEFAULT_CONFIG: ACSConfig = {
  runtime: {
    target: "docker",
    command: "echo",
    args: ["acs runtime started"],
    swarm: {
      namespace: "default"
    }
  },
  observability: {
    serviceName: "agent-cloud-services",
    serviceVersion: "0.1.0",
    traces: {
      enabled: true,
      consoleExporter: true
    },
    metrics: {
      enabled: true,
      consoleExporter: true,
      exportIntervalMillis: 10000
    }
  }
};
