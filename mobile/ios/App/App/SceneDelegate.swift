import UIKit
import Capacitor
import WebKit

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = SafeAreaContainer(child: AppViewController())
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

/// Where the bridge's web view sits (owner, 2026-10-28).
///
/// The first build let the page run under the status bar and the home
/// indicator with iOS adding its own insets (contentInset "always"), and
/// covered both bands with white strips; once scrolled, iOS put the fixed
/// bottom tabs at the very bottom of the screen and the strip cut them in
/// half. The second kept the web view inside the safe area; the band below
/// the floating tabs then showed as a white strip. Now: the status bar band
/// stays white (the web view starts below it), and the page runs to the very
/// bottom with no inset from iOS, laying its tabs out above the home
/// indicator itself (viewport-fit=cover, env(safe-area-inset-bottom)).
/// Capacitor makes the web view the bridge controller's own view (its
/// loadView is final), hence a container rather than a constraint.
class SafeAreaContainer: UIViewController {
    private let child: UIViewController

    init(child: UIViewController) {
        self.child = child
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError("not used") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .white
        addChild(child)
        child.view.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(child.view)
        NSLayoutConstraint.activate([
            child.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            child.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            child.view.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            // Down to the very bottom: the page runs under the home indicator,
            // its own colour behind the floating tabs (owner, 2026-10-28: the
            // white band below the tabs had to go). The page keeps its tabs
            // above the indicator with env(safe-area-inset-bottom).
            child.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
        child.didMove(toParent: self)
    }

    /// The home-indicator band, told to the page as --msa-sab as well, so the
    /// tabs clear it even where env(safe-area-inset-bottom) reads 0 (the
    /// page uses whichever is larger; lib/native-app.ts, app/globals.css).
    private var bandSent = false
    override func viewSafeAreaInsetsDidChange() {
        super.viewSafeAreaInsetsDidChange()
        let band = Int(view.safeAreaInsets.bottom.rounded())
        guard !bandSent, band > 0, let web = (child as? CAPBridgeViewController)?.webView else { return }
        bandSent = true
        let js = "(function(){var s=function(){if(document.documentElement)document.documentElement.style.setProperty('--msa-sab','\(band)px')};s();document.addEventListener('DOMContentLoaded',s)})()"
        web.configuration.userContentController.addUserScript(WKUserScript(source: js, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        web.evaluateJavaScript(js, completionHandler: nil)
    }

    // The bridge still decides the status bar and the screen's turning.
    override var childForStatusBarStyle: UIViewController? { child }
    override var childForStatusBarHidden: UIViewController? { child }
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { child.supportedInterfaceOrientations }
}

/// The Capacitor bridge, with the app's own plugins: the chat's
/// photo-library picker (PhotoPicker.swift).
class AppViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(PhotoPickerPlugin())
    }

    /// The page lays itself out around the home indicator (viewport-fit=cover
    /// inside the app, lib/native-app.ts); iOS adding its own inset as well
    /// is what once pushed the fixed tabs about while scrolling.
    override func viewDidLoad() {
        super.viewDidLoad()
        webView?.scrollView.contentInsetAdjustmentBehavior = .never
    }
}
