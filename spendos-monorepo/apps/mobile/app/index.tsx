import { useEffect } from 'react';
import { Redirect } from 'expo-router';
import { View, ActivityIndicator, Text } from 'react-native';
import { useAuth } from '../src/context/auth';
import { Lock } from 'lucide-react-native';

export default function Index() {
  const { token, isLoading, isUnlocked, authenticateBiometrics } = useAuth();

  useEffect(() => {
    if (token && !isUnlocked) {
      authenticateBiometrics();
    }
  }, [token, isUnlocked]);

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#4F46E5" />
      </View>
    );
  }

  if (!token) {
    return <Redirect href="/login" />;
  }

  if (!isUnlocked) {
    return (
      <View className="flex-1 items-center justify-center bg-white p-6">
        <Lock size={48} color="#4F46E5" className="mb-6" />
        <Text className="text-xl font-bold text-slate-800 text-center mb-2">App Locked</Text>
        <Text className="text-slate-500 text-center mb-8">Please authenticate to access SpendOS.</Text>
        <View 
          className="bg-indigo-600 px-6 py-3 rounded-lg w-full" 
          onTouchEnd={() => authenticateBiometrics()}
        >
          <Text className="text-white text-center font-bold">Unlock</Text>
        </View>
      </View>
    );
  }

  return <Redirect href="/(tabs)/dashboard" />;
}
