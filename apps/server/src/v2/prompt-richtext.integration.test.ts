import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { importLegacyPrompt, promptDocumentIssues, promptDocumentToTemplateText, renderPromptDocument, type PromptDocument } from '@dongxuan/dto';
import { buildApp } from '../index.js';
import { migrate, migrateWithClient } from '../db/migrate.js';
import { closeDb, getPool } from '../db/index.js';
import { PROMPT_SEEDS } from './prompt-seeds.js';

const run = process.env.DONGXUAN_INTEGRATION === '1';
const literal = (text: string): PromptDocument => ({ schemaVersion: 1, doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] } });
const template = (bodyJson: PromptDocument) => ({ title: '富文本集成', system: 'meihua', inputsSchema: [], dataRequirements: [], bodyJson });

describe.skipIf(!run)('rich prompt PostgreSQL migration and APIs', () => {
  let app: Awaited<ReturnType<typeof buildApp>>, cookie = '', userId = '';
  const req = async (method: any, url: string, payload?: any) => {
    const r = await app.inject({ method, url, payload, headers: { cookie } });
    return { status: r.statusCode, body: r.body ? r.json() : null, headers: r.headers };
  };
  beforeAll(async () => {
    if (process.env.PG_HOST !== '127.0.0.1' || process.env.PG_PORT !== '55439' || process.env.PG_DATABASE !== 'dongxuan_test') throw Error('rich prompt tests require isolated dongxuan_test on localhost:55439');
    await migrate();
    app = await buildApp();
    const r = await req('POST', '/api/auth/register', { email: randomUUID() + '@example.test', password: 'integration-test-only', displayName: '富文本测试' });
    expect(r.status).toBe(201);
    const raw = r.headers['set-cookie'];
    cookie = (Array.isArray(raw) ? raw : [raw]).map(v => String(v).split(';')[0]).join('; ');
    userId = r.body.user.id;
  }, 30000);
  afterAll(async () => {
    if (userId) {
      for (const table of ['prompt_templates', 'prompt_seed_state']) await getPool().query('DELETE FROM ' + table + ' WHERE user_id=$1', [userId]);
      await getPool().query('DELETE FROM users WHERE id=$1', [userId]);
    }
    await app?.close();
    await closeDb();
  });

  it('rolls back partial batches and ALTER atomically, preserves metadata and original seed text, and is idempotent', async () => {
    const c = await getPool().connect(), schema = 'prompt_rt_' + randomUUID().replaceAll('-', '');
    try {
      await c.query('CREATE SCHEMA ' + schema);
      await c.query('SET search_path TO ' + schema);
      await migrateWithClient(c);
      await c.query('ALTER TABLE prompt_templates DROP CONSTRAINT prompt_templates_body_document');
      await c.query('ALTER TABLE prompt_templates ALTER COLUMN body TYPE text USING body::text');
      await c.query('DELETE FROM schema_migrations WHERE version=5');
      const owner = (await c.query("INSERT INTO users(email) VALUES('migration@example.test') RETURNING id")).rows[0].id;
      const cases = [
        ...PROMPT_SEEDS.map(t => ({ ...t, body: promptDocumentToTemplateText(t.bodyJson) })),
        { title: '原文换行', system: 'meihua', inputsSchema: [], dataRequirements: [], body: '\n中文“引号” 😀\r\n\r\n末尾\n' },
        { title: '未知引用', system: 'meihua', inputsSchema: [], dataRequirements: [], body: '{{unknown.value}}\n' },
        ...Array.from({ length: 102 }, (_, n) => ({ title: '跨批次-' + n, system: 'meihua', inputsSchema: [], dataRequirements: [], body: '批次正文 ' + n + '\n' })),
        { title: '迁移-失败点', system: 'meihua', inputsSchema: [], dataRequirements: [], body: '保留 {{ Bad }}\n{{unclosed' },
      ];
      for (let n = 0; n < cases.length; n++) {
        const t = cases[n], id = '00000000-0000-4000-8000-' + String(n + 1).padStart(12, '0');
        await c.query("INSERT INTO prompt_templates(id,user_id,system,title,body,inputs_schema,data_requirements,revision,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,7,'2024-01-02 03:04:05.123456+00','2024-02-03 04:05:06.654321+00')", [id, owner, t.system, t.title, t.body, JSON.stringify(t.inputsSchema), JSON.stringify(t.dataRequirements)]);
      }
      const rows = async () => (await c.query('SELECT *,created_at::text AS created_exact,updated_at::text AS updated_exact FROM prompt_templates ORDER BY id')).rows;
      const before = await rows();
      await c.query("CREATE FUNCTION fail_prompt_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.title='迁移-失败点' THEN RAISE EXCEPTION 'injected migration failure'; END IF; RETURN NEW; END $$");
      await c.query('CREATE TRIGGER fail_prompt BEFORE UPDATE ON prompt_templates FOR EACH ROW EXECUTE FUNCTION fail_prompt_test()');
      await expect(migrateWithClient(c)).rejects.toThrow('injected migration failure');
      expect((await c.query("SELECT data_type FROM information_schema.columns WHERE table_schema=$1 AND table_name='prompt_templates' AND column_name='body'", [schema])).rows[0].data_type).toBe('text');
      expect(await rows()).toEqual(before);
      expect((await c.query('SELECT 1 FROM schema_migrations WHERE version=5')).rowCount).toBe(0);
      await c.query('DROP TRIGGER fail_prompt ON prompt_templates');
      await c.query('DROP FUNCTION fail_prompt_test()');
      await migrateWithClient(c);
      const after = await rows();
      after.forEach((row, n) => {
        const { body: oldBody, ...oldMetadata } = before[n], { body, ...metadata } = row;
        expect(metadata).toEqual(oldMetadata);
        expect(body.schemaVersion).toBe(1);
        expect(promptDocumentToTemplateText(body)).toBe(oldBody.replace(/\r\n?/g, '\n'));
        if (n < PROMPT_SEEDS.length) {
          const values = Object.fromEntries([...oldBody.matchAll(/\{\{([^}]+)\}\}/g)].map(m => [m[1], '测试值 {{literal}}']));
          expect(renderPromptDocument(body, values)).toBe(oldBody.replace(/\{\{([^}]+)\}\}/g, (_: string, key: string) => values[key]));
        }
      });
      expect(promptDocumentIssues(after.at(-1).body)).not.toEqual([]);
      await migrateWithClient(c);
      expect(await rows()).toEqual(after);
      expect((await c.query("SELECT data_type FROM information_schema.columns WHERE table_schema=$1 AND table_name='prompt_templates' AND column_name='body'", [schema])).rows[0].data_type).toBe('jsonb');
    } finally {
      await c.query('RESET search_path');
      await c.query('DROP SCHEMA IF EXISTS ' + schema + ' CASCADE');
      c.release();
    }
  }, 30000);

  it('writes canonical JSONB, projects compatibility text, rejects old PATCH and keeps ordinary braces literal', async () => {
    const data = template(literal('普通 {{range.label}} 与 {{input.action}}')),
      created = await req('POST', '/api/v2/prompt-templates', data);
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(created.body.bodyJson).toEqual(data.bodyJson);
    expect(created.body.body).toBe('普通 {{range.label}} 与 {{input.action}}');
    const stored = (await getPool().query('SELECT body,jsonb_typeof(body) AS kind FROM prompt_templates WHERE id=$1', [created.body.id])).rows[0];
    expect(stored.kind).toBe('object');
    expect(stored.body).toEqual(data.bodyJson);
    const preview = await req('POST', '/api/v2/prompt-previews', { draft: data });
    expect(preview.status).toBe(200);
    expect(preview.body.diagnostics).toEqual([]);
    expect(preview.body.text).toBe('普通 {{range.label}} 与 {{input.action}}');
    expect((await req('PATCH', '/api/v2/prompt-templates/' + created.body.id, { ...data, bodyJson: undefined, body: '旧客户端覆盖', revision: 1 })).status).toBe(409);
    const oldLiteral = await req('PATCH', '/api/v2/prompt-templates/' + created.body.id, { ...data, bodyJson: undefined, body: '{{input.not_defined}} {{ Bad }}', revision: 1 });
    expect(oldLiteral.status).toBe(409);
    expect(oldLiteral.body.error.code).toBe('TEMPLATE_FORMAT_UPGRADED');
    expect((await req('PATCH', '/api/v2/prompt-templates/' + created.body.id, { ...data, body: '双写', revision: 1 })).status).toBe(400);
    const updated = await req('PATCH', '/api/v2/prompt-templates/' + created.body.id, { ...data, revision: 1 });
    expect(updated.status).toBe(200);
    expect(updated.body.revision).toBe(2);
    expect((await req('GET', '/api/v2/prompt-templates/' + created.body.id)).body.bodyJson).toEqual(data.bodyJson);
  });

  it('imports legacy creation and blocks empty, malformed, unknown and unsupported documents on save', async () => {
    const legacy = await req('POST', '/api/v2/prompt-templates', { title: '旧入口', system: 'meihua', body: '{{range.label}}', inputsSchema: [], dataRequirements: [] });
    expect(legacy.status).toBe(201);
    expect(legacy.body.bodyJson.doc.content[0].content[0]).toEqual({ type: 'promptVariable', attrs: { name: 'range.label' } });
    const blocked = await req('POST', '/api/v2/prompt-previews', { templateId: legacy.body.id, revision: 1 });
    expect(blocked.body.diagnostics.join()).toContain('引用内容缺失');
    for (const bodyJson of [literal('   '), importLegacyPrompt('{{invalid name}}'), importLegacyPrompt('{{unknown.value}}'), { ...literal('正常'), schemaVersion: 2 }]) {
      expect((await req('POST', '/api/v2/prompt-templates', template(bodyJson as PromptDocument))).status).toBe(400);
    }
    expect((await req('POST', '/api/v2/prompt-templates', { ...template(literal('正常')), body: '双写' })).status).toBe(400);
  });

  it('accepts JSON larger than the old 1MiB transport limit and distinguishes 400 document and 413 transport limits', async () => {
    const document: PromptDocument = { schemaVersion: 1, doc: { type: 'doc', content: [{ type: 'paragraph', content: Array.from({ length: 22000 }, (_, n) => ({ type: 'text' as const, text: '字', marks: [{ type: n % 2 ? 'bold' as const : 'italic' as const }] })) }] } };
    expect(Buffer.byteLength(JSON.stringify(document))).toBeGreaterThan(1024 * 1024);
    const created = await req('POST', '/api/v2/prompt-templates', template(document));
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect((await req('PATCH', '/api/v2/prompt-templates/' + created.body.id, { ...template(document), revision: 1 })).status).toBe(200);
    const preview = await req('POST', '/api/v2/prompt-previews', { draft: template(document) });
    expect(preview.status).toBe(200);
    expect(preview.body.text).toBe('字'.repeat(22000));
    const tooLarge = { schemaVersion: 1, doc: { type: 'doc', content: [{ type: 'paragraph', content: Array.from({ length: 30000 }, () => ({ type: 'text', text: '字', marks: [{ type: 'bold' }, { type: 'italic' }] })) }] } };
    const invalid = await req('POST', '/api/v2/prompt-templates', template(tooLarge as PromptDocument));
    expect(invalid.status).toBe(400);
    expect(JSON.stringify(invalid.body)).toContain('2 MiB');
    for (const [method, url, size] of [['POST', '/api/v2/prompt-templates', 3], ['PATCH', '/api/v2/prompt-templates/' + created.body.id, 3], ['POST', '/api/v2/prompt-previews', 6], ['POST', '/api/auth/register', 1]] as const) {
      const r = await req(method, url, { padding: 'x'.repeat(size * 1024 * 1024) });
      expect(r.status).toBe(413);
      expect(r.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    }
  }, 30000);
});
