package com.genvault.auth

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.view.autofill.AutofillManager
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@InvokeArg
internal class AutofillEnabledArgs {
    var enabled: Boolean = false
}

@InvokeArg
internal class AutofillSearchArgs {
    var query: String = ""
    var packageName: String? = null
}

@InvokeArg
internal class AutofillFillArgs {
    lateinit var entryId: String
}

/**
 * Bridges prefs / system settings for GenVault Autofill.
 *
 * `autofillSearch` / `autofillFill` are stubs: AutofillService cannot reach the
 * unlocked Tauri session VMK across process isolation. Fill path for Wave A is
 * Rust `autofill_*` commands (WebView) + service unlock Intent; full on-device
 * fill needs a future JNI/session bridge (documented DONE_WITH_CONCERNS).
 */
@TauriPlugin
class AutofillPlugin(private val activity: Activity) : Plugin(activity) {
    companion object {
        const val PREFS = "genvault_autofill"
        const val KEY_ENABLED = "autofill_enabled"

        fun isEnabled(ctx: Context): Boolean =
            ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getBoolean(KEY_ENABLED, false)

        fun setEnabled(ctx: Context, enabled: Boolean) {
            ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .putBoolean(KEY_ENABLED, enabled)
                .apply()
        }
    }

    @Command
    fun setEnabled(invoke: Invoke) {
        val args = invoke.parseArgs(AutofillEnabledArgs::class.java)
        setEnabled(activity, args.enabled)
        invoke.resolve()
    }

    @Command
    fun isEnabled(invoke: Invoke) {
        val ret = JSObject()
        ret.put("enabled", isEnabled(activity))
        invoke.resolve(ret)
    }

    @Command
    fun openSystemSettings(invoke: Invoke) {
        try {
            val pkg = activity.packageName
            val intent = Intent(Settings.ACTION_REQUEST_SET_AUTOFILL_SERVICE).apply {
                data = Uri.parse("package:$pkg")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            activity.startActivity(intent)
            invoke.resolve()
        } catch (e: Exception) {
            try {
                activity.startActivity(
                    Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                )
                invoke.resolve()
            } catch (e2: Exception) {
                invoke.reject(e2.message ?: e.message ?: "Cannot open Autofill settings")
            }
        }
    }

    @Command
    fun autofillSearch(invoke: Invoke) {
        // Bridge gap: AutofillService / plugin cannot read vault session from Rust.
        invoke.reject("Autofill search requires unlocked Tauri session bridge (not yet wired)")
    }

    @Command
    fun autofillFill(invoke: Invoke) {
        invoke.reject("Autofill fill requires unlocked Tauri session bridge (not yet wired)")
    }

    @Command
    fun isAutofillServiceSelected(invoke: Invoke) {
        val ret = JSObject()
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            ret.put("selected", false)
            invoke.resolve(ret)
            return
        }
        val am = activity.getSystemService(AutofillManager::class.java)
        ret.put("selected", am?.hasEnabledAutofillServices() == true)
        invoke.resolve(ret)
    }
}
