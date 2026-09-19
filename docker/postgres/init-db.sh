#!/usr/bin/env bash
set -e

# Runs on initial container startup under the superuser (POSTGRES_USER).
# Ensures the dedicated application database role is NOT a superuser.
# Uses safe psql variables and PostgreSQL format() with %I / %L to prevent injection.

APP_USER="${APP_DB_USER:-flowops}"
APP_PASS="${APP_DB_PASSWORD:-flowops_dev_pass_123}"
APP_DB="${POSTGRES_DB:-flowops}"

psql -v ON_ERROR_STOP=1 \
     -v app_user="$APP_USER" \
     -v app_pass="$APP_PASS" \
     -v app_db="$APP_DB" \
     --username "$POSTGRES_USER" \
     --dbname "$POSTGRES_DB" <<-EOSQL
SELECT format(
    'DO \$do\$ BEGIN ' ||
    'IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = %L) THEN ' ||
    '  CREATE ROLE %I WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT; ' ||
    'ELSE ' ||
    '  ALTER ROLE %I WITH NOSUPERUSER NOCREATEDB NOCREATEROLE; ' ||
    'END IF; ' ||
    'ALTER DATABASE %I OWNER TO %I; ' ||
    'GRANT ALL PRIVILEGES ON DATABASE %I TO %I; ' ||
    'END \$do\$;',
    :'app_user', :'app_user', :'app_pass', :'app_user', :'app_db', :'app_user', :'app_db', :'app_user'
) \gexec
EOSQL

psql -v ON_ERROR_STOP=1 \
     -v app_user="$APP_USER" \
     --username "$POSTGRES_USER" \
     --dbname "$APP_DB" <<-EOSQL
SELECT format(
    'DO \$do\$ BEGIN ' ||
    'GRANT ALL ON SCHEMA public TO %I; ' ||
    'ALTER SCHEMA public OWNER TO %I; ' ||
    'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO %I; ' ||
    'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO %I; ' ||
    'END \$do\$;',
    :'app_user', :'app_user', :'app_user', :'app_user'
) \gexec
EOSQL
