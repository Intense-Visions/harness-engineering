# FlatList and List Patterns

> Build performant scrollable lists with FlatList, SectionList, and FlashList for large data sets

## When to Use

- Rendering lists of items that may exceed screen height
- Implementing infinite scroll with pagination
- Building section-grouped lists (contacts, settings)
- Optimizing list rendering performance for hundreds or thousands of items
- Adding pull-to-refresh, swipe actions, or sticky headers

## Instructions

1. **Use `FlatList` for simple lists, `SectionList` for grouped data, and `FlashList` for maximum performance.**

```tsx
import { FlatList } from 'react-native';

function OrderList({ orders }: { orders: Order[] }) {
  return (
    <FlatList
      data={orders}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <OrderCard order={item} />}
    />
  );
}
```

2. **Always provide `keyExtractor`.** Use a stable unique ID from your data. Never use array index as the key — it breaks reordering and causes incorrect recycling.

3. **Memoize `renderItem` components** to prevent unnecessary re-renders during scrolling.

```tsx
const OrderCard = memo(function OrderCard({ order }: { order: Order }) {
  return (
    <View style={styles.card}>
      <Text>{order.title}</Text>
      <Text>{order.status}</Text>
    </View>
  );
});

// Stable renderItem reference
const renderItem = useCallback(({ item }: { item: Order }) => <OrderCard order={item} />, []);
```

4. **Set `getItemLayout` when item heights are fixed.** This eliminates measurement overhead and enables instant scroll-to-index.

```tsx
<FlatList
  data={items}
  getItemLayout={(data, index) => ({
    length: ITEM_HEIGHT,
    offset: ITEM_HEIGHT * index,
    index,
  })}
/>
```

5. **Implement infinite scroll with `onEndReached`.**

```tsx
function InfiniteList() {
  const [data, setData] = useState<Item[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  const loadMore = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    const newItems = await fetchItems(page + 1);
    setData((prev) => [...prev, ...newItems]);
    setPage((p) => p + 1);
    setLoading(false);
  }, [page, loading]);

  return (
    <FlatList
      data={data}
      renderItem={renderItem}
      keyExtractor={(item) => item.id}
      onEndReached={loadMore}
      onEndReachedThreshold={0.5}
      ListFooterComponent={loading ? <ActivityIndicator /> : null}
    />
  );
}
```

6. **Add pull-to-refresh with `refreshing` and `onRefresh`.**

```tsx
<FlatList
  data={data}
  renderItem={renderItem}
  refreshing={isRefreshing}
  onRefresh={async () => {
    setIsRefreshing(true);
    const fresh = await fetchItems(1);
    setData(fresh);
    setIsRefreshing(false);
  }}
/>
```

7. **Use `SectionList` for grouped data with headers.**

```tsx
import { SectionList } from 'react-native';

const sections = [
  { title: 'Today', data: todayItems },
  { title: 'Yesterday', data: yesterdayItems },
];

<SectionList
  sections={sections}
  keyExtractor={(item) => item.id}
  renderItem={({ item }) => <ItemRow item={item} />}
  renderSectionHeader={({ section }) => <Text style={styles.header}>{section.title}</Text>}
  stickySectionHeadersEnabled
/>;
```

8. **Use FlashList for better performance with large lists.** FlashList by Shopify uses cell recycling instead of unmounting, providing significantly better scroll performance.

```bash
npm install @shopify/flash-list
```

```tsx
import { FlashList } from '@shopify/flash-list';

<FlashList
  data={items}
  renderItem={({ item }) => <ItemRow item={item} />}
  estimatedItemSize={80} // Required — approximate height in pixels
  keyExtractor={(item) => item.id}
/>;
```

9. **Handle empty states with `ListEmptyComponent`.**

```tsx
<FlatList
  data={data}
  renderItem={renderItem}
  ListEmptyComponent={<EmptyState message="No orders yet" />}
  ListHeaderComponent={<SearchBar />}
/>
```

## Details

**FlatList vs. FlashList:** FlatList unmounts items as they scroll off-screen and mounts new ones. FlashList recycles views, updating existing components with new data. FlashList is typically 5-10x faster for large lists. Use FlashList when lists exceed ~100 items or when smooth 60fps scrolling is critical.

**Performance tuning props:**

- `removeClippedSubviews={true}` — detach offscreen views from the native hierarchy
- `maxToRenderPerBatch={10}` — items rendered per batch (lower = more responsive, slower fill)
- `windowSize={5}` — number of viewport-heights to render around visible area (lower = less memory, more blank space during fast scrolling)
- `updateCellsBatchingPeriod={50}` — milliseconds between batch renders

**Common mistakes:**

- Inline arrow functions in `renderItem` (causes re-render every cycle)
- Missing `keyExtractor` (defaults to index, breaks recycling)
- Not memoizing list items (every parent re-render re-renders every visible item)
- Using `ScrollView` for dynamic lists (renders all items at once, no virtualization)
- Setting `onEndReachedThreshold` too low (triggers only at the very bottom, feels laggy)

## Source

https://reactnative.dev/docs/flatlist
