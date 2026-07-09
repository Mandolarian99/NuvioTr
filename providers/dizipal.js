/**
 * Dizipal Provider for Nuvio (Production Edition)
 * Yakalanan ağ akışlarına göre tamamen sıfırdan revize edilmiştir.
 * Versiyon: 2.1.0
 */

"use strict";

// ─── Sabitler ve Dinamik Domain Algoritması ─────────────────────────────────────

var PRIMARY_DOMAIN = "https://dizipal2085.com";
var FALLBACK_DOMAINS = [
  "https://dizipal2086.com",
  "https://dizipal2087.com",
  "https://dizipal.site"
];

var TMDB_KEY = "500330721680edb6d5f7f12ba7cd9023";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36";

var HEADERS = {
  "User-Agent": UA,
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8"
};

var _activeDomain = null;

// ─── Yardımcı Fonksiyonlar (QuickJS Uyumlu) ────────────────────────────────────

function log(msg) {
  console.log("[Dizipal] " + msg);
}

// URLSearchParams nesnesi QuickJS'te olmadığı için vanilla string builder kullanıyoruz
function buildQueryString(obj) {
  return Object.keys(obj).map(function(k) {
    return encodeURIComponent(k) + '=' + encodeURIComponent(obj[k]);
  }).join('&');
}

// Sitenin canlı olan en güncel domainini bulan koruma fonksiyonu
function getActiveDomain() {
  if (_activeDomain) return Promise.resolve(_activeDomain);

  return fetch(PRIMARY_DOMAIN + "/", { headers: HEADERS })
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
      fetch(d + "/", { headers: HEADERS })
        .then(function(r) {
          done++;
          if (settled) return;
          if (r.ok) {
            settled = true; _activeDomain = d; resolve(d);
          } else if (done >= FALLBACK_DOMAINS.length && !settled) {
            resolve(PRIMARY_DOMAIN);
          }
        })
        .catch(function() {
          done++;
          if (!settled && done >= FALLBACK_DOMAINS.length) resolve(PRIMARY_DOMAIN);
        });
    });
  });
}

function getHtml(url, referer) {
  var hdrs = Object.assign({}, HEADERS, { "Referer": referer || PRIMARY_DOMAIN + "/" });
  return fetch(url, { headers: hdrs }).then(function(r) {
    if (!r.ok) throw new Error("HTTP " + r.status + " - " + url);
    return r.text();
  });
}

function postJson(url, data, referer) {
  return fetch(url, {
    method: "POST",
    headers: Object.assign({}, HEADERS, {
      "Content-Type": "application/x-www-form-urlencoded",
      "Referer": referer || PRIMARY_DOMAIN + "/",
      "X-Requested-With": "XMLHttpRequest"
    }),
    body: buildQueryString(data)
  }).then(function(r) {
    if (!r.ok) throw new Error("HTTP " + r.status + " - " + url);
    return r.json();
  });
}

// ─── Regex Veri Kazıyıcılar (Scrapers) ─────────────────────────────────────────

function extractSlug(html, mediaType) {
  var prefix = mediaType === "movie" ? "/film/" : "/dizi/";
  var re = new RegExp('href=["\']' + prefix + '([^"\'/]+)["\']');
  var m = html.match(re);
  return m ? m[1] : null;
}

function extractEpisodeUrl(html, domain, season, episode) {
  var patterns = [
    new RegExp('href=["\']([^"\']*' + season + '-sezon-' + episode + '-bolum[^"\']*)["\']', 'i'),
    new RegExp('href=["\']([^"\']*season-' + season + '-episode-' + episode + '[^"\']*)["\']', 'i'),
    new RegExp('href=["\']([^"\']*/bolum/[^"\'/]+-' + season + '-sezon-' + episode + '-bolum[^"\']*)["\']', 'i')
  ];
  for (var i = 0; i < patterns.length; i++) {
    var m = html.match(patterns[i]);
    if (m) return m[1].charAt(0) === '/' ? domain + m[1] : m[1];
  }
  return null;
}

// Yeni Eklenen: Sayfadaki gizli cfg player token'ını çıkaran kritik fonksiyon
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

