import axios from "axios";
import { Pool } from "pg";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:3000";
const EVENT_ID = process.env.REPRO_EVENT_ID ?? "REPRO_EVENT_001";
const ATTEMPTS = Number(process.env.REPRO_ATTEMPTS ?? 10);
const CONCURRENT_REQUESTS = Number(process.env.REPRO_CONCURRENT_REQUESTS ?? 60);
const EXPECT_BUGS = (process.env.REPRO_EXPECT_BUGS ?? "true").toLowerCase() === "true";
const PURCHASE_QUANTITY = 8;
const EVENT_TOTAL = 32;

const pool = new Pool({
  host: "localhost",
  port: 5433,
  database: "tickets",
  user: "postgres",
  password: "postgres",
});

async function resetEventState() {
  await pool.query("DELETE FROM issued_tickets WHERE event_id = $1", [EVENT_ID]);
  await pool.query("DELETE FROM ticket_pools WHERE event_id = $1", [EVENT_ID]);
  await pool.query(
    "INSERT INTO ticket_pools (event_id, total, available) VALUES ($1, $2, $3)",
    [EVENT_ID, EVENT_TOTAL, EVENT_TOTAL],
  );
}

async function runOneAttempt(attempt: number) {
  await resetEventState();

  const requests = Array.from({ length: CONCURRENT_REQUESTS }, (_, index) =>
    axios.post(
      `${API_BASE_URL}/purchase`,
      {
        userId: `repro_user_${attempt}_${index + 1}`,
        eventId: EVENT_ID,
        quantity: PURCHASE_QUANTITY,
      },
      {
        validateStatus: () => true,
        timeout: 15000,
      },
    ),
  );

  const responses = await Promise.all(requests);
  const successCount = responses.filter(
    (response) => response.status === 200 && response.data?.success,
  ).length;

  const poolState = await pool.query<{
    total: number;
    available: number;
  }>("SELECT total, available FROM ticket_pools WHERE event_id = $1", [EVENT_ID]);

  const ticketState = await pool.query<{
    issued_count: string;
    unique_count: string;
  }>(
    `
      SELECT
        COUNT(*)::text AS issued_count,
        COUNT(DISTINCT ticket_number)::text AS unique_count
      FROM issued_tickets
      WHERE event_id = $1
    `,
    [EVENT_ID],
  );

  const duplicateNumbers = await pool.query<{ ticket_number: number; copies: string }>(
    `
      SELECT ticket_number, COUNT(*)::text AS copies
      FROM issued_tickets
      WHERE event_id = $1
      GROUP BY ticket_number
      HAVING COUNT(*) > 1
      ORDER BY ticket_number
    `,
    [EVENT_ID],
  );

  const total = poolState.rows[0]?.total ?? EVENT_TOTAL;
  const available = poolState.rows[0]?.available ?? EVENT_TOTAL;
  const issuedCount = Number(ticketState.rows[0]?.issued_count ?? 0);
  const uniqueCount = Number(ticketState.rows[0]?.unique_count ?? 0);

  const oversold = issuedCount > total || available < 0 || successCount > total / PURCHASE_QUANTITY;
  const hasDuplicates = uniqueCount < issuedCount;

  console.log(`\nAttempt #${attempt}`);
  console.log(`Successful purchases: ${successCount}`);
  console.log(`Pool state -> total: ${total}, available: ${available}`);
  console.log(`Issued tickets: ${issuedCount}, unique ticket numbers: ${uniqueCount}`);

  if (duplicateNumbers.rows.length > 0) {
    const sample = duplicateNumbers.rows
      .slice(0, 10)
      .map((row) => `${row.ticket_number} (x${row.copies})`)
      .join(", ");
    console.log(`Duplicate ticket numbers found: ${sample}`);
  }

  return { oversold, hasDuplicates };
}

async function main() {
  console.log("Running race-condition reproduction script...");
  console.log(`Target API: ${API_BASE_URL}`);
  console.log(`Event ID: ${EVENT_ID}`);
  console.log(`Expect vulnerable behavior: ${EXPECT_BUGS}`);

  try {
    let oversoldSeen = false;
    let duplicatesSeen = false;

    for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
      const result = await runOneAttempt(attempt);
      oversoldSeen = oversoldSeen || result.oversold;
      duplicatesSeen = duplicatesSeen || result.hasDuplicates;

      if (oversoldSeen && duplicatesSeen) {
        if (EXPECT_BUGS) {
          console.log("\n✅ Reproduced both bugs: overselling and duplicate ticket numbers.");
          return;
        }
      }
    }

    if (EXPECT_BUGS) {
      throw new Error(
        "Did not reproduce both bugs within configured attempts. Increase REPRO_ATTEMPTS or REPRO_CONCURRENT_REQUESTS.",
      );
    }

    if (!oversoldSeen && !duplicatesSeen) {
      console.log("\n✅ No overselling or duplicate ticket numbers observed.");
      return;
    }

    throw new Error("Observed race-condition behavior while expecting fixed behavior.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("\n❌ Reproduction failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
