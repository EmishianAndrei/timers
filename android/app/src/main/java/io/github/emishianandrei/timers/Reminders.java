package io.github.emishianandrei.timers;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.service.notification.StatusBarNotification;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Date;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Напоминания: расписание приходит с сайта (время → строки трекера), здесь ставится будильник на ближайшее время,
 * а в момент срабатывания показывается уведомление только о том, что за сегодня ещё не заполнено.
 */
final class Reminders {
    static final String PREFS = "reminders";
    static final String CHANNEL = "reminders";
    static final String ACTION_FIRE = "io.github.emishianandrei.timers.FIRE";
    static final String ACTION_MARK = "io.github.emishianandrei.timers.MARK";

    private Reminders() {}

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static String today() {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
    }

    static int notifId(String time) {
        String[] p = time.split(":");
        return 1000 + Integer.parseInt(p[0]) * 60 + Integer.parseInt(p[1]);
    }

    static void ensureChannel(Context c) {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Напоминания", NotificationManager.IMPORTANCE_DEFAULT);
            ch.setDescription("Напоминания отметить привычки и строки трекера");
            c.getSystemService(NotificationManager.class).createNotificationChannel(ch);
        }
    }

    static JSONArray slots(Context c) {
        try {
            return new JSONObject(prefs(c).getString("schedule", "{}")).optJSONArray("slots");
        } catch (Exception e) {
            return null;
        }
    }

    static JSONObject slot(Context c, String time) {
        JSONArray s = slots(c);
        if (s == null) return null;
        for (int i = 0; i < s.length(); i++) {
            JSONObject o = s.optJSONObject(i);
            if (o != null && time.equals(o.optString("time"))) return o;
        }
        return null;
    }

    /** Будильник на ближайшее время из расписания. */
    static void scheduleNext(Context c) {
        AlarmManager am = c.getSystemService(AlarmManager.class);
        Intent i = new Intent(c, ReminderReceiver.class).setAction(ACTION_FIRE);
        JSONArray s = slots(c);
        long best = Long.MAX_VALUE;
        String bestTime = null;
        long now = System.currentTimeMillis();
        if (s != null) {
            for (int k = 0; k < s.length(); k++) {
                String t = s.optJSONObject(k) == null ? "" : s.optJSONObject(k).optString("time");
                if (!t.matches("\\d\\d:\\d\\d")) continue;
                Calendar cal = Calendar.getInstance();
                cal.set(Calendar.HOUR_OF_DAY, Integer.parseInt(t.substring(0, 2)));
                cal.set(Calendar.MINUTE, Integer.parseInt(t.substring(3, 5)));
                cal.set(Calendar.SECOND, 0);
                cal.set(Calendar.MILLISECOND, 0);
                if (cal.getTimeInMillis() <= now) cal.add(Calendar.DAY_OF_YEAR, 1);
                if (cal.getTimeInMillis() < best) { best = cal.getTimeInMillis(); bestTime = t; }
            }
        }
        if (bestTime == null) {
            PendingIntent old = PendingIntent.getBroadcast(c, 1, i, PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE);
            if (old != null) am.cancel(old);
            return;
        }
        i.putExtra("time", bestTime);
        PendingIntent pi = PendingIntent.getBroadcast(c, 1, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        if (Build.VERSION.SDK_INT >= 31 && !am.canScheduleExactAlarms()) am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, best, pi);
        else am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, best, pi);
    }

    /** Что уже отмечено за день: то, что прислал сайт, плюс отметки из уведомлений. */
    static Set<String> localDone(Context c, String date) {
        Set<String> done = new HashSet<>();
        try {
            JSONObject d = new JSONObject(prefs(c).getString("done", "{}"));
            if (date.equals(d.optString("date"))) {
                JSONArray ids = d.optJSONArray("ids");
                for (int i = 0; ids != null && i < ids.length(); i++) done.add(ids.optString(i));
            }
            JSONArray p = new JSONArray(prefs(c).getString("pending", "[]"));
            for (int i = 0; i < p.length(); i++) {
                JSONObject o = p.optJSONObject(i);
                if (o != null && date.equals(o.optString("date"))) done.add(o.optString("itemId"));
            }
        } catch (Exception ignored) {
        }
        return done;
    }

    /** Свежие отметки из таблицы (скрипт версии 4+). null — если не получилось. */
    static JSONObject serverFilled(Context c, String date) {
        try {
            JSONObject body = new JSONObject().put("key", cfg(c, "key")).put("filled", date);
            JSONObject res = post(c, body);
            return res == null ? null : res.optJSONObject("filled");
        } catch (Exception e) {
            return null;
        }
    }

    static String cfg(Context c, String k) {
        try {
            return new JSONObject(prefs(c).getString("cfg", "{}")).optString(k, "");
        } catch (Exception e) {
            return "";
        }
    }

    static JSONObject post(Context c, JSONObject body) {
        String url = cfg(c, "url");
        if (url.isEmpty() || cfg(c, "key").isEmpty()) return null;
        HttpURLConnection con = null;
        try {
            con = (HttpURLConnection) new URL(url).openConnection();
            con.setConnectTimeout(8000);
            con.setReadTimeout(12000);
            con.setInstanceFollowRedirects(true);
            con.setDoOutput(true);
            con.setRequestMethod("POST");
            con.setRequestProperty("Content-Type", "text/plain;charset=utf-8");
            try (OutputStream out = con.getOutputStream()) {
                out.write(body.toString().getBytes(StandardCharsets.UTF_8));
            }
            // Apps Script отвечает переадресацией на googleusercontent.com — идём по ней обычным GET
            int code = con.getResponseCode();
            if (code == 301 || code == 302 || code == 303 || code == 307) {
                String loc = con.getHeaderField("Location");
                con.disconnect();
                con = (HttpURLConnection) new URL(loc).openConnection();
                con.setConnectTimeout(8000);
                con.setReadTimeout(12000);
            }
            try (InputStream in = con.getInputStream()) {
                ByteArrayOutputStream buf = new ByteArrayOutputStream();
                byte[] b = new byte[8192];
                int n;
                while ((n = in.read(b)) > 0) buf.write(b, 0, n);
                JSONObject j = new JSONObject(buf.toString("UTF-8"));
                return j.optBoolean("ok") ? j : null;
            }
        } catch (Exception e) {
            return null;
        } finally {
            if (con != null) con.disconnect();
        }
    }

    /** Срабатывание: показать уведомление о незаполненных строках этого времени. */
    static void fire(Context c, String time, boolean askServer, boolean onlyIfShown) {
        JSONObject s = slot(c, time);
        if (s == null) return;
        String date = today();
        Set<String> done = localDone(c, date);
        JSONArray items = s.optJSONArray("items");
        if (askServer) {
            JSONObject f = serverFilled(c, date);
            if (f != null) {
                Iterator<String> it = f.keys();
                while (it.hasNext()) {
                    String id = it.next();
                    String type = typeOf(items, id);
                    if (!"check".equals(type) || "TRUE".equals(f.optString(id))) done.add(id);
                }
            }
        }
        List<JSONObject> left = new ArrayList<>();
        for (int i = 0; items != null && i < items.length(); i++) {
            JSONObject o = items.optJSONObject(i);
            if (o != null && !done.contains(o.optString("id"))) left.add(o);
        }
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        int id = notifId(time);
        if (onlyIfShown && !isShown(nm, id)) return;
        if (left.isEmpty()) { nm.cancel(id); return; }
        show(c, nm, id, time, date, left, onlyIfShown);
    }

    static String typeOf(JSONArray items, String id) {
        for (int i = 0; items != null && i < items.length(); i++) {
            JSONObject o = items.optJSONObject(i);
            if (o != null && id.equals(o.optString("id"))) return o.optString("type");
        }
        return "";
    }

    static boolean isShown(NotificationManager nm, int id) {
        for (StatusBarNotification n : nm.getActiveNotifications()) if (n.getId() == id) return true;
        return false;
    }

    static void show(Context c, NotificationManager nm, int id, String time, String date, List<JSONObject> left, boolean quiet) {
        ensureChannel(c);
        StringBuilder names = new StringBuilder();
        for (JSONObject o : left) names.append(names.length() > 0 ? ", " : "").append(o.optString("name"));
        String title = left.size() == 1 ? left.get(0).optString("name") : "Не забудь отметить · " + left.size();
        String text = left.size() == 1 ? "Ещё не отмечено сегодня" : names.toString();

        Intent open = new Intent(c, MainActivity.class).putExtra("open", "today")
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent content = PendingIntent.getActivity(c, id, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, CHANNEL) : new Notification.Builder(c);
        b.setSmallIcon(R.drawable.ic_stat)
                .setColor(0xFF2457C5)
                .setContentTitle(title)
                .setContentText(text)
                .setStyle(new Notification.BigTextStyle().bigText(text))
                .setContentIntent(content)
                .setAutoCancel(true)
                .setOnlyAlertOnce(quiet)
                .setCategory(Notification.CATEGORY_REMINDER);
        int k = 0;
        for (JSONObject o : left) {
            if (k >= 3) break;
            if (!"check".equals(o.optString("type"))) continue;
            Intent mark = new Intent(c, ReminderReceiver.class).setAction(ACTION_MARK)
                    .putExtra("time", time).putExtra("date", date).putExtra("itemId", o.optString("id"));
            PendingIntent pi = PendingIntent.getBroadcast(c, id * 10 + k, mark, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            String label = o.optString("name");
            if (label.length() > 18) label = label.substring(0, 17) + "…";
            b.addAction(new Notification.Action.Builder(null, "✓ " + label, pi).build());
            k++;
        }
        try {
            nm.notify(id, b.build());
        } catch (SecurityException ignored) { // уведомления не разрешены
        }
    }

    /** Кнопка ✓ в уведомлении: отметить, отправить в таблицу и запомнить для сайта. */
    static void mark(Context c, String time, String date, String itemId) {
        try {
            JSONArray p = new JSONArray(prefs(c).getString("pending", "[]"));
            p.put(new JSONObject().put("date", date).put("itemId", itemId).put("value", "TRUE"));
            prefs(c).edit().putString("pending", p.toString()).apply();
        } catch (Exception ignored) {
        }
        if (date.equals(today())) fire(c, time, false, true);
        try {
            JSONObject r = new JSONObject().put("id", date + "|" + itemId).put("date", date).put("itemId", itemId)
                    .put("value", "TRUE").put("updated", System.currentTimeMillis());
            JSONObject op = new JSONObject().put("c", "entries").put("op", "put").put("r", r);
            post(c, new JSONObject().put("key", cfg(c, "key")).put("ops", new JSONArray().put(op)));
        } catch (Exception ignored) {
        }
    }

    /** Сайт сообщил, что уже отмечено, — обновляем или убираем показанные уведомления. */
    static void refreshShown(Context c) {
        JSONArray s = slots(c);
        for (int i = 0; s != null && i < s.length(); i++) {
            JSONObject o = s.optJSONObject(i);
            if (o != null) fire(c, o.optString("time"), false, true);
        }
    }

    static void test(Context c) {
        ensureChannel(c);
        JSONArray s = slots(c);
        List<JSONObject> sample = new ArrayList<>();
        String time = "00:00";
        if (s != null && s.length() > 0) {
            JSONObject first = s.optJSONObject(0);
            time = first.optString("time", "00:00");
            JSONArray items = first.optJSONArray("items");
            for (int i = 0; items != null && i < items.length(); i++) {
                // в проверочном уведомлении без кнопок ✓, чтобы случайно ничего не отметить
                try { sample.add(new JSONObject().put("id", "test" + i).put("name", items.optJSONObject(i).optString("name")).put("type", "text")); } catch (Exception ignored) {}
            }
        }
        if (sample.isEmpty()) {
            try { sample.add(new JSONObject().put("id", "test").put("name", "Так будут выглядеть напоминания").put("type", "text")); } catch (Exception ignored) {}
        }
        show(c, c.getSystemService(NotificationManager.class), 999, time, today(), sample, false);
    }
}
