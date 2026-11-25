import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { getPool } from './index.js';
import type { PoolClient } from 'pg';
import { importLegacyPrompt } from '@dongxuan/dto';
const INITIAL = `
CREATE TABLE IF NOT EXISTS users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email varchar(255) NOT NULL UNIQUE, password_hash varchar(255), display_name varchar(64), session_version integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS oidc_identities (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, issuer varchar(512) NOT NULL, sub varchar(255) NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX IF NOT EXISTS oidc_identities_issuer_sub_uidx ON oidc_identities(issuer,sub);
CREATE UNIQUE INDEX IF NOT EXISTS oidc_identities_user_issuer_uidx ON oidc_identities(user_id,issuer);
CREATE TABLE IF NOT EXISTS charts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,title varchar(32) NOT NULL,calendar varchar(8) NOT NULL,date_str varchar(16) NOT NULL,time_index integer NOT NULL,gender varchar(8) NOT NULL,is_leap_month boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS charts_user_created_idx ON charts(user_id,created_at DESC);`;
const PERSONAL = `
CREATE TABLE profiles(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,name varchar(64) NOT NULL,relation varchar(32),birth_profile jsonb NOT NULL DEFAULT '{}',remark text,revision integer NOT NULL DEFAULT 1,archived_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(id,user_id));
ALTER TABLE charts ADD COLUMN profile_id uuid, ADD COLUMN system varchar(16) NOT NULL DEFAULT 'ziwei',ADD COLUMN source_chart_id uuid,ADD COLUMN archived_at timestamptz,ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),ADD COLUMN revision integer NOT NULL DEFAULT 1,ADD COLUMN migration_status varchar(16) NOT NULL DEFAULT 'pending',ADD COLUMN migration_error text;
ALTER TABLE charts ADD CONSTRAINT charts_id_user_unique UNIQUE(id,user_id),ADD CONSTRAINT charts_profile_owner FOREIGN KEY(profile_id,user_id) REFERENCES profiles(id,user_id),ADD CONSTRAINT charts_source_owner FOREIGN KEY(source_chart_id,user_id) REFERENCES charts(id,user_id);
CREATE TABLE chart_snapshots(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),chart_id uuid NOT NULL,user_id uuid NOT NULL,kind varchar(8) NOT NULL CHECK(kind IN('base','view')),base_snapshot_id uuid,input jsonb NOT NULL,rules jsonb NOT NULL,engine_meta jsonb NOT NULL,schema_version integer NOT NULL DEFAULT 2,query jsonb,result jsonb NOT NULL,text text NOT NULL,summary jsonb NOT NULL,provenance text NOT NULL,view_title varchar(80),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(id,user_id),FOREIGN KEY(chart_id,user_id) REFERENCES charts(id,user_id),FOREIGN KEY(base_snapshot_id,user_id) REFERENCES chart_snapshots(id,user_id),CHECK((kind='base' AND base_snapshot_id IS NULL AND query IS NULL) OR (kind='view' AND base_snapshot_id IS NOT NULL AND query IS NOT NULL)));
CREATE UNIQUE INDEX one_base_per_chart ON chart_snapshots(chart_id) WHERE kind='base';
CREATE INDEX snapshots_user_chart_idx ON chart_snapshots(user_id,chart_id,created_at DESC);
CREATE TABLE notes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES users(id),profile_id uuid,snapshot_id uuid,body text NOT NULL,revision integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),FOREIGN KEY(profile_id,user_id) REFERENCES profiles(id,user_id),FOREIGN KEY(snapshot_id,user_id) REFERENCES chart_snapshots(id,user_id),CHECK((profile_id IS NULL) <> (snapshot_id IS NULL)));
CREATE TABLE prompt_templates(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES users(id),system varchar(16) NOT NULL,title varchar(80) NOT NULL,body text NOT NULL,inputs_schema jsonb NOT NULL DEFAULT '[]',data_requirements jsonb NOT NULL DEFAULT '[]',missing_policy text,revision integer NOT NULL DEFAULT 1,variable_schema_version integer NOT NULL DEFAULT 2,seed_key varchar(64),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(user_id,seed_key));
CREATE TABLE prompt_seed_state(user_id uuid PRIMARY KEY REFERENCES users(id),seed_version integer NOT NULL);
CREATE TABLE meihua_drafts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES users(id),question text NOT NULL,number_a bigint NOT NULL,number_b bigint NOT NULL,profile_id uuid,status varchar(8) NOT NULL DEFAULT 'raw' CHECK(status='raw'),revision integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),FOREIGN KEY(profile_id,user_id) REFERENCES profiles(id,user_id));
CREATE TABLE operation_keys(user_id uuid NOT NULL REFERENCES users(id),scope text NOT NULL,key varchar(128) NOT NULL,resource_id uuid NOT NULL,fingerprint text NOT NULL,PRIMARY KEY(user_id,scope,key));
CREATE INDEX profiles_user_idx ON profiles(user_id,created_at DESC);
CREATE INDEX notes_user_idx ON notes(user_id,created_at DESC);
CREATE INDEX templates_user_idx ON prompt_templates(user_id,updated_at DESC);
CREATE INDEX meihua_user_idx ON meihua_drafts(user_id,updated_at DESC);
CREATE OR REPLACE FUNCTION require_snapshot_writer() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF current_setting('dongxuan.snapshot_writer',true) IS DISTINCT FROM 'v2' THEN RAISE EXCEPTION '旧版命盘写入已暂停，请使用快照版本服务' USING ERRCODE='55000'; END IF; IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF; END $$;
CREATE TRIGGER charts_v2_write_barrier BEFORE INSERT OR UPDATE OR DELETE ON charts FOR EACH ROW EXECUTE FUNCTION require_snapshot_writer();
`;
const ONE_CHART = `
SELECT set_config('dongxuan.snapshot_writer', 'v2', true);
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY profile_id ORDER BY updated_at DESC, created_at DESC, id DESC) AS n
  FROM charts WHERE profile_id IS NOT NULL
)
UPDATE charts SET profile_id = NULL WHERE id IN (SELECT id FROM ranked WHERE n > 1);
CREATE UNIQUE INDEX IF NOT EXISTS charts_one_profile_uidx ON charts(profile_id) WHERE profile_id IS NOT NULL;
`;
const ONE_RECORD = `
SELECT set_config('dongxuan.snapshot_writer', 'v2', true);
ALTER TABLE charts ADD COLUMN relation varchar(32), ADD COLUMN remark text;
ALTER TABLE charts ALTER COLUMN title TYPE varchar(64);
UPDATE charts AS c
SET relation = p.relation, remark = p.remark, title = left(p.name, 64)
FROM profiles AS p
WHERE c.profile_id = p.id AND c.user_id = p.user_id;
ALTER TABLE notes ADD COLUMN chart_id uuid;
ALTER TABLE meihua_drafts ADD COLUMN chart_id uuid;
UPDATE notes AS n SET chart_id = c.id
FROM charts AS c
WHERE n.profile_id IS NOT NULL AND c.profile_id = n.profile_id AND c.user_id = n.user_id;
UPDATE notes AS n SET chart_id = s.chart_id
FROM chart_snapshots AS s
WHERE n.snapshot_id = s.id AND s.kind = 'base' AND n.user_id = s.user_id AND n.chart_id IS NULL;
UPDATE meihua_drafts AS m SET chart_id = c.id
FROM charts AS c
WHERE m.profile_id IS NOT NULL AND c.profile_id = m.profile_id AND c.user_id = m.user_id;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM notes WHERE profile_id IS NOT NULL AND chart_id IS NULL) THEN
    RAISE EXCEPTION '有笔记还挂在没有命盘的人物上，无法合并';
  END IF;
END $$;
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conrelid::regclass AS tbl, conname
    FROM pg_constraint
    WHERE contype = 'f' AND confrelid = 'profiles'::regclass
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
  END LOOP;
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'notes'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%profile_id%'
  LOOP
    EXECUTE format('ALTER TABLE notes DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;
UPDATE notes SET snapshot_id = NULL WHERE chart_id IS NOT NULL AND snapshot_id IS NOT NULL;
ALTER TABLE notes DROP COLUMN profile_id;
ALTER TABLE meihua_drafts DROP COLUMN profile_id;
ALTER TABLE notes ADD CONSTRAINT notes_chart_or_snapshot CHECK ((chart_id IS NULL) <> (snapshot_id IS NULL));
ALTER TABLE notes ADD CONSTRAINT notes_chart_owner FOREIGN KEY (chart_id, user_id) REFERENCES charts (id, user_id);
ALTER TABLE meihua_drafts ADD CONSTRAINT meihua_chart_owner FOREIGN KEY (chart_id, user_id) REFERENCES charts (id, user_id);
DROP INDEX IF EXISTS charts_one_profile_uidx;
ALTER TABLE charts DROP COLUMN profile_id;
DROP TABLE profiles;
`;
async function migratePromptBodies(c: PoolClient): Promise<void> {
    await c.query('ALTER TABLE prompt_templates ALTER COLUMN body TYPE jsonb USING to_jsonb(body)');
    for (;;) {
        const rows = await c.query("SELECT id,body FROM prompt_templates WHERE jsonb_typeof(body)='string' ORDER BY id LIMIT 100 FOR UPDATE");
        if (!rows.rowCount) break;
        for (const row of rows.rows) {
            const body = importLegacyPrompt(row.body);
            // Only the format changes; revision and user-visible timestamps are untouched.
            await c.query('UPDATE prompt_templates SET body=$2::jsonb WHERE id=$1', [row.id, JSON.stringify(body)]);
        }
    }
    await c.query("ALTER TABLE prompt_templates ADD CONSTRAINT prompt_templates_body_document CHECK ((jsonb_typeof(body)='object' AND jsonb_typeof(body->'schemaVersion')='number' AND body->>'schemaVersion'='1' AND jsonb_typeof(body->'doc')='object' AND body->'doc'->>'type'='doc') IS TRUE)");
}

