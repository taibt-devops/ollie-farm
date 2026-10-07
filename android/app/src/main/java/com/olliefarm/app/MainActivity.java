package com.olliefarm.app;

import android.app.Activity;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.window.OnBackInvokedCallback;
import android.window.OnBackInvokedDispatcher;

/** Full-screen WebView running Ollie's Farm, bundled in assets/ (the repo's game/ folder). */
public class MainActivity extends Activity {
    private static final String START_URL = "file:///android_asset/index.html";

    private WebView web;
    private Object backCallback;   // OnBackInvokedCallback; typed Object so API < 33 never loads the class

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);   // no dimming mid-lesson

        web = new WebView(this);
        web.setBackgroundColor(0xFF1FB5C9);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);                   // localStorage keeps the stars
        s.setAllowFileAccess(true);                     // file:///android_asset
        s.setMediaPlaybackRequiresUserGesture(false);   // pronunciation plays right after a tap
        s.setTextZoom(100);                             // large system font must not break the layout
        web.setWebViewClient(new WebViewClient());      // never leave the app for a browser
        web.setOnLongClickListener(v -> true);          // no selection / context menu on long press
        web.setLongClickable(false);
        web.setHapticFeedbackEnabled(false);
        setContentView(web);

        if (state != null) web.restoreState(state);
        if (web.getUrl() == null) web.loadUrl(START_URL);

        if (Build.VERSION.SDK_INT >= 33) {
            OnBackInvokedCallback cb = this::goBack;
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, cb);
            backCallback = cb;
        }
    }

    /** System Back acts like the game's own back arrow; on the home screen it closes the app. */
    private void goBack() {
        web.evaluateJavascript("window.wordIslandBack ? wordIslandBack() : false", handled -> {
            if (!"true".equals(handled)) finish();
        });
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {   // Android 12 and older
        goBack();
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onPause() {
        web.evaluateJavascript("window.wordIslandPause && wordIslandPause()", null);
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        hideSystemBars();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    @Override
    protected void onDestroy() {
        if (Build.VERSION.SDK_INT >= 33 && backCallback != null) {
            getOnBackInvokedDispatcher().unregisterOnBackInvokedCallback((OnBackInvokedCallback) backCallback);
        }
        web.destroy();
        super.onDestroy();
    }

    /** Immersive full screen; a swipe from the edge shows the bars for a moment. */
    @SuppressWarnings("deprecation")
    private void hideSystemBars() {
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.systemBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                            | View.SYSTEM_UI_FLAG_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        }
    }
}
