/* Click-to-load facade for live embeds.
   Markup: <div class="embed" data-embed="URL" data-embed-title="TITLE">
             <a class="embed-poster">…screenshot…</a>
             <button class="embed-load" hidden>[ LOAD LIVE SITE ]</button>
           </div>
   Without JS the poster stays a plain link; with JS the button appears and
   swaps the whole facade for the real iframe on click. */
(function () {
  document.querySelectorAll('.embed[data-embed]').forEach(function (embed) {
    var btn = embed.querySelector('.embed-load');
    if (!btn) return;
    btn.hidden = false;
    btn.addEventListener('click', function () {
      var iframe = document.createElement('iframe');
      iframe.src = embed.dataset.embed;
      iframe.title = embed.dataset.embedTitle || embed.dataset.embed;
      iframe.loading = 'lazy';
      if (window.posthog) posthog.capture('project_embed_loaded', { project_url: embed.dataset.embed, project_title: embed.dataset.embedTitle || embed.dataset.embed });
      embed.replaceChildren(iframe);
    }, { once: true });
  });
})();
