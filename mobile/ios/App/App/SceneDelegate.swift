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
        swipe = TabSwipe(host: view, page: child.view, webView: webView)
    }

    /// Swiping between the five tabs (TabSwipe, below).
    private var swipe: TabSwipe?

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
/// photo-library picker (PhotoPicker.swift), subscribing the iPhone
/// calendar to the family's lessons (CalendarAdd.swift) and swiping between
/// the tabs (TabSwipePlugin, below).
class AppViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(PhotoPickerPlugin())
        bridge?.registerPluginInstance(CalendarAddPlugin())
        bridge?.registerPluginInstance(TabSwipePlugin())
    }

    /// The page lays itself out around the home indicator (viewport-fit=cover
    /// inside the app, lib/native-app.ts); iOS adding its own inset as well
    /// is what once pushed the fixed tabs about while scrolling.
    override func viewDidLoad() {
        super.viewDidLoad()
        webView?.scrollView.contentInsetAdjustmentBehavior = .never
    }
}

// MARK: - Swiping between the tabs

/// A sideways swipe moves to the next or previous tab (owner, 2026-11-13,
/// after the five tabs side by side inside the page -- 2026-11-10 -- broke
/// scrolling and the swimmer on the iPhone and were switched off).
///
/// iOS itself follows the finger here, outside the page: the page as it is
/// slides away and the tab beside it slides in as the picture it showed the
/// last time it was open at its top (taken by takeSnapshot when the page
/// says so). Let go past a third of the screen, or with a flick, and the page
/// is told to go to that tab; the picture stays over it until the page says
/// it is drawn (or 2 seconds), then fades. Nothing is loaded while the
/// finger is down, and the page itself scrolls and turns as it always did:
/// the page tells this, all the time, whether a swipe may start at all (not
/// on other pages, not with a sheet or the keyboard up) and where things
/// that move sideways themselves are (the swimmer cards, 我的方案), where it
/// may not start. A tab never opened yet slides in as the page colour.
///
/// The page's side: components/AppTabSwipe.tsx.
final class TabSwipe: NSObject, UIGestureRecognizerDelegate {
    static weak var shared: TabSwipe?
    weak var plugin: TabSwipePlugin?

    private weak var host: UIView?
    private weak var page: UIView?
    private weak var webView: WKWebView?

    // What the page said last.
    private var count = 0
    private var current = -1
    private var allowed = false
    private var blocked: [CGRect] = []

    private var shots: [Int: UIImage] = [:]
    private var start: CGPoint = .zero
    private var target = -1
    private var peek: UIView?
    private var cover: UIView?
    private var coverTimer: Timer?
    private var pan: UIPanGestureRecognizer!

    /// The page's colour behind the tabs (#e9eff7), for a tab with no picture yet.
    private let pageColour = UIColor(red: 0xe9 / 255.0, green: 0xef / 255.0, blue: 0xf7 / 255.0, alpha: 1)

