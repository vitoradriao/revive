/**
 * Exportação seletiva no mobile (#27): seleção, prévia e arquivos do MESMO dataset capturado.
 *
 * - Mudar a seleção descarta a prévia; uma nova captura é exigida.
 * - Cancelar, sair ou trocar de conta interrompe a coleta e descarta o dataset.
 * - Compartilhar/imprimir só por ação explícita; o arquivo temporário é apagado após o seletor.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { apiFetch } from '@/core/api/client';
import { printExportHtml, shareExportFile } from '@/core/export/reporting';
import {
  buildPreview, cellValue, collectExport, datasetToCsv, datasetToHtml, datasetToJson, defaultSelection, exportFileName,
  ExportCancelledError, EXPORT_FIELDS, EXPORT_TYPES, validateSelection,
  type ExportDataset, type ExportSelection, type ExportType,
} from '@/core/export/selection';
import { useSession } from '@/features/auth/session-context';
import { useBootstrap } from '@/features/bootstrap/use-bootstrap';
import { AppButton, Card, Field, LoadingState, PageTitle, textStyles } from '@/ui/components';
import { colors, spacing } from '@/ui/theme';

const deviceTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

function Check({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{ checked }} onPress={onToggle}
      style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center', paddingVertical: spacing.xs, minHeight: 44 }}>
      <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: colors.primary, backgroundColor: checked ? colors.primary : 'transparent' }} />
      <Text style={[textStyles.body, { flexShrink: 1 }]}>{label}</Text>
    </Pressable>
  );
}

type Capture =
  | { status: 'idle' | 'collecting' | 'cancelled' }
  | { status: 'error'; message: string }
  | { status: 'ready'; dataset: ExportDataset };

const toggle = <T,>(list: T[], key: T) => (list.includes(key) ? list.filter((item) => item !== key) : [...list, key]);

export function SelectiveExport() {
  const { user } = useSession();
  const { data, isLoading } = useBootstrap();
  const userId = user?.id ?? null;
  const habits = useMemo(() => data?.vicios ?? [], [data?.vicios]);
  // Seleção e captura pertencem a uma conta e a um conjunto de hábitos: ao mudar, a seleção
  // volta ao padrão e qualquer captura anterior é ignorada (e a coleta em curso, abortada).
  const scope = `${userId ?? ''}:${habits.map((habit) => habit.id).join(',')}`;
  const [state, setState] = useState<{ scope: string; value: ExportSelection } | null>(null);
  const [captureState, setCapture] = useState<Capture & { scope?: string }>({ status: 'idle' });
  const [feedback, setFeedback] = useState('');
  const controller = useRef<AbortController | null>(null);
  const scopeRef = useRef(scope);
  useEffect(() => {
    scopeRef.current = scope;
    return () => controller.current?.abort();
  }, [scope]);
  const capture: Capture = captureState.scope === scope ? captureState : { status: 'idle' };

  if ((isLoading && !data) || !data) return <LoadingState />;
  const selection = state?.scope === scope ? state.value : defaultSelection({ habits, timezone: deviceTimezone() });
  const errors = validateSelection(selection, habits);
  const pendingCount = data ? [...data.registros, ...data.recaidas, ...data.metas, ...(data.vontades ?? [])].filter((row) => row.pending).length : 0;

  const update = (patch: Partial<ExportSelection>) => {
    controller.current?.abort();
    setCapture({ status: 'idle', scope });
    setFeedback('');
    setState({ scope, value: { ...selection, ...patch } });
  };

  const prepare = async () => {
    if (!userId) return;
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    const owner = scope;
    setCapture({ status: 'collecting', scope: owner });
    setFeedback('');
    try {
      const dataset = await collectExport({
        selection, habits, snapshot: data, pendingCount, signal: current.signal,
        isCurrent: () => scopeRef.current === owner,
        fetchPage: (path) => apiFetch(path, { signal: current.signal }),
      });
      if (!current.signal.aborted && scopeRef.current === owner) setCapture({ status: 'ready', dataset, scope: owner });
    } catch (error) {
      if (current.signal.aborted || error instanceof ExportCancelledError) setCapture({ status: 'cancelled', scope: owner });
      else setCapture({ status: 'error', message: 'Não foi possível preparar a exportação. Nenhum arquivo foi gerado.', scope: owner });
    }
  };
  const cancel = () => { controller.current?.abort(); setCapture({ status: 'cancelled', scope }); };
  const dataset = capture.status === 'ready' ? capture.dataset : null;
  const run = (action: () => Promise<unknown>) => {
    setFeedback('');
    void action().catch((error: Error) => setFeedback(error.message || 'Não foi possível concluir. Nenhum envio foi confirmado.'));
  };

  return (
    <>
      <PageTitle title="Exportar dados" subtitle="Escolha exatamente o que entra no arquivo antes de compartilhar." />
      <Text style={textStyles.muted}>Textos escritos por você e nomes dos hábitos ficam desmarcados até você escolher incluí-los. Nada é enviado automaticamente: o arquivo só sai pelo seletor do sistema, por sua ação.</Text>
      <Card>
        <Text accessibilityRole="header" style={textStyles.heading}>Hábitos</Text>
        {!habits.length ? <Text style={textStyles.body}>Nenhum hábito disponível.</Text> : null}
        {habits.map((habit) => (
          <Check key={habit.id} label={`${habit.nome_vicio}${habit.ativo === false ? ' (arquivado)' : ''}`}
            checked={selection.habitIds.includes(habit.id)} onToggle={() => update({ habitIds: toggle(selection.habitIds, habit.id) })} />
        ))}
        {errors.habitIds ? <Text accessibilityLiveRegion="polite" style={textStyles.body}>{errors.habitIds}</Text> : null}
      </Card>
      <Card>
        <Text accessibilityRole="header" style={textStyles.heading}>Período (datas inclusivas)</Text>
        <Field label="Início (AAAA-MM-DD)" value={selection.inicio} onChangeText={(inicio) => update({ inicio: inicio.trim() })} autoCapitalize="none" maxLength={10} error={errors.inicio} />
        <Field label="Fim (AAAA-MM-DD)" value={selection.fim} onChangeText={(fim) => update({ fim: fim.trim() })} autoCapitalize="none" maxLength={10} error={errors.fim} />
        <Field label="Fuso horário IANA" value={selection.timezone} onChangeText={(timezone) => update({ timezone: timezone.trim() })} autoCapitalize="none" maxLength={100} error={errors.timezone} />
      </Card>
      <Card>
        <Text accessibilityRole="header" style={textStyles.heading}>Tipos e campos</Text>
        {EXPORT_TYPES.map((type) => {
          const on = selection.types.includes(type.key);
          return (
            <View key={type.key} style={{ gap: spacing.xs }}>
              <Check label={type.label} checked={on} onToggle={() => update({ types: toggle(selection.types, type.key) })} />
              {on ? (
                <View accessibilityLabel={`Campos de ${type.label}`} style={{ paddingLeft: spacing.lg }}>
                  {EXPORT_FIELDS[type.key].map((field) => (
                    <Check key={field.key} label={`${field.label}${field.freeText ? ' (texto escrito por você)' : ''}`}
                      checked={selection.fields[type.key].includes(field.key)}
                      onToggle={() => update({ fields: { ...selection.fields, [type.key]: toggle(selection.fields[type.key], field.key) } })} />
                  ))}
                </View>
              ) : null}
            </View>
          );
        })}
        {errors.types || errors.fields ? <Text accessibilityLiveRegion="polite" style={textStyles.body}>{errors.types || errors.fields}</Text> : null}
      </Card>
      <Card>
        <Text accessibilityRole="header" style={textStyles.heading}>Opções</Text>
        <Check label="Incluir nomes dos hábitos" checked={selection.includeHabitNames} onToggle={() => update({ includeHabitNames: !selection.includeHabitNames })} />
        <Check label="Incluir metas sem data de início" checked={selection.includeUndatedGoals} onToggle={() => update({ includeUndatedGoals: !selection.includeUndatedGoals })} />
      </Card>
      <AppButton title="Preparar prévia" loading={capture.status === 'collecting'} disabled={Object.keys(errors).length > 0} onPress={() => void prepare()} />
      {capture.status === 'collecting' ? <AppButton title="Cancelar exportação" variant="secondary" onPress={cancel} /> : null}
      <View accessibilityLiveRegion="polite">
        {capture.status === 'collecting' ? <Text style={textStyles.body}>Carregando todas as páginas…</Text> : null}
        {capture.status === 'cancelled' ? <Text style={textStyles.body}>Exportação cancelada. Nenhum arquivo foi gerado.</Text> : null}
        {capture.status === 'error' ? <Text style={textStyles.body}>{capture.message}</Text> : null}
        {feedback ? <Text style={textStyles.body}>{feedback}</Text> : null}
      </View>
      {dataset ? <ExportPreview dataset={dataset} onAction={run} /> : null}
    </>
  );
}

function ExportPreview({ dataset, onAction }: { dataset: ExportDataset; onAction: (action: () => Promise<unknown>) => void }) {
  const preview = useMemo(() => buildPreview(dataset), [dataset]);
  const now = () => new Date().toISOString();
  return (
    <Card>
      <Text accessibilityRole="header" style={textStyles.heading}>Prévia ({preview.total} {preview.total === 1 ? 'item' : 'itens'})</Text>
      <Text accessibilityLiveRegion="polite" style={textStyles.body}>
        {preview.complete
          ? 'Todas as páginas dos tipos selecionados foram carregadas.'
          : `Exportação parcial: ${preview.incompleteSources.length} fonte(s) não foram carregadas por completo. O arquivo será identificado como parcial.`}
      </Text>
      <Text style={textStyles.muted}>
        Sem garantia transacional entre páginas.
        {preview.pendingExcluded ? ` ${preview.pendingExcluded} pendência(s) ainda não sincronizada(s) não entram no arquivo.` : ''}
        {dataset.duplicates ? ` ${dataset.duplicates} item(ns) repetido(s) entre páginas foram descartados.` : ''}
      </Text>
      {preview.types.map((type) => (
        <View key={type.type} style={{ gap: spacing.xs }}>
          <Text style={textStyles.body}>{type.label}: {type.count}{type.complete ? '' : ' (incompleto)'}</Text>
          <Text style={textStyles.muted}>Colunas: {type.columns.join(', ')}</Text>
          {type.sample.map((row, index) => (
            <Text key={index} style={textStyles.muted}>
              {['habito', ...dataset.selection.fields[type.type as ExportType]].map((key) => String(cellValue(row[key]) ?? '')).join(' · ')}
            </Text>
          ))}
        </View>
      ))}
      <AppButton title="Compartilhar CSV" variant="secondary" onPress={() => onAction(() => shareExportFile(exportFileName(dataset, 'csv'), datasetToCsv(dataset), 'text/csv'))} />
      <AppButton title="Compartilhar JSON" variant="secondary" onPress={() => onAction(() => shareExportFile(exportFileName(dataset, 'json'), datasetToJson(dataset, now()), 'application/json'))} />
      <AppButton title="Imprimir relatório" variant="secondary" onPress={() => onAction(() => printExportHtml(datasetToHtml(dataset, now())))} />
    </Card>
  );
}
