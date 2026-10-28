import UIKit
import Photos

/// The chat's own photo sheet, like Facebook's (owner, 2026-10-28): half the
/// screen, with the album ("Recents ▾") and a search for albums on top, the
/// photos below and a number on each one picked. No Cancel or Done (owner:
/// "useless"): the photos picked when the sheet is swiped away, or the chat
/// above it tapped, go to the chat's preview row, where they can still be
/// taken off before 送出. Apple's picker cannot
/// show its top bar at half height, hence this one. It needs the photo
/// library permission (NSPhotoLibraryUsageDescription in Info.plist); without
/// it PhotoPickerPlugin falls back to Apple's picker.
///
/// The words come from the page (PhotoPickerPlugin passes the labels the
/// family's language gives), so nothing here is written in one language.
final class PhotoSheetController: UIViewController, UICollectionViewDataSource, UICollectionViewDelegateFlowLayout,
    UITableViewDataSource, UITableViewDelegate, UISearchBarDelegate {

    struct Album { let title: String; let assets: PHFetchResult<PHAsset> }

    private let limit: Int
    private let labels: [String: String]
    var onFinish: (([PHAsset]) -> Void)?

    private let navy = UIColor(red: 0x12 / 255, green: 0x25 / 255, blue: 0x4a / 255, alpha: 1)
    private let blue = UIColor(red: 0x20 / 255, green: 0x50 / 255, blue: 0xa0 / 255, alpha: 1)

    private var albums: [Album] = []
    private var album: Album?
    private var picked: [PHAsset] = []
    /// What is picked right now: handed over when the sheet goes away.
    var pickedAssets: [PHAsset] { picked }
    private var finished = false

    private let imageManager = PHCachingImageManager()
    private let header = UIView()
    private let titleButton = UIButton(type: .system)
    private let searchButton = UIButton(type: .system)
    private var grid: UICollectionView!
    private let albumPanel = UIView()
    private let searchBar = UISearchBar()
    private let albumTable = UITableView(frame: .zero, style: .plain)
    private var shownAlbums: [Album] = []

    init(limit: Int, labels: [String: String]) {
        self.limit = max(1, limit)
        self.labels = labels
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError("not used") }

    private func word(_ key: String, _ fallback: String) -> String {
        if let w = labels[key], !w.isEmpty { return w }
        return fallback
    }

    // MARK: - Layout

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .white
        loadAlbums()
        album = albums.first

        // The top bar: the album (▾) in the middle, the album search on the right
        header.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(header)

        titleButton.setTitleColor(navy, for: .normal)
        titleButton.titleLabel?.font = .systemFont(ofSize: 17, weight: .bold)
        titleButton.titleLabel?.lineBreakMode = .byTruncatingTail
        titleButton.addTarget(self, action: #selector(albumsTapped), for: .touchUpInside)

        searchButton.setImage(UIImage(systemName: "magnifyingglass"), for: .normal)
        searchButton.tintColor = navy
        searchButton.accessibilityLabel = word("search", "Search albums")
        searchButton.addTarget(self, action: #selector(searchTapped), for: .touchUpInside)

        for b in [titleButton, searchButton] {
            b.translatesAutoresizingMaskIntoConstraints = false
            header.addSubview(b)
        }

        let line = UIView()
        line.backgroundColor = UIColor(white: 0.9, alpha: 1)
        line.translatesAutoresizingMaskIntoConstraints = false
        header.addSubview(line)

        // The photos, four across.
        let layout = UICollectionViewFlowLayout()
        layout.minimumInteritemSpacing = 2
        layout.minimumLineSpacing = 2
        grid = UICollectionView(frame: .zero, collectionViewLayout: layout)
        grid.backgroundColor = .white
        grid.dataSource = self
        grid.delegate = self
        grid.register(PhotoCell.self, forCellWithReuseIdentifier: PhotoCell.id)
        grid.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(grid)

        // The album list, with its search, over the photos when open.
        albumPanel.backgroundColor = .white
        albumPanel.isHidden = true
        albumPanel.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(albumPanel)
        searchBar.placeholder = word("search", "Search albums")
        searchBar.searchBarStyle = .minimal
        searchBar.delegate = self
        searchBar.translatesAutoresizingMaskIntoConstraints = false
        albumPanel.addSubview(searchBar)
        albumTable.dataSource = self
        albumTable.delegate = self
        albumTable.rowHeight = 64
        albumTable.keyboardDismissMode = .onDrag
        albumTable.register(AlbumCell.self, forCellReuseIdentifier: AlbumCell.id)
        albumTable.translatesAutoresizingMaskIntoConstraints = false
        albumPanel.addSubview(albumTable)

        NSLayoutConstraint.activate([
            // The top row sits in the middle of its band: as much room above
            // the words (the grabber's strip included) as below them, down
            // to the line over the photos (owner, 2026-10-28).
            header.topAnchor.constraint(equalTo: view.topAnchor),
            header.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            header.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            header.heightAnchor.constraint(equalToConstant: 72),

            searchButton.trailingAnchor.constraint(equalTo: header.trailingAnchor, constant: -12),
            searchButton.centerYAnchor.constraint(equalTo: header.centerYAnchor),
            searchButton.widthAnchor.constraint(equalToConstant: 40),
            searchButton.heightAnchor.constraint(equalToConstant: 40),
            titleButton.centerXAnchor.constraint(equalTo: header.centerXAnchor),
            titleButton.centerYAnchor.constraint(equalTo: header.centerYAnchor),
            titleButton.leadingAnchor.constraint(greaterThanOrEqualTo: header.leadingAnchor, constant: 56),
            titleButton.trailingAnchor.constraint(lessThanOrEqualTo: searchButton.leadingAnchor, constant: -4),

            line.leadingAnchor.constraint(equalTo: header.leadingAnchor),
            line.trailingAnchor.constraint(equalTo: header.trailingAnchor),
            line.bottomAnchor.constraint(equalTo: header.bottomAnchor),
            line.heightAnchor.constraint(equalToConstant: 1),

            grid.topAnchor.constraint(equalTo: header.bottomAnchor),
            grid.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            grid.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            grid.bottomAnchor.constraint(equalTo: view.bottomAnchor),

            albumPanel.topAnchor.constraint(equalTo: header.bottomAnchor),
            albumPanel.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            albumPanel.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            albumPanel.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            searchBar.topAnchor.constraint(equalTo: albumPanel.topAnchor, constant: 4),
            searchBar.leadingAnchor.constraint(equalTo: albumPanel.leadingAnchor, constant: 8),
            searchBar.trailingAnchor.constraint(equalTo: albumPanel.trailingAnchor, constant: -8),
            albumTable.topAnchor.constraint(equalTo: searchBar.bottomAnchor),
            albumTable.leadingAnchor.constraint(equalTo: albumPanel.leadingAnchor),
            albumTable.trailingAnchor.constraint(equalTo: albumPanel.trailingAnchor),
            albumTable.bottomAnchor.constraint(equalTo: albumPanel.bottomAnchor),
        ])
        refreshHeader()
    }

    private func refreshHeader() {
        let open = !albumPanel.isHidden
        let name = album?.title ?? word("recents", "Recents")
        titleButton.setTitle(name + (open ? " ▴" : " ▾"), for: .normal)
    }

    // MARK: - Albums

    private func loadAlbums() {
        let photosOnly = PHFetchOptions()
        photosOnly.predicate = NSPredicate(format: "mediaType == %d", PHAssetMediaType.image.rawValue)
        photosOnly.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: false)]

        var list: [Album] = [Album(title: word("recents", "Recents"), assets: PHAsset.fetchAssets(with: photosOnly))]
        let smart: [PHAssetCollectionSubtype] = [.smartAlbumFavorites, .smartAlbumScreenshots, .smartAlbumSelfPortraits, .smartAlbumRecentlyAdded]
        for subtype in smart {
            PHAssetCollection.fetchAssetCollections(with: .smartAlbum, subtype: subtype, options: nil).enumerateObjects { c, _, _ in
                let a = PHAsset.fetchAssets(in: c, options: photosOnly)
                if a.count > 0 { list.append(Album(title: c.localizedTitle ?? "", assets: a)) }
            }
        }
        PHAssetCollection.fetchAssetCollections(with: .album, subtype: .any, options: nil).enumerateObjects { c, _, _ in
            let a = PHAsset.fetchAssets(in: c, options: photosOnly)
            if a.count > 0 { list.append(Album(title: c.localizedTitle ?? "", assets: a)) }
        }
        albums = list
        shownAlbums = list
    }

    private func showAlbums(_ show: Bool, search: Bool = false) {
        albumPanel.isHidden = !show
        if show {
            searchBar.text = ""
            shownAlbums = albums
            albumTable.reloadData()
            if search {
                // Room for the keyboard: the full screen.
                if let sheet = sheetPresentationController {
                    sheet.animateChanges { sheet.selectedDetentIdentifier = .large }
                }
                searchBar.becomeFirstResponder()
            }
        } else {
            searchBar.resignFirstResponder()
        }
        refreshHeader()
    }

    @objc private func albumsTapped() { showAlbums(albumPanel.isHidden) }
    @objc private func searchTapped() { showAlbums(true, search: true) }

    func searchBar(_ searchBar: UISearchBar, textDidChange searchText: String) {
        let q = searchText.trimmingCharacters(in: .whitespaces)
        shownAlbums = q.isEmpty ? albums : albums.filter { $0.title.localizedCaseInsensitiveContains(q) }
        albumTable.reloadData()
    }

    func searchBarSearchButtonClicked(_ searchBar: UISearchBar) { searchBar.resignFirstResponder() }

    func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int { shownAlbums.count }

    func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        let cell = tableView.dequeueReusableCell(withIdentifier: AlbumCell.id, for: indexPath) as! AlbumCell
        let a = shownAlbums[indexPath.row]
        cell.titleLabel.text = a.title
        cell.countLabel.text = "\(a.assets.count)"
        cell.thumb.image = nil
        if let first = a.assets.firstObject {
            let id = first.localIdentifier
            cell.representedId = id
            let side = 52 * UIScreen.main.scale
            imageManager.requestImage(for: first, targetSize: CGSize(width: side, height: side), contentMode: .aspectFill, options: nil) { img, _ in
                if cell.representedId == id { cell.thumb.image = img }
            }
        }
        return cell
    }

    func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
        tableView.deselectRow(at: indexPath, animated: true)
        album = shownAlbums[indexPath.row]
        showAlbums(false)
        grid.reloadData()
        if grid.numberOfItems(inSection: 0) > 0 { grid.scrollToItem(at: IndexPath(item: 0, section: 0), at: .top, animated: false) }
    }

    // MARK: - Photos

    func collectionView(_ collectionView: UICollectionView, numberOfItemsInSection section: Int) -> Int { album?.assets.count ?? 0 }

    func collectionView(_ collectionView: UICollectionView, layout: UICollectionViewLayout, sizeForItemAt indexPath: IndexPath) -> CGSize {
        let side = floor((collectionView.bounds.width - 6) / 4)
        return CGSize(width: side, height: side)
    }

    func collectionView(_ collectionView: UICollectionView, cellForItemAt indexPath: IndexPath) -> UICollectionViewCell {
        let cell = collectionView.dequeueReusableCell(withReuseIdentifier: PhotoCell.id, for: indexPath) as! PhotoCell
        guard let asset = album?.assets.object(at: indexPath.item) else { return cell }
        let id = asset.localIdentifier
        cell.representedId = id
        cell.image.image = nil
        let side = floor((collectionView.bounds.width - 6) / 4) * UIScreen.main.scale
        let opts = PHImageRequestOptions()
        opts.deliveryMode = .opportunistic
        opts.isNetworkAccessAllowed = true
        imageManager.requestImage(for: asset, targetSize: CGSize(width: side, height: side), contentMode: .aspectFill, options: opts) { img, _ in
            if cell.representedId == id { cell.image.image = img }
        }
        let n = picked.firstIndex(where: { $0.localIdentifier == id }).map { $0 + 1 }
        cell.setNumber(n, color: blue, full: picked.count >= limit)
        return cell
    }

    func collectionView(_ collectionView: UICollectionView, didSelectItemAt indexPath: IndexPath) {
        guard let asset = album?.assets.object(at: indexPath.item) else { return }
        if let i = picked.firstIndex(where: { $0.localIdentifier == asset.localIdentifier }) {
            picked.remove(at: i)
        } else if picked.count < limit {
            picked.append(asset)
        } else {
            return
        }
        // Every number may move (taking one off renumbers the rest). The
        // rings are redrawn in place: reloading the cells made the photos
        // blink as they were fetched again (owner, 2026-10-28).
        let full = picked.count >= limit
        for case let cell as PhotoCell in collectionView.visibleCells {
            let n = picked.firstIndex(where: { $0.localIdentifier == cell.representedId }).map { $0 + 1 }
            cell.setNumber(n, color: blue, full: full)
        }
    }

    // MARK: - Finish

    /// Called once, when the sheet goes away (PhotoPickerPlugin hands over
    /// pickedAssets).
    func finish(_ assets: [PHAsset]) {
        if finished { return }
        finished = true
        let done = onFinish
        if presentingViewController != nil {
            dismiss(animated: true) { done?(assets) }
        } else {
            done?(assets)
        }
    }
}

