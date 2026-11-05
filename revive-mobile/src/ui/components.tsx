import React, { forwardRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type PressableProps,
  type TextInputProps,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Eye, EyeOff } from 'lucide-react-native';
import { colors, fonts, radius, spacing } from './theme';

export function Screen({ children, scroll = true }: React.PropsWithChildren<{ scroll?: boolean }>) {
  const content = scroll ? (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">{children}</ScrollView>
  ) : (
    <View style={styles.content}>{children}</View>
  );
  return <SafeAreaView style={styles.screen}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>{content}</KeyboardAvoidingView></SafeAreaView>;
}

export function Card({ children, style }: React.PropsWithChildren<{ style?: object }>) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function AppButton({ title, variant = 'primary', loading = false, accessibilityState, style, ...props }: PressableProps & { title: string; variant?: 'primary' | 'secondary' | 'danger' | 'softDanger'; loading?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel || title}
      accessibilityState={{ ...accessibilityState, disabled: props.disabled || loading, busy: loading }}
      {...props}
      style={(state) => [
        styles.button,
        variant === 'secondary' && styles.buttonSecondary,
        variant === 'danger' && styles.buttonDanger,
        variant === 'softDanger' && styles.buttonSoftDanger,
        state.pressed && styles.pressed,
        (props.disabled || loading) && styles.disabled,
        typeof style === 'function' ? style(state) : style,
      ]}
      disabled={props.disabled || loading}
    >
      {loading ? <ActivityIndicator color={variant === 'secondary' ? colors.primary : variant === 'softDanger' ? colors.danger : colors.background} /> : <Text style={[styles.buttonText, variant === 'secondary' && styles.buttonSecondaryText, variant === 'softDanger' && { color: colors.danger }]}>{title}</Text>}
    </Pressable>
  );
}

export const Field = forwardRef<TextInput, TextInputProps & { label: string; error?: string; hint?: string; trailing?: React.ReactNode; compact?: boolean }>(function Field({ label, error, hint, trailing, secureTextEntry, compact = false, ...props }, ref) {
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(false);
  const action = trailing || (secureTextEntry ? <Pressable accessibilityRole="button" accessibilityLabel={visible ? 'Ocultar senha' : 'Mostrar senha'} onPress={() => setVisible(!visible)} style={styles.inputAction}>{visible ? <EyeOff size={21} color={colors.primary} /> : <Eye size={21} color={colors.primary} />}</Pressable> : null);
  return (
    <View style={styles.fieldWrap}>
      <View style={styles.labelRow}><Text style={[styles.label, { flex: 1 }]}>{label}</Text>{props.multiline && props.maxLength ? <Text style={styles.counter}>{props.value?.length || 0}/{props.maxLength}</Text> : null}</View>
      <View style={[styles.inputRow, focused && styles.inputFocused, error && styles.inputError]}>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        selectionColor={colors.primary}
        {...props}
        secureTextEntry={secureTextEntry && !visible}
        onFocus={(event) => { setFocused(true); props.onFocus?.(event); }}
        onBlur={(event) => { setFocused(false); props.onBlur?.(event); }}
        style={[styles.input, props.multiline && styles.inputMultiline, props.multiline && compact && { minHeight: 56, paddingTop: 12, paddingBottom: 12 }, props.style]}
      />
      {action}
      </View>
      {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
});

export function PageTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.titleWrap}>
      <Text accessibilityRole="header" style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function LoadingState({ label = 'Carregando...' }: { label?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.primary} size="large" />
      <Text style={styles.subtitle}>{label}</Text>
    </View>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <Card style={styles.center}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.subtitle}>{body}</Text>
    </Card>
  );
}

export function DataUnavailable({ onRetry }: { onRetry: () => void }) {
  return <Card>
    <Text accessibilityRole="header" style={textStyles.heading}>Seus dados ainda não estão disponíveis.</Text>
    <Text style={textStyles.body}>Não foi possível carregar sua jornada. Tente atualizar os dados.</Text>
    <AppButton title="Atualizar dados" variant="secondary" onPress={onRetry} />
  </Card>;
}

export const textStyles = StyleSheet.create({
  heading: { color: colors.text, fontFamily: fonts.sans, fontSize: 22, fontWeight: '700' },
  body: { color: colors.text, fontFamily: fonts.sans, fontSize: 16, lineHeight: 23 },
  muted: { color: colors.muted, fontFamily: fonts.sans, fontSize: 14, lineHeight: 20 },
  value: { color: colors.text, fontFamily: fonts.sans, fontSize: 28, fontWeight: '700' },
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: 40, gap: spacing.md, flexGrow: 1, width: '100%', maxWidth: 640, alignSelf: 'center' },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
  button: { minHeight: 50, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.text },
  buttonSecondary: { backgroundColor: 'transparent', borderColor: colors.border, borderWidth: 1 },
  buttonDanger: { backgroundColor: colors.danger },
  buttonSoftDanger: { backgroundColor: colors.peach },
  buttonText: { color: colors.background, fontFamily: fonts.sans, fontWeight: '700', fontSize: 16, textAlign: 'center' },
  buttonSecondaryText: { color: colors.primary },
  pressed: { opacity: 0.78 },
  disabled: { opacity: 0.45 },
  fieldWrap: { gap: spacing.xs },
  label: { color: colors.text, fontSize: 14, fontWeight: '700' },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md },
  input: { flex: 1, minWidth: 0, minHeight: 50, color: colors.text, paddingHorizontal: spacing.md, fontFamily: fonts.sans, fontSize: 16 },
  inputFocused: { borderColor: colors.primary },
  inputAction: { width: 48, minHeight: 50, alignItems: 'center', justifyContent: 'center' },
  hint: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  counter: { color: colors.muted, fontSize: 12, textAlign: 'right' },
  inputMultiline: { minHeight: 96, paddingTop: spacing.md, textAlignVertical: 'top' },
  inputError: { borderColor: colors.danger },
  error: { color: colors.danger, fontSize: 13 },
  titleWrap: { gap: spacing.xs, marginBottom: spacing.sm },
  title: { color: colors.text, fontFamily: fonts.sans, fontSize: 34, lineHeight: 38, fontWeight: '700', letterSpacing: -1.2 },
  subtitle: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  center: { alignItems: 'center', justifyContent: 'center', gap: spacing.md, flex: 1 },
  cardTitle: { color: colors.text, fontSize: 20, fontWeight: '800', textAlign: 'center' },
});
