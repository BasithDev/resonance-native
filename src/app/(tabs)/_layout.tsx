import { MaterialIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, font, layout } from '@/theme/tokens';

type IconName = React.ComponentProps<typeof MaterialIcons>['name'];

const tab = (title: string, icon: IconName) => ({
  title,
  tabBarIcon: ({ color, size }: { color: ColorValue; size: number }) => (
    <MaterialIcons name={icon} size={size} color={color} />
  ),
});

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.bg },
        // Fixed height: the floating mini-player (root layout) sits right above it.
        tabBarStyle: {
          backgroundColor: colors.s1,
          borderTopWidth: 0,
          height: layout.tabBar + insets.bottom,
          paddingBottom: insets.bottom,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontFamily: font.medium, fontSize: 12 },
      }}>
      <Tabs.Screen name="index" options={tab('Library', 'library-music')} />
      <Tabs.Screen name="search" options={tab('Search', 'search')} />
      <Tabs.Screen name="offline" options={tab('Offline', 'download-done')} />
      <Tabs.Screen name="settings" options={tab('Settings', 'settings')} />
    </Tabs>
  );
}
