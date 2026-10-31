package io.github.emishianandrei.timers;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Будильник напоминания, кнопка ✓ в уведомлении и перезапуск расписания после перезагрузки телефона. */
public class ReminderReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        final Context c = ctx.getApplicationContext();
        final String action = String.valueOf(intent.getAction());
        final PendingResult res = goAsync();
        new Thread(() -> {
            try {
                if (Reminders.ACTION_FIRE.equals(action)) {
                    String time = intent.getStringExtra("time");
                    if (time != null) Reminders.fire(c, time, true, false);
                    Reminders.scheduleNext(c);
                } else if (Reminders.ACTION_MARK.equals(action)) {
                    Reminders.mark(c, intent.getStringExtra("time"), intent.getStringExtra("date"), intent.getStringExtra("itemId"));
                } else {
                    Reminders.scheduleNext(c); // загрузка телефона, обновление приложения, смена времени
                }
            } catch (Exception ignored) {
            } finally {
                res.finish();
            }
        }).start();
    }
}