/** Runs in the client's current schema; also enables isolated-schema migration verification. */
export async function migrateWithClient(c: PoolClient): Promise<void> { try {
    await c.query('BEGIN');
    await c.query("SELECT pg_advisory_xact_lock(8602311)");
    await c.query('CREATE TABLE IF NOT EXISTS schema_migrations(version integer PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())');
    for (const [v, sql] of [[1, INITIAL], [2, PERSONAL], [3, ONE_CHART], [4, ONE_RECORD]] as const) {
        const found = await c.query('SELECT 1 FROM schema_migrations WHERE version=$1', [v]);
        if (!found.rowCount) {
            await c.query(sql);
            await c.query('INSERT INTO schema_migrations(version) VALUES($1)', [v]);
        }
    }
    const promptFormat = await c.query('SELECT 1 FROM schema_migrations WHERE version=5');
    if (!promptFormat.rowCount) {
        await migratePromptBodies(c);
        await c.query('INSERT INTO schema_migrations(version) VALUES(5)');
    }
    const castingTime = await c.query('SELECT 1 FROM schema_migrations WHERE version=6');
    if (!castingTime.rowCount) {
        await c.query("ALTER TABLE meihua_drafts ADD COLUMN casting_time jsonb, ADD CONSTRAINT meihua_casting_time_object CHECK (casting_time IS NULL OR jsonb_typeof(casting_time)='object')");
        await c.query('INSERT INTO schema_migrations(version) VALUES(6)');
    }
    await c.query('COMMIT');
}
catch (e) {
    await c.query('ROLLBACK');
    throw e;
}
}
export async function migrate(): Promise<void> {
    const c = await getPool().connect();
    try { await migrateWithClient(c); }
    finally { c.release(); }
}
const direct = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (direct) {
    migrate().then(() => console.log('数据库迁移完成')).finally(() => getPool().end()).catch(e => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; });
}
