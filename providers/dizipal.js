/**
 * Dizipal Provider for Nuvio (Production Edition - Hotfix 2)
 * TMDB İngilizce bölüm adı uyumsuzluğu ve link yakalama hatası giderildi.
 * Versiyon: 2.1.5
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

function getHtml(url, referer) {
  return fetch(url, { 
    method: "GET",
    headers: {
      "User-Agent": UA,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "tr-TR,tr;q=0.9",
      "Referer": referer || (PRIMARY_DOMAIN + "/"),
      "Origin": referer ? referer.substring(0, referer.lastIndexOf('/')) : PRIMARY_DOMAIN
    }
  }).then(function(r) {
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.text();
  });
}

function postJson(url, data, referer) {
  var bodyString = buildQueryString(data);
  return fetch(url, {
    method: "POST",
    headers: {
      "User-Agent": UA,
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "Accept": "application/json, text/javascript, */*; q=0.01",
      "X-Requested-With": "XMLHttpRequest",
      "Referer": referer || (PRIMARY_DOMAIN + "/"),
      "Origin": referer ? referer.substring(0, referer.lastIndexOf('/')) : PRIMARY_DOMAIN
    },
    body: bodyString
  }).then(function(r) {
    if (!r.ok) throw new Error("HTTP POST " + r.status);
    return r.json();
  });
}

function extractSlug(html, mediaType) {
  var prefix = mediaType === "movie" ? "/film/" : "/dizi/";
  var re = new RegExp('href=["\']' + prefix + '([^"\'/]+)["\']');
  var m = html.match(re);
  return m ? m[1] : null;
}

// Görseldeki hatayı çözen akıllı bölüm yakalayıcı regex seti
function extractEpisodeUrl(html, domain, season, episode) {
  var s = parseInt(season, 10);
  var e = parseInt(episode, 10);

  var patterns = [
    new RegExp('href=["\']([^"\']+' + s + '-sezon-' + e + '-bolum[^"\']*)["\']', 'i'),
    new RegExp('href=["\']([^"\']+' + s + 'x' + (e < 10 ? '0' + e : e) + '[^"\']*)["\']', 'i'),
    new RegExp('href=["\']([^"\']+' + s + 'x' + e + '[^"\']*)["\']', 'i'),
    new RegExp('href=["\']([^"\']*season-' + s + '-episode-' + e + '[^"\']*)["\']', 'i'),
    new RegExp('href=["\']([^"\']*/bolum/[^"\'/]+-' + s + '-sezon-' + e + '-bolum[^"\']*)["\']', 'i')
  ];

  for (var i = 0; i < patterns.length; i++) {
    var m = html.match(patterns[i]);
    if (m) {
      var matchedUrl = m[1];
      return matchedUrl.charAt(0) === '/' ? domain + matchedUrl : matchedUrl;
    }
  }
  
  // Son çare: Tüm linkleri tara ve sayısal eşleşme ara
  var hrefRegex = /href=["']([^"']+)["']/g;
  var match;
  while ((match = hrefRegex.exec(html)) !== null) {
    var link = match[1];
    if (link.includes(s + '-sezon') && link.includes(e + '-bolum')) {
      return link.charAt(0) === '/' ? domain + link : link;
    }
  }
  return null;
}

function extractCfgToken(html) {
  var patterns = [
    /cfg\s*=\s*["']([^"']+)["']/i,
    /data-cfg\s*=\s*["']([^"']+)["']/i,
    /["']cfg["']\s*:\s*["']([^"']+)["']/i,
    /player-config\?cfg=([^"'\s&]+)/i
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

function getStreams(tmdbId, mediaType, season, episode) {
  log("Süreç başladı. ID: " + tmdbId + " Sezon: " + season + " Bölüm: " + episode);

  return Promise.all([getTmdbInfo(tmdbId, mediaType), getActiveDomain()])
    .then(function(initData) {
      var info = initData[0];
      var domain = initData[1];
      
      // Sitede aratılacak adı belirle (Örn: House of the Dragon)
      var searchQuery = info.title || info.origTitle;
      if (!searchQuery) throw new Error("Başlık bilgisi alınamadı.");

      log("Aranan İçerik: " + searchQuery);
      var searchUrl = domain + "/ara?q=" + encodeURIComponent(searchQuery);

      return getHtml(searchUrl, domain).then(function(searchHtml) {
        var slug = extractSlug(searchHtml, mediaType);
        if (!slug) {
          slug = searchQuery.toLowerCase()
            .replace(/[ğüşıöç]/g, function(c) { return {ğ:'g',ü:'u',ş:'s',ı:'i',ö:'o',ç:'c'}[c] || c; })
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
        }

        var contentUrl = mediaType === "movie" ? domain + "/film/" + slug : domain + "/dizi/" + slug;
        log("Dizi Ana Sayfası: " + contentUrl);

        return getHtml(contentUrl, domain).then(function(contentHtml) {
          if (mediaType === "tv") {
            // Sezon ve bölüm linkini akıllıca yakala
            var epUrl = extractEpisodeUrl(contentHtml, domain, season, episode);
            if (!epUrl) throw new Error("İlgili Sezon/Bölüm bağlantısı dizi sayfasında bulunamadı.");
            log("Bölüm Sayfası Bağlantısı: " + epUrl);
            return getHtml(epUrl, contentUrl).then(function(epHtml) {
              return { html: epHtml, contentUrl: epUrl, domain: domain };
            });
          }
          return { html: contentHtml, contentUrl: contentUrl, domain: domain };
        });
      });
    })
    .then(function(result) {
      var html = result.html;
      var contentUrl = result.contentUrl;
      var domain = result.domain;

      var cfgToken = extractCfgToken(html);
      if (!cfgToken) {
        log("Hata: Sayfadan 'cfg' tokenı alınamadı.");
        return [];
      }
      log("Doğrulama Tokenı Başarıyla Kazındı: " + cfgToken);

      var ajaxUrl = domain + "/ajax-player-config";
      var postData = { "cfg": cfgToken };

      return postJson(ajaxUrl, postData, contentUrl)
        .then(function(response) {
          if (response && response.success && response.config && response.config.v) {
            var videoUrl = response.config.v;
            log("Video Linki Çözüldü: " + videoUrl);

            return [{
              name: "Dizipal - Player",
              title: "Dizipal [1080p AD-FREE]",
              url: videoUrl,
              quality: "1080p",
              type: "direct",
              headers: { 
                "Referer": contentUrl, 
                "User-Agent": UA,
                "Origin": domain
              }
            }];
          }
          return [];
        })
        .catch(function() {
          return [];
        });
    })
    .catch(function(err) {
      log("Akış Hatası: " + err.message);
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
