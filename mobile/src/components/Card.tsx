import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { colors, borderRadius, shadows, spacing } from '../theme/theme';

interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  noPadding?: boolean;
}

export const Card: React.FC<CardProps> = ({ children, style, noPadding }) => {
  return (
    <View style={[styles.card, noPadding ? null : styles.padding, style]}>
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.cardBg,
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    borderColor: colors.borderContainer,
    ...shadows.card,
  },
  padding: {
    padding: spacing.lg,
  },
});
