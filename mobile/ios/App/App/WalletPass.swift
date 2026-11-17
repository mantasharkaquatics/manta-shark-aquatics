import UIKit
import PassKit
import Capacitor

/// Adding a swimmer's check-in card to Apple Wallet (owner, 2026-11-17).
/// The page fetches the card from the site (app/api/parent/wallet-pass,
/// signed in, so the web view's own request) and hands its bytes here as
/// base64; iOS then shows its own "Add to Apple Wallet" screen.
///
/// The web view cannot do this on its own: a .pkpass opened inside it
/// does nothing.
///
/// JS: Capacitor.Plugins.WalletPass.add({ data: '<base64 .pkpass>' })
///   -> { shown: true } once the Wallet screen is up.
/// Registered in AppViewController.capacitorDidLoad (SceneDelegate.swift).
@objc(WalletPassPlugin)
public class WalletPassPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WalletPassPlugin"
    public let jsName = "WalletPass"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "add", returnType: CAPPluginReturnPromise)
    ]

    @objc func add(_ call: CAPPluginCall) {
        guard PKAddPassesViewController.canAddPasses() else {
            call.reject("this device cannot add passes")
            return
        }
        guard let raw = call.getString("data"), let data = Data(base64Encoded: raw) else {
            call.reject("data (base64 .pkpass) is needed")
            return
        }
        let pass: PKPass
        do { pass = try PKPass(data: data) } catch {
            call.reject("not a valid pass: \(error.localizedDescription)")
            return
        }
        DispatchQueue.main.async {
            guard let sheet = PKAddPassesViewController(pass: pass), let host = self.bridge?.viewController else {
                call.reject("could not show Wallet")
                return
            }
            host.present(sheet, animated: true) { call.resolve(["shown": true]) }
        }
    }
}
