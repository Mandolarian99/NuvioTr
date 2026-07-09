/**
 * Dizipal Provider for Nuvio (Security Bypass Edition)
 * Anti-Bot CSRF Token koruması kırıldı ve tam entegrasyon sağlandı.
 * Versiyon: 3.5.0
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

function searchInSite(domain, query) {
  var url = domain + "/ajax-search?q=" + encodeURIComponent(query);
  return fetch(url, {
    method: "GET",
    headers: {
      "User-Agent": UA,
      "Referer": domain + "/",
      "X-Requested-With": "XMLHttpRequest"
    }
  }).then(function(r) { 
    if (!r.ok) throw new Error("Arama HTTP hatası: " + r.status);
    return r.json(); 
  });
}

function getHtml(url, referer) {
  return fetch(url, { 
    method: "GET",
    headers: {
      "User-Agent": UA,
      "Referer": referer || (PRIMARY_DOMAIN + "/")
    }
  }).then(function(r) {
    if (!r.ok) throw new Error("Sayfa yüklenemedi: " + r.status);
    return r.text();
  });
}

function postJson(url, data, referer) {
  var bodyString = buildQueryString(data);
  return fetch(url, {
    method: "POST",
    headers: {
      "User-Agent": UA,
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Requested-With": "XMLHttpRequest",
      "Referer": referer
    },
    body: bodyString
  }).then(function(r) {
    if (!r.ok) throw new Error("POST hatası: " + r.status);
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

// Log analizine göre eklenen çift taraflı token kazıyıcılar
function extractCfgToken(html) {
  var patterns = [
    /cfg\s*=\s*["']([^"']+)["']/i,
    /data-cfg\s*=\s*["']([^"']+)["']/i,
    /player-config\?cfg=([^"'\s&]+)/i
  ];
  for (var i = 0; i < patterns.length; i++) {
    var m = html.match(patterns[i]);
    if (m) return m[1];
  }
  var brute = html.match(/cfg=([a-f0-9]{32})/i);
  return brute ? brute[1] : null;
}

function extractCsrfToken(html) {
  var patterns = [
    /csrf_token\s*=\s*["']([^"']+)["']/i,
    /["']csrf_token["']\s*:\s*["']([^"']+)["']/i,
    /name=["']csrf_token["']\s+value=["']([^"']+)["']/i,
    /value=["']([^"']+)["']\s+name=["']csrf_token["']/i
  ];
  for (var i = 0; i < patterns.length; i++) {
    var m = html.match(patterns[i]);
    if (m) return m[1];
  }
  var brute = html.match(/([a-f0-9]{64})/i); // 64 karakterli hex araması (Logdaki tam şema)
  return brute ? brute[1] : null;
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

// ─── ANA MOTOR ────────────────────────────────────────────────────────────────
function getStreams(tmdbId, mediaType, season, episode) {
  log("CSRF Korumalı Akış Motoru Başlatıldı. ID: " + tmdbId);

  return Promise.all([getTmdbInfo(tmdbId, mediaType), getActiveDomain()])
    .then(function(initData) {
      var info = initData[0];
      var domain = initData[1];
      var searchQuery = info.title || info.origTitle;

      log("Sitede sorgulanıyor: " + searchQuery);
      return searchInSite(domain, searchQuery).then(function(searchResponse) {
        var slug = null;
        
        if (searchResponse && searchResponse.success && searchResponse.results && searchResponse.results.length > 0) {
          var siteUrl = searchResponse.results[0].url; 
          slug = siteUrl.substring(siteUrl.lastIndexOf('/') + 1);
        }

        if (!slug) {
          slug = cleanSlug(info.title) || cleanSlug(info.origTitle);
        }

        var targetUrl = "";
        if (mediaType === "movie") {
          targetUrl = domain + "/film/" + slug;
        } else {
          var s = parseInt(season, 10);
          var e = parseInt(episode, 10);
          targetUrl = domain + "/bolum/" + slug + "-" + s + "-sezon-" + e + "-bolum";
        }

        log("Sayfa HTML verisi ve Güvenlik Tokenları alınıyor: " + targetUrl);
        return getHtml(targetUrl, domain).then(function(pageHtml) {
          return { html: pageHtml, currentUrl: targetUrl, domain: domain };
        });
      });
    })
    .then(function(result) {
      var html = result.html;
      var currentUrl = result.currentUrl;
      var domain = result.domain;

      // İki hayati tokenı aynı anda kazı
      var cfgToken = extractCfgToken(html);
      var csrfToken = extractCsrfToken(html);

      if (!cfgToken) {
        log("Hata: 'cfg' tokenı sayfa yapısından ayıklanamadı.");
        return [];
      }
      
      log("Doğrulama Başarılı -> cfg: " + cfgToken + " | csrf: " + (csrfToken ? "Alındı" : "Bulunamadı"));

      var ajaxUrl = domain + "/ajax-player-config";
      
      // Sitenin beklediği tam POST veri şeması enjeksiyonu
      var postData = { "cfg": cfgToken };
      if (csrfToken) {
        postData["csrf_token"] = csrfToken;
      }

      return postJson(ajaxUrl, postData, currentUrl)
        .then(function(response) {
          if (response && response.success && response.config && response.config.v) {
            var videoUrl = response.config.v;
            log("Güvenlik Duvarı Aşıldı! Video URL: " + videoUrl);

            return [{
              name: "Dizipal - Premium",
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
          log("Güvenlik Duvarı Tokenı Reddetti.");
          return [];
        })
        .catch(function(err) {
          log("POST Hatası: " + err.message);
          return [];
        });
    })
    .catch(function(err) {
      log("Genel Hata: " + err.message);
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
