/**
 * Dizipal Provider for Nuvio
 * Dizipal2084.com üzerinden Türkçe film ve dizi stream sağlar.
 * Tüm dublaj ve altyazı seçeneklerini destekler.
 * Versiyon: 2.0.0
 * Tarih: 08.07.2026
 */

"use strict";

// ─── Sabitler ──────────────────────────────────────────────────────────────────

var BASE_URL  = "https://dizipal2084.com";
var AJAX_VIEW = BASE_URL + "/ajax-view";
var AJAX_PLAYER = BASE_URL + "/ajax-player-config";
var TMDB_KEY  = "500330721680edb6d5f7f12ba7cd9023";
var UA        = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36";

var HEADERS = {
  "User-Agent": UA,
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8",
  "Referer": BASE_URL + "/"
};

// ─── Dil ve Altyazı Tanımları ──────────────────────────────────────────────────

var STREAM_TYPES = {
  "trdub": {
    id: "trdub",
    label: "Türkçe Dublaj",
    audio: "tr",
    subtitles: [],
    flag: "trdub"
  },
  "trsub": {
    id: "trsub", 
    label: "Türkçe Altyazı",
    audio: "en",
    subtitles: ["tr"],
    flag: "trsub"
  },
  "ensub": {
    id: "ensub",
    label: "İngilizce Altyazı",
    audio: "en",
    subtitles: ["en"],
    flag: "ensub"
  },
  "en": {
    id: "en",
    label: "İngilizce",
    audio: "en",
    subtitles: [],
    flag: "en"
  },
  "tr": {
    id: "tr",
    label: "Türkçe",
    audio: "tr",
    subtitles: [],
    flag: "tr"
  }
};

// ─── Yardımcı Fonksiyonlar ─────────────────────────────────────────────────────

function log(msg) {
  console.log("[Dizipal] " + msg);
}

function getHtml(url, referer) {
  return fetch(url, {
    headers: Object.assign({}, HEADERS, { "Referer": referer || BASE_URL + "/" })
  }).then(function(r) {
    if (!r.ok) throw new Error("HTTP " + r.status + " - " + url);
    return r.text();
  });
}

function postJson(url, data, referer) {
  return fetch(url, {
    method: "POST",
    headers: Object.assign({}, HEADERS, {
      "Content-Type": "application/x-www-form-urlencoded",
      "Referer": referer || BASE_URL + "/",
      "X-Requested-With": "XMLHttpRequest"
    }),
    body: new URLSearchParams(data).toString()
  }).then(function(r) {
    if (!r.ok) throw new Error("HTTP " + r.status + " - " + url);
    return r.json();
  });
}

// ─── CSRF Token ─────────────────────────────────────────────────────────────────

