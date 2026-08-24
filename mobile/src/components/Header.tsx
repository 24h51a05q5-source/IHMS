import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors, spacing, borderRadius } from '../theme/theme';

interface HeaderProps {
  title?: string;
  subtitle?: string;
  onLogout?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  title = 'IHMS',
  subtitle,
  onLogout,
}) => {
  return (
    <View style={styles.header}>
      <View style={styles.titleContainer}>
        <Text style={styles.brandTitle}>IHMS</Text>
        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>

      {onLogout && (
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={onLogout}
          style={styles.logoutBtn}
        >
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.navActiveBg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 2,
    borderBottomColor: colors.borderContainer,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleContainer: {
    flex: 1,
  },
  brandTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.primary,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    marginTop: 1,
  },
  logoutBtn: {
    backgroundColor: colors.cardBg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.borderNormal,
  },
  logoutText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.danger,
  },
});
