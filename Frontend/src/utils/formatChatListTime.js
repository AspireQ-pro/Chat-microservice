export default function formatChatListTime(dateStr) {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return "";

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - 6);

  if (date >= startOfToday) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  if (date >= startOfYesterday) return "Yesterday";
  if (date >= startOfWeek) {
    return date.toLocaleDateString([], { weekday: "short" });
  }
  return date.toLocaleDateString([], {
    month: "numeric",
    day: "numeric",
    year: "2-digit",
  });
}
