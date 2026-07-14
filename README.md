# Errand Scheduler

A mobile-style errand scheduler with urgency-colored cards, implemented in React + TypeScript + Vite from the Claude Design handoff (`Event scheduling application-handoff/`).

## Features

- **Active list** sorted by due date, with a green→red color scale as the due date approaches (span configurable via the `colorSpanDays` prop, default 45 days).
- **Time filters** (Soon / Upcoming / Far off) bucketed relative to the color span, plus free-text search over names and notes.
- **Bottom-sheet form** to create/edit errands: name, due date, severity (Low/Medium/High), notes, and optional recurrence (every N weeks/months/years).
- **Recurring errands** reschedule themselves forward when marked done (skipping past dates); one-time errands move to History.
- **History tab** with restore (one-time errands only) and per-entry removal.
- **Persistence** in `localStorage` under the `errands_v2` key; starts empty on first run.

## Run

```sh
npm install
npm run dev      # dev server
npm run build    # type-check + production build to dist/
npm run preview  # serve the production build
```
