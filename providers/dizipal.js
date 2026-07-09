/**
* Dizipal Provider for Nuvio - Engine Sürümü: 1.0.0
* Log Analizli Canlı Arama Motoru Entegrasyonu ve Derin Altyazı/Dil Çözücü.
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
.replace(/[ğüşıöç]/g, function(c) { return {ğ:'g',ü:'u',ş:'s',ı:'i',ö:'o',ç:'c'}[c] || c; })
.replace(/[^a-z0-9]+/g, '-')
.replace(/^-+|-+$/g, '');
}

// LOG DOĞRULAMASI: Sitenin gerçek arka plan arama motoru
function searchInSite(domain, query) {
  /* ==========================================================================
 *
 * SMART SEARCH ENGINE
 *
 * ========================================================================== */

function normalize(text){

    if(!text) return "";

    return text
        .toLowerCase()
        .replace(/[ğ]/g,"g")
        .replace(/[ü]/g,"u")
        .replace(/[ş]/g,"s")
        .replace(/[ı]/g,"i")
        .replace(/[ö]/g,"o")
        .replace(/[ç]/g,"c")
        .replace(/[^a-z0-9 ]+/g," ")
        .replace(/\s+/g," ")
        .trim();

}

function levenshtein(a,b){

    a=normalize(a);
    b=normalize(b);

    if(a===b)
        return 100;

    const matrix=[];

    for(let i=0;i<=b.length;i++){

        matrix[i]=[i];

    }

    for(let j=0;j<=a.length;j++){

        matrix[0][j]=j;

    }

    for(let i=1;i<=b.length;i++){

        for(let j=1;j<=a.length;j++){

            if(b.charAt(i-1)==a.charAt(j-1)){

                matrix[i][j]=matrix[i-1][j-1];

            }else{

                matrix[i][j]=Math.min(

                    matrix[i-1][j-1]+1,

                    matrix[i][j-1]+1,

                    matrix[i-1][j]+1

                );

            }

        }

    }

    const distance=matrix[b.length][a.length];

    return (

        (

            Math.max(a.length,b.length)-distance

        )

        /

        Math.max(a.length,b.length)

    )*100;

}

function tokenScore(a,b){

    const ta=normalize(a).split(" ");

    const tb=normalize(b).split(" ");

    let ok=0;

    ta.forEach(function(x){

        if(tb.includes(x))
            ok++;

    });

    return (

        ok/

        Math.max(ta.length,tb.length)

    )*100;

}

function calculateScore(query,item){

    let score=0;

    score+=levenshtein(

        query,

        item.title||""

    )*0.65;

    score+=tokenScore(

        query,

        item.title||""

    )*0.35;

    return score;

}

function sortSearchResults(query,results){

    if(!results)
        return [];

    results.forEach(function(r){

        r.__score=

            calculateScore(

                query,

                r

            );

    });

    results.sort(function(a,b){

        return b.__score-a.__score;

    });

    log(

        "En iyi eşleşme : "

        +(results[0]?

            results[0].title

            :"Yok"

        )

    );

    return results;

}
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
.then(function(r) { 
if (!r.ok) throw new Error("Arama isteği başarısız");
return r.json(); 
})
.catch(function() { return null; });
}

