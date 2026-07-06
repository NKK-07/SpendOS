import { View, Text, TouchableOpacity } from 'react-native';
import { useAuth } from '../../src/context/auth';
import { LogOut } from 'lucide-react-native';

export default function ProfileScreen() {
  const { user, logout } = useAuth();

  return (
    <View className="flex-1 bg-slate-50 p-6">
      <View className="bg-white rounded-xl border border-slate-200 p-6 items-center mb-6 shadow-sm">
        <View className="w-20 h-20 bg-indigo-100 rounded-full items-center justify-center mb-4">
          <Text className="text-2xl font-bold text-indigo-700">
            {user?.fullName?.charAt(0) || 'U'}
          </Text>
        </View>
        <Text className="text-xl font-bold text-slate-800">{user?.fullName || 'User Name'}</Text>
        <Text className="text-slate-500 mt-1">{user?.email || 'user@company.com'}</Text>
        <View className="bg-slate-100 px-3 py-1 rounded-full mt-3">
          <Text className="text-xs font-bold text-slate-600">{user?.role || 'EMPLOYEE'}</Text>
        </View>
      </View>

      <TouchableOpacity 
        className="bg-white rounded-xl border border-red-200 p-4 flex-row items-center justify-center shadow-sm"
        onPress={logout}
      >
        <LogOut color="#EF4444" size={20} className="mr-2" />
        <Text className="text-red-500 font-bold text-lg">Log Out</Text>
      </TouchableOpacity>
    </View>
  );
}
