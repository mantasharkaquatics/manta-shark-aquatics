import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = AppViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}

/// The bridge, with a white strip behind the status bar and another behind the
/// home indicator (owner, 2026-10-27). The page starts below the status bar
/// (contentInset "always" in capacitor.config.json), but iOS still draws the
/// page scrolling past behind those two bars; the strips cover it, in the
/// white of the app's own top bar and tabs.
class AppViewController: CAPBridgeViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
        for top in [true, false] {
            let strip = UIView()
            strip.backgroundColor = .white
            strip.isUserInteractionEnabled = false
            strip.translatesAutoresizingMaskIntoConstraints = false
            view.addSubview(strip)
            NSLayoutConstraint.activate([
                strip.leadingAnchor.constraint(equalTo: view.leadingAnchor),
                strip.trailingAnchor.constraint(equalTo: view.trailingAnchor),
                top ? strip.topAnchor.constraint(equalTo: view.topAnchor)
                    : strip.bottomAnchor.constraint(equalTo: view.bottomAnchor),
                top ? strip.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor)
                    : strip.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),
            ])
        }
    }
}