private final class PhotoCell: UICollectionViewCell {
    static let id = "PhotoCell"
    let image = UIImageView()
    private let badge = UILabel()
    private let shade = UIView()
    var representedId: String?

    override init(frame: CGRect) {
        super.init(frame: frame)
        image.contentMode = .scaleAspectFill
        image.clipsToBounds = true
        image.backgroundColor = UIColor(white: 0.93, alpha: 1)
        image.frame = contentView.bounds
        image.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        contentView.addSubview(image)
        shade.backgroundColor = UIColor(white: 1, alpha: 0.55)
        shade.frame = contentView.bounds
        shade.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        shade.isHidden = true
        contentView.addSubview(shade)
        badge.textAlignment = .center
        badge.font = .systemFont(ofSize: 11, weight: .bold)
        badge.textColor = .white
        badge.layer.cornerRadius = 10
        badge.layer.borderWidth = 1.5
        badge.layer.borderColor = UIColor.white.cgColor
        badge.clipsToBounds = true
        badge.translatesAutoresizingMaskIntoConstraints = false
        contentView.addSubview(badge)
        NSLayoutConstraint.activate([
            // Smaller rings (owner, 2026-10-28).
            badge.topAnchor.constraint(equalTo: contentView.topAnchor, constant: 5),
            badge.trailingAnchor.constraint(equalTo: contentView.trailingAnchor, constant: -5),
            badge.widthAnchor.constraint(equalToConstant: 20),
            badge.heightAnchor.constraint(equalToConstant: 20),
        ])
    }

