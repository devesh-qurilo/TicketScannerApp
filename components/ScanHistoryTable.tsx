import { ScrollView, StyleSheet, Text, View } from "react-native";

import { type TicketScanRecord, useAppStore } from "../store/useAppStore";
import { getTheme } from "../utils/theme";

type ScanHistoryTableProps = {
  records: TicketScanRecord[];
};

function formatStatusLabel(status: TicketScanRecord["status"]) {
  if (status === "used") {
    return "Used";
  }
  if (status === "invalid") {
    return "Invalid";
  }
  if (status === "queued") {
    return "Queued";
  }
  return "Valid";
}

function formatSyncLabel(status: TicketScanRecord["syncStatus"]) {
  if (status === "synced") {
    return "Synced";
  }
  if (status === "failed") {
    return "Retry";
  }
  return "Pending";
}

export default function ScanHistoryTable({
  records,
}: ScanHistoryTableProps) {
  const resolvedTheme = useAppStore((state) => state.resolvedTheme);
  const theme = getTheme(resolvedTheme);

  if (records.length === 0) {
    return (
      <View
        style={[
          styles.emptyState,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
          },
        ]}
      >
        <Text style={[styles.emptyText, { color: theme.colors.muted }]}>
          Scanned tickets will appear here with their validation and sync status.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={[styles.table, { borderColor: theme.colors.border }]}>
        <View style={[styles.headerRow, { backgroundColor: theme.colors.surface }]}>
          <Text style={[styles.headerCell, styles.ticketColumn, { color: theme.colors.text }]}>Ticket</Text>
          <Text style={[styles.headerCell, styles.statusColumn, { color: theme.colors.text }]}>Result</Text>
          <Text style={[styles.headerCell, styles.timeColumn, { color: theme.colors.text }]}>Time</Text>
          <Text style={[styles.headerCell, styles.syncColumn, { color: theme.colors.text }]}>Sync</Text>
        </View>
        {records.map((record, index) => (
          <View
            key={record.id}
            style={[
              styles.row,
              {
                backgroundColor: index % 2 === 0 ? theme.colors.card : theme.colors.surface,
                borderTopColor: theme.colors.border,
              },
            ]}
          >
            <View style={[styles.cell, styles.ticketColumn]}>
              <Text style={[styles.primaryText, { color: theme.colors.text }]}>
                {record.ticketId}
              </Text>
              <Text style={[styles.secondaryText, { color: theme.colors.muted }]}>
                {record.attendeeName ?? record.message}
              </Text>
            </View>
            <View style={[styles.cell, styles.statusColumn]}>
              <Text style={[styles.primaryText, { color: theme.colors.text }]}>
                {formatStatusLabel(record.status)}
              </Text>
            </View>
            <View style={[styles.cell, styles.timeColumn]}>
              <Text style={[styles.primaryText, { color: theme.colors.text }]}>
                {new Date(record.checkedAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </Text>
              <Text style={[styles.secondaryText, { color: theme.colors.muted }]}>
                {new Date(record.checkedAt).toLocaleDateString()}
              </Text>
            </View>
            <View style={[styles.cell, styles.syncColumn]}>
              <Text style={[styles.primaryText, { color: theme.colors.text }]}>
                {formatSyncLabel(record.syncStatus)}
              </Text>
              <Text style={[styles.secondaryText, { color: theme.colors.muted }]}>
                {record.syncedAt
                  ? new Date(record.syncedAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "Not sent"}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  table: {
    borderRadius: 18,
    borderWidth: 1,
    minWidth: 720,
    overflow: "hidden",
  },
  headerRow: {
    flexDirection: "row",
    paddingVertical: 12,
  },
  row: {
    borderTopWidth: 1,
    flexDirection: "row",
    minHeight: 74,
  },
  headerCell: {
    fontSize: 13,
    fontWeight: "800",
    paddingHorizontal: 12,
    textTransform: "uppercase",
  },
  cell: {
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  ticketColumn: {
    width: 280,
  },
  statusColumn: {
    width: 110,
  },
  timeColumn: {
    width: 170,
  },
  syncColumn: {
    width: 140,
  },
  primaryText: {
    fontSize: 14,
    fontWeight: "700",
  },
  secondaryText: {
    fontSize: 12,
    marginTop: 4,
  },
  emptyState: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 20,
  },
});
