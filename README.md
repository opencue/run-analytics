# OpenCue run analytics

Public client and dashboard queries for aggregate GitGuardex and Cue run
statistics. [PostHog](https://github.com/PostHog/posthog) supplies the
collection, storage, login, and dashboard; this repository contains no
instance credentials, real run data, or alternate analytics server.

## Data contract

After a separately opted-in run completes, the client can send its product,
operation, success/failure, duration in milliseconds and, if available, a
fixed provider label and numeric input/output token totals. Released
integrations must not send prompts, source code, diffs, arguments, repository
names, paths, logs, session identifiers, usernames, or emails. A fresh random
identifier labels each event without linking events from the same installation.
PostHog is asked not to build a person profile or apply IP-derived geolocation;
the host and reverse proxy still see the connection's IP. Do not retain ingest
access logs or enable additional enrichment for the analytics endpoint.

The sender has no local upload backlog, retry, or history importer. Cue's
existing local telemetry consent does **not** grant permission for uploads.
Counts cover only participating clients with successful delivery. A capture
project key is for writes only and does not authenticate end users: these
statistics are advisory, not trustworthy for billing or authorization.

## Administration

1. Set up an owner account on a dedicated [self-hosted PostHog instance](https://posthog.com/docs/self-host)
   before exposing it publicly. Put it behind HTTPS. Restrict account signup
   and use an invite-only project. Apply rate and body-size limits to the
   public capture route, and set a retention policy for raw events and backups.
2. Bind `analytics.webu.hu` at the deployment and configure its DNS. Verify
   TLS and that anonymous dashboard access is denied. Do not publish or embed
   a public dashboard link.
3. In the private project, save [`overview.sql`](overview.sql) as a SQL insight
   and pin it to a dashboard. It shows 30-day run counts, failures, success
   rate, p50/p95 durations, and reported token totals with their coverage.
   Missing token metrics do not mean zero usage.

## Test the sender

```sh
node --test client.test.cjs
```

For a configured test or production project, set the following in the invoking
user's environment. There is no default host or project key in the client. Do
not set or persist these values for users who have not opted in.

```sh
export OPENCUE_RUN_ANALYTICS_HOST=https://analytics.webu.hu
export OPENCUE_RUN_ANALYTICS_PROJECT_KEY=phc_your_project_capture_key
export OPENCUE_RUN_ANALYTICS=1
```

Setting `OPENCUE_RUN_ANALYTICS=0` or `DO_NOT_TRACK=1` disables transmission.
Never put an admin API key in a CLI environment or in published source.
