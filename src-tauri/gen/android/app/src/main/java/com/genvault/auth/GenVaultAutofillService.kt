package com.genvault.auth

import android.app.PendingIntent
import android.app.assist.AssistStructure
import android.content.Intent
import android.os.Build
import android.os.CancellationSignal
import android.service.autofill.AutofillService
import android.service.autofill.FillCallback
import android.service.autofill.FillRequest
import android.service.autofill.FillResponse
import android.service.autofill.SaveCallback
import android.service.autofill.SaveRequest
import android.view.autofill.AutofillId
import android.widget.RemoteViews
import androidx.annotation.RequiresApi

/**
 * System Autofill entry point.
 *
 * Gates: SharedPreferences `autofill_enabled` (default off). When disabled or
 * when the vault session is unavailable (process isolation from Tauri WebView),
 * returns an authentication Intent to [MainActivity] so the user can unlock.
 *
 * Full dataset fill via Rust `autofill_search` / `autofill_fill` requires a
 * same-process session bridge (Wave A: DONE_WITH_CONCERNS). Never logs field
 * values, passwords, or usernames.
 */
@RequiresApi(Build.VERSION_CODES.O)
class GenVaultAutofillService : AutofillService() {

    override fun onFillRequest(
        request: FillRequest,
        cancellationSignal: CancellationSignal,
        callback: FillCallback,
    ) {
        if (!AutofillPlugin.isEnabled(this)) {
            callback.onSuccess(null)
            return
        }

        val structure = request.fillContexts.lastOrNull()?.structure
        if (structure == null) {
            callback.onSuccess(null)
            return
        }

        val ids = mutableListOf<AutofillId>()
        collectAutofillIds(structure, ids)
        if (ids.isEmpty()) {
            callback.onSuccess(null)
            return
        }

        // Session bridge gap: cannot call Rust autofill_* from this service yet.
        val authIntent = Intent(this, MainActivity::class.java).apply {
            action = ACTION_AUTOFILL_UNLOCK
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pending = PendingIntent.getActivity(
            this,
            0,
            authIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val presentation = RemoteViews(packageName, android.R.layout.simple_list_item_1).apply {
            setTextViewText(android.R.id.text1, getString(R.string.autofill_unlock_prompt))
        }

        try {
            val response = FillResponse.Builder()
                .setAuthentication(ids.toTypedArray(), pending.intentSender, presentation)
                .build()
            callback.onSuccess(response)
        } catch (_: Exception) {
            // Fail closed — no datasets, no sensitive logs.
            callback.onSuccess(null)
        }
    }

    override fun onSaveRequest(request: SaveRequest, callback: SaveCallback) {
        // Wave A: no save-to-vault from Autofill.
        callback.onSuccess()
    }

    private fun collectAutofillIds(structure: AssistStructure, out: MutableList<AutofillId>) {
        for (i in 0 until structure.windowNodeCount) {
            collectNode(structure.getWindowNodeAt(i).rootViewNode, out)
        }
    }

    private fun collectNode(node: AssistStructure.ViewNode, out: MutableList<AutofillId>) {
        val id = node.autofillId
        val hints = node.autofillHints
        val isPwd = node.inputType.let { t ->
            (t and android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD) != 0 ||
                (t and android.text.InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD) != 0 ||
                (t and android.text.InputType.TYPE_NUMBER_VARIATION_PASSWORD) != 0
        }
        if (id != null && (
                (hints != null && hints.isNotEmpty()) ||
                    isPwd ||
                    node.importantForAutofill == android.view.View.IMPORTANT_FOR_AUTOFILL_YES
                )
        ) {
            out.add(id)
        }
        for (i in 0 until node.childCount) {
            collectNode(node.getChildAt(i), out)
        }
    }

    companion object {
        const val ACTION_AUTOFILL_UNLOCK = "com.genvault.auth.AUTOFILL_UNLOCK"
    }
}
