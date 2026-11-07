chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ ajh_sent_count: 0 });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type !== "JOB_FOUND") return;

  console.log("[ajh-bg] Forwarding job to server...", request.post.externalId);

  fetch("http://localhost:3737/api/jobs/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ posts: [request.post] })
  })
    .then(async (r) => {
      if (!r.ok) {
        const text = await r.text();
        throw new Error("HTTP " + r.status + " " + text);
      }
      const data = await r.json();
      console.log("[ajh-bg] Server responded:", data);
      sendResponse({ ok: true, data: data });
    })
    .catch((err) => {
      console.warn("[ajh-bg] Fetch failed:", err.message);
      sendResponse({ ok: false, error: String(err) });
    });

  return true;
});