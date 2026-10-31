package io.github.emishianandrei.timers;

import android.Manifest;
import android.app.Activity;
import android.app.NotificationManager;
import android.content.ActivityNotFoundException;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.provider.Settings;
import android.util.Base64;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * Приложение «Трекер»: открывает сайт https://emishianandrei.github.io/timers/ в полноэкранном окне.
 * Данные хранятся там же, где у сайта (память телефона + Google-таблица через синхронизацию).
 */
public class MainActivity extends Activity {
    static final String HOST = "emishianandrei.github.io";
    static final String START = "https://" + HOST + "/timers/";
    static final int PICK_FILE = 1;
    static final int ASK_NOTIF = 2;

    private WebView web;
    private ValueCallback<Uri[]> fileCallback;
    private boolean wasOffline;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        web = new WebView(this);
        web.setBackgroundColor(getColor(R.color.bg));
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);          // localStorage — здесь живут данные и ключ таблицы
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false); // звонок таймера
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setUserAgentString(s.getUserAgentString() + " TrackerAndroid/1");
        CookieManager.getInstance().setAcceptCookie(true);

        web.addJavascriptInterface(new Bridge(), "TrackerAndroid");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (HOST.equals(u.getHost()) || "about".equals(u.getScheme())) return false;
                openOutside(u); // остальные ссылки — в браузере
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                // после экрана «нет интернета» убираем его из истории, чтобы «Назад» не возвращал туда
                if (wasOffline && url.startsWith(START)) { wasOffline = false; view.clearHistory(); }
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError err) {
                if (req.isForMainFrame()) showOffline();
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override // «Восстановить из файла» в настройках
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> cb, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = cb;
                try {
                    startActivityForResult(params.createIntent(), PICK_FILE);
                } catch (ActivityNotFoundException e) {
                    fileCallback = null;
                    return false;
                }
                return true;
            }
        });

        // «Скачать резервную копию»: сайт создаёт blob — забираем его через мост и кладём в «Загрузки»
        web.setDownloadListener((url, ua, cd, mime, len) -> {
            if (url.startsWith("blob:")) {
                web.evaluateJavascript("(async()=>{const b=await (await fetch('" + url + "')).blob();"
                        + "const r=new FileReader();r.onload=()=>TrackerAndroid.save(r.result.split(',')[1],'" + (mime == null ? "" : mime) + "');"
                        + "r.readAsDataURL(b);})()", null);
            } else {
                openOutside(Uri.parse(url));
            }
        });

        Reminders.ensureChannel(this);
        Reminders.scheduleNext(this);
        if (state != null) web.restoreState(state);
        else web.loadUrl(START + ("today".equals(getIntent().getStringExtra("open")) ? "#today" : ""));
    }

    boolean notifGranted() {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return false;
        return getSystemService(NotificationManager.class).areNotificationsEnabled();
    }

    void askNotif() {
        if (notifGranted()) { js("window.onNativePerm&&onNativePerm()"); return; }
        boolean asked = Reminders.prefs(this).getBoolean("askedNotif", false);
        if (Build.VERSION.SDK_INT >= 33 && (!asked || shouldShowRequestPermissionRationale(Manifest.permission.POST_NOTIFICATIONS))) {
            Reminders.prefs(this).edit().putBoolean("askedNotif", true).apply();
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, ASK_NOTIF);
        } else {
            // уже отказывали — открываем настройки уведомлений приложения
            try {
                startActivity(new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName()));
            } catch (ActivityNotFoundException ignored) {
            }
        }
    }

    @Override
    public void onRequestPermissionsResult(int req, String[] perms, int[] res) {
        super.onRequestPermissionsResult(req, perms, res);
        if (req == ASK_NOTIF) js("window.onNativePerm&&onNativePerm()");
    }

    private void js(String code) {
        runOnUiThread(() -> { if (web != null) web.evaluateJavascript(code, null); });
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if ("today".equals(intent.getStringExtra("open"))) js("location.hash='#today';window.onNativeResume&&onNativeResume()");
    }

    private void openOutside(Uri u) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, u));
        } catch (ActivityNotFoundException ignored) {
        }
    }

    private void showOffline() {
        String bg = String.format("#%06X", 0xFFFFFF & getColor(R.color.bg));
        String fg = String.format("#%06X", 0xFFFFFF & getColor(R.color.fg));
        String html = "<html><head><meta name=viewport content='width=device-width,initial-scale=1'></head>"
                + "<body style='margin:0;height:100vh;display:grid;place-items:center;font-family:sans-serif;background:" + bg + ";color:" + fg + "'>"
                + "<div style='text-align:center;padding:24px'><p style='font-size:18px;margin:0 0 8px'>Нет подключения к интернету</p>"
                + "<p style='opacity:.7;margin:0 0 20px'>Для первого запуска нужен интернет. Потом трекер работает и без него.</p>"
                + "<button onclick=\"location.href='" + START + "'\" style='font-size:16px;padding:10px 22px;border-radius:10px;border:0;background:#2457c5;color:#fff'>Повторить</button></div></body></html>";
        wasOffline = true;
        web.loadDataWithBaseURL("about:blank", html, "text/html", "utf-8", null);
    }

    class Bridge {
        // ---- напоминания ----
        @JavascriptInterface
        public void setConfig(String json) { Reminders.prefs(MainActivity.this).edit().putString("cfg", json).apply(); }

        @JavascriptInterface
        public void setSchedule(String json) {
            if (json.equals(Reminders.prefs(MainActivity.this).getString("schedule", ""))) return;
            Reminders.prefs(MainActivity.this).edit().putString("schedule", json).apply();
            Reminders.scheduleNext(MainActivity.this);
        }

        @JavascriptInterface
        public void setDone(String json) {
            Reminders.prefs(MainActivity.this).edit().putString("done", json).apply();
            Reminders.refreshShown(MainActivity.this);
        }

        /** отметки из уведомлений, которые сайт ещё не видел */
        @JavascriptInterface
        public String takePending() {
            String p = Reminders.prefs(MainActivity.this).getString("pending", "[]");
            Reminders.prefs(MainActivity.this).edit().putString("pending", "[]").apply();
            return p;
        }

        @JavascriptInterface
        public String notifStatus() { return notifGranted() ? "granted" : "denied"; }

        @JavascriptInterface
        public void requestNotif() { runOnUiThread(MainActivity.this::askNotif); }

        @JavascriptInterface
        public void testNotif() { Reminders.test(MainActivity.this); }

        @JavascriptInterface
        public void save(String b64, String mime) {
            String name = "tracker-backup-" + new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date()) + ".json";
            try {
                byte[] data = Base64.decode(b64, Base64.DEFAULT);
                if (Build.VERSION.SDK_INT >= 29) {
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.Downloads.DISPLAY_NAME, name);
                    v.put(MediaStore.Downloads.MIME_TYPE, mime == null || mime.isEmpty() ? "application/json" : mime);
                    Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                    try (OutputStream out = getContentResolver().openOutputStream(uri)) { out.write(data); }
                    toast("Сохранено в «Загрузки»: " + name);
                } else {
                    File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                    File f = new File(dir, name);
                    try (OutputStream out = new FileOutputStream(f)) { out.write(data); }
                    toast("Сохранено: " + f.getAbsolutePath());
                }
            } catch (Exception e) {
                toast("Не удалось сохранить файл: " + e.getMessage());
            }
        }
    }

    private void toast(String t) {
        runOnUiThread(() -> Toast.makeText(this, t, Toast.LENGTH_LONG).show());
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        if (req == PICK_FILE && fileCallback != null) {
            fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(res, data));
            fileCallback = null;
            return;
        }
        super.onActivityResult(req, res, data);
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        js("window.onNativePerm&&onNativePerm();window.onNativeResume&&onNativeResume()");
    }

    @Override
    protected void onPause() {
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        web.destroy();
        super.onDestroy();
    }
}
