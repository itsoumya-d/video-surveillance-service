# Video Surveillance Service

Production-oriented camera-fleet health backend for security and remote video
monitoring: sites, cameras, check-ins, offline/recording/storage/stale-frame
alerts, automatic resolution and audit.

## Why this exists

Remote video monitoring is only useful if the camera fleet is actually healthy.
The failure modes are concrete: a camera goes offline, recording stops, storage
fills, or the last frame goes stale. This service makes those checks explicit and
keeps an alert lifecycle instead of a dashboard of green ticks that lie.

## Stack

- TypeScript, Node.js, Fastify
- PostgreSQL (`pg`), SQL schema migration on boot
- Zod validation
- Vitest + `pg-mem` integration tests
- Multi-stage Dockerfile
- GitHub Actions CI

## Features

- Sites and cameras with retention days
- Check-ins with online, recording, storage percentage and last-frame time
- Alerts: offline, recording, storage >90%, stale frame >10 minutes
- No duplicate open alert per camera/kind
- Automatic resolution when the camera recovers
- Site health summary and open-alert list
- Activity trail
- Health probe and consistent 401/404/422 responses

## Run locally

```bash
npm install
DATABASE_URL=postgres://user:pass@localhost:5432/cameras API_KEY=dev-key npm run dev
```

## Test

```bash
npm test
npm run build
```

## Honest scope

This is a real, tested camera-health service, not a VMS or video pipeline. It
does not ingest RTSP/ONVIF streams, store footage, run object detection, or
integrate with a monitoring centre. The README does not claim production usage.
