package com.genvault.auth

import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import com.genvault.auth.BuildConfig

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    // Block screenshots in release; debug builds allow Play listing captures
    if (!BuildConfig.DEBUG) {
      window.setFlags(
        WindowManager.LayoutParams.FLAG_SECURE,
        WindowManager.LayoutParams.FLAG_SECURE
      )
    }
    super.onCreate(savedInstanceState)

    // Ask the SPA to handle back first. WebView.canGoBack() is unreliable for pushState.
    onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
      override fun handleOnBackPressed() {
        val webView = findWebView(window.decorView)
        if (webView == null) {
          finishActivity()
          return
        }
        webView.evaluateJavascript(
          "(function(){try{return (window.__genvaultBack&&window.__genvaultBack())?'1':'0';}catch(e){return'0';}})();"
        ) { raw ->
          runOnUiThread {
            val handled = raw == "1" || raw == "\"1\""
            if (!handled) {
              finishActivity()
            }
          }
        }
      }

      private fun finishActivity() {
        isEnabled = false
        onBackPressedDispatcher.onBackPressed()
        isEnabled = true
      }
    })
  }

  private fun findWebView(root: View?): WebView? {
    if (root == null) return null
    if (root is WebView) return root
    if (root is ViewGroup) {
      for (i in 0 until root.childCount) {
        val found = findWebView(root.getChildAt(i))
        if (found != null) return found
      }
    }
    return null
  }
}
