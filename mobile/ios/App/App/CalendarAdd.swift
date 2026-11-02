import UIKit
import Capacitor
import EventKit
import EventKitUI

/// Adding a lesson to the iPhone's calendar (owner, 2026-11-02). The site's
/// "Add to calendar" used to be an .ics file, which the app's web view
/// cannot open: it gave up and showed the "no internet" page. This opens
/// iPhone's own "New Event" screen, filled in; the family taps Add (or
/// Cancel). Google Calendar is the other choice, opened outside the app.
///
/// iOS 17 and later run this screen outside the app, so it needs no
/// calendar permission. iOS 15-16 must ask first (NSCalendarsUsageDescription).
///
/// JS: Capacitor.Plugins.CalendarAdd.add({ title, location, notes, start, end })
///   start / end: ms since 1970.
///   -> { added: true } saved, { added: false } cancelled,
///      { added: false, denied: true } iOS 15-16 and access was refused.
/// Registered in AppViewController.capacitorDidLoad (SceneDelegate.swift).
@objc(CalendarAddPlugin)
public class CalendarAddPlugin: CAPPlugin, CAPBridgedPlugin, EKEventEditViewDelegate {
    public let identifier = "CalendarAddPlugin"
    public let jsName = "CalendarAdd"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "add", returnType: CAPPluginReturnPromise)
    ]

    private let store = EKEventStore()
    private var pending: CAPPluginCall?

    @objc func add(_ call: CAPPluginCall) {
        guard let title = call.getString("title"), let start = call.getDouble("start"), let end = call.getDouble("end"), end > start else {
            call.reject("title, start and end are needed")
            return
        }
        if let old = pending { old.resolve(["added": false]) }
        pending = call
        let location = call.getString("location")
        let notes = call.getString("notes")
        DispatchQueue.main.async {
            if #available(iOS 17.0, *) {
                self.present(title: title, start: start, end: end, location: location, notes: notes)
            } else {
                self.store.requestAccess(to: .event) { granted, _ in
                    DispatchQueue.main.async {
                        if granted {
                            self.present(title: title, start: start, end: end, location: location, notes: notes)
                        } else {
                            self.finish(["added": false, "denied": true])
                        }
                    }
                }
            }
        }
    }

    private func present(title: String, start: Double, end: Double, location: String?, notes: String?) {
        let event = EKEvent(eventStore: store)
        event.title = title
        event.startDate = Date(timeIntervalSince1970: start / 1000)
        event.endDate = Date(timeIntervalSince1970: end / 1000)
        event.timeZone = TimeZone(identifier: "America/Los_Angeles")
        if let location = location, !location.isEmpty { event.location = location }
        if let notes = notes, !notes.isEmpty { event.notes = notes }
        let editor = EKEventEditViewController()
        editor.eventStore = store
        editor.event = event
        editor.editViewDelegate = self
        guard let host = bridge?.viewController else {
            finish(["added": false])
            return
        }
        // Over whatever is showing, e.g. the lesson's own sheet in the page.
        var top: UIViewController = host
        while let shown = top.presentedViewController { top = shown }
        top.present(editor, animated: true)
    }

    public func eventEditViewController(_ controller: EKEventEditViewController, didCompleteWith action: EKEventEditViewAction) {
        controller.dismiss(animated: true)
        finish(["added": action == .saved])
    }

    private func finish(_ result: [String: Any]) {
        pending?.resolve(result)
        pending = nil
    }
}
