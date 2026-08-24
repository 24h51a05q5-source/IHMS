import React from 'react';
import { View, Text, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { colors, borderRadius, spacing } from '../theme/theme';

interface BadgeProps {
  label: string;
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'primary';
  style?: StyleProp<ViewStyle>;
}

export const Badge: React.FC<BadgeProps> = ({ label, variant = 'neutral', style }) => {
  const getBadgeColors = () => {
    switch (variant) {
      case 'success':
        return { bg: colors.successBg, text: colors.success, border: colors.success };
      case 'warning':
        return { bg: colors.warningBg, text: colors.warning, border: colors.warning };
      case 'danger':
        return { bg: colors.dangerBg, text: colors.danger, border: colors.danger };
      case 'info':
        return { bg: colors.infoBg, text: colors.info, border: colors.info };
      case 'primary':
        return { bg: colors.primaryLight, text: colors.primary, border: colors.primary };
      default:
        return { bg: colors.surfaceSecondary, text: colors.textPrimary, border: colors.borderNormal };
    }
  };

  const badgeColors = getBadgeColors();

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: badgeColors.bg, borderColor: badgeColors.border },
        style,
      ]}
    >
      <Text style={[styles.text, { color: badgeColors.text }]}>{label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    borderWidth: 1.5,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 10.5,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
