import { describe, expect, it } from '@jest/globals';
import { createExportJson, EXPORT_SCHEMA_VERSION } from './json';
import type { BootstrapData } from '@/domain/types';

const data = {
  server_time: '2026-02-01T12:00:00Z',
  usuario: { id: 'ACCOUNT-ID-SENTINEL', nome: 'NOME-SENTINEL', email: 'EMAIL-SENTINEL@example.invalid' },
  vicios: [{ id: 'habit', usuario_id: 'ACCOUNT-ID-SENTINEL', nome_vicio: 'Hábito A', data_inicio: '2025-12-01' }],
  registros: [{ id: 'r1', vicio_id: 'habit', data_registro: '2026-01-30', humor: 'Bem', observacoes: 'texto escolhido' }],
  recaidas: [],
  metas: [],
  mensagem: null,
} as unknown as BootstrapData;

describe('createExportJson', () => {
  const generatedAt = new Date('2026-02-01T15:00:00Z');
  const json = createExportJson(data, generatedAt);
  const parsed = JSON.parse(json);

  it('inclui versão do esquema, data de geração e escopo de snapshot', () => {
    expect(parsed.schemaVersion).toBe(EXPORT_SCHEMA_VERSION);
    expect(parsed.generated_at).toBe('2026-02-01T15:00:00.000Z');
    expect(parsed.escopo).toBe('snapshot_local');
  });

  it('não contém identificadores da conta nem e-mail em nenhum ponto', () => {
    expect(json).not.toContain('ACCOUNT-ID-SENTINEL');
    expect(json).not.toContain('EMAIL-SENTINEL');
    expect(json).not.toContain('NOME-SENTINEL');
    expect(parsed.usuario).toBeUndefined();
    expect(parsed.vicios[0].usuario_id).toBeUndefined();
  });

  it('preserva os dados escolhidos pela pessoa', () => {
    expect(parsed.vicios[0]).toMatchObject({ id: 'habit', nome_vicio: 'Hábito A' });
    expect(parsed.registros[0]).toMatchObject({ humor: 'Bem', observacoes: 'texto escolhido' });
  });

  it('remove tokens e chaves de idempotência aninhados', () => {
    const withSecrets = { ...data, extra: { nested: [{ access_token: 'TOKEN-SENTINEL', idempotency_key: 'KEY-SENTINEL', ok: 1 }] } } as unknown as BootstrapData;
    const out = createExportJson(withSecrets, generatedAt);
    expect(out).not.toContain('TOKEN-SENTINEL');
    expect(out).not.toContain('KEY-SENTINEL');
    expect(JSON.parse(out).extra.nested[0]).toEqual({ ok: 1 });
  });
});
