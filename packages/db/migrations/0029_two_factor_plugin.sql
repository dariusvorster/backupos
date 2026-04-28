DROP TABLE IF EXISTS two_factor;
--> statement-breakpoint
CREATE TABLE two_factor (
    id TEXT NOT NULL,
    secret TEXT NOT NULL,
    backup_codes TEXT,
    user_id TEXT NOT NULL,
    verified INTEGER DEFAULT 1,
    PRIMARY KEY (id),
    FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX two_factor_user_id_idx ON two_factor (user_id);
--> statement-breakpoint
CREATE INDEX two_factor_secret_idx ON two_factor (secret);
--> statement-breakpoint
UPDATE "user" SET two_factor_enabled = 0 WHERE two_factor_enabled = 1;
