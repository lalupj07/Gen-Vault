package com.genxis.genvault

import android.app.Activity
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.File
import java.security.KeyStore
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

@InvokeArg
internal class HpkArgs {
    lateinit var hpk: String
}

/**
 * Android Keystore HPK wrap gated by BiometricPrompt + OS-enforced key auth.
 *
 * Key requires user authentication (biometric or device credential) with a
 * 30s validity window after authenticateGate(). Decrypt must happen within that window.
 */
@TauriPlugin
class HelloKeystorePlugin(private val activity: Activity) : Plugin(activity) {
    companion object {
        private const val KEY_ALIAS = "genvault_hello_hpk"
        private const val CIPHER_FILE = "hello_protector.android.dat"
        private const val ANDROID_KEYSTORE = "AndroidKeyStore"
        private const val AES_MODE = "AES/GCM/NoPadding"
        private const val IV_SIZE = 12
        private const val GCM_TAG_BITS = 128
        private const val BIOMETRIC_TIMEOUT_SEC = 45L
    }

    private val worker = Executors.newSingleThreadExecutor()
    private val mainHandler = Handler(Looper.getMainLooper())

    private val filesDir: File
        get() = activity.filesDir

    private fun cipherFile(): File = File(filesDir, CIPHER_FILE)

    private fun authenticators(): Int =
        BiometricManager.Authenticators.BIOMETRIC_WEAK or
            BiometricManager.Authenticators.DEVICE_CREDENTIAL

    @Command
    fun storeHpk(invoke: Invoke) {
        // HPK must never wrap VMK — presence-only biometrics via authenticatePresence.
        invoke.reject("Hello HPK storage is disabled; use password + biometric presence")
    }

    @Command
    fun loadHpk(invoke: Invoke) {
        invoke.reject("Hello HPK load is disabled; use password + biometric presence")
    }

    @Command
    fun deleteHpk(invoke: Invoke) {
        worker.execute {
            try {
                deleteInternal()
                invoke.resolve()
            } catch (e: Exception) {
                invoke.reject(e.message ?: e.toString())
            }
        }
    }

    @Command
    fun biometricAvailable(invoke: Invoke) {
        val manager = BiometricManager.from(activity)
        val result = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            manager.canAuthenticate(authenticators())
        } else {
            @Suppress("DEPRECATION")
            manager.canAuthenticate()
        }
        val ret = JSObject()
        ret.put("available", result == BiometricManager.BIOMETRIC_SUCCESS)
        // Face / fingerprint / device PIN all count when WEAK | DEVICE_CREDENTIAL succeeds
        ret.put("faceOrFingerprint", result == BiometricManager.BIOMETRIC_SUCCESS)
        invoke.resolve(ret)
    }

    /** Presence-only gate for unlock (no HPK unwrap). */
    @Command
    fun authenticatePresence(invoke: Invoke) {
        worker.execute {
            try {
                authenticateGate()
                invoke.resolve()
            } catch (e: Exception) {
                invoke.reject(e.message ?: e.toString())
            }
        }
    }

    private fun deleteInternal() {
        cipherFile().delete()
        try {
            val ks = KeyStore.getInstance(ANDROID_KEYSTORE)
            ks.load(null)
            if (ks.containsAlias(KEY_ALIAS)) {
                ks.deleteEntry(KEY_ALIAS)
            }
        } catch (_: Exception) {
            // Best-effort: presence-only model must not block vault wipe.
        }
    }

    private fun generateKey() {
        val keyGenerator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
        val builder = KeyGenParameterSpec.Builder(
            KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            // OS-enforced auth: key usable only after recent user authentication.
            // Validity window avoids CryptoObject + BIOMETRIC_STRONG hangs on Class-2 OEMs.
            .setUserAuthenticationRequired(true)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            builder.setUserAuthenticationParameters(
                60,
                KeyProperties.AUTH_BIOMETRIC_STRONG or KeyProperties.AUTH_DEVICE_CREDENTIAL,
            )
        } else {
            @Suppress("DEPRECATION")
            builder.setUserAuthenticationValidityDurationSeconds(60)
        }

        keyGenerator.init(builder.build())
        keyGenerator.generateKey()
    }

    private fun getSecretKey(): SecretKey {
        val ks = KeyStore.getInstance(ANDROID_KEYSTORE)
        ks.load(null)
        return (ks.getKey(KEY_ALIAS, null) as? SecretKey)
            ?: throw IllegalStateException("Hello keystore key missing")
    }

    /** Single BiometricPrompt: fingerprint, face, or device PIN/pattern. */
    private fun authenticateGate() {
        val canAuth = BiometricManager.from(activity).canAuthenticate(authenticators())
        if (canAuth != BiometricManager.BIOMETRIC_SUCCESS) {
            throw SecurityException(
                "Biometric/face/device lock unavailable (code $canAuth). Enable fingerprint, face unlock, or a screen lock.",
            )
        }

        val error = AtomicReference<Exception?>(null)
        val latch = CountDownLatch(1)
        val fragmentActivity = activity as androidx.fragment.app.FragmentActivity
        val executor = ContextCompat.getMainExecutor(activity)

        val info = BiometricPrompt.PromptInfo.Builder()
            .setTitle("GenVault")
            .setSubtitle("Confirm with fingerprint, face, or device PIN")
            .setAllowedAuthenticators(authenticators())
            .build()

        mainHandler.post {
            try {
                val prompt = BiometricPrompt(
                    fragmentActivity,
                    executor,
                    object : BiometricPrompt.AuthenticationCallback() {
                        override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                            latch.countDown()
                        }

                        override fun onAuthenticationError(code: Int, errString: CharSequence) {
                            error.set(SecurityException(errString.toString()))
                            latch.countDown()
                        }
                    },
                )
                prompt.authenticate(info)
            } catch (e: Exception) {
                error.set(e)
                latch.countDown()
            }
        }

        if (!latch.await(BIOMETRIC_TIMEOUT_SEC, TimeUnit.SECONDS)) {
            throw SecurityException("Biometric authentication timed out — try again or use master password")
        }
        error.get()?.let { throw it }
    }

    private fun hexToBytes(hex: String): ByteArray {
        val clean = hex.trim()
        require(clean.length % 2 == 0) { "Invalid hex" }
        return ByteArray(clean.length / 2) { i ->
            clean.substring(i * 2, i * 2 + 2).toInt(16).toByte()
        }
    }

    private fun bytesToHex(bytes: ByteArray): String =
        bytes.joinToString("") { "%02x".format(it) }
}
