import React from 'react';
import { View } from 'react-native';
import { Tabs } from 'expo-router';
import { Heart, ListChecks, Target, ChartNoAxesCombined, UserRound } from 'lucide-react-native';
import { colors } from '@/ui/theme';

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarHideOnKeyboard: true, tabBarActiveTintColor: colors.primary, tabBarInactiveTintColor: colors.muted, tabBarStyle: { backgroundColor: colors.background, borderTopColor: colors.border, paddingTop: 8, minHeight: 70 }, tabBarLabelStyle: { fontSize: 10, marginTop: 5, marginBottom: 6 } }}>
      <Tabs.Screen name="index" options={{ title: 'Jornada', tabBarIcon: ({ focused }) => <TabIcon focused={focused}><Heart color={focused ? colors.background : colors.text} size={21} /></TabIcon> }} />
      <Tabs.Screen name="habits" options={{ title: 'Hábitos', tabBarIcon: ({ focused }) => <TabIcon focused={focused}><ListChecks color={focused ? colors.background : colors.text} size={21} /></TabIcon> }} />
      <Tabs.Screen name="goals" options={{ title: 'Metas', tabBarIcon: ({ focused }) => <TabIcon focused={focused}><Target color={focused ? colors.background : colors.text} size={21} /></TabIcon> }} />
      <Tabs.Screen name="insights" options={{ title: 'Insights', tabBarIcon: ({ focused }) => <TabIcon focused={focused}><ChartNoAxesCombined color={focused ? colors.background : colors.text} size={21} /></TabIcon> }} />
      <Tabs.Screen name="profile" options={{ title: 'Perfil', tabBarIcon: ({ focused }) => <TabIcon focused={focused}><UserRound color={focused ? colors.background : colors.text} size={21} /></TabIcon> }} />
    </Tabs>
  );
}

function TabIcon({ focused, children }: React.PropsWithChildren<{ focused: boolean }>) {
  return <View style={{ width: 48, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: focused ? colors.primary : 'transparent' }}>{children}</View>;
}
