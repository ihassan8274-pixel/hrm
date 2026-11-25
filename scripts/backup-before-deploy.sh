set -e
cd /opt/hr-payroll
set -a
. <(sed '1s/^\xEF\xBB\xBF//' /opt/hr-payroll/.env)
set +a
TS=$(date +%Y%m%d-%H%M%S)
mkdir -p backups
FILE="backups/db-predeploy-${TS}.dump"
pg_dump --format=custom --no-owner --no-privileges -f "$FILE" "$DATABASE_URL"
sha256sum "$FILE" > "${FILE}.sha256"
ls -l "$FILE"
cat "${FILE}.sha256"
