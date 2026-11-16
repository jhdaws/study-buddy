// The session list (US-03), read-only, laid out like the web list
// (src/components/SessionBrowser.tsx and SessionCard.tsx): sessions under
// day headings, each day a white panel with dividers, a time rail on the
// left, the course, topic, place and host on the right, and seats left in
// green or a grey "Full". Pull down to refresh.

import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import Logo from "@/components/Logo";
import { colors, font, RADIUS, TAP } from "@/components/theme";
import {
  formatTime,
  formatWhen,
  groupByDay,
  isInProgress,
  listOpenSessions,
  seatsText,
  type DayGroup,
  type SessionItem,
} from "@/lib/sessions";
import { supabase } from "@/lib/supabase";

type State =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; groups: DayGroup[]; now: Date };

export default function Sessions() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const now = new Date();
      setState({ kind: "ready", groups: groupByDay(await listOpenSessions(supabase), now), now });
    } catch {
      setState({ kind: "error" });
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

  const count = state.kind === "ready" ? state.groups.reduce((n, g) => n + g.data.length, 0) : 0;

  return (
    <SafeAreaView style={styles.page} edges={["top"]}>
      <View style={styles.topBar}>
        <Logo />
        <Pressable
          accessibilityRole="button"
          onPress={() => void supabase.auth.signOut({ scope: "local" })}
          style={({ pressed }) => [styles.signOut, pressed && { backgroundColor: colors.paper }]}
        >
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </View>

      {state.kind === "loading" ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} accessibilityLabel="Loading sessions" />
        </View>
      ) : (
        <SectionList
          sections={state.kind === "ready" ? state.groups : []}
          keyExtractor={(item) => item.id}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.brand} />}
          ListHeaderComponent={
            <View style={styles.header}>
              <Text style={styles.title} accessibilityRole="header">
                Study sessions
              </Text>
              <Text style={styles.lead}>Open sessions on campus, soonest first. Times are campus time.</Text>
            </View>
          }
          renderSectionHeader={({ section }) => (
            <View style={styles.dayHeader} accessibilityRole="header">
              <Text style={styles.dayTitle}>{section.title}</Text>
              <Text style={styles.dayCount}>
                {section.data.length} {section.data.length === 1 ? "session" : "sessions"}
              </Text>
            </View>
          )}
          renderItem={({ item, index, section }) => (
            <SessionRow
              item={item}
              now={state.kind === "ready" ? state.now : new Date()}
              first={index === 0}
              last={index === section.data.length - 1}
            />
          )}
          renderSectionFooter={() => <View style={{ height: 28 }} />}
          ListEmptyComponent={
            state.kind === "error" ? (
              <EmptyPanel
                alert
                title="Couldn't load sessions"
                body="Check your connection, then pull down to try again."
              />
            ) : (
              <EmptyPanel title="No open sessions right now" body="Check back soon, or host one on the website." />
            )
          }
          ListFooterComponent={
            count > 0 ? <Text style={styles.footer}>Joining and hosting from the app are coming next.</Text> : undefined
          }
        />
      )}
    </SafeAreaView>
  );
}

function SessionRow({ item, now, first, last }: { item: SessionItem; now: Date; first: boolean; last: boolean }) {
  const full = item.seatsLeft === 0;
  const live = isInProgress(item, now);
  const seats = seatsText(item);
  return (
    <View
      style={[styles.row, first && styles.rowFirst, last && styles.rowLast, !last && styles.rowDivider]}
      accessible
      accessibilityLabel={`${item.course}${item.courseTitle ? ` ${item.courseTitle}` : ""}. ${item.topic}. ${
        live ? "Happening now, " : ""
      }${formatWhen(item.startsAt, item.endsAt)}. ${item.place}. Hosted by ${item.host}. ${item.going} of ${
        item.capacity
      } going, ${seats}.`}
    >
      <View style={styles.rail}>
        <Text style={styles.start}>{formatTime(item.startsAt)}</Text>
        {live ? (
          <View style={styles.liveRow}>
            <View style={styles.liveDot} />
            <Text style={styles.live} numberOfLines={1}>
              Happening now
            </Text>
          </View>
        ) : (
          <Text style={styles.until}>to {formatTime(item.endsAt)}</Text>
        )}
      </View>

      <View style={styles.main}>
        <View style={styles.titleRow}>
          <Text style={styles.course} numberOfLines={1}>
            {item.course}
            {item.courseTitle ? <Text style={styles.courseTitle}> {item.courseTitle}</Text> : null}
          </Text>
          {full ? (
            <View style={styles.fullPill}>
              <Text style={styles.fullText}>Full</Text>
            </View>
          ) : (
            <Text style={styles.seats}>{seats}</Text>
          )}
        </View>
        <Text style={[styles.topic, full && { color: colors.ink2 }]}>{item.topic}</Text>
        <Text style={styles.meta}>{item.place}</Text>
        <Text style={styles.meta} numberOfLines={1}>
          Hosted by <Text style={{ color: colors.ink }}>{item.host}</Text>
        </Text>
      </View>
    </View>
  );
}

