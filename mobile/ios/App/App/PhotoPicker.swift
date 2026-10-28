import UIKit
import Capacitor
import PhotosUI
import ImageIO
import UniformTypeIdentifiers
import Photos

/// Picking photos for the chat (owner, 2026-10-28: "only pictures -- no
/// camera, no files"). A web page's file button on iPhone always offers
/// Photo Library, Take Photo and Choose File; this opens the photo library
/// alone.
///
/// The owner wants it at half the screen WITH the album choice and a search
/// on top, as Facebook has; Apple's picker hides its top bar at half
/// height, so the app's own sheet (PhotoSheet.swift) is used. That needs
/// the photo-library permission, asked the first time; if a family says no,
/// Apple's picker (PHPicker, no permission needed) opens instead.
///
/// JS: Capacitor.Plugins.PhotoPicker.pick({ limit, maxSide, labels })
///   labels: { recents, search } in the family's language.
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

    private weak var sheet: PhotoSheetController?

    @objc func pick(_ call: CAPPluginCall) {
        if let old = pending { old.resolve(["photos": [String]()]) }
        pending = call
        let limit = max(1, min(call.getInt("limit") ?? 5, 5))
        maxSide = CGFloat(max(400, min(call.getInt("maxSide") ?? 1600, 3000)))
        var labels: [String: String] = [:]
        if let given = call.getObject("labels") {
            for (k, v) in given { if let text = v as? String { labels[k] = text } }
        }
        DispatchQueue.main.async {
            switch PHPhotoLibrary.authorizationStatus(for: .readWrite) {
            case .authorized, .limited:
                self.presentSheet(limit: limit, labels: labels)
            case .notDetermined:
                PHPhotoLibrary.requestAuthorization(for: .readWrite) { status in
                    DispatchQueue.main.async {
                        if status == .authorized || status == .limited {
                            self.presentSheet(limit: limit, labels: labels)
                        } else {
                            self.presentSystemPicker(limit: limit)
                        }
                    }
                }
            default:
                self.presentSystemPicker(limit: limit)
            }
        }
    }

    /// The app's own half-screen sheet (PhotoSheet.swift).
    private func presentSheet(limit: Int, labels: [String: String]) {
        guard let vc = bridge?.viewController else { finish([]); return }
        let sheetVC = PhotoSheetController(limit: limit, labels: labels)
        sheetVC.onFinish = { [weak self] assets in self?.loadAssets(assets) }
        sheetVC.modalPresentationStyle = .pageSheet
        if let s = sheetVC.sheetPresentationController {
            s.detents = [.medium(), .large()]
            s.selectedDetentIdentifier = .medium
            s.prefersGrabberVisible = true
            // Scrolling the photos scrolls them; the sheet grows only when
            // dragged by its top.
            s.prefersScrollingExpandsWhenScrolledToEdge = false
        }
        // Swiped down without choosing: answer "nothing picked".
        sheetVC.presentationController?.delegate = self
        sheet = sheetVC
        vc.present(sheetVC, animated: true)
    }

    /// The photos picked in the app's sheet, shrunk and upright, one at a time.
    private func loadAssets(_ assets: [PHAsset]) {
        sheet = nil
        if assets.isEmpty { finish([]); return }
        let side = maxSide
        DispatchQueue.global(qos: .userInitiated).async {
            var photos: [String] = []
            let opts = PHImageRequestOptions()
            opts.isSynchronous = true
            opts.deliveryMode = .highQualityFormat
            opts.resizeMode = .exact
            opts.isNetworkAccessAllowed = true
            for asset in assets {
                var picture: UIImage?
                PHImageManager.default().requestImage(for: asset, targetSize: CGSize(width: side, height: side),
                                                      contentMode: .aspectFit, options: opts) { img, _ in picture = img }
                if let picture = picture, let b64 = PhotoPickerPlugin.jpeg(picture) { photos.append(b64) }
            }
            DispatchQueue.main.async { self.finish(photos) }
        }
    }

    /// Apple's own picker: used when the family has not allowed the app
    /// into their photos. It needs no permission.
    private func presentSystemPicker(limit: Int) {
        var config = PHPickerConfiguration()
        config.selectionLimit = limit
        config.filter = .images
        config.selection = .ordered
        let picker = PHPickerViewController(configuration: config)
        picker.delegate = self
        picker.presentationController?.delegate = self
        guard let vc = bridge?.viewController else { finish([]); return }
        vc.present(picker, animated: true)
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
        // The app's sheet has no Done: what is picked when it goes away is
        // what the family chose.
        if let s = sheet { s.finish(s.pickedAssets) } else { finish([]) }
    }

    /// A picture as a base64 JPEG, drawn on white (a transparent PNG would
    /// otherwise turn black).
    private static func jpeg(_ picture: UIImage) -> String? {
        let size = picture.size
        guard size.width > 0, size.height > 0 else { return nil }
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        format.opaque = true
        let image = UIGraphicsImageRenderer(size: size, format: format).image { ctx in
            UIColor.white.setFill()
            ctx.fill(CGRect(origin: .zero, size: size))
            picture.draw(in: CGRect(origin: .zero, size: size))
        }
        return image.jpegData(compressionQuality: 0.82)?.base64EncodedString()
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