    required init?(coder: NSCoder) { fatalError("not used") }

    /// The order it was picked in, or an empty ring; greyed out when five
    /// are already picked and this is not one of them.
    func setNumber(_ n: Int?, color: UIColor, full: Bool) {
        if let n = n {
            badge.text = "\(n)"
            badge.backgroundColor = color
        } else {
            badge.text = nil
            badge.backgroundColor = UIColor(white: 0, alpha: 0.18)
        }
        shade.isHidden = !(full && n == nil)
    }
}

private final class AlbumCell: UITableViewCell {
    static let id = "AlbumCell"
    let thumb = UIImageView()
    let titleLabel = UILabel()
    let countLabel = UILabel()
    var representedId: String?

    override init(style: UITableViewCell.CellStyle, reuseIdentifier: String?) {
        super.init(style: style, reuseIdentifier: reuseIdentifier)
        thumb.contentMode = .scaleAspectFill
        thumb.clipsToBounds = true
        thumb.layer.cornerRadius = 6
        thumb.backgroundColor = UIColor(white: 0.93, alpha: 1)
        titleLabel.font = .systemFont(ofSize: 16, weight: .semibold)
        countLabel.font = .systemFont(ofSize: 13)
        countLabel.textColor = .secondaryLabel
        let text = UIStackView(arrangedSubviews: [titleLabel, countLabel])
        text.axis = .vertical
        text.spacing = 2
        for v in [thumb, text] as [UIView] {
            v.translatesAutoresizingMaskIntoConstraints = false
            contentView.addSubview(v)
        }
        NSLayoutConstraint.activate([
            thumb.leadingAnchor.constraint(equalTo: contentView.leadingAnchor, constant: 16),
            thumb.centerYAnchor.constraint(equalTo: contentView.centerYAnchor),
            thumb.widthAnchor.constraint(equalToConstant: 52),
            thumb.heightAnchor.constraint(equalToConstant: 52),
            text.leadingAnchor.constraint(equalTo: thumb.trailingAnchor, constant: 12),
            text.trailingAnchor.constraint(lessThanOrEqualTo: contentView.trailingAnchor, constant: -16),
            text.centerYAnchor.constraint(equalTo: contentView.centerYAnchor),
        ])
    }

    required init?(coder: NSCoder) { fatalError("not used") }
}
