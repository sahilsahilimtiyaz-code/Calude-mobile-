// Patches the Capacitor-generated MainActivity so Puter.js login popups
// (window.open) open in an in-app dialog WebView instead of hijacking
// the main WebView. Preserves window.opener so Puter auth completes.
const fs = require('fs');
const path = require('path');

const JAVA = `package com.claudeluxe.app;

import android.app.AlertDialog;
import android.content.DialogInterface;
import android.graphics.Bitmap;
import android.os.Bundle;
import android.os.Message;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.ConsoleMessage;
import android.webkit.GeolocationPermissions;
import android.webkit.JsPromptResult;
import android.webkit.JsResult;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebStorage;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        enablePopupWindows();
    }

    private void enablePopupWindows() {
        try {
            final WebView webView = this.bridge.getWebView();
            if (webView == null) return;
            webView.getSettings().setSupportMultipleWindows(true);
            webView.getSettings().setJavaScriptCanOpenWindowsAutomatically(true);
            final WebChromeClient original = webView.getWebChromeClient();
            webView.setWebChromeClient(new PopupFriendlyChromeClient(original));
        } catch (Exception ignored) {
        }
    }

    private static class PopupFriendlyChromeClient extends WebChromeClient {
        private final WebChromeClient delegate;

        PopupFriendlyChromeClient(WebChromeClient delegate) {
            this.delegate = delegate;
        }

        @Override
        public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
            try {
                final android.content.Context ctx = view.getContext();
                final WebView popup = new WebView(ctx);
                popup.getSettings().setJavaScriptEnabled(true);
                popup.getSettings().setDomStorageEnabled(true);
                popup.getSettings().setLoadWithOverviewMode(true);
                popup.getSettings().setUseWideViewPort(true);
                popup.getSettings().setSupportMultipleWindows(false);
                popup.setWebViewClient(new WebViewClient());
                final AlertDialog[] holder = new AlertDialog[1];
                popup.setWebChromeClient(new WebChromeClient() {
                    @Override
                    public void onCloseWindow(WebView window) {
                        try {
                            if (holder[0] != null) holder[0].dismiss();
                        } catch (Exception ignored) {
                        }
                    }
                });
                FrameLayout container = new FrameLayout(ctx);
                container.addView(popup, new FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT));
                AlertDialog dialog = new AlertDialog.Builder(ctx)
                        .setView(container)
                        .setCancelable(true)
                        .setNegativeButton("Close", new DialogInterface.OnClickListener() {
                            @Override
                            public void onClick(DialogInterface d, int which) {
                                d.dismiss();
                            }
                        })
                        .create();
                holder[0] = dialog;
                dialog.setOnDismissListener(new DialogInterface.OnDismissListener() {
                    @Override
                    public void onDismiss(DialogInterface d) {
                        try {
                            popup.destroy();
                        } catch (Exception ignored) {
                        }
                    }
                });
                dialog.show();
                try {
                    if (dialog.getWindow() != null) {
                        dialog.getWindow().setLayout(
                                ViewGroup.LayoutParams.MATCH_PARENT,
                                ViewGroup.LayoutParams.MATCH_PARENT);
                    }
                } catch (Exception ignored) {
                }
                WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
                transport.setWebView(popup);
                resultMsg.sendToTarget();
                return true;
            } catch (Exception e) {
                return false;
            }
        }

        // ---- everything else is delegated to Capacitor's client ----
        @Override public void onProgressChanged(WebView view, int newProgress) {
            if (delegate != null) delegate.onProgressChanged(view, newProgress);
            else super.onProgressChanged(view, newProgress);
        }
        @Override public void onReceivedTitle(WebView view, String title) {
            if (delegate != null) delegate.onReceivedTitle(view, title);
            else super.onReceivedTitle(view, title);
        }
        @Override public void onReceivedIcon(WebView view, Bitmap icon) {
            if (delegate != null) delegate.onReceivedIcon(view, icon);
            else super.onReceivedIcon(view, icon);
        }
        @Override public boolean onConsoleMessage(ConsoleMessage consoleMessage) {
            if (delegate != null) return delegate.onConsoleMessage(consoleMessage);
            return super.onConsoleMessage(consoleMessage);
        }
        @Override public boolean onJsAlert(WebView view, String url, String message, JsResult result) {
            if (delegate != null) return delegate.onJsAlert(view, url, message, result);
            return super.onJsAlert(view, url, message, result);
        }
        @Override public boolean onJsConfirm(WebView view, String url, String message, JsResult result) {
            if (delegate != null) return delegate.onJsConfirm(view, url, message, result);
            return super.onJsConfirm(view, url, message, result);
        }
        @Override public boolean onJsPrompt(WebView view, String url, String message, String defaultValue, JsPromptResult result) {
            if (delegate != null) return delegate.onJsPrompt(view, url, message, defaultValue, result);
            return super.onJsPrompt(view, url, message, defaultValue, result);
        }
        @Override public boolean onJsBeforeUnload(WebView view, String url, String message, JsResult result) {
            if (delegate != null) return delegate.onJsBeforeUnload(view, url, message, result);
            return super.onJsBeforeUnload(view, url, message, result);
        }
        @Override public boolean onShowFileChooser(WebView webView, ValueCallback<android.net.Uri[]> filePathCallback, FileChooserParams fileChooserParams) {
            if (delegate != null) return delegate.onShowFileChooser(webView, filePathCallback, fileChooserParams);
            return super.onShowFileChooser(webView, filePathCallback, fileChooserParams);
        }
        @Override public void onPermissionRequest(PermissionRequest request) {
            if (delegate != null) delegate.onPermissionRequest(request);
            else super.onPermissionRequest(request);
        }
        @Override public void onPermissionRequestCanceled(PermissionRequest request) {
            if (delegate != null) delegate.onPermissionRequestCanceled(request);
            else super.onPermissionRequestCanceled(request);
        }
        @Override public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
            if (delegate != null) delegate.onGeolocationPermissionsShowPrompt(origin, callback);
            else super.onGeolocationPermissionsShowPrompt(origin, callback);
        }
        @Override public void onGeolocationPermissionsHidePrompt() {
            if (delegate != null) delegate.onGeolocationPermissionsHidePrompt();
            else super.onGeolocationPermissionsHidePrompt();
        }
        @Override public void onExceededDatabaseQuota(String url, String databaseIdentifier, long quota, long estimatedDatabaseSize, long totalQuota, WebStorage.QuotaUpdater quotaUpdater) {
            if (delegate != null) delegate.onExceededDatabaseQuota(url, databaseIdentifier, quota, estimatedDatabaseSize, totalQuota, quotaUpdater);
            else super.onExceededDatabaseQuota(url, databaseIdentifier, quota, estimatedDatabaseSize, totalQuota, quotaUpdater);
        }
        @Override public void onReachedMaxAppCacheSize(long requiredStorage, long quota, WebStorage.QuotaUpdater quotaUpdater) {
            if (delegate != null) delegate.onReachedMaxAppCacheSize(requiredStorage, quota, quotaUpdater);
            else super.onReachedMaxAppCacheSize(requiredStorage, quota, quotaUpdater);
        }
        @Override public void onShowCustomView(View view, CustomViewCallback callback) {
            if (delegate != null) delegate.onShowCustomView(view, callback);
            else super.onShowCustomView(view, callback);
        }
        @Override public void onHideCustomView() {
            if (delegate != null) delegate.onHideCustomView();
            else super.onHideCustomView();
        }
        @Override public void onCloseWindow(WebView window) {
            if (delegate != null) delegate.onCloseWindow(window);
            else super.onCloseWindow(window);
        }
        @Override public boolean onJsTimeout() {
            if (delegate != null) return delegate.onJsTimeout();
            return super.onJsTimeout();
        }
    }
}
`;

const target = path.join(
  'android', 'app', 'src', 'main', 'java',
  'com', 'claudeluxe', 'app', 'MainActivity.java'
);

if (!fs.existsSync(target)) {
  console.error('MainActivity not found at ' + target + ' (did cap add android run?)');
  process.exit(1);
}
const current = fs.readFileSync(target, 'utf8');
if (!current.includes('extends BridgeActivity')) {
  console.error('Unexpected MainActivity content, refusing to overwrite');
  process.exit(1);
}
fs.writeFileSync(target, JAVA);
console.log('MainActivity patched with WebView popup support');
