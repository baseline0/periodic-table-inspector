-- Relational model for the reverse lookup: element -> mining operation -> lawsuit.
-- PostgreSQL. The JSON files in this folder mirror these tables for the static site.

CREATE TABLE elements (
    atomic_number  smallint PRIMARY KEY CHECK (atomic_number BETWEEN 1 AND 118),
    symbol         text NOT NULL UNIQUE,
    name           text NOT NULL,
    market_sector  text
);

CREATE TABLE mining_operations (
    id           text PRIMARY KEY,
    name         text NOT NULL,
    operator     text NOT NULL,           -- operator or parent company, as filed
    country      text NOT NULL,
    region       text,                    -- state or province
    status       text NOT NULL CHECK (status IN ('active', 'care_and_maintenance', 'closed', 'proposed')),
    source_url   text                     -- where the record came from (USGS, 10-K, etc.)
);

-- Many-to-many: one mine extracts several elements, and an element is extracted at many mines.
CREATE TABLE operation_elements (
    operation_id   text     NOT NULL REFERENCES mining_operations (id) ON DELETE CASCADE,
    atomic_number  smallint NOT NULL REFERENCES elements (atomic_number),
    role           text     NOT NULL CHECK (role IN ('primary', 'secondary')),
    PRIMARY KEY (operation_id, atomic_number)
);

CREATE TABLE lawsuits (
    id             text PRIMARY KEY,
    operation_id   text NOT NULL REFERENCES mining_operations (id) ON DELETE CASCADE,
    case_name      text NOT NULL,
    court          text NOT NULL,
    docket_number  text,
    filed_on       date,
    status         text NOT NULL CHECK (status IN ('open', 'pending', 'closed')),
    dispute_type   text NOT NULL CHECK (dispute_type IN (
                       'environmental', 'indigenous_rights', 'concession_overlap', 'breach_of_contract', 'other')),
    source_url     text                   -- the docket entry or ICSID case page
);

CREATE INDEX operation_elements_by_element ON operation_elements (atomic_number);
CREATE INDEX lawsuits_by_operation ON lawsuits (operation_id);
