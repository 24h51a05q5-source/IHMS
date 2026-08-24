import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { colors } from '../theme/theme';
import { Header } from '../components/Header';
import { authService, UserProfile } from '../services/auth';
import { initMobileSocket, disconnectMobileSocket } from '../services/socket';

// Screens
import { LoginScreen } from '../screens/auth/LoginScreen';

// Student Screens
import { StudentHomeScreen } from '../screens/student/StudentHomeScreen';
import { StudentFeesScreen } from '../screens/student/StudentFeesScreen';
import { StudentComplaintsScreen } from '../screens/student/StudentComplaintsScreen';
import { StudentMessScreen } from '../screens/student/StudentMessScreen';
import { StudentAnnouncementsScreen } from '../screens/student/StudentAnnouncementsScreen';

// Owner Screens
import { OwnerDashboardScreen } from '../screens/owner/OwnerDashboardScreen';
import { OwnerStudentsScreen } from '../screens/owner/OwnerStudentsScreen';
import { OwnerCashCollectionScreen } from '../screens/owner/OwnerCashCollectionScreen';
import { OwnerComplaintsScreen } from '../screens/owner/OwnerComplaintsScreen';
import { OwnerAnnouncementsScreen } from '../screens/owner/OwnerAnnouncementsScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// --- Student Tab Navigator ---
function StudentTabs({ user, onLogout }: { user: UserProfile; onLogout: () => void }) {
  const hostelTitle = user.hostelName || 'Student Portal';

  return (
    <Tab.Navigator
      screenOptions={{
        header: () => <Header title="IHMS" subtitle={hostelTitle} onLogout={onLogout} />,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: styles.tabLabel,
      }}
    >
      <Tab.Screen
        name="Home"
        children={({ navigation }) => <StudentHomeScreen user={user} navigation={navigation} />}
        options={{
          tabBarLabel: 'Home',
        }}
      />
      <Tab.Screen
        name="Fees"
        children={() => <StudentFeesScreen user={user} />}
        options={{
          tabBarLabel: 'Fees',
        }}
      />
      <Tab.Screen
        name="Complaints"
        children={() => <StudentComplaintsScreen user={user} />}
        options={{
          tabBarLabel: 'Complaints',
        }}
      />
      <Tab.Screen
        name="Mess"
        children={() => <StudentMessScreen user={user} />}
        options={{
          tabBarLabel: 'Mess Menu',
        }}
      />
      <Tab.Screen
        name="Announcements"
        children={() => <StudentAnnouncementsScreen user={user} />}
        options={{
          tabBarLabel: 'Notices',
        }}
      />
    </Tab.Navigator>
  );
}

// --- Owner / Staff Tab Navigator ---
function OwnerTabs({ user, onLogout }: { user: UserProfile; onLogout: () => void }) {
  const hostelTitle = user.hostelName || user.organizationName || 'Owner Portal';

  return (
    <Tab.Navigator
      screenOptions={{
        header: () => <Header title="IHMS" subtitle={hostelTitle} onLogout={onLogout} />,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: styles.tabLabel,
      }}
    >
      <Tab.Screen
        name="Dashboard"
        children={({ navigation }) => <OwnerDashboardScreen user={user} navigation={navigation} />}
        options={{
          tabBarLabel: 'Dashboard',
        }}
      />
      <Tab.Screen
        name="Students"
        children={() => <OwnerStudentsScreen user={user} />}
        options={{
          tabBarLabel: 'Students',
        }}
      />
      <Tab.Screen
        name="CashCollection"
        children={() => <OwnerCashCollectionScreen user={user} />}
        options={{
          tabBarLabel: 'Collect Cash',
        }}
      />
      <Tab.Screen
        name="Complaints"
        children={() => <OwnerComplaintsScreen user={user} />}
        options={{
          tabBarLabel: 'Complaints',
        }}
      />
      <Tab.Screen
        name="Announcements"
        children={({ navigation }) => <OwnerAnnouncementsScreen user={user} navigation={navigation} />}
        options={{
          tabBarLabel: 'Broadcast',
        }}
      />
    </Tab.Navigator>
  );
}

export const RootNavigator: React.FC = () => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const initAuth = async () => {
    try {
      setLoading(true);
      const currentUser = await authService.getCurrentUser();
      if (currentUser) {
        setUser(currentUser);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    initAuth();
  }, []);

  // Connect WebSocket when authenticated
  useEffect(() => {
    if (user) {
      initMobileSocket((event, data) => {
        if (event === 'announcement.created') {
          Alert.alert('📢 New Hostel Announcement', data?.title || 'A new notice was posted.');
        } else if (event === 'payment.recorded') {
          Alert.alert('💳 Payment Confirmed', `Receipt #${data?.receiptNumber || 'RCP'} recorded.`);
        }
      });
    } else {
      disconnectMobileSocket();
    }
    return () => {
      disconnectMobileSocket();
    };
  }, [user]);

  const handleLogout = async () => {
    await authService.logout();
    setUser(null);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!user ? (
          <Stack.Screen name="Login">
            {() => <LoginScreen onLoginSuccess={(u) => setUser(u)} />}
          </Stack.Screen>
        ) : user.role === 'STUDENT' ? (
          <Stack.Screen name="StudentApp">
            {() => <StudentTabs user={user} onLogout={handleLogout} />}
          </Stack.Screen>
        ) : (
          <Stack.Screen name="OwnerApp">
            {() => <OwnerTabs user={user} onLogout={handleLogout} />}
          </Stack.Screen>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.pageBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBar: {
    backgroundColor: colors.cardBg,
    borderTopWidth: 2,
    borderTopColor: colors.borderContainer,
    height: 60,
    paddingBottom: 8,
    paddingTop: 6,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '800',
  },
});
