package kr.stockwatch.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * 저평가 워치: 웹 앱(GitHub Pages)을 전체 화면으로 여는 얇은 앱 껍데기.
 * - 앱 주소(app_url)의 페이지는 앱 안에서, 다른 사이트(실시간 시세·뉴스 등)는 폰 브라우저로 엽니다.
 * - 오프라인 캐시와 관심종목·메모 저장은 웹 앱(서비스 워커·localStorage)이 맡습니다.
 * - 뒤로 가기: 열린 상세 화면·메뉴부터 닫고, 더 닫을 것이 없으면 앱을 나갑니다.
 */
public class MainActivity extends Activity {
    private WebView web;
    private String appUrl;
    private String appHost;

    private static final String OFFLINE_HTML =
        "<html><head><meta name='viewport' content='width=device-width,initial-scale=1'></head>"
        + "<body style='font-family:sans-serif;display:grid;place-items:center;height:90vh;margin:0;color:#5A6875;text-align:center'>"
        + "<div><p style='font-size:17px;color:#15202B'>인터넷에 연결할 수 없습니다</p>"
        + "<p>처음 한 번은 인터넷이 필요합니다.<br>연결을 확인한 뒤 다시 시도해 주세요.</p>"
        + "<button onclick='location.href=\"%s\"' style='margin-top:12px;padding:12px 22px;border:0;border-radius:10px;background:#1F3864;color:#fff;font-size:15px'>다시 시도</button></div>"
        + "</body></html>";

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        appUrl = getString(R.string.app_url);
        appHost = Uri.parse(appUrl).getHost();

        web = new WebView(this);
        web.setBackgroundColor(Color.TRANSPARENT);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);

        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (appHost != null && appHost.equalsIgnoreCase(uri.getHost()) && uri.getPath() != null
                        && uri.getPath().startsWith(Uri.parse(appUrl).getPath())) {
                    return false; // 앱 페이지는 앱 안에서
                }
                openExternal(uri);
                return true;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    view.loadDataWithBaseURL(null, String.format(OFFLINE_HTML, appUrl), "text/html", "utf-8", null);
                }
            }
        });

        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState);
        } else {
            web.loadUrl(appUrl);
        }
    }

    private void openExternal(Uri uri) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException ignored) {
            // 열 수 있는 앱이 없으면 무시
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        web.evaluateJavascript("(window.__back && window.__back()) ? '1' : '0'", value -> {
            if ("\"1\"".equals(value)) return;
            if (web.canGoBack()) web.goBack();
            else MainActivity.super.onBackPressed();
        });
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
