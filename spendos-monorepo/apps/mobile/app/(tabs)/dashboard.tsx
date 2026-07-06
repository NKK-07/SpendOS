import { View, Text, ScrollView, RefreshControl } from 'react-native';
import { useAuth } from '../../src/context/auth';
import { useState, useCallback } from 'react';
import { CheckCircle2, Clock, IndianRupee } from 'lucide-react-native';

export default function DashboardScreen() {
  const { user } = useAuth();
  const [refreshing, setRefreshing] = useState(false);

  // Mock data to match the UI consistency
  const mtdSpend = 1450000; // 14,500.00
  const pendingCount = 3;

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  return (
    <ScrollView 
      className="flex-1 bg-slate-50"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View className="p-6">
        <Text className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-1">
          Welcome back
        </Text>
        <Text className="text-2xl font-bold text-slate-800 mb-6">
          {user?.fullName || 'Employee'}
        </Text>

        {/* Metrics Grid */}
        <View className="flex-row justify-between mb-6 space-x-4">
          <View className="flex-1 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <View className="flex-row items-center gap-2 mb-2">
              <IndianRupee size={16} color="#4F46E5" />
              <Text className="text-xs font-bold text-slate-500 uppercase">My Spend (MTD)</Text>
            </View>
            <Text className="text-2xl font-bold text-slate-800">
              ₹{(mtdSpend / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </Text>
          </View>

          <View className="flex-1 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <View className="flex-row items-center gap-2 mb-2">
              <Clock size={16} color="#F59E0B" />
              <Text className="text-xs font-bold text-slate-500 uppercase">Pending</Text>
            </View>
            <Text className="text-2xl font-bold text-slate-800">{pendingCount} claims</Text>
          </View>
        </View>

        {/* Recent Activity */}
        <Text className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-4 mt-4">
          Recent Activity
        </Text>

        <View className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {/* Mock Item 1 */}
          <View className="p-4 border-b border-slate-100 flex-row justify-between items-center">
            <View className="flex-row items-center gap-3">
              <View className="w-10 h-10 bg-indigo-50 rounded-full items-center justify-center">
                <CheckCircle2 size={20} color="#4F46E5" />
              </View>
              <View>
                <Text className="font-bold text-slate-800">Client Dinner</Text>
                <Text className="text-xs text-slate-500 mt-1">2 days ago • MEALS</Text>
              </View>
            </View>
            <View className="items-end">
              <Text className="font-bold text-slate-800">₹4,500</Text>
              <View className="bg-emerald-100 px-2 py-1 rounded mt-1">
                <Text className="text-[10px] font-bold text-emerald-700 uppercase">Approved</Text>
              </View>
            </View>
          </View>

          {/* Mock Item 2 */}
          <View className="p-4 flex-row justify-between items-center">
            <View className="flex-row items-center gap-3">
              <View className="w-10 h-10 bg-indigo-50 rounded-full items-center justify-center">
                <Clock size={20} color="#4F46E5" />
              </View>
              <View>
                <Text className="font-bold text-slate-800">Software License</Text>
                <Text className="text-xs text-slate-500 mt-1">Today • SOFTWARE</Text>
              </View>
            </View>
            <View className="items-end">
              <Text className="font-bold text-slate-800">₹1,200</Text>
              <View className="bg-amber-100 px-2 py-1 rounded mt-1">
                <Text className="text-[10px] font-bold text-amber-700 uppercase">Submitted</Text>
              </View>
            </View>
          </View>
        </View>

      </View>
    </ScrollView>
  );
}
