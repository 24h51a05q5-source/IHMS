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
import { Input } from '../../components/Input';
import { ownerService } from '../../services/owner';
import { UserProfile } from '../../services/auth';

interface OwnerStudentsScreenProps {
  user: UserProfile;
}

export const OwnerStudentsScreen: React.FC<OwnerStudentsScreenProps> = ({ user }) => {
  const [students, setStudents] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const loadStudents = async (query?: string) => {
    try {
      setRefreshing(true);
      const list = await ownerService.listStudents(query);
      setStudents(list);
    } catch {
      // Keep empty
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadStudents(search);
  }, [search]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadStudents(search)} />}
    >
      <Input
        placeholder="Search student by name, code, or room..."
        value={search}
        onChangeText={setSearch}
      />

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Registered Students ({students.length})</Text>
      </View>

      {students.length > 0 ? (
        students.map((st) => {
          const balance = Number(st.balance || st.balanceAmount || 0);
          return (
            <Card key={st.id} style={styles.studentCard}>
              <View style={styles.studentTop}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{(st.name || 'S').charAt(0).toUpperCase()}</Text>
                </View>
                <View style={styles.studentInfo}>
                  <Text style={styles.studentName}>{st.name}</Text>
                  <Text style={styles.studentCode}>Code: {st.customerCode || 'N/A'}</Text>
                </View>
                <Badge
                  label={balance > 0 ? `DUE ₹${balance.toLocaleString('en-IN')}` : 'FEE CLEAR'}
                  variant={balance > 0 ? 'danger' : 'success'}
                />
              </View>

              <View style={styles.detailsRow}>
                <View>
                  <Text style={styles.detailLabel}>Room / Bed</Text>
                  <Text style={styles.detailVal}>
                    {st.roomNumber ? `Room ${st.roomNumber}` : 'Standard'}
                    {st.bedCode ? ` · Bed ${st.bedCode}` : ''}
                  </Text>
                </View>
                <View>
                  <Text style={styles.detailLabel}>Phone Contact</Text>
                  <Text style={styles.detailVal}>{st.phone || st.mobile || 'N/A'}</Text>
                </View>
                <View>
                  <Text style={styles.detailLabel}>Status</Text>
                  <Badge label={st.status || 'ACTIVE'} variant="neutral" />
                </View>
              </View>
            </Card>
          );
        })
      ) : (
        <Card style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No Students Found</Text>
          <Text style={styles.emptySub}>Try searching with a different keyword.</Text>
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
  sectionHeader: {
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.textHeading,
    textTransform: 'uppercase',
  },
  studentCard: {
    marginBottom: spacing.sm,
  },
  studentTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1.5,
    borderColor: colors.borderNormal,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.textPrimary,
  },
  studentInfo: {
    flex: 1,
  },
  studentName: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.textHeading,
  },
  studentCode: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
    marginTop: 1,
  },
  detailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.subtleBg,
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.borderNormal,
    marginTop: spacing.xs,
  },
  detailLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  detailVal: {
    fontSize: 11.5,
    fontWeight: '800',
    color: colors.textPrimary,
    marginTop: 2,
  },
  emptyCard: {
    padding: spacing.xl,
    alignItems: 'center',
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
    marginTop: 2,
  },
});
