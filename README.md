# Agent Cloud Services CLI

`acs` is a Bun-managed TypeScript CLI for running agent harness runtimes on local machines and production targets (Docker and Kubernetes) with built-in observability.

## Scaffold Includes

- Single-package CLI repository
- Executable command entrypoint (`acs`) via `package.json#bin`
- YAML-based configuration (`acs.config.yaml`)
- Structured JSON logs
- OpenTelemetry traces and metrics
- Process and host compute metrics (CPU, memory, load)

## Prerequisites

- Node.js 20+
- Bun 1.2+
- Optional runtime dependencies:
  - Docker CLI for `docker` target
  - `kubectl` with cluster access for `kubernetes` target

## Install For Local Development

```bash
bun install
bun run build
bun link
acs --help
```

`bun link` exposes the `acs` executable from this repo. Ensure `~/.bun/bin` is on your `PATH`.

## Install Once Published

```bash
bun add -g @your-org/agent-cloud-services
```

## Usage

```bash
acs run
acs run my-runtime --target local
acs run my-runtime --target docker --dry-run
acs run my-runtime --target kubernetes --config ./acs.config.yaml
```

## Configuration

If `./acs.config.yaml` exists, it is auto-loaded. You can also pass `--config <path>`.

Use `acs.config.example.yaml` as a starter file.

## Observability Notes

- Logs are structured JSON to stdout.
- Traces are emitted via OpenTelemetry `ConsoleSpanExporter`.
- Metrics are emitted via OpenTelemetry `ConsoleMetricExporter`.

Set `ACS_OTEL_DIAG=debug` to enable OpenTelemetry diagnostic logs.
