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
echo "== new columns =="
psql "$DATABASE_URL" -tAc "select table_name || '.' || column_name from information_schema.columns where table_schema='${PGSCHEMA:-public}' and ((table_name='payroll' and column_name in ('approval_status','payment_status','is_final_settlement')) or (table_name='promotions' and column_name='training_enrollment_id')) order by 1"
echo "== mobile shell =="
curl -fsS http://127.0.0.1:${PORT:-8090}/sw.js | head -c 120; echo
curl -fsS http://127.0.0.1:${PORT:-8090}/m | grep -o 'assets/index-[A-Za-z0-9_-]*\.js' | head -1
echo "== employees =="
psql "$DATABASE_URL" -tAc "select count(*) from employees"
