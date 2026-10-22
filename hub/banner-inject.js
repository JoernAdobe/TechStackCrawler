/* Sales Hub cross-tool bar. Injected via <script src="https://saleshub.corp.adobe.com/banner-inject.js" async>. */
(function () {
  if (document.getElementById("adobe-hub-banner")) return;
  var H = 36;
  var LOGO = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAcCAYAAAAAwr0iAAAEn0lEQVR42q2WXYscVRCGnzqnZ2Z3PnpmM4lREVlFo2IiiLnJlQkRNOKFaFATDQSNMTE3/gBB/QX+gUgQQYT4AbkQvdAseKWBKCoYBCXRiMHN7nztzu7M9DnlRffESW/P7izYcKDhfFTVW/W+VTDBdx4CgOYML6zOoP/UiOZraGoN+jNos8brAJrc2egzkxzaCx7AKa/q+GMyAAZwTMEC7n9xQMEK+PmQ3YGwr6OoxAbSn11WfEl4uFlnr4Bq9rnNIwBgDa8VQdaLTMBbwDtOApyd4F1Zb/MtMO+AX9rGrf0+lxCqEaiMuaegBrDQE+XBWovfFYwkKdw0Am8n+4OIl0JDNYJI1nFaQDy4ijCl8DLA3AY2ZIP8C5BbqPFTAXasgJeN0+bzYCLlapTngVvmWU4M6aYQSIpPGzUOlIUd3Qzjmv2o6YGrGO7IDXhaQOfWKUazPgDgiHmdjkCBHMg4CCNQr5yQERpPnIJh4XRm2OWUi/0YjRvnFTQHeLiisF1g2mcUZCGOYE+1w7cJom5SBAQg8hwvCUFCvVFntSCIFU6KcqEoqK6N0k0LEllObEoHNIbVtSrUvXBoKQbejuz7acF0ld9qDb5Q+CwXO5d2wC4pGOWZ+Tq3CzjNsJeFgAVwlsOhUO+DS1HPTwMBnFEQMXzS9rQDCEaLUkAiiCqG0HiOjLOX5YBTCJxyvJc8NJpXC0Fb6eaFDwDqDf5UOFeOT6VzbFYUVHlF76GQkco1tLIC2grZXzbsXNabqSfgEkOfFxv8QdLxDLzXz3hPwHTBl4V7O9d5QkDPpyhpsqgXCadMvOnT7HCAEU4nKqcKUmvxzarnx6Jg0igM6dsn7g9pSpo09VoV7guEx9uKpouvKJgV5Zdqg68VZF9szAq4HJyZyqhEAdNRNID9nRl2CvjRYrzxM9RstRwrC3ldmy8/BVjlfYFB4pwOI7YDPkqK0aYUUhRcSQj6nuNp/TFD6u0FpzNUHRzJoJ5asG3Pct7w4dChIcQKttzlmsK5Sly1LouSCIc0ZEuCgtxwYC4pvqbnuVDY3ktRT8GHgqjw5XSDv36FwhwYjalnh0HkhNP9JJ3pLtkHFwpbW5bnE+TsqLQKIIs1vpsSHulqnNubuC/oimPPtjYXxnRNALNQ5eKU4aGurmlebhrsKvxQb7KbuLmpDEeuTpVHxXA+fVFBg7jPL+aFN+M+EytfDmwPriSKmBMYtKq8UTK8u6A4k6Kcgi8Jxnseq7T4SsEOHXALNc6WhYNtJSJjohUgTPKiycoDi0p7i3AnDdoCurSV2/oDLiGEGdNTFArBkvJpvcmzCtYIuEaVuww81UlRLy0QTcU1FNdUXEtx80qvJISLcCApxnz5On+vo4y2o6iFJ5tV7hZwQ6iPhsKUz5DKFAo2Yymew6NCNk4ZGR3ZDEdjjm6ntNDj5zzM9mJqTTwpJ/QUgeWC4f7SIlcTBsj1Kt8XDbuW1xajL4Dpw2WXY5dprfJiUZhd3aTxkY7nKkKp7zgIcBnyAi4vnM5nj21mNVbV2XyfQ8bBqWjMwDihEwzi+wcVzGyskgSWjzueVm6tMv43ssGpfwFQav/Lq9M+CQAAAABJRU5ErkJggg==";
  var tools = [
    { id: "techstack", label: "Account Radar", href: "https://techstack.corp.adobe.com/" },
    { id: "rfp", label: "RFP Suite", href: "https://rfp.corp.adobe.com/" },
    { id: "battlemind", label: "BattleMind", href: "https://battlemind.corp.adobe.com/" },
    { id: "digest", label: "Digest Studio", href: "https://saleshub.corp.adobe.com/digest/" }
  ];
  var host = location.hostname.split(".")[0];
  var current = host === "saleshub" && location.pathname.indexOf("/digest") === 0 ? "digest" : host;

  var css =
    ":host{all:initial;position:fixed;top:0;left:0;right:0;z-index:2147483000;display:block}" +
    ".bar{box-sizing:border-box;height:" + H + "px;display:flex;align-items:center;gap:18px;padding:0 20px;" +
    "font:500 12px/1 'adobe-clean','Adobe Clean',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;" +
    "color:rgba(255,255,255,.62);-webkit-font-smoothing:antialiased;" +
    "background:linear-gradient(90deg,rgba(13,12,18,.92),rgba(18,14,20,.92) 55%,rgba(36,16,12,.92));" +
    "-webkit-backdrop-filter:saturate(140%) blur(14px);backdrop-filter:saturate(140%) blur(14px);" +
    "box-shadow:0 8px 24px -12px rgba(0,0,0,.7)}" +
    ".bar::after{content:'';position:absolute;left:0;right:0;bottom:0;height:1px;" +
    "background:linear-gradient(90deg,rgba(255,255,255,.06),rgba(255,255,255,.1) 60%,rgba(255,120,60,.45) 88%,rgba(255,255,255,.06))}" +
    "a{color:inherit;text-decoration:none;outline:none}" +
    ".home{display:flex;align-items:center;gap:8px;color:#fff;font-weight:700;letter-spacing:.01em;white-space:nowrap}" +
    ".home img{width:16px;height:14px;display:block}" +
    ".sep{width:1px;height:14px;background:rgba(255,255,255,.14);flex:none}" +
    "nav{display:flex;align-items:stretch;gap:2px;height:100%;overflow-x:auto;scrollbar-width:none}" +
    "nav::-webkit-scrollbar{display:none}" +
    "nav a{position:relative;display:flex;align-items:center;padding:0 10px;white-space:nowrap;transition:color .2s ease}" +
    "nav a:hover,nav a:focus-visible{color:#fff}" +
    "nav a:focus-visible{box-shadow:inset 0 0 0 1px rgba(255,255,255,.35);border-radius:6px}" +
    "nav a[aria-current=page]{color:#fff;font-weight:700}" +
    "nav a[aria-current=page]::after{content:'';position:absolute;left:10px;right:10px;bottom:0;height:2px;border-radius:2px 2px 0 0;background:#eb1000;box-shadow:0 0 10px rgba(235,16,0,.7)}" +
    ".tag{margin-left:auto;padding:4px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.12);" +
    "background:rgba(255,255,255,.04);color:rgba(255,255,255,.5);font-size:10.5px;letter-spacing:.02em;white-space:nowrap}" +
    "@media (max-width:640px){.tag{display:none}.bar{gap:12px;padding:0 12px}.home span{display:none}}" +
    "@media (prefers-reduced-transparency:reduce){.bar{background:#121016;-webkit-backdrop-filter:none;backdrop-filter:none}}";

  var links = tools.map(function (t) {
    return '<a href="' + t.href + '"' + (t.id === current ? ' aria-current="page"' : "") + ">" + t.label + "</a>";
  }).join("");

  var el = document.createElement("div");
  el.id = "adobe-hub-banner";
  var root = el.attachShadow ? el.attachShadow({ mode: "open" }) : el;
  root.innerHTML =
    "<style>" + css + "</style>" +
    '<div class="bar" role="navigation" aria-label="Sales Hub tools">' +
    '<a class="home" href="https://saleshub.corp.adobe.com/" title="Sales Hub"><img src="' + LOGO + '" alt="" width="16" height="14"><span>Sales Hub</span></a>' +
    '<span class="sep" aria-hidden="true"></span>' +
    "<nav>" + links + "</nav>" +
    '<span class="tag">Adobe internal</span>' +
    "</div>";

  function mount() {
    document.body.prepend(el);
    document.body.style.paddingTop = H + "px";
    document.documentElement.style.setProperty("--hub-banner-h", H + "px");
  }
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);
})();
