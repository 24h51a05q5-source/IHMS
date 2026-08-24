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
import { Badge } from '../../components/Badge';
import { studentService, MessMenuDay } from '../../services/student';
import { UserProfile } from '../../services/auth';

interface StudentMessScreenProps {
  user: UserProfile;
}

const DEFAULT_DAYS = [
  {
    dayOfWeek: 'MONDAY',
    breakfast: 'Idli, Sambar, Coconut Chutney, Tea/Coffee',
    lunch: 'Steamed Rice, Dal Tadka, Aloo Gobi, Curd, Pickle',
    snacks: 'Veg Cutlet, Tea',
    dinner: 'Roti, Paneer Butter Masala, Jeera Rice, Dal',
  },
  {
    dayOfWeek: 'TUESDAY',
    breakfast: 'Puri Bhaji, Tea/Coffee',
    lunch: 'Rice, Sambar, Veg Pulao, Papad, Curd',
    snacks: 'Poha, Tea',
    dinner: 'Chapati, Mix Veg Curry, Rasam Rice',
  },
  {
    dayOfWeek: 'WEDNESDAY',
    breakfast: 'Masala Dosa, Chutney, Sambar, Tea/Coffee',
    lunch: 'Rice, Chicken Curry / Paneer Kadhai, Dal Fry, Curd',
    snacks: 'Samosa, Tea',
    dinner: 'Roti, Dal Makhani, Fried Rice',
  },
  {
    dayOfWeek: 'THURSDAY',
    breakfast: 'Upma, Vada, Chutney, Tea/Coffee',
    lunch: 'Rice, Tomato Dal, Bhindi Fry, Curd, Buttermilk',
    snacks: 'Biscuits, Tea',
    dinner: 'Roti, Chana Masala, Steamed Rice',
  },
  {
    dayOfWeek: 'FRIDAY',
    breakfast: 'Aloo Paratha, Curd, Pickle, Tea/Coffee',
    lunch: 'Rice, Dal Palak, Egg Curry / Paneer Bhurji, Curd',
    snacks: 'Mirchi Bajji, Tea',
    dinner: 'Roti, Veg Kofta, Dum Rice',
  },
  {
    dayOfWeek: 'SATURDAY',
    breakfast: 'Uttapam, Tomato Chutney, Tea/Coffee',
    lunch: 'Khichdi, Kadhi, Papad, Achar, Curd',
    snacks: 'Sweet Corn, Tea',
    dinner: 'Roti, Rajma Masala, Steamed Rice',
  },
  {
    dayOfWeek: 'SUNDAY',
    breakfast: 'Chole Bhature, Sweet Lassi / Tea',
    lunch: 'Special Hyderabadi Biryani (Chicken/Veg), Raita, Gulab Jamun',
    snacks: 'Cake, Tea',
    dinner: 'Light Khichdi, Roti, Dal Tadka, Papad',
    specialMenu: 'Sunday Special Feast',
  },
];

