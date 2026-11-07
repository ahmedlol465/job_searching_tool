(() => {
  const SEEN_KEY = "ajh_seen_auto";
  const SENT_KEY = "ajh_sent_count";
  const SCROLLING_KEY = "ajh_scrolling";
  const AUTOLIKE_KEY = "ajh_autolike";

  const rand = (min, max) => min + Math.random() * (max - min);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const JOB_RX = [
    /\bintern(?:ship)?\b/i, /\btrainee\b/i, /\bco-op\b/i,
    /\bsoftware engineering intern/i, /\bbackend intern/i,
    /\bfrontend intern/i, /\bfull.?stack intern/i,
    /\bweb development intern/i, /\bai intern/i,
    /\bmachine learning intern/i, /\bdeep learning intern/i,
    /\bsummer internship/i, /\bwinter internship/i,
    /\bpaid internship/i, /\bunpaid internship/i,
    /\bremote internship/i, /\binternship program/i,
    /\binternship opportunity/i, /\bstudent internship/i,
    /\bgraduate trainee/i,
    /\bتدريب\b/i, /\bمتدرب\b/i, /\bفرصة تدريب\b/i,
    /\bمتدرب هندسة برمجيات\b/i, /\bمتدرب Backend\b/i,
    /\bمتدرب Frontend\b/i, /\bمتدرب Full Stack\b/i,
    /\bمتدرب تطوير ويب\b/i, /\bمتدرب ذكاء اصطناعي\b/i,
    /\bمتدرب تعلم آلي\b/i, /\bمتدرب تعلم عميق\b/i,
    /\bتدريب صيفي\b/i, /\bتدريب شتوي\b/i, /\bتدريب مدفوع\b/i,
    /\bتدريب غير مدفوع\b/i, /\bتدريب غير مدفوع\b/i,
    /\bتدريب عن بعد\b/i, /\bبرنامج تدريبي\b/i,
    /\bتدريب للطلاب\b/i, /\bتدريب تعاوني\b/i,
    /\bمتدرب خريجين\b/i,
    /\bjunior\b/i, /\bentry[\s-]?level\b/i, /\bfresh grad/i,
    /\brecent grad/i, /\bnew grad/i, /\bassociate\b/i,
    /\b0-1 years?/i, /\b0-2 years?/i, /\bno experience\b/i,
    /\bwithout experience\b/i, /\bjunior position\b/i,
    /\bمبتدئ\b/i, /\bحديث التخرج\b/i, /\bحديثي التخرج\b/i,
    /\bخريج جديد\b/i, /\bخريج حديث\b/i, /\bمطور مبتدئ\b/i,
    /\bمهندس برمجيات مبتدئ\b/i, /\bمستوى مبتدئ\b/i,
    /\bمطور حديث الخبرة\b/i, /\bمهندس برمجيات حديث الخبرة\b/i,
    /\bلا يشترط الخبرة\b/i, /\bبدون خبرة\b/i,
    /\bوظيفة للمبتدئين\b/i, /\bمطور مساعد\b/i,
    /\bمهندس برمجيات مساعد\b/i, /\bوظيفة للخريجين\b/i,
    /\bبرنامج الخريجين\b/i,
    /\bwe'?re hiring\b/i, /\bhiring now\b/i, /\bhiring\b/i,
    /\bjob opening\b/i, /\bjob vacancy\b/i, /\bcareer opportunity\b/i,
    /\bopen position\b/i, /\bapply now\b/i, /\bjoin our team\b/i,
    /\brecruitment\b/i, /\bwalk-in interview\b/i, /\bcareer fair\b/i,
    /\bمطلوب\b/i, /\bنعلن عن وظائف\b/i, /\bفرصة عمل\b/i,
    /\bوظيفة شاغرة\b/i, /\bفرصة وظيفية\b/i, /\bمنصب شاغر\b/i,
    /\bإعلان توظيف\b/i, /\bقدم الآن\b/i, /\bباب التقديم مفتوح\b/i,
    /\bمطلوب مطورين\b/i, /\bمطلوب بشكل عاجل\b/i,
    /\bبدء العمل فوراً\b/i, /\bملتقى توظيف\b/i,
    /\bتوظيف حديثي التخرج\b/i,
    /\bsoftware engineer/i, /\bsoftware developer/i,
    /\bbackend\b/i, /\bfrontend\b/i, /\bfull.?stack/i,
    /\bweb developer/i, /\bphp\b/i, /\blaravel\b/i,
    /\breact\b/i, /\bnode\.?js\b/i, /\bjavascript\b/i,
    /\btypescript\b/i, /\bpython\b/i, /\bapi developer/i,
    /\bdatabase developer/i, /\bdevops\b/i, /\bai engineer/i,
    /\bmachine learning\b/i, /\bdata engineer/i,
    /\bqa engineer/i, /\bautomation tester\b/i,
    /\bmobile developer\b/i,
    /\bمهندس برمجيات\b/i, /\bمطور برمجيات\b/i,
    /\bمطور باي\b/i, /\bمطور لارافيل\b/i, /\bمطور ريأكت\b/i,
    /\bمطور نود\b/i, /\bمطور جافاسكريبت\b/i,
    /\bمطور تايب سكريبت\b/i, /\bمطور بايثون\b/i,
    /\bمطلوب مبرمج\b/i, /\bمطلوب مطور\b/i,
    /\bمطلوب مهندس برمجيات\b/i, /\bفرص تدريب\b/i,
    /\bشغل للمبتدئين\b/i, /\bخريجي حاسبات\b/i,
    /\bطلاب حاسبات\b/i, /\bدفعة 2027\b/i,
    /\bخريجي دفعة 2027\b/i, /\bمطلوب دفعة 2027\b/i,
    /\bحديث التخرج بدون خبرة\b/i, /\bالتقديم مفتوح\b/i,
    /\bابعت السي في\b/i, /\bأرسل السيرة الذاتية\b/i,
    /\bمطلوب للتعيين فوراً\b/i, /\bفرصة للشباب\b/i,
    /\bremote\b/i, /\bwork from home\b/i, /\bfully remote\b/i,
    /\bworldwide remote\b/i, /\bglobal hiring\b/i,
    /\bvisa sponsorship\b/i, /\brelocation\b/i,
    /\binternational applicants\b/i,
    /\bعن بعد\b/i, /\bمن المنزل\b/i, /\bعمل عن بعد\b/i,
    /\bموقع عمل مرن\b/i, /\bعمل هجين\b/i,
    /\bتوظيف عالمي\b/i, /\bتدريب دولي\b/i,
    /\bرعاية تأشيرة\b/i,
  ];
  const looksLikeJob = (t) => JOB_RX.some((rx) => rx.test(t));

  // ── Storage helpers ──
  const get = (key, def) => new Promise((resolve) => {
    chrome.storage.local.get(key, (r) => resolve(r[key] ?? def));
  });
  const set = (key, val) => new Promise((resolve) => {
    chrome.storage.local.set({ [key]: val }, resolve);
  });

  function getSeen() {
    return get(SEEN_KEY, []).then((arr) => new Set(arr));
  }
  function saveSeen(seenSet) {
    return set(SEEN_KEY, Array.from(seenSet).slice(-8000));
  }
  function bumpSent() {
    return get(SENT_KEY, 0).then((c) => set(SENT_KEY, c + 1));
  }

  function simpleHash(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return Math.abs(h).toString(36);
  }


  // ── Post detection: anchor on Like buttons, climb until the parent holds several posts ──
  const isLikeBtn = (b) => {
    const label = b.getAttribute("aria-label") || "";
    const txt = (b.innerText || "").trim();
    return /^like\b/i.test(label) || /reaction button/i.test(label) || /^like$/i.test(txt);
  };

  function findPostContainer(btn, allLikes) {
    let el = btn;
    while (el.parentElement && el.parentElement !== document.body) {
      const p = el.parentElement;
      let n = 0;
      for (const b of allLikes) if (p.contains(b)) n++;
      if (n > 1) return el; // parent holds multiple posts, so el is one post
      el = p;
    }
    return null;
  }

  function findPostNodes() {
    const allLikes = Array.from(document.querySelectorAll("button")).filter(isLikeBtn);
    const nodes = new Set();
    for (const btn of allLikes) {
      let c = findPostContainer(btn, allLikes);
      // Only one post visible: climb to the first ancestor with real text
      if (!c) {
        let el = btn;
        while (el.parentElement && (el.innerText || "").length < 200) el = el.parentElement;
        c = el;
      }
      if (c) nodes.add(c);
    }
    return Array.from(nodes);
  }

  function extractPostFromNode(node) {
    let urn = node.getAttribute("data-urn") || node.getAttribute("data-id") || "";
    if (!urn) {
      const m = (node.innerHTML.match(/urn:li:(?:activity|ugcPost|share):\d+/) || [])[0];
      if (m) urn = m;
    }

    const textEl = node.querySelector('[data-testid="expandable-text-box"], .update-components-text, .feed-shared-text');
    let text = textEl ? textEl.innerText || textEl.textContent : node.innerText || node.textContent;
    text = (text || "").replace(/…\s*more/gi, "").replace(/see more/gi, "").trim();
    if (text.length < 15) return null;

    const id = urn || "li-auto-" + simpleHash(text);

    let author = "LinkedIn";
    const authorEl = node.querySelector('.update-components-actor__title span[aria-hidden="true"], .update-components-actor__title, a[href*="/in/"] span, a[href*="/company/"] span, strong');
    if (authorEl && authorEl.innerText) author = authorEl.innerText.trim().split("\n")[0];

    const url = urn ? "https://www.linkedin.com/feed/update/" + urn : location.href;
    return { externalId: id, text: text.slice(0, 6000), author, url, node };
  }

  function tryLike(node) {
    if (!node || !node.isConnected) return Promise.resolve(false);
    const btn = Array.from(node.querySelectorAll("button")).find(isLikeBtn);
    if (!btn || btn.getAttribute("aria-pressed") === "true") return Promise.resolve(false);
    btn.scrollIntoView({ block: "center", behavior: "smooth" });
    return sleep(rand(800, 1600)).then(() => { btn.click(); return true; });
  }

  function processPost(post) {
    console.log("[ajh] Sending to background script:", post.externalId);
    // node is a DOM element and cannot be sent through runtime messaging
    const { node, ...payload } = post;
    chrome.runtime.sendMessage({ type: "JOB_FOUND", post: payload }, function (resp) {
      if (chrome.runtime.lastError) {
        console.warn("[ajh] sendMessage failed:", chrome.runtime.lastError.message);
        return;
      }
      if (resp && resp.ok) {
        bumpSent().then(() => console.log("[ajh] Server accepted:", resp.data && resp.data.imported, "imported"));
      } else {
        console.warn("[ajh] Server returned error:", resp && resp.error);
      }
    });

    get(AUTOLIKE_KEY, false).then((doLike) => {
      if (doLike) sleep(10000).then(() => tryLike(node));
    });
  }

  function scanVisible() {
    getSeen().then((seen) => {
      const nodes = findPostNodes();
      console.log("[ajh] scan: " + nodes.length + " post containers");

      let added = 0, changed = false;
      for (const node of nodes) {
        const post = extractPostFromNode(node);
        if (!post || seen.has(post.externalId)) continue;
        seen.add(post.externalId);
        changed = true;
        if (!looksLikeJob(post.text)) continue;
        console.log("[ajh] JOB MATCH:", post.text.slice(0, 60));
        processPost(post);
        added++;
      }
      if (changed) saveSeen(seen).then(() => { if (added) console.log("[ajh] scan complete: " + added + " new matching posts"); });
    });
  }

  let scanDebounce = null;
  function queueScan() {
    if (scanDebounce) return;
    scanDebounce = setTimeout(() => { scanDebounce = null; scanVisible(); }, 800);
  }

  new MutationObserver(queueScan).observe(document.body, { childList: true, subtree: true });
  window.addEventListener("scroll", queueScan, { passive: true });

  // ── Auto-scroll: runs while the popup toggle (SCROLLING_KEY) is on ──
  // The feed may scroll inside an inner container instead of the window: find it from a post
  function getScroller(posts) {
    let el = posts[0] ? posts[0].parentElement : null;
    while (el && el !== document.body && el !== document.documentElement) {
      if (/(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 50) return el;
      el = el.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  }

  let scrollLoopRunning = false;
  async function autoScrollLoop() {
    if (scrollLoopRunning) return;
    scrollLoopRunning = true;
    console.log("[ajh] auto-scroll started");
    while (await get(SCROLLING_KEY, false)) {
      const posts = findPostNodes();
      const sc = getScroller(posts);
      const before = sc.scrollTop;
      const next = posts
        .filter((n) => n.getBoundingClientRect().top > 150)
        .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0];
      // distance to bring the next post near the top; fall back to 80% of the viewport
      const dist = next ? next.getBoundingClientRect().top - 100 : Math.round(window.innerHeight * 0.8);
      sc.scrollBy({ top: dist, behavior: "smooth" });
      await sleep(rand(1000, 2000));
      console.log("[ajh] scroll step on", sc.tagName + "." + String(sc.className).slice(0, 30), "moved", Math.round(sc.scrollTop - before) + "px", "posts:", posts.length);
    }
    scrollLoopRunning = false;
    console.log("[ajh] auto-scroll stopped");
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[SCROLLING_KEY] && changes[SCROLLING_KEY].newValue) autoScrollLoop();
  });

  console.log("[ajh] Content script initializing...");
  queueScan();
  autoScrollLoop();
})();