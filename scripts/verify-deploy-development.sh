#!/usr/bin/env bash
set -euo pipefail
cd /opt/hr-payroll
set -a
. <(sed '1s/^\xEF\xBB\xBF//' /opt/hr-payroll/.env)
set +a
export PGOPTIONS="-c search_path=${PGSCHEMA:-public}"
echo "== health =="
curl -fsS http://127.0.0.1:${PORT:-8090}/api/health; echo
echo "== ready =="
curl -fsS http://127.0.0.1:${PORT:-8090}/api/ready; echo
echo "== pm2 =="
pm2 jlist | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const a=JSON.parse(s);for(const p of a)console.log(p.name,p.pm2_env.status,"restarts="+p.pm2_env.restart_time)})'
echo "== migrations =="
psql "$DATABASE_URL" -tAc "select version || ' ' || name from schema_migrations where version in (19,20) order by version"
echo "== objects =="
psql "$DATABASE_URL" -tAc "select table_name from information_schema.tables where table_schema='${PGSCHEMA:-public}' and table_name in ('training_courses','training_enrollments','client_errors') order by table_name"
echo "== client errors =="
echo "empty_body=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'content-type: application/json' -d '{}' http://127.0.0.1:${PORT:-8090}/api/client-errors)"
echo "valid_body=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'content-type: application/json' -d '{"message":"deploy smoke test","level":"warn","url":"/m/kiosk/secret-token?token=abc"}' http://127.0.0.1:${PORT:-8090}/api/client-errors)"
echo "extra_field=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'content-type: application/json' -d '{"message":"x","user_id":1}' http://127.0.0.1:${PORT:-8090}/api/client-errors)"
psql "$DATABASE_URL" -tAc "select coalesce(string_agg(url, ','), 'no-redacted-row') from client_errors where message='deploy smoke test' and url='/m/kiosk/[redacted]'"
echo "== new columns =="
psql "$DATABASE_URL" -tAc "select table_name || '.' || column_name from information_schema.columns where table_schema='${PGSCHEMA:-public}' and ((table_name='payroll' and column_name in ('approval_status','payment_status','is_final_settlement')) or (table_name='promotions' and column_name='training_enrollment_id')) order by 1"
echo "== mobile shell =="
curl -fsS http://127.0.0.1:${PORT:-8090}/sw.js > /tmp/tamkeen-sw-check.js
head -c 120 /tmp/tamkeen-sw-check.js; echo
grep -c '__BUILD_ID__\|__ASSET_URLS__' /tmp/tamkeen-sw-check.js || true
grep -o "const BUILD_ID = \"[0-9a-f]\{12\}\"" /tmp/tamkeen-sw-check.js | head -1
grep -F "(api|kiosk|uploads)" /tmp/tamkeen-sw-check.js | head -1 || true
curl -fsS http://127.0.0.1:${PORT:-8090}/m | grep -o 'assets/index-[A-Za-z0-9_-]*\.js' | head -1
echo "== employees =="
psql "$DATABASE_URL" -tAc "select count(*) from employees"
