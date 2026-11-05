import React from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Illustration, type IllustrationName } from './illustration';
import { colors, fonts, radius } from './theme';

const moods: readonly { label: string; art: IllustrationName }[] = [
  { label: 'Bem', art: 'humor-bem' },
  { label: 'Confiante', art: 'humor-confiante' },
  { label: 'Ansioso', art: 'humor-ansioso' },
  { label: 'Desanimado', art: 'humor-desanimado' },
];

export function MoodPicker({ value, onChange, disabled = false }: { value: string; onChange: (value: string) => void; disabled?: boolean }) {
  const { width, fontScale } = useWindowDimensions();
  const compact = width < 350 || fontScale > 1.2;
  return <View accessibilityRole="radiogroup" accessibilityLabel="Humor do check-in" style={styles.options}>
    {moods.map(mood => <Pressable key={mood.label} accessibilityRole="radio" accessibilityLabel={`Humor: ${mood.label}`} accessibilityState={{ checked: value === mood.label, disabled }} disabled={disabled} onPress={() => onChange(mood.label)} style={[styles.option, compact && { flexBasis: '45%' }, value === mood.label && styles.selected, disabled && { opacity: 0.5 }]}>
      <Illustration name={mood.art} size={46} />
      <Text style={styles.label}>{mood.label}</Text>
      {value === mood.label ? <Text accessible={false} style={styles.check}>✓</Text> : null}
    </Pressable>)}
  </View>;
}

const styles = StyleSheet.create({
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: { flexBasis: '21%', flexGrow: 1, minWidth: 60, minHeight: 90, paddingVertical: 8, paddingHorizontal: 3, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, gap: 4 },
  selected: { borderColor: colors.primary, backgroundColor: colors.lavender },
  label: { fontFamily: fonts.sans, fontSize: 10, color: colors.text, fontWeight: '700', textAlign: 'center' },
  check: { position: 'absolute', top: 2, right: 5, color: colors.primary, fontSize: 14, fontWeight: '700' },
});