    init(host: UIView, page: UIView, webView: WKWebView?) {
        self.host = host
        self.page = page
        self.webView = webView
        super.init()
        pan = UIPanGestureRecognizer(target: self, action: #selector(panned(_:)))
        pan.delegate = self
        pan.maximumNumberOfTouches = 1
        page.addGestureRecognizer(pan)
        TabSwipe.shared = self
    }

    func update(count: Int, current: Int, allowed: Bool, blocked: [CGRect], why: String) {
        // In Xcode's console (filter: TabSwipe), while this is being tried out.
        print("[TabSwipe] page says: tab \(current) of \(count), swipe \(allowed ? "allowed" : "not allowed: " + why), \(blocked.count) blocked areas")
        self.count = count
        self.current = current
        self.allowed = allowed
        self.blocked = blocked
    }

    /// The page is at its top on tab `index`: keep a picture of it.
    func snap(_ index: Int) {
        guard let web = webView, index == current, index >= 0, cover == nil, peek == nil else { return }
        let config = WKSnapshotConfiguration()
        config.afterScreenUpdates = false
        web.takeSnapshot(with: config) { [weak self] image, _ in
            guard let self = self, let image = image, self.current == index, self.peek == nil, self.cover == nil else { return }
            self.shots[index] = image
        }
    }

    /// The page has drawn the tab it was sent to: the picture goes.
    func ready() {
        coverTimer?.invalidate()
        coverTimer = nil
        guard let c = cover else { return }
        cover = nil
        UIView.animate(withDuration: 0.18, animations: { c.alpha = 0 }, completion: { _ in c.removeFromSuperview() })
    }

    // MARK: The finger

    func gestureRecognizer(_ g: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
        if g === pan, let page = page {
            start = touch.location(in: page)
            print("[TabSwipe] finger down at \(Int(start.x)),\(Int(start.y))")
        }
        return true
    }

    func gestureRecognizerShouldBegin(_ g: UIGestureRecognizer) -> Bool {
        guard g === pan, let page = page else { return false }
        let t = pan.translation(in: page)
        let no: String?
        if !allowed || current < 0 || count < 2 { no = "the page does not allow it" }
        else if cover != nil || peek != nil { no = "a swipe is still finishing" }
        // Sideways, clearly: anything else is the page's own scrolling.
        else if abs(t.x) <= abs(t.y) * 1.4 { no = "not sideways (\(Int(t.x)),\(Int(t.y)))" }
        else if blocked.contains(where: { $0.contains(start) }) { no = "started on something that moves sideways itself" }
        else {
            let next = current + (t.x < 0 ? 1 : -1)
            no = next >= 0 && next < count ? nil : "no tab on that side"
        }
        print("[TabSwipe] swipe? " + (no ?? "yes"))
        return no == nil
    }

    /// The page's scrolling waits until this has decided it is not a swipe
    /// (which it does at the first movement), so the two never both move.
    /// Where no swipe may start, nothing waits.
    func gestureRecognizer(_ g: UIGestureRecognizer, shouldBeRequiredToFailBy other: UIGestureRecognizer) -> Bool {
        return g === pan && allowed && other is UIPanGestureRecognizer && other.view is UIScrollView
    }

    @objc private func panned(_ g: UIPanGestureRecognizer) {
        guard let page = page, let host = host else { return }
        let w = page.bounds.width
        let dx = g.translation(in: host).x
        switch g.state {
        case .began:
            target = current + (dx < 0 ? 1 : -1)
            let v: UIView
            if let shot = shots[target] {
                let iv = UIImageView(image: shot)
                iv.contentMode = .scaleToFill
                v = iv
            } else {
                v = UIView()
            }
            v.backgroundColor = pageColour
            v.frame = page.frame
            v.isUserInteractionEnabled = false
            host.insertSubview(v, aboveSubview: page)
            peek = v
            move(dx)
        case .changed:
            move(dx)
        case .ended, .cancelled, .failed:
            let dir: CGFloat = target > current ? -1 : 1
            let speed = g.velocity(in: host).x * dir
            let gone = dx * dir
            let go = g.state == .ended && gone > 0 && (gone > w / 3 || speed > 600)
            let to: CGFloat = go ? dir * w : 0
            let left = abs(to - clamp(dx))
            let time = min(0.3, max(0.12, Double(left / max(abs(g.velocity(in: host).x), 900))))
            UIView.animate(withDuration: time, delay: 0, options: [.curveEaseOut, .beginFromCurrentState], animations: {
                self.place(to)
            }, completion: { _ in self.finish(go) })
        default:
            break
        }
    }

    /// Only towards the tab on that side; never past it.
    private func clamp(_ dx: CGFloat) -> CGFloat {
        guard let page = page else { return 0 }
        let w = page.bounds.width
        let dir: CGFloat = target > current ? -1 : 1
        return dir < 0 ? min(0, max(-w, dx)) : max(0, min(w, dx))
    }

    private func move(_ dx: CGFloat) { place(clamp(dx)) }

    private func place(_ x: CGFloat) {
        guard let page = page else { return }
        let w = page.bounds.width
        let dir: CGFloat = target > current ? -1 : 1
        page.transform = CGAffineTransform(translationX: x, y: 0)
        peek?.transform = CGAffineTransform(translationX: x - dir * w, y: 0)
    }

    private func finish(_ go: Bool) {
        guard let page = page, let p = peek else { return }
        peek = nil
        if !go {
            page.transform = .identity
            p.removeFromSuperview()
            return
        }
        // The picture of the tab stays over the page, which moves back
        // under it and is told where to go.
        p.transform = .identity
        p.isUserInteractionEnabled = true
        page.transform = .identity
        cover = p
        let index = target
        coverTimer?.invalidate()
        coverTimer = Timer.scheduledTimer(withTimeInterval: 2, repeats: false) { [weak self] _ in self?.ready() }
        plugin?.notifyListeners("swipe", data: ["index": index])
    }
}

/// JS: Capacitor.Plugins.TabSwipe (components/AppTabSwipe.tsx, lib/native-app.ts)
///   configure({ count, current, allowed, blocked: [x, y, w, h, ...] })
///   snap({ index })   -- the page is at its top on that tab
///   ready()           -- the tab swiped to is drawn
///   addListener('swipe', ({ index }) => go to that tab)
@objc(TabSwipePlugin)
public class TabSwipePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TabSwipePlugin"
    public let jsName = "TabSwipe"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "configure", returnType: CAPPluginReturnNone),
        CAPPluginMethod(name: "snap", returnType: CAPPluginReturnNone),
        CAPPluginMethod(name: "ready", returnType: CAPPluginReturnNone)
    ]

    @objc func configure(_ call: CAPPluginCall) {
        let count = call.getInt("count") ?? 0
        let current = call.getInt("current") ?? -1
        let allowed = call.getBool("allowed") ?? false
        let why = call.getString("why") ?? ""
        let flat: [CGFloat] = (call.getArray("blocked") ?? []).map { v in
            if let n = v as? NSNumber { return CGFloat(truncating: n) }
            return 0
        }
        var rects: [CGRect] = []
        var i = 0
        while i + 3 < flat.count {
            rects.append(CGRect(x: flat[i], y: flat[i + 1], width: flat[i + 2], height: flat[i + 3]))
            i += 4
        }
        DispatchQueue.main.async {
            TabSwipe.shared?.plugin = self
            TabSwipe.shared?.update(count: count, current: current, allowed: allowed, blocked: rects, why: why)
            if TabSwipe.shared == nil { print("[TabSwipe] not set up: no TabSwipe in SafeAreaContainer") }
        }
        call.resolve()
    }

    @objc func snap(_ call: CAPPluginCall) {
        let index = call.getInt("index") ?? -1
        DispatchQueue.main.async { TabSwipe.shared?.snap(index) }
        call.resolve()
    }

    @objc func ready(_ call: CAPPluginCall) {
        DispatchQueue.main.async { TabSwipe.shared?.ready() }
        call.resolve()
    }
}
