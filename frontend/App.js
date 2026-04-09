import React from "react";
import { StatusBar } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";

import ChatScreen from "./src/screens/ChatScreen";
import BrowseScreen from "./src/screens/BrowseScreen";
import FavoritesScreen from "./src/screens/FavoritesScreen";

const COLORS = {
  primary: "#E91E90",
  background: "#FFFFFF",
  textLight: "#999999",
};

const Tab = createBottomTabNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <StatusBar barStyle="dark-content" />
      <Tab.Navigator
        screenOptions={({ route }) => ({
          tabBarIcon: ({ focused, color, size }) => {
            let iconName;
            if (route.name === "Chat") {
              iconName = focused ? "chatbubble-ellipses" : "chatbubble-ellipses-outline";
            } else if (route.name === "Browse") {
              iconName = focused ? "search" : "search-outline";
            } else if (route.name === "Favorites") {
              iconName = focused ? "heart" : "heart-outline";
            }
            return <Ionicons name={iconName} size={size} color={color} />;
          },
          tabBarActiveTintColor: COLORS.primary,
          tabBarInactiveTintColor: COLORS.textLight,
          tabBarStyle: {
            backgroundColor: COLORS.background,
            borderTopColor: "#EEEEEE",
            paddingBottom: 4,
            height: 56,
          },
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: "600",
          },
          headerStyle: {
            backgroundColor: COLORS.background,
            shadowColor: "transparent",
            elevation: 0,
            borderBottomWidth: 1,
            borderBottomColor: "#EEEEEE",
          },
          headerTitleStyle: {
            fontWeight: "700",
            fontSize: 18,
          },
        })}
      >
        <Tab.Screen
          name="Chat"
          component={ChatScreen}
          options={{
            title: "✨ Shine",
            headerTitleStyle: {
              fontWeight: "700",
              fontSize: 20,
              color: COLORS.primary,
            },
          }}
        />
        <Tab.Screen
          name="Browse"
          component={BrowseScreen}
          options={{ title: "Browse" }}
        />
        <Tab.Screen
          name="Favorites"
          component={FavoritesScreen}
          options={{ title: "Favorites" }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
