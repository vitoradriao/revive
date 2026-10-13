export type User = {
  id: string;
  nome: string;
  email: string;
};

export type AuthSession = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  usuario: User;
};

export type Addiction = {
  id: string;
  usuario_id: string;
  nome_vicio: string;
  data_inicio: string;
  data_ultima_recaida?: string | null;
  valor_economizado_por_dia?: number | string | null;
  dias_abstinencia?: number;
  valor_economizado?: number | string | null;
  tempo_formatado?: string;
  ativo?: boolean;
  revision?: number;
  inicio_editavel?: boolean;
  progresso?: ProgressSnapshot;
};

export type ProgressCoverage = 'confirmed' | 'inferred' | 'unknown';

export type PermanentMilestone = {
  id: string;
  vicio_id?: string | null;
  categoria: 'streak' | 'savings' | 'goals' | 'consistency';
  valor_alvo: number;
  awarded_at: string;
  origem: 'legacy' | 'period_threshold' | 'snapshot_observation';
  cobertura: ProgressCoverage;
};

export type ProgressSnapshot = {
  sequencia_atual_dias: number | null;
  sequencia_atual_cobertura: ProgressCoverage;
  recorde_dias: number | null;
  recorde_cobertura: ProgressCoverage;
  dias_checkin: number;
  economia_sequencia: { valor_estimado: number | null; cobertura: ProgressCoverage };
  economia_acumulada: { valor_estimado: number | null; cobertura: ProgressCoverage };
  marcos: PermanentMilestone[];
  pendente?: boolean;
};

export type RecordPage = { registros: DailyRecord[]; next_cursor: string | null };
export type RecordFilter = { vicio_id?: string; inicio: string; fim: string; limit?: number; cursor?: string | null };
export type UpdateRecordInput = { expected_version: number; humor?: string | null; gatilhos?: string | null; conquistas?: string | null; observacoes?: string | null };

export type DailyRecord = {
  sync_error?: string | null;
  revision?: number;
  updated_at?: string;
  id: string;
  vicio_id: string;
  data_registro: string;
  humor?: string | null;
  gatilhos?: string | null;
  conquistas?: string | null;
  observacoes?: string | null;
  pending?: boolean;
};

export type Relapse = {
  id: string;
  vicio_id: string;
  data_recaida: string;
  motivo?: string | null;
  dias_abstinencia_perdidos?: number;
  resetar_contador?: boolean | null;
  pending?: boolean;
};

export type UrgeEvent = {
  id: string;
  usuario_id: string;
  vicio_id: string;
  occurred_at: string;
  timezone: string;
  intensidade: number;
  gatilhos: string[];
  nota: string | null;
  acao_realizada: string | null;
  resultado: string | null;
  created_at: string;
  updated_at: string;
  pending?: boolean;
};

export type UrgeEventCoverage = {
  total: number;
  retornados: number;
  tem_mais: boolean;
};

export type UrgeEventPage = {
  vontades: UrgeEvent[];
  next_cursor: string | null;
  cobertura: UrgeEventCoverage;
  atualizado_em: string;
};

export type Goal = {
  id: string;
  usuario_id: string;
  vicio_id?: string | null;
  descricao_meta: string;
  dias_objetivo?: number | string | null;
  valor_objetivo?: number | string | null;
  concluida?: boolean;
  iniciar_hoje?: boolean | string;
  data_inicio_meta?: string | null;
  dias_abstinencia_inicio?: number | string;
  valor_economizado_inicio?: number | string;
  vicios?: { nome_vicio: string } | null;
  pending?: boolean;
};

export type MotivationalMessage = {
  id?: string;
  mensagem: string;
  autor?: string | null;
  tipo_vicio?: string;
};

export type BootstrapData = {
  server_time: string;
  usuario: User;
  vicios: Addiction[];
  registros: DailyRecord[];
  recaidas: Relapse[];
  /** Only locally projected/paged events. The server bootstrap does not return unlimited history. */
  vontades?: UrgeEvent[];
  metas: Goal[];
  conquistas?: PermanentMilestone[];
  mensagem: MotivationalMessage | null;
};

export type CreateAddictionInput = {
  nome_vicio: string;
  data_inicio: string;
  valor_economizado_por_dia: number;
};

export type UpdateAddictionInput = { revision: number; nome_vicio?: string; data_inicio?: string; valor_economizado_por_dia?: number; ativo?: boolean };

export type CreateRecordInput = {
  vicio_id: string;
  humor: string;
  gatilhos?: string;
  conquistas?: string;
  observacoes?: string;
  data_registro?: string;
  timezone?: string;
};

export type CreateRelapseInput = {
  motivo?: string;
  resetarContador: boolean;
  occurred_at?: string;
  timezone?: string;
};

export type CreateUrgeEventInput = {
  vicio_id: string;
  occurred_at: string;
  timezone: string;
  intensidade: number;
  gatilhos?: string[];
  nota?: string | null;
  acao_realizada?: string | null;
  resultado?: string | null;
};

export type ListUrgeEventsInput = {
  vicio_id: string;
  inicio: string;
  fim: string;
  timezone: string;
  limit?: number;
  cursor?: string | null;
};

export type CreateGoalInput = {
  vicio_id: string;
  descricao_meta: string;
  dias_objetivo?: number;
  valor_objetivo?: number;
  iniciar_hoje: boolean;
  data_inicio_meta?: string | null;
};

export type QueueOperationType =
  | 'record.create'
  | 'record.update'
  | 'relapse.create'
  | 'urge.create'
  | 'goal.create'
  | 'goal.complete';

export type QueuedMutation = {
  resolvedRecordId?: string;
  id: string;
  userId: string;
  type: QueueOperationType | (string & {});
  payload: Record<string, unknown>;
  occurredAt: string;
  attempts: number;
  nextRetryAt: string;
  status: 'pending' | 'syncing' | 'failed';
  lastError?: string | null;
  needsRecovery?: boolean;
};
