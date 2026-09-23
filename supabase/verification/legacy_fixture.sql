-- Run only in a disposable database after 20260615000000_initial_schema.sql
-- and before the five incremental migrations. All identifiers and content are
-- synthetic. Do not execute on a shared or production database.
insert into public.usuarios (id, nome, email, senha_hash)
values (
  '00000000-0000-4000-8000-000000000101',
  'Pessoa de Teste',
  'fixture-legacy@revive.invalid',
  'synthetic-hash-not-for-login'
);

insert into public.vicios (
  id, usuario_id, nome_vicio, data_inicio, valor_economizado_por_dia
) values (
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000101',
  'Hábito fictício',
  '2026-01-01 12:00:00',
  12.50
);

insert into public.registros_diarios (id, vicio_id, data_registro, humor)
values (
  '00000000-0000-4000-8000-000000000301',
  '00000000-0000-4000-8000-000000000201',
  '2026-01-02',
  'bem'
);

insert into public.historico_recaidas (id, vicio_id, data_recaida, motivo)
values (
  '00000000-0000-4000-8000-000000000401',
  '00000000-0000-4000-8000-000000000201',
  '2026-01-03 12:00:00',
  'Motivo fictício'
);

insert into public.metas (id, usuario_id, vicio_id, descricao_meta, dias_objetivo)
values (
  '00000000-0000-4000-8000-000000000501',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000201',
  'Meta fictícia',
  7
);

insert into public.mensagens_motivacionais (id, mensagem, tipo_vicio)
values (
  '00000000-0000-4000-8000-000000000601',
  'Mensagem fictícia',
  'geral'
);

insert into public.marcos (id, vicio_id, tipo_marco, dias_abstinencia, data_marco)
values (
  '00000000-0000-4000-8000-000000000701',
  '00000000-0000-4000-8000-000000000201',
  'teste',
  1,
  '2026-01-02 12:00:00'
);
