import AsyncStorage from "@react-native-async-storage/async-storage";

const USER_ID_KEY = "@shine_beauty_user_id";

// Generate a simple unique ID
const generateId = () => {
  return "user_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
};

export const getUserId = async () => {
  try {
    let userId = await AsyncStorage.getItem(USER_ID_KEY);
    if (!userId) {
      userId = generateId();
      await AsyncStorage.setItem(USER_ID_KEY, userId);
    }
    return userId;
  } catch (error) {
    // Fallback for when AsyncStorage is not available
    return "default_user";
  }
};
