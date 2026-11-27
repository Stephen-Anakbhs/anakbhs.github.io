import XCTest

// Real touches on the site in Mobile Safari, photographed as the whole screen (status bar and toolbar included),
// to find places where the page does not reach the edges. Pages after the first are opened by the page itself
// (probe/beacon.js asks the log server where to go), so everything happens in one tab. The page reports its own
// layout to the log server; the steps below are written into the same log.
final class Drive: XCTestCase {
    let safari = XCUIApplication(bundleIdentifier: "com.apple.mobilesafari")
    let site = "http://127.0.0.1:4173"
    let log = "http://127.0.0.1:8123"
    var serial = 0
    var started = false

    var web: XCUIElement { safari.webViews.firstMatch }

    func get(_ path: String) {
        if let url = URL(string: log + path) { _ = try? Data(contentsOf: url) }
    }

    func note(_ text: String) {
        print("STEP", text)
        get("/log?" + (("STEP " + text).addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "STEP"))
    }

    func shot(_ name: String) {
        let data = XCUIScreen.main.screenshot().pngRepresentation
        if let url = URL(string: "\(log)/shot?\(name)") {
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.httpBody = data
            let done = expectation(description: "upload \(name)")
            URLSession.shared.dataTask(with: request) { _, _, _ in done.fulfill() }.resume()
            wait(for: [done], timeout: 20)
        }
        note("shot \(name)")
    }

