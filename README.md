# Interactive Calendar

An interactive calendar with conflict detection, a best-time finder and a replan feature (CS-3810).

Production URL: _not deployed yet_

## Run locally

```bash
npm ci
npm run dev        # development server
npm test           # unit and integration tests (TZ=UTC)
npm run build      # type-check and production build into dist/
```

## Performance (T15)

`npm run test:perf` measures eleven runs of a full conflict sweep plus one facade slot search. `npm run bench` prints the Vitest benchmark report. Both use 5,000 events over 100 weeks from `mulberry32(7)` and a 60-minute task over the first four weeks; fixture setup is excluded from timing.

Local Windows run on 2026-10-26: **k = 183**, eleven-run median **1.201 ms** (target: under 100 ms). This is a local measurement; timings vary with hardware and background load.

## Documentation

- `docs/PROJECT_SCHEMA.md` — behaviour, requirements and business rules
- `docs/TECH_SPEC.md` — architecture, contracts and build plan
- `docs/TEST_PLAN.md` — test cases and demo scripts
- `docs/PROGRESS.md` — work-item status
