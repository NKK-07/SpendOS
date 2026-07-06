import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Image, ActivityIndicator, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Camera, Upload, X } from 'lucide-react-native';
import { useRouter } from 'expo-router';
// import { useAuth } from '../../src/context/auth';

export default function NewClaimScreen() {
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const router = useRouter();

  const pickImage = async (useCamera: boolean = false) => {
    let result;
    if (useCamera) {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission required', 'Camera access is needed to take a photo of your receipt.');
        return;
      }
      result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        quality: 0.8,
      });
    } else {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission required', 'Gallery access is needed to select a receipt.');
        return;
      }
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
      });
    }

    if (!result.canceled) {
      setImage(result.assets[0].uri);
    }
  };

  const handleSubmit = async () => {
    if (!amount || !category) {
      Alert.alert('Missing fields', 'Please enter at least an amount and category.');
      return;
    }
    
    setIsSubmitting(true);
    try {
      // Here we would normally build a FormData object and post to our API endpoint
      // e.g. /expenses/submit using axios with multipart/form-data
      
      // Simulating network request for UX demo
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      Alert.alert('Success', 'Expense claim submitted successfully.');
      
      // Reset form
      setAmount('');
      setCategory('');
      setDescription('');
      setImage(null);
      
      router.navigate('/(tabs)/dashboard');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Submission failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScrollView className="flex-1 bg-slate-50">
      <View className="p-6">
        
        {/* Receipt Upload Area */}
        <View className="mb-6">
          <Text className="text-xs font-bold text-slate-500 uppercase mb-2">Receipt Document</Text>
          {image ? (
            <View className="relative w-full h-48 bg-slate-200 rounded-xl overflow-hidden border border-slate-300">
              <Image source={{ uri: image }} className="w-full h-full" resizeMode="cover" />
              <TouchableOpacity 
                className="absolute top-2 right-2 bg-slate-900/50 p-2 rounded-full"
                onPress={() => setImage(null)}
              >
                <X color="white" size={16} />
              </TouchableOpacity>
            </View>
          ) : (
            <View className="flex-row gap-3">
              <TouchableOpacity 
                className="flex-1 bg-white border border-slate-200 border-dashed rounded-xl p-6 items-center justify-center"
                onPress={() => pickImage(true)}
              >
                <View className="w-10 h-10 bg-indigo-50 rounded-full items-center justify-center mb-2">
                  <Camera color="#4F46E5" size={20} />
                </View>
                <Text className="font-bold text-slate-800 text-sm">Take Photo</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                className="flex-1 bg-white border border-slate-200 border-dashed rounded-xl p-6 items-center justify-center"
                onPress={() => pickImage(false)}
              >
                <View className="w-10 h-10 bg-indigo-50 rounded-full items-center justify-center mb-2">
                  <Upload color="#4F46E5" size={20} />
                </View>
                <Text className="font-bold text-slate-800 text-sm">Upload File</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Form Fields */}
        <View className="space-y-4">
          <View>
            <Text className="text-xs font-bold text-slate-500 uppercase mb-2">Amount (₹)</Text>
            <TextInput
              className="w-full bg-white border border-slate-200 rounded-lg p-4 text-slate-800 text-lg font-bold"
              placeholder="0.00"
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
            />
          </View>

          <View className="mt-4">
            <Text className="text-xs font-bold text-slate-500 uppercase mb-2">Category</Text>
            <TextInput
              className="w-full bg-white border border-slate-200 rounded-lg p-4 text-slate-800"
              placeholder="e.g. MEALS, TRAVEL, SOFTWARE"
              value={category}
              onChangeText={setCategory}
              autoCapitalize="characters"
            />
          </View>

          <View className="mt-4">
            <Text className="text-xs font-bold text-slate-500 uppercase mb-2">Description</Text>
            <TextInput
              className="w-full bg-white border border-slate-200 rounded-lg p-4 text-slate-800 h-24"
              placeholder="Briefly describe the expense..."
              value={description}
              onChangeText={setDescription}
              multiline
              textAlignVertical="top"
            />
          </View>
        </View>

        <TouchableOpacity 
          className="w-full bg-indigo-600 rounded-lg p-4 mt-8 items-center flex-row justify-center"
          onPress={handleSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-white font-bold text-lg">Submit Claim</Text>
          )}
        </TouchableOpacity>

      </View>
    </ScrollView>
  );
}