// LOG DOĞRULAMASI: Embed player'ların (cortinae/imagestoo) içindeki m3u8 ve altyazıları ayıklar
function parseEmbedPlayer(embedUrl, domainReferer) {
return fetch(embedUrl, {
headers: { "User-Agent": UA, "Referer": domainReferer }
})
.then(function(res) { return res.text(); })
.then(function(html) {
var streams = [];
var subtitles = [];

// Altyazı taraması (tracks bloğu)
var tracksMatch = html.match(/tracks\s*:\s*(\[[^\]]+\])/);
if (tracksMatch) {
try {
var parsedTracks = JSON.parse(tracksMatch[1].replace(/'/g, '"'));
parsedTracks.forEach(function(track) {
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

// Video akış dosyası taraması (.m3u8 veya .mp4)
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

// ─── ANA MOTOR TETİKLEYİCİSİ ─────────────────────────────────────────────────
function getStreams(tmdbId, mediaType, season, episode) {
log("İçerik arama süreci başlatıldı. TMDB ID: " + tmdbId);

return Promise.all([
fetch("https://api.themoviedb.org/3/" + (mediaType === "movie" ? "movie" : "tv") + "/" + tmdbId + "?api_key=" + TMDB_KEY + "&language=tr-TR").then(function(r){ return r.json(); }),
getActiveDomain()
])
.then(function(results) {
var tmdbData = results[0];
var domain = results[1];

var primaryTitle = tmdbData.name || tmdbData.title || "";
var originalTitle = tmdbData.original_name || tmdbData.original_title || "";

log("Arama kelimesi gönderiliyor: " + primaryTitle);

// Önce sitenin canlı arama motorunda aratıyoruz
return searchInSite(domain, primaryTitle).then(function(searchResponse) {
var slug = null;

if (searchResponse && searchResponse.success && searchResponse.results && searchResponse.results.length > 0) {
        var matchedUrl = searchResponse.results[0].url; 
        searchResponse.results=

sortSearchResults(

    primaryTitle,

    searchResponse.results

);

var matchedUrl=

searchResponse.results[0].url; 
slug = matchedUrl.substring(matchedUrl.lastIndexOf('/') + 1);
log("Sitenin arama motorundan eşleşen slug alındı: " + slug);
}

// Eğer arama motoru bulamazsa, orijinal İngilizce adıyla bir kez daha aramayı dene
if (!slug && originalTitle && originalTitle !== primaryTitle) {
log("İkinci ar deneniyor (Orijinal Ad): " + originalTitle);
return searchInSite(domain, originalTitle).then(function(bResponse) {
if (bResponse && bResponse.success && bResponse.results && bResponse.results.length > 0) {
            var bUrl = bResponse.results[0].url;
            bResponse.results=

sortSearchResults(

    originalTitle,

    bResponse.results

);

var bUrl=

bResponse.results[0].url;
slug = bUrl.substring(bUrl.lastIndexOf('/') + 1);
}
return { slug: slug, domain: domain, title: primaryTitle };
});
}

return { slug: slug, domain: domain, title: primaryTitle };
});
})
.then(function(searchResult) {
var slug = searchResult.slug;
var domain = searchResult.domain;
var title = searchResult.title;

// Eğer arama motoru iki denemede de hiçbir şey bulamazsa, son çare akıllı tahmine düş
if (!slug) {
slug = cleanSlug(title);
log("Arama motoru yanıt vermedi, tahmini slug deneniyor: " + slug);
}

var targetPageUrl = "";
if (mediaType === "movie") {
targetPageUrl = domain + "/film/" + slug;
} else {
// LOG VERİSİ: Bölüm sayfaları doğrudan bu şemayla çalışıyor
targetPageUrl = domain + "/bolum/" + slug + "-" + parseInt(season, 10) + "-sezon-" + parseInt(episode, 10) + "-bolum";
}

log("İçerik sayfasına gidiliyor: " + targetPageUrl);
return fetch(targetPageUrl, { headers: { "User-Agent": UA, "Referer": domain + "/" } })
.then(function(r) { 
if(!r.ok) throw new Error("Sayfa yüklenemedi, akış yok."); 
return r.text(); 
})
.then(function(html) {
var csrfTokenMatch = html.match(/csrf_token\s*=\s*["']([^"']+)["']/i);
var csrfToken = csrfTokenMatch ? csrfTokenMatch[1] : null;

// Sayfa kaynağındaki tüm oyuncu konfigürasyonlarını (Dublaj/Altyazı sekmelerini) topla
var cfgRegex = /data-cfg\s*=\s*["']([^"']+)["']/g;
var cfgs = [];
var match;
while ((match = cfgRegex.exec(html)) !== null) { cfgs.push(match[1]); }

if (cfgs.length === 0) {
var singleCfg = html.match(/cfg\s*=\s*["']([^"']+)["']/i);
if (singleCfg) cfgs.push(singleCfg[1]);
}

if (cfgs.length === 0) {
log("Hata: Sayfada geçerli video konfigürasyonu bulunamadı.");
return [];
}

// Bulunan her dil/alternatif seçeneği için paralel istekleri başlat
var promises = cfgs.map(function(cfgValue, index) {
var postData = { "cfg": cfgValue };
if (csrfToken) postData["csrf_token"] = csrfToken;

return fetch(domain + "/ajax-player-config", {
method: "POST",
headers: {
"User-Agent": UA,
"Content-Type": "application/x-www-form-urlencoded",
"X-Requested-With": "XMLHttpRequest",
"Referer": targetPageUrl
},
body: buildQueryString(postData)
})
.then(function(res) { return res.json(); })
.then(function(resJson) {
if (resJson && resJson.success && resJson.config && resJson.config.v) {
var embedUrl = resJson.config.v;

// Varsayılan etiket tanımla
var sourceLabel = (index === 0) ? "Türkçe Altyazı / Orijinal" : "Alternatif Seçenek " + (index + 1);

// Sayfa kaynağından ilgili cfg'nin dil etiketini kazı (Örn: Türkçe Dublaj)
if (html.includes(cfgValue)) {
var partition = html.split(cfgValue)[0];
var labelMatch = partition.match(/data-label\s*=\s*["']([^"']+)["']/i);
if (labelMatch) sourceLabel = labelMatch[1];
}

// Embed (Oynatıcı) içine sızıp asıl m3u8 akışını ve dil/altyazı listesini çek
return parseEmbedPlayer(embedUrl, domain).then(function(mediaStreams) {
if (mediaStreams.length > 0) {
return {
name: "Dizipal - " + sourceLabel,
title: title + " (" + sourceLabel + ")",
url: mediaStreams[0].fileUrl,
quality: "1080p",
type: "direct",
subtitles: mediaStreams[0].subtitles, // Nuvio altyazı menüsüne gömülür
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
log("Akış Hatası: " + err.message);
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
