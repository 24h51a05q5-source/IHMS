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
import { Button } from '../../components/Button';
import { studentService, StudentFeeSummary, AnnouncementItem } from '../../services/student';
import { UserProfile } from '../../services/auth';

interface StudentHomeScreenProps {
  user: UserProfile;
  navigation: any;
}

export const StudentHomeScreen: React.FC<StudentHomeScreenProps> = ({ user, navigation }) => {
  const [profile, setProfile] = useState<any>(null);
  const [feeSummary, setFeeSummary] = useState<StudentFeeSummary | null>(null);
  const [recentAnnouncements, setRecentAnnouncements] = useState<AnnouncementItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    try {
      setRefreshing(true);
      const [p, f, a] = await Promise.all([
        studentService.getProfile().catch(() => null),
        studentService.getFeeSummary().catch(() => null),
        studentService.listAnnouncements().catch(() => []),
      ]);
      setProfile(p);
      setFeeSummary(f);
      setRecentAnnouncements(a.slice(0, 3));
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const balance = feeSummary?.balanceAmount || 0;
  const hostelName = user.hostelName || profile?.hostelName || profile?.organizationName || 'IHMS Hostel';
  const roomNum = profile?.roomNumber || user.roomNumber || '101';
  const bedNum = profile?.bedCode || user.bedCode || 'A';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadData} />}
    >
      {/* Student Welcome Card */}
      <Card style={styles.welcomeCard}>
        <View style={styles.welcomeRow}>
          <View style={styles.avatarBox}>
            <Text style={styles.avatarText}>
              {(user.name || 'Student').charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.welcomeTextContainer}>
            <Text style={styles.studentName}>{user.name}</Text>
            <Text style={styles.hostelName}>{hostelName}</Text>
            <Text style={styles.codeText}>ID: {profile?.customerCode || user.customerCode || 'N/A'}</Text>
          </View>
          <Badge
            label={balance === 0 ? 'FEE CLEAR' : 'DUE'}
            variant={balance === 0 ? 'success' : 'danger'}
          />
        </View>

        <View style={styles.roomInfoRow}>
          <View style={styles.roomInfoItem}>
            <Text style={styles.roomInfoLabel}>Room</Text>
            <Text style={styles.roomInfoValue}>#{roomNum}</Text>
          </View>
          <View style={styles.roomInfoItem}>
            <Text style={styles.roomInfoLabel}>Bed</Text>
            <Text style={styles.roomInfoValue}>{bedNum}</Text>
          </View>
          <View style={styles.roomInfoItem}>
            <Text style={styles.roomInfoLabel}>Monthly Rent</Text>
            <Text style={styles.roomInfoValue}>₹{(feeSummary?.monthlyAmount || 8500).toLocaleString('en-IN')}</Text>
          </View>
        </View>
      </Card>

      {/* Fee Quick Banner */}
      <Card style={styles.feeBanner}>
        <View style={styles.feeHeader}>
          <Text style={styles.feeBannerTitle}>Outstanding Fee Balance</Text>
          <Text style={styles.feeBannerAmount}>₹{balance.toLocaleString('en-IN')}</Text>
        </View>

        <View style={styles.feeStatsRow}>
          <View>
            <Text style={styles.feeStatLabel}>Total Invoiced</Text>
            <Text style={styles.feeStatVal}>₹{(feeSummary?.totalFee || 0).toLocaleString('en-IN')}</Text>
          </View>
          <View>
            <Text style={styles.feeStatLabel}>Total Paid</Text>
            <Text style={styles.feeStatVal}>₹{(feeSummary?.totalPaid || 0).toLocaleString('en-IN')}</Text>
          </View>
        </View>

        {balance > 0 && (
          <Button
            title="Pay Now Securely"
            onPress={() => navigation.navigate('Fees')}
            variant="primary"
            size="md"
            style={styles.payBtn}
          />
        )}
      </Card>

      {/* Quick Action Hub */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Quick Portal Access</Text>
      </View>

      <View style={styles.actionGrid}>
        <TouchableOpacity
          onPress={() => navigation.navigate('Fees')}
          style={styles.actionCard}
        >
          <Text style={styles.actionIcon}>💳</Text>
          <Text style={styles.actionTitle}>Fee & Receipts</Text>
          <Text style={styles.actionSub}>Pay & view bills</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => navigation.navigate('Complaints')}
          style={styles.actionCard}
        >
          <Text style={styles.actionIcon}>🛠️</Text>
          <Text style={styles.actionTitle}>Complaints</Text>
          <Text style={styles.actionSub}>File & track</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => navigation.navigate('Mess')}
          style={styles.actionCard}
        >
          <Text style={styles.actionIcon}>🍱</Text>
          <Text style={styles.actionTitle}>Mess Menu</Text>
          <Text style={styles.actionSub}>Today's meals</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => navigation.navigate('Announcements')}
          style={styles.actionCard}
        >
          <Text style={styles.actionIcon}>📢</Text>
          <Text style={styles.actionTitle}>Notices</Text>
          <Text style={styles.actionSub}>Hostel updates</Text>
        </TouchableOpacity>
      </View>

      {/* Latest Announcements */}
      {recentAnnouncements.length > 0 && (
        <View style={styles.announcementsSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Latest Announcements</Text>
          </View>

          {recentAnnouncements.map((item) => (
            <Card key={item.id} style={styles.announcementItem}>
              <View style={styles.announcementTop}>
                <Text style={styles.announcementItemTitle}>{item.title}</Text>
                <Badge label={item.priority || 'NORMAL'} variant={item.priority === 'HIGH' ? 'warning' : 'neutral'} />
              </View>
              <Text style={styles.announcementItemBody} numberOfLines={2}>
                {item.message}
              </Text>
            </Card>
          ))}
        </View>
      )}
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
  welcomeCard: {
    marginBottom: spacing.md,
  },
  welcomeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  avatarBox: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
    borderWidth: 1.5,
    borderColor: colors.borderContainer,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.textWhite,
  },
  welcomeTextContainer: {
    flex: 1,
  },
  studentName: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.textHeading,
  },
  hostelName: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
    marginTop: 1,
  },
  codeText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
  },
  roomInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.subtleBg,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.borderNormal,
    padding: spacing.sm,
  },
  roomInfoItem: {
    alignItems: 'center',
  },
  roomInfoLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  roomInfoValue: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.textHeading,
    marginTop: 2,
  },
  feeBanner: {
    backgroundColor: colors.cardBg,
    marginBottom: spacing.md,
  },
  feeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  feeBannerTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textSecondary,
    textTransform: 'uppercase',
  },
  feeBannerAmount: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.danger,
  },
  feeStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderTopWidth: 1.5,
    borderTopColor: colors.borderNormal,
    marginBottom: spacing.sm,
  },
  feeStatLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
  },
  feeStatVal: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  payBtn: {
    marginTop: spacing.xs,
  },
  sectionHeader: {
    marginVertical: spacing.sm,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.textHeading,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  actionCard: {
    width: '48%',
    backgroundColor: colors.cardBg,
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    borderColor: colors.borderContainer,
    padding: spacing.md,
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
  announcementsSection: {
    marginTop: spacing.xs,
  },
  announcementItem: {
    marginBottom: spacing.sm,
  },
  announcementTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  announcementItemTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textHeading,
    flex: 1,
    marginRight: spacing.sm,
  },
  announcementItemBody: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    lineHeight: 16,
  },
});
