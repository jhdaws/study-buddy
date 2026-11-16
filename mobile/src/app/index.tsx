// The session list (US-03), read-only for now: the same open sessions the
// web app lists, soonest first, with seats left. Pull down to refresh.
// Joining, hosting and the session page come in later slices.

import { Stack } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";

import { colors, TAP } from "@/components/theme";
import { formatWhen, listOpenSessions, seatsText, type SessionItem } from "@/lib/sessions";
import { supabase } from "@/lib/supabase";

type State =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; items: SessionItem[] };

export default function Sessions() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setState({ kind: "ready", items: await listOpenSessions(supabase) });
    } catch {
      setState({ kind: "error", message: "Couldn't load sessions. Pull down to try again." });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              onPress={() => void supabase.auth.signOut({ scope: "local" })}
              style={styles.headerButton}
            >
              <Text style={styles.headerButtonText}>Sign out</Text>
            </Pressable>
          ),
        }}
      />
      {state.kind === "loading" ? (
        <View style={styles.center}>
          <ActivityIndicator accessibilityLabel="Loading sessions" />
        </View>
      ) : (
        <FlatList
          data={state.kind === "ready" ? state.items : []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
          ListEmptyComponent={
            <Text style={styles.empty} accessibilityRole={state.kind === "error" ? "alert" : undefined}>
              {state.kind === "error" ? state.message : "No open sessions right now. Check back soon."}
            </Text>
          }
          renderItem={({ item }) => <SessionCard item={item} />}
        />
      )}
    </>
  );
}

function SessionCard({ item }: { item: SessionItem }) {
  const when = formatWhen(item.startsAt, item.endsAt);
  const seats = seatsText(item);
  return (
    <View
      style={styles.card}
      accessible
      accessibilityLabel={`${item.course}, ${item.topic}. ${when}. ${item.place}. Hosted by ${item.host}. ${seats}.`}
    >
      <Text style={styles.course}>
        {item.course}
        {item.courseTitle ? <Text style={styles.courseTitle}> · {item.courseTitle}</Text> : null}
      </Text>
      <Text style={styles.topic}>{item.topic}</Text>
      <Text style={styles.meta}>{when}</Text>
      <Text style={styles.meta}>{item.place}</Text>
      <View style={styles.footer}>
        <Text style={styles.meta}>Hosted by {item.host}</Text>
        <Text style={[styles.seats, item.seatsLeft === 0 && { color: colors.ink3 }]}>
          {item.going} of {item.capacity} · {seats}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: 16, gap: 12 },
  empty: { textAlign: "center", color: colors.ink2, fontSize: 16, marginTop: 48 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
    gap: 4,
  },
  course: { fontSize: 13, fontWeight: "700", color: colors.ink2 },
  courseTitle: { fontWeight: "400" },
  topic: { fontSize: 17, fontWeight: "600", color: colors.ink, marginBottom: 2 },
  meta: { fontSize: 14, color: colors.ink2 },
  footer: { flexDirection: "row", justifyContent: "space-between", marginTop: 6, gap: 8 },
  seats: { fontSize: 14, fontWeight: "600", color: colors.seat },
  headerButton: { minHeight: TAP, justifyContent: "center", paddingHorizontal: 8 },
  headerButtonText: { color: colors.accent, fontSize: 16 },
});
