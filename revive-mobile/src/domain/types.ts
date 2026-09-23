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
  valor_economizado?: number | string;
  tempo_formatado?: string;
  ativo?: boolean;
};

export type DailyRecord = {
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
  pending?: boolean;
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
  metas: Goal[];
  mensagem: MotivationalMessage | null;
};

export type CreateAddictionInput = {
  nome_vicio: string;
  data_inicio: string;
  valor_economizado_por_dia: number;
};

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
  | 'relapse.create'
  | 'goal.create'
  | 'goal.complete';

export type QueuedMutation = {
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
