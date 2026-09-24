(function(){
  if(document.getElementById("adobe-hub-banner"))return;
  var b=document.createElement("div");
  b.id="adobe-hub-banner";
  b.innerHTML='<div style="position:fixed;top:0;left:0;right:0;z-index:99999;height:34px;background:linear-gradient(135deg,#1a1a2e,#16213e,#0f3460);display:flex;align-items:center;justify-content:space-between;padding:0 20px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,0.3);border-bottom:1px solid rgba(255,255,255,0.08)"><div style="display:flex;align-items:center;gap:14px"><a href="https://saleshub.corp.adobe.com" style="display:flex;align-items:center;gap:7px;text-decoration:none;color:#fff;font-size:12px;font-weight:600;letter-spacing:.3px"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#e34850" stroke-width="2.5"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>Sales Hub</a><span style="width:1px;height:14px;background:rgba(255,255,255,.15)"></span><a href="https://techstack.corp.adobe.com" style="text-decoration:none;color:rgba(255,255,255,.5);font-size:11px;padding:2px 7px;border-radius:3px">TechStack</a><a href="https://rfp.corp.adobe.com" style="text-decoration:none;color:rgba(255,255,255,.5);font-size:11px;padding:2px 7px;border-radius:3px">RFP Suite</a><a href="https://battlemind.corp.adobe.com" style="text-decoration:none;color:rgba(255,255,255,.5);font-size:11px;padding:2px 7px;border-radius:3px">BattleMind</a></div><span style="color:rgba(255,255,255,.2);font-size:10px">Adobe Internal</span></div>';
  document.body.prepend(b);
  document.body.style.paddingTop="34px";
  var s=document.createElement("style");
  s.textContent="#adobe-hub-banner a:hover{color:#fff !important;background:rgba(255,255,255,.08)!important}";
  document.head.appendChild(s);
  var cur=location.hostname.split(".")[0];
  var links=b.querySelectorAll("a[href]");
  links.forEach(function(a){if(a.href.indexOf(cur+".corp")>-1){a.style.color="#fff";a.style.fontWeight="600"}});
})();
