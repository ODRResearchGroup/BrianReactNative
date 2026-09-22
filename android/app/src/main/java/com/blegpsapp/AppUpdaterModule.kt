package com.blegpsapp

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File

class AppUpdaterModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = NAME

  override fun getConstants(): MutableMap<String, Any> =
      mutableMapOf("versionCode" to BuildConfig.VERSION_CODE)

  @ReactMethod
  fun canInstallPackages(promise: Promise) {
    promise.resolve(
        Build.VERSION.SDK_INT < Build.VERSION_CODES.O ||
            reactContext.packageManager.canRequestPackageInstalls())
  }

  @ReactMethod
  fun openInstallSettings(promise: Promise) {
    try {
      val intent = Intent(
          Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
          Uri.parse("package:${reactContext.packageName}"))
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      reactContext.startActivity(intent)
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("SETTINGS_FAILED", "Could not open install settings", error)
    }
  }

  @ReactMethod
  fun installApk(apkPath: String, promise: Promise) {
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
          !reactContext.packageManager.canRequestPackageInstalls()) {
        promise.reject("INSTALL_PERMISSION_REQUIRED", "Allow this app to install updates first")
        return
      }

      val apkFile = File(apkPath)
      if (!apkFile.exists()) {
        promise.reject("APK_NOT_FOUND", "The downloaded update is missing")
        return
      }

      val apkUri = FileProvider.getUriForFile(
          reactContext,
          "${reactContext.packageName}.fileprovider",
          apkFile)
      val intent = Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(apkUri, "application/vnd.android.package-archive")
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
      reactContext.startActivity(intent)
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("INSTALL_FAILED", "Could not start the Android installer", error)
    }
  }

  companion object {
    const val NAME = "AppUpdater"
  }
}