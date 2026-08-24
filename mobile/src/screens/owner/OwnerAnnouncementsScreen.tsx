import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { colors, spacing, borderRadius } from '../../theme/theme';
import { Card } from '../../components/Card';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { ownerService } from '../../services/owner';
import { UserProfile } from '../../services/auth';

interface OwnerAnnouncementsScreenProps {
  user: UserProfile;
  navigation: any;
}

const PRIORITIES = ['NORMAL', 'HIGH', 'URGENT'];

export const OwnerAnnouncementsScreen: React.FC<OwnerAnnouncementsScreenProps> = ({ user, navigation }) => {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [priority, setPriority] = useState('NORMAL');
  const [broadcasting, setBroadcasting] = useState(false);

  const handleBroadcast = async () => {
    if (!title.trim() || !message.trim()) {
      Alert.alert('Missing Info', 'Please provide a title and announcement message.');
      return;
    }

    try {
      setBroadcasting(true);
      await ownerService.createAnnouncement({
        title: title.trim(),
        message: message.trim(),
        priority,
      });

      Alert.alert(
        'Notice Broadcasted!',
        'The announcement has been published and dispatched in real-time to all student mobile apps and web dashboards.'
      );
      setTitle('');
      setMessage('');
      setPriority('NORMAL');
    } catch (err: any) {
      Alert.alert('Broadcast Error', err.message || 'Failed to broadcast announcement.');
    } finally {
      setBroadcasting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Card style={styles.headerCard}>
        <Text style={styles.headerTitle}>Broadcast Hostel Announcement</Text>
        <Text style={styles.headerSub}>
          Publish circulars, holiday notices, mess schedule updates, or emergency alerts to all students instantly.
        </Text>
      </Card>

      <Card style={styles.formCard}>
        <Input
          label="Announcement Title"
          placeholder="e.g. Water Tank Maintenance on Sunday"
          value={title}
          onChangeText={setTitle}
        />

        <Text style={styles.label}>Notice Priority Level</Text>
        <View style={styles.priorityRow}>
          {PRIORITIES.map((p) => (
            <TouchableOpacity
              key={p}
              onPress={() => setPriority(p)}
              style={[
                styles.priorityChip,
                priority === p ? styles.priorityChipActive : null,
              ]}
            >
              <Text
                style={[
                  styles.priorityChipText,
                  priority === p ? styles.priorityChipTextActive : null,
                ]}
              >
                {p}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Input
          label="Notice Message Content"
          placeholder="Write the full circular or announcement details..."
          value={message}
          onChangeText={setMessage}
          multiline
          numberOfLines={6}
          style={styles.textArea}
        />

        <Button
          title="📢 Broadcast to All Students"
          onPress={handleBroadcast}
          variant="primary"
          size="lg"
          loading={broadcasting}
          style={styles.submitBtn}
        />
      </Card>
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
  formCard: {
    marginBottom: spacing.md,
  },
  label: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textPrimary,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  priorityRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  priorityChip: {
    flex: 1,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1.5,
    borderColor: colors.borderNormal,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  priorityChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.borderContainer,
  },
  priorityChipText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  priorityChipTextActive: {
    color: colors.textWhite,
  },
  textArea: {
    height: 120,
    textAlignVertical: 'top',
  },
  submitBtn: {
    marginTop: spacing.sm,
  },
});
