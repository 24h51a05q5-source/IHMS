import React from 'react';
import { View, Text, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { colors, borderRadius, shadows, spacing } from '../theme/theme';

interface StatCardProps {
  label: string;
  value: string | number;
  subValue?: string;
  accentColor?: string;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  subValue,
  accentColor = colors.primary,
  icon,
  style,
}) => {
  return (
    <View style={[styles.card, { borderTopColor: accentColor }, style]}>
      <View style={styles.headerRow}>
        <Text style={styles.label}>{label}</Text>
        {icon && <View style={styles.iconBox}>{icon}</View>}
      </View>
      <Text style={styles.value}>{value}</Text>
      {subValue && <Text style={styles.subValue}>{subValue}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.cardBg,
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    borderColor: colors.borderContainer,
    borderTopWidth: 4,
    padding: spacing.md,
    ...shadows.card,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  label: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  iconBox: {
    padding: spacing.xs,
  },
  value: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.textHeading,
    letterSpacing: -0.5,
  },
  subValue: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
});
