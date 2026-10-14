import React from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { colors, fonts, radius, spacing } from './theme';

export function Wordmark() {
  return <View accessible accessibilityLabel="Revive" style={styles.wordmark}>
    <View style={styles.wordmarkText}><Text style={styles.brand}>revive</Text><View style={styles.dot} /></View>
    <Svg width={90} height={22} viewBox="0 0 90 22" accessible={false}>
      <Path d="M4 7 C18 17 41 15 43 4 C45 -6 33 -4 36 6 C41 17 67 18 82 8" fill="none" stroke={colors.primary} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  </View>;
}

export function AppHeader({ section }: { section: string }) {
  return <View style={styles.header}><Wordmark /><Text style={styles.section}>{section.toLocaleUpperCase('pt-BR')}</Text></View>;
}

export function BackHeader({ section, onBack }: { section: string; onBack: () => void }) {
  return <View style={styles.header}>
    <Pressable accessibilityRole="button" accessibilityLabel="Voltar" onPress={onBack} style={styles.back}>
      <Svg width={22} height={22} viewBox="0 0 24 24" accessible={false}><Path d="m12 5-7 7 7 7 M5 12h15" stroke={colors.text} strokeWidth={1.7} fill="none" strokeLinecap="round" /></Svg>
    </Pressable>
    <Text style={[styles.section, { flex: 1, textAlign: 'left' }]}>{section.toLocaleUpperCase('pt-BR')}</Text>
    <Wordmark />
  </View>;
}

export function EditorialTitle({ title, emphasis, eyebrow }: { title: string; emphasis: string; eyebrow?: string }) {
  return <View style={styles.titleWrap}>
    {eyebrow ? <Text style={styles.eyebrow}>{eyebrow.toLocaleUpperCase('pt-BR')}</Text> : null}
    <Text accessibilityRole="header" style={styles.title}>{title}{'\n'}<Text style={styles.emphasis}>{emphasis}</Text></Text>
  </View>;
}

export function Flourish({ width = 110 }: { width?: number }) {
  return <Svg width={width} height={48} viewBox="0 0 130 52" accessible={false}>
    <Path d="M4 14 C53 -7 100 10 87 34 C77 53 40 42 55 26 C70 10 100 42 126 30" fill="none" stroke={colors.primary} strokeWidth={1.8} strokeLinecap="round" />
  </Svg>;
}

export function ArrowMark() {
  return <Svg width={20} height={20} viewBox="0 0 24 24" accessible={false}>
    <Path d="M7 7h10v10 M7 17 17 7" fill="none" stroke={colors.text} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>;
}

export function StatusCheck() {
  return <Svg width={22} height={22} viewBox="0 0 24 24" accessible={false}>
    <Circle cx={12} cy={12} r={11} fill={colors.text} />
    <Path d="m7 12 3 3 7-7" fill="none" stroke={colors.background} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>;
}

export function SectionTabs<T extends string>({ tabs, selected, onSelect }: { tabs: readonly { value: T; label: string }[]; selected: T; onSelect: (value: T) => void }) {
  const { width, fontScale } = useWindowDimensions();
  const compact = width < 360 || fontScale > 1.2;
  return <View accessibilityRole="tablist" style={styles.tabs}>
    {tabs.map(tab => <Pressable key={tab.value} accessibilityRole="tab" accessibilityState={{ selected: selected === tab.value }} onPress={() => onSelect(tab.value)} style={[styles.tab, compact && { flexBasis: '45%' }, selected === tab.value && styles.activeTab]}>
      <Text style={[styles.tabText, selected === tab.value && styles.activeTabText]}>{tab.label}</Text>
    </Pressable>)}
  </View>;
}

export function ActionRow({ title, subtitle, icon, onPress, tone = colors.lavender }: { title: string; subtitle: string; icon: React.ReactNode; onPress: () => void; tone?: string }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={({ pressed }) => [styles.actionRow, pressed && { opacity: 0.7 }]}>
    <View style={[styles.actionIcon, { backgroundColor: tone }]}>{icon}</View>
    <View style={styles.actionCopy}><Text style={styles.actionTitle}>{title}</Text><Text style={styles.actionSubtitle}>{subtitle}</Text></View>
    <ArrowMark />
  </Pressable>;
}

export const editorialStyles = StyleSheet.create({
  eyebrow: { color: colors.muted, fontFamily: fonts.sans, fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
  note: { color: colors.text, fontFamily: fonts.editorial, fontSize: 22, fontStyle: 'italic', lineHeight: 29 },
  largeValue: { color: colors.text, fontFamily: fonts.sans, fontSize: 72, fontWeight: '700', letterSpacing: -4 },
  pill: { backgroundColor: colors.background, paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill, alignSelf: 'flex-start' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  rule: { height: 1, backgroundColor: colors.border },
});

const styles = StyleSheet.create({
  wordmark: { width: 102 },
  wordmarkText: { flexDirection: 'row', alignItems: 'baseline' },
  brand: { color: colors.text, fontFamily: fonts.sans, fontWeight: '700', fontSize: 29, letterSpacing: -1.8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary, marginLeft: 6 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, marginBottom: spacing.sm },
  back: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -10 },
  section: { color: colors.primary, fontFamily: fonts.sans, fontWeight: '700', fontSize: 10, letterSpacing: 1.3, flexShrink: 1, textAlign: 'right' },
  titleWrap: { gap: 8, marginBottom: spacing.sm, flexShrink: 1 },
  eyebrow: editorialStyles.eyebrow,
  title: { color: colors.text, fontFamily: fonts.sans, fontSize: 34, fontWeight: '700', lineHeight: 39, letterSpacing: -1.4 },
  emphasis: { fontFamily: fonts.editorial, fontWeight: '400', fontStyle: 'italic' },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', borderBottomColor: colors.border, borderBottomWidth: 1 },
  tab: { flexGrow: 1, flexBasis: 65, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 3, borderBottomColor: 'transparent', paddingHorizontal: 5, paddingVertical: 10 },
  activeTab: { borderBottomColor: colors.primary },
  tabText: { fontFamily: fonts.sans, color: colors.muted, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  activeTabText: { color: colors.primary },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 80, paddingVertical: 16, borderBottomWidth: 1, borderColor: colors.border },
  actionIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  actionCopy: { flex: 1, gap: 5 },
  actionTitle: { fontFamily: fonts.sans, color: colors.text, fontSize: 16, fontWeight: '700' },
  actionSubtitle: { fontFamily: fonts.sans, color: colors.muted, fontSize: 13, lineHeight: 19 },
});
