#!/usr/bin/env bash
set -e

# Runs on initial container startup under the superuser (POSTGRES_USER).
# Ensures the dedicated application database role is NOT a superuser.

APP_USER="${APP_DB_USER:-flowops}"
APP_PASS="${APP_DB_PASSWORD:-flowops_dev_pass_123}"
APP_DB="${POSTGRES_DB:-flowops}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '$APP_USER') THEN
            CREATE ROLE "$APP_USER" WITH LOGIN PASSWORD '$APP_PASS' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
        ELSE
            ALTER ROLE "$APP_USER" WITH NOSUPERUSER NOCREATEDB NOCREATEROLE;
        END IF;
    END
    \$\$;

    ALTER DATABASE "$APP_DB" OWNER TO "$APP_USER";
    GRANT ALL PRIVILEGES ON DATABASE "$APP_DB" TO "$APP_USER";
EOSQL

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$APP_DB" <<-EOSQL
    GRANT ALL ON SCHEMA public TO "$APP_USER";
    ALTER SCHEMA public OWNER TO "$APP_USER";
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO "$APP_USER";
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO "$APP_USER";
EOSQL