function EmptyPanel({ title, body, alert = false }: { title: string; body: string; alert?: boolean }) {
  return (
    <View style={styles.empty} accessibilityRole={alert ? "alert" : undefined}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
    </View>
  );
}

const panelEdge = { borderColor: colors.line, borderLeftWidth: 1, borderRightWidth: 1 } as const;

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.paper },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingLeft: 16,
    paddingRight: 8,
    paddingVertical: 8,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  signOut: { minHeight: TAP, justifyContent: "center", paddingHorizontal: 12, borderRadius: 10 },
  signOutText: { fontFamily: font.semibold, fontSize: 15, color: colors.signal },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { paddingHorizontal: 16, paddingBottom: 32 },
  header: { paddingTop: 20, paddingBottom: 20 },
  title: { fontFamily: font.bold, fontSize: 28, lineHeight: 34, letterSpacing: -0.4, color: colors.ink },
  lead: { fontFamily: font.regular, fontSize: 15, lineHeight: 21, color: colors.ink2, marginTop: 4 },
  dayHeader: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 },
  dayTitle: { fontFamily: font.bold, fontSize: 17, color: colors.ink },
  dayCount: { fontFamily: font.regular, fontSize: 14, color: colors.ink2 },

  row: { flexDirection: "row", gap: 16, paddingHorizontal: 16, paddingVertical: 16, backgroundColor: colors.card, ...panelEdge },
  rowFirst: { borderTopWidth: 1, borderTopLeftRadius: RADIUS.panel, borderTopRightRadius: RADIUS.panel },
  rowLast: { borderBottomWidth: 1, borderBottomLeftRadius: RADIUS.panel, borderBottomRightRadius: RADIUS.panel },
  rowDivider: { borderBottomWidth: 1 },

  rail: { width: 92, paddingTop: 1 },
  start: { fontFamily: font.bold, fontSize: 15, lineHeight: 19, color: colors.ink, fontVariant: ["tabular-nums"] },
  until: { fontFamily: font.regular, fontSize: 12, color: colors.ink2, marginTop: 2 },
  liveRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.signal },
  live: { fontFamily: font.semibold, fontSize: 12, color: colors.signal, flexShrink: 0 },

  main: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  course: { flex: 1, fontFamily: font.bold, fontSize: 15, lineHeight: 20, color: colors.ink },
  courseTitle: { fontFamily: font.medium, color: colors.ink2 },
  seats: { fontFamily: font.semibold, fontSize: 14, lineHeight: 20, color: colors.seat },
  fullPill: { backgroundColor: colors.paper, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  fullText: { fontFamily: font.semibold, fontSize: 14, color: colors.ink2 },
  topic: { fontFamily: font.semibold, fontSize: 15, lineHeight: 20, color: colors.ink, marginTop: 2 },
  meta: { fontFamily: font.regular, fontSize: 14, lineHeight: 20, color: colors.ink2, marginTop: 4 },

  empty: {
    backgroundColor: colors.card,
    borderRadius: RADIUS.panel,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 20,
    paddingVertical: 32,
    alignItems: "center",
    gap: 6,
  },
  emptyTitle: { fontFamily: font.bold, fontSize: 17, color: colors.ink, textAlign: "center" },
  emptyBody: { fontFamily: font.regular, fontSize: 15, lineHeight: 21, color: colors.ink2, textAlign: "center" },
  footer: { fontFamily: font.regular, fontSize: 13, color: colors.ink2, textAlign: "center", marginTop: 4 },
});
