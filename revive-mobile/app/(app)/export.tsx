import React from 'react';
import { useRouter } from 'expo-router';
import { SelectiveExport } from '@/features/export/selective-export';
import { AppButton, Screen } from '@/ui/components';

export default function ExportScreen() {
  const router = useRouter();
  return (
    <Screen>
      <AppButton title="Voltar" variant="secondary" onPress={() => router.back()} />
      <SelectiveExport />
    </Screen>
  );
}
