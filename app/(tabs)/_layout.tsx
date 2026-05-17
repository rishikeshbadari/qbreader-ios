import { Tabs } from 'expo-router';
import React from 'react';

import { FloatingTabBar, FLOATING_TAB_BAR_HEIGHT } from '@/components/ui/FloatingTabBar';
import { IconSymbol } from '@/components/ui/IconSymbol';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';

// Warm tab route modules at startup so first tab switches don't evaluate them.
import './history';
import './multiplayer';
import './settings';

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      detachInactiveScreens={false}
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: false,
        lazy: false,
        tabBarHideOnKeyboard: false,
        tabBarStyle: {
          position: 'absolute',
          height: FLOATING_TAB_BAR_HEIGHT,
          backgroundColor: 'transparent',
          borderTopWidth: 0,
          elevation: 0,
        },
        sceneStyle: {
          backgroundColor: Colors[colorScheme ?? 'light'].background,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Play',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="gamecontroller.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'History',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="clock.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="gearshape.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="multiplayer"
        options={{
          title: 'Multiplayer',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="person.2.wave.2.fill" color={color} />,
        }}
      />
    </Tabs>
  );
}
