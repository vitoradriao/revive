import React from 'react';
import { View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { illustrations } from './illustration-sources';

export type IllustrationName = keyof typeof illustrations;

// The surrounding control/text describes meaning and state; the art is decorative.
export function Illustration({ name, size = 80, height = size }: { name: IllustrationName; size?: number; height?: number }) {
  return <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <SvgXml xml={illustrations[name]} width={size} height={height} accessible={false} />
  </View>;
}
