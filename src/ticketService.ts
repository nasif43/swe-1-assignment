import { Pool } from "pg";

interface TicketPool {
  event_id: string;
  total: number;
  available: number;
}

const pool = new Pool({
  host: "localhost",
  port: 5433,
  database: "tickets",
  user: "postgres",
  password: "postgres",
});

export async function purchaseTickets(
  userId: string,
  eventId: string,
  quantity: number,
): Promise<number[]> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const availableResult = await client.query<TicketPool>(
      "SELECT event_id, total, available FROM ticket_pools WHERE event_id = $1 FOR UPDATE",
      [eventId],
    );

    if (availableResult.rows.length === 0) {
      throw new Error("Event not found");
    }

    const ticketPool = availableResult.rows[0];

    if (!ticketPool || ticketPool.available < quantity) {
      throw new Error("Not enough tickets available");
    }

    const startTicketNumber = ticketPool.total - ticketPool.available + 1;
    const endTicketNumber = startTicketNumber + quantity - 1;

    const insertedTickets = await client.query<{ ticket_number: number }>(
      `
        INSERT INTO issued_tickets (event_id, user_id, ticket_number)
        SELECT $1, $2, generated_ticket_number
        FROM generate_series($3, $4) AS generated_ticket_number
        RETURNING ticket_number
      `,
      [eventId, userId, startTicketNumber, endTicketNumber],
    );

    await client.query(
      "UPDATE ticket_pools SET available = available - $1 WHERE event_id = $2",
      [quantity, eventId],
    );

    await client.query("COMMIT");

    return insertedTickets.rows
      .map((row) => row.ticket_number)
      .sort((left, right) => left - right);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getPool(): Promise<Pool> {
  return pool;
}
