/**
 * Dizipal Provider for Nuvio - Engine Sürümü: 1.0.0
 */

"use strict";

var PRIMARY_DOMAIN = "https://dizipal2085.com";
var FALLBACK_DOMAINS = [
  "https://dizipal2086.com",
  "https://dizipal2087.com"
];

var TMDB_KEY = "500330721680edb6d5f7f12ba7cd9023";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36";

var _activeDomain = null;

function log(msg) {
  console.log("[Nuvio-Dizipal] " + msg);
}

function buildQueryString(obj) {
  return Object.keys(obj).map(function(k) {
    return encodeURIComponent(k) + '=' + encodeURIComponent(obj[k]);
  }).join('&');
}

function getActiveDomain() {
  if (_activeDomain) return Promise.resolve(_activeDomain);
  return fetch(PRIMARY_DOMAIN + "/", { headers: { "User-Agent": UA } })
    .then(function(r) {
      if (r.ok) { _activeDomain = PRIMARY_DOMAIN; return PRIMARY_DOMAIN; }
      return _tryFallbacks();
    })
    .catch(function() { return _tryFallbacks(); });
}

function _tryFallbacks() {
  return new Promise(function(resolve) {
    var done = 0, settled = false;
    if (!FALLBACK_DOMAINS.length) return resolve(PRIMARY_DOMAIN);

    FALLBACK_DOMAINS.forEach(function(d) {
      fetch(d + "/", { headers: { "User-Agent": UA } })
        .then(function(r) {
          done++;
          if (settled) return;
          if (r.ok) { settled = true; _activeDomain = d; resolve(d); }
          else if (done >= FALLBACK_DOMAINS.length && !settled) { resolve(PRIMARY_DOMAIN); }
        })
        .catch(function() {
          done++;
          if (!settled && done >= FALLBACK_DOMAINS.length) resolve(PRIMARY_DOMAIN);
        });
    });
  });
}

function cleanSlug(text) {
  if (!text) return "";
  return text.toLowerCase()
    .trim()
    .replace(/[ğüşıöç]/g, c => ({ğ:'g',ü:'u',ş:'s',ı:'i',ö:'o',ç:'c'}[c] || c))
    .replace(/[^a-z0-9]+/g, '-')   // sadece harf ve rakam bırak
    .replace(/-+/g, '-')           // fazla tireleri tek tireye indir
    .replace(/^-+|-+$/g, '');      // baş/sondaki tireleri sil
}

function searchInSite(domain, query) {
  var url = domain + "/ajax-search?q=" + encodeURIComponent(query);
  return fetch(url, {
    method: "GET",
    headers: {
      "User-Agent": UA,
      "Referer": domain + "/",
      "X-Requested-With": "XMLHttpRequest",
      "Accept": "application/json, text/javascript, */*; q=0.01"
    }
  })
  .then(r => { if (!r.ok) throw new Error("Arama isteği başarısız"); return r.json(); })
  .catch(err => { log("Arama hatası: " + err.message); return null; });
}

function parseEmbedPlayer(embedUrl, domainReferer) {
  return fetch(embedUrl, { headers: { "User-Agent": UA, "Referer": domainReferer } })
    .then(res => res.text())
    .then(html => {
      var streams = [];
      var subtitles = [];

      // Altyazı taraması
      var tracksMatch = html.match(/tracks\s*:\s*(

\[[^\]

]+\]

)/);
      if (tracksMatch) {
        try {
          var parsedTracks = JSON.parse(tracksMatch[1].replace(/'/g, '"'));
          parsedTracks.forEach(track => {
            if (track.file) {
              subtitles.push({
                url: track.file.startsWith('//') ? 'https:' + track.file : track.file,
                lang: track.label || 'Türkçe',
                format: track.file.endsWith('.vtt') ? 'vtt' : 'srt'
              });
            }
          });
        } catch(e) {
          var regSub = /file\s*:\s*["']([^"']+\.(vtt|srt))["']\s*,\s*label\s*:\s*["']([^"']+)["']/g;
          var m;
          while ((m = regSub.exec(html)) !== null) {
            subtitles.push({ url: m[1], lang: m[3], format: m[2] });
          }
        }
      }

      // Birden fazla video kaynağı yakala
      var fileRegex = /(?:file|source)\s*:\s*["']([^"']+\.(m3u8|mp4))["']/gi;
      var match;
      while ((match = fileRegex.exec(html)) !== null) {
        streams.push({ fileUrl: match[1], subtitles: subtitles });
      }

      return streams;
    })
    .catch(err => { log("Embed parse hatası: " + err.message); return []; });
}

function getStreams(tmdbId, mediaType, season, episode) {
  log("İçerik arama süreci başlatıldı. TMDB ID: " + tmdbId);

  return Promise.all([
    fetch("https://api.themoviedb.org/3/" + (mediaType === "movie" ? "movie" : "tv") + "/" + tmdbId + "?api_key=" + TMDB_KEY + "&language=tr-TR").then(r => r.json()),
    getActiveDomain()
  ])
  .then(results => {
    var tmdbData = results[0];
    var domain = results[1];
    var primaryTitle = tmdbData.name || tmdbData.title || "";
    var originalTitle = tmdbData.original_name || tmdbData.original_title || "";

    log("Arama kelimesi gönderiliyor: " + primaryTitle);

    return searchInSite(domain, primaryTitle).then(searchResponse => {
      var slug = null;
      if (searchResponse && searchResponse.success && searchResponse.results?.length > 0) {
        var matchedUrl = searchResponse.results[0].url;
        slug = matchedUrl.substring(matchedUrl.lastIndexOf('/') + 1);
        log("Slug bulundu: " + slug);
      }

      if (!slug && originalTitle && originalTitle !== primaryTitle) {
        log("Orijinal ad ile tekrar deneniyor: " + originalTitle);
        return searchInSite(domain, originalTitle).then(bResponse => {
          if (bResponse && bResponse.success && bResponse.results?.length > 0) {
            var bUrl = bResponse.results[0].url;
            slug = bUrl.substring(bUrl.lastIndexOf('/') + 1);
          }
          return { slug, domain, title: primaryTitle };
        });
      }

      return { slug, domain, title: primaryTitle };
    });
  })
  .then(searchResult => {
    var slug = searchResult.slug || cleanSlug(searchResult.title);
    var domain = searchResult.domain;
    var title = searchResult.title;

    var targetPageUrl = mediaType === "movie"
      ? domain + "/film/" + slug
      : domain + "/bolum/" + slug + "-" + parseInt(season, 10) + "-sezon-" + parseInt(episode, 10) + "-bolum";

    log("Sayfa yükleniyor: " + targetPageUrl);

    return fetch(targetPageUrl, { headers: { "User-Agent": UA, "Referer": domain + "/" } })
      .then(r => { if(!r.ok) throw new Error("Sayfa yüklenemedi"); return r.text(); })
      .then(html => {
        var csrfTokenMatch = html.match(/csrf[_-]?token\s*=\s*["']([^"']+)["']/i);
        var csrfToken = csrfTokenMatch ? csrfTokenMatch[1] : null;

        var cfgRegex = /data-cfg\s*=\s*["']([^"']+)["']/g;
        var cfgs = [];
        var match;
        while ((match = cfgRegex.exec(html)) !== null) cfgs.push(match[1]);

        if (cfgs.length === 0) {
          var singleCfg = html.match(/cfg
