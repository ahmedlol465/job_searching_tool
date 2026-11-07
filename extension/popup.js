async function refresh() {
  const r = await chrome.storage.local.get([
    "ajh_sent_count", "ajh_scrolling", "ajh_autolike",
  ]);
  document.getElementById("sent").textContent = r.ajh_sent_count || 0;

  const scrolling = r.ajh_scrolling === true;
  const autolike = r.ajh_autolike === true;

  const bScroll = document.getElementById("badgeScroll");
  const btnScroll = document.getElementById("btnScroll");
  bScroll.textContent = scrolling ? "on" : "off";
  bScroll.className = "badge " + (scrolling ? "on" : "off");
  btnScroll.textContent = scrolling ? "Disable Auto-scroll" : "Enable Auto-scroll";
  btnScroll.onclick = () => {
    chrome.storage.local.set({ ajh_scrolling: !scrolling });
  };

  const bLike = document.getElementById("badgeLike");
  const btnLike = document.getElementById("btnLike");
  bLike.textContent = autolike ? "on" : "off";
  bLike.className = "badge " + (autolike ? "on" : "off");
  btnLike.textContent = autolike ? "Disable Auto-like" : "Enable Auto-like";
  btnLike.onclick = () => {
    chrome.storage.local.set({ ajh_autolike: !autolike });
  };

  const statusEl = document.getElementById("status");
  try {
    const res = await fetch("http://localhost:3737/api/health");
    const data = await res.json();
    document.getElementById("health").textContent = "online (" + data.jobs + " jobs)";
    document.getElementById("health").style.color = "#16a34a";
    statusEl.textContent = "Ready — scroll LinkedIn, extension captures posts.";
  } catch {
    document.getElementById("health").textContent = "offline";
    document.getElementById("health").style.color = "#dc2626";
    statusEl.textContent = "Run `npx tsx src/server.ts` first.";
  }
}

document.getElementById("open").addEventListener("click", () => {
  chrome.tabs.create({ url: "http://localhost:3737/" });
});

refresh();
setInterval(refresh, 3000);
