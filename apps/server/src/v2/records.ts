import { normalizePromptDocument, promptDocumentToTemplateText, type NoteRecord, type MeihuaDraft, type PromptTemplate } from '@dongxuan/dto';
import { iso, type Row } from './store.js';
export const noteRecord = (r: Row): NoteRecord => ({ id: r.id, chartId: r.chart_id, snapshotId: r.snapshot_id, body: r.body, revision: r.revision, createdAt: iso(r.created_at), updatedAt: iso(r.updated_at) });
export const meihuaRecord = (r: Row): MeihuaDraft => ({ id: r.id, question: r.question, numberA: Number(r.number_a), numberB: Number(r.number_b), chartId: r.chart_id, status: 'raw', revision: r.revision, createdAt: iso(r.created_at), updatedAt: iso(r.updated_at) });
export const templateRecord = (r: Row): PromptTemplate => {
  const bodyJson = normalizePromptDocument(r.body);
  return { id: r.id, title: r.title, system: r.system, bodyJson, body: promptDocumentToTemplateText(bodyJson), inputsSchema: r.inputs_schema, dataRequirements: r.data_requirements, missingPolicy: r.missing_policy ?? undefined, revision: r.revision, variableSchemaVersion: r.variable_schema_version, createdAt: iso(r.created_at), updatedAt: iso(r.updated_at) };
};
