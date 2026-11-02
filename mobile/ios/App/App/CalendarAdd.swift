import UIKit
import Capacitor

/// Subscribing the iPhone calendar to the family's lessons (owner,
/// 2026-11-02: all lessons at once, kept up to date, never twice). The
/// page hands over the family's webcal:// link (lib/calendar-feed.ts) and
/// iOS asks "Subscribe to calendar?"; from then on the iPhone reads the
/// lessons itself.
///
/// The web view cannot do this on its own: the link is on the site's own
/// address, so the app keeps it in the web view, which cannot open a
/// calendar and shows the "no internet" page (found 2026-11-02). Here it
/// goes to iOS instead.
///
/// JS: Capacitor.Plugins.CalendarAdd.subscribe({ url: 'webcal://...' })
///   -> { opened: true } when iOS took the link.
/// Registered in AppViewController.capacitorDidLoad (SceneDelegate.swift).
@objc(CalendarAddPlugin)
public class CalendarAddPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CalendarAddPlugin"
    public let jsName = "CalendarAdd"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "subscribe", returnType: CAPPluginReturnPromise)
    ]

    @objc func subscribe(_ call: CAPPluginCall) {
        guard let raw = call.getString("url"), let url = URL(string: raw), url.scheme == "webcal" else {
            call.reject("a webcal:// url is needed")
            return
        }
        DispatchQueue.main.async {
            UIApplication.shared.open(url, options: [:]) { ok in
                call.resolve(["opened": ok])
            }
        }
    }
}
