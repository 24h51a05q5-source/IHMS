import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { colors, spacing, borderRadius } from '../../theme/theme';
import { Card } from '../../components/Card';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { Badge } from '../../components/Badge';
import { ReceiptModal } from '../../components/ReceiptModal';
import { ownerService } from '../../services/owner';
import { UserProfile } from '../../services/auth';

interface OwnerCashCollectionScreenProps {
  user: UserProfile;
}

export const OwnerCashCollectionScreen: React.FC<OwnerCashCollectionScreenProps> = ({ user }) => {
  const [students, setStudents] = useState<any[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [receiptData, setReceiptData] = useState<any>(null);
  const [receiptModalVisible, setReceiptModalVisible] = useState(false);

  useEffect(() => {
    ownerService.listStudents().then(setStudents).catch(() => {});
  }, []);

  const handleRecordPayment = async () => {
    if (!selectedStudent) {
      Alert.alert('Select Student', 'Please choose a student to credit the payment to.');
      return;
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid cash collection amount.');
      return;
    }

    try {
      setSubmitting(true);
      const res = await ownerService.recordCashPayment({
        studentId: selectedStudent.id,
        amount: amountNum,
        notes: notes.trim() || 'Counter cash collection',
        receivedBy: user.name || 'Hostel Staff',
      });

      const receipt = res.receipt || res;
      setReceiptData({
        ...receipt,
        studentName: selectedStudent.name,
        customerCode: selectedStudent.customerCode,
        roomNumber: selectedStudent.roomNumber,
        paymentMethod: 'CASH',
        amount: amountNum,
      });
      setReceiptModalVisible(true);

      Alert.alert('Payment Recorded!', `Cash payment of ₹${amountNum.toLocaleString('en-IN')} has been posted to ${selectedStudent.name}'s ledger.`);
      setAmount('');
      setNotes('');
      setSelectedStudent(null);
    } catch (err: any) {
      Alert.alert('Collection Error', err.message || 'Failed to record cash payment.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Card style={styles.headerCard}>
        <Text style={styles.headerTitle}>Counter Cash Payment Desk</Text>
        <Text style={styles.headerSub}>
          Record in-person cash payments with instant double-entry ledger posting and official receipt generation.
        </Text>
      </Card>

      {/* Select Student Section */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>1. Select Resident Student</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.studentScroll}>
        {students.map((st) => {
          const isSelected = selectedStudent?.id === st.id;
          return (
            <TouchableOpacity
              key={st.id}
              onPress={() => setSelectedStudent(st)}
              style={[
                styles.studentChip,
                isSelected ? styles.studentChipActive : null,
              ]}
            >
              <Text
                style={[
                  styles.chipName,
                  isSelected ? styles.chipTextActive : null,
                ]}
              >
                {st.name}
              </Text>
              <Text
                style={[
                  styles.chipSub,
                  isSelected ? styles.chipTextActive : null,
                ]}
              >
                {st.roomNumber ? `Room ${st.roomNumber}` : 'Standard'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {selectedStudent && (
        <Card style={styles.selectedCard}>
          <View style={styles.selectedTop}>
            <View>
              <Text style={styles.selectedName}>{selectedStudent.name}</Text>
              <Text style={styles.selectedCode}>ID: {selectedStudent.customerCode || 'N/A'}</Text>
            </View>
            <Badge label="SELECTED" variant="success" />
          </View>
        </Card>
      )}

      {/* Enter Payment Details */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>2. Payment Information</Text>
      </View>

      <Card style={styles.formCard}>
        <Input
          label="Cash Amount (INR ₹)"
          placeholder="e.g. 8500"
          value={amount}
          onChangeText={setAmount}
          keyboardType="numeric"
        />

        <Input
          label="Notes / Receipt Remarks"
          placeholder="e.g. Month rent collected in cash at office"
          value={notes}
          onChangeText={setNotes}
        />

        <Button
          title="Post Cash Payment & Issue Receipt"
          onPress={handleRecordPayment}
          variant="primary"
          size="lg"
          loading={submitting}
          style={styles.submitBtn}
        />
      </Card>

      {/* Official Receipt Viewer */}
      <ReceiptModal
        visible={receiptModalVisible}
        receiptData={receiptData}
        onClose={() => setReceiptModalVisible(false)}
      />
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
  headerTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.textHeading,
  },
  headerSub: {
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
  studentScroll: {
    flexDirection: 'row',
    marginBottom: spacing.md,
  },
  studentChip: {
    backgroundColor: colors.cardBg,
    borderWidth: 1.5,
    borderColor: colors.borderNormal,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginRight: spacing.sm,
  },
  studentChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.borderContainer,
  },
  chipName: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  chipSub: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
    marginTop: 1,
  },
  chipTextActive: {
    color: colors.textWhite,
  },
  selectedCard: {
    marginBottom: spacing.md,
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
  },
  selectedTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  selectedName: {
    fontSize: 15,
    fontWeight: '900',
    color: colors.primary,
  },
  selectedCode: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    marginTop: 1,
  },
  formCard: {
    marginBottom: spacing.md,
  },
  submitBtn: {
    marginTop: spacing.sm,
  },
});
