const SELECTORS = {
    header: ".site-header",
    navLinks: ".site-nav a",
    revealItems: "[data-reveal]",
    samePageLinks: '.site-nav a[href^="#"], .hero-actions a[href^="#"]',
    pageLinks: "a[href]",
    sections: "section[id]",
    cvForm: "#cvRequestForm",
    cvStatus: "#cvRequestStatus"
};

const CV_COOLDOWN_KEY = "glenn_cv_request_last_sent";
const CV_COOLDOWN_MS = 10 * 60 * 1000;
const MIN_FORM_DWELL_MS = 1500;
const HASH_REALIGN_DELAYS = [140, 460, 1100];

const header = document.querySelector(SELECTORS.header);
const navLinks = Array.from(document.querySelectorAll(SELECTORS.navLinks));
const revealItems = Array.from(document.querySelectorAll(SELECTORS.revealItems));
const pageSections = Array.from(document.querySelectorAll(SELECTORS.sections));
const cvRequestForm = document.querySelector(SELECTORS.cvForm);
const cvRequestStatus = document.querySelector(SELECTORS.cvStatus);
const cvRequestStartedAt = Date.now();

let pendingHashTarget = "";
let pendingHashTimer = 0;

function normalizePath(pathname) {
    return pathname.replace(/\/index\.html$/, "/").replace(/\/+$/, "") || "/";
}

function isAboutPage() {
    return normalizePath(window.location.pathname) === "/about";
}

function activeMarker() {
    return (header?.offsetHeight || 0) + Math.min(190, window.innerHeight * 0.28);
}

function isAtPageBottom() {
    return window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4;
}

function setActiveNav(target) {
    navLinks.forEach((link) => {
        link.classList.remove("is-active");
        link.removeAttribute("aria-current");
    });

    const activeLink = navLinks.find((link) => {
        const href = link.getAttribute("href");

        if (!href) {
            return false;
        }

        if (target.startsWith("#")) {
            return href === target;
        }

        const linkUrl = new URL(href, window.location.href);
        return normalizePath(linkUrl.pathname) === normalizePath(target) && !linkUrl.hash;
    });

    if (!activeLink) {
        return;
    }

    activeLink.classList.add("is-active");
    activeLink.setAttribute("aria-current", "page");
}

function pulseSection(section) {
    section.classList.remove("section-pulse");
    window.requestAnimationFrame(() => section.classList.add("section-pulse"));
}

function findHashTarget(hash = window.location.hash) {
    if (!hash || hash === "#") {
        return null;
    }

    try {
        return document.querySelector(hash);
    } catch {
        return null;
    }
}

function holdHashActive(id, smooth) {
    pendingHashTarget = id;
    window.clearTimeout(pendingHashTimer);
    pendingHashTimer = window.setTimeout(() => {
        pendingHashTarget = "";
        updateActiveNav();
    }, smooth ? 1400 : 120);
}

function scrollToHash(options = {}) {
    const { smooth = true } = options;
    const target = findHashTarget();

    if (!target) {
        return;
    }

    if (target.id) {
        holdHashActive(target.id, smooth);
    }

    window.requestAnimationFrame(() => {
        const root = document.documentElement;
        const previousScrollBehavior = root.style.scrollBehavior;
        const top = target.getBoundingClientRect().top + window.scrollY - (header?.offsetHeight || 0) - 8;

        if (!smooth) {
            root.style.scrollBehavior = "auto";
        }

        window.scrollTo({
            top: Math.max(0, top),
            left: 0,
            behavior: smooth ? "smooth" : "auto"
        });

        if (!smooth) {
            window.requestAnimationFrame(() => {
                root.style.scrollBehavior = previousScrollBehavior;
            });
        }

        pulseSection(target);

        if (target.id) {
            setActiveNav(`#${target.id}`);
        }
    });
}

function alignHashAfterLayout() {
    scrollToHash({ smooth: false });
    HASH_REALIGN_DELAYS.forEach((delay) => {
        window.setTimeout(() => scrollToHash({ smooth: false }), delay);
    });
}

function isCvActive(cvSection, marker) {
    if (!cvSection) {
        return false;
    }

    const rect = cvSection.getBoundingClientRect();
    return isAtPageBottom() || (rect.top <= marker && rect.bottom > marker);
}

function visibleSection(marker) {
    let activeSection = null;

    pageSections.forEach((section) => {
        if (section.getBoundingClientRect().top <= marker) {
            activeSection = section;
        }
    });

    return activeSection || pageSections.find((section) => section.getBoundingClientRect().bottom > marker);
}

