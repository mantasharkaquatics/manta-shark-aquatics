import UIKit
import Capacitor
import PhotosUI
import ImageIO
import UniformTypeIdentifiers

/// Picking photos for the chat (owner, 2026-10-28: "only pictures -- no
/// camera, no files"). A web page's file button on iPhone always offers
/// Photo Library, Take Photo and Choose File; this opens the photo library
/// alone. PHPicker runs outside the app, so no photo-library permission is
/// asked for and none is declared.
///
/// JS: Capacitor.Plugins.PhotoPicker.pick({ limit, maxSide })
///   -> { photos: [base64 JPEG] }, in the order picked; [] if cancelled.
/// Each picture is shrunk (longest side maxSide, default 1600) and turned
/// upright here, so a 48-megapixel photo never crosses the bridge.
/// Registered in AppViewController.capacitorDidLoad (SceneDelegate.swift).
@objc(PhotoPickerPlugin)
public class PhotoPickerPlugin: CAPPlugin, CAPBridgedPlugin, PHPickerViewControllerDelegate, UIAdaptivePresentationControllerDelegate {
    public let identifier = "PhotoPickerPlugin"
    public let jsName = "PhotoPicker"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "pick", returnType: CAPPluginReturnPromise)
    ]

    private var pending: CAPPluginCall?
    private var maxSide: CGFloat = 1600

    @objc func pick(_ call: CAPPluginCall) {
        if let old = pending { old.resolve(["photos": [String]()]) }
        pending = call
        let limit = max(1, min(call.getInt("limit") ?? 5, 5))
        maxSide = CGFloat(max(400, min(call.getInt("maxSide") ?? 1600, 3000)))
        DispatchQueue.main.async {
            var config = PHPickerConfiguration()
            config.selectionLimit = limit
            config.filter = .images
            config.selection = .ordered
            let picker = PHPickerViewController(configuration: config)
            picker.delegate = self
            // Apple's own full sheet (owner, 2026-10-28): at half height the
            // picker hides its top bar, and the owner wants Photos /
            // Collections (Recents, albums) and search there, as Facebook has.
            // Swiped down without choosing: answer "nothing picked".
            picker.presentationController?.delegate = self
            guard let vc = self.bridge?.viewController else {
                self.finish([])
                return
            }
            vc.present(picker, animated: true)
        }
    }

    public func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        picker.dismiss(animated: true)
        let side = maxSide
        // One at a time: a full-size photo decoded five times over at once
        // could take the app past its memory.
        DispatchQueue.global(qos: .userInitiated).async {
            var photos: [String] = []
            for result in results {
                if let b64 = PhotoPickerPlugin.load(result.itemProvider, maxSide: side) { photos.append(b64) }
            }
            DispatchQueue.main.async { self.finish(photos) }
        }
    }

    public func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
        finish([])
    }

    private func finish(_ photos: [String]) {
        pending?.resolve(["photos": photos])
        pending = nil
    }

    /// The picture as a base64 JPEG, shrunk and upright; nil if it cannot be read.
    private static func load(_ provider: NSItemProvider, maxSide: CGFloat) -> String? {
        guard provider.hasItemConformingToTypeIdentifier(UTType.image.identifier) else { return nil }
        let done = DispatchSemaphore(value: 0)
        var out: String?
        // The file handed over exists only inside this callback.
        provider.loadFileRepresentation(forTypeIdentifier: UTType.image.identifier) { url, _ in
            defer { done.signal() }
            guard let url, let source = CGImageSourceCreateWithURL(url as CFURL, nil) else { return }
            let options: [CFString: Any] = [
                kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceCreateThumbnailWithTransform: true,
                kCGImageSourceThumbnailMaxPixelSize: maxSide,
            ]
            guard let cg = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else { return }
            // Drawn on white: a transparent PNG would otherwise turn black as a JPEG.
            let size = CGSize(width: cg.width, height: cg.height)
            let format = UIGraphicsImageRendererFormat.default()
            format.scale = 1
            format.opaque = true
            let image = UIGraphicsImageRenderer(size: size, format: format).image { ctx in
                UIColor.white.setFill()
                ctx.fill(CGRect(origin: .zero, size: size))
                UIImage(cgImage: cg).draw(in: CGRect(origin: .zero, size: size))
            }
            out = image.jpegData(compressionQuality: 0.82)?.base64EncodedString()
        }
        done.wait()
        return out
    }
}
