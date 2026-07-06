import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/context/auth';
import axios from 'axios';

// Since this is a monorepo, API_URL could be set via env, or we'll use a local IP for dev
const API_URL = 'http://10.0.2.2:3000/api/v1'; // standard android emulator localhost

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const { login } = useAuth();
  const router = useRouter();

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter both email and password');
      return;
    }

    setIsLoading(true);
    try {
      // 1. Get CSRF Token
      const csrfRes = await axios.get(`${API_URL}/csrf`, { withCredentials: true });
      const csrfToken = csrfRes.data.csrfToken;
      
      // 2. Login
      const res = await axios.post(`${API_URL}/auth/login`, 
        { email, password },
        { 
          headers: { 'csrf-token': csrfToken },
          withCredentials: true 
        }
      );
      
      // In a real mobile app using HttpOnly cookies is tricky, so we usually rely on a bearer token
      // The backend needs to return the token for mobile to store in SecureStore, or we manage cookies
      // For this implementation, let's assume the backend returns the token in the response payload for mobile:
      // data.token or similar, OR we use the user info as a proxy if it's cookie based.
      const mockTokenFromResponse = res.data.token || 'mock_mobile_token_' + res.data.user.id;
      
      const userMeta = {
        userId: res.data.user.id,
        companyId: res.data.companyId,
        fullName: res.data.user.fullName,
        email: res.data.user.email,
        role: res.data.user.role,
      };

      await login(mockTokenFromResponse, userMeta);
      router.replace('/(tabs)/dashboard');
    } catch (e: any) {
      console.error(e);
      Alert.alert('Login Failed', e.response?.data?.error || e.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-white p-6 justify-center">
      <View className="mb-10">
        <Text className="text-3xl font-bold text-slate-800">SpendOS</Text>
        <Text className="text-slate-500 mt-2">Enterprise Financial Utility</Text>
      </View>

      <View className="space-y-4">
        <View>
          <Text className="text-xs font-bold text-slate-500 uppercase mb-2">Email</Text>
          <TextInput
            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-4 text-slate-800"
            placeholder="you@company.com"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
        </View>
        
        <View className="mt-4">
          <Text className="text-xs font-bold text-slate-500 uppercase mb-2">Password</Text>
          <TextInput
            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-4 text-slate-800"
            placeholder="••••••••"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
        </View>

        <TouchableOpacity 
          className="w-full bg-indigo-600 rounded-lg p-4 mt-6 items-center flex-row justify-center"
          onPress={handleLogin}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-white font-bold text-lg">Sign In</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}