function updateActiveNav() {
    const cvSection = document.getElementById("cv");
    const marker = activeMarker();

    if (pendingHashTarget && window.location.hash === `#${pendingHashTarget}`) {
        setActiveNav(`#${pendingHashTarget}`);
        return;
    }

    if (isCvActive(cvSection, marker)) {
        setActiveNav("#cv");
        return;
    }

    if (isAboutPage()) {
        setActiveNav("/about");
        return;
    }

    const section = visibleSection(marker);

    if (section?.id) {
        setActiveNav(`#${section.id}`);
    }
}

function updateHeaderState() {
    header?.classList.toggle("is-scrolled", window.scrollY > 12);
}

function setFormStatus(message, type = "") {
    if (!cvRequestStatus) {
        return;
    }

    cvRequestStatus.textContent = message;
    cvRequestStatus.classList.toggle("is-error", type === "error");
    cvRequestStatus.classList.toggle("is-success", type === "success");
}

function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

function requestCv(email) {
    const subject = encodeURIComponent("CV request from glennhogman.com");
    const body = encodeURIComponent([
        "Hi Glenn,",
        "",
        "Please send your CV to this email address:",
        email,
        "",
        "Requested via glennhogman.com"
    ].join("\n"));

    setFormStatus("Opening your email app with a prepared request.", "success");
    window.location.href = `mailto:glenn.hogman@gmail.com?subject=${subject}&body=${body}`;
}

function handleCvRequest(event) {
    event.preventDefault();

    const formData = new FormData(cvRequestForm);
    const email = String(formData.get("email") || "").trim();
    const trap = String(formData.get("website") || "").trim();
    const lastRequest = Number(window.localStorage.getItem(CV_COOLDOWN_KEY) || 0);
    const now = Date.now();

    if (trap) {
        setFormStatus("Request blocked.", "error");
        return;
    }

    if (now - cvRequestStartedAt < MIN_FORM_DWELL_MS) {
        setFormStatus("Please wait a moment and try again.", "error");
        return;
    }

    if (!isValidEmail(email) || email.length > 120) {
        setFormStatus("Enter a valid email address.", "error");
        return;
    }

    if (lastRequest && now - lastRequest < CV_COOLDOWN_MS) {
        setFormStatus("A request was prepared recently. Try again later.", "error");
        return;
    }

    window.localStorage.setItem(CV_COOLDOWN_KEY, String(now));
    requestCv(email);
}

function transitionDestination(event, link) {
    const href = link.getAttribute("href");

    if (!href || href.startsWith("#") || href.startsWith("mailto:") || link.target || link.hasAttribute("download")) {
        return null;
    }

    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
        return null;
    }

    const destination = new URL(href, window.location.href);
    return destination.origin === window.location.origin && destination.href !== window.location.href ? destination : null;
}

function handleSamePageLink(event) {
    const target = findHashTarget(event.currentTarget.getAttribute("href"));

    if (!target) {
        return;
    }

    event.preventDefault();
    window.history.pushState(null, "", event.currentTarget.getAttribute("href"));
    scrollToHash();
    pulseSection(target);
}

function handlePageTransition(event) {
    const destination = transitionDestination(event, event.currentTarget);

    if (!destination) {
        return;
    }

    event.preventDefault();
    document.body.classList.add("is-leaving");

    window.setTimeout(() => {
        window.location.href = destination.href;
    }, 170);
}

function setupRevealObserver() {
    if (!("IntersectionObserver" in window)) {
        revealItems.forEach((item) => item.classList.add("is-visible"));
        return;
    }

    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            entry.target.classList.toggle("is-visible", entry.isIntersecting);
        });
    }, { rootMargin: "-8% 0px -12% 0px", threshold: 0.16 });

    revealItems.forEach((item) => {
        if (item.getBoundingClientRect().top < window.innerHeight * 0.88) {
            item.classList.add("is-visible");
        }

        revealObserver.observe(item);
    });
}

document.querySelectorAll(SELECTORS.samePageLinks).forEach((link) => {
    link.addEventListener("click", handleSamePageLink);
});

document.querySelectorAll(SELECTORS.pageLinks).forEach((link) => {
    link.addEventListener("click", handlePageTransition);
});

cvRequestForm?.addEventListener("submit", handleCvRequest);

updateHeaderState();
window.addEventListener("scroll", updateHeaderState, { passive: true });
window.addEventListener("scroll", updateActiveNav, { passive: true });
window.addEventListener("resize", updateActiveNav);
window.addEventListener("hashchange", () => scrollToHash());
window.addEventListener("load", alignHashAfterLayout);

setupRevealObserver();
document.documentElement.classList.add("js-enabled");
alignHashAfterLayout();
updateActiveNav();
