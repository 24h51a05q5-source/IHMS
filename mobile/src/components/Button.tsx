import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  StyleProp,
} from 'react-native';
import { colors, borderRadius, spacing } from '../theme/theme';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon,
  style,
  textStyle,
}) => {
  const getButtonStyles = () => {
    switch (variant) {
      case 'secondary':
        return styles.btnSecondary;
      case 'outline':
        return styles.btnOutline;
      case 'danger':
        return styles.btnDanger;
      default:
        return styles.btnPrimary;
    }
  };

  const getTextStyles = () => {
    switch (variant) {
      case 'secondary':
        return styles.textSecondary;
      case 'outline':
        return styles.textOutline;
      case 'danger':
        return styles.textDanger;
      default:
        return styles.textPrimary;
    }
  };

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      disabled={disabled || loading}
      style={[
        styles.baseButton,
        getButtonStyles(),
        styles[`size_${size}`],
        disabled && styles.btnDisabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'outline' ? colors.primary : colors.textWhite} size="small" />
      ) : (
        <>
          {icon && <>{icon}</>}
          <Text style={[styles.baseText, getTextStyles(), styles[`textSize_${size}`], textStyle]}>
            {title}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  baseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.md,
    gap: spacing.sm,
  },
  btnPrimary: {
    backgroundColor: colors.primary,
    borderWidth: 1.5,
    borderColor: colors.borderContainer,
  },
  btnSecondary: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1.5,
    borderColor: colors.borderNormal,
  },
  btnOutline: {
    backgroundColor: colors.cardBg,
    borderWidth: 1.5,
    borderColor: colors.borderNormal,
  },
  btnDanger: {
    backgroundColor: colors.danger,
    borderWidth: 1.5,
    borderColor: colors.borderContainer,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  size_sm: {
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md,
  },
  size_md: {
    paddingVertical: spacing.sm + 4,
    paddingHorizontal: spacing.lg,
  },
  size_lg: {
    paddingVertical: spacing.md + 2,
    paddingHorizontal: spacing.xl,
  },
  baseText: {
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  textPrimary: {
    color: colors.textWhite,
  },
  textSecondary: {
    color: colors.textPrimary,
  },
  textOutline: {
    color: colors.textPrimary,
  },
  textDanger: {
    color: colors.textWhite,
  },
  textSize_sm: {
    fontSize: 12,
  },
  textSize_md: {
    fontSize: 14,
  },
  textSize_lg: {
    fontSize: 16,
  },
});