function extractVideoUrl(html, domain) {
  var patterns = [
    /["'](https?:\/\/[^"']+\.(?:mp4|m3u8)[^"']*)["']/i,
    /file\s*:\s*["']([^"']+\.(?:mp4|m3u8)[^"']*)["']/i,
    /src\s*:\s*["']([^"']+\.(?:mp4|m3u8)[^"']*)["']/i,
    /(https?:\/\/[^\s"'<>]+\.(?:mp4|m3u8)[^\s"'<>]*)/i
  ];
  for (var i = 0; i < patterns.length; i++) {
    var m = html.match(patterns[i]);
    if (m) {
      var url = m[1] || m[0];
      if (url && url.indexOf('http') !== 0) {
        url = domain + (url.charAt(0) === '/' ? '' : '/') + url;
      }
      return url;
    }
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
    });
}

// ─── Ana Akış Motoru ───────────────────────────────────────────────────────────

function getStreams(tmdbId, mediaType, season, episode) {
  log("Nuvio İstek Başlattı. Kimlik: " + tmdbId + " | Tip: " + mediaType);

  return Promise.all([getTmdbInfo(tmdbId, mediaType), getActiveDomain()])
    .then(function(initData) {
      var info = initData[0];
      var domain = initData[1];
      log("Canlı Sunucu: " + domain + " üzerinden '" + info.title + "' aranıyor.");

      var searchQuery = info.title || info.origTitle;
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
        return getHtml(contentUrl, domain).then(function(contentHtml) {
          if (mediaType === "tv") {
            var epUrl = extractEpisodeUrl(contentHtml, domain, season, episode);
            if (epUrl) {
              log("Bölüm Sayfası Bulundu: " + epUrl);
              return getHtml(epUrl, contentUrl).then(function(epHtml) {
                return { html: epHtml, contentUrl: epUrl, domain: domain };
              });
            }
          }
          return { html: contentHtml, contentUrl: contentUrl, domain: domain };
        });
      });
    })
    .then(function(result) {
      var html = result.html;
      var contentUrl = result.contentUrl;
      var domain = result.domain;

      // Ağ akışında yakalanan yeni mimari: cfg token'ını sayfadan çekiyoruz
      var cfgToken = extractCfgToken(html);
      log("Yakalanan CFG Hash: " + (cfgToken ? cfgToken : "Bulunamadı"));

      if (!cfgToken) {
        // Fallback: Eğer token yoksa düz video url araması yap
        var directUrl = extractVideoUrl(html, domain);
        if (directUrl) {
          return [{
            name: "Dizipal",
            title: "Dizipal - Doğrudan",
            url: directUrl,
            quality: "1080p",
            type: directUrl.indexOf(".m3u8") !== -1 ? "hls" : "direct",
            headers: { "Referer": contentUrl, "User-Agent": UA }
          }];
        }
        log("Hata: Sayfada ne oyuncu konfigürasyonu ne de doğrudan video linki tespit edilebildi.");
        return [];
      }

      // Ağ akışında doğruladığımız yeni endpoint istek verisi oluşturuluyor
      var ajaxUrl = domain + "/ajax-player-config";
      var postData = { "cfg": cfgToken };

      log("Oyuncu Config İsteği Atılıyor... Endpoint: " + ajaxUrl);
      return postJson(ajaxUrl, postData, contentUrl)
        .then(function(response) {
          if (response && response.success && response.config && response.config.v) {
            var videoUrl = response.config.v;
            log("Başarılı! Gizli Video Linki Çözüldü: " + videoUrl);

            var stream = {
              name: "Dizipal",
              title: "Dizipal - Otomatik Kaynak",
              url: videoUrl,
              quality: "1080p",
              type: (videoUrl.indexOf(".m3u8") !== -1 || videoUrl.indexOf("/hls/") !== -1) ? "hls" : "direct",
              headers: { 
                "Referer": contentUrl, 
                "User-Agent": UA
              },
              audio: "tr",
              subtitles: []
            };

            // Eğer gelen embed linki m3u8 değil de üçüncü taraf iframe ise tipini Nuvio standartlarına uyarla
            if (videoUrl.includes("embed-") || videoUrl.includes("/embed/")) {
              stream.type = "direct"; // Nuvio dış oynatıcı iframe köprüsü
            }

            return [stream];
          }
          return [];
        })
        .catch(function(err) {
          log("POST /ajax-player-config Hatası: " + err.message);
          return [];
        });
    })
    .catch(function(err) {
      log("Akış Döngüsü Hatası: " + err.message);
      return [];
    });
}

// ─── Export Yapısı (Nuvio Core Enjeksiyonu) ────────────────────────────────────

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams: getStreams };
} else {
  var globalScope = (typeof globalThis !== 'undefined') ? globalThis 
                  : (typeof global !== 'undefined') ? global 
                  : (typeof window !== 'undefined') ? window : this;
  globalScope.getStreams = getStreams;
}
