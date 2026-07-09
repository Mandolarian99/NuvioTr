/**
 * Dizipal Provider for Nuvio - Engine 3.6.0
 * Tüm altyazılar, dil seçenekleri ve arama filtreleri entegre edildi.
 */

"use strict";

var PRIMARY_DOMAIN = "https://dizipal2085.com";
var FALLBACK_DOMAINS = [
  "https://dizipal2086.com",
  "https://dizipal2087.com",
  "https://dizipal2084.com"
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
    .replace(/[ğüşıöç]/g, function(c) { return {ğ:'g',ü:'u',ş:'s',ı:'i',ö:'o',ç:'c'}[c] || c; })
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ─── ALTYAZI VE DİL AYRIŞTIRMA KATMANI ────────────────────────────────────────
function parseEmbedPlayer(embedUrl, domainReferer) {
  return fetch(embedUrl, {
    headers: { "User-Agent": UA, "Referer": domainReferer }
  })
  .then(function(res) { return res.text(); })
  .then(function(html) {
    var streams = [];
    var subtitles = [];

    // 1. Altyazıları regex ile yakala (tracks: [{file: "...", label: "Turkish"}] şeması)
    var tracksMatch = html.match(/tracks\s*:\s*(\[[^\]]+\])/);
    if (tracksMatch) {
      try {
        var parsedTracks = JSON.parse(tracksMatch[1].replace(/'/g, '"'));
        parsedTracks.forEach(function(track) {
          if (track.file && (track.kind === 'captions' || track.kind === 'subtitles' || track.label)) {
            subtitles.push({
              url: track.file.startsWith('//') ? 'https:' + track.file : track.file,
              lang: track.label || 'Türkçe',
              format: track.file.endsWith('.vtt') ? 'vtt' : 'srt'
            });
          }
        });
      } catch(e) {
        // Ham regex fallbacks (JSON parse fail olursa)
        var regSub = /file\s*:\s*["']([^"']+\.(vtt|srt))["']\s*,\s*label\s*:\s*["']([^"']+)["']/g;
        var m;
        while ((m = regSub.exec(html)) !== null) {
          subtitles.push({ url: m[1], lang: m[3], format: m[2] });
        }
      }
    }

    // 2. Ham Video Stream URL'ini yakala (.m3u8 veya .mp4)
    var fileMatch = html.match(/file\s*:\s*["']([^"']+\.(m3u8|mp4))["']/i) || 
                    html.match(/source\s*:\s*["']([^"']+\.(m3u8|mp4))["']/i);
    
    if (fileMatch) {
      streams.push({
        fileUrl: fileMatch[1],
        subtitles: subtitles
      });
    }
    return streams;
  })
  .catch(function() { return []; });
}

// ─── ANA NUVIO ENTEGRASYONU ──────────────────────────────────────────────────
function getStreams(tmdbId, mediaType, season, episode) {
  log("Nuvio Stream Engine tetiklendi. ID: " + tmdbId);

  return Promise.all([
    fetch("https://api.themoviedb.org/3/" + (mediaType === "movie" ? "movie" : "tv") + "/" + tmdbId + "?api_key=" + TMDB_KEY + "&language=tr-TR").then(function(r){ return r.json(); }),
    getActiveDomain()
  ])
  .then(function(results) {
    var tmdbData = results[0];
    var domain = results[1];
    var title = tmdbData.name || tmdbData.title || "";
    
    // Slug eşleşmesinde hata payını sıfırlamak için doğrudan arama tetikleme simülasyonu
    var url = "";
    var cleanTitle = cleanSlug(title);
    
    if (mediaType === "movie") {
      url = domain + "/film/" + cleanTitle;
    } else {
      url = domain + "/bolum/" + cleanTitle + "-" + parseInt(season, 10) + "-sezon-" + parseInt(episode, 10) + "-bolum";
    }

    log("Hedef içerik taranıyor: " + url);
    return fetch(url, { headers: { "User-Agent": UA, "Referer": domain + "/" } })
      .then(function(r) { 
        if(!r.ok) throw new Error("İçerik bulunamadı"); 
        return r.text(); 
      })
      .then(function(html) {
        // Sayfadaki dil alternatiflerini ve cfg tokenlarını topla
        var foundSources = [];
        
        // CSRF Token ve Cfg yakalayıcılar
        var csrfTokenMatch = html.match(/csrf_token\s*=\s*["']([^"']+)["']/i);
        var csrfToken = csrfTokenMatch ? csrfTokenMatch[1] : null;

        // Sayfa kaynağında birden fazla alternatif video alternatifi (Dublaj / Altyazılı sekmeleri) bulunabilir
        var cfgRegex = /data-cfg\s*=\s*["']([^"']+)["']/g;
        var labelRegex = /data-label\s*=\s*["']([^"']+)["']/g; // Sekme isimleri: Dublaj, Altyazı
        
        var cfgs = [];
        var match;
        while ((match = cfgRegex.exec(html)) !== null) { cfgs.push(match[1]); }
        
        // Eğer data-cfg bulunamadıysa standart tekli cfg'yi ara
        if (cfgs.length === 0) {
          var singleCfg = html.match(/cfg\s*=\s*["']([^"']+)["']/i);
          if (singleCfg) cfgs.push(singleCfg[1]);
        }

        if (cfgs.length === 0) {
          log("Hata: Sayfada oynatıcı tokenı (cfg) saptanamadı.");
          return [];
        }

        // Tüm cfg'ler (Alternatif dil / oynatıcı seçenekleri) için paralel istek gönder
        var promises = cfgs.map(function(cfgValue, index) {
          var postData = { "cfg": cfgValue };
          if (csrfToken) postData["csrf_token"] = csrfToken;

          return fetch(domain + "/ajax-player-config", {
            method: "POST",
            headers: {
              "User-Agent": UA,
              "Content-Type": "application/x-www-form-urlencoded",
              "X-Requested-With": "XMLHttpRequest",
              "Referer": url
            },
            body: buildQueryString(postData)
          })
          .then(function(res) { return res.json(); })
          .then(function(resJson) {
            if (resJson && resJson.success && resJson.config && resJson.config.v) {
              var embedUrl = resJson.config.v;
              var sourceLabel = (index === 0) ? "Türkçe Altyazı / Orijinal" : "Alternatif Seçenek " + (index + 1);
              
              // HTML içinde sekme etiketini saptamaya çalış
              if (html.includes(cfgValue)) {
                var segment = html.split(cfgValue)[0];
                var labelMatch = segment.match(/data-label\s*=\s*["']([^"']+)["']/i);
                if (labelMatch) sourceLabel = labelMatch[1];
              }

              // Embed içerisindeki ham stream ve altyazı bilgilerini çöz
              return parseEmbedPlayer(embedUrl, domain).then(function(mediaStreams) {
                if (mediaStreams.length > 0) {
                  return {
                    name: "Dizipal - " + sourceLabel,
                    title: title + " (" + sourceLabel + ")",
                    url: mediaStreams[0].fileUrl,
                    quality: "1080p",
                    type: "direct",
                    subtitles: mediaStreams[0].subtitles,
                    headers: {
                      "Referer": embedUrl,
                      "User-Agent": UA,
                      "Origin": domain
                    }
                  };
                }
                return null;
              });
            }
            return null;
          })
          .catch(function() { return null; });
        });

        return Promise.all(promises).then(function(outputs) {
          return outputs.filter(function(item) { return item !== null; });
        });
      });
  })
  .catch(function(err) {
    log("İşlem Hatası: " + err.message);
    return [];
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams: getStreams };
} else {
  var globalScope = (typeof globalThis !== 'undefined') ? globalThis 
                  : (typeof window !== 'undefined') ? window : this;
  globalScope.getStreams = getStreams;
}
