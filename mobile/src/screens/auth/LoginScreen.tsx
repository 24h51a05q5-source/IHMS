import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { colors, spacing, borderRadius } from '../../theme/theme';
import { Card } from '../../components/Card';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { authService, UserProfile } from '../../services/auth';

interface LoginScreenProps {
  onLoginSuccess: (user: UserProfile) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Please enter both email and password');
      return;
    }

    try {
      setLoading(true);
      setError('');
      const { user } = await authService.login(email.trim(), password);
      onLoginSuccess(user);
    } catch (err: any) {
      const msg = err.message || 'Login failed. Please check credentials.';
      setError(msg);
      Alert.alert('Login Failed', msg);
    } finally {
      setLoading(false);
    }
  };

  const setDemoCreds = (demoEmail: string, demoPass: string) => {
    setEmail(demoEmail);
    setPassword(demoPass);
    setError('');
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Brand Header */}
        <View style={styles.brandHeader}>
          <View style={styles.logoBadge}>
            <Text style={styles.logoBadgeText}>IHMS</Text>
          </View>
          <Text style={styles.brandTitle}>IHMS ERP</Text>
          <Text style={styles.brandSubtitle}>Unified Hostel Management System</Text>
        </View>

        {/* Login Card */}
        <Card style={styles.loginCard}>
          <Text style={styles.cardHeading}>Sign In to Your Account</Text>
          <Text style={styles.cardSubheading}>
            Students, Hostel Owners, and Staff can sign in using registered credentials.
          </Text>

          {error ? <Text style={styles.globalError}>{error}</Text> : null}

          <Input
            label="Email Address"
            placeholder="e.g. student@ihms.local"
            value={email}
            onChangeText={(t) => {
              setEmail(t);
              setError('');
            }}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Input
            label="Password"
            placeholder="••••••••"
            value={password}
            onChangeText={(t) => {
              setPassword(t);
              setError('');
            }}
            secureTextEntry
          />

          <Button
            title="Sign In"
            onPress={handleLogin}
            loading={loading}
            size="lg"
            style={styles.signInBtn}
          />

          {/* Quick Demo Credentials */}
          <View style={styles.demoSection}>
            <Text style={styles.demoHeading}>Quick Demo Roles:</Text>
            <View style={styles.demoBtnRow}>
              <TouchableOpacity
                onPress={() => setDemoCreds('student@ihms.com', 'Admin@123')}
                style={styles.demoBtn}
              >
                <Text style={styles.demoBtnText}>Student</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setDemoCreds('owner@ihms.com', 'Admin@123')}
                style={styles.demoBtn}
              >
                <Text style={styles.demoBtnText}>Hostel Owner</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.pageBg,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  brandHeader: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  logoBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
    borderWidth: 2,
    borderColor: colors.borderContainer,
    marginBottom: spacing.sm,
  },
  logoBadgeText: {
    color: colors.textWhite,
    fontWeight: '900',
    fontSize: 16,
    letterSpacing: 1,
  },
  brandTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: colors.textHeading,
    letterSpacing: -0.5,
  },
  brandSubtitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    marginTop: 2,
  },
  loginCard: {
    padding: spacing.xl,
  },
  cardHeading: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.textHeading,
    marginBottom: spacing.xs,
  },
  cardSubheading: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.lg,
    lineHeight: 16,
  },
  globalError: {
    backgroundColor: colors.dangerBg,
    color: colors.danger,
    padding: spacing.sm,
    borderRadius: borderRadius.sm,
    borderWidth: 1.5,
    borderColor: colors.danger,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: spacing.md,
  },
  signInBtn: {
    marginTop: spacing.sm,
  },
  demoSection: {
    marginTop: spacing.xl,
    paddingTop: spacing.md,
    borderTopWidth: 1.5,
    borderTopColor: colors.borderNormal,
  },
  demoHeading: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textMuted,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  demoBtnRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  demoBtn: {
    flex: 1,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1.5,
    borderColor: colors.borderNormal,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  demoBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textPrimary,
  },
});
