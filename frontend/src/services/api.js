import axios from "axios";
import { Platform } from "react-native";

// For Expo: use your computer's local IP when testing on physical device
// For Android emulator: use 10.0.2.2
// For iOS simulator: use localhost
const getBaseUrl = () => {
  if (__DEV__) {
    // Change this to your computer's IP address when testing on physical device
    // e.g., "http://192.168.1.100:5000/api"
    if (Platform.OS === "android") {
      return "http://10.0.2.2:5000/api";
    }
    return "http://localhost:5000/api";
  }
  return "https://your-production-url.com/api";
};

const api = axios.create({
  baseURL: getBaseUrl(),
  timeout: 30000, // 30s timeout for LLM responses
  headers: {
    "Content-Type": "application/json",
  },
});

// Products
export const getProducts = (params = {}) => api.get("/products", { params });
export const getProductById = (id) => api.get(`/products/${id}`);
export const searchProducts = (query) => api.get(`/products/search/${query}`);
export const getBrands = () => api.get("/products/brands");

// Chat
export const sendChatMessage = (message, conversationHistory = []) =>
  api.post("/chat", { message, conversationHistory });

// Favorites
export const getFavorites = (userId) => api.get(`/favorites/${userId}`);
export const addFavorite = (userId, foundationId) =>
  api.post("/favorites", { userId, foundationId });
export const removeFavorite = (userId, foundationId) =>
  api.delete(`/favorites/${userId}/${foundationId}`);
export const checkFavorite = (userId, foundationId) =>
  api.get(`/favorites/check/${userId}/${foundationId}`);

// Health
export const healthCheck = () => api.get("/health");

export default api;
