CREATE TABLE IF NOT EXISTS ticket_pools (
    event_id VARCHAR(50) PRIMARY KEY,
    total INTEGER NOT NULL,
    available INTEGER NOT NULL,
    CONSTRAINT ticket_pools_non_negative CHECK (total >= 0 AND available >= 0),
    CONSTRAINT ticket_pools_available_lte_total CHECK (available <= total)
);

CREATE TABLE IF NOT EXISTS issued_tickets (
    id SERIAL PRIMARY KEY,
    event_id VARCHAR(50) NOT NULL,
    user_id VARCHAR(50) NOT NULL,
    ticket_number INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS issued_tickets_event_ticket_number_uq
ON issued_tickets (event_id, ticket_number);