    /// Opens a page of the site; `path` may carry a query and a fragment.
    func open(_ path: String, wait seconds: UInt32 = 9) {
        serial += 1
        var base = path
        var fragment = ""
        if let hash = path.firstIndex(of: "#") {
            base = String(path[..<hash])
            fragment = String(path[hash...])
        }
        let full = site + base + (base.contains("?") ? "&" : "?") + "n=\(serial)" + fragment
        note("open \(full)")
        if started {
            get("/go?" + (full.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? full))
        } else if #available(iOS 16.4, *) {
            XCUIDevice.shared.system.open(URL(string: full)!)
            started = true
        }
        sleep(seconds)
    }

    /// A finger moved from one height to another, as fractions of the screen.
    func drag(_ from: CGFloat, _ to: CGFloat, speed: CGFloat = 1500) {
        note("drag \(from) -> \(to) at \(speed)")
        let start = safari.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: from))
        let end = safari.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: to))
        start.press(forDuration: 0.02, thenDragTo: end, withVelocity: XCUIGestureVelocity(rawValue: speed), thenHoldForDuration: 0)
    }

    /// Taps the first element whose label starts with `prefix` (a button, or a pop-up button for the project
    /// cards), first scrolling it clear of the bars when `scrollTries` allows.
    @discardableResult
    func tap(_ prefix: String, wait seconds: UInt32 = 5, scrollTries: Int = 3) -> Bool {
        let element = web.descendants(matching: .any).matching(NSPredicate(format: "label BEGINSWITH %@", prefix)).firstMatch
        guard element.waitForExistence(timeout: 8) else {
            note("missing \(prefix)")
            return false
        }
        let window = safari.windows.firstMatch.frame
        let band = window.insetBy(dx: 0, dy: min(110, window.height / 4))
        var tries = 0
        while tries < scrollTries && !band.contains(CGPoint(x: element.frame.midX, y: element.frame.midY)) {
            let below = element.frame.midY > band.maxY
            drag(below ? 0.7 : 0.35, below ? 0.45 : 0.6, speed: 500)
            sleep(2)
            tries += 1
        }
        note("tap \(element.label.prefix(70)) at \(element.frame)")
        element.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        sleep(seconds)
        return true
    }

    func tapStatusBar() {
        note("tap status bar")
        safari.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.015)).tap()
        sleep(3)
    }

    /// A figure opened in the lightbox, then a one-finger pan on its veil and a tap on the status bar:
    /// neither may move the page behind it.
    func lightbox(_ prefix: String, _ name: String, checks: Bool) {
        guard tap(prefix, wait: 6) else { return }
        shot(name)
        if checks {
            drag(0.8, 0.55, speed: 600)
            sleep(2)
            shot(name + "-panned")
            tapStatusBar()
            shot(name + "-status-bar")
        }
        tap("Close image preview", wait: 3, scrollTries: 0)
    }

    func projectSheet(_ name: String, scroll: Bool) {
        guard tap("Open project", wait: 6) else { return }
        shot(name)
        if scroll {
            drag(0.75, 0.35, speed: 700)
            sleep(3)
            shot(name + "-scrolled")
        }
        tap("Close project", wait: 3, scrollTries: 0)
    }

    func light() {
        open("/?scene=stone", wait: 16)
        safari.activate()
        sleep(2)
        shot("p-01-cover")
        drag(0.78, 0.3)
        sleep(6)
        shot("p-02-about")
        drag(0.78, 0.38, speed: 600)
        sleep(3)
        shot("p-03-scrolled")
        if tap("Expand menu", wait: 3, scrollTries: 0) {
            shot("p-04-menu")
            tap("Collapse menu", wait: 2, scrollTries: 0)
        }
        for _ in 0..<12 {
            drag(0.85, 0.15, speed: 2500)
            usleep(600_000)
        }
        sleep(4)
        shot("p-05-bottom")
        open("/?scene=stone#publications")
        shot("p-06-publications")
        lightbox("Enlarge image: Brick But Agile", "p-07-lightbox", checks: true)
        open("/?scene=stone#projects")
        shot("p-08-projects")
        projectSheet("p-09-project", scroll: true)
        open("/?scene=stone#awards")
        shot("p-10-awards")
        lightbox("Enlarge image: President", "p-11-award-photo", checks: false)
        open("/publications?scene=stone")
        shot("p-12-publication-list")
        drag(0.78, 0.3, speed: 900)
        sleep(3)
        shot("p-13-publication-list-scrolled")
        open("/no-such-page?scene=stone", wait: 8)
        shot("p-15-not-found")
    }

    func darkAndLandscape() {
        open("/?scene=night-sea", wait: 16)
        safari.activate()
        sleep(2)
        shot("d-01-cover")
        drag(0.78, 0.3)
        sleep(6)
        shot("d-02-about")
        open("/?scene=night-sea#publications")
        shot("d-06-publications")
        lightbox("Enlarge image: Brick But Agile", "d-07-lightbox", checks: true)
        open("/?scene=night-sea#projects")
        projectSheet("d-09-project", scroll: false)
        open("/?scene=night-sea#awards")
        shot("d-10-awards")
        lightbox("Enlarge image: President", "d-11-award-photo", checks: false)
        open("/no-such-page?scene=night-sea", wait: 8)
        shot("d-15-not-found")

        XCUIDevice.shared.orientation = .landscapeLeft
        sleep(5)
        open("/?scene=stone", wait: 14)
        shot("l-01-cover")
        open("/?scene=stone#about")
        shot("l-02-about")
        if tap("Expand menu", wait: 3, scrollTries: 0) {
            shot("l-03-menu")
            tap("Collapse menu", wait: 2, scrollTries: 0)
        }
        open("/?scene=stone#publications")
        shot("l-04-publications")
        lightbox("Enlarge image: Brick But Agile", "l-05-lightbox", checks: true)
        open("/?scene=stone#projects")
        shot("l-06-projects")
        projectSheet("l-07-project", scroll: true)
        open("/publications?scene=stone")
        shot("l-08-publication-list")
        open("/?scene=night-sea#awards")
        lightbox("Enlarge image: President", "l-10-dark-award-photo", checks: false)
        // A plain page with no fixed boxes, for what Safari itself puts under its landscape top bar.
        open("/probe-control.html", wait: 6)
        shot("l-11-control")
        XCUIDevice.shared.orientation = .portrait
        sleep(4)
        open("/probe-control.html", wait: 6)
        shot("d-16-control")
    }

    /// Second round: how the dialog's veil can reach under the bars, and why the end of the page did not spring back.
    func exp2() {
        let award = "act=open:Enlarge%20image%3A%20President"
        let figure = "act=open:Enlarge%20image%3A%20Brick%20But%20Agile"
        open("/?scene=stone", wait: 14)
        safari.activate()
        sleep(2)
        for v in ["base", "nolock", "docveil", "absdialog"] {
            open("/?scene=stone&v=\(v)&\(award)#awards", wait: 11)
            shot("e-\(v)-award")
        }
        for v in ["docveil", "absdialog"] {
            open("/?scene=night-sea&v=\(v)&\(figure)#publications", wait: 11)
            shot("e-\(v)-figure-dark")
            drag(0.8, 0.55, speed: 600)
            sleep(2)
            shot("e-\(v)-panned")
            note("tap beside the sheet")
            safari.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.12)).tap()
            sleep(3)
            shot("e-\(v)-after-tap")
        }
        for v in ["base", "instantscroll"] {
            open("/?scene=stone&v=\(v)#about", wait: 9)
            for _ in 0..<12 {
                drag(0.85, 0.15, speed: 2500)
                usleep(600_000)
            }
            sleep(5)
            shot("e-end-\(v)")
        }
    }

    /// Experiments on the bands under Safari's bars: variant styles (?v=) and scripted actions (?act=) are run
    /// by probe/beacon.js, which also traces where each page load scrolled.
    func exp() {
        let president = "act=open:Enlarge%20image%3A%20President"
        let figure = "act=open:Enlarge%20image%3A%20Brick%20But%20Agile"
        let project = "act=open:Open%20project%3A%20LEGO%20Technic%20Bus"
        open("/?scene=night-sea", wait: 14)
        safari.activate()
        sleep(2)
        for v in ["base", "pe", "lock+pe", "abs", "lock"] {
            open("/?scene=night-sea&v=\(v)&\(president)#awards", wait: 11)
            shot("e-\(v.replacingOccurrences(of: "+", with: "-"))-award")
        }
        // The candidate under real touches: a pan on the veil leaves the page where it is, a tap beside the sheet closes it.
        open("/?scene=night-sea&v=pe&\(figure)#publications", wait: 11)
        shot("e-pe-figure")
        drag(0.8, 0.55, speed: 600)
        sleep(2)
        shot("e-pe-figure-panned")
        note("tap beside the sheet")
        safari.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.14)).tap()
        sleep(3)
        shot("e-pe-figure-after-tap")
        open("/?scene=night-sea&v=lock+pe&\(figure)#publications", wait: 11)
        drag(0.8, 0.55, speed: 600)
        sleep(2)
        shot("e-lock-pe-figure-panned")
        open("/?scene=stone&v=pe&\(project)#projects", wait: 11)
        shot("e-pe-project")
        drag(0.75, 0.35, speed: 700)
        sleep(3)
        shot("e-pe-project-scrolled")
        note("tap beside the sheet")
        safari.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.1)).tap()
        sleep(3)
        shot("e-pe-project-after-tap")

        // The end of the page, and a short page.
        open("/?scene=night-sea&act=bottom#about", wait: 10)
        shot("e-base-bottom")
        open("/?scene=night-sea&v=tail&act=bottom#about", wait: 10)
        shot("e-tail-bottom")
        open("/no-such-page?scene=night-sea&v=tail", wait: 9)
        shot("e-tail-404")

        // Addresses that name a section.
        let links = ["/?scene=stone#publications", "/?scene=stone#awards", "/?scene=stone#projects",
                     "/?scene=night-sea#publications", "/publications?scene=stone", "/?scene=stone#publications"]
        for (index, link) in links.enumerated() {
            open(link, wait: 8)
            shot("e-link-\(index)")
        }

        // A taller runway under the landscape top bar; portrait must keep working with it.
        XCUIDevice.shared.orientation = .landscapeLeft
        sleep(5)
        open("/?scene=stone", wait: 12)
        shot("e-land-base-cover")
        open("/?scene=stone&v=runway", wait: 12)
        shot("e-land-runway-cover")
        open("/?scene=stone&v=runway#about", wait: 9)
        shot("e-land-runway-about")
        open("/?scene=night-sea&v=runway+pe&\(president)#awards", wait: 11)
        shot("e-land-runway-pe-award")
        XCUIDevice.shared.orientation = .portrait
        sleep(4)
        open("/?scene=stone&v=runway", wait: 12)
        shot("e-runway-cover")
        drag(0.78, 0.3)
        sleep(6)
        shot("e-runway-about-lifted")
        open("/?scene=night-sea&v=runway+tail&act=bottom#about", wait: 10)
        shot("e-runway-tail-bottom")
    }

    /// How often the first swipe on a freshly loaded cover lifts it (the log shows view and touch end or cancel).
    func liftexp() {
        for i in 0..<6 {
            open(i % 2 == 0 ? "/?scene=stone" : "/?scene=night-sea", wait: 14)
            if i == 0 {
                safari.activate()
                sleep(2)
            }
            drag(0.78, 0.3)
            sleep(6)
            shot("x-lift-\(i)")
        }
    }

    func testWalk() {
        continueAfterFailure = true
        XCUIDevice.shared.orientation = .portrait
        switch ProcessInfo.processInfo.environment["PART"] ?? "light" {
        case "exp": exp()
        case "exp2": exp2()
        case "liftexp": liftexp()
        case "other": darkAndLandscape()
        default: light()
        }
        note("end")
    }
}
