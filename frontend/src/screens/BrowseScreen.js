import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, SHADOWS, SPACING } from "../constants/theme";
import ProductCard from "../components/ProductCard";
import { getProducts, getBrands } from "../services/api";

const FINISH_OPTIONS = ["all", "matte", "dewy", "satin", "natural", "radiant"];
const SKIN_TYPE_OPTIONS = ["all", "oily", "dry", "combination", "normal", "sensitive"];
const COVERAGE_OPTIONS = ["all", "light", "medium", "medium-to-full", "full"];

export default function BrowseScreen() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFinish, setActiveFinish] = useState("all");
  const [activeSkinType, setActiveSkinType] = useState("all");
  const [activeCoverage, setActiveCoverage] = useState("all");
  const [sortBy, setSortBy] = useState("rating");
  const [showFilters, setShowFilters] = useState(false);

  const fetchProducts = useCallback(async () => {
    try {
      const params = { sort: sortBy, limit: 100 };
      if (activeFinish !== "all") params.finish = activeFinish;
      if (activeSkinType !== "all") params.skinType = activeSkinType;
      if (activeCoverage !== "all") params.coverage = activeCoverage;

      const response = await getProducts(params);
      setProducts(response.data.data);
    } catch (error) {
      console.error("Fetch products error:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeFinish, activeSkinType, activeCoverage, sortBy]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchProducts();
  };

  const FilterChips = ({ options, active, onSelect, label }) => (
    <View style={styles.filterSection}>
      <Text style={styles.filterLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {options.map((option) => (
          <TouchableOpacity
            key={option}
            style={[
              styles.chip,
              active === option && styles.chipActive,
            ]}
            onPress={() => onSelect(option)}
          >
            <Text
              style={[
                styles.chipText,
                active === option && styles.chipTextActive,
              ]}
            >
              {option.charAt(0).toUpperCase() + option.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );

  const activeFilterCount = [activeFinish, activeSkinType, activeCoverage].filter(
    (f) => f !== "all"
  ).length;

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading products...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Filter toggle bar */}
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.filterToggle}
          onPress={() => setShowFilters(!showFilters)}
        >
          <Ionicons name="filter" size={18} color={COLORS.primary} />
          <Text style={styles.filterToggleText}>
            Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
          </Text>
          <Ionicons
            name={showFilters ? "chevron-up" : "chevron-down"}
            size={16}
            color={COLORS.textSecondary}
          />
        </TouchableOpacity>
        <Text style={styles.resultCount}>{products.length} products</Text>
      </View>

      {/* Expandable filters */}
      {showFilters && (
        <View style={styles.filtersContainer}>
          <FilterChips
            label="Finish"
            options={FINISH_OPTIONS}
            active={activeFinish}
            onSelect={setActiveFinish}
          />
          <FilterChips
            label="Skin Type"
            options={SKIN_TYPE_OPTIONS}
            active={activeSkinType}
            onSelect={setActiveSkinType}
          />
          <FilterChips
            label="Coverage"
            options={COVERAGE_OPTIONS}
            active={activeCoverage}
            onSelect={setActiveCoverage}
          />

          {activeFilterCount > 0 && (
            <TouchableOpacity
              style={styles.clearFilters}
              onPress={() => {
                setActiveFinish("all");
                setActiveSkinType("all");
                setActiveCoverage("all");
              }}
            >
              <Text style={styles.clearFiltersText}>Clear all filters</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Product list */}
      <FlatList
        data={products}
        renderItem={({ item }) => <ProductCard product={item} />}
        keyExtractor={(item) => item._id}
        contentContainerStyle={styles.productList}
        numColumns={2}
        columnWrapperStyle={styles.row}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="search-outline" size={48} color={COLORS.textLight} />
            <Text style={styles.emptyText}>No products match your filters</Text>
            <TouchableOpacity
              onPress={() => {
                setActiveFinish("all");
                setActiveSkinType("all");
                setActiveCoverage("all");
              }}
            >
              <Text style={styles.clearFiltersText}>Clear filters</Text>
            </TouchableOpacity>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: COLORS.background,
  },
  loadingText: {
    marginTop: SPACING.sm,
    color: COLORS.textSecondary,
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  filterToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  filterToggleText: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.primary,
  },
  resultCount: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  filtersContainer: {
    padding: SPACING.md,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  filterSection: {
    marginBottom: SPACING.sm,
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.textSecondary,
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: COLORS.background,
    marginRight: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  chipText: {
    fontSize: 13,
    color: COLORS.text,
  },
  chipTextActive: {
    color: COLORS.textOnPrimary,
    fontWeight: "600",
  },
  clearFilters: {
    alignItems: "center",
    paddingVertical: SPACING.sm,
  },
  clearFiltersText: {
    color: COLORS.primary,
    fontWeight: "600",
    fontSize: 14,
  },
  productList: {
    padding: SPACING.sm,
  },
  row: {
    justifyContent: "space-between",
  },
  emptyContainer: {
    alignItems: "center",
    paddingTop: 60,
  },
  emptyText: {
    fontSize: 16,
    color: COLORS.textSecondary,
    marginTop: SPACING.md,
    marginBottom: SPACING.md,
  },
});
