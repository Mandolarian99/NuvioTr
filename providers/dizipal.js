/**
 * Dizipal Provider for Nuvio (Production Edition - Final Sürüm)
 * Arama motoru esnekliği ve Akıllı Doğrudan URL Tahmin Mekanizması eklendi.
 * Versiyon: 2.2.0
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

function cleanSlug(text) {
  if (!text) return "";
  return text.toLowerCase()
    .trim()
    .replace(/[ğüşıöç]/g, function(c) { return {ğ:'g',ü:'u',ş:'s',ı:'i',ö:'o',ç:'c'}[c] || c; })
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function extractSlug(html, mediaType) {
  var prefix = mediaType === "movie" ? "/film/" : "/dizi/";
  var re = new RegExp('href=["\']' + prefix + '([^"\'/]+)["\']');
  var m = html.match(re);
  return m ? m[1] : null;
}

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
        title:     (d.name || "").trim(),
        origTitle: (d.original_name || d.original_title || "").trim()
      };
    }).catch(function() { return { title: "", origTitle: "" }; });
}

// ─── ANA MOTOR YÜRÜTÜCÜSÜ ─────────────────────────────────────────────────────
function getStreams(tmdbId, mediaType, season, episode) {
  log("Arama başlatıldı. ID: " + tmdbId);

  return Promise.all([getTmdbInfo(tmdbId, mediaType), getActiveDomain()])
    .then(function(initData) {
      var info = initData[0];
      var domain = initData[1];
      
      var primarySearch = info.title || info.origTitle;
      var backupSearch = info.origTitle || info.title;
      
      log("Birincil Arama Terimi: " + primarySearch);
      var searchUrl = domain + "/ara?q=" + encodeURIComponent(primarySearch);

      return getHtml(searchUrl, domain)
        .then(function(searchHtml) {
          var slug = extractSlug(searchHtml, mediaType);
          
          // Eğer ilk aramada bulunamazsa alternatif isimle ara
          if (!slug && backupSearch !== primarySearch) {
            log("İlk arama başarısız. Alternatif ad deneniyor: " + backupSearch);
            return getHtml(domain + "/ara?q=" + encodeURIComponent(backupSearch), domain).then(function(backupHtml) {
              return { slug: extractSlug(backupHtml, mediaType), domain: domain, info: info };
            });
          }
          return { slug: slug, domain: domain, info: info };
        })
        .then(function(searchResult) {
          var slug = searchResult.slug;
          var domain = searchResult.domain;
          
          // Sitenin arama motoru tamamen patlaksa, doğrudan URL tahmini yap (Bypass Modu)
          if (!slug) {
            var guessedSlug = cleanSlug(searchResult.info.title) || cleanSlug(searchResult.info.origTitle);
            log("Arama motorundan sonuç alınamadı. Tahmini URL deneniyor: " + guessedSlug);
            slug = guessedSlug;
          }

          var contentUrl = mediaType === "movie" ? domain + "/film/" + slug : domain + "/dizi/" + slug;
          log("Hedef İçerik Bağlantısı: " + contentUrl);

          return getHtml(contentUrl, domain).then(function(contentHtml) {
            if (mediaType === "tv") {
              var epUrl = extractEpisodeUrl(contentHtml, domain, season, episode);
              if (!epUrl) {
                // Eğer doğrudan tahminde de bölüm yoksa yedek alternatif slug denemesi (örn orijinal isimle slug)
                var backupGuessedSlug = cleanSlug(searchResult.info.origTitle);
                if (backupGuessedSlug && backupGuessedSlug !== slug) {
                  var backupContentUrl = domain + "/dizi/" + backupGuessedSlug;
                  log("Yedek Tahmini URL deneniyor: " + backupContentUrl);
                  return getHtml(backupContentUrl, domain).then(function(bHtml) {
                    var bEpUrl = extractEpisodeUrl(bHtml, domain, season, episode);
                    if (!bEpUrl) throw new Error("Bölüm hiçbir varyasyonda bulunamadı.");
                    return getHtml(bEpUrl, backupContentUrl).then(function(epHtml) {
                      return { html: epHtml, contentUrl: bEpUrl, domain: domain };
                    });
                  });
                }
                throw new Error("Sezon/Bölüm bağlantısı eşleştirilemedi.");
              }
              
              log("Bölüm Sayfası Çözülüyor: " + epUrl);
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
        log("Hata: Sayfada oyuncu konfigürasyon tokenı (cfg) bulunamadı.");
        return [];
      }
      log("Mekanizma Başarılı. Token: " + cfgToken);

      var ajaxUrl = domain + "/ajax-player-config";
      return postJson(ajaxUrl, { "cfg": cfgToken }, contentUrl)
        .then(function(response) {
          if (response && response.success && response.config && response.config.v) {
            var videoUrl = response.config.v;
            log("Akış Bulundu: " + videoUrl);

            return [{
              name: "Dizipal - Premium",
              title: "Dizipal [1080p REKLAMSIZ]",
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
