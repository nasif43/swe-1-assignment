# Ticket Service Take-Home Write-up

## Repository / Branch Layout

- `vulnerable-baseline`: original unmodified forked code (intentionally vulnerable).
- `fixed-solution`: includes reproducer script, bug fixes, schema hardening, docs, and this write-up.

Important clarification for reviewers: the reproducer script lives on `fixed-solution` by design, and can target a running vulnerable server from `vulnerable-baseline`.

## Deliverable Mapping

1. **Repro script for original bugs**
  - `src/reproduceOriginalBugs.ts` (on `fixed-solution`)
2. **Modified codebase with bugs fixed**
  - `src/ticketService.ts`
  - `init.sql`
  - `src/seed.ts`
3. **Write-up**
  - `WRITEUP.md`

## 1) Root Cause Analysis

Both reported issues were caused by a race condition in the original `purchaseTickets` implementation.

Original flow (vulnerable):
1. Read event pool row (`SELECT * FROM ticket_pools WHERE event_id = $1`) with no lock.
2. Compute ticket number range from `total - available`.
3. Insert tickets one-by-one.
4. Decrement availability in a separate update query.

Under concurrent requests, two or more requests can read the same `available` value before any update is committed.

This leads to:
- **Duplicate ticket numbers**: concurrent requests compute and insert overlapping ticket ranges.
- **Overselling**: multiple requests pass availability check and all decrement after issuing.

Additionally, there was no DB uniqueness constraint on `(event_id, ticket_number)`, so duplicates were not blocked at the database layer.

## 2) How to Reproduce on Original Code

Run vulnerable service from `vulnerable-baseline` and run reproducer from `fixed-solution`.

### Terminal A (vulnerable server)

```bash
git switch vulnerable-baseline
docker-compose up -d
npm install
npm run seed
npm run dev
```

### Terminal B (reproducer)

```bash
git switch fixed-solution
npm install
npm run repro
```

Expected vulnerable output:
- `Reproduced both bugs: overselling and duplicate ticket numbers`

If reproduction is flaky on a slower machine:

```bash
cross-env REPRO_ATTEMPTS=20 REPRO_CONCURRENT_REQUESTS=120 npm run repro
```

## 3) Fix Implemented

### Application-level fix (`src/ticketService.ts`)

Ticket issuance is now atomic per event using one DB transaction:
- `BEGIN`
- `SELECT ... FOR UPDATE` on the event row
- Validate remaining availability while locked
- Insert all ticket numbers in one statement via `generate_series`
- Update `available`
- `COMMIT` (or `ROLLBACK` on failure)

This prevents overlapping allocations and overselling caused by concurrent requests for the same event.

### Database-level fix (`init.sql`, `src/seed.ts`)

Added hard safety constraints:
- Unique index: `(event_id, ticket_number)`
- Check constraints:
  - `total >= 0`
  - `available >= 0`
  - `available <= total`

`src/seed.ts` also applies these constraints/index idempotently for existing local databases.

## 4) Post-fix Validation

Run fixed service and fixed validation script:

```bash
git switch fixed-solution
npm run seed
npm run dev
npm run repro:fixed
```

Expected fixed output:
- `No overselling or duplicate ticket numbers observed`

## 5) Tradeoffs

### Benefits
- Preserves existing API behavior.
- Correctness guaranteed with standard PostgreSQL transaction semantics.
- Small and maintainable change footprint.

### Cost
- Requests for the same event serialize on row lock under heavy contention.
- Different events still process concurrently.

## 6) Bonus: Scaling Direction for 10k+ RPS / Multi-Instance

For higher throughput while preserving correctness:
1. Keep DB uniqueness/check constraints as final guardrails.
2. Move to atomic range reservation model:
  - Maintain `next_ticket_number` per event.
  - Use one atomic conditional update to reserve a range and decrement availability.
3. Bulk insert reserved tickets.
4. Partition `issued_tickets` and tune connection pools.

This reduces lock hold time and round trips while maintaining strict ticket uniqueness and stock correctness.
