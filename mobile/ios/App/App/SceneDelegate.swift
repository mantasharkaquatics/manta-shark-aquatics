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
    /// The web view's bottom edge: the screen's bottom, or the keyboard's top.
    private var bottomPin: NSLayoutConstraint?

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
        ])
        // Down to the very bottom: the page runs under the home indicator,
        // its own colour behind the floating tabs (owner, 2026-10-28: the
        // white band below the tabs had to go). The page keeps its tabs
        // above the indicator with env(safe-area-inset-bottom). With the
        // keyboard up, down to the keyboard (keyboardWillMove).
        let pin = child.view.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        pin.isActive = true
        bottomPin = pin
        child.didMove(toParent: self)
        watchKeyboard()
    }

    // MARK: The keyboard (owner, 2026-11-10: the chat felt jerky)
    //
    // WKWebView's own answer to the keyboard is to push the whole page up
    // under the status bar: the header went off screen, a drag sometimes
    // moved that pushed-up page instead of the messages, and it all sprang
    // back when the keyboard went. Instead the web view now ends at the
    // keyboard's top, moving with the keyboard's own timing, so the page
    // is simply shorter: header in place, the input row on the keyboard,
    // only the messages scroll -- as in Messages or Instagram. The page is
    // told with html.msa-kb (it hides the tabs then). The Capacitor
    // Keyboard plugin's "native" resize was read and not used: it resizes
    // 0.2s after the keyboard has finished and measures from the window,
    // which in this container would leave the bottom of the page under it.

    private var webView: WKWebView? { (child as? CAPBridgeViewController)?.webView }

    private func watchKeyboard() {
        let nc = NotificationCenter.default
        // Stop the web view pushing the page up by itself (what the
        // Capacitor Keyboard plugin does too).
        if let web = webView {
            for name in [UIResponder.keyboardWillShowNotification, UIResponder.keyboardWillHideNotification,
                         UIResponder.keyboardWillChangeFrameNotification, UIResponder.keyboardDidChangeFrameNotification] {
                nc.removeObserver(web, name: name, object: nil)
            }
            web.scrollView.contentInset = .zero
        }
        nc.addObserver(self, selector: #selector(keyboardWillMove(_:)), name: UIResponder.keyboardWillChangeFrameNotification, object: nil)
        nc.addObserver(self, selector: #selector(keyboardWillMove(_:)), name: UIResponder.keyboardWillHideNotification, object: nil)
    }

    @objc private func keyboardWillMove(_ note: Notification) {
        guard let info = note.userInfo, let pin = bottomPin,
              let end = (info[UIResponder.keyboardFrameEndUserInfoKey] as? NSValue)?.cgRectValue else { return }
        let screen: UICoordinateSpace = view.window?.screen.coordinateSpace ?? UIScreen.main.coordinateSpace
        let kb = view.convert(end, from: screen)
        // A floating, undocked or hardware keyboard covers nothing.
        let covered = note.name == UIResponder.keyboardWillHideNotification ? 0 : max(0, view.bounds.maxY - kb.minY)
        let up = covered > 0
        webView?.evaluateJavaScript("document.documentElement.classList.toggle('msa-kb', \(up))", completionHandler: nil)
        guard abs(pin.constant + covered) > 0.5 else { return }
        pin.constant = -covered
        let duration = (info[UIResponder.keyboardAnimationDurationUserInfoKey] as? Double) ?? 0.25
        let curve = (info[UIResponder.keyboardAnimationCurveUserInfoKey] as? UInt) ?? 7
        UIView.animate(withDuration: duration, delay: 0,
                       options: [UIView.AnimationOptions(rawValue: curve << 16), .beginFromCurrentState]) {
            self.view.layoutIfNeeded()
        }
        webView?.scrollView.contentInset = .zero
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
/// photo-library picker (PhotoPicker.swift) and subscribing the iPhone
/// calendar to the family's lessons (CalendarAdd.swift).
class AppViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(PhotoPickerPlugin())
        bridge?.registerPluginInstance(CalendarAddPlugin())
    }

    /// The page lays itself out around the home indicator (viewport-fit=cover
    /// inside the app, lib/native-app.ts); iOS adding its own inset as well
    /// is what once pushed the fixed tabs about while scrolling.
    override func viewDidLoad() {
        super.viewDidLoad()
        webView?.scrollView.contentInsetAdjustmentBehavior = .never
    }
}