function getCsrfToken(html) {
  var m = html.match(/csrf_token["']?\s*:\s*["']([^"']+)["']/i)
      || html.match(/name=["']csrf_token["']\s+value=["']([^"']+)["']/i)
      || html.match(/data-csrf=["']([^"']+)["']/i);
  return m ? m[1] : null;
}

// ─── Dil Seçeneklerini Çıkarma ────────────────────────────────────────────────

function extractLanguageOptions(html) {
  var options = [];
  var seen = {};

  // 1. dzn-flag sınıfından dil seçeneklerini çıkar
  var flagRe = /dzn-flag\s+(trdub|trsub|ensub|tr|en)/gi;
  var m;
  while ((m = flagRe.exec(html)) !== null) {
    var type = m[1];
    if (!seen[type]) {
      seen[type] = true;
      options.push({
        type: type,
        url: null
      });
    }
  }

  // 2. Player tabs içinden dil seçeneklerini çıkar
  var tabsRe = /id="dznPlayerTabs"[^>]*>([\s\S]*?)<\/div>/i;
  var tabsMatch = html.match(tabsRe);
  if (tabsMatch) {
    var tabRe = /href="([^"]+)"[^>]*>[\s\S]*?dzn-flag\s+(trdub|trsub|ensub|tr|en)/gi;
    while ((m = tabRe.exec(tabsMatch[1])) !== null) {
      var type2 = m[2];
      if (!seen[type2]) {
        seen[type2] = true;
        options.push({
          type: type2,
          url: m[1]
        });
      } else {
        // Mevcut seçeneğin URL'ini güncelle
        for (var i = 0; i < options.length; i++) {
          if (options[i].type === type2 && !options[i].url) {
            options[i].url = m[1];
            break;
          }
        }
      }
    }
  }

  // 3. Hiç seçenek yoksa varsayılanları ekle
  if (options.length === 0) {
    options = [
      { type: "trsub", url: null },
      { type: "trdub", url: null },
      { type: "ensub", url: null }
    ];
  }

  log("Dil seçenekleri: " + options.map(function(o) { return o.type; }).join(", "));
  return options;
}

// ─── TMDB ─────────────────────────────────────────────────────────────────────

function getTmdbInfo(tmdbId, mediaType) {
  var ep = mediaType === "movie" ? "movie" : "tv";
  return fetch("https://api.themoviedb.org/3/" + ep + "/" + tmdbId +
    "?api_key=" + TMDB_KEY + "&language=tr-TR")
    .then(function(r) { return r.json(); })
    .then(function(d) {
      return {
        title:     (d.name || d.title || "").trim(),
        origTitle: (d.original_name || d.original_title || "").trim(),
        id:        tmdbId,
        year:      (d.release_date || d.first_air_date || "").slice(0, 4)
      };
    });
}

// ─── URL Oluşturma ─────────────────────────────────────────────────────────────

function buildSearchUrl(query) {
  return BASE_URL + "/ara?q=" + encodeURIComponent(query);
}

function buildContentUrl(slug, mediaType, season, episode) {
  if (mediaType === "movie") {
    return BASE_URL + "/film/" + slug;
  }
  return BASE_URL + "/dizi/" + slug;
}

// ─── Slug Çıkarma ────────────────────────────────────────────────────────────

function extractSlug(html, mediaType) {
  var prefix = mediaType === "movie" ? "/film/" : "/dizi/";
  var re = new RegExp('href=["\']' + prefix + '([^"\'/]+)["\']');
  var m = html.match(re);
  return m ? m[1] : null;
}

function extractEpisodeUrl(html, season, episode) {
  var patterns = [
    new RegExp('href=["\']([^"\']*' + season + '-sezon-' + episode + '-bolum[^"\']*)["\']', 'i'),
    new RegExp('href=["\']([^"\']*season-' + season + '-episode-' + episode + '[^"\']*)["\']', 'i')
  ];
  for (var i = 0; i < patterns.length; i++) {
    var m = html.match(patterns[i]);
    if (m) return m[1].charAt(0) === '/' ? BASE_URL + m[1] : m[1];
  }
  return null;
}

// ─── Video URL Çıkarma ────────────────────────────────────────────────────────

function extractVideoUrl(html) {
  var patterns = [
    /https?:\/\/[^\s"'<>]+\.(?:mp4|m3u8)(?:[^\s"'<>]*)/gi,
    /["'](https?:\/\/[^"']+\.(?:mp4|m3u8)[^"']*)["']/gi,
    /file\s*:\s*["']([^"']+\.(?:mp4|m3u8)[^"']*)["']/gi,
    /src\s*:\s*["']([^"']+\.(?:mp4|m3u8)[^"']*)["']/gi
  ];
  
  for (var i = 0; i < patterns.length; i++) {
    var m = html.match(patterns[i]);
    if (m) {
      var url = m[1] || m[0];
      if (url && url.indexOf('http') !== 0) {
        url = BASE_URL + (url.charAt(0) === '/' ? '' : '/') + url;
      }
      return url;
    }
  }
  return null;
}

function extractContentId(html) {
  var patterns = [
    /data-id=["']([^"']+)["']/i,
    /content_id["']?\s*:\s*["']([^"']+)["']/i,
    /id=["']content-([^"']+)["']/i,
    /post_id["']?\s*:\s*["']([^"']+)["']/i
  ];
  for (var i = 0; i < patterns.length; i++) {
    var m = html.match(patterns[i]);
    if (m) return m[1];
  }
  return null;
}

// ─── Ana İşlev ────────────────────────────────────────────────────────────────

function getStreams(tmdbId, mediaType, season, episode) {
  log("Başlatılıyor: " + tmdbId + " | " + mediaType + (mediaType === "tv" ? " S" + season + "E" + episode : ""));

  var infoP = getTmdbInfo(tmdbId, mediaType);

  return infoP.then(function(info) {
    log("TMDB: " + info.title + " / " + info.origTitle);
    
    // 1. Arama sayfasına git
    var searchQuery = info.title || info.origTitle;
    return getHtml(buildSearchUrl(searchQuery))
      .then(function(searchHtml) {
        var slug = extractSlug(searchHtml, mediaType);
        if (!slug) {
          slug = info.title.toLowerCase()
            .replace(/[ğüşıöç]/g, function(c) { 
              return {ğ:'g',ü:'u',ş:'s',ı:'i',ö:'o',ç:'c'}[c] || c; 
            })
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
        }
        log("Slug: " + slug);

        var contentUrl = buildContentUrl(slug, mediaType, season, episode);
        return getHtml(contentUrl)
          .then(function(contentHtml) {
            if (mediaType === "tv") {
              var epUrl = extractEpisodeUrl(contentHtml, season, episode);
              if (epUrl) {
                log("Bölüm URL: " + epUrl);
                return getHtml(epUrl).then(function(epHtml) {
                  return { html: epHtml, contentUrl: epUrl };
                });
              }
            }
            return { html: contentHtml, contentUrl: contentUrl };
          });
      });
  })
  .then(function(result) {
    var html = result.html;
    var contentUrl = result.contentUrl;
    
    // 2. Dil seçeneklerini çıkar
    var langOptions = extractLanguageOptions(html);
    
    // 3. CSRF Token ve Content ID
    var csrfToken = getCsrfToken(html);
    var contentId = extractContentId(html);
    
    log("CSRF Token: " + (csrfToken ? csrfToken.substring(0, 16) + "..." : "Bulunamadı"));
    log("Content ID: " + (contentId || "Bulunamadı"));

    if (!csrfToken || !contentId) {
      var directUrl = extractVideoUrl(html);
      if (directUrl) {
        log("Doğrudan video URL bulundu: " + directUrl);
        return [{
          name: "Dizipal",
          title: "Dizipal",
          url: directUrl,
          quality: "1080p",
          headers: { "Referer": contentUrl, "User-Agent": UA }
        }];
      }
      log("Gerekli bilgiler alınamadı");
      return [];
    }

    // 4. Her dil seçeneği için stream al
    var promises = langOptions.map(function(langOption) {
      var langType = langOption.type;
      var langUrl = langOption.url;
      
      // Stream tipi tanımını al
      var streamDef = STREAM_TYPES[langType] || STREAM_TYPES["trsub"];
      
      var langPromise;
      if (langUrl) {
        langPromise = getHtml(langUrl, contentUrl).then(function(langHtml) {
          return { html: langHtml, url: langUrl };
        });
      } else {
        langPromise = Promise.resolve({ html: html, url: contentUrl });
      }
      
      return langPromise.then(function(langResult) {
        var langHtml = langResult.html;
        var langContentId = extractContentId(langHtml) || contentId;
        var langCsrf = getCsrfToken(langHtml) || csrfToken;
        
        var viewData = {
          "csrf_token": langCsrf,
          "id": langContentId,
          "type": mediaType === "movie" ? "movie" : "episode"
        };
        
        // Dil bilgisini ekle
        if (langType) {
          viewData.lang = langType;
        }
        
        log("Dil seçeneği için AJAX: " + streamDef.label + " | ID: " + langContentId);
        
        return postJson(AJAX_VIEW, viewData, langResult.url || contentUrl)
          .then(function(viewResponse) {
            var responseStr = JSON.stringify(viewResponse);
            var videoUrl = extractVideoUrl(responseStr);
            
            if (!videoUrl) {
              videoUrl = extractVideoUrl(JSON.stringify(viewResponse));
            }
            
            if (videoUrl) {
              // Nuvio için standart stream formatı
              var stream = {
                name: "Dizipal",
                title: "Dizipal - " + streamDef.label,
                url: videoUrl,
                quality: "1080p",
                headers: { 
                  "Referer": contentUrl, 
                  "User-Agent": UA 
                },
                // Nuvio'nun dil ve altyazı formatları
                audio: streamDef.audio || "tr",
                subtitles: streamDef.subtitles || [],
                // Meta bilgiler
                _meta: {
                  language: langType,
                  label: streamDef.label,
                  audioLanguage: streamDef.audio || "tr",
                  subtitleLanguages: streamDef.subtitles || []
                }
              };
              
              // Eğer video URL'si m3u8 ise type belirt
              if (videoUrl.indexOf('.m3u8') !== -1 || videoUrl.indexOf('/hls/') !== -1) {
                stream.type = "hls";
              } else if (videoUrl.indexOf('.mp4') !== -1) {
                stream.type = "direct";
              }
              
              return stream;
            }
            return null;
          });
      });
    });

    // 5. Tüm sonuçları topla
    return Promise.all(promises).then(function(streams) {
      var validStreams = streams.filter(Boolean);
      
      // Benzersiz URL'leri filtrele
      var seenUrls = {};
      var uniqueStreams = validStreams.filter(function(stream) {
        var key = stream.url + "|" + (stream.audio || "") + "|" + (stream.subtitles || []).join(",");
        if (seenUrls[key]) return false;
        seenUrls[key] = true;
        return true;
      });
      
      log(uniqueStreams.length + " stream bulundu (dil seçenekleriyle)");
      return uniqueStreams;
    });
  })
  .catch(function(err) {
    log("HATA: " + err.message);
    return [];
  });
}

// ─── Export ────────────────────────────────────────────────────────────────────

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams: getStreams };
} else {
  global.getStreams = getStreams;
}
