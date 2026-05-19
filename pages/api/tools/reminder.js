import { addReminder, getActiveReminders, markReminderFired } from "../../../lib/store";

function parseAbsoluteTime(timeStr) {
  const now = new Date();
  const match = timeStr.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) return null;

  let hours = parseInt(match[1]);
  const minutes = match[2] ? parseInt(match[2]) : 0;
  const period = match[3]?.toLowerCase();

  if (period === "pm" && hours < 12) hours += 12;
  if (period === "am" && hours === 12) hours = 0;
  if (!period && hours < 12 && hours < now.getHours()) hours += 12;

  const target = new Date(now);
  target.setHours(hours, minutes, 0, 0);

  if (target <= now) {
    target.setDate(target.getDate() + 1);
  }

  return target;
}

export default async function handler(req, res) {
  if (req.method === "POST") {
    const { action, time, task, seconds, type } = req.body;

    if (action === "create") {
      let fireAt;

      if (type === "absolute" && time) {
        const parsed = parseAbsoluteTime(time);
        if (!parsed) return res.status(400).json({ error: "Could not parse time: " + time });
        fireAt = parsed.toISOString();
      } else if (type === "relative" && seconds) {
        fireAt = new Date(Date.now() + seconds * 1000).toISOString();
      } else {
        fireAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      }

      const entry = addReminder({ task, fireAt, type: type || "immediate" });
      return res.status(200).json({
        type: "reminder",
        data: { ...entry, fireAt, timeStr: time || "" },
      });
    }

    if (action === "fire") {
      const { id } = req.body;
      markReminderFired(id);
      return res.status(200).json({ type: "reminder_fired", data: { id } });
    }

    if (action === "list") {
      const active = getActiveReminders();
      return res.status(200).json({ type: "reminder_list", data: active });
    }

    return res.status(400).json({ error: "Unknown action" });
  }

  if (req.method === "GET") {
    const active = getActiveReminders();
    return res.status(200).json({ type: "reminder_list", data: active });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
