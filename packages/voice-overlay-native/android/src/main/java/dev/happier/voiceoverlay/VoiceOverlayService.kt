package dev.happier.voiceoverlay

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.PixelFormat
import android.os.Build
import android.os.IBinder
import android.view.Gravity
import android.view.LayoutInflater
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.ImageButton
import android.widget.ImageView
import android.widget.TextView

object VoiceOverlayServiceLocator {
    var instance: VoiceOverlayService? = null
}

class VoiceOverlayService : Service() {

    companion object {
        private const val CHANNEL_ID = "voice_overlay_channel"
        private const val NOTIFICATION_ID = 9001
        var onDismiss: (() -> Unit)? = null
        var onStarted: (() -> Unit)? = null
    }

    private var windowManager: WindowManager? = null
    private var overlayView: View? = null
    private var statusText: TextView? = null
    private var statusIcon: ImageView? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        VoiceOverlayServiceLocator.instance = this
        createNotificationChannel()
        startForeground(NOTIFICATION_ID, buildNotification())
        showOverlay()
        onStarted?.invoke()
    }

    override fun onDestroy() {
        VoiceOverlayServiceLocator.instance = null
        removeOverlay()
        super.onDestroy()
    }

    fun updateStatus(status: String) {
        statusText?.text = when (status) {
            "recording" -> "Listening..."
            "transcribing" -> "Transcribing..."
            "sending" -> "Thinking..."
            "speaking" -> "Speaking..."
            "error" -> "Error"
            else -> "Ready"
        }

        statusIcon?.setImageResource(when (status) {
            "recording" -> android.R.drawable.ic_btn_speak_now
            "speaking" -> android.R.drawable.ic_lock_idle_low_battery
            else -> android.R.drawable.ic_menu_info_details
        })
    }

    private fun showOverlay() {
        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager

        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            else
                @Suppress("DEPRECATION")
                WindowManager.LayoutParams.TYPE_PHONE,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.CENTER
        }

        val inflater = LayoutInflater.from(this)
        overlayView = inflater.inflate(R.layout.voice_overlay, null)
        statusText = overlayView?.findViewById(R.id.status_text)
        statusIcon = overlayView?.findViewById(R.id.status_icon)

        val dismissBtn = overlayView?.findViewById<ImageButton>(R.id.dismiss_button)
        dismissBtn?.setOnClickListener {
            onDismiss?.invoke()
            stopSelf()
        }

        // Draggable overlay
        var initialX = 0
        var initialY = 0
        var initialTouchX = 0f
        var initialTouchY = 0f

        overlayView?.findViewById<View>(R.id.overlay_root)?.setOnTouchListener { _, event ->
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    initialX = params.x
                    initialY = params.y
                    initialTouchX = event.rawX
                    initialTouchY = event.rawY
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    params.x = initialX + (event.rawX - initialTouchX).toInt()
                    params.y = initialY + (event.rawY - initialTouchY).toInt()
                    windowManager?.updateViewLayout(overlayView, params)
                    true
                }
                else -> false
            }
        }

        windowManager?.addView(overlayView, params)
    }

    private fun removeOverlay() {
        overlayView?.let {
            windowManager?.removeView(it)
            overlayView = null
        }
        windowManager = null
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Voice Assistant",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Voice overlay assistant notification"
                setShowBadge(false)
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(): Notification {
        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL_ID)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
        }

        return builder
            .setContentTitle("Voice Assistant")
            .setContentText("Listening...")
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setOngoing(true)
            .build()
    }
}
