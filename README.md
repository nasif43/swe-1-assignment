# Ticket Service - Environment Setup

## Assignment Quick Start (Reviewer)

This repository uses two branches for the assignment:

- `vulnerable-baseline`: original unmodified code from the fork (intentionally vulnerable, no repro script).
- `fixed-solution`: contains the bug reproducer, fix, and write-up.

### Fastest way to verify all deliverables

Use two working folders at the same time:

1. Vulnerable service checkout (`vulnerable-baseline`) in one folder.
2. Fixed checkout (`fixed-solution`) in another folder.

Then run:

**Terminal A (vulnerable service):**

```bash
cd <path-to-vulnerable-baseline-checkout>
docker-compose up -d
npm install
npm run seed
npm run dev
```

**Terminal B (reproducer from fixed-solution):**

```bash
cd <path-to-fixed-solution-checkout>
npm install
npm run repro
```

Expected vulnerable result:
- Prints `Reproduced both bugs: overselling and duplicate ticket numbers`

Now validate the fix:

**Terminal C (fixed service):**

```bash
cd <path-to-fixed-solution-checkout>
npm run seed
npm run dev
```

**Terminal D (fixed validation):**

```bash
cd <path-to-fixed-solution-checkout>
npm run repro:fixed
```

Expected fixed result:
- Prints `No overselling or duplicate ticket numbers observed`

If vulnerable reproduction is flaky on a slower machine:

```bash
cross-env REPRO_ATTEMPTS=20 REPRO_CONCURRENT_REQUESTS=120 npm run repro
```

## Prerequisites

- Node.js 18+ and npm
- Docker and Docker Compose

## Setup Instructions

### 1. Start PostgreSQL Database

```bash
docker-compose up -d
```

This starts PostgreSQL on port 5433 with:
- Database: `tickets`
- Username: `postgres`
- Password: `postgres`

### 2. Install Dependencies

```bash
npm install
```

### 3. Initialize Database

```bash
npm run seed
```

### 4. Start Application

```bash
npm run dev
```

Server runs on http://localhost:3000

### 5. Reproduce Race Bugs (Original Behavior)

Run while using the original vulnerable `src/ticketService.ts` implementation:

```bash
npm run repro
```

The script sends many concurrent purchase requests for a tiny event pool and checks the DB for:
- Overselling (`issued_tickets` beyond event `total`, or negative `available`)
- Duplicate ticket numbers (`COUNT(*) > COUNT(DISTINCT ticket_number)`)

### 6. Validate Fixed Behavior

After applying the fix in this repository:

```bash
npm run repro:fixed
```

This should report that no overselling or duplicate ticket numbers were observed.

## Environment Variables

No additional configuration needed - uses default values:
- Database: `localhost:5433/tickets`
- API Server: `http://localhost:3000`

## Verify Setup

Test the API:
```bash
curl -X POST http://localhost:3000/purchase \
  -H "Content-Type: application/json" \
  -d '{"userId":"test","eventId":"EVENT001","quantity":8}'
```

## Assignment Artifacts

- Reproduction script: `src/reproduceOriginalBugs.ts`
- Fixed purchase logic: `src/ticketService.ts`
- DB safety constraints: `init.sql` and `src/seed.ts`
- Write-up: `WRITEUP.md`

## Branches for Deliverables

- `vulnerable-baseline`: points to the original unmodified codebase (for proving the bug).
- `fixed-solution`: contains the reproduction script, bug fix, schema hardening, and write-up.

Note: the reproducer script exists on `fixed-solution` by design, and targets a running server from `vulnerable-baseline` when proving the original bug.

### Suggested reviewer flow

1. In one terminal, run the vulnerable service:

```bash
git switch vulnerable-baseline
npm install
npm run seed
npm run dev
```

2. In another terminal, run the reproducer from the fixed branch against that vulnerable server:

```bash
git switch fixed-solution
npm install
npm run repro
```

Expected result (vulnerable): script exits successfully and prints:
- `Reproduced both bugs: overselling and duplicate ticket numbers`
- at least one attempt with duplicate ticket numbers listed and/or oversold pool state

3. Validate the fix on the fixed branch:

```bash
npm run seed
npm run dev
npm run repro:fixed
```

Expected result (fixed): script exits successfully and prints:
- `No overselling or duplicate ticket numbers observed`
- no attempt showing duplicate ticket numbers

If vulnerable reproduction is flaky on a slower machine, increase load:

```bash
cross-env REPRO_ATTEMPTS=20 REPRO_CONCURRENT_REQUESTS=120 npm run repro
```

## Troubleshooting

### Database not connecting
```bash
docker-compose down -v
docker-compose up -d
```

### Port conflicts
Check ports 3000 and 5433 are available or modify in `docker-compose.yml`