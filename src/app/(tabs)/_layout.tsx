import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Theme } from '../../constants/theme';

function CenterImportButton(props: any) {
  return (
    <TouchableOpacity
      {...props}
      style={styles.centerFabWrapper}
      activeOpacity={0.85}
    >
      <View style={styles.centerFabCircle}>
        <Ionicons name="add" size={28} color="#ffffff" />
      </View>
    </TouchableOpacity>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Theme.colors.primary,
        tabBarInactiveTintColor: Theme.colors.subtext,
        tabBarStyle: {
          backgroundColor: Theme.colors.surface,
          borderTopColor: Theme.colors.border,
          height: 68,
          paddingBottom: 8,
          paddingTop: 6,
          elevation: 12,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.25,
          shadowRadius: 10,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
          marginTop: 2,
        },
      }}
    >
      {/* 1. Library */}
      <Tabs.Screen
        name="index"
        options={{
          title: 'Library',
          tabBarIcon: ({ color, size }) => <Ionicons name="musical-notes" size={size - 2} color={color} />,
        }}
      />

      {/* 2. Search */}
      <Tabs.Screen
        name="search"
        options={{
          title: 'Search',
          tabBarIcon: ({ color, size }) => <Ionicons name="search" size={size - 2} color={color} />,
        }}
      />

      {/* 3. Center Import FAB */}
      <Tabs.Screen
        name="import"
        options={{
          title: 'Import',
          tabBarLabelStyle: {
            fontSize: 10,
            fontWeight: '700',
            color: Theme.colors.primary,
            marginTop: 18,
          },
          tabBarButton: (props) => <CenterImportButton {...props} />,
        }}
      />

      {/* 4. Playlists */}
      <Tabs.Screen
        name="playlists/index"
        options={{
          title: 'Playlists',
          tabBarIcon: ({ color, size }) => <Ionicons name="albums" size={size - 2} color={color} />,
        }}
      />

      {/* 5. Settings */}
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => <Ionicons name="settings" size={size - 2} color={color} />,
        }}
      />

      {/* Hidden Stack Routes */}
      <Tabs.Screen
        name="backup"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="playlists/[id]"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  centerFabWrapper: {
    top: -22,
    justifyContent: 'center',
    alignItems: 'center',
    flex: 1,
  },
  centerFabCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: Theme.colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.7,
    shadowRadius: 12,
    elevation: 14,
    borderWidth: 4,
    borderColor: Theme.colors.surface,
  },
});
