# Agent Cloud Services CLI

`acs` is a Bun-managed TypeScript CLI for running agent harness runtimes in Docker and swarm modes with built-in observability.

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
  - Docker CLI for container execution
  - Swarm/orchestrator tooling (planned wiring)

## Install For Local Development

```bash
bun install
bun run build
bun link
acs init --org "your-org-name"
acs --help
```

`bun link` exposes the `acs` executable from this repo. Ensure `~/.bun/bin` is on your `PATH`.

## Install Once Published

```bash
bun add -g @your-org/agent-cloud-services
```

## Usage

```bash
acs init --org "acme"
acs create https://github.com/acme/my-harness
acs create https://github.com/acme/my-harness custom-name
acs run my-harness-1
acs create https://github.com/acme/a https://github.com/acme/b --env production --project prj_default
acs run my-harness-1 --env development --project prj_default --dry-run
```

## Configuration

If `./acs.config.yaml` exists, it is auto-loaded. You can also pass `--config <path>`.

Use `acs.config.example.yaml` as a starter file.

## Tenancy and State Model

`acs init` creates a tenancy root on your machine. Default path:

- `$ACS_HOME` if set
- otherwise `~/.acs`

On first init, ACS generates an organization identity + API key and creates separate development and production environment paths with isolated project directories.

```text
~/.acs/
  manifest.json
  context.json
  auth/
    organization.json
    credentials.json
  environments/
    development/
      environment.json
      projects/
        prj_default/
          project.json
          instances/
    production/
      environment.json
      projects/
        prj_default/
          project.json
          instances/
```

Notes:

- `development/environment.json` includes a captured local machine profile (CPU, memory, platform) for capacity-aware runtime decisions.
- `context.json` tracks the current environment/project for commands that do not specify overrides.
- On `acs init`, current context defaults to `production/prj_default` (override on commands via `--env` and `--project`).
- `production/environment.json` is separated for project-level deployment metadata and policies.
- `auth/credentials.json` contains the generated API key for this local installation.

## Observability Notes

- Logs are structured JSON to stdout.
- Traces are emitted via OpenTelemetry `ConsoleSpanExporter`.
- Metrics are emitted via OpenTelemetry `ConsoleMetricExporter`.

Set `ACS_OTEL_DIAG=debug` to enable OpenTelemetry diagnostic logs.
