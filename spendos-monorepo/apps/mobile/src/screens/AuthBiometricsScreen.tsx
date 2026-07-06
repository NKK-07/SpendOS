import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';

export default function AuthBiometricsScreen({ navigation }: any) {
  const [isBiometricSupported, setIsBiometricSupported] = useState(false);

  useEffect(() => {
    (async () => {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      setIsBiometricSupported(compatible);
    })();
  }, []);

  const handleBiometricAuth = async () => {
    const savedBiometrics = await LocalAuthentication.isEnrolledAsync();
    if (!savedBiometrics) {
      return Alert.alert(
        'Biometrics not found',
        'Please setup Face ID or Fingerprint on your device.'
      );
    }

    const biometricAuth = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Login to SpendOS',
      disableDeviceFallback: false,
    });

    if (biometricAuth.success) {
      // Proceed to main application stack (e.g. Dashboard)
      navigation.navigate('MainApp');
    } else {
      Alert.alert('Authentication failed', 'Please try again.');
    }
  };

  return (
    <View className="flex-1 bg-white items-center justify-center p-6">
      <Text className="text-2xl font-bold text-slate-800 mb-2">Secure Login</Text>
      <Text className="text-slate-500 text-center mb-8">
        SpendOS requires biometric authentication to access the ledger and approvals queue.
      </Text>
      
      <TouchableOpacity 
        onPress={handleBiometricAuth}
        className="bg-black py-4 px-8 rounded-full shadow-lg"
      >
        <Text className="text-white font-semibold text-lg">
          {isBiometricSupported ? 'Authenticate with FaceID / TouchID' : 'Proceed with PIN'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}
