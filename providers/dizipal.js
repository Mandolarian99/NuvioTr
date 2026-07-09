/**
 * Dizipal Provider for Nuvio (Log-Verified Production Edition)
 * Canlı Ağ Trafiği (HAR) Analizine Göre %100 Uyumlu Hale Getirildi.
 * Versiyon: 3.0.0
 */

"use strict";

var PRIMARY_DOMAIN = "https://dizipal2085.com";
var FALLBACK_DOMAINS = [
  "https://dizipal2086.com",
  "https://dizipal2087.com"
];

var TMDB_KEY = "500330721680edb6d5f7f12ba7cd9023";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

var _activeDomain = null;

function log(msg) {
  console.log("[Dizipal-Nuvio] " + msg);
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

// Log dosyasındaki gerçek ajax-search GET isteği mimarisi
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
  }).then(function(r) { 
    if (!r.ok) throw new Error("Arama başarısız: " + r.status);
    return r.json(); 
  });
}

function getHtml(url, referer) {
  return fetch(url, { 
    method: "GET",
    headers: {
      "User-Agent": UA,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Referer": referer || (PRIMARY_DOMAIN + "/")
    }
  }).then(function(r) {
    if (!r.ok) throw new Error("Sayfa yüklenemedi: " + r.status);
    return r.text();
  });
}

// Sitenin şifreli ajax-player-config POST taşıyıcısı
function postJson(url, data, referer) {
  var bodyString = buildQueryString(data);
  return fetch(url, {
    method: "POST",
    headers: {
      "User-Agent": UA,
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Requested-With": "XMLHttpRequest",
      "Referer": referer,
      "Accept": "application/json, text/javascript, */*; q=0.01"
    },
    body: bodyString
  }).then(function(r) {
    if (!r.ok) throw new Error("Config POST hatası: " + r.status);
    return r.json();
  });
}

function cleanSlug(text) {
  if (!text) return "";
  return text.toLowerCase()
    .trim()
    .replace(/[ğüşıöç]/g, function(c) { return {ğ:'g',ü:'u',ş:'s',ı:'i',ö:'o',ç:'c'}[c] || c; })
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function extractCfgToken(html) {
  var patterns = [
    /cfg\s*=\s*["']([^"']+)["']/i,
    /data-cfg\s*=\s*["']([^"']+)["']/i,
    /player-config\?cfg=([^"'\s&]+)/i,
    /postData:\s*["']cfg=([^"']+)["']/i
  ];
  for (var i = 0; i < patterns.length; i++) {
    var m = html.match(patterns[i]);
    if (m) return m[1];
  }
  return null;
}

function getTmdbInfo(tmdbId, mediaType) {
  var ep = mediaType === "movie" ? "movie" : "tv";
  return fetch("https://api.themoviedb.org/3/" + ep + "/" + tmdbId + "?api_key=" + TMDB_KEY + "&language=tr-TR")
    .then(function(r) { return r.json(); })
    .then(function(d) {
      return {
        title:     (d.name || d.title || "").trim(),
        origTitle: (d.original_name || d.original_title || "").trim()
      };
    }).catch(function() { return { title: "", origTitle: "" }; });
}

// ─── ANA SÜREÇ YÜRÜTÜCÜSÜ ─────────────────────────────────────────────────────
function getStreams(tmdbId, mediaType, season, episode) {
  log("Süreç doğrulanmış log yapısıyla başladı. ID: " + tmdbId);

  return Promise.all([getTmdbInfo(tmdbId, mediaType), getActiveDomain()])
    .then(function(initData) {
      var info = initData[0];
      var domain = initData[1];
      var searchQuery = info.title || info.origTitle;

      log("API Araması Yapılıyor: " + searchQuery);
      return searchInSite(domain, searchQuery).then(function(searchResponse) {
        var slug = null;
        
        // Log tabanlı JSON doğrulaması ile tam URL eşleşmesi ayıkla
        if (searchResponse && searchResponse.success && searchResponse.results && searchResponse.results.length > 0) {
          var siteUrl = searchResponse.results[0].url; // Örn: https://dizipal2085.com/dizi/house-of-the-dragon
          slug = siteUrl.substring(siteUrl.lastIndexOf('/') + 1);
          log("Arama Sonucundan Çıkarılan Slug: " + slug);
        }

        // Eğer API'den gelmezse akıllı algoritmik tahmine düş
        if (!slug) {
          slug = cleanSlug(info.title) || cleanSlug(info.origTitle);
          log("API boş döndü. Manuel üretilen slug: " + slug);
        }

        var targetUrl = "";
        if (mediaType === "movie") {
          targetUrl = domain + "/film/" + slug;
        } else {
          // LOG VERİSİ: Bölüm sayfaları doğrudan bu şemayla çalışıyor!
          var s = parseInt(season, 10);
          var e = parseInt(episode, 10);
          targetUrl = domain + "/bolum/" + slug + "-" + s + "-sezon-" + e + "-bolum";
        }

        log("Hedef Sayfa İsteği Gönderiliyor: " + targetUrl);
        return getHtml(targetUrl, domain).then(function(pageHtml) {
          return { html: pageHtml, currentUrl: targetUrl, domain: domain };
        });
      });
    })
    .then(function(result) {
      var html = result.html;
      var currentUrl = result.currentUrl;
      var domain = result.domain;

      var cfgToken = extractCfgToken(html);
      
      // Eğer statik HTML'de token yoksa loglardaki ana JS şemasına göre brute-force token ara
      if (!cfgToken) {
        var tokenMatch = html.match(/cfg=([a-f0-9]{32})/i);
        if (tokenMatch) cfgToken = tokenMatch[1];
      }

      if (!cfgToken) {
        log("Hata: Sayfa kaynağından 'cfg' parametresi ayıklanamadı.");
        return [];
      }
      log("Doğrulanan Token: " + cfgToken);

      var ajaxUrl = domain + "/ajax-player-config";
      return postJson(ajaxUrl, { "cfg": cfgToken }, currentUrl)
        .then(function(response) {
          // Log dosyasındaki gerçek dönen başarı yapısı: response.success ve response.config.v
          if (response && response.success && response.config && response.config.v) {
            var videoUrl = response.config.v;
            log("Video Akışı Başarıyla Çözüldü: " + videoUrl);

            return [{
              name: "Dizipal - Native Server",
              title: "Dizipal [1080p AD-FREE]",
              url: videoUrl,
              quality: "1080p",
              type: "direct",
              headers: { 
                "Referer": currentUrl, 
                "User-Agent": UA,
                "Origin": domain
              }
            }];
          }
          log("Sunucu video konfigürasyonu vermeyi reddetti.");
          return [];
        })
        .catch(function(err) {
          log("POST Çözümleme Hatası: " + err.message);
          return [];
        });
    })
    .catch(function(err) {
      log("Genel Operasyon Hatası: " + err.message);
      return [];
    });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams: getStreams };
} else {
  var globalScope = (typeof globalThis !== 'undefined') ? globalThis 
                  : (typeof global !== 'undefined') ? global 
                  : (typeof window !== 'undefined') ? window : this;
  globalScope.getStreams = getStreams;
}
