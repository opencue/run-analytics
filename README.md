# OpenCue run analytics

Public opt-in client and private admin dashboard for aggregate GitGuardex and
Cue run statistics. [PostHog](https://github.com/PostHog/posthog) supplies
collection and storage separately from the Vercel dashboard. This repository
contains no instance credentials or real run data.

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
2. Deploy this repository to Vercel with a random secret of at least 24
   characters in the production `RUN_ANALYTICS_ADMIN_PASSWORD` environment
   variable. Bind `analytics.webu.hu` to the deployment, verify TLS, and confirm
   anonymous requests receive 401. The username is `admin`.
3. On Vercel only, configure `POSTHOG_ORIGIN` (the separate PostHog HTTPS
   origin), `POSTHOG_PROJECT_ID` and `POSTHOG_QUERY_KEY` (a project-scoped
   read-only key authorized to run queries), then redeploy. The dashboard uses
   [`overview.sql`](overview.sql) for 30-day run and failure counts, success rate,
   p50/p95 durations, and reported token totals with coverage. Missing token
   measurements are not zero usage. The dashboard is not a capture endpoint.

## Test the sender

```sh
node --test client.test.cjs admin.test.cjs
```

For a configured test or production project, set the following in the invoking
user's environment. There is no default host or project key in the client. Do
not set or persist these values for users who have not opted in.

```sh
export OPENCUE_RUN_ANALYTICS_HOST=https://posthog.example.org
export OPENCUE_RUN_ANALYTICS_PROJECT_KEY=phc_your_project_capture_key
export OPENCUE_RUN_ANALYTICS=1
```

Setting `OPENCUE_RUN_ANALYTICS=0` or `DO_NOT_TRACK=1` disables transmission.
Never put an admin API key in a CLI environment or in published source.
