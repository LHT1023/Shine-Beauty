import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, SHADOWS, SPACING } from "../constants/theme";
import ProductCard from "../components/ProductCard";
import { sendChatMessage } from "../services/api";

const WELCOME_MESSAGE = {
  id: "welcome",
  role: "assistant",
  content:
    "Hi there! ✨ I'm Shine, your personal foundation advisor. Tell me about your skin and what you're looking for, and I'll find your perfect match!\n\nYou can tell me things like:\n• Your skin type (oily, dry, combination...)\n• Coverage preference (light, medium, full)\n• Budget range\n• Any skin concerns\n\nOr just describe what you want!",
  recommendations: [],
};

const QUICK_PROMPTS = [
  "I have oily skin and need something under $30",
  "Looking for a dewy foundation for dry skin",
  "Best full coverage foundation?",
  "Recommend a cruelty-free option",
];

export default function ChatScreen() {
  const [messages, setMessages] = useState([WELCOME_MESSAGE]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const flatListRef = useRef(null);

  const conversationHistory = messages
    .filter((m) => m.id !== "welcome")
    .map((m) => ({
      role: m.role,
      content: m.content,
    }));

  const handleSend = async (text = inputText) => {
    if (!text.trim() || isLoading) return;

    const userMessage = {
      id: Date.now().toString(),
      role: "user",
      content: text.trim(),
      recommendations: [],
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputText("");
    setIsLoading(true);

    try {
      const response = await sendChatMessage(text.trim(), conversationHistory);
      const { message, recommendations } = response.data.data;

      const aiMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: message,
        recommendations: recommendations || [],
      };

      setMessages((prev) => [...prev, aiMessage]);
    } catch (error) {
      console.error("Chat error:", error);
      const errorMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content:
          "Sorry, I'm having trouble connecting right now. Please try again! 💫",
        recommendations: [],
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const renderMessage = ({ item }) => {
    const isUser = item.role === "user";

    return (
      <View style={styles.messageContainer}>
        <View
          style={[
            styles.messageBubble,
            isUser ? styles.userBubble : styles.aiBubble,
          ]}
        >
          {!isUser && (
            <Text style={styles.botName}>Shine ✨</Text>
          )}
          <Text
            style={[
              styles.messageText,
              isUser ? styles.userText : styles.aiText,
            ]}
          >
            {item.content}
          </Text>
        </View>

        {/* Product recommendations */}
        {item.recommendations && item.recommendations.length > 0 && (
          <View style={styles.recommendationsContainer}>
            {item.recommendations.map((rec, index) => (
              <ProductCard
                key={rec.product?._id || index}
                product={rec.product}
                reason={rec.reason}
                compact
              />
            ))}
          </View>
        )}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={90}
    >
      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messagesList}
        onContentSizeChange={() =>
          flatListRef.current?.scrollToEnd({ animated: true })
        }
        ListHeaderComponent={
          messages.length <= 1 ? (
            <View style={styles.quickPromptsContainer}>
              <Text style={styles.quickPromptsTitle}>Try asking:</Text>
              {QUICK_PROMPTS.map((prompt, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.quickPrompt}
                  onPress={() => handleSend(prompt)}
                >
                  <Text style={styles.quickPromptText}>{prompt}</Text>
                  <Ionicons
                    name="arrow-forward-circle"
                    size={20}
                    color={COLORS.primary}
                  />
                </TouchableOpacity>
              ))}
            </View>
          ) : null
        }
      />

      {/* Loading indicator */}
      {isLoading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={COLORS.primary} />
          <Text style={styles.loadingText}>Shine is thinking... ✨</Text>
        </View>
      )}

      {/* Input */}
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          value={inputText}
          onChangeText={setInputText}
          placeholder="Describe your skin or what you need..."
          placeholderTextColor={COLORS.textLight}
          multiline
          maxLength={500}
          onSubmitEditing={() => handleSend()}
          returnKeyType="send"
        />
        <TouchableOpacity
          style={[
            styles.sendButton,
            (!inputText.trim() || isLoading) && styles.sendButtonDisabled,
          ]}
          onPress={() => handleSend()}
          disabled={!inputText.trim() || isLoading}
        >
          <Ionicons name="send" size={20} color={COLORS.textOnPrimary} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  messagesList: {
    padding: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  messageContainer: {
    marginBottom: SPACING.md,
  },
  messageBubble: {
    maxWidth: "85%",
    padding: SPACING.md,
    borderRadius: 18,
  },
  userBubble: {
    alignSelf: "flex-end",
    backgroundColor: COLORS.primary,
    borderBottomRightRadius: 4,
  },
  aiBubble: {
    alignSelf: "flex-start",
    backgroundColor: COLORS.primaryBg,
    borderBottomLeftRadius: 4,
  },
  botName: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.primary,
    marginBottom: 4,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
  },
  userText: {
    color: COLORS.textOnPrimary,
  },
  aiText: {
    color: COLORS.text,
  },
  recommendationsContainer: {
    marginTop: SPACING.sm,
    paddingLeft: SPACING.sm,
  },
  quickPromptsContainer: {
    marginTop: SPACING.md,
    marginBottom: SPACING.lg,
  },
  quickPromptsTitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
    fontWeight: "600",
  },
  quickPrompt: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COLORS.surface,
    padding: SPACING.md,
    borderRadius: 12,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  quickPromptText: {
    flex: 1,
    fontSize: 14,
    color: COLORS.text,
    marginRight: SPACING.sm,
  },
  loadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  loadingText: {
    marginLeft: SPACING.sm,
    fontSize: 13,
    color: COLORS.textSecondary,
    fontStyle: "italic",
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    padding: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: 15,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primary,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: SPACING.sm,
  },
  sendButtonDisabled: {
    backgroundColor: COLORS.textLight,
  },
});
