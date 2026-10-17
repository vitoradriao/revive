import React, { forwardRef, useEffect, useState } from 'react';
import { Keyboard, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dateFromKey, displayDate, localDateKey, maskDate, parseDate } from '@/domain/formats';
import { AppButton, Field, textStyles } from './components';
import { colors, radius, spacing } from './theme';

const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const week = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const minDate = '1900-01-01';

export function DateCalendar({ selected, onSelect, maxDate = localDateKey(), todayKey = localDateKey(), activity, onMonthChange }: { selected: string; onSelect: (iso: string) => void; maxDate?: string; todayKey?: string; activity?: Set<string>; onMonthChange?: (range: { inicio: string; fim: string }) => void }) {
  const [page, setPage] = useState(() => dateFromKey(selected >= minDate && selected <= maxDate ? selected : maxDate));
  const [mode, setMode] = useState<'days' | 'months' | 'years'>('days');
  const year = page.getFullYear(), month = page.getMonth();
  useEffect(() => {
    if (mode === 'days') onMonthChange?.({ inicio: localDateKey(new Date(year, month, 1, 12)), fim: localDateKey(new Date(year, month + 1, 0, 12)) });
  }, [year, month, mode, onMonthChange]);
  const today = todayKey;
  const maximumYear = dateFromKey(maxDate).getFullYear();
  const heading = mode === 'days' ? `${months[month]} ${year}` : mode === 'months' ? `${year}` : 'Escolha o ano';
  const changePage = (direction: number) => setPage(new Date(year + (mode === 'months' ? direction : 0), month + (mode === 'days' ? direction : 0), 1, 12));
  const canPrevious = mode === 'days' ? year > 1900 || month > 0 : year > 1900;
  const canNext = mode === 'days' ? localDateKey(new Date(year, month + 1, 1, 12)) <= maxDate : year < maximumYear;
  const offset = new Date(year, month, 1, 12).getDay();
  const count = new Date(year, month + 1, 0, 12).getDate();
  const cells = Array.from({ length: Math.ceil((offset + count) / 7) * 7 }, (_, index) => {
    const day = index - offset + 1;
    return day > 0 && day <= count ? localDateKey(new Date(year, month, day, 12)) : null;
  });
  return <View style={styles.calendar}>
    <View style={styles.navigation}>
      <Pressable accessibilityRole="button" accessibilityLabel={mode === 'days' ? 'Mês anterior' : 'Ano anterior'} disabled={!canPrevious || mode === 'years'} accessibilityState={{ disabled: !canPrevious || mode === 'years' }} onPress={() => changePage(-1)} style={[styles.icon, (!canPrevious || mode === 'years') && styles.disabled]}><ChevronLeft color={colors.text} size={22} /></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={mode === 'days' ? 'Escolher mês e ano' : mode === 'months' ? 'Escolher ano' : 'Voltar aos dias'} onPress={() => setMode(mode === 'days' ? 'months' : mode === 'months' ? 'years' : 'days')} style={styles.monthTitle}>
        <Text style={styles.heading}>{heading}</Text><ChevronDown size={16} color={colors.primary} />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={mode === 'days' ? 'Próximo mês' : 'Próximo ano'} disabled={!canNext || mode === 'years'} accessibilityState={{ disabled: !canNext || mode === 'years' }} onPress={() => changePage(1)} style={[styles.icon, (!canNext || mode === 'years') && styles.disabled]}><ChevronRight color={colors.text} size={22} /></Pressable>
    </View>
    {mode === 'days' ? <View style={styles.grid}>
      {week.map((day, i) => <View key={`week-${i}`} style={styles.cell}><Text accessibilityLabel={['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'][i]} style={styles.weekday}>{day}</Text></View>)}
      {cells.map((iso, index) => iso ? <View key={iso} style={styles.cell}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${displayDate(iso)}${activity?.has(iso) ? ', com atividade' : ''}`} accessibilityState={{ selected: iso === selected, disabled: iso > maxDate }} disabled={iso > maxDate} onPress={() => onSelect(iso)} style={[styles.day, iso === today && styles.today, iso === selected && styles.selected, iso > maxDate && styles.disabled]}>
          <Text style={[styles.dayText, iso === selected && styles.selectedText]}>{Number(iso.slice(-2))}</Text>
          {activity?.has(iso) ? <View style={[styles.dot, iso === selected && { backgroundColor: colors.background }]} /> : null}
        </Pressable>
      </View> : <View key={`blank-${index}`} style={styles.cell} />)}
    </View> : mode === 'months' ? <View style={styles.grid}>
      {months.map((name, i) => {
        const disabled = localDateKey(new Date(year, i, 1, 12)) > maxDate;
        return <Pressable key={name} accessibilityRole="button" accessibilityLabel={`${name} de ${year}`} accessibilityState={{ disabled }} disabled={disabled} style={[styles.option, disabled && styles.disabled]} onPress={() => { setPage(new Date(year, i, 1, 12)); setMode('days'); }}><Text style={styles.dayText}>{name.slice(0, 3)}</Text></Pressable>;
      })}
    </View> : <ScrollView style={styles.years} contentContainerStyle={styles.grid} nestedScrollEnabled>
      {Array.from({ length: maximumYear - 1899 }, (_, i) => maximumYear - i).map((option) => <Pressable key={option} accessibilityRole="button" accessibilityLabel={`Ano ${option}`} style={[styles.option, option === year && styles.today]} onPress={() => { setPage(new Date(option, 0, 1, 12)); setMode('months'); }}><Text style={styles.dayText}>{option}</Text></Pressable>)}
    </ScrollView>}
    <View style={styles.footer}>
      <Text style={styles.legend}>Toque no mês para mudar mês e ano</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Selecionar hoje" disabled={today > maxDate} style={styles.todayLink} onPress={() => { setPage(dateFromKey(today)); setMode('days'); onSelect(today); }}><Text style={styles.link}>Hoje</Text></Pressable>
    </View>
  </View>;
}

export const DateField = forwardRef<TextInput, { label: string; value: string; onChangeText: (text: string) => void; onBlur?: () => void; error?: string; maxDate?: string; todayKey?: string; editable?: boolean }>(function DateField({ label, value, onChangeText, onBlur, error, maxDate = localDateKey(), todayKey, editable = true }, ref) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(maxDate);
  const insets = useSafeAreaInsets();
  const dismiss = () => { setOpen(false); onBlur?.(); };
  const show = () => {
    Keyboard.dismiss();
    const date = parseDate(value);
    setDraft(date && date <= maxDate ? date : maxDate);
    setOpen(true);
  };
  return <>
    <Field ref={ref} label={label} value={value} editable={editable} onChangeText={(text) => onChangeText(maskDate(text))} onBlur={onBlur} error={error} hint="Digite dia, mês e ano ou abra o calendário." placeholder="DD/MM/AAAA" keyboardType="number-pad" maxLength={10}
      trailing={<Pressable accessibilityRole="button" accessibilityLabel={`Abrir calendário: ${label}`} disabled={!editable} onPress={show} style={styles.icon}><CalendarDays color={colors.primary} size={23} /></Pressable>} />
    <Modal visible={open} transparent animationType="fade" onRequestClose={dismiss} statusBarTranslucent>
      <View style={styles.overlay}>
        <Pressable accessibilityRole="button" accessibilityLabel="Fechar calendário" onPress={dismiss} style={StyleSheet.absoluteFill} />
        <View accessibilityViewIsModal style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
          <View style={styles.handle} />
          <View style={styles.sheetHeader}><View style={{ flex: 1 }}><Text style={styles.eyebrow}>ESCOLHA UMA DATA</Text><Text style={textStyles.heading}>{label}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Cancelar seleção de data" style={styles.icon} onPress={dismiss}><X color={colors.muted} size={22} /></Pressable></View>
          <ScrollView bounces={false} keyboardShouldPersistTaps="handled">
            <View style={styles.datePreview}><CalendarDays size={24} color={colors.primary} /><View><Text style={styles.previewText}>{displayDate(draft)}</Text><Text style={styles.legend}>{dateFromKey(draft).toLocaleDateString('pt-BR', { weekday: 'long' })}</Text></View></View>
            {open ? <DateCalendar selected={draft} onSelect={setDraft} maxDate={maxDate} todayKey={todayKey} /> : null}
          </ScrollView>
          <AppButton title="Usar esta data" onPress={() => { onChangeText(displayDate(draft)); dismiss(); }} />
        </View>
      </View>
    </Modal>
  </>;
});

const styles = StyleSheet.create({
  calendar: { gap: spacing.sm }, navigation: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  icon: { minWidth: 44, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  monthTitle: { flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  heading: { color: colors.text, fontSize: 17, fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' }, cell: { width: `${100 / 7}%`, minHeight: 42, alignItems: 'center', justifyContent: 'center' },
  weekday: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  day: { width: '96%', minHeight: 44, borderRadius: 14, borderWidth: 1, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  dayText: { color: colors.text, fontSize: 15, fontWeight: '600' }, today: { borderWidth: 1, borderColor: colors.primary },
  selected: { backgroundColor: colors.primary }, selectedText: { color: colors.background, fontWeight: '900' }, disabled: { opacity: 0.25 },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.primary, position: 'absolute', bottom: 4 },
  option: { width: '25%', minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm }, years: { maxHeight: 264 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'space-between', borderTopWidth: 1, borderColor: colors.border, paddingTop: 4 },
  legend: { color: colors.muted, fontSize: 12, flexShrink: 1 }, todayLink: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 }, link: { color: colors.primary, fontWeight: '800' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end', alignItems: 'center' },
  sheet: { width: '100%', maxWidth: 480, maxHeight: '92%', backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 12 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center' },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 }, eyebrow: { color: colors.primary, fontSize: 10, fontWeight: '800', letterSpacing: 1.4, marginBottom: 4 },
  datePreview: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surfaceRaised, borderRadius: radius.md, padding: spacing.md, marginBottom: 8 },
  previewText: { color: colors.primary, fontSize: 27, fontWeight: '800' },
});
