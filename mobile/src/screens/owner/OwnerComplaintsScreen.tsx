import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Alert,
  Modal,
} from 'react-native';
import { colors, spacing, borderRadius } from '../../theme/theme';
import { Card } from '../../components/Card';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { ownerService } from '../../services/owner';
import { UserProfile } from '../../services/auth';

interface OwnerComplaintsScreenProps {
  user: UserProfile;
}

const STATUS_TABS = ['ALL', 'OPEN', 'IN_PROGRESS', 'RESOLVED'];

export const OwnerComplaintsScreen: React.FC<OwnerComplaintsScreenProps> = ({ user }) => {
  const [complaints, setComplaints] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState('ALL');
  const [refreshing, setRefreshing] = useState(false);

  // Resolution Modal
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [newStatus, setNewStatus] = useState('RESOLVED');
  const [notes, setNotes] = useState('');
  const [updating, setUpdating] = useState(false);

  const loadComplaints = async () => {
    try {
      setRefreshing(true);
      const list = await ownerService.listComplaints(activeTab === 'ALL' ? undefined : activeTab);
      setComplaints(list);
    } catch {
      // Keep empty
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadComplaints();
  }, [activeTab]);

  const handleUpdateStatus = async () => {
    if (!selectedTicket) return;

    try {
      setUpdating(true);
      await ownerService.resolveComplaint(selectedTicket.id, newStatus, notes);
      Alert.alert('Status Updated', `Ticket #${selectedTicket.id.substring(0, 6)} updated to ${newStatus}.`);
      setSelectedTicket(null);
      setNotes('');
      await loadComplaints();
    } catch (err: any) {
      Alert.alert('Update Failed', err.message || 'Failed to update ticket.');
    } finally {
      setUpdating(false);
    }
  };

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'RESOLVED':
        return 'success';
      case 'IN_PROGRESS':
        return 'warning';
      case 'REJECTED':
        return 'danger';
      default:
        return 'neutral';
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadComplaints} />}
      >
        {/* Status Filter Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabScroll}>
          {STATUS_TABS.map((tab) => {
            const isSelected = activeTab === tab;
            return (
              <TouchableOpacity
                key={tab}
                onPress={() => setActiveTab(tab)}
                style={[
                  styles.tabChip,
                  isSelected ? styles.tabChipActive : null,
                ]}
              >
                <Text
                  style={[
                    styles.tabChipText,
                    isSelected ? styles.tabChipTextActive : null,
                  ]}
                >
                  {tab.replace(/_/g, ' ')}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Complaints & Maintenance ({complaints.length})</Text>
        </View>

        {complaints.length > 0 ? (
          complaints.map((item) => (
            <Card key={item.id} style={styles.complaintCard}>
              <View style={styles.ticketTop}>
                <View style={styles.ticketInfo}>
                  <Text style={styles.ticketCategory}>{item.category?.replace(/_/g, ' ') || 'MAINTENANCE'}</Text>
                  <Text style={styles.ticketTitle}>{item.title}</Text>
                  <Text style={styles.studentMeta}>
                    Reported by: {item.studentName || 'Student'} {item.roomNumber ? `(Room ${item.roomNumber})` : ''}
                  </Text>
                </View>
                <Badge label={item.status} variant={getStatusVariant(item.status)} />
              </View>

              <Text style={styles.ticketDesc}>{item.description}</Text>

              {item.resolutionNotes ? (
                <View style={styles.resolutionBox}>
                  <Text style={styles.resolutionLabel}>Resolution Notes:</Text>
                  <Text style={styles.resolutionText}>{item.resolutionNotes}</Text>
                </View>
              ) : null}

              <View style={styles.ticketFooter}>
                <Text style={styles.ticketDate}>
                  {new Date(item.createdAt).toLocaleDateString('en-IN')}
                </Text>
                <Button
                  title="Update Ticket"
                  onPress={() => {
                    setSelectedTicket(item);
                    setNewStatus(item.status === 'RESOLVED' ? 'IN_PROGRESS' : 'RESOLVED');
                  }}
                  variant="outline"
                  size="sm"
                />
              </View>
            </Card>
          ))
        ) : (
          <Card style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No Complaints</Text>
            <Text style={styles.emptySub}>No tickets found under the selected filter.</Text>
          </Card>
        )}
      </ScrollView>

      {/* Resolution Modal */}
      <Modal
        visible={!!selectedTicket}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedTicket(null)}
      >
        <View style={styles.modalOverlay}>
          <Card style={styles.modalCard}>
            <Text style={styles.modalTitle}>Update Ticket Status</Text>
            <Text style={styles.modalSub}>{selectedTicket?.title}</Text>

            <Text style={styles.selectorLabel}>Set New Status</Text>
            <View style={styles.statusBtnRow}>
              {['IN_PROGRESS', 'RESOLVED', 'REJECTED'].map((st) => (
                <TouchableOpacity
                  key={st}
                  onPress={() => setNewStatus(st)}
                  style={[
                    styles.statusBtn,
                    newStatus === st ? styles.statusBtnActive : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.statusBtnText,
                      newStatus === st ? styles.statusBtnTextActive : null,
                    ]}
                  >
                    {st.replace(/_/g, ' ')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Input
              label="Staff Remarks / Action Taken"
              placeholder="e.g. Electrician visited and repaired the switch."
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={3}
              style={styles.textArea}
            />

            <View style={styles.modalBtnRow}>
              <Button
                title="Cancel"
                onPress={() => setSelectedTicket(null)}
                variant="outline"
                size="md"
                style={styles.modalActionBtn}
              />
              <Button
                title="Save & Notify Student"
                onPress={handleUpdateStatus}
                variant="primary"
                size="md"
                loading={updating}
                style={styles.modalActionBtn}
              />
            </View>
          </Card>
        </View>
      </Modal>
    </View>
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
  tabScroll: {
    flexDirection: 'row',
    marginBottom: spacing.md,
  },
  tabChip: {
    backgroundColor: colors.cardBg,
    borderWidth: 1.5,
    borderColor: colors.borderNormal,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    marginRight: spacing.sm,
  },
  tabChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.borderContainer,
  },
  tabChipText: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.textPrimary,
  },
  tabChipTextActive: {
    color: colors.textWhite,
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
  complaintCard: {
    marginBottom: spacing.sm,
  },
  ticketTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  ticketInfo: {
    flex: 1,
    marginRight: spacing.sm,
  },
  ticketCategory: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.primary,
    textTransform: 'uppercase',
  },
  ticketTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.textHeading,
    marginTop: 1,
  },
  studentMeta: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
    marginTop: 2,
  },
  ticketDesc: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    lineHeight: 16,
    marginBottom: spacing.sm,
  },
  resolutionBox: {
    backgroundColor: colors.successBg,
    borderWidth: 1.5,
    borderColor: colors.success,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  resolutionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.success,
  },
  resolutionText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
    marginTop: 2,
  },
  ticketFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.sm,
    borderTopWidth: 1.5,
    borderTopColor: colors.borderNormal,
  },
  ticketDate: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.75)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    padding: spacing.lg,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.textHeading,
  },
  modalSub: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
    marginTop: 2,
    marginBottom: spacing.md,
  },
  selectorLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textPrimary,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  statusBtnRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  statusBtn: {
    flex: 1,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1.5,
    borderColor: colors.borderNormal,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  statusBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.borderContainer,
  },
  statusBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  statusBtnTextActive: {
    color: colors.textWhite,
  },
  textArea: {
    height: 70,
    textAlignVertical: 'top',
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  modalActionBtn: {
    flex: 1,
  },
});
