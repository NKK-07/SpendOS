import { Slot } from 'expo-router';
import { View, Text, Alert, BackHandler, Platform } from 'react-native';
import { useEffect, useState } from 'react';
// @ts-ignore
import { isJailBroken } from 'jailbreak-root-detection';
import * as ScreenCapture from 'expo-screen-capture';
import { StatusBar } from 'expo-status-bar';
// @ts-ignore
import '../global.css';

import { AuthProvider } from '../src/context/auth';

export default function RootLayout() {
  const [isCompromised, setIsCompromised] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    async function hardenDevice() {
      try {
        // 1. Prevent Screen Recording & Screenshots (Android/iOS)
        if (Platform.OS !== 'web') {
          await ScreenCapture.preventScreenCaptureAsync();
        }

        // 2. Jailbreak / Root Detection
        const compromised = isJailBroken();
        if (compromised) {
          setIsCompromised(true);
          Alert.alert(
            "Security Violation",
            "SpendOS cannot run on a rooted or jailbroken device.",
            [{ text: "Exit", onPress: () => BackHandler.exitApp() }]
          );
        }
      } catch (e) {
        console.warn('Error during hardening device:', e);
      } finally {
        setIsChecking(false);
      }
    }
    
    hardenDevice();
  }, []);

  if (isChecking) {
    return null; // Or a secure splash screen
  }

  if (isCompromised) {
    return (
      <View className="flex-1 bg-red-500 items-center justify-center p-6">
        <Text className="text-white text-2xl font-bold mb-4">Security Lockdown</Text>
        <Text className="text-white text-center">Device integrity checks failed. The environment is not secure enough to process financial data.</Text>
      </View>
    );
  }

  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <Slot />
    </AuthProvider>
  );
}
