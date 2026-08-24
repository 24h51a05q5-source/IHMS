import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { colors, spacing, borderRadius } from '../../theme/theme';
import { Card } from '../../components/Card';
import { Badge } from '../../components/Badge';
import { studentService, AnnouncementItem } from '../../services/student';
import { UserProfile } from '../../services/auth';

interface StudentAnnouncementsScreenProps {
  user: UserProfile;
}

export const StudentAnnouncementsScreen: React.FC<StudentAnnouncementsScreenProps> = ({ user }) => {
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadAnnouncements = async () => {
    try {
      setRefreshing(true);
      const list = await studentService.listAnnouncements();
      setAnnouncements(list);
    } catch {
      // Fallback empty
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadAnnouncements();
  }, []);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadAnnouncements} />}
    >
      <Card style={styles.topCard}>
        <Text style={styles.topTitle}>Hostel Announcements & Circulars</Text>
        <Text style={styles.topSub}>
          Stay updated with curfew timings, mess changes, maintenance schedules, and holiday notices.
        </Text>
      </Card>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>All Notices ({announcements.length})</Text>
      </View>

      {announcements.length > 0 ? (
        announcements.map((item) => (
          <Card key={item.id} style={styles.noticeCard}>
            <View style={styles.noticeHeader}>
              <Text style={styles.noticeTitle}>{item.title}</Text>
              <Badge
                label={item.priority || 'NORMAL'}
                variant={
                  item.priority === 'URGENT'
                    ? 'danger'
                    : item.priority === 'HIGH'
                    ? 'warning'
                    : 'neutral'
                }
              />
            </View>

            <Text style={styles.noticeMessage}>{item.message}</Text>

            <View style={styles.noticeFooter}>
              <Text style={styles.noticeDate}>
                Posted {new Date(item.createdAt).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </Text>
              {item.authorName && (
                <Text style={styles.noticeAuthor}>By {item.authorName}</Text>
              )}
            </View>
          </Card>
        ))
      ) : (
        <Card style={styles.emptyCard}>
          <Text style={styles.emptyIcon}>📢</Text>
          <Text style={styles.emptyTitle}>No Announcements</Text>
          <Text style={styles.emptySub}>No official hostel circulars posted recently.</Text>
        </Card>
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
  topCard: {
    marginBottom: spacing.md,
  },
  topTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.textHeading,
  },
  topSub: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginTop: 2,
  },
  sectionHeader: {
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.textHeading,
    textTransform: 'uppercase',
  },
  noticeCard: {
    marginBottom: spacing.sm,
  },
  noticeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  noticeTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.textHeading,
    flex: 1,
    marginRight: spacing.sm,
  },
  noticeMessage: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    lineHeight: 18,
    marginBottom: spacing.md,
  },
  noticeFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.sm,
    borderTopWidth: 1.5,
    borderTopColor: colors.borderNormal,
  },
  noticeDate: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
  },
  noticeAuthor: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primary,
  },
  emptyCard: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  emptyIcon: {
    fontSize: 32,
    marginBottom: spacing.sm,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.textHeading,
  },
  emptySub: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginTop: 4,
  },
});
