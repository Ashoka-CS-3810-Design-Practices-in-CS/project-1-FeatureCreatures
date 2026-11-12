# Sample calendar exports

These importable files use the test week beginning **Monday 2 November 2026**, in UTC. When importing in another time zone, the displayed wall-clock times follow that time zone. The app's **Load sample calendar** control instead builds samples for the current local week.

All six files use export format **version 2**, including the five default categories and the v3 data fields. The app also imports older v1 exports; a retained original fixture lives in `tests/fixtures/export-v1.json`.

| File | Events | Tasks | Purpose |
| --- | ---: | ---: | --- |
| [sparseWeek.json](sparseWeek.json) | 8 | 4 | One conflict, flexible events, lunch and scheduling tasks |
| [backToBack.json](backToBack.json) | 8 | 0 | Touching intervals produce no conflicts |
| [overlapCluster.json](overlapCluster.json) | 6 | 0 | Six overlapping events produce 15 pairs |
| [fullyBooked.json](fullyBooked.json) | 4 | 1 | A 30-minute task cannot fit the largest 15-minute gap |
| [midnight.json](midnight.json) | 2 | 0 | Conflict across midnight |
| [stress.json](stress.json) | 5,000 | 0 | Seed-42 stress calendar over 100 weeks |

To import, open **Settings → Data → Import JSON**, choose a file and confirm replacement. Navigate to the week of 2 November if necessary. Import replaces all events, tasks and settings and clears undo history; export your own calendar first.

Regenerate from the repository root with `npm run samples:export`. The script uses the source sample builders, validates every export and writes deterministic UTF-8 JSON with LF endings. The seed-7 T15 benchmark is separate from the seed-42 stress sample.