export const StudentMessScreen: React.FC<StudentMessScreenProps> = ({ user }) => {
  const [menuDays, setMenuDays] = useState<MessMenuDay[]>(DEFAULT_DAYS);
  const [selectedDay, setSelectedDay] = useState<string>('MONDAY');
  const [refreshing, setRefreshing] = useState(false);

  const daysOfWeek = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  const todayName = daysOfWeek[new Date().getDay()];

  const loadMenu = async () => {
    try {
      setRefreshing(true);
      const res = await studentService.getMessMenu();
      if (res?.days && res.days.length > 0) {
        setMenuDays(res.days);
      }
    } catch {
      // Keep default schedule
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    setSelectedDay(todayName);
    loadMenu();
  }, []);

  const activeMenu = menuDays.find((d) => d.dayOfWeek.toUpperCase() === selectedDay) || menuDays[0];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadMenu} />}
    >
      {/* Header Info */}
      <Card style={styles.headerCard}>
        <Text style={styles.headerTitle}>Hostel Dining & Mess Schedule</Text>
        <Text style={styles.headerSub}>
          Hygienic 4-meal daily schedule curated for students.
        </Text>
        <View style={styles.todayBadgeRow}>
          <Badge label={`TODAY: ${todayName}`} variant="primary" />
        </View>
      </Card>

      {/* Day Selector Chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.dayScroll}
      >
        {daysOfWeek.map((day) => {
          const isSelected = selectedDay === day;
          const isToday = todayName === day;
          return (
            <TouchableOpacity
              key={day}
              onPress={() => setSelectedDay(day)}
              style={[
                styles.dayChip,
                isSelected ? styles.dayChipActive : null,
              ]}
            >
              <Text
                style={[
                  styles.dayChipText,
                  isSelected ? styles.dayChipTextActive : null,
                ]}
              >
                {day.substring(0, 3)}
              </Text>
              {isToday && <View style={styles.dotIndicator} />}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Selected Day Meal Cards */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{selectedDay} MEAL MENU</Text>
      </View>

      {/* Breakfast */}
      <Card style={styles.mealCard}>
        <View style={styles.mealHeader}>
          <Text style={styles.mealTimeIcon}>☕</Text>
          <View style={styles.mealTitleBox}>
            <Text style={styles.mealName}>Breakfast</Text>
            <Text style={styles.mealTiming}>07:30 AM – 09:30 AM</Text>
          </View>
        </View>
        <Text style={styles.mealItemsText}>{activeMenu.breakfast}</Text>
      </Card>

      {/* Lunch */}
      <Card style={styles.mealCard}>
        <View style={styles.mealHeader}>
          <Text style={styles.mealTimeIcon}>🍛</Text>
          <View style={styles.mealTitleBox}>
            <Text style={styles.mealName}>Lunch</Text>
            <Text style={styles.mealTiming}>12:30 PM – 02:30 PM</Text>
          </View>
        </View>
        <Text style={styles.mealItemsText}>{activeMenu.lunch}</Text>
      </Card>

      {/* Evening Snacks */}
      <Card style={styles.mealCard}>
        <View style={styles.mealHeader}>
          <Text style={styles.mealTimeIcon}>🫖</Text>
          <View style={styles.mealTitleBox}>
            <Text style={styles.mealName}>Evening Snacks</Text>
            <Text style={styles.mealTiming}>05:00 PM – 06:00 PM</Text>
          </View>
        </View>
        <Text style={styles.mealItemsText}>{activeMenu.snacks}</Text>
      </Card>

      {/* Dinner */}
      <Card style={styles.mealCard}>
        <View style={styles.mealHeader}>
          <Text style={styles.mealTimeIcon}>🍲</Text>
          <View style={styles.mealTitleBox}>
            <Text style={styles.mealName}>Dinner</Text>
            <Text style={styles.mealTiming}>07:45 PM – 09:45 PM</Text>
          </View>
        </View>
        <Text style={styles.mealItemsText}>{activeMenu.dinner}</Text>
      </Card>

      {activeMenu.specialMenu && (
        <Card style={styles.specialCard}>
          <Text style={styles.specialTitle}>✨ {activeMenu.specialMenu}</Text>
          <Text style={styles.specialDesc}>
            Special weekend meal prepared fresh for all hostel residents.
          </Text>
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
  todayBadgeRow: {
    marginTop: spacing.sm,
  },
  dayScroll: {
    flexDirection: 'row',
    marginBottom: spacing.md,
  },
  dayChip: {
    backgroundColor: colors.cardBg,
    borderWidth: 1.5,
    borderColor: colors.borderNormal,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    marginRight: spacing.sm,
    alignItems: 'center',
  },
  dayChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.borderContainer,
  },
  dayChipText: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.textPrimary,
  },
  dayChipTextActive: {
    color: colors.textWhite,
  },
  dotIndicator: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.primary,
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
  mealCard: {
    marginBottom: spacing.sm,
  },
  mealHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  mealTimeIcon: {
    fontSize: 22,
    marginRight: spacing.sm,
  },
  mealTitleBox: {
    flex: 1,
  },
  mealName: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.textHeading,
  },
  mealTiming: {
    fontSize: 10.5,
    fontWeight: '700',
    color: colors.textMuted,
  },
  mealItemsText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    backgroundColor: colors.subtleBg,
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.borderNormal,
    lineHeight: 18,
  },
  specialCard: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
    marginTop: spacing.xs,
  },
  specialTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.primary,
  },
  specialDesc: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginTop: 2,
  },
});
