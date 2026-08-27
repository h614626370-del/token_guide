      const menuButton = document.querySelector(".mobile-menu");
      const navigation = document.querySelector(".nav-links");
      const authGuestControls = document.querySelectorAll("[data-auth-guest]");
      const authUserControls = document.querySelectorAll("[data-auth-user]");
      const navUserEmails = document.querySelectorAll("[data-auth-user-email]");
      const navStatusTexts = document.querySelectorAll("[data-status-text]");
      const noticeOpenButton = document.querySelector("[data-notice-open]");
      const noticeDialogShell = document.querySelector("[data-notice-dialog]");
      const noticeDialog = document.querySelector(".notice-dialog");
      const noticeBadge = document.querySelector("[data-notice-badge]");
      const noticeTitle = document.querySelector("[data-notice-title]");
      const noticeBody = document.querySelector("[data-notice-body]");
      const noticeImage = document.querySelector("[data-notice-image]");
      const noticePrimary = document.querySelector("[data-notice-primary]");
      const noticeSecondary = document.querySelector("[data-notice-secondary]");
      const noticeCount = document.querySelector("[data-notice-count]");
      const noticeList = document.querySelector("[data-notice-list]");
      const noticeListItems = document.querySelector("[data-notice-list-items]");
      const noticeLayout = document.querySelector(".notice-layout");
      const pricingRoot = document.querySelector("[data-model-pricing]");
      const pricingVendors = document.querySelector("[data-pricing-vendors]");
      const pricingGroups = document.querySelector("[data-pricing-groups]");
      const pricingModels = document.querySelector("[data-pricing-models]");
      const pricingStatus = document.querySelector("[data-pricing-status]");
      const pricingSummary = document.querySelector("[data-pricing-summary]");
      const pricingVendorName = document.querySelector("[data-pricing-vendor-name]");
      const pricingGroupName = document.querySelector("[data-pricing-group-name]");
      const pricingGroupMeta = document.querySelector("[data-pricing-group-meta]");
      const pricingError = document.querySelector("[data-pricing-error]");
      const pricingRetry = document.querySelector("[data-pricing-retry]");
      const pricingRouteLinks = document.querySelectorAll("[data-pricing-route]");
      const internalAnchorLinks = document.querySelectorAll('a[href^="#"]');
      const pricingRoutePath = "/model-pricing";
      let activeNotice = null;
      let availableNotices = [];
      let noticeLastFocus = null;
      let modelPricingCatalog = null;
      let activePricingVendorId = "";
      let activePricingGroupId = "";

      const NOTICE_VIEW_STORAGE_KEY = "llapi_home_notice_views_v1";

      const NOTICE_CONFIG_DEFAULTS = Object.freeze({
        enabled: true,
        id: "",
        publishedAt: "",
        badge: "通知公告",
        title: "通知公告",
        body: [],
        imageUrl: "",
        imageAlt: "通知公告配图",
        primaryActionText: "",
        primaryActionUrl: "",
        secondaryActionText: "",
        secondaryActionUrl: "",
        autoOpen: true
      });

      const SITE_CONFIG_DEFAULTS = Object.freeze({
        brandName: "灵链云",
        brandApiName: "灵链云 API",
        brandEnglishName: "LINGLIAN",
        brandTagline: "AI gateway for builders",
        statusText: "网关运行中",
        siteUrl: "https://llapi.org",
        apiBaseUrl: "https://llapi.org/v1",
        guideUrl: "https://guide.llapi.org",
        modelPricingApiUrl: "https://guide.llapi.org/api/model-pricing",
        logoUrl: "./assets/logo-80.png",
        socialImageUrl: "./assets/logo-256.png",
        loginUrl: "/login",
        registerUrl: "/register",
        dashboardUrl: "/dashboard",
        pageTitle: "灵链云 Token 中转站 - Claude、GPT、Gemini API 中转",
        seoHeading: "灵链云 Token 中转站与 AI API 中转服务",
        seoDescription: "灵链云是面向开发者和团队的 Token 中转站，提供 Claude API、GPT API、Gemini API 等主流模型中转服务。使用统一 Base URL 和 API Key，集中查看 Token 用量、请求记录与费用。",
        seoKeywords: "灵链云,Token中转站,AI中转站,API中转站,大模型API中转,Claude API中转,GPT API中转,ChatGPT API中转,Gemini API中转,OpenAI API中转,AI API网关,API Key,Token计费",
        ogDescription: "一个 Base URL 和 API Key，中转 Claude、GPT、Gemini 等主流模型 API，并集中管理 Token 用量、请求记录和费用。",
        twitterDescription: "灵链云提供 Claude、GPT、Gemini 等主流模型 API 中转，用一套接口管理调用与 Token 消耗。",
        copyrightYear: 2026,
        notices: []
      });

      function applyConfigTemplate(value, context) {
        return String(value).replace(/\{\{(\w+)\}\}/g, (match, token) => {
          return typeof context[token] === "string" ? context[token] : match;
        });
      }

      function normalizeNoticeBody(value, context) {
        const items = Array.isArray(value) ? value : typeof value === "string" ? value.split(/\r?\n/) : [];
        return items
          .map((item) => applyConfigTemplate(item, context).trim())
          .filter(Boolean);
      }

      function normalizeNoticeConfig(candidate, index, context) {
        if (!candidate || typeof candidate !== "object") return null;

        const publishedAt =
          typeof candidate.publishedAt === "string" && candidate.publishedAt.trim()
            ? candidate.publishedAt.trim()
            : NOTICE_CONFIG_DEFAULTS.publishedAt;
        const title =
          typeof candidate.title === "string" && candidate.title.trim()
            ? applyConfigTemplate(candidate.title, context).trim()
            : NOTICE_CONFIG_DEFAULTS.title;

        return {
          enabled: candidate.enabled !== false,
          id:
            typeof candidate.id === "string" && candidate.id.trim()
              ? candidate.id.trim()
              : publishedAt || title || "notice-" + (index + 1),
          publishedAt,
          badge:
            typeof candidate.badge === "string" && candidate.badge.trim()
              ? applyConfigTemplate(candidate.badge, context).trim()
              : NOTICE_CONFIG_DEFAULTS.badge,
          title,
          body: normalizeNoticeBody(candidate.body, context),
          imageUrl:
            typeof candidate.imageUrl === "string" && candidate.imageUrl.trim()
              ? applyConfigTemplate(candidate.imageUrl, context).trim()
              : NOTICE_CONFIG_DEFAULTS.imageUrl,
          imageAlt:
            typeof candidate.imageAlt === "string" && candidate.imageAlt.trim()
              ? applyConfigTemplate(candidate.imageAlt, context).trim()
              : NOTICE_CONFIG_DEFAULTS.imageAlt,
          primaryActionText:
            typeof candidate.primaryActionText === "string" && candidate.primaryActionText.trim()
              ? applyConfigTemplate(candidate.primaryActionText, context).trim()
              : NOTICE_CONFIG_DEFAULTS.primaryActionText,
          primaryActionUrl:
            typeof candidate.primaryActionUrl === "string" && candidate.primaryActionUrl.trim()
              ? applyConfigTemplate(candidate.primaryActionUrl, context).trim()
              : NOTICE_CONFIG_DEFAULTS.primaryActionUrl,
          secondaryActionText:
            typeof candidate.secondaryActionText === "string" && candidate.secondaryActionText.trim()
              ? applyConfigTemplate(candidate.secondaryActionText, context).trim()
              : NOTICE_CONFIG_DEFAULTS.secondaryActionText,
          secondaryActionUrl:
            typeof candidate.secondaryActionUrl === "string" && candidate.secondaryActionUrl.trim()
              ? applyConfigTemplate(candidate.secondaryActionUrl, context).trim()
              : NOTICE_CONFIG_DEFAULTS.secondaryActionUrl,
          autoOpen: candidate.autoOpen !== false,
          _order: index
        };
      }

      function normalizeNoticeList(source, context) {
        const rawNotices = Array.isArray(source.notices)
          ? source.notices
          : source.notice && typeof source.notice === "object"
            ? [source.notice]
            : [];

        return rawNotices
          .map((notice, index) => normalizeNoticeConfig(notice, index, context))
          .filter(Boolean);
      }

      function normalizeSiteConfig(candidate) {
        const source = candidate && typeof candidate === "object" ? candidate : {};
        const normalized = {};

        Object.entries(SITE_CONFIG_DEFAULTS).forEach(([key, fallback]) => {
          if (key === "notices") return;

          if (key === "copyrightYear") {
            const year = Number.parseInt(source[key], 10);
            normalized[key] = Number.isFinite(year) ? year : fallback;
            return;
          }

          normalized[key] = typeof source[key] === "string" && source[key].trim() ? source[key].trim() : fallback;
        });

        if (!/^https?:\/\//i.test(normalized.siteUrl)) {
          normalized.siteUrl = "https://" + normalized.siteUrl.replace(/^\/+/, "");
        }
        normalized.siteUrl = normalized.siteUrl.replace(/\/+$/, "");

        for (let pass = 0; pass < 2; pass += 1) {
          Object.keys(normalized).forEach((key) => {
            if (typeof normalized[key] !== "string") return;
            normalized[key] = applyConfigTemplate(normalized[key], normalized);
          });
        }

        ["apiBaseUrl", "guideUrl", "modelPricingApiUrl"].forEach((key) => {
          try {
            normalized[key] = new URL(normalized[key], normalized.siteUrl + "/").href;
          } catch {
            normalized[key] = SITE_CONFIG_DEFAULTS[key];
          }
        });
        ["apiBaseUrl", "guideUrl", "modelPricingApiUrl"].forEach((key) => {
          normalized[key] = normalized[key].replace(/\/+$/, "");
        });
        normalized.notices = normalizeNoticeList(source, normalized);
        return normalized;
      }

      const siteConfig = normalizeSiteConfig(window.LLAPI_HOME_CONFIG);
      window.LLAPI_HOME_CONFIG = siteConfig;

      function replaceConfigTokens(value) {
        const replacements = [
          [SITE_CONFIG_DEFAULTS.apiBaseUrl, siteConfig.apiBaseUrl],
          [SITE_CONFIG_DEFAULTS.guideUrl, siteConfig.guideUrl],
          [SITE_CONFIG_DEFAULTS.siteUrl, siteConfig.siteUrl],
          [SITE_CONFIG_DEFAULTS.brandApiName, siteConfig.brandApiName],
          [SITE_CONFIG_DEFAULTS.brandEnglishName, siteConfig.brandEnglishName],
          [SITE_CONFIG_DEFAULTS.brandTagline, siteConfig.brandTagline],
          [SITE_CONFIG_DEFAULTS.brandName, siteConfig.brandName]
        ];

        return replacements.reduce(
          (result, [source, replacement]) => result.split(source).join(replacement),
          String(value)
        );
      }

      function setMetaContent(selector, content) {
        const element = document.querySelector(selector);
        if (element) element.setAttribute("content", content);
      }

      function setConfiguredHref(selector, href) {
        document.querySelectorAll(selector).forEach((link) => link.setAttribute("href", href));
      }

      function toAbsoluteUrl(value, fallback) {
        try {
          return new URL(value, `${siteConfig.siteUrl}/`).href;
        } catch {
          return fallback;
        }
      }

      function applySiteConfig() {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let textNode = walker.nextNode();

        while (textNode) {
          const parentTag = textNode.parentElement?.tagName;
          if (parentTag !== "SCRIPT" && parentTag !== "STYLE" && parentTag !== "NOSCRIPT") {
            textNode.nodeValue = replaceConfigTokens(textNode.nodeValue);
          }
          textNode = walker.nextNode();
        }

        document.querySelectorAll("[href], [aria-label], [title]").forEach((element) => {
          ["href", "aria-label", "title"].forEach((attribute) => {
            if (element.hasAttribute(attribute)) {
              element.setAttribute(attribute, replaceConfigTokens(element.getAttribute(attribute)));
            }
          });
        });

        setConfiguredHref('.brand', `${siteConfig.siteUrl}/`);
        setConfiguredHref('a[href="/login"]', siteConfig.loginUrl);
        setConfiguredHref('a[href="/register"]', siteConfig.registerUrl);
        setConfiguredHref('a[href="/dashboard"]', siteConfig.dashboardUrl);
        setConfiguredHref('[data-model-pricing-link]', `${siteConfig.guideUrl}/model-pricing`);

        const markupLogoUrl = document.querySelector('.brand img')?.getAttribute("src");
        const effectiveLogoUrl = markupLogoUrl && markupLogoUrl !== SITE_CONFIG_DEFAULTS.logoUrl
          ? markupLogoUrl
          : siteConfig.logoUrl;
        document.title = siteConfig.pageTitle;
        document.querySelector('link[rel="canonical"]')?.setAttribute("href", `${siteConfig.siteUrl}/`);
        if (effectiveLogoUrl !== SITE_CONFIG_DEFAULTS.logoUrl) {
          document.querySelectorAll('link[rel="icon"]').forEach((element) => element.setAttribute("href", effectiveLogoUrl));
          document.querySelector('link[rel="apple-touch-icon"]')?.setAttribute("href", effectiveLogoUrl);
        }
        document.querySelector('.brand img')?.setAttribute("src", effectiveLogoUrl);
        document.querySelector('.brand-copy span').textContent = siteConfig.brandTagline;
        navStatusTexts.forEach((element) => {
          element.textContent = siteConfig.statusText;
        });
        document.querySelector('.seo-copy h2').textContent = siteConfig.seoHeading;
        document.querySelector('.footer-copyright').textContent = `© ${siteConfig.copyrightYear} ${siteConfig.brandName}. All Rights Reserved.`;

        setMetaContent('meta[name="description"]', siteConfig.seoDescription);
        setMetaContent('meta[name="keywords"]', siteConfig.seoKeywords);
        setMetaContent('meta[property="og:site_name"]', siteConfig.brandName);
        setMetaContent('meta[property="og:title"]', siteConfig.pageTitle);
        setMetaContent('meta[property="og:description"]', siteConfig.ogDescription);
        setMetaContent('meta[property="og:url"]', `${siteConfig.siteUrl}/`);
        const markupSocialImageUrl = document.querySelector('meta[property="og:image"]')?.getAttribute("content");
        const effectiveSocialImageUrl = markupSocialImageUrl && markupSocialImageUrl !== SITE_CONFIG_DEFAULTS.socialImageUrl
          ? markupSocialImageUrl
          : siteConfig.socialImageUrl;
        const socialImageUrl = toAbsoluteUrl(effectiveSocialImageUrl, `${siteConfig.siteUrl}/assets/logo-256.png`);
        setMetaContent('meta[property="og:image"]', socialImageUrl);
        setMetaContent('meta[name="twitter:title"]', siteConfig.pageTitle);
        setMetaContent('meta[name="twitter:description"]', siteConfig.twitterDescription);
        setMetaContent('meta[name="twitter:image"]', socialImageUrl);

        const structuredData = document.querySelector('script[type="application/ld+json"]');
        if (structuredData) {
          const websiteUrl = `${siteConfig.siteUrl}/`;
          const organizationId = `${siteConfig.siteUrl}/#organization`;
          const faqEntities = Array.from(document.querySelectorAll(".faq-item")).map((item) => ({
            "@type": "Question",
            name: item.querySelector(".faq-button span")?.textContent?.trim() || "",
            acceptedAnswer: {
              "@type": "Answer",
              text: item.querySelector(".faq-answer p")?.textContent?.trim() || ""
            }
          })).filter((item) => item.name && item.acceptedAnswer.text);
          const graph = [
            {
              "@type": "WebSite",
              "@id": `${siteConfig.siteUrl}/#website`,
              name: siteConfig.brandName,
              alternateName: `${siteConfig.brandName} Token 中转站`,
              url: websiteUrl,
              description: siteConfig.seoDescription,
              inLanguage: "zh-CN",
              publisher: { "@id": organizationId }
            },
            {
              "@type": "Organization",
              "@id": organizationId,
              name: siteConfig.brandName,
              url: websiteUrl,
              logo: socialImageUrl
            },
            {
              "@type": "Service",
              "@id": `${siteConfig.siteUrl}/#service`,
              name: `${siteConfig.brandName} Token 中转服务`,
              serviceType: "AI API 中转服务",
              url: websiteUrl,
              description: siteConfig.seoDescription,
              provider: { "@id": organizationId }
            }
          ];
          if (faqEntities.length) {
            graph.push({
              "@type": "FAQPage",
              "@id": `${siteConfig.siteUrl}/#faq`,
              mainEntity: faqEntities
            });
          }
          structuredData.textContent = JSON.stringify({ "@context": "https://schema.org", "@graph": graph });
        }
      }

      applySiteConfig();

      function isPricingRoute() {
        const pathname = window.location.pathname.replace(/\/+$/, "") || "/";
        return pathname === pricingRoutePath || pathname.endsWith(pricingRoutePath);
      }

      function updatePricingRouteMeta(active) {
        document.title = active
          ? `${siteConfig.brandName} 模型价格`
          : siteConfig.pageTitle;
        document.querySelector('link[rel="canonical"]')?.setAttribute(
          "href",
          `${siteConfig.siteUrl}${active ? pricingRoutePath : "/"}`
        );
        setMetaContent(
          'meta[name="description"]',
          active
            ? `${siteConfig.brandName}模型价格目录，按厂商、分组查看实时快照价格。`
            : siteConfig.seoDescription
        );
      }

      function setPricingRoute(active, scroll = false) {
        document.body.classList.toggle("pricing-only", active);
        pricingRouteLinks.forEach((link) => {
          link.setAttribute("aria-current", active ? "page" : "false");
        });
        updatePricingRouteMeta(active);
        if (active && scroll) window.scrollTo({ top: 0, behavior: "smooth" });
      }

      pricingRouteLinks.forEach((link) => {
        link.addEventListener("click", (event) => {
          event.preventDefault();
          if (!isPricingRoute()) window.history.pushState({}, "", pricingRoutePath);
          closeMobileNavigation();
          setPricingRoute(true, true);
        });
      });
      internalAnchorLinks.forEach((link) => {
        link.addEventListener("click", (event) => {
          if (!isPricingRoute()) return;
          const hash = link.getAttribute("href") || "";
          if (!hash || hash === "#") return;
          const target = document.querySelector(hash);
          if (!target) return;
          event.preventDefault();
          window.history.pushState({}, "", `/${hash}`);
          setPricingRoute(false);
          window.requestAnimationFrame(() => target.scrollIntoView({ behavior: "smooth", block: "start" }));
        });
      });
      window.addEventListener("popstate", () => setPricingRoute(isPricingRoute(), true));
      setPricingRoute(isPricingRoute());

      function getNoticeTime(notice) {
        const timestamp = Date.parse(notice.publishedAt);
        return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
      }

      function getAvailableNotices() {
        return siteConfig.notices
          .filter((notice) => notice.enabled)
          .slice()
          .sort((left, right) => {
            const timeDiff = getNoticeTime(right) - getNoticeTime(left);
            return timeDiff || left._order - right._order;
          });
      }

      function noticeFingerprint(notice) {
        const source = JSON.stringify([
          notice.id,
          notice.publishedAt,
          notice.title,
          notice.body,
          notice.imageUrl,
          notice.primaryActionText,
          notice.primaryActionUrl,
          notice.secondaryActionText,
          notice.secondaryActionUrl
        ]);
        let hash = 2166136261;
        for (let index = 0; index < source.length; index += 1) {
          hash ^= source.charCodeAt(index);
          hash = Math.imul(hash, 16777619);
        }
        return `${notice.id}:${(hash >>> 0).toString(36)}`;
      }

      function getViewedNoticeFingerprints() {
        try {
          const value = JSON.parse(window.localStorage.getItem(NOTICE_VIEW_STORAGE_KEY) || "[]");
          return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
        } catch {
          return [];
        }
      }

      function hasViewedNotice(notice) {
        return getViewedNoticeFingerprints().includes(noticeFingerprint(notice));
      }

      function markNoticeViewed(notice) {
        if (!notice) return;
        try {
          const fingerprint = noticeFingerprint(notice);
          const viewed = getViewedNoticeFingerprints().filter((item) => item !== fingerprint);
          viewed.push(fingerprint);
          window.localStorage.setItem(NOTICE_VIEW_STORAGE_KEY, JSON.stringify(viewed.slice(-60)));
        } catch {
          // Storage can be unavailable in privacy modes; the notice remains usable.
        }
      }

      function updateNoticeUnreadState() {
        const hasUnread = availableNotices.some((notice) => !hasViewedNotice(notice));
        noticeOpenButton.classList.toggle("has-unread", hasUnread);
      }

      function setNoticeAction(link, text, href) {
        if (!text || !href) {
          link.hidden = true;
          link.removeAttribute("href");
          link.textContent = "";
          return;
        }

        link.hidden = false;
        link.textContent = text;
        link.setAttribute("href", href);
      }

      function formatNoticeDate(value) {
        const timestamp = Date.parse(value);
        if (!Number.isFinite(timestamp)) return "";
        return new Intl.DateTimeFormat("zh-CN", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit"
        }).format(new Date(timestamp));
      }

      function updateNoticeListSelection() {
        noticeListItems.querySelectorAll("[data-notice-order]").forEach((item) => {
          const selected = Number(item.dataset.noticeOrder) === activeNotice?._order;
          item.classList.toggle("is-active", selected);
          item.setAttribute("aria-selected", String(selected));
        });
      }

      function renderNoticeList() {
        const hasMultipleNotices = availableNotices.length > 1;
        noticeList.hidden = !hasMultipleNotices;
        noticeCount.hidden = !hasMultipleNotices;
        noticeLayout.classList.toggle("has-list", hasMultipleNotices);
        noticeCount.textContent = hasMultipleNotices ? `${availableNotices.length} 条公告` : "";

        if (!hasMultipleNotices) {
          noticeListItems.replaceChildren();
          return;
        }

        noticeListItems.replaceChildren(
          ...availableNotices.map((notice) => {
            const item = document.createElement("button");
            item.type = "button";
            item.className = "notice-list-item";
            item.dataset.noticeOrder = String(notice._order);
            item.setAttribute("role", "tab");
            item.setAttribute("aria-selected", "false");
            const title = document.createElement("strong");
            title.textContent = notice.title || "通知公告";
            item.append(title);
            const date = formatNoticeDate(notice.publishedAt);
            if (date) {
              const time = document.createElement("time");
              time.dateTime = notice.publishedAt;
              time.textContent = date;
              item.append(time);
            }
            return item;
          })
        );
        updateNoticeListSelection();
      }

      function renderNotice(notice) {
        noticeBadge.textContent = notice.badge || "通知公告";
        noticeTitle.textContent = notice.title || "通知公告";
        noticeBody.replaceChildren(
          ...(notice.body.length ? notice.body : ["暂无详细内容。"]).map((paragraph) => {
            const element = document.createElement("p");
            element.textContent = paragraph;
            return element;
          })
        );

        if (notice.imageUrl) {
          noticeImage.hidden = false;
          noticeImage.setAttribute("src", notice.imageUrl);
          noticeImage.setAttribute("alt", notice.imageAlt || "");
        } else {
          noticeImage.hidden = true;
          noticeImage.removeAttribute("src");
          noticeImage.setAttribute("alt", "");
        }

        setNoticeAction(noticePrimary, notice.primaryActionText, notice.primaryActionUrl);
        setNoticeAction(noticeSecondary, notice.secondaryActionText, notice.secondaryActionUrl);
      }

      function closeMobileNavigation() {
        navigation.classList.remove("is-open");
        menuButton.setAttribute("aria-expanded", "false");
        menuButton.setAttribute("aria-label", "打开导航");
        document.body.classList.remove("menu-open");
      }

      function openNoticeDialog() {
        if (!activeNotice) return;

        closeMobileNavigation();
        noticeLastFocus = document.activeElement;
        noticeDialogShell.hidden = false;
        document.body.classList.add("notice-open");
        markNoticeViewed(activeNotice);
        updateNoticeUnreadState();
        window.setTimeout(() => noticeDialog.focus(), 0);
      }

      function closeNoticeDialog() {
        noticeDialogShell.hidden = true;
        document.body.classList.remove("notice-open");

        if (noticeLastFocus && typeof noticeLastFocus.focus === "function") {
          noticeLastFocus.focus();
        }
      }

      function initializeNotice() {
        availableNotices = getAvailableNotices();
        const unreadAutoNotice = availableNotices.find((notice) => notice.autoOpen && !hasViewedNotice(notice));
        activeNotice = unreadAutoNotice || availableNotices[0] || null;
        renderNoticeList();

        if (!activeNotice) {
          noticeOpenButton.hidden = true;
          return;
        }

        renderNotice(activeNotice);
        noticeOpenButton.hidden = false;
        updateNoticeUnreadState();

        if (unreadAutoNotice) {
          window.setTimeout(openNoticeDialog, 420);
        }
      }

      noticeOpenButton.addEventListener("click", openNoticeDialog);
      noticeDialogShell.addEventListener("click", (event) => {
        if (event.target.closest("[data-notice-close]")) closeNoticeDialog();
      });

      noticeListItems.addEventListener("click", (event) => {
        const item = event.target.closest("[data-notice-order]");
        if (!item) return;

        const noticeOrder = Number(item.dataset.noticeOrder);
        const nextNotice = availableNotices.find((notice) => notice._order === noticeOrder);
        if (!nextNotice) return;

        activeNotice = nextNotice;
        renderNotice(activeNotice);
        updateNoticeListSelection();
        markNoticeViewed(activeNotice);
        updateNoticeUnreadState();
      });
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !noticeDialogShell.hidden) closeNoticeDialog();
      });

      initializeNotice();

      function resolveModelPricingApiUrl() {
        try {
          const guideOrigin = new URL(siteConfig.guideUrl).origin;
          const servedByGuide = window.location.origin === guideOrigin
            || window.location.pathname.startsWith("/site-home")
            || window.location.port === "3000";
          return servedByGuide
            ? new URL("/api/model-pricing", window.location.origin).href
            : new URL(siteConfig.modelPricingApiUrl, `${siteConfig.guideUrl}/`).href;
        } catch {
          return siteConfig.modelPricingApiUrl;
        }
      }

      function formatPricingNumber(value) {
        const number = Number(value);
        if (!Number.isFinite(number)) return "暂无";
        if (number === 0) return "0";
        if (Math.abs(number) < 0.0001) return number.toExponential(2);
        return number.toFixed(Math.abs(number) < 1 ? 5 : 3).replace(/0+$/, "").replace(/\.$/, "");
      }

      function formatPlatformPrice(value) {
        const formatted = formatPricingNumber(value);
        return formatted === "暂无" ? formatted : `¥${formatted}`;
      }

      function formatPricingDiscount(value) {
        const number = Number(value);
        if (!Number.isFinite(number)) return "暂无";
        return `${(number * 10).toFixed(2).replace(/0+$/, "").replace(/\.$/, "")} 折`;
      }

      function formatSubscriptionPayment(plan) {
        const price = Number(plan?.price);
        if (!Number.isFinite(price)) return "";
        return `¥${formatPricingNumber(price)}`;
      }

      function activePricingVendor() {
        return modelPricingCatalog?.vendors.find((vendor) => vendor.id === activePricingVendorId)
          || modelPricingCatalog?.vendors[0]
          || null;
      }

      function activePricingGroup() {
        const vendor = activePricingVendor();
        return vendor?.groups.find((group) => group.id === activePricingGroupId)
          || vendor?.groups[0]
          || null;
      }

      function createPricingText(tagName, className, text) {
        const element = document.createElement(tagName);
        if (className) element.className = className;
        element.textContent = text;
        return element;
      }

      function createVendorButton(vendor) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "home-pricing-vendor";
        button.classList.toggle("is-active", vendor.id === activePricingVendorId);
        button.setAttribute("aria-pressed", String(vendor.id === activePricingVendorId));

        const mark = createPricingText("span", "home-pricing-vendor-mark", vendor.short || vendor.name.slice(0, 2));
        if (vendor.logo_url) {
          const logo = document.createElement("img");
          logo.src = new URL(vendor.logo_url, resolveModelPricingApiUrl()).href;
          logo.alt = "";
          mark.replaceChildren(logo);
        }
        const copy = document.createElement("span");
        copy.append(
          createPricingText("strong", "", vendor.name),
          createPricingText("small", "", `${vendor.model_count} 个模型`)
        );
        button.append(mark, copy);
        button.addEventListener("click", () => {
          activePricingVendorId = vendor.id;
          activePricingGroupId = vendor.groups[0]?.id || "";
          renderModelPricing();
        });
        return button;
      }

      function createGroupButton(group) {
        const button = document.createElement("button");
        const isSubscription = group.subscription_type === "subscription" || Boolean(group.subscription_plan);
        const subscriptionPayment = formatSubscriptionPayment(group.subscription_plan);
        const meta = document.createElement("span");
        button.type = "button";
        button.className = "home-pricing-group";
        button.classList.toggle("is-active", group.id === activePricingGroupId);
        button.classList.toggle("is-subscription", isSubscription);
        button.setAttribute("role", "tab");
        button.setAttribute("aria-selected", String(group.id === activePricingGroupId));
        button.title = `${group.name}${isSubscription ? ` · 订阅分组${subscriptionPayment ? ` · 实付 ${subscriptionPayment}` : ""}` : ""}`;
        meta.className = "home-pricing-group-meta";
        if (isSubscription) {
          meta.append(createPricingText("small", "home-pricing-subscription-badge", "订阅"));
          if (subscriptionPayment) {
            meta.append(createPricingText("small", "home-pricing-subscription-payment", `实付 ${subscriptionPayment}`));
          }
        }
        meta.append(createPricingText("em", "", `${formatPricingNumber(group.effective_multiplier)}x`));
        button.append(
          createPricingText("strong", "", group.name),
          meta
        );
        button.addEventListener("click", () => {
          activePricingGroupId = group.id;
          renderModelPricing();
        });
        return button;
      }

      function appendTokenPriceCell(row, label, value) {
        const cell = document.createElement("div");
        cell.className = "home-model-price-cell";
        cell.append(
          createPricingText("span", "", label),
          createPricingText("strong", "", formatPlatformPrice(value))
        );
        row.append(cell);
      }

      function createTokenPriceRow(model, values, period = null) {
        const row = document.createElement("div");
        row.className = `home-model-price-row${period ? " is-period" : ""}`;
        const identity = document.createElement("div");
        identity.className = "home-model-identity";
        if (period) {
          identity.append(
            createPricingText("strong", "", "高峰价"),
            createPricingText("small", "", `${period.start_time.slice(0, 5)}–${period.end_time.slice(0, 5)} · ${formatPricingNumber(period.multiplier)}x`)
          );
        } else {
          identity.append(
            createPricingText("strong", "", model.display_name || model.model_name),
            createPricingText("small", "", `${formatPricingNumber(model.effective_multiplier)}x`)
          );
        }
        row.append(identity);
        appendTokenPriceCell(row, "输入 / 1M Tokens", values?.input_usd_per_million);
        appendTokenPriceCell(row, "输出 / 1M Tokens", values?.output_usd_per_million);
        appendTokenPriceCell(row, "缓存读取 / 1M Tokens", values?.cache_read_usd_per_million);
        appendTokenPriceCell(row, "缓存写入 / 1M Tokens", values?.cache_write_usd_per_million);
        row.append(createPricingText("strong", "home-model-discount", period ? "" : formatPricingDiscount(model.discount_ratio)));
        return row;
      }

      function createImagePriceRow(model, tiers, period = null) {
        const row = document.createElement("div");
        row.className = `home-model-price-row is-image${period ? " is-period" : ""}`;
        const unit = model.billing_mode === "image" ? "张" : "次";
        const identity = document.createElement("div");
        identity.className = "home-model-identity";
        if (period) {
          identity.append(
            createPricingText("strong", "", "高峰价"),
            createPricingText("small", "", `${period.start_time.slice(0, 5)}–${period.end_time.slice(0, 5)} · ${formatPricingNumber(period.multiplier)}x`)
          );
        } else {
          identity.append(
            createPricingText("strong", "", model.display_name || model.model_name),
            createPricingText("small", "", `按${unit}计费 · ${formatPricingNumber(model.effective_multiplier)}x`)
          );
        }
        const prices = document.createElement("div");
        prices.className = "home-image-price-grid";
        if (tiers?.length) {
          tiers.forEach((tier) => {
            const item = document.createElement("span");
            item.append(
              createPricingText("small", "", `${tier.label} / ${unit}`),
              createPricingText("strong", "", formatPlatformPrice(tier.effective_price_cny_per_image))
            );
            prices.append(item);
          });
        } else {
          prices.append(createPricingText("span", "home-pricing-empty-inline", `暂无按${unit}价格`));
        }
        row.append(identity, prices, createPricingText("strong", "home-model-discount", period ? "" : formatPricingDiscount(model.discount_ratio)));
        return row;
      }

      function createModelPriceEntry(model) {
        const entry = document.createElement("section");
        entry.className = "home-model-price-entry";
        if (model.billing_mode === "token") {
          entry.append(createTokenPriceRow(model, model.effective_prices));
          (model.time_pricing?.periods || []).forEach((period) => {
            entry.append(createTokenPriceRow(model, period.effective_prices, period));
          });
        } else {
          entry.append(createImagePriceRow(model, model.image_prices));
          (model.time_pricing?.periods || []).forEach((period) => {
            entry.append(createImagePriceRow(model, period.image_prices, period));
          });
        }
        return entry;
      }

      function renderModelPricing() {
        if (!modelPricingCatalog || !pricingRoot) return;
        const vendor = activePricingVendor();
        if (!vendor) return;
        activePricingVendorId = vendor.id;
        const group = activePricingGroup();
        const groupSubscriptionPayment = formatSubscriptionPayment(group?.subscription_plan);
        activePricingGroupId = group?.id || "";

        pricingVendors.replaceChildren(...modelPricingCatalog.vendors.map(createVendorButton));
        pricingGroups.replaceChildren(...vendor.groups.map(createGroupButton));
        pricingVendorName.textContent = vendor.name;
        pricingGroupName.textContent = group?.name || "暂无可用分组";
        pricingGroupMeta.textContent = group
          ? `${group.models.length} 个模型 · 分组倍率 ${formatPricingNumber(group.effective_multiplier)}x${group.subscription_plan ? ` · ${group.subscription_plan.name}${groupSubscriptionPayment ? ` · 实付 ${groupSubscriptionPayment}` : ""}` : ""}`
          : "公开分组";
        pricingModels.replaceChildren(
          ...(group?.models.length
            ? group.models.map(createModelPriceEntry)
            : [createPricingText("div", "home-pricing-empty", "当前分组暂无公开模型")])
        );
      }

      async function loadModelPricing() {
        if (!pricingRoot) return;
        pricingRoot.classList.add("is-loading");
        pricingRoot.classList.remove("is-error");
        pricingError.hidden = true;
        pricingStatus.textContent = "正在读取模型价格";
        try {
          const response = await fetch(resolveModelPricingApiUrl(), {
            headers: { Accept: "application/json" },
            credentials: "omit",
            cache: "no-store"
          });
          if (!response.ok) throw new Error(`模型价格请求失败：${response.status}`);
          const payload = await response.json();
          const catalog = payload?.data;
          if (!catalog || !Array.isArray(catalog.vendors) || !catalog.vendors.length) {
            throw new Error("模型价格快照为空");
          }
          modelPricingCatalog = catalog;
          if (!catalog.vendors.some((vendor) => vendor.id === activePricingVendorId)) {
            activePricingVendorId = catalog.vendors[0].id;
          }
          const vendor = activePricingVendor();
          if (!vendor?.groups.some((group) => group.id === activePricingGroupId)) {
            activePricingGroupId = vendor?.groups[0]?.id || "";
          }
          pricingStatus.textContent = "价格快照已更新";
          pricingSummary.textContent = `${catalog.summary.vendors} 家厂商 · ${catalog.summary.groups} 个分组 · ${catalog.summary.models} 个模型`;
          renderModelPricing();
        } catch (error) {
          pricingRoot.classList.add("is-error");
          pricingStatus.textContent = "价格暂不可用";
          pricingSummary.textContent = "请稍后重新加载";
          pricingError.hidden = false;
          console.warn(error instanceof Error ? error.message : "模型价格读取失败");
        } finally {
          pricingRoot.classList.remove("is-loading");
        }
      }

      pricingRetry?.addEventListener("click", loadModelPricing);
      loadModelPricing();

      function parseAuthUser(rawValue) {
        if (!rawValue) return null;

        try {
          const authUser = JSON.parse(rawValue);
          if (!authUser || typeof authUser !== "object" || typeof authUser.email !== "string") return null;

          const email = authUser.email.trim();
          return email ? { ...authUser, email } : null;
        } catch {
          return null;
        }
      }

      function getStoredAuthUser() {
        try {
          return parseAuthUser(window.localStorage.getItem("auth_user"));
        } catch {
          return null;
        }
      }

      function syncNavigationAuth() {
        const authUser = getStoredAuthUser();
        const isAuthenticated = Boolean(authUser);

        authGuestControls.forEach((element) => {
          element.hidden = isAuthenticated;
        });
        authUserControls.forEach((element) => {
          element.hidden = !isAuthenticated;
        });

        if (authUser) {
          navUserEmails.forEach((element) => {
            element.textContent = authUser.email;
            element.title = authUser.email;
          });
        } else {
          navUserEmails.forEach((element) => {
            element.textContent = "";
            element.removeAttribute("title");
          });
        }
      }

      syncNavigationAuth();

      window.addEventListener("storage", (event) => {
        if (event.key === "auth_user" || event.key === null) syncNavigationAuth();
      });

      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) syncNavigationAuth();
      });

      menuButton.addEventListener("click", () => {
        const shouldOpen = !navigation.classList.contains("is-open");
        if (shouldOpen && !noticeDialogShell.hidden) closeNoticeDialog();

        if (shouldOpen) {
          navigation.classList.add("is-open");
        } else {
          closeMobileNavigation();
          return;
        }

        menuButton.setAttribute("aria-expanded", "true");
        menuButton.setAttribute("aria-label", "关闭导航");
        document.body.classList.add("menu-open");
      });

      navigation.addEventListener("click", (event) => {
        if (event.target.closest("a")) closeMobileNavigation();
      });

      function escapeHtml(value) {
        return String(value)
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;")
          .replaceAll("'", "&#039;");
      }

      function joinUrl(baseUrl, path) {
        return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
      }

      const configuredSiteUrl = escapeHtml(siteConfig.siteUrl);
      const configuredApiBaseUrl = escapeHtml(siteConfig.apiBaseUrl);
      const configuredChatUrl = escapeHtml(joinUrl(siteConfig.apiBaseUrl, "chat/completions"));
      const codeExamples = {
        openai: `<span class="code-keyword">import</span> OpenAI <span class="code-keyword">from</span> <span class="code-string">"openai"</span>;

<span class="code-keyword">const</span> client = <span class="code-keyword">new</span> OpenAI({
  apiKey: <span class="code-string">"sk-your-api-key"</span>,
  baseURL: <span class="code-string">"${configuredApiBaseUrl}"</span>
});

<span class="code-keyword">const</span> result = <span class="code-keyword">await</span> client.chat.completions.create({
  model: <span class="code-string">"your-model"</span>,
  messages: [{ role: <span class="code-string">"user"</span>, content: <span class="code-string">"Hello"</span> }]
});`,
        claude: `<span class="code-keyword">import</span> Anthropic <span class="code-keyword">from</span> <span class="code-string">"@anthropic-ai/sdk"</span>;

<span class="code-keyword">const</span> client = <span class="code-keyword">new</span> Anthropic({
  apiKey: <span class="code-string">"sk-your-api-key"</span>,
  baseURL: <span class="code-string">"${configuredSiteUrl}"</span>
});

<span class="code-comment">// 保留熟悉的 Messages 调用方式</span>
<span class="code-keyword">const</span> message = <span class="code-keyword">await</span> client.messages.create({
  model: <span class="code-string">"your-claude-model"</span>,
  max_tokens: 1024,
  messages: [{ role: <span class="code-string">"user"</span>, content: <span class="code-string">"Hello"</span> }]
});`,
        curl: `<span class="code-keyword">curl</span> ${configuredChatUrl} \\
  -H <span class="code-string">"Authorization: Bearer sk-your-api-key"</span> \\
  -H <span class="code-string">"Content-Type: application/json"</span> \\
  -d <span class="code-string">'{
    "model": "your-model",
    "messages": [
      { "role": "user", "content": "Hello" }
    ]
  }'</span>`
      };

      const codeElement = document.querySelector("#code-example");
      const codeTabs = document.querySelectorAll(".code-tab");

      codeTabs.forEach((tab) => {
        tab.addEventListener("click", () => {
          codeTabs.forEach((item) => {
            const active = item === tab;
            item.classList.toggle("is-active", active);
            item.setAttribute("aria-selected", String(active));
          });
          codeElement.innerHTML = codeExamples[tab.dataset.example];
        });
      });

      document.querySelector(".code-copy").addEventListener("click", async (event) => {
        const button = event.currentTarget;
        try {
          await navigator.clipboard.writeText(codeElement.textContent);
          button.querySelector("img").src = "./api-public/icons/check.svg";
          button.setAttribute("aria-label", "已复制");
          button.title = "已复制";
          window.setTimeout(() => {
            button.querySelector("img").src = "./api-public/icons/copy.svg";
            button.setAttribute("aria-label", "复制代码");
            button.title = "复制代码";
          }, 1600);
        } catch {
          button.setAttribute("aria-label", "复制失败");
          button.title = "复制失败，请手动复制";
        }
      });

      document.querySelectorAll(".faq-button").forEach((button) => {
        button.addEventListener("click", () => {
          const item = button.closest(".faq-item");
          const isOpen = item.classList.toggle("is-open");
          button.setAttribute("aria-expanded", String(isOpen));
        });
      });

      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const revealSelector = [
        ".section-head",
        ".bento-card",
        ".home-pricing-browser",
        ".migration-copy",
        ".code-card",
        ".trust-card",
        ".faq-item",
        ".final-box",
        ".seo-copy"
      ].join(",");
      const revealItems = document.querySelectorAll(revealSelector);

      if (!reducedMotion && "IntersectionObserver" in window) {
        revealItems.forEach((item, index) => {
          item.classList.add("reveal-ready");
          item.style.setProperty("--reveal-delay", `${(index % 4) * 55}ms`);
        });

        const revealObserver = new IntersectionObserver(
          (entries, observer) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) {
                entry.target.classList.add("is-visible");
                observer.unobserve(entry.target);
              }
            });
          },
          { threshold: 0.12, rootMargin: "0px 0px -7% 0px" }
        );

        revealItems.forEach((item) => revealObserver.observe(item));

        window.setTimeout(() => {
          document.querySelectorAll(".reveal-ready:not(.is-visible)").forEach((item) => {
            const rect = item.getBoundingClientRect();
            if (rect.top < window.innerHeight * 1.15) item.classList.add("is-visible");
          });
        }, 900);
      }
