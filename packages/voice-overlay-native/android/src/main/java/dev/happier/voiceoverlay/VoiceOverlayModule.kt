package dev.happier.voiceoverlay

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import android.text.TextUtils

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class VoiceOverlayModule : Module() {

    private fun ctx(): Context = appContext.reactContext ?: throw IllegalStateException("No React context")

    private fun setupServiceCallbacks() {
        VoiceOverlayService.onDismiss = {
            sendEvent("overlayDismissed", mapOf("reason" to "user"))
        }
        VoiceOverlayService.onStarted = {
            // Fired from VoiceOverlayService.onCreate() — this covers both
            // JS-initiated starts and native-initiated starts (ACTION_ASSIST).
            sendEvent("overlayStarted", mapOf("source" to "native"))
        }
    }

    override fun definition() = ModuleDefinition {
        Name("HappierVoiceOverlayNative")

        Events("overlayDismissed", "overlayStarted")

        OnCreate {
            // Register callbacks early so if MainActivity starts the service
            // before JS calls startOverlay(), the events still fire.
            setupServiceCallbacks()
        }

        OnDestroy {
            stopOverlayInternal()
        }

        Function("hasOverlayPermission") {
            return@Function Settings.canDrawOverlays(ctx())
        }

        Function("requestOverlayPermission") {
            val intent = Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:${ctx().packageName}")
            ).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            ctx().startActivity(intent)
        }

        Function("startOverlay") {
            val context = ctx()
            if (!Settings.canDrawOverlays(context)) {
                throw IllegalStateException("SYSTEM_ALERT_WINDOW permission not granted")
            }

            val intent = Intent(context, VoiceOverlayService::class.java)
            context.startForegroundService(intent)
            // overlayStarted event is emitted by the service's onCreate → onStarted callback
        }

        Function("stopOverlay") {
            stopOverlayInternal()
        }

        Function("updateStatus") { status: String ->
            // Find the running service instance via the application context
            // Since both run in the same process, use a static reference pattern
            VoiceOverlayServiceLocator.instance?.updateStatus(status)
        }

        Function("isAccessibilityServiceEnabled") {
            return@Function isAccessibilityEnabled()
        }

        Function("openAccessibilitySettings") {
            val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            ctx().startActivity(intent)
        }

        AsyncFunction("getScreenContent") {
            val svc = HappierAccessibilityService.instance
                ?: return@AsyncFunction mapOf(
                    "app" to "",
                    "visibleText" to emptyList<String>(),
                    "error" to "Accessibility service not enabled"
                )

            val content = ScreenContentReader.read(svc)
            return@AsyncFunction mapOf(
                "app" to content.app,
                "url" to (content.url ?: ""),
                "visibleText" to content.visibleText
            )
        }
    }

    private fun stopOverlayInternal() {
        val context = try { ctx() } catch (_: Exception) { return }
        val intent = Intent(context, VoiceOverlayService::class.java)
        context.stopService(intent)
        VoiceOverlayService.onDismiss = null
        VoiceOverlayService.onStarted = null
    }

    private fun isAccessibilityEnabled(): Boolean {
        val context = ctx()
        val expectedName = ComponentName(context, HappierAccessibilityService::class.java).flattenToString()
        val enabledServices = Settings.Secure.getString(
            context.contentResolver,
            Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        ) ?: return false
        val splitter = TextUtils.SimpleStringSplitter(':')
        splitter.setString(enabledServices)
        for (service in splitter) {
            if (service.equals(expectedName, ignoreCase = true)) return true
        }
        return false
    }
}
