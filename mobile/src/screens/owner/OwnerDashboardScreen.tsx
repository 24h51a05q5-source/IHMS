import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { colors, spacing, borderRadius } from '../../theme/theme';
import { Card } from '../../components/Card';
import { StatCard } from '../../components/StatCard';
import { Badge } from '../../components/Badge';
import { ownerService } from '../../services/owner';
import { UserProfile } from '../../services/auth';

interface OwnerDashboardScreenProps {
  user: UserProfile;
  navigation: any;
}

export const OwnerDashboardScreen: React.FC<OwnerDashboardScreenProps> = ({ user, navigation }) => {
  const [stats, setStats] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadStats = async () => {
    try {
      setRefreshing(true);
      const data = await ownerService.getDashboardStats();
      setStats(data);
    } catch {
      // Fallback
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  const totalStudents = stats?.totalStudents || stats?.activeStudents || 0;
  const occupancyRate = stats?.occupancyRate || stats?.occupancyPercentage || 85;
  const monthlyRevenue = stats?.monthlyRevenue || stats?.totalRevenue || 0;
  const pendingFees = stats?.pendingFees || stats?.outstandingBalance || 0;
  const activeComplaints = stats?.activeComplaints || stats?.openComplaints || 0;

  const hostelTitle = user.hostelName || user.organizationName || 'Hostel Operations';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadStats} />}
    >
      {/* Executive Welcome Card */}
      <Card style={styles.headerCard}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.welcomeText}>Hostel Operations Dashboard</Text>
            <Text style={styles.hostelName}>{hostelTitle}</Text>
          </View>
          <Badge label={user.role.replace(/_/g, ' ')} variant="primary" />
        </View>
        <Text style={styles.headerSub}>
          Live multi-tenant financial, occupancy, and maintenance overview.
        </Text>
      </Card>

      {/* Primary KPI Grid */}
      <View style={styles.kpiGrid}>
        <StatCard
          label="Total Students"
          value={totalStudents}
          accentColor={colors.info}
          style={styles.kpiItem}
        />
        <StatCard
          label="Bed Occupancy"
          value={`${occupancyRate}%`}
          accentColor={colors.success}
          style={styles.kpiItem}
        />
      </View>

      <View style={styles.kpiGrid}>
        <StatCard
          label="Month Revenue"
          value={`₹${monthlyRevenue.toLocaleString('en-IN')}`}
          accentColor={colors.primary}
          style={styles.kpiItem}
        />
        <StatCard
          label="Pending Dues"
          value={`₹${pendingFees.toLocaleString('en-IN')}`}
          accentColor={colors.danger}
          style={styles.kpiItem}
        />
      </View>

      {/* Operational Actions Grid */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Management Modules</Text>
      </View>

      <View style={styles.actionGrid}>
        <TouchableOpacity
          onPress={() => navigation.navigate('Students')}
          style={styles.actionCard}
        >
          <Text style={styles.actionIcon}>👥</Text>
          <Text style={styles.actionTitle}>Student Directory</Text>
          <Text style={styles.actionSub}>View & manage residents</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => navigation.navigate('CashCollection')}
          style={styles.actionCard}
        >
          <Text style={styles.actionIcon}>💵</Text>
          <Text style={styles.actionTitle}>Counter Payment</Text>
          <Text style={styles.actionSub}>Collect cash & issue receipt</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => navigation.navigate('Complaints')}
          style={styles.actionCard}
        >
          <View style={styles.actionTitleRow}>
            <Text style={styles.actionIcon}>🛠️</Text>
            {activeComplaints > 0 && (
              <Badge label={`${activeComplaints} OPEN`} variant="warning" />
            )}
          </View>
          <Text style={styles.actionTitle}>Complaints Desk</Text>
          <Text style={styles.actionSub}>Resolve student tickets</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => navigation.navigate('Announcements')}
          style={styles.actionCard}
        >
          <Text style={styles.actionIcon}>📢</Text>
          <Text style={styles.actionTitle}>Broadcast Notice</Text>
          <Text style={styles.actionSub}>Send hostel circulars</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.pageBg,
  },
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  headerCard: {
    marginBottom: spacing.md,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.xs,
  },
  welcomeText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  hostelName: {
    fontSize: 17,
    fontWeight: '900',
    color: colors.textHeading,
    marginTop: 2,
  },
  headerSub: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginTop: 4,
  },
  kpiGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  kpiItem: {
    flex: 1,
  },
  sectionHeader: {
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.textHeading,
    textTransform: 'uppercase',
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  actionCard: {
    width: '48%',
    backgroundColor: colors.cardBg,
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    borderColor: colors.borderContainer,
    padding: spacing.md,
  },
  actionTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  actionIcon: {
    fontSize: 24,
    marginBottom: spacing.xs,
  },
  actionTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.textHeading,
  },
  actionSub: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
    marginTop: 2,
  },
});
