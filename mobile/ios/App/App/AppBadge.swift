import UIKit
import UserNotifications
import Capacitor

/// The red number on the app's icon (owner, 2026-11-19: "the same as in the
/// app"): new notices in the bell plus desk/AI replies not read yet -- the
/// number the 訊息 tab shows. A push carries it (lib/push.ts, aps.badge);
/// the page sets it again whenever it reads the count (components/AppShell),
/// so reading things inside the app takes it down at once.
///
/// JS: Capacitor.Plugins.AppBadge.set({ count: 3 })  -> {}
///     count 0 clears it.
/// Registered in AppViewController.capacitorDidLoad (SceneDelegate.swift).
@objc(AppBadgePlugin)
public class AppBadgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AppBadgePlugin"
    public let jsName = "AppBadge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise)
    ]

    @objc func set(_ call: CAPPluginCall) {
        let n = max(0, call.getInt("count") ?? 0)
        DispatchQueue.main.async {
            if #available(iOS 16.0, *) {
                UNUserNotificationCenter.current().setBadgeCount(n) { _ in call.resolve() }
            } else {
                UIApplication.shared.applicationIconBadgeNumber = n
                call.resolve()
            }
        }
    }
}
