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
import { studentService, StudentComplaint } from '../../services/student';
import { UserProfile } from '../../services/auth';

interface StudentComplaintsScreenProps {
  user: UserProfile;
}

const CATEGORIES = [
  'ROOM_MAINTENANCE',
  'ELECTRICITY',
  'PLUMBING',
  'MESS_FOOD',
  'WIFI_INTERNET',
  'GENERAL',
];

export const StudentComplaintsScreen: React.FC<StudentComplaintsScreenProps> = ({ user }) => {
  const [complaints, setComplaints] = useState<StudentComplaint[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // New Complaint Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('ROOM_MAINTENANCE');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('MEDIUM');
  const [submitting, setSubmitting] = useState(false);

  const loadComplaints = async () => {
    try {
      setRefreshing(true);
      const list = await studentService.listComplaints();
      setComplaints(list);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to load complaints');
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadComplaints();
  }, []);

  const handleCreateComplaint = async () => {
    if (!title.trim() || !description.trim()) {
      Alert.alert('Missing Details', 'Please provide a complaint title and description.');
      return;
    }

    try {
      setSubmitting(true);
      await studentService.createComplaint({
        title: title.trim(),
        category,
        description: description.trim(),
        priority,
      });

      setModalVisible(false);
      setTitle('');
      setDescription('');
      Alert.alert('Complaint Submitted', 'Your ticket has been logged and assigned to the hostel warden/staff.');
      await loadComplaints();
    } catch (err: any) {
      Alert.alert('Submission Error', err.message || 'Failed to submit complaint.');
    } finally {
      setSubmitting(false);
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
        {/* Action Header Card */}
        <Card style={styles.topCard}>
          <Text style={styles.topHeading}>Hostel Complaints Desk</Text>
          <Text style={styles.topSubtitle}>
            File maintenance requests or service issues. Our staff resolves tickets promptly.
          </Text>
          <Button
            title="+ File New Complaint"
            onPress={() => setModalVisible(true)}
            variant="primary"
            size="md"
            style={styles.newBtn}
          />
        </Card>

        {/* Complaints List */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Your Tickets ({complaints.length})</Text>
        </View>

        {complaints.length > 0 ? (
          complaints.map((item) => (
            <Card key={item.id} style={styles.complaintCard}>
              <View style={styles.ticketHeader}>
                <View style={styles.ticketInfo}>
                  <Text style={styles.ticketCategory}>{item.category.replace(/_/g, ' ')}</Text>
                  <Text style={styles.ticketTitle}>{item.title}</Text>
                </View>
                <Badge label={item.status} variant={getStatusVariant(item.status)} />
              </View>

              <Text style={styles.ticketDesc}>{item.description}</Text>

              {item.resolutionNotes ? (
                <View style={styles.resolutionBox}>
                  <Text style={styles.resolutionLabel}>Staff Resolution Response:</Text>
                  <Text style={styles.resolutionText}>{item.resolutionNotes}</Text>
                </View>
              ) : null}

              <View style={styles.ticketFooter}>
                <Text style={styles.ticketDate}>
                  Logged on {new Date(item.createdAt).toLocaleDateString('en-IN')}
                </Text>
                <Badge label={`PRIORITY: ${item.priority}`} variant={item.priority === 'HIGH' || item.priority === 'URGENT' ? 'danger' : 'neutral'} />
              </View>
            </Card>
          ))
        ) : (
          <Card style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>✨</Text>
            <Text style={styles.emptyTitle}>No Active Complaints</Text>
            <Text style={styles.emptySub}>Everything looks good! Tap above to file a request if needed.</Text>
          </Card>
        )}
      </ScrollView>

      {/* New Complaint Modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Card style={styles.modalCard}>
            <Text style={styles.modalTitle}>File a Complaint</Text>
            <Text style={styles.modalDesc}>
              Select category and describe the maintenance or service issue in detail.
            </Text>

            <Input
              label="Title / Brief Summary"
              placeholder="e.g. Wi-Fi router in Room 101 not working"
              value={title}
              onChangeText={setTitle}
            />

            {/* Category Selector */}
            <Text style={styles.selectorLabel}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll}>
              {CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  onPress={() => setCategory(cat)}
                  style={[
                    styles.catChip,
                    category === cat ? styles.catChipActive : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.catChipText,
                      category === cat ? styles.catChipTextActive : null,
                    ]}
                  >
                    {cat.replace(/_/g, ' ')}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Input
              label="Detailed Description"
              placeholder="Describe what needs repair or attention..."
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={4}
              style={styles.textArea}
            />

            <View style={styles.modalBtnRow}>
              <Button
                title="Cancel"
                onPress={() => setModalVisible(false)}
                variant="outline"
                size="md"
                style={styles.modalBtn}
              />
              <Button
                title="Submit Ticket"
                onPress={handleCreateComplaint}
                variant="primary"
                size="md"
                loading={submitting}
                style={styles.modalBtn}
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
  topCard: {
    marginBottom: spacing.md,
  },
  topHeading: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.textHeading,
  },
  topSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginTop: 2,
    marginBottom: spacing.md,
  },
  newBtn: {
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
  },
  complaintCard: {
    marginBottom: spacing.sm,
  },
  ticketHeader: {
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
    fontWeight: '800',
    color: colors.textHeading,
    marginTop: 1,
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
    textAlign: 'center',
    marginTop: 4,
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
  modalDesc: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
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
  catScroll: {
    flexDirection: 'row',
    marginBottom: spacing.md,
  },
  catChip: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1.5,
    borderColor: colors.borderNormal,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    marginRight: spacing.xs,
  },
  catChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.borderContainer,
  },
  catChipText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  catChipTextActive: {
    color: colors.textWhite,
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  modalBtn: {
    flex: 1,
  },
});
