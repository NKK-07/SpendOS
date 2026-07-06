import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import { AppState, AppStateStatus } from 'react-native';

const TOKEN_KEY = 'spendos_mobile_auth_token';
const USER_META_KEY = 'spendos_mobile_user_meta';

export type UserRole = 'PRINCIPAL' | 'ADMIN' | 'VIP' | 'MANAGER' | 'EMPLOYEE';

export interface AuthUser {
  userId: string;
  companyId: string;
  fullName: string;
  email: string;
  role: UserRole;
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  isUnlocked: boolean;
  login: (token: string, user: AuthUser) => Promise<void>;
  logout: () => Promise<void>;
  authenticateBiometrics: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  isLoading: true,
  isUnlocked: false,
  login: async () => {},
  logout: async () => {},
  authenticateBiometrics: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUnlocked, setIsUnlocked] = useState(false);

  useEffect(() => {
    async function loadAuth() {
      try {
        const storedToken = await SecureStore.getItemAsync(TOKEN_KEY);
        const storedMeta = await SecureStore.getItemAsync(USER_META_KEY);
        
        if (storedToken && storedMeta) {
          setToken(storedToken);
          setUser(JSON.parse(storedMeta));
        }
      } catch (e) {
        console.error('Failed to load auth state', e);
      } finally {
        setIsLoading(false);
      }
    }
    loadAuth();
  }, []);

  // Enforce Biometrics on Foreground
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        setIsUnlocked(false);
      }
    };
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, []);

  const authenticateBiometrics = async () => {
    if (!token) return; // Only if already logged in

    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();

    if (hasHardware && isEnrolled) {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock SpendOS',
        fallbackLabel: 'Use Passcode',
        cancelLabel: 'Cancel',
        disableDeviceFallback: false,
      });

      if (result.success) {
        setIsUnlocked(true);
      } else {
        setIsUnlocked(false);
      }
    } else {
      // If biometrics not set up, just let them in (or force them to set it up depending on security policy).
      // For now, allow fallback.
      setIsUnlocked(true);
    }
  };

  const login = async (newToken: string, newUser: AuthUser) => {
    await SecureStore.setItemAsync(TOKEN_KEY, newToken);
    await SecureStore.setItemAsync(USER_META_KEY, JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
    setIsUnlocked(true);
  };

  const logout = async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(USER_META_KEY);
    setToken(null);
    setUser(null);
    setIsUnlocked(false);
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, isUnlocked, login, logout, authenticateBiometrics }}>
      {children}
    </AuthContext.Provider>
  );
}
