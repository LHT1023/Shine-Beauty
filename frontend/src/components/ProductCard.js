import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, SHADOWS, SPACING } from "../constants/theme";
import { addFavorite, removeFavorite, checkFavorite } from "../services/api";
import { getUserId } from "../services/userId";

const { width } = Dimensions.get("window");
const CARD_WIDTH = (width - SPACING.md * 3) / 2;

const FINISH_EMOJI = {
  matte: "🫧",
  dewy: "💧",
  satin: "✨",
  natural: "🌿",
  radiant: "☀️",
};

export default function ProductCard({ product, reason, compact = false }) {
  const [isFavorited, setIsFavorited] = useState(false);

  useEffect(() => {
    checkIfFavorited();
  }, [product?._id]);

  const checkIfFavorited = async () => {
    if (!product?._id) return;
    try {
      const userId = await getUserId();
      const response = await checkFavorite(userId, product._id);
      setIsFavorited(response.data.isFavorited);
    } catch (error) {
      // Silently fail - not critical
    }
  };

  const toggleFavorite = async () => {
    try {
      const userId = await getUserId();
      if (isFavorited) {
        await removeFavorite(userId, product._id);
        setIsFavorited(false);
      } else {
        await addFavorite(userId, product._id);
        setIsFavorited(true);
      }
    } catch (error) {
      console.error("Toggle favorite error:", error);
    }
  };

  if (!product) return null;

  // Compact card for chat recommendations
  if (compact) {
    return (
      <View style={[styles.compactCard, SHADOWS.small]}>
        <View style={styles.compactContent}>
          <View style={styles.compactHeader}>
            <Text style={styles.compactBrand}>{product.brand}</Text>
            <TouchableOpacity onPress={toggleFavorite} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons
                name={isFavorited ? "heart" : "heart-outline"}
                size={20}
                color={isFavorited ? COLORS.heart : COLORS.textLight}
              />
            </TouchableOpacity>
          </View>
          <Text style={styles.compactName} numberOfLines={2}>
            {product.name}
          </Text>
          <View style={styles.compactDetails}>
            <Text style={styles.price}>${product.price}</Text>
            <Text style={styles.dot}>·</Text>
            <Text style={styles.detailText}>
              {FINISH_EMOJI[product.finish]} {product.finish}
            </Text>
            <Text style={styles.dot}>·</Text>
            <Text style={styles.detailText}>{product.coverage}</Text>
          </View>
          {product.rating > 0 && (
            <View style={styles.ratingRow}>
              <Ionicons name="star" size={12} color={COLORS.star} />
              <Text style={styles.ratingText}>{product.rating}</Text>
              <Text style={styles.shadeText}>{product.shadeRange} shades</Text>
            </View>
          )}
          {reason && (
            <View style={styles.reasonContainer}>
              <Text style={styles.reasonText}>💡 {reason}</Text>
            </View>
          )}
        </View>
      </View>
    );
  }

  // Grid card for browse/favorites
  return (
    <View style={[styles.gridCard, SHADOWS.small]}>
      {/* Color indicator based on finish */}
      <View
        style={[
          styles.finishStrip,
          {
            backgroundColor:
              product.finish === "matte"
                ? "#E8D5E0"
                : product.finish === "dewy"
                  ? "#D5E8EE"
                  : product.finish === "radiant"
                    ? "#FFF3D5"
                    : "#E8E8D5",
          },
        ]}
      >
        <Text style={styles.finishEmoji}>
          {FINISH_EMOJI[product.finish] || "💄"}
        </Text>
      </View>

      <View style={styles.gridContent}>
        <View style={styles.gridHeader}>
          <Text style={styles.gridBrand}>{product.brand}</Text>
          <TouchableOpacity onPress={toggleFavorite}>
            <Ionicons
              name={isFavorited ? "heart" : "heart-outline"}
              size={18}
              color={isFavorited ? COLORS.heart : COLORS.textLight}
            />
          </TouchableOpacity>
        </View>
        <Text style={styles.gridName} numberOfLines={2}>
          {product.name}
        </Text>
        <Text style={styles.gridPrice}>${product.price}</Text>

        <View style={styles.tagsContainer}>
          <View style={styles.tag}>
            <Text style={styles.tagText}>{product.finish}</Text>
          </View>
          <View style={styles.tag}>
            <Text style={styles.tagText}>{product.coverage}</Text>
          </View>
        </View>

        {product.rating > 0 && (
          <View style={styles.ratingRow}>
            <Ionicons name="star" size={11} color={COLORS.star} />
            <Text style={styles.ratingText}>{product.rating}</Text>
          </View>
        )}

        {product.spf > 0 && (
          <Text style={styles.spfBadge}>SPF {product.spf}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Compact card styles (for chat)
  compactCard: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    marginBottom: SPACING.sm,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  compactContent: {
    padding: SPACING.md,
  },
  compactHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2,
  },
  compactBrand: {
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.primary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  compactName: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: 6,
  },
  compactDetails: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  price: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.primaryDark,
  },
  dot: {
    marginHorizontal: 6,
    color: COLORS.textLight,
  },
  detailText: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  ratingText: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.text,
  },
  shadeText: {
    fontSize: 11,
    color: COLORS.textLight,
    marginLeft: 8,
  },
  reasonContainer: {
    marginTop: 8,
    padding: SPACING.sm,
    backgroundColor: COLORS.primaryBg,
    borderRadius: 8,
  },
  reasonText: {
    fontSize: 12,
    color: COLORS.text,
    lineHeight: 18,
  },

  // Grid card styles (for browse/favorites)
  gridCard: {
    width: CARD_WIDTH,
    backgroundColor: COLORS.card,
    borderRadius: 14,
    marginBottom: SPACING.sm,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  finishStrip: {
    height: 60,
    justifyContent: "center",
    alignItems: "center",
  },
  finishEmoji: {
    fontSize: 24,
  },
  gridContent: {
    padding: SPACING.sm,
  },
  gridHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2,
  },
  gridBrand: {
    fontSize: 10,
    fontWeight: "700",
    color: COLORS.primary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  gridName: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: 4,
    lineHeight: 18,
  },
  gridPrice: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.primaryDark,
    marginBottom: 6,
  },
  tagsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginBottom: 6,
  },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: COLORS.primaryBg,
  },
  tagText: {
    fontSize: 10,
    color: COLORS.primaryDark,
    fontWeight: "500",
  },
  spfBadge: {
    fontSize: 10,
    color: COLORS.success,
    fontWeight: "600",
    marginTop: 2,
  },
});
