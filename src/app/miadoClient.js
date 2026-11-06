export function initMiadoClient() {
    (() => {
      // Migração de schema para zerar contas antigas pré-carregadas e garantir experiência real de primeiro acesso com Welcome Screen
      const CURRENT_SCHEMA_VERSION = "v12_welcome_infinite_clean";
      try {
        if (localStorage.getItem("miado_schema_version") !== CURRENT_SCHEMA_VERSION) {
          [
            "miado_user_v5",
            "miado_playlists_v5",
            "miado_recent_history_50",
            "miado_followed_artists_v1",
            "miado_real_friends_v1",
            "miado_feed_posts_v6",
            "miado_user_onboarded_v1",
            "miado_active_session_v1",
            "miado_auth_token",
            "miado_user_uid"
          ].forEach(k => localStorage.removeItem(k));
          sessionStorage.removeItem("miado_guest_accepted");
          localStorage.setItem("miado_schema_version", CURRENT_SCHEMA_VERSION);
        }
      } catch (_e) {}

      const DEFAULT_LEGACY_PLAYLIST_IDS = new Set([
        "pl_comunidade_pop",
        "pl_gaga_jao_mix",
        "pl_noite_liquid"
      ]);

      function sanitizeCleanHandle(rawInput, fallbackName = "") {
        const candidate = String(rawInput || "").trim();
        const isPlaceholder = !candidate || candidate === "@novo_usuario" || candidate === "@visitante" || candidate === "@miadinho" || candidate === "@seu_user";
        const source = (!isPlaceholder ? candidate : String(fallbackName || "").trim()) || "ouvinte";
        const slug = source
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/^@+/, "")
          .replace(/[^a-z0-9_.]/g, "_")
          .replace(/_+/g, "_")
          .replace(/^[_.]|[_.]+$/g, "")
          .slice(0, 26);
        return `@${slug || "ouvinte"}`;
      }

      /**
       * 1. GALERIA DE AVATARES DE PERFIL
       */
      function buildCuteCatSvg({ bg, fur, earInner, eyeColor, noseColor }) {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 100 100">
          <rect width="100" height="100" rx="50" fill="${bg || "#130f22"}"/>
          <polygon points="22,48 24,18 44,34" fill="${fur || "#1e1836"}" stroke="#ffffff" stroke-width="2"/>
          <polygon points="78,48 76,18 56,34" fill="${fur || "#1e1836"}" stroke="#ffffff" stroke-width="2"/>
          <ellipse cx="50" cy="56" rx="30" ry="26" fill="${fur || "#1e1836"}" stroke="#ffffff" stroke-width="2"/>
          <circle cx="37" cy="52" r="5.6" fill="${eyeColor || "#a855f7"}"/>
          <circle cx="63" cy="52" r="5.6" fill="${eyeColor || "#a855f7"}"/>
          <polygon points="47,58 53,58 50,62" fill="${noseColor || "#f472b6"}"/>
        </svg>`;
        return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
      }

      const CAT_AVATAR_PRESETS = [
        { id: "cat_1", name: "Gatinho Tigrado", url: "/api/cat-avatar?id=cat_1" },
        { id: "cat_2", name: "Gatinho Curioso", url: "/api/cat-avatar?id=cat_2" },
        { id: "cat_3", name: "Gatinho Branco", url: "/api/cat-avatar?id=cat_3" },
        { id: "cat_4", name: "Gatinho Laranja", url: "/api/cat-avatar?id=cat_4" },
        { id: "cat_5", name: "Gatinho Olhos Verdes", url: "/api/cat-avatar?id=cat_5" },
        { id: "cat_6", name: "Gatinho Fofinho", url: "/api/cat-avatar?id=cat_6" },
        { id: "cat_7", name: "Gatinho Cinza", url: "/api/cat-avatar?id=cat_7" },
        { id: "cat_8", name: "Gatinho Siamês", url: "/api/cat-avatar?id=cat_8" },
        { id: "cat_9", name: "Gatinho Sonolento", url: "/api/cat-avatar?id=cat_9" },
        { id: "cat_10", name: "Gatinho Peludo", url: "/api/cat-avatar?id=cat_10" }
      ];

      function createSolidAlbumSvg(title = "Miado", artist = "") {
        const safeT = String(title || "Miado").slice(0, 18).replace(/[<>&"']/g, "");
        const safeA = String(artist || "").slice(0, 22).replace(/[<>&"']/g, "");
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">
          <rect width="600" height="600" fill="#130f22"/>
          <rect x="28" y="28" width="544" height="544" rx="24" fill="#07060b" stroke="#8b5cf6" stroke-width="2"/>
          <circle cx="300" cy="245" r="84" fill="#130f22" stroke="#a855f7" stroke-width="4"/>
          <circle cx="300" cy="245" r="24" fill="#8b5cf6"/>
          <text x="300" y="420" text-anchor="middle" fill="#ffffff" font-family="sans-serif" font-size="32" font-weight="bold">${safeT}</text>
          <text x="300" y="462" text-anchor="middle" fill="#94a3b8" font-family="sans-serif" font-size="22">${safeA}</text>
        </svg>`;
        return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
      }

      function createSolidArtistSvg(artistName = "Artista") {
        const clean = String(artistName || "Artista").trim();
        const initials = clean
          .split(/\s+/)
          .slice(0, 2)
          .map(w => w[0]?.toUpperCase() || "")
          .join("") || "A";
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">
          <defs>
            <radialGradient id="artGrad" cx="50%" cy="30%" r="70%">
              <stop offset="0%" stop-color="#3b1d6e"/>
              <stop offset="60%" stop-color="#190e32"/>
              <stop offset="100%" stop-color="#0a0614"/>
            </radialGradient>
          </defs>
          <rect width="600" height="600" rx="300" fill="url(#artGrad)"/>
          <circle cx="300" cy="300" r="290" fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="3"/>
          <text x="300" y="348" text-anchor="middle" fill="#ffffff" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="160" font-weight="800" letter-spacing="-2">${initials}</text>
        </svg>`;
        return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
      }

      window.handleImgError = function(imgEl, title, artist) {
        if (!imgEl) return;
        const safeTitle = String(title || imgEl.getAttribute("alt") || imgEl.dataset.title || "Miado").trim();
        const safeArtist = String(artist || imgEl.dataset.artist || "").trim();

        // 1. Trata imagem de Artista (NUNCA exibe disco de vinil com furo no meio)
        const isArtist = safeArtist === "Artista" || imgEl.classList.contains("artist-bubble-img") || imgEl.classList.contains("artist-avatar-img") || imgEl.hasAttribute("data-artist-bubble-img");
        if (isArtist) {
          if (!imgEl.dataset.retriedArtist && safeTitle) {
            imgEl.dataset.retriedArtist = "1";
            imgEl.onerror = function() {
              this.onerror = null;
              this.src = createSolidArtistSvg(safeTitle);
              this.classList.add("loaded");
              if (this.parentElement) this.parentElement.classList.remove("shimmer");
            };
            imgEl.onload = function() {
              this.classList.add("loaded");
              if (this.parentElement) this.parentElement.classList.remove("shimmer");
            };
            imgEl.src = `/api/artist-image?name=${encodeURIComponent(safeTitle)}`;
            return;
          }
          imgEl.onerror = null;
          imgEl.src = createSolidArtistSvg(safeTitle);
          imgEl.classList.add("loaded");
          if (imgEl.parentElement) imgEl.parentElement.classList.remove("shimmer");
          return;
        }

        // 2. Trata capa de Música / Álbum
        if (!imgEl.dataset.retriedCover && safeTitle && safeArtist && safeArtist !== "Playlist") {
          imgEl.dataset.retriedCover = "1";
          imgEl.onerror = function() {
            this.onerror = null;
            this.src = createSolidAlbumSvg(safeTitle, safeArtist);
            this.classList.add("loaded");
            if (this.parentElement) this.parentElement.classList.remove("shimmer");
          };
          imgEl.onload = function() {
            this.classList.add("loaded");
            if (this.parentElement) this.parentElement.classList.remove("shimmer");
          };
          imgEl.src = `/api/cover?title=${encodeURIComponent(safeTitle)}&artist=${encodeURIComponent(safeArtist)}`;
          return;
        }
        imgEl.onerror = null;
        imgEl.src = createSolidAlbumSvg(safeTitle, safeArtist);
        imgEl.classList.add("loaded");
        if (imgEl.parentElement) imgEl.parentElement.classList.remove("shimmer");
      };

      // Verificação e substituição global automática para qualquer imagem com falha
      window.addEventListener("error", function(e) {
        const target = e.target;
        if (target && target.tagName === "IMG") {
          if (target.dataset && target.dataset.errorHandled === "done") return;
          target.dataset.errorHandled = "done";
          if ((target.classList && target.classList.contains("user-pill-avatar")) || target.id === "top-user-avatar" || target.id === "prof-hero-avatar") {
            window.handleCatAvatarError(target);
          } else if (target.classList && (target.classList.contains("artist-bubble-img") || target.classList.contains("artist-avatar-img"))) {
            window.handleImgError(target, target.getAttribute("alt") || target.dataset.title || "Artista", "Artista");
          } else {
            window.handleImgError(target, target.getAttribute("alt") || target.dataset.title || "Miado", target.dataset.artist || "");
          }
        }
      }, true);

      window.handleCatAvatarError = function(imgEl) {
        if (!imgEl) return;
        if (!imgEl.dataset.retriedCat) {
          imgEl.dataset.retriedCat = "1";
          imgEl.src = "/api/cat-avatar?id=cat_1";
          return;
        }
        imgEl.onerror = null;
        imgEl.src = buildCuteCatSvg({});
      };

      function ensureArtistAvatarUrl(art) {
        if (!art) return "/api/artist-image?name=Artista";
        const name = typeof art === "string" ? art : (art.name || "");
        const rawCover = typeof art === "object" ? (art.coverUrl || art.pictureUrl || "") : "";
        if (!rawCover || rawCover.startsWith("data:") || rawCover.includes("dzcdn.net") || rawCover.includes("deezer.com")) {
          return `/api/artist-image?name=${encodeURIComponent(name || "Artista")}&url=${encodeURIComponent(rawCover.startsWith("data:") ? "" : rawCover)}`;
        }
        return rawCover;
      }

      function showToast(message) {
        const toast = document.getElementById("miado-toast");
        if (!toast) return;
        toast.textContent = message;
        toast.classList.add("show");
        clearTimeout(window._miadoToastTimer);
        window._miadoToastTimer = setTimeout(() => toast.classList.remove("show"), 3000);
      }

      function formatDurationMs(ms) {
        if (!ms || isNaN(ms)) return "3:30";
        const totalSec = Math.floor(ms / 1000);
        const m = Math.floor(totalSec / 60);
        const s = totalSec % 60;
        return `${m}:${s < 10 ? "0" : ""}${s}`;
      }

      function upgradeTo1000x1000(artworkUrl) {
        if (!artworkUrl) return "";
        return String(artworkUrl).replace(/100x100bb/g, "1000x1000bb").replace(/60x60bb/g, "1000x1000bb");
      }

      function applySpotifyMarquee(el) {
        if (!el) return;
        el.classList.remove("is-marquee");
        const parent = el.parentElement;
        if (parent) parent.classList.remove("has-overflow");
        el.style.removeProperty("--marquee-distance");
        el.style.removeProperty("--marquee-duration");

        setTimeout(() => {
          if (!el || !el.parentElement) return;
          const containerWidth = el.parentElement.clientWidth;
          const contentWidth = el.scrollWidth;
          if (containerWidth > 0 && contentWidth > containerWidth + 6) {
            const distance = contentWidth - containerWidth + 24;
            const duration = Math.max(7, Math.round(distance / 18));
            el.style.setProperty("--marquee-distance", `-${distance}px`);
            el.style.setProperty("--marquee-duration", `${duration}s`);
            if (el.parentElement) el.parentElement.classList.add("has-overflow");
            el.classList.add("is-marquee");
          }
        }, 50);
      }
      window.applySpotifyMarquee = applySpotifyMarquee;

      window.addEventListener("resize", () => {
        ["fs-track-title", "mobile-track-title", "player-track-name"].forEach(id => {
          applySpotifyMarquee(document.getElementById(id));
        });
      });

      /**
       * Garante que qualquer música individual ou álbum tenha sempre uma capa 1000x1000 HD válida
       * servida via proxy /api/cover (evitando bloqueios de CDN ou URLs quebradas do localStorage)
       */
      function readImageFileAsCompressedDataUrl(file, maxDim = 640, quality = 0.85) {
        return new Promise((resolve, reject) => {
          if (!file) {
            reject(new Error("Nenhum arquivo selecionado"));
            return;
          }
          const reader = new FileReader();
          reader.onerror = () => reject(new Error("Erro ao ler imagem"));
          reader.onload = (ev) => {
            const rawDataUrl = String(ev.target?.result || "");
            if (!rawDataUrl) {
              reject(new Error("Imagem vazia"));
              return;
            }
            const img = new Image();
            img.onload = () => {
              try {
                let w = img.naturalWidth || img.width || maxDim;
                let h = img.naturalHeight || img.height || maxDim;
                if (w > maxDim || h > maxDim) {
                  if (w >= h) {
                    h = Math.round((h * maxDim) / w);
                    w = maxDim;
                  } else {
                    w = Math.round((w * maxDim) / h);
                    h = maxDim;
                  }
                }
                const canvas = document.createElement("canvas");
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext("2d");
                if (!ctx) {
                  resolve(rawDataUrl);
                  return;
                }
                ctx.drawImage(img, 0, 0, w, h);
                const compressed = canvas.toDataURL("image/jpeg", quality);
                resolve(compressed || rawDataUrl);
              } catch (_err) {
                resolve(rawDataUrl);
              }
            };
            img.onerror = () => resolve(rawDataUrl);
            img.src = rawDataUrl;
          };
          reader.readAsDataURL(file);
        });
      }

      function triggerImagePicker(callback) {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/*";
        input.style.position = "fixed";
        input.style.top = "-9999px";
        input.style.left = "-9999px";
        input.style.opacity = "0";
        document.body.appendChild(input);
        input.onchange = async (e) => {
          const file = e.target.files && e.target.files[0];
          if (file) {
            try {
              const dataUrl = await readImageFileAsCompressedDataUrl(file, 640, 0.85);
              if (typeof callback === "function") {
                callback(dataUrl);
              }
            } catch (err) {
              showToast("Não foi possível carregar a imagem selecionada.");
            }
          }
          setTimeout(() => input.remove(), 1000);
        };
        input.click();
      }
      window.triggerImagePicker = triggerImagePicker;

      function ensureTrackCoverUrl(trackOrUrl, fallbackTitle = "", fallbackArtist = "", fallbackAlbumCover = "") {
        let rawUrl = "";
        let title = fallbackTitle;
        let artist = fallbackArtist;
        if (trackOrUrl && typeof trackOrUrl === "object") {
          title = trackOrUrl.title || fallbackTitle || "";
          artist = trackOrUrl.artist || fallbackArtist || "";
          // Prioriza capa exclusiva da própria faixa
          if (trackOrUrl.customCoverUrl && !trackOrUrl.customCoverUrl.startsWith("data:image/svg+xml")) {
            rawUrl = trackOrUrl.customCoverUrl;
          } else if (trackOrUrl.coverUrl) {
            rawUrl = trackOrUrl.coverUrl;
          }
        } else {
          rawUrl = String(trackOrUrl || "").trim();
        }

        // Se a capa da própria faixa for uma foto base64 (upload da galeria):
        // Músicas individuais (com título ou artista, ex: Billie Eilish, Yung Lixo, Sabrina Carpenter)
        // NUNCA devem herdar a foto base64 de upload da playlist. A foto de upload é exclusiva da playlist.
        if (rawUrl && rawUrl.startsWith("data:image/") && !rawUrl.startsWith("data:image/svg+xml")) {
          if (title || artist) {
            rawUrl = "";
          } else {
            return rawUrl;
          }
        }

        // Se já for uma URL proxy do Miado, retorna diretamente para preservar o cache e parâmetros
        if (rawUrl && (rawUrl.startsWith("/api/cover") || rawUrl.startsWith("/api/artist-image") || rawUrl.startsWith("/api/cat-avatar"))) {
          return rawUrl;
        }

        // Ignora URLs de áudio preview do Deezer que não são imagens
        if (rawUrl && rawUrl.includes("cdns-preview")) {
          rawUrl = "";
        }

        // Se a faixa ou álbum já tiver uma URL HTTP válida (incluindo cdn-images.dzcdn.net ou e-cdns-images.dzcdn.net ou mzstatic)
        if (rawUrl && /^https?:\/\//i.test(rawUrl) && !rawUrl.startsWith("data:image/svg")) {
          rawUrl = upgradeTo1000x1000(rawUrl);
          const params = new URLSearchParams();
          if (title) params.set("title", String(title));
          if (artist) params.set("artist", String(artist));
          params.set("url", rawUrl);
          return `/api/cover?${params.toString()}`;
        }

        // Se possui título e artista válidos, busca a capa oficial HD 1000x1000 daquela música ou álbum
        if (title || artist) {
          const params = new URLSearchParams();
          if (title) params.set("title", String(title));
          if (artist) params.set("artist", String(artist));
          return `/api/cover?${params.toString()}`;
        }

        // Fallback apenas para álbuns de estúdio oficiais (nunca fotos base64 de galeria de playlists)
        if (fallbackAlbumCover && !fallbackAlbumCover.startsWith("data:image/svg+xml") && !fallbackAlbumCover.startsWith("data:image/")) {
          return fallbackAlbumCover;
        }

        return createSolidAlbumSvg(title || "Miado", artist || "");
      }

      async function fetchItunesJson(url) {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 3500);
          const res = await fetch(url, { signal: controller.signal });
          clearTimeout(timer);
          if (res.ok) return await res.json();
        } catch (e) {}

        return new Promise((resolve, reject) => {
          const cbName = `__miadoItunesCb_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
          const script = document.createElement("script");
          const timeout = setTimeout(() => {
            cleanup();
            reject(new Error("Timeout iTunes"));
          }, 4500);

          function cleanup() {
            clearTimeout(timeout);
            delete window[cbName];
            if (script.parentNode) script.parentNode.removeChild(script);
          }

          window[cbName] = (data) => {
            cleanup();
            resolve(data);
          };
          script.onerror = () => {
            cleanup();
            reject(new Error("JSONP Error"));
          };
          const sep = url.includes("?") ? "&" : "?";
          script.src = `${url}${sep}callback=${cbName}`;
          document.head.appendChild(script);
        });
      }

      // ------------------------------------------------------------------------
      // 2. CATÁLOGO PRÉ-CARREGADO COM CAPAS 1000x1000 REAIS & FAIXAS PRONTAS
      // ------------------------------------------------------------------------
      const PRELOADED_SEED = {"gaga_chromatica":{"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/5d/4d/f9/5d4df96a-e95e-2fe9-404a-5d570513762d/20UMGIM15390.rgb.jpg/1000x1000bb.jpg","tracks":[{"id":"1500952424","title":"Rain On Me","artist":"Lady Gaga & Ariana Grande","albumTitle":"Chromatica","albumId":"gaga_chromatica","duration":"3:02","genre":"Pop","year":2020,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/5d/4d/f9/5d4df96a-e95e-2fe9-404a-5d570513762d/20UMGIM15390.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":true},{"id":"1500952423","title":"Stupid Love","artist":"Lady Gaga","albumTitle":"Chromatica","albumId":"gaga_chromatica","duration":"3:13","genre":"Pop","year":2020,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/5d/4d/f9/5d4df96a-e95e-2fe9-404a-5d570513762d/20UMGIM15390.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":true},{"id":"1500952435","title":"911","artist":"Lady Gaga","albumTitle":"Chromatica","albumId":"gaga_chromatica","duration":"2:52","genre":"Pop","year":2020,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/5d/4d/f9/5d4df96a-e95e-2fe9-404a-5d570513762d/20UMGIM15390.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":true},{"id":"1500952438","title":"Sour Candy","artist":"Lady Gaga & BLACKPINK","albumTitle":"Chromatica","albumId":"gaga_chromatica","duration":"2:37","genre":"Pop","year":2020,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/5d/4d/f9/5d4df96a-e95e-2fe9-404a-5d570513762d/20UMGIM15390.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":true},{"id":"1500952422","title":"Alice","artist":"Lady Gaga","albumTitle":"Chromatica","albumId":"gaga_chromatica","duration":"2:57","genre":"Pop","year":2020,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/5d/4d/f9/5d4df96a-e95e-2fe9-404a-5d570513762d/20UMGIM15390.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1500952429","title":"Free Woman","artist":"Lady Gaga","albumTitle":"Chromatica","albumId":"gaga_chromatica","duration":"3:11","genre":"Pop","year":2020,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/5d/4d/f9/5d4df96a-e95e-2fe9-404a-5d570513762d/20UMGIM15390.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1500952430","title":"Fun Tonight","artist":"Lady Gaga","albumTitle":"Chromatica","albumId":"gaga_chromatica","duration":"2:53","genre":"Pop","year":2020,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/5d/4d/f9/5d4df96a-e95e-2fe9-404a-5d570513762d/20UMGIM15390.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1500952436","title":"Plastic Doll","artist":"Lady Gaga","albumTitle":"Chromatica","albumId":"gaga_chromatica","duration":"3:41","genre":"Pop","year":2020,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/5d/4d/f9/5d4df96a-e95e-2fe9-404a-5d570513762d/20UMGIM15390.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1500952441","title":"Enigma","artist":"Lady Gaga","albumTitle":"Chromatica","albumId":"gaga_chromatica","duration":"2:59","genre":"Pop","year":2020,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/5d/4d/f9/5d4df96a-e95e-2fe9-404a-5d570513762d/20UMGIM15390.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1500952442","title":"Replay","artist":"Lady Gaga","albumTitle":"Chromatica","albumId":"gaga_chromatica","duration":"3:06","genre":"Pop","year":2020,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/5d/4d/f9/5d4df96a-e95e-2fe9-404a-5d570513762d/20UMGIM15390.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1500952421","title":"Chromatica I","artist":"Lady Gaga","albumTitle":"Chromatica","albumId":"gaga_chromatica","duration":"1:00","genre":"Pop","year":2020,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/5d/4d/f9/5d4df96a-e95e-2fe9-404a-5d570513762d/20UMGIM15390.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1500952433","title":"Chromatica II","artist":"Lady Gaga","albumTitle":"Chromatica","albumId":"gaga_chromatica","duration":"0:41","genre":"Pop","year":2020,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/5d/4d/f9/5d4df96a-e95e-2fe9-404a-5d570513762d/20UMGIM15390.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false}]},"gaga_fame_monster":{"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/1b/98/88/1b9888da-6a1f-bff0-ec03-518f445019f6/19UMGIM73435.rgb.jpg/1000x1000bb.jpg","tracks":[{"id":"1476727670","title":"Bad Romance","artist":"Lady Gaga","albumTitle":"The Fame Monster","albumId":"gaga_fame_monster","duration":"4:54","genre":"Pop","year":2009,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/1b/98/88/1b9888da-6a1f-bff0-ec03-518f445019f6/19UMGIM73435.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":true},{"id":"1476727671","title":"Alejandro","artist":"Lady Gaga","albumTitle":"The Fame Monster","albumId":"gaga_fame_monster","duration":"4:34","genre":"Pop","year":2009,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/1b/98/88/1b9888da-6a1f-bff0-ec03-518f445019f6/19UMGIM73435.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":true},{"id":"1476727672","title":"Monster","artist":"Lady Gaga","albumTitle":"The Fame Monster","albumId":"gaga_fame_monster","duration":"4:09","genre":"Pop","year":2009,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/1b/98/88/1b9888da-6a1f-bff0-ec03-518f445019f6/19UMGIM73435.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":true},{"id":"1476727673","title":"Speechless","artist":"Lady Gaga","albumTitle":"The Fame Monster","albumId":"gaga_fame_monster","duration":"4:30","genre":"Pop","year":2009,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/1b/98/88/1b9888da-6a1f-bff0-ec03-518f445019f6/19UMGIM73435.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1476727674","title":"Dance In The Dark","artist":"Lady Gaga","albumTitle":"The Fame Monster","albumId":"gaga_fame_monster","duration":"4:48","genre":"Pop","year":2009,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/1b/98/88/1b9888da-6a1f-bff0-ec03-518f445019f6/19UMGIM73435.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1476727675","title":"Telephone (feat. Beyoncé)","artist":"Lady Gaga","albumTitle":"The Fame Monster","albumId":"gaga_fame_monster","duration":"3:40","genre":"Pop","year":2009,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/1b/98/88/1b9888da-6a1f-bff0-ec03-518f445019f6/19UMGIM73435.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1476727858","title":"So Happy I Could Die","artist":"Lady Gaga","albumTitle":"The Fame Monster","albumId":"gaga_fame_monster","duration":"3:54","genre":"Pop","year":2009,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/1b/98/88/1b9888da-6a1f-bff0-ec03-518f445019f6/19UMGIM73435.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1476727859","title":"Teeth","artist":"Lady Gaga","albumTitle":"The Fame Monster","albumId":"gaga_fame_monster","duration":"3:40","genre":"Pop","year":2009,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/1b/98/88/1b9888da-6a1f-bff0-ec03-518f445019f6/19UMGIM73435.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1476727860","title":"Bad Romance (Starsmith Remix)","artist":"Lady Gaga","albumTitle":"The Fame Monster","albumId":"gaga_fame_monster","duration":"4:55","genre":"Pop","year":2009,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/1b/98/88/1b9888da-6a1f-bff0-ec03-518f445019f6/19UMGIM73435.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1476727861","title":"Just Dance (feat. Colby O'Donis)","artist":"Lady Gaga","albumTitle":"The Fame Monster","albumId":"gaga_fame_monster","duration":"4:02","genre":"Pop","year":2009,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/1b/98/88/1b9888da-6a1f-bff0-ec03-518f445019f6/19UMGIM73435.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1476727862","title":"LoveGame","artist":"Lady Gaga","albumTitle":"The Fame Monster","albumId":"gaga_fame_monster","duration":"3:36","genre":"Pop","year":2009,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/1b/98/88/1b9888da-6a1f-bff0-ec03-518f445019f6/19UMGIM73435.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1476727863","title":"Paparazzi","artist":"Lady Gaga","albumTitle":"The Fame Monster","albumId":"gaga_fame_monster","duration":"3:28","genre":"Pop","year":2009,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/1b/98/88/1b9888da-6a1f-bff0-ec03-518f445019f6/19UMGIM73435.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false}]},"gaga_born_this_way":{"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/53/00/7f/53007fa9-9b02-1fdb-290a-b0ca791a8c98/11UMGIM12477.rgb.jpg/1000x1000bb.jpg","tracks":[{"id":"1440824262","title":"Marry The Night","artist":"Lady Gaga","albumTitle":"Born This Way","albumId":"gaga_born_this_way","duration":"4:24","genre":"Pop","year":2011,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/53/00/7f/53007fa9-9b02-1fdb-290a-b0ca791a8c98/11UMGIM12477.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":true},{"id":"1440824264","title":"Born This Way","artist":"Lady Gaga","albumTitle":"Born This Way","albumId":"gaga_born_this_way","duration":"4:20","genre":"Pop","year":2011,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/53/00/7f/53007fa9-9b02-1fdb-290a-b0ca791a8c98/11UMGIM12477.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":true},{"id":"1440824265","title":"Government Hooker","artist":"Lady Gaga","albumTitle":"Born This Way","albumId":"gaga_born_this_way","duration":"4:14","genre":"Pop","year":2011,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/53/00/7f/53007fa9-9b02-1fdb-290a-b0ca791a8c98/11UMGIM12477.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":true},{"id":"1440824266","title":"Judas","artist":"Lady Gaga","albumTitle":"Born This Way","albumId":"gaga_born_this_way","duration":"4:09","genre":"Pop","year":2011,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/53/00/7f/53007fa9-9b02-1fdb-290a-b0ca791a8c98/11UMGIM12477.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1440824268","title":"Americano","artist":"Lady Gaga","albumTitle":"Born This Way","albumId":"gaga_born_this_way","duration":"4:06","genre":"Pop","year":2011,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/53/00/7f/53007fa9-9b02-1fdb-290a-b0ca791a8c98/11UMGIM12477.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1440824269","title":"Hair","artist":"Lady Gaga","albumTitle":"Born This Way","albumId":"gaga_born_this_way","duration":"5:08","genre":"Pop","year":2011,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/53/00/7f/53007fa9-9b02-1fdb-290a-b0ca791a8c98/11UMGIM12477.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1440824271","title":"Scheiße","artist":"Lady Gaga","albumTitle":"Born This Way","albumId":"gaga_born_this_way","duration":"3:45","genre":"Pop","year":2011,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/53/00/7f/53007fa9-9b02-1fdb-290a-b0ca791a8c98/11UMGIM12477.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1440824272","title":"Bloody Mary","artist":"Lady Gaga","albumTitle":"Born This Way","albumId":"gaga_born_this_way","duration":"4:04","genre":"Pop","year":2011,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/53/00/7f/53007fa9-9b02-1fdb-290a-b0ca791a8c98/11UMGIM12477.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1440824274","title":"Bad Kids","artist":"Lady Gaga","albumTitle":"Born This Way","albumId":"gaga_born_this_way","duration":"3:50","genre":"Pop","year":2011,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/53/00/7f/53007fa9-9b02-1fdb-290a-b0ca791a8c98/11UMGIM12477.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1440824276","title":"Highway Unicorn (Road To Love)","artist":"Lady Gaga","albumTitle":"Born This Way","albumId":"gaga_born_this_way","duration":"4:15","genre":"Pop","year":2011,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/53/00/7f/53007fa9-9b02-1fdb-290a-b0ca791a8c98/11UMGIM12477.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1440824277","title":"Heavy Metal Lover","artist":"Lady Gaga","albumTitle":"Born This Way","albumId":"gaga_born_this_way","duration":"4:12","genre":"Pop","year":2011,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/53/00/7f/53007fa9-9b02-1fdb-290a-b0ca791a8c98/11UMGIM12477.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1440824279","title":"Electric Chapel","artist":"Lady Gaga","albumTitle":"Born This Way","albumId":"gaga_born_this_way","duration":"4:12","genre":"Pop","year":2011,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/53/00/7f/53007fa9-9b02-1fdb-290a-b0ca791a8c98/11UMGIM12477.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false}]},"gaga_artpop":{"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/0c/33/64/0c336478-aaa9-95dc-d373-f6fb8510b170/13UAAIM69752.rgb.jpg/1000x1000bb.jpg","tracks":[{"id":"1451767864","title":"Aura","artist":"Lady Gaga","albumTitle":"ARTPOP","albumId":"gaga_artpop","duration":"3:55","genre":"Pop","year":2013,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/0c/33/64/0c336478-aaa9-95dc-d373-f6fb8510b170/13UAAIM69752.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":true},{"id":"1451767865","title":"Venus","artist":"Lady Gaga","albumTitle":"ARTPOP","albumId":"gaga_artpop","duration":"3:53","genre":"Pop","year":2013,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/0c/33/64/0c336478-aaa9-95dc-d373-f6fb8510b170/13UAAIM69752.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":true},{"id":"1451767866","title":"G.U.Y.","artist":"Lady Gaga","albumTitle":"ARTPOP","albumId":"gaga_artpop","duration":"3:52","genre":"Pop","year":2013,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/0c/33/64/0c336478-aaa9-95dc-d373-f6fb8510b170/13UAAIM69752.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":true},{"id":"1451767867","title":"Sexxx Dreams","artist":"Lady Gaga","albumTitle":"ARTPOP","albumId":"gaga_artpop","duration":"3:34","genre":"Pop","year":2013,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/0c/33/64/0c336478-aaa9-95dc-d373-f6fb8510b170/13UAAIM69752.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1451767869","title":"Jewels N' Drugs (feat. T.I., Too $hort & Twista)","artist":"Lady Gaga","albumTitle":"ARTPOP","albumId":"gaga_artpop","duration":"3:48","genre":"Pop","year":2013,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/0c/33/64/0c336478-aaa9-95dc-d373-f6fb8510b170/13UAAIM69752.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1451767870","title":"MANiCURE","artist":"Lady Gaga","albumTitle":"ARTPOP","albumId":"gaga_artpop","duration":"3:19","genre":"Pop","year":2013,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/0c/33/64/0c336478-aaa9-95dc-d373-f6fb8510b170/13UAAIM69752.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1451767871","title":"ARTPOP","artist":"Lady Gaga","albumTitle":"ARTPOP","albumId":"gaga_artpop","duration":"4:07","genre":"Pop","year":2013,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/0c/33/64/0c336478-aaa9-95dc-d373-f6fb8510b170/13UAAIM69752.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1451767872","title":"Swine","artist":"Lady Gaga","albumTitle":"ARTPOP","albumId":"gaga_artpop","duration":"4:28","genre":"Pop","year":2013,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/0c/33/64/0c336478-aaa9-95dc-d373-f6fb8510b170/13UAAIM69752.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1451767874","title":"Donatella","artist":"Lady Gaga","albumTitle":"ARTPOP","albumId":"gaga_artpop","duration":"4:24","genre":"Pop","year":2013,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/0c/33/64/0c336478-aaa9-95dc-d373-f6fb8510b170/13UAAIM69752.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1451767875","title":"Fashion!","artist":"Lady Gaga","albumTitle":"ARTPOP","albumId":"gaga_artpop","duration":"3:59","genre":"Pop","year":2013,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/0c/33/64/0c336478-aaa9-95dc-d373-f6fb8510b170/13UAAIM69752.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1451767876","title":"Mary Jane Holland","artist":"Lady Gaga","albumTitle":"ARTPOP","albumId":"gaga_artpop","duration":"4:37","genre":"Pop","year":2013,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/0c/33/64/0c336478-aaa9-95dc-d373-f6fb8510b170/13UAAIM69752.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1451767877","title":"Dope","artist":"Lady Gaga","albumTitle":"ARTPOP","albumId":"gaga_artpop","duration":"3:41","genre":"Pop","year":2013,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/0c/33/64/0c336478-aaa9-95dc-d373-f6fb8510b170/13UAAIM69752.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false}]},"jao_super":{"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/ab/0f/f6/ab0ff604-6b3f-490c-faaf-5ad97324ef41/23UMGIM90082.rgb.jpg/1000x1000bb.jpg","tracks":[{"id":"1701857317","title":"Escorpião","artist":"Jão","albumTitle":"SUPER","albumId":"jao_super","duration":"2:28","genre":"Pop","year":2023,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/ab/0f/f6/ab0ff604-6b3f-490c-faaf-5ad97324ef41/23UMGIM90082.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":true},{"id":"1701857320","title":"Me Lambe","artist":"Jão","albumTitle":"SUPER","albumId":"jao_super","duration":"2:55","genre":"Pop","year":2023,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/ab/0f/f6/ab0ff604-6b3f-490c-faaf-5ad97324ef41/23UMGIM90082.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":true},{"id":"1701857447","title":"Gameboy","artist":"Jão","albumTitle":"SUPER","albumId":"jao_super","duration":"2:58","genre":"Pop","year":2023,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/ab/0f/f6/ab0ff604-6b3f-490c-faaf-5ad97324ef41/23UMGIM90082.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":true},{"id":"1701857454","title":"Alinhamento Milenar","artist":"Jão","albumTitle":"SUPER","albumId":"jao_super","duration":"3:21","genre":"Pop","year":2023,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/ab/0f/f6/ab0ff604-6b3f-490c-faaf-5ad97324ef41/23UMGIM90082.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1701857455","title":"Lábia","artist":"Jão","albumTitle":"SUPER","albumId":"jao_super","duration":"2:51","genre":"Pop","year":2023,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/ab/0f/f6/ab0ff604-6b3f-490c-faaf-5ad97324ef41/23UMGIM90082.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1701857458","title":"Maria","artist":"Jão","albumTitle":"SUPER","albumId":"jao_super","duration":"1:58","genre":"Pop","year":2023,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/ab/0f/f6/ab0ff604-6b3f-490c-faaf-5ad97324ef41/23UMGIM90082.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1701857462","title":"Julho","artist":"Jão","albumTitle":"SUPER","albumId":"jao_super","duration":"3:07","genre":"Pop","year":2023,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/ab/0f/f6/ab0ff604-6b3f-490c-faaf-5ad97324ef41/23UMGIM90082.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1701857466","title":"Eu Posso Ser Como Você","artist":"Jão","albumTitle":"SUPER","albumId":"jao_super","duration":"2:31","genre":"Pop","year":2023,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/ab/0f/f6/ab0ff604-6b3f-490c-faaf-5ad97324ef41/23UMGIM90082.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1701857472","title":"Sinais","artist":"Jão","albumTitle":"SUPER","albumId":"jao_super","duration":"3:03","genre":"Pop","year":2023,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/ab/0f/f6/ab0ff604-6b3f-490c-faaf-5ad97324ef41/23UMGIM90082.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1701857596","title":"Se O Problema Era Você, Por Que Doeu Em Mim?","artist":"Jão","albumTitle":"SUPER","albumId":"jao_super","duration":"2:37","genre":"Pop","year":2023,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/ab/0f/f6/ab0ff604-6b3f-490c-faaf-5ad97324ef41/23UMGIM90082.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1701857605","title":"Locadora","artist":"Jão","albumTitle":"SUPER","albumId":"jao_super","duration":"3:09","genre":"Pop","year":2023,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/ab/0f/f6/ab0ff604-6b3f-490c-faaf-5ad97324ef41/23UMGIM90082.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1701857619","title":"Rádio","artist":"Jão","albumTitle":"SUPER","albumId":"jao_super","duration":"3:47","genre":"Pop","year":2023,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/ab/0f/f6/ab0ff604-6b3f-490c-faaf-5ad97324ef41/23UMGIM90082.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false}]},"jao_pirata":{"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/f5/f9/63/f5f963a3-096b-214a-9e5a-b4d446ef728f/21UM1IM26599.rgb.jpg/1000x1000bb.jpg","tracks":[{"id":"1589525782","title":"Clarão","artist":"Jão","albumTitle":"Pirata","albumId":"jao_pirata","duration":"3:09","genre":"Pop","year":2021,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/f5/f9/63/f5f963a3-096b-214a-9e5a-b4d446ef728f/21UM1IM26599.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":true},{"id":"1589525785","title":"Não Te Amo","artist":"Jão","albumTitle":"Pirata","albumId":"jao_pirata","duration":"3:00","genre":"Pop","year":2021,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/f5/f9/63/f5f963a3-096b-214a-9e5a-b4d446ef728f/21UM1IM26599.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":true},{"id":"1589525787","title":"Idiota","artist":"Jão","albumTitle":"Pirata","albumId":"jao_pirata","duration":"3:01","genre":"Pop","year":2021,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/f5/f9/63/f5f963a3-096b-214a-9e5a-b4d446ef728f/21UM1IM26599.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":true},{"id":"1589525788","title":"Santo","artist":"Jão","albumTitle":"Pirata","albumId":"jao_pirata","duration":"2:42","genre":"Pop","year":2021,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/f5/f9/63/f5f963a3-096b-214a-9e5a-b4d446ef728f/21UM1IM26599.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1589525790","title":"Acontece","artist":"Jão","albumTitle":"Pirata","albumId":"jao_pirata","duration":"2:41","genre":"Pop","year":2021,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/f5/f9/63/f5f963a3-096b-214a-9e5a-b4d446ef728f/21UM1IM26599.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1589525792","title":"Você Me Perdeu","artist":"Jão","albumTitle":"Pirata","albumId":"jao_pirata","duration":"2:33","genre":"Pop","year":2021,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/f5/f9/63/f5f963a3-096b-214a-9e5a-b4d446ef728f/21UM1IM26599.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1589526007","title":"Meninos e Meninas","artist":"Jão","albumTitle":"Pirata","albumId":"jao_pirata","duration":"2:41","genre":"Pop","year":2021,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/f5/f9/63/f5f963a3-096b-214a-9e5a-b4d446ef728f/21UM1IM26599.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1589526020","title":"Coringa","artist":"Jão","albumTitle":"Pirata","albumId":"jao_pirata","duration":"3:07","genre":"Pop","year":2021,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/f5/f9/63/f5f963a3-096b-214a-9e5a-b4d446ef728f/21UM1IM26599.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1589526021","title":"Doce","artist":"Jão","albumTitle":"Pirata","albumId":"jao_pirata","duration":"3:15","genre":"Pop","year":2021,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/f5/f9/63/f5f963a3-096b-214a-9e5a-b4d446ef728f/21UM1IM26599.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1589526023","title":"Tempos de Glória","artist":"Jão","albumTitle":"Pirata","albumId":"jao_pirata","duration":"2:26","genre":"Pop","year":2021,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/f5/f9/63/f5f963a3-096b-214a-9e5a-b4d446ef728f/21UM1IM26599.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1589526025","title":"Olhos Vermelhos","artist":"Jão","albumTitle":"Pirata","albumId":"jao_pirata","duration":"5:04","genre":"Pop","year":2021,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/f5/f9/63/f5f963a3-096b-214a-9e5a-b4d446ef728f/21UM1IM26599.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false}]},"jao_anti_heroi":{"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/eb/f6/d9/ebf6d984-0efb-2a9c-04e8-ffc43b594aa2/19UMGIM89335.rgb.jpg/1000x1000bb.jpg","tracks":[{"id":"1482213603","title":"A Última Noite","artist":"Jão","albumTitle":"Anti-Herói","albumId":"jao_anti_heroi","duration":"4:15","genre":"Pop","year":2019,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/eb/f6/d9/ebf6d984-0efb-2a9c-04e8-ffc43b594aa2/19UMGIM89335.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":true},{"id":"1482213605","title":"Triste pra Sempre","artist":"Jão","albumTitle":"Anti-Herói","albumId":"jao_anti_heroi","duration":"2:59","genre":"Pop","year":2019,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/eb/f6/d9/ebf6d984-0efb-2a9c-04e8-ffc43b594aa2/19UMGIM89335.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":true},{"id":"1482213606","title":"Enquanto Me Beija","artist":"Jão","albumTitle":"Anti-Herói","albumId":"jao_anti_heroi","duration":"3:39","genre":"Pop","year":2019,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/eb/f6/d9/ebf6d984-0efb-2a9c-04e8-ffc43b594aa2/19UMGIM89335.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":true},{"id":"1482213607","title":"Essa Eu Fiz pro Nosso Amor","artist":"Jão","albumTitle":"Anti-Herói","albumId":"jao_anti_heroi","duration":"3:14","genre":"Pop","year":2019,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/eb/f6/d9/ebf6d984-0efb-2a9c-04e8-ffc43b594aa2/19UMGIM89335.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1482213608","title":"Fim de Festa","artist":"Jão","albumTitle":"Anti-Herói","albumId":"jao_anti_heroi","duration":"2:50","genre":"Pop","year":2019,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/eb/f6/d9/ebf6d984-0efb-2a9c-04e8-ffc43b594aa2/19UMGIM89335.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1482213609","title":"Barcelona","artist":"Jão","albumTitle":"Anti-Herói","albumId":"jao_anti_heroi","duration":"3:24","genre":"Pop","year":2019,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/eb/f6/d9/ebf6d984-0efb-2a9c-04e8-ffc43b594aa2/19UMGIM89335.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1482213610","title":"Você Vai Me Destruir","artist":"Jão","albumTitle":"Anti-Herói","albumId":"jao_anti_heroi","duration":"3:04","genre":"Pop","year":2019,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/eb/f6/d9/ebf6d984-0efb-2a9c-04e8-ffc43b594aa2/19UMGIM89335.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1482213611","title":"Vsf","artist":"Jão","albumTitle":"Anti-Herói","albumId":"jao_anti_heroi","duration":"3:56","genre":"Pop","year":2019,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/eb/f6/d9/ebf6d984-0efb-2a9c-04e8-ffc43b594aa2/19UMGIM89335.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1482213613","title":"Hotel San Diego","artist":"Jão","albumTitle":"Anti-Herói","albumId":"jao_anti_heroi","duration":"3:31","genre":"Pop","year":2019,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/eb/f6/d9/ebf6d984-0efb-2a9c-04e8-ffc43b594aa2/19UMGIM89335.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1482213614","title":":( (Nota de Voz 8)","artist":"Jão","albumTitle":"Anti-Herói","albumId":"jao_anti_heroi","duration":"2:25","genre":"Pop","year":2019,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/eb/f6/d9/ebf6d984-0efb-2a9c-04e8-ffc43b594aa2/19UMGIM89335.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false}]},"jao_lobos":{"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/b7/9b/81/b79b8138-b95e-bf0d-1e7c-92a28bbf71a1/19UMGIM02269.rgb.jpg/1000x1000bb.jpg","tracks":[{"id":"1450308334","title":"Vou Morrer Sozinho","artist":"Jão","albumTitle":"Lobos","albumId":"jao_lobos","duration":"2:54","genre":"Pop","year":2018,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/b7/9b/81/b79b8138-b95e-bf0d-1e7c-92a28bbf71a1/19UMGIM02269.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":true},{"id":"1450308337","title":"Me Beija Com Raiva","artist":"Jão","albumTitle":"Lobos","albumId":"jao_lobos","duration":"3:16","genre":"Pop","year":2018,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/b7/9b/81/b79b8138-b95e-bf0d-1e7c-92a28bbf71a1/19UMGIM02269.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":true},{"id":"1450308338","title":"Lindo Demais","artist":"Jão","albumTitle":"Lobos","albumId":"jao_lobos","duration":"3:00","genre":"Pop","year":2018,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/b7/9b/81/b79b8138-b95e-bf0d-1e7c-92a28bbf71a1/19UMGIM02269.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":true},{"id":"1450308339","title":"Imaturo","artist":"Jão","albumTitle":"Lobos","albumId":"jao_lobos","duration":"2:58","genre":"Pop","year":2018,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/b7/9b/81/b79b8138-b95e-bf0d-1e7c-92a28bbf71a1/19UMGIM02269.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1450308340","title":"Ainda Te Amo","artist":"Jão","albumTitle":"Lobos","albumId":"jao_lobos","duration":"3:10","genre":"Pop","year":2018,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/b7/9b/81/b79b8138-b95e-bf0d-1e7c-92a28bbf71a1/19UMGIM02269.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1450308341","title":"A Rua","artist":"Jão","albumTitle":"Lobos","albumId":"jao_lobos","duration":"2:36","genre":"Pop","year":2018,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/b7/9b/81/b79b8138-b95e-bf0d-1e7c-92a28bbf71a1/19UMGIM02269.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1450308342","title":"Lobos","artist":"Jão","albumTitle":"Lobos","albumId":"jao_lobos","duration":"3:43","genre":"Pop","year":2018,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/b7/9b/81/b79b8138-b95e-bf0d-1e7c-92a28bbf71a1/19UMGIM02269.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1450308343","title":"Eu Quero Ser Como Você","artist":"Jão","albumTitle":"Lobos","albumId":"jao_lobos","duration":"3:09","genre":"Pop","year":2018,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/b7/9b/81/b79b8138-b95e-bf0d-1e7c-92a28bbf71a1/19UMGIM02269.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1450308344","title":"Aqui","artist":"Jão & Diogo Piçarra","albumTitle":"Lobos","albumId":"jao_lobos","duration":"2:51","genre":"Pop","year":2018,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/b7/9b/81/b79b8138-b95e-bf0d-1e7c-92a28bbf71a1/19UMGIM02269.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1450308345","title":"Monstros","artist":"Jão","albumTitle":"Lobos","albumId":"jao_lobos","duration":"4:15","genre":"Pop","year":2018,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/b7/9b/81/b79b8138-b95e-bf0d-1e7c-92a28bbf71a1/19UMGIM02269.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1450308346","title":"Fim do Mundo (Bonus Track)","artist":"Jão","albumTitle":"Lobos","albumId":"jao_lobos","duration":"3:46","genre":"Pop","year":2018,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/b7/9b/81/b79b8138-b95e-bf0d-1e7c-92a28bbf71a1/19UMGIM02269.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1450308347","title":"Ressaca (Bonus Track)","artist":"Jão","albumTitle":"Lobos","albumId":"jao_lobos","duration":"3:00","genre":"Pop","year":2018,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/b7/9b/81/b79b8138-b95e-bf0d-1e7c-92a28bbf71a1/19UMGIM02269.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false}]},"weeknd_after_hours":{"id":"weeknd_after_hours","q":"The Weeknd After Hours","category":"global","title":"After Hours","artist":"The Weeknd","year":2020,"genre":"R&B / Synthwave","label":"XO / Republic Records","coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/6f/bc/e6/6fbce6c4-c38c-72d8-4fd0-66cfff32f679/20UMGIM12176.rgb.jpg/1000x1000bb.jpg","tracks":[{"id":"1499378615","title":"After Hours","artist":"The Weeknd","albumTitle":"After Hours","albumId":"weeknd_after_hours","duration":"6:01","genre":"R&B/soul","year":2020,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/6f/bc/e6/6fbce6c4-c38c-72d8-4fd0-66cfff32f679/20UMGIM12176.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":true},{"id":"1674298561","title":"After Hours (Live)","artist":"The Weeknd","albumTitle":"Live At SoFi Stadium","albumId":"weeknd_after_hours","duration":"4:27","genre":"R&B/soul","year":2020,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/ad/8e/da/ad8eda90-c2f5-7488-042d-4b09bd2c9c05/23UMGIM20832.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":true},{"id":"1505683459","title":"After Hours (The Blaze Remix)","artist":"The Weeknd","albumTitle":"After Hours (Remixes) - EP","albumId":"weeknd_after_hours","duration":"3:58","genre":"R&B/soul","year":2020,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/71/12/03/711203e0-f7b9-9f4e-caff-540736fda45c/20UMGIM25005.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":true},{"id":"1499386375","title":"After Hours","artist":"The Weeknd","albumTitle":"After Hours","albumId":"weeknd_after_hours","duration":"6:01","genre":"R&B/soul","year":2020,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/2b/b9/fe/2bb9fef5-d7f3-8345-25a9-db0e79fde4e4/20UMGIM11048.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1676306932","title":"After Hours (Live)","artist":"The Weeknd","albumTitle":"Live At SoFi Stadium","albumId":"weeknd_after_hours","duration":"4:27","genre":"R&B/soul","year":2020,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/03/2d/c1/032dc13a-dce4-672a-b501-d16d3b31be07/23UMGIM20988.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1615103346","title":"After Hours","artist":"The Weeknd","albumTitle":"After Hours (Deluxe)","albumId":"weeknd_after_hours","duration":"6:01","genre":"R&B/soul","year":2020,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/9a/a1/6b/9aa16bf2-4518-6760-88d3-5e6b6d3d2bc1/20UMGIM21166.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1505683998","title":"After Hours","artist":"The Weeknd","albumTitle":"After Hours (Deluxe)","albumId":"weeknd_after_hours","duration":"6:01","genre":"R&B/soul","year":2020,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/03/e1/67/03e167d6-ee05-eb32-55e9-c5040f55a8bf/20UMGIM21166.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1505683983","title":"After Hours","artist":"The Weeknd","albumTitle":"After Hours (Deluxe)","albumId":"weeknd_after_hours","duration":"6:01","genre":"R&B/soul","year":2020,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/83/3a/f7/833af71b-2e0c-3303-24f5-8f5c546c073b/20UMGIM21167.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false}]},"billie_hmhas":{"id":"billie_hmhas","q":"Billie Eilish HIT ME HARD AND SOFT","category":"global","title":"HIT ME HARD AND SOFT","artist":"Billie Eilish","year":2024,"genre":"Alt-Pop / Indie","label":"Darkroom / Interscope","coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/92/9f/69/929f69f1-9977-3a44-d674-11f70c852d1b/24UMGIM36186.rgb.jpg/1000x1000bb.jpg","tracks":[{"id":"1739659142","title":"BIRDS OF A FEATHER","artist":"Billie Eilish","albumTitle":"HIT ME HARD AND SOFT","albumId":"billie_hmhas","duration":"3:30","genre":"Alternativo","year":2024,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/92/9f/69/929f69f1-9977-3a44-d674-11f70c852d1b/24UMGIM36186.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":true},{"id":"1739659141","title":"CHIHIRO","artist":"Billie Eilish","albumTitle":"HIT ME HARD AND SOFT","albumId":"billie_hmhas","duration":"5:03","genre":"Alternativo","year":2024,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/92/9f/69/929f69f1-9977-3a44-d674-11f70c852d1b/24UMGIM36186.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":true},{"id":"1739659278","title":"BLUE","artist":"Billie Eilish","albumTitle":"HIT ME HARD AND SOFT","albumId":"billie_hmhas","duration":"5:43","genre":"Alternativo","year":2024,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/92/9f/69/929f69f1-9977-3a44-d674-11f70c852d1b/24UMGIM36186.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":true},{"id":"1739659137","title":"SKINNY","artist":"Billie Eilish","albumTitle":"HIT ME HARD AND SOFT","albumId":"billie_hmhas","duration":"3:39","genre":"Alternativo","year":2024,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/92/9f/69/929f69f1-9977-3a44-d674-11f70c852d1b/24UMGIM36186.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1739659149","title":"L’AMOUR DE MA VIE","artist":"Billie Eilish","albumTitle":"HIT ME HARD AND SOFT","albumId":"billie_hmhas","duration":"5:33","genre":"Alternativo","year":2024,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/92/9f/69/929f69f1-9977-3a44-d674-11f70c852d1b/24UMGIM36186.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1739659277","title":"BITTERSUITE","artist":"Billie Eilish","albumTitle":"HIT ME HARD AND SOFT","albumId":"billie_hmhas","duration":"4:58","genre":"Alternativo","year":2024,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/92/9f/69/929f69f1-9977-3a44-d674-11f70c852d1b/24UMGIM36186.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1739659150","title":"THE DINER","artist":"Billie Eilish","albumTitle":"HIT ME HARD AND SOFT","albumId":"billie_hmhas","duration":"3:06","genre":"Alternativo","year":2024,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/92/9f/69/929f69f1-9977-3a44-d674-11f70c852d1b/24UMGIM36186.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1739659140","title":"LUNCH","artist":"Billie Eilish","albumTitle":"HIT ME HARD AND SOFT","albumId":"billie_hmhas","duration":"2:59","genre":"Alternativo","year":2024,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/92/9f/69/929f69f1-9977-3a44-d674-11f70c852d1b/24UMGIM36186.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false}]},"dua_future_nostalgia":{"id":"dua_future_nostalgia","q":"Dua Lipa Future Nostalgia","category":"global","title":"Future Nostalgia","artist":"Dua Lipa","year":2020,"genre":"Disco-Pop / Dance","label":"Warner Records","coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/6c/11/d6/6c11d681-aa3a-d59e-4c2e-f77e181026ab/190295092665.jpg/1000x1000bb.jpg","tracks":[{"id":"1538003626","title":"Future Nostalgia","artist":"Dua Lipa","albumTitle":"Future Nostalgia","albumId":"dua_future_nostalgia","duration":"3:04","genre":"Pop","year":2020,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/6c/11/d6/6c11d681-aa3a-d59e-4c2e-f77e181026ab/190295092665.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":true},{"id":"1552269068","title":"Future Nostalgia","artist":"Dua Lipa","albumTitle":"Future Nostalgia (The Moonlight Edition)","albumId":"dua_future_nostalgia","duration":"3:04","genre":"Pop","year":2020,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/25/cd/d4/25cdd423-4a23-1913-04ed-921a58cccb7d/190295000639.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":true},{"id":"1489975832","title":"Future Nostalgia","artist":"Dua Lipa","albumTitle":"Future Nostalgia - Single","albumId":"dua_future_nostalgia","duration":"3:04","genre":"Pop","year":2020,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/e9/c5/a8/e9c5a8a0-d698-137b-2e85-cf3a8d9548f8/190295303372.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":true},{"id":"1551179220","title":"Future Nostalgia","artist":"Dua Lipa","albumTitle":"Future Nostalgia (The Moonlight Edition)","albumId":"dua_future_nostalgia","duration":"3:04","genre":"Pop","year":2020,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/96/93/54/969354a7-8985-7833-7160-93e38110b745/190295042998.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1530404368","title":"Future Nostalgia (Joe Goddard Remix)","artist":"Dua Lipa","albumTitle":"Club Future Nostalgia","albumId":"dua_future_nostalgia","duration":"4:48","genre":"Dance","year":2020,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/87/73/21/877321b1-e967-b29a-c097-1fd9f19f3410/190295145316.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1528380271","title":"Future Nostalgia (Joe Goddard Remix) [Mixed]","artist":"Dua Lipa & The Blessed Madonna","albumTitle":"Club Future Nostalgia (DJ Mix)","albumId":"dua_future_nostalgia","duration":"2:54","genre":"Dance","year":2020,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/d1/fb/aa/d1fbaa5b-76df-b645-93c9-8571a06670ad/190295162962.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1538004012","title":"Break My Heart","artist":"Dua Lipa","albumTitle":"Future Nostalgia","albumId":"dua_future_nostalgia","duration":"3:41","genre":"Pop","year":2020,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/6c/11/d6/6c11d681-aa3a-d59e-4c2e-f77e181026ab/190295092665.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1538003644","title":"Physical","artist":"Dua Lipa","albumTitle":"Future Nostalgia","albumId":"dua_future_nostalgia","duration":"3:13","genre":"Pop","year":2020,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/6c/11/d6/6c11d681-aa3a-d59e-4c2e-f77e181026ab/190295092665.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false}]},"lana_born_to_die":{"id":"lana_born_to_die","q":"Lana Del Rey Born to Die","category":"global","title":"Born to Die","artist":"Lana Del Rey","year":2012,"genre":"Indie Pop / Sadcore","label":"Polydor / Interscope","coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/b8/42/39/b8423909-3abd-4b5f-8ebe-709c95e500bc/12UMGIM51209.rgb.jpg/1000x1000bb.jpg","tracks":[{"id":"1440829978","title":"Born to Die","artist":"Lana Del Rey","albumTitle":"Born to Die - The Paradise Edition","albumId":"lana_born_to_die","duration":"4:45","genre":"Alternativo","year":2012,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/b8/42/39/b8423909-3abd-4b5f-8ebe-709c95e500bc/12UMGIM51209.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":true},{"id":"1440830261","title":"Summertime Sadness","artist":"Lana Del Rey","albumTitle":"Born to Die - The Paradise Edition","albumId":"lana_born_to_die","duration":"4:25","genre":"Alternativo","year":2012,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/b8/42/39/b8423909-3abd-4b5f-8ebe-709c95e500bc/12UMGIM51209.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":true},{"id":"1779781768","title":"Born To Die","artist":"Lana Del Rey","albumTitle":"Born To Die","albumId":"lana_born_to_die","duration":"4:46","genre":"Alternativo","year":2012,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/59/10/66/591066ea-3c85-3dfe-ef82-ffdbbcdfc8b9/12UMGIM00033.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":true},{"id":"1440809795","title":"Born to Die","artist":"Lana Del Rey","albumTitle":"Born to Die","albumId":"lana_born_to_die","duration":"4:46","genre":"Alternativo","year":2012,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/37/ae/95/37ae95a0-2e1c-bf03-4900-983686da9292/12UMGIM00033.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1442452466","title":"Born to Die","artist":"Lana Del Rey","albumTitle":"Born to Die – Paradise Edition (Special Version)","albumId":"lana_born_to_die","duration":"4:46","genre":"Pop","year":2012,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/c5/df/dd/c5dfdd9c-24f2-de01-246c-fcc5e028f705/12UMGIM53864.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"889869525","title":"Born To Die","artist":"Lana Del Rey","albumTitle":"Em Família - Internacional","albumId":"lana_born_to_die","duration":"4:45","genre":"Música do mundo","year":2012,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music4/v4/7a/67/fc/7a67fc33-882f-7392-9a3e-bbe0a37ca928/7891430340827.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1452380485","title":"Born To Die","artist":"Lana Del Rey","albumTitle":"As 100 Mais da Antena 1, Vol. 3 (Álbum 1)","albumId":"lana_born_to_die","duration":"4:45","genre":"Pop","year":2012,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/27/82/2b/27822b88-2180-8aee-9878-5f889e9d7dcb/12UMGIM64312.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1765618828","title":"Born To Die","artist":"Marina Viotti & Melankhôlia","albumTitle":"Melankhôlia: In Darkness Through The Light","albumId":"lana_born_to_die","duration":"4:15","genre":"Música clássica","year":2012,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/35/63/c9/3563c9ce-05af-8a27-1e11-e12f54c1f538/cover.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false}]},"anitta_funk_gen":{"id":"anitta_funk_gen","q":"Anitta Funk Generation","category":"brasil","title":"Funk Generation","artist":"Anitta","year":2024,"genre":"Funk Brasileiro / Pop","label":"Republic Records","coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/d2/0b/0d/d20b0db9-5a9f-124f-7839-9258de17c3bd/24UMGIM41374.rgb.jpg/1000x1000bb.jpg","tracks":[{"id":"1741470749","title":"Lose Ya Breath","artist":"Anitta","albumTitle":"Funk Generation","albumId":"anitta_funk_gen","duration":"2:16","genre":"Música Latina","year":2024,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/d2/0b/0d/d20b0db9-5a9f-124f-7839-9258de17c3bd/24UMGIM41374.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":true},{"id":"1741471044","title":"Cria De Favela","artist":"Anitta","albumTitle":"Funk Generation","albumId":"anitta_funk_gen","duration":"2:57","genre":"Música Latina","year":2024,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/d2/0b/0d/d20b0db9-5a9f-124f-7839-9258de17c3bd/24UMGIM41374.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":true},{"id":"1741470763","title":"Fria","artist":"Anitta","albumTitle":"Funk Generation","albumId":"anitta_funk_gen","duration":"2:07","genre":"Música Latina","year":2024,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/d2/0b/0d/d20b0db9-5a9f-124f-7839-9258de17c3bd/24UMGIM41374.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":true},{"id":"1741471043","title":"Joga Pra Lua","artist":"Anitta, Dennis & PEDRO SAMPAIO","albumTitle":"Funk Generation","albumId":"anitta_funk_gen","duration":"2:05","genre":"Pop em espanhol","year":2024,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/d2/0b/0d/d20b0db9-5a9f-124f-7839-9258de17c3bd/24UMGIM41374.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1741471056","title":"Mil Veces","artist":"Anitta","albumTitle":"Funk Generation","albumId":"anitta_funk_gen","duration":"2:34","genre":"Pop em espanhol","year":2024,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/d2/0b/0d/d20b0db9-5a9f-124f-7839-9258de17c3bd/24UMGIM41374.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1741471050","title":"Sabana","artist":"Anitta","albumTitle":"Funk Generation","albumId":"anitta_funk_gen","duration":"1:54","genre":"Pop em espanhol","year":2024,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/d2/0b/0d/d20b0db9-5a9f-124f-7839-9258de17c3bd/24UMGIM41374.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1741470766","title":"Aceita","artist":"Anitta","albumTitle":"Funk Generation","albumId":"anitta_funk_gen","duration":"2:07","genre":"Música Latina","year":2024,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/d2/0b/0d/d20b0db9-5a9f-124f-7839-9258de17c3bd/24UMGIM41374.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1741470765","title":"Love In Common","artist":"Anitta","albumTitle":"Funk Generation","albumId":"anitta_funk_gen","duration":"2:29","genre":"Música Latina","year":2024,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/d2/0b/0d/d20b0db9-5a9f-124f-7839-9258de17c3bd/24UMGIM41374.rgb.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false}]},"bruno_24k":{"id":"bruno_24k","q":"Bruno Mars 24K Magic","category":"global","title":"24K Magic","artist":"Bruno Mars","year":2016,"genre":"Funk / R&B / Pop","label":"Atlantic Records","coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/e3/47/a0/e347a0cc-87ce-5d05-d560-176c7d48f66e/075679904119.jpg/1000x1000bb.jpg","tracks":[{"id":"1161504024","title":"24K Magic","artist":"Bruno Mars","albumTitle":"24K Magic","albumId":"bruno_24k","duration":"3:46","genre":"Pop","year":2016,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/e3/47/a0/e347a0cc-87ce-5d05-d560-176c7d48f66e/075679904119.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":true},{"id":"1238456104","title":"24K Magic (R3hab Remix)","artist":"Bruno Mars","albumTitle":"24K Magic (R3hab Remix) - Single","albumId":"bruno_24k","duration":"2:38","genre":"Dance","year":2016,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/8a/33/2f/8a332f0c-503f-08ca-b3e6-06550cf973c1/075679894229.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":true},{"id":"1161504043","title":"That's What I Like","artist":"Bruno Mars","albumTitle":"24K Magic","albumId":"bruno_24k","duration":"3:26","genre":"Pop","year":2016,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/e3/47/a0/e347a0cc-87ce-5d05-d560-176c7d48f66e/075679904119.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":true},{"id":"1161504065","title":"Finesse","artist":"Bruno Mars","albumTitle":"24K Magic","albumId":"bruno_24k","duration":"3:10","genre":"Pop","year":2016,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/e3/47/a0/e347a0cc-87ce-5d05-d560-176c7d48f66e/075679904119.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1161504045","title":"Versace On The Floor","artist":"Bruno Mars","albumTitle":"24K Magic","albumId":"bruno_24k","duration":"4:21","genre":"Pop","year":2016,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/e3/47/a0/e347a0cc-87ce-5d05-d560-176c7d48f66e/075679904119.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1161504066","title":"Too Good to Say Goodbye","artist":"Bruno Mars","albumTitle":"24K Magic","albumId":"bruno_24k","duration":"4:41","genre":"Pop","year":2016,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/e3/47/a0/e347a0cc-87ce-5d05-d560-176c7d48f66e/075679904119.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1161504064","title":"Calling All My Lovelies","artist":"Bruno Mars","albumTitle":"24K Magic","albumId":"bruno_24k","duration":"4:10","genre":"Pop","year":2016,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/e3/47/a0/e347a0cc-87ce-5d05-d560-176c7d48f66e/075679904119.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false},{"id":"1161504026","title":"Chunky","artist":"Bruno Mars","albumTitle":"24K Magic","albumId":"bruno_24k","duration":"3:06","genre":"Pop","year":2016,"coverUrl":"https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/e3/47/a0/e347a0cc-87ce-5d05-d560-176c7d48f66e/075679904119.jpg/1000x1000bb.jpg","previewUrl":"","streamUrl":"","popular":false}]}};

      // Helper para buscar JSONP na API pública da Deezer (100% CORS-free, capas 1000x1000 e MP3 direto)
      function fetchDeezerJsonp(query, limit = 25) {
        return new Promise((resolve) => {
          const cbName = "miado_dz_cb_" + Date.now() + "_" + Math.floor(Math.random() * 100000);
          const script = document.createElement("script");
          const timeout = setTimeout(() => {
            cleanup();
            resolve([]);
          }, 5500);

          function cleanup() {
            clearTimeout(timeout);
            try { delete window[cbName]; } catch (e) { window[cbName] = undefined; }
            if (script.parentNode) script.parentNode.removeChild(script);
          }

          window[cbName] = (res) => {
            cleanup();
            resolve((res && Array.isArray(res.data)) ? res.data : []);
          };
          script.onerror = () => {
            cleanup();
            resolve([]);
          };
          script.src = `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=${limit}&output=jsonp&callback=${cbName}`;
          document.head.appendChild(script);
        });
      }

      // Remove músicas repetidas normalizando título (sem sufixos de versão/parênteses duplicados) + artista
      function normalizeTrackKey(titleOrTrack, artist = "") {
        let rawTitle = titleOrTrack;
        let rawArtist = artist;
        if (titleOrTrack && typeof titleOrTrack === "object") {
          if (titleOrTrack.isrc) return `isrc:${String(titleOrTrack.isrc).trim().toUpperCase()}`;
          rawTitle = titleOrTrack.title || "";
          rawArtist = titleOrTrack.artist || artist || "";
        }
        const featMatches = [];
        const featRe = /[([]\s*(?:feat\.?|ft\.?|with|part\.?)\s+([^\])]+)[\])]/gi;
        let m;
        while ((m = featRe.exec(String(rawTitle || ""))) !== null) {
          if (m[1]) featMatches.push(m[1]);
        }
        const cleanTitle = String(rawTitle || "")
          .toLowerCase()
          .replace(/\s*\((?:feat\.?|ft\.?|with|deluxe|remaster|bonus|version|live|radio edit|explicit|clean)[^)]*\)/gi, "")
          .replace(/\s*\[[^\]]*\]/g, "")
          .replace(/[^a-z0-9\u00C0-\u017F]/gi, "");
        const artistParts = `${rawArtist || ""},${featMatches.join(",")}`
          .toLowerCase()
          .split(/\s*(?:,|&|\bfeat\.?\b|\bft\.?\b|\bwith\b|\bx\b|\/|;)\s*/i)
          .map(p => p.replace(/[^a-z0-9\u00C0-\u017F]/gi, "").trim())
          .filter(Boolean)
          .sort();
        const uniqueArtists = Array.from(new Set(artistParts)).join("+");
        return `${cleanTitle}|${uniqueArtists}`;
      }

      function isOriginalStudioTrackClient(title = "", artist = "", durationStr = "") {
        const text = `${title} ${artist}`.toLowerCase();
        if (/\b(remix|rework|bootleg|mashup|karaok[eê]|tribute|originally performed|in the style of|8-bit|lullaby|live at|live from|live in|ao vivo|en vivo|superturn[eê]|ac[uú]stico|acoustic|unplugged|instrumental|acapella|sped up|speed up|slowed|nightcore|8d audio|par[oó]dia|rehearsal|commentary|voice memo)\b/i.test(text)) {
          return false;
        }
        if (/[([]\s*[^)\]]*\b(live|ao vivo|remix|karaok[eê]|acoustic|ac[uú]stico|instrumental|sped up|slowed|demo)\b[^)\]]*[)\]]/i.test(String(title || ""))) {
          return false;
        }
        if (durationStr && typeof durationStr === "string" && durationStr.includes(":")) {
          const parts = durationStr.split(":");
          const sec = (parseInt(parts[0]) || 0) * 60 + (parseInt(parts[1]) || 0);
          if (sec > 0 && sec < 60) return false;
        }
        return true;
      }

      function deduplicateTracks(tracks) {
        if (!Array.isArray(tracks)) return [];
        if (window.MiadoMusicResolver && typeof window.MiadoMusicResolver.deduplicateStudioTracks === "function") {
          return window.MiadoMusicResolver.deduplicateStudioTracks(tracks);
        }
        const bestByKey = new Map();
        const parseDurSec = (dur) => {
          if (typeof dur === "number" && Number.isFinite(dur)) return dur > 1000 ? Math.round(dur / 1000) : Math.round(dur);
          if (typeof dur === "string" && dur.includes(":")) {
            const p = dur.split(":");
            return (parseInt(p[0], 10) || 0) * 60 + (parseInt(p[1], 10) || 0);
          }
          return 210;
        };
        const scoreCandidate = (tr) => {
          const sec = parseDurSec(tr.duration);
          let sc = 100;
          if (sec >= 150 && sec <= 270) sc += 45;
          else if (sec >= 120 && sec <= 330) sc += 25;
          else if (sec > 360) sc -= 30;
          sc -= Math.abs(sec - 210) * 0.12;
          if (!/[(\[\-].*(version|edit|mix|deluxe|bonus|explicit|clean)/i.test(String(tr.title || ""))) sc += 20;
          return sc;
        };
        for (const t of tracks) {
          if (!t || !t.title) continue;
          if (!isOriginalStudioTrackClient(t.title, t.artist, t.duration)) continue;
          const key = normalizeTrackKey(t.title, t.artist);
          t.coverUrl = ensureTrackCoverUrl(t, t.title, t.artist);
          const cleanStream = `/api/stream?title=${encodeURIComponent(t.title || "")}&artist=${encodeURIComponent(t.artist || "")}&preferFull=1`;
          t.streamUrl = cleanStream;
          t.previewUrl = cleanStream;
          t.versionType = "Studio Version";
          delete t.rawPreviewUrl;
          const candidateScore = scoreCandidate(t);
          if (!bestByKey.has(key)) {
            bestByKey.set(key, { track: t, score: candidateScore });
          } else {
            const existing = bestByKey.get(key);
            if (candidateScore > existing.score) {
              bestByKey.set(key, { track: t, score: candidateScore });
            }
          }
        }
        return Array.from(bestByKey.values()).map((entry) => entry.track);
      }

      // Corrige álbuns do PRELOADED_SEED com suas tracklists reais completas e na ordem oficial de estúdio (>= 95s, sem intros curtas ou remixes)
      (function patchPreloadedSeedAlbums() {
        const chromaticaCover = (PRELOADED_SEED.gaga_chromatica && PRELOADED_SEED.gaga_chromatica.coverUrl) || "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/5d/4d/f9/5d4df96a-e95e-2fe9-404a-5d570513762d/20UMGIM15390.rgb.jpg/1000x1000bb.jpg";
        PRELOADED_SEED.gaga_chromatica = {
          coverUrl: chromaticaCover,
          tracks: [
            { id: "1500952422", title: "Alice", artist: "Lady Gaga", albumTitle: "Chromatica", albumId: "gaga_chromatica", duration: "2:57", trackNumber: 1, genre: "Pop", year: 2020, coverUrl: chromaticaCover, previewUrl: "/api/stream?title=Alice&artist=Lady%20Gaga&preferFull=1", streamUrl: "/api/stream?title=Alice&artist=Lady%20Gaga&preferFull=1", popular: true },
            { id: "1500952423", title: "Stupid Love", artist: "Lady Gaga", albumTitle: "Chromatica", albumId: "gaga_chromatica", duration: "3:13", trackNumber: 2, genre: "Pop", year: 2020, coverUrl: chromaticaCover, previewUrl: "/api/stream?title=Stupid%20Love&artist=Lady%20Gaga&preferFull=1", streamUrl: "/api/stream?title=Stupid%20Love&artist=Lady%20Gaga&preferFull=1", popular: true },
            { id: "1500952424", title: "Rain On Me", artist: "Lady Gaga & Ariana Grande", albumTitle: "Chromatica", albumId: "gaga_chromatica", duration: "3:02", trackNumber: 3, genre: "Pop", year: 2020, coverUrl: chromaticaCover, previewUrl: "/api/stream?title=Rain%20On%20Me&artist=Lady%20Gaga&preferFull=1", streamUrl: "/api/stream?title=Rain%20On%20Me&artist=Lady%20Gaga&preferFull=1", popular: true },
            { id: "1500952429", title: "Free Woman", artist: "Lady Gaga", albumTitle: "Chromatica", albumId: "gaga_chromatica", duration: "3:11", trackNumber: 4, genre: "Pop", year: 2020, coverUrl: chromaticaCover, previewUrl: "/api/stream?title=Free%20Woman&artist=Lady%20Gaga&preferFull=1", streamUrl: "/api/stream?title=Free%20Woman&artist=Lady%20Gaga&preferFull=1", popular: false },
            { id: "1500952430", title: "Fun Tonight", artist: "Lady Gaga", albumTitle: "Chromatica", albumId: "gaga_chromatica", duration: "2:53", trackNumber: 5, genre: "Pop", year: 2020, coverUrl: chromaticaCover, previewUrl: "/api/stream?title=Fun%20Tonight&artist=Lady%20Gaga&preferFull=1", streamUrl: "/api/stream?title=Fun%20Tonight&artist=Lady%20Gaga&preferFull=1", popular: false },
            { id: "1500952435", title: "911", artist: "Lady Gaga", albumTitle: "Chromatica", albumId: "gaga_chromatica", duration: "2:52", trackNumber: 6, genre: "Pop", year: 2020, coverUrl: chromaticaCover, previewUrl: "/api/stream?title=911&artist=Lady%20Gaga&preferFull=1", streamUrl: "/api/stream?title=911&artist=Lady%20Gaga&preferFull=1", popular: true },
            { id: "1500952436", title: "Plastic Doll", artist: "Lady Gaga", albumTitle: "Chromatica", albumId: "gaga_chromatica", duration: "3:41", trackNumber: 7, genre: "Pop", year: 2020, coverUrl: chromaticaCover, previewUrl: "/api/stream?title=Plastic%20Doll&artist=Lady%20Gaga&preferFull=1", streamUrl: "/api/stream?title=Plastic%20Doll&artist=Lady%20Gaga&preferFull=1", popular: false },
            { id: "1500952438", title: "Sour Candy", artist: "Lady Gaga & BLACKPINK", albumTitle: "Chromatica", albumId: "gaga_chromatica", duration: "2:37", trackNumber: 8, genre: "Pop", year: 2020, coverUrl: chromaticaCover, previewUrl: "/api/stream?title=Sour%20Candy&artist=Lady%20Gaga&preferFull=1", streamUrl: "/api/stream?title=Sour%20Candy&artist=Lady%20Gaga&preferFull=1", popular: true },
            { id: "1500952441", title: "Enigma", artist: "Lady Gaga", albumTitle: "Chromatica", albumId: "gaga_chromatica", duration: "2:59", trackNumber: 9, genre: "Pop", year: 2020, coverUrl: chromaticaCover, previewUrl: "/api/stream?title=Enigma&artist=Lady%20Gaga&preferFull=1", streamUrl: "/api/stream?title=Enigma&artist=Lady%20Gaga&preferFull=1", popular: false },
            { id: "1500952442", title: "Replay", artist: "Lady Gaga", albumTitle: "Chromatica", albumId: "gaga_chromatica", duration: "3:06", trackNumber: 10, genre: "Pop", year: 2020, coverUrl: chromaticaCover, previewUrl: "/api/stream?title=Replay&artist=Lady%20Gaga&preferFull=1", streamUrl: "/api/stream?title=Replay&artist=Lady%20Gaga&preferFull=1", popular: false },
            { id: "1500952444", title: "Sine From Above", artist: "Lady Gaga & Elton John", albumTitle: "Chromatica", albumId: "gaga_chromatica", duration: "4:04", trackNumber: 11, genre: "Pop", year: 2020, coverUrl: chromaticaCover, previewUrl: "/api/stream?title=Sine%20From%20Above&artist=Lady%20Gaga&preferFull=1", streamUrl: "/api/stream?title=Sine%20From%20Above&artist=Lady%20Gaga&preferFull=1", popular: false },
            { id: "1500952446", title: "1000 Doves", artist: "Lady Gaga", albumTitle: "Chromatica", albumId: "gaga_chromatica", duration: "3:35", trackNumber: 12, genre: "Pop", year: 2020, coverUrl: chromaticaCover, previewUrl: "/api/stream?title=1000%20Doves&artist=Lady%20Gaga&preferFull=1", streamUrl: "/api/stream?title=1000%20Doves&artist=Lady%20Gaga&preferFull=1", popular: false },
            { id: "1500952448", title: "Babylon", artist: "Lady Gaga", albumTitle: "Chromatica", albumId: "gaga_chromatica", duration: "2:41", trackNumber: 13, genre: "Pop", year: 2020, coverUrl: chromaticaCover, previewUrl: "/api/stream?title=Babylon&artist=Lady%20Gaga&preferFull=1", streamUrl: "/api/stream?title=Babylon&artist=Lady%20Gaga&preferFull=1", popular: false }
          ]
        };

        const weekndCover = (PRELOADED_SEED.weeknd_after_hours && PRELOADED_SEED.weeknd_after_hours.coverUrl) || "https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/2b/b9/fe/2bb9fef5-d8f3-8345-25a9-db0f79f1e4c0/20UMGIM11048.rgb.jpg/1000x1000bb.jpg";
        PRELOADED_SEED.weeknd_after_hours = {
          coverUrl: weekndCover,
          tracks: [
            { id: "1499378601", title: "Alone Again", artist: "The Weeknd", albumTitle: "After Hours", albumId: "weeknd_after_hours", duration: "4:10", trackNumber: 1, genre: "R&B / Synthwave", year: 2020, coverUrl: weekndCover, previewUrl: "/api/stream?title=Alone%20Again&artist=The%20Weeknd&preferFull=1", streamUrl: "/api/stream?title=Alone%20Again&artist=The%20Weeknd&preferFull=1", popular: false },
            { id: "1499378602", title: "Too Late", artist: "The Weeknd", albumTitle: "After Hours", albumId: "weeknd_after_hours", duration: "3:59", trackNumber: 2, genre: "R&B / Synthwave", year: 2020, coverUrl: weekndCover, previewUrl: "/api/stream?title=Too%20Late&artist=The%20Weeknd&preferFull=1", streamUrl: "/api/stream?title=Too%20Late&artist=The%20Weeknd&preferFull=1", popular: false },
            { id: "1499378603", title: "Hardest To Love", artist: "The Weeknd", albumTitle: "After Hours", albumId: "weeknd_after_hours", duration: "3:31", trackNumber: 3, genre: "R&B / Synthwave", year: 2020, coverUrl: weekndCover, previewUrl: "/api/stream?title=Hardest%20To%20Love&artist=The%20Weeknd&preferFull=1", streamUrl: "/api/stream?title=Hardest%20To%20Love&artist=The%20Weeknd&preferFull=1", popular: false },
            { id: "1499378604", title: "Scared To Live", artist: "The Weeknd", albumTitle: "After Hours", albumId: "weeknd_after_hours", duration: "3:11", trackNumber: 4, genre: "R&B / Synthwave", year: 2020, coverUrl: weekndCover, previewUrl: "/api/stream?title=Scared%20To%20Live&artist=The%20Weeknd&preferFull=1", streamUrl: "/api/stream?title=Scared%20To%20Live&artist=The%20Weeknd&preferFull=1", popular: false },
            { id: "1499378605", title: "Snowchild", artist: "The Weeknd", albumTitle: "After Hours", albumId: "weeknd_after_hours", duration: "4:07", trackNumber: 5, genre: "R&B / Synthwave", year: 2020, coverUrl: weekndCover, previewUrl: "/api/stream?title=Snowchild&artist=The%20Weeknd&preferFull=1", streamUrl: "/api/stream?title=Snowchild&artist=The%20Weeknd&preferFull=1", popular: false },
            { id: "1499378606", title: "Escape From LA", artist: "The Weeknd", albumTitle: "After Hours", albumId: "weeknd_after_hours", duration: "5:55", trackNumber: 6, genre: "R&B / Synthwave", year: 2020, coverUrl: weekndCover, previewUrl: "/api/stream?title=Escape%20From%20LA&artist=The%20Weeknd&preferFull=1", streamUrl: "/api/stream?title=Escape%20From%20LA&artist=The%20Weeknd&preferFull=1", popular: false },
            { id: "1499378613", title: "Heartless", artist: "The Weeknd", albumTitle: "After Hours", albumId: "weeknd_after_hours", duration: "3:18", trackNumber: 7, genre: "R&B / Synthwave", year: 2020, coverUrl: weekndCover, previewUrl: "/api/stream?title=Heartless&artist=The%20Weeknd&preferFull=1", streamUrl: "/api/stream?title=Heartless&artist=The%20Weeknd&preferFull=1", popular: true },
            { id: "1499378614", title: "Faith", artist: "The Weeknd", albumTitle: "After Hours", albumId: "weeknd_after_hours", duration: "4:43", trackNumber: 8, genre: "R&B / Synthwave", year: 2020, coverUrl: weekndCover, previewUrl: "/api/stream?title=Faith&artist=The%20Weeknd&preferFull=1", streamUrl: "/api/stream?title=Faith&artist=The%20Weeknd&preferFull=1", popular: false },
            { id: "1499378615", title: "Blinding Lights", artist: "The Weeknd", albumTitle: "After Hours", albumId: "weeknd_after_hours", duration: "3:20", trackNumber: 9, genre: "R&B / Synthwave", year: 2020, coverUrl: weekndCover, previewUrl: "/api/stream?title=Blinding%20Lights&artist=The%20Weeknd&preferFull=1", streamUrl: "/api/stream?title=Blinding%20Lights&artist=The%20Weeknd&preferFull=1", popular: true },
            { id: "1499378616", title: "In Your Eyes", artist: "The Weeknd", albumTitle: "After Hours", albumId: "weeknd_after_hours", duration: "3:57", trackNumber: 10, genre: "R&B / Synthwave", year: 2020, coverUrl: weekndCover, previewUrl: "/api/stream?title=In%20Your%20Eyes&artist=The%20Weeknd&preferFull=1", streamUrl: "/api/stream?title=In%20Your%20Eyes&artist=The%20Weeknd&preferFull=1", popular: true },
            { id: "1499378617", title: "Save Your Tears", artist: "The Weeknd", albumTitle: "After Hours", albumId: "weeknd_after_hours", duration: "3:35", trackNumber: 11, genre: "R&B / Synthwave", year: 2020, coverUrl: weekndCover, previewUrl: "/api/stream?title=Save%20Your%20Tears&artist=The%20Weeknd&preferFull=1", streamUrl: "/api/stream?title=Save%20Your%20Tears&artist=The%20Weeknd&preferFull=1", popular: true },
            { id: "1499378619", title: "After Hours", artist: "The Weeknd", albumTitle: "After Hours", albumId: "weeknd_after_hours", duration: "6:01", trackNumber: 12, genre: "R&B / Synthwave", year: 2020, coverUrl: weekndCover, previewUrl: "/api/stream?title=After%20Hours&artist=The%20Weeknd&preferFull=1", streamUrl: "/api/stream?title=After%20Hours&artist=The%20Weeknd&preferFull=1", popular: true },
            { id: "1499378620", title: "Until I Bleed Out", artist: "The Weeknd", albumTitle: "After Hours", albumId: "weeknd_after_hours", duration: "3:10", trackNumber: 13, genre: "R&B / Synthwave", year: 2020, coverUrl: weekndCover, previewUrl: "/api/stream?title=Until%20I%20Bleed%20Out&artist=The%20Weeknd&preferFull=1", streamUrl: "/api/stream?title=Until%20I%20Bleed%20Out&artist=The%20Weeknd&preferFull=1", popular: false }
          ]
        };

        const duaCover = (PRELOADED_SEED.dua_future_nostalgia && PRELOADED_SEED.dua_future_nostalgia.coverUrl) || "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/7b/22/88/7b228862-a2c0-74eb-75a1-7e592ef69d08/190295140960.jpg/1000x1000bb.jpg";
        PRELOADED_SEED.dua_future_nostalgia = {
          coverUrl: duaCover,
          tracks: [
            { id: "1538003495", title: "Future Nostalgia", artist: "Dua Lipa", albumTitle: "Future Nostalgia", albumId: "dua_future_nostalgia", duration: "3:04", trackNumber: 1, genre: "Disco-Pop", year: 2020, coverUrl: duaCover, previewUrl: "/api/stream?title=Future%20Nostalgia&artist=Dua%20Lipa&preferFull=1", streamUrl: "/api/stream?title=Future%20Nostalgia&artist=Dua%20Lipa&preferFull=1", popular: false },
            { id: "1538003497", title: "Don't Start Now", artist: "Dua Lipa", albumTitle: "Future Nostalgia", albumId: "dua_future_nostalgia", duration: "3:03", trackNumber: 2, genre: "Disco-Pop", year: 2020, coverUrl: duaCover, previewUrl: "/api/stream?title=Don%27t%20Start%20Now&artist=Dua%20Lipa&preferFull=1", streamUrl: "/api/stream?title=Don%27t%20Start%20Now&artist=Dua%20Lipa&preferFull=1", popular: true },
            { id: "1538003498", title: "Cool", artist: "Dua Lipa", albumTitle: "Future Nostalgia", albumId: "dua_future_nostalgia", duration: "3:29", trackNumber: 3, genre: "Disco-Pop", year: 2020, coverUrl: duaCover, previewUrl: "/api/stream?title=Cool&artist=Dua%20Lipa&preferFull=1", streamUrl: "/api/stream?title=Cool&artist=Dua%20Lipa&preferFull=1", popular: false },
            { id: "1538003499", title: "Physical", artist: "Dua Lipa", albumTitle: "Future Nostalgia", albumId: "dua_future_nostalgia", duration: "3:13", trackNumber: 4, genre: "Disco-Pop", year: 2020, coverUrl: duaCover, previewUrl: "/api/stream?title=Physical&artist=Dua%20Lipa&preferFull=1", streamUrl: "/api/stream?title=Physical&artist=Dua%20Lipa&preferFull=1", popular: true },
            { id: "1538003500", title: "Levitating", artist: "Dua Lipa", albumTitle: "Future Nostalgia", albumId: "dua_future_nostalgia", duration: "3:23", trackNumber: 5, genre: "Disco-Pop", year: 2020, coverUrl: duaCover, previewUrl: "/api/stream?title=Levitating&artist=Dua%20Lipa&preferFull=1", streamUrl: "/api/stream?title=Levitating&artist=Dua%20Lipa&preferFull=1", popular: true },
            { id: "1538003501", title: "Pretty Please", artist: "Dua Lipa", albumTitle: "Future Nostalgia", albumId: "dua_future_nostalgia", duration: "3:14", trackNumber: 6, genre: "Disco-Pop", year: 2020, coverUrl: duaCover, previewUrl: "/api/stream?title=Pretty%20Please&artist=Dua%20Lipa&preferFull=1", streamUrl: "/api/stream?title=Pretty%20Please&artist=Dua%20Lipa&preferFull=1", popular: false },
            { id: "1538003502", title: "Hallucinate", artist: "Dua Lipa", albumTitle: "Future Nostalgia", albumId: "dua_future_nostalgia", duration: "3:28", trackNumber: 7, genre: "Disco-Pop", year: 2020, coverUrl: duaCover, previewUrl: "/api/stream?title=Hallucinate&artist=Dua%20Lipa&preferFull=1", streamUrl: "/api/stream?title=Hallucinate&artist=Dua%20Lipa&preferFull=1", popular: false },
            { id: "1538003503", title: "Love Again", artist: "Dua Lipa", albumTitle: "Future Nostalgia", albumId: "dua_future_nostalgia", duration: "4:18", trackNumber: 8, genre: "Disco-Pop", year: 2020, coverUrl: duaCover, previewUrl: "/api/stream?title=Love%20Again&artist=Dua%20Lipa&preferFull=1", streamUrl: "/api/stream?title=Love%20Again&artist=Dua%20Lipa&preferFull=1", popular: false },
            { id: "1538003504", title: "Break My Heart", artist: "Dua Lipa", albumTitle: "Future Nostalgia", albumId: "dua_future_nostalgia", duration: "3:41", trackNumber: 9, genre: "Disco-Pop", year: 2020, coverUrl: duaCover, previewUrl: "/api/stream?title=Break%20My%20Heart&artist=Dua%20Lipa&preferFull=1", streamUrl: "/api/stream?title=Break%20My%20Heart&artist=Dua%20Lipa&preferFull=1", popular: true },
            { id: "1538003505", title: "Good In Bed", artist: "Dua Lipa", albumTitle: "Future Nostalgia", albumId: "dua_future_nostalgia", duration: "3:38", trackNumber: 10, genre: "Disco-Pop", year: 2020, coverUrl: duaCover, previewUrl: "/api/stream?title=Good%20In%20Bed&artist=Dua%20Lipa&preferFull=1", streamUrl: "/api/stream?title=Good%20In%20Bed&artist=Dua%20Lipa&preferFull=1", popular: false },
            { id: "1538003506", title: "Boys Will Be Boys", artist: "Dua Lipa", albumTitle: "Future Nostalgia", albumId: "dua_future_nostalgia", duration: "2:46", trackNumber: 11, genre: "Disco-Pop", year: 2020, coverUrl: duaCover, previewUrl: "/api/stream?title=Boys%20Will%20Be%20Boys&artist=Dua%20Lipa&preferFull=1", streamUrl: "/api/stream?title=Boys%20Will%20Be%20Boys&artist=Dua%20Lipa&preferFull=1", popular: false }
          ]
        };

        const lanaCover = (PRELOADED_SEED.lana_born_to_die && PRELOADED_SEED.lana_born_to_die.coverUrl) || "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/5f/b1/e0/5fb1e0b8-c912-6620-6282-932807024715/12UMGIM01914.rgb.jpg/1000x1000bb.jpg";
        PRELOADED_SEED.lana_born_to_die = {
          coverUrl: lanaCover,
          tracks: [
            { id: "1440809551", title: "Born to Die", artist: "Lana Del Rey", albumTitle: "Born to Die", albumId: "lana_born_to_die", duration: "4:46", trackNumber: 1, genre: "Indie Pop", year: 2012, coverUrl: lanaCover, previewUrl: "/api/stream?title=Born%20to%20Die&artist=Lana%20Del%20Rey&preferFull=1", streamUrl: "/api/stream?title=Born%20to%20Die&artist=Lana%20Del%20Rey&preferFull=1", popular: true },
            { id: "1440809553", title: "Off to the Races", artist: "Lana Del Rey", albumTitle: "Born to Die", albumId: "lana_born_to_die", duration: "5:00", trackNumber: 2, genre: "Indie Pop", year: 2012, coverUrl: lanaCover, previewUrl: "/api/stream?title=Off%20to%20the%20Races&artist=Lana%20Del%20Rey&preferFull=1", streamUrl: "/api/stream?title=Off%20to%20the%20Races&artist=Lana%20Del%20Rey&preferFull=1", popular: false },
            { id: "1440809556", title: "Blue Jeans", artist: "Lana Del Rey", albumTitle: "Born to Die", albumId: "lana_born_to_die", duration: "3:30", trackNumber: 3, genre: "Indie Pop", year: 2012, coverUrl: lanaCover, previewUrl: "/api/stream?title=Blue%20Jeans&artist=Lana%20Del%20Rey&preferFull=1", streamUrl: "/api/stream?title=Blue%20Jeans&artist=Lana%20Del%20Rey&preferFull=1", popular: true },
            { id: "1440809558", title: "Video Games", artist: "Lana Del Rey", albumTitle: "Born to Die", albumId: "lana_born_to_die", duration: "4:42", trackNumber: 4, genre: "Indie Pop", year: 2012, coverUrl: lanaCover, previewUrl: "/api/stream?title=Video%20Games&artist=Lana%20Del%20Rey&preferFull=1", streamUrl: "/api/stream?title=Video%20Games&artist=Lana%20Del%20Rey&preferFull=1", popular: true },
            { id: "1440809560", title: "Diet Mountain Dew", artist: "Lana Del Rey", albumTitle: "Born to Die", albumId: "lana_born_to_die", duration: "3:43", trackNumber: 5, genre: "Indie Pop", year: 2012, coverUrl: lanaCover, previewUrl: "/api/stream?title=Diet%20Mountain%20Dew&artist=Lana%20Del%20Rey&preferFull=1", streamUrl: "/api/stream?title=Diet%20Mountain%20Dew&artist=Lana%20Del%20Rey&preferFull=1", popular: false },
            { id: "1440809562", title: "National Anthem", artist: "Lana Del Rey", albumTitle: "Born to Die", albumId: "lana_born_to_die", duration: "3:51", trackNumber: 6, genre: "Indie Pop", year: 2012, coverUrl: lanaCover, previewUrl: "/api/stream?title=National%20Anthem&artist=Lana%20Del%20Rey&preferFull=1", streamUrl: "/api/stream?title=National%20Anthem&artist=Lana%20Del%20Rey&preferFull=1", popular: false },
            { id: "1440809565", title: "Dark Paradise", artist: "Lana Del Rey", albumTitle: "Born to Die", albumId: "lana_born_to_die", duration: "4:03", trackNumber: 7, genre: "Indie Pop", year: 2012, coverUrl: lanaCover, previewUrl: "/api/stream?title=Dark%20Paradise&artist=Lana%20Del%20Rey&preferFull=1", streamUrl: "/api/stream?title=Dark%20Paradise&artist=Lana%20Del%20Rey&preferFull=1", popular: false },
            { id: "1440809567", title: "Radio", artist: "Lana Del Rey", albumTitle: "Born to Die", albumId: "lana_born_to_die", duration: "3:34", trackNumber: 8, genre: "Indie Pop", year: 2012, coverUrl: lanaCover, previewUrl: "/api/stream?title=Radio&artist=Lana%20Del%20Rey&preferFull=1", streamUrl: "/api/stream?title=Radio&artist=Lana%20Del%20Rey&preferFull=1", popular: false },
            { id: "1440809569", title: "Carmen", artist: "Lana Del Rey", albumTitle: "Born to Die", albumId: "lana_born_to_die", duration: "4:08", trackNumber: 9, genre: "Indie Pop", year: 2012, coverUrl: lanaCover, previewUrl: "/api/stream?title=Carmen&artist=Lana%20Del%20Rey&preferFull=1", streamUrl: "/api/stream?title=Carmen&artist=Lana%20Del%20Rey&preferFull=1", popular: false },
            { id: "1440809850", title: "Summertime Sadness", artist: "Lana Del Rey", albumTitle: "Born to Die", albumId: "lana_born_to_die", duration: "4:25", trackNumber: 11, genre: "Indie Pop", year: 2012, coverUrl: lanaCover, previewUrl: "/api/stream?title=Summertime%20Sadness&artist=Lana%20Del%20Rey&preferFull=1", streamUrl: "/api/stream?title=Summertime%20Sadness&artist=Lana%20Del%20Rey&preferFull=1", popular: true }
          ]
        };

        const billieCover = (PRELOADED_SEED.billie_hmhas && PRELOADED_SEED.billie_hmhas.coverUrl) || "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/92/9f/69/929f69f1-9977-3a44-d674-11f70c852d1b/24UMGIM36186.rgb.jpg/1000x1000bb.jpg";
        PRELOADED_SEED.billie_hmhas = {
          coverUrl: billieCover,
          tracks: [
            { id: "1739659135", title: "SKINNY", artist: "Billie Eilish", albumTitle: "HIT ME HARD AND SOFT", albumId: "billie_hmhas", duration: "3:39", trackNumber: 1, genre: "Alt-Pop / Indie", year: 2024, coverUrl: billieCover, previewUrl: "/api/stream?title=SKINNY&artist=Billie%20Eilish&preferFull=1", streamUrl: "/api/stream?title=SKINNY&artist=Billie%20Eilish&preferFull=1", popular: false },
            { id: "1739659138", title: "LUNCH", artist: "Billie Eilish", albumTitle: "HIT ME HARD AND SOFT", albumId: "billie_hmhas", duration: "2:59", trackNumber: 2, genre: "Alt-Pop / Indie", year: 2024, coverUrl: billieCover, previewUrl: "/api/stream?title=LUNCH&artist=Billie%20Eilish&preferFull=1", streamUrl: "/api/stream?title=LUNCH&artist=Billie%20Eilish&preferFull=1", popular: true },
            { id: "1739659140", title: "CHIHIRO", artist: "Billie Eilish", albumTitle: "HIT ME HARD AND SOFT", albumId: "billie_hmhas", duration: "5:03", trackNumber: 3, genre: "Alt-Pop / Indie", year: 2024, coverUrl: billieCover, previewUrl: "/api/stream?title=CHIHIRO&artist=Billie%20Eilish&preferFull=1", streamUrl: "/api/stream?title=CHIHIRO&artist=Billie%20Eilish&preferFull=1", popular: true },
            { id: "1739659142", title: "BIRDS OF A FEATHER", artist: "Billie Eilish", albumTitle: "HIT ME HARD AND SOFT", albumId: "billie_hmhas", duration: "3:30", trackNumber: 4, genre: "Alt-Pop / Indie", year: 2024, coverUrl: billieCover, previewUrl: "/api/stream?title=BIRDS%20OF%20A%20FEATHER&artist=Billie%20Eilish&preferFull=1", streamUrl: "/api/stream?title=BIRDS%20OF%20A%20FEATHER&artist=Billie%20Eilish&preferFull=1", popular: true },
            { id: "1739659145", title: "WILDFLOWER", artist: "Billie Eilish", albumTitle: "HIT ME HARD AND SOFT", albumId: "billie_hmhas", duration: "4:21", trackNumber: 5, genre: "Alt-Pop / Indie", year: 2024, coverUrl: billieCover, previewUrl: "/api/stream?title=WILDFLOWER&artist=Billie%20Eilish&preferFull=1", streamUrl: "/api/stream?title=WILDFLOWER&artist=Billie%20Eilish&preferFull=1", popular: true },
            { id: "1739659147", title: "THE GREATEST", artist: "Billie Eilish", albumTitle: "HIT ME HARD AND SOFT", albumId: "billie_hmhas", duration: "4:53", trackNumber: 6, genre: "Alt-Pop / Indie", year: 2024, coverUrl: billieCover, previewUrl: "/api/stream?title=THE%20GREATEST&artist=Billie%20Eilish&preferFull=1", streamUrl: "/api/stream?title=THE%20GREATEST&artist=Billie%20Eilish&preferFull=1", popular: false },
            { id: "1739659149", title: "L'AMOUR DE MA VIE", artist: "Billie Eilish", albumTitle: "HIT ME HARD AND SOFT", albumId: "billie_hmhas", duration: "5:33", trackNumber: 7, genre: "Alt-Pop / Indie", year: 2024, coverUrl: billieCover, previewUrl: "/api/stream?title=L%27AMOUR%20DE%20MA%20VIE&artist=Billie%20Eilish&preferFull=1", streamUrl: "/api/stream?title=L%27AMOUR%20DE%20MA%20VIE&artist=Billie%20Eilish&preferFull=1", popular: true },
            { id: "1739659151", title: "THE DINER", artist: "Billie Eilish", albumTitle: "HIT ME HARD AND SOFT", albumId: "billie_hmhas", duration: "3:06", trackNumber: 8, genre: "Alt-Pop / Indie", year: 2024, coverUrl: billieCover, previewUrl: "/api/stream?title=THE%20DINER&artist=Billie%20Eilish&preferFull=1", streamUrl: "/api/stream?title=THE%20DINER&artist=Billie%20Eilish&preferFull=1", popular: false },
            { id: "1739659153", title: "BITTERSUITE", artist: "Billie Eilish", albumTitle: "HIT ME HARD AND SOFT", albumId: "billie_hmhas", duration: "4:58", trackNumber: 9, genre: "Alt-Pop / Indie", year: 2024, coverUrl: billieCover, previewUrl: "/api/stream?title=BITTERSUITE&artist=Billie%20Eilish&preferFull=1", streamUrl: "/api/stream?title=BITTERSUITE&artist=Billie%20Eilish&preferFull=1", popular: false },
            { id: "1739659155", title: "BLUE", artist: "Billie Eilish", albumTitle: "HIT ME HARD AND SOFT", albumId: "billie_hmhas", duration: "5:43", trackNumber: 10, genre: "Alt-Pop / Indie", year: 2024, coverUrl: billieCover, previewUrl: "/api/stream?title=BLUE&artist=Billie%20Eilish&preferFull=1", streamUrl: "/api/stream?title=BLUE&artist=Billie%20Eilish&preferFull=1", popular: true }
          ]
        };

        const mayhemCover = "/api/cover?title=MAYHEM&artist=Lady+Gaga";
        PRELOADED_SEED.gaga_mayhem = {
          coverUrl: mayhemCover,
          tracks: [
            { id: "1792667001", title: "Disease", artist: "Lady Gaga", albumTitle: "MAYHEM", albumId: "gaga_mayhem", duration: "3:49", trackNumber: 1, genre: "Dark Pop / Synth-Pop", year: 2025, coverUrl: mayhemCover, previewUrl: "/api/stream?title=Disease&artist=Lady%20Gaga&preferFull=1", streamUrl: "/api/stream?title=Disease&artist=Lady%20Gaga&preferFull=1", popular: true },
            { id: "1792667005", title: "Abracadabra", artist: "Lady Gaga", albumTitle: "MAYHEM", albumId: "gaga_mayhem", duration: "3:43", trackNumber: 2, genre: "Dark Pop / Dance", year: 2025, coverUrl: mayhemCover, previewUrl: "/api/stream?title=Abracadabra&artist=Lady%20Gaga&preferFull=1", streamUrl: "/api/stream?title=Abracadabra&artist=Lady%20Gaga&preferFull=1", popular: true },
            { id: "1792667009", title: "Garden of Eden", artist: "Lady Gaga", albumTitle: "MAYHEM", albumId: "gaga_mayhem", duration: "3:59", trackNumber: 3, genre: "Electropop", year: 2025, coverUrl: mayhemCover, previewUrl: "/api/stream?title=Garden%20of%20Eden&artist=Lady%20Gaga&preferFull=1", streamUrl: "/api/stream?title=Garden%20of%20Eden&artist=Lady%20Gaga&preferFull=1", popular: true },
            { id: "1792667012", title: "Perfect Celebrity", artist: "Lady Gaga", albumTitle: "MAYHEM", albumId: "gaga_mayhem", duration: "3:49", trackNumber: 4, genre: "Synth-Rock", year: 2025, coverUrl: mayhemCover, previewUrl: "/api/stream?title=Perfect%20Celebrity&artist=Lady%20Gaga&preferFull=1", streamUrl: "/api/stream?title=Perfect%20Celebrity&artist=Lady%20Gaga&preferFull=1", popular: false },
            { id: "1792667015", title: "Vanish Into You", artist: "Lady Gaga", albumTitle: "MAYHEM", albumId: "gaga_mayhem", duration: "4:04", trackNumber: 5, genre: "Pop", year: 2025, coverUrl: mayhemCover, previewUrl: "/api/stream?title=Vanish%20Into%20You&artist=Lady%20Gaga&preferFull=1", streamUrl: "/api/stream?title=Vanish%20Into%20You&artist=Lady%20Gaga&preferFull=1", popular: false },
            { id: "1792667022", title: "Die With A Smile", artist: "Lady Gaga & Bruno Mars", albumTitle: "MAYHEM", albumId: "gaga_mayhem", duration: "4:11", trackNumber: 6, genre: "Pop / Soul", year: 2025, coverUrl: mayhemCover, previewUrl: "/api/stream?title=Die%20With%20A%20Smile&artist=Lady%20Gaga&preferFull=1", streamUrl: "/api/stream?title=Die%20With%20A%20Smile&artist=Lady%20Gaga&preferFull=1", popular: true }
          ]
        };

        const hutCover = "/api/cover?title=Hurry+Up+Tomorrow&artist=The+Weeknd";
        PRELOADED_SEED.weeknd_hut = {
          coverUrl: hutCover,
          tracks: [
            { id: "1793001001", title: "Wake Me Up", artist: "The Weeknd", albumTitle: "Hurry Up Tomorrow", albumId: "weeknd_hut", duration: "5:08", trackNumber: 1, genre: "Synthwave / R&B", year: 2025, coverUrl: hutCover, previewUrl: "/api/stream?title=Wake%20Me%20Up&artist=The%20Weeknd&preferFull=1", streamUrl: "/api/stream?title=Wake%20Me%20Up&artist=The%20Weeknd&preferFull=1", popular: true },
            { id: "1793001002", title: "Cry For Me", artist: "The Weeknd", albumTitle: "Hurry Up Tomorrow", albumId: "weeknd_hut", duration: "3:44", trackNumber: 2, genre: "Synthwave / R&B", year: 2025, coverUrl: hutCover, previewUrl: "/api/stream?title=Cry%20For%20Me&artist=The%20Weeknd&preferFull=1", streamUrl: "/api/stream?title=Cry%20For%20Me&artist=The%20Weeknd&preferFull=1", popular: true },
            { id: "1793001004", title: "São Paulo", artist: "The Weeknd & Anitta", albumTitle: "Hurry Up Tomorrow", albumId: "weeknd_hut", duration: "5:01", trackNumber: 3, genre: "Brazilian Funk / Synth", year: 2025, coverUrl: hutCover, previewUrl: "/api/stream?title=S%C3%A3o%20Paulo&artist=The%20Weeknd&preferFull=1", streamUrl: "/api/stream?title=S%C3%A3o%20Paulo&artist=The%20Weeknd&preferFull=1", popular: true },
            { id: "1793001008", title: "Timeless", artist: "The Weeknd & Playboi Carti", albumTitle: "Hurry Up Tomorrow", albumId: "weeknd_hut", duration: "4:16", trackNumber: 4, genre: "R&B / Trap", year: 2025, coverUrl: hutCover, previewUrl: "/api/stream?title=Timeless&artist=The%20Weeknd&preferFull=1", streamUrl: "/api/stream?title=Timeless&artist=The%20Weeknd&preferFull=1", popular: true },
            { id: "1793001012", title: "Open Hearts", artist: "The Weeknd", albumTitle: "Hurry Up Tomorrow", albumId: "weeknd_hut", duration: "3:54", trackNumber: 5, genre: "Synth-Pop", year: 2025, coverUrl: hutCover, previewUrl: "/api/stream?title=Open%20Hearts&artist=The%20Weeknd&preferFull=1", streamUrl: "/api/stream?title=Open%20Hearts&artist=The%20Weeknd&preferFull=1", popular: true }
          ]
        };

        const sabrinaCover = "/api/cover?title=Short+n+Sweet&artist=Sabrina+Carpenter";
        PRELOADED_SEED.sabrina_sns = {
          coverUrl: sabrinaCover,
          tracks: [
            { id: "sns_1", title: "Taste", artist: "Sabrina Carpenter", albumTitle: "Short n' Sweet", albumId: "sabrina_sns", duration: "2:37", durationSec: 157, trackNumber: 1, genre: "Pop", year: 2024, coverUrl: sabrinaCover, previewUrl: "/api/stream?title=Taste&artist=Sabrina%20Carpenter&preferFull=1&studioOnly=1", streamUrl: "/api/stream?title=Taste&artist=Sabrina%20Carpenter&preferFull=1&studioOnly=1", popular: true },
            { id: "sns_2", title: "Please Please Please", artist: "Sabrina Carpenter", albumTitle: "Short n' Sweet", albumId: "sabrina_sns", duration: "3:06", durationSec: 186, trackNumber: 2, genre: "Pop", year: 2024, coverUrl: sabrinaCover, previewUrl: "/api/stream?title=Please%20Please%20Please&artist=Sabrina%20Carpenter&preferFull=1&studioOnly=1", streamUrl: "/api/stream?title=Please%20Please%20Please&artist=Sabrina%20Carpenter&preferFull=1&studioOnly=1", popular: true },
            { id: "sns_3", title: "Good Graces", artist: "Sabrina Carpenter", albumTitle: "Short n' Sweet", albumId: "sabrina_sns", duration: "3:05", durationSec: 185, trackNumber: 3, genre: "Pop", year: 2024, coverUrl: sabrinaCover, previewUrl: "/api/stream?title=Good%20Graces&artist=Sabrina%20Carpenter&preferFull=1&studioOnly=1", streamUrl: "/api/stream?title=Good%20Graces&artist=Sabrina%20Carpenter&preferFull=1&studioOnly=1", popular: true },
            { id: "sns_4", title: "Sharpest Tool", artist: "Sabrina Carpenter", albumTitle: "Short n' Sweet", albumId: "sabrina_sns", duration: "3:38", durationSec: 218, trackNumber: 4, genre: "Pop / Indie", year: 2024, coverUrl: sabrinaCover, previewUrl: "/api/stream?title=Sharpest%20Tool&artist=Sabrina%20Carpenter&preferFull=1&studioOnly=1", streamUrl: "/api/stream?title=Sharpest%20Tool&artist=Sabrina%20Carpenter&preferFull=1&studioOnly=1", popular: false },
            { id: "sns_5", title: "Coincidence", artist: "Sabrina Carpenter", albumTitle: "Short n' Sweet", albumId: "sabrina_sns", duration: "2:44", durationSec: 164, trackNumber: 5, genre: "Acoustic Pop", year: 2024, coverUrl: sabrinaCover, previewUrl: "/api/stream?title=Coincidence&artist=Sabrina%20Carpenter&preferFull=1&studioOnly=1", streamUrl: "/api/stream?title=Coincidence&artist=Sabrina%20Carpenter&preferFull=1&studioOnly=1", popular: false },
            { id: "sns_6", title: "Bed Chem", artist: "Sabrina Carpenter", albumTitle: "Short n' Sweet", albumId: "sabrina_sns", duration: "2:51", durationSec: 171, trackNumber: 6, genre: "Pop / R&B", year: 2024, coverUrl: sabrinaCover, previewUrl: "/api/stream?title=Bed%20Chem&artist=Sabrina%20Carpenter&preferFull=1&studioOnly=1", streamUrl: "/api/stream?title=Bed%20Chem&artist=Sabrina%20Carpenter&preferFull=1&studioOnly=1", popular: true },
            { id: "sns_7", title: "Espresso", artist: "Sabrina Carpenter", albumTitle: "Short n' Sweet", albumId: "sabrina_sns", duration: "2:55", durationSec: 175, trackNumber: 7, genre: "Disco-Pop", year: 2024, coverUrl: sabrinaCover, previewUrl: "/api/stream?title=Espresso&artist=Sabrina%20Carpenter&preferFull=1&studioOnly=1", streamUrl: "/api/stream?title=Espresso&artist=Sabrina%20Carpenter&preferFull=1&studioOnly=1", popular: true },
            { id: "sns_8", title: "Dumb & Poetic", artist: "Sabrina Carpenter", albumTitle: "Short n' Sweet", albumId: "sabrina_sns", duration: "2:13", durationSec: 133, trackNumber: 8, genre: "Pop", year: 2024, coverUrl: sabrinaCover, previewUrl: "/api/stream?title=Dumb%20%26%20Poetic&artist=Sabrina%20Carpenter&preferFull=1&studioOnly=1", streamUrl: "/api/stream?title=Dumb%20%26%20Poetic&artist=Sabrina%20Carpenter&preferFull=1&studioOnly=1", popular: false },
            { id: "sns_9", title: "Slim Pickins", artist: "Sabrina Carpenter", albumTitle: "Short n' Sweet", albumId: "sabrina_sns", duration: "2:32", durationSec: 152, trackNumber: 9, genre: "Country Pop", year: 2024, coverUrl: sabrinaCover, previewUrl: "/api/stream?title=Slim%20Pickins&artist=Sabrina%20Carpenter&preferFull=1&studioOnly=1", streamUrl: "/api/stream?title=Slim%20Pickins&artist=Sabrina%20Carpenter&preferFull=1&studioOnly=1", popular: false },
            { id: "sns_10", title: "Juno", artist: "Sabrina Carpenter", albumTitle: "Short n' Sweet", albumId: "sabrina_sns", duration: "3:43", durationSec: 223, trackNumber: 10, genre: "Pop", year: 2024, coverUrl: sabrinaCover, previewUrl: "/api/stream?title=Juno&artist=Sabrina%20Carpenter&preferFull=1&studioOnly=1", streamUrl: "/api/stream?title=Juno&artist=Sabrina%20Carpenter&preferFull=1&studioOnly=1", popular: true },
            { id: "sns_11", title: "Lie To Girls", artist: "Sabrina Carpenter", albumTitle: "Short n' Sweet", albumId: "sabrina_sns", duration: "3:22", durationSec: 202, trackNumber: 11, genre: "Pop", year: 2024, coverUrl: sabrinaCover, previewUrl: "/api/stream?title=Lie%20To%20Girls&artist=Sabrina%20Carpenter&preferFull=1&studioOnly=1", streamUrl: "/api/stream?title=Lie%20To%20Girls&artist=Sabrina%20Carpenter&preferFull=1&studioOnly=1", popular: false },
            { id: "sns_12", title: "Don’t Smile", artist: "Sabrina Carpenter", albumTitle: "Short n' Sweet", albumId: "sabrina_sns", duration: "3:26", durationSec: 206, trackNumber: 12, genre: "R&B / Pop", year: 2024, coverUrl: sabrinaCover, previewUrl: "/api/stream?title=Don%E2%80%99t%20Smile&artist=Sabrina%20Carpenter&preferFull=1&studioOnly=1", streamUrl: "/api/stream?title=Don%E2%80%99t%20Smile&artist=Sabrina%20Carpenter&preferFull=1&studioOnly=1", popular: false }
          ]
        };

        const yungCover = "/api/cover?title=Flores+de+Outro+Carnaval&artist=Yung+Lixo";
        PRELOADED_SEED.yung_lixo_flores = {
          coverUrl: yungCover,
          tracks: [
            { id: "yl_flores_1", title: "Flores de Outro Carnaval", artist: "Yung Lixo", albumTitle: "Flores de Outro Carnaval", albumId: "yung_lixo_flores", duration: "4:27", durationSec: 267, trackNumber: 1, genre: "Indie / Rap", year: 2024, coverUrl: yungCover, previewUrl: "/api/stream?title=Flores%20de%20Outro%20Carnaval&artist=Yung%20Lixo&preferFull=1&studioOnly=1", streamUrl: "/api/stream?title=Flores%20de%20Outro%20Carnaval&artist=Yung%20Lixo&preferFull=1&studioOnly=1", popular: true },
            { id: "yl_flores_2", title: "Máquina do Tempo", artist: "Yung Lixo", albumTitle: "Flores de Outro Carnaval", albumId: "yung_lixo_flores", duration: "3:17", durationSec: 197, trackNumber: 2, genre: "Indie / Rap", year: 2024, coverUrl: yungCover, previewUrl: "/api/stream?title=M%C3%A1quina%20do%20Tempo&artist=Yung%20Lixo&preferFull=1&studioOnly=1", streamUrl: "/api/stream?title=M%C3%A1quina%20do%20Tempo&artist=Yung%20Lixo&preferFull=1&studioOnly=1", popular: true },
            { id: "yl_flores_3", title: "Prefiro Morrer", artist: "Yung Lixo", albumTitle: "Flores de Outro Carnaval", albumId: "yung_lixo_flores", duration: "2:50", durationSec: 170, trackNumber: 3, genre: "Indie / Rap", year: 2024, coverUrl: yungCover, previewUrl: "/api/stream?title=Prefiro%20Morrer&artist=Yung%20Lixo&preferFull=1&studioOnly=1", streamUrl: "/api/stream?title=Prefiro%20Morrer&artist=Yung%20Lixo&preferFull=1&studioOnly=1", popular: true },
            { id: "yl_flores_4", title: "Sucesso FM", artist: "Yung Lixo", albumTitle: "Validation", albumId: "yung_lixo_flores", duration: "1:36", durationSec: 96, trackNumber: 4, genre: "Indie / Rap", year: 2023, coverUrl: yungCover, previewUrl: "/api/stream?title=Sucesso%20FM&artist=Yung%20Lixo&preferFull=1&studioOnly=1", streamUrl: "/api/stream?title=Sucesso%20FM&artist=Yung%20Lixo&preferFull=1&studioOnly=1", popular: true },
            { id: "yl_flores_5", title: "Quase Perfeito", artist: "Yung Lixo", albumTitle: "Flores de Outro Carnaval", albumId: "yung_lixo_flores", duration: "3:03", durationSec: 183, trackNumber: 5, genre: "Indie / Rap", year: 2024, coverUrl: yungCover, previewUrl: "/api/stream?title=Quase%20Perfeito&artist=Yung%20Lixo&preferFull=1&studioOnly=1", streamUrl: "/api/stream?title=Quase%20Perfeito&artist=Yung%20Lixo&preferFull=1&studioOnly=1", popular: true },
            { id: "yl_flores_6", title: "Rumo à Vitória", artist: "Yung Lixo", albumTitle: "Validation", albumId: "yung_lixo_flores", duration: "3:15", durationSec: 195, trackNumber: 6, genre: "Indie / Rap", year: 2023, coverUrl: yungCover, previewUrl: "/api/stream?title=Rumo%20%C3%A0%20Vit%C3%B3ria&artist=Yung%20Lixo&preferFull=1&studioOnly=1", streamUrl: "/api/stream?title=Rumo%20%C3%A0%20Vit%C3%B3ria&artist=Yung%20Lixo&preferFull=1&studioOnly=1", popular: false },
            { id: "yl_flores_7", title: "We Gold", artist: "Yung Lixo", albumTitle: "Validation", albumId: "yung_lixo_flores", duration: "3:04", durationSec: 184, trackNumber: 7, genre: "Indie / Rap", year: 2023, coverUrl: yungCover, previewUrl: "/api/stream?title=We%20Gold&artist=Yung%20Lixo&preferFull=1&studioOnly=1", streamUrl: "/api/stream?title=We%20Gold&artist=Yung%20Lixo&preferFull=1&studioOnly=1", popular: false }
          ]
        };

        Object.keys(PRELOADED_SEED).forEach(k => {
          if (PRELOADED_SEED[k] && Array.isArray(PRELOADED_SEED[k].tracks)) {
            PRELOADED_SEED[k].tracks = deduplicateTracks(PRELOADED_SEED[k].tracks);
          }
        });
      })();

      const INITIAL_ALBUMS = [
        {
          id: "billie_hmhas",
          collectionId: 1739659134,
          category: "global",
          filterTags: ["all", "new", "pop", "indie"],
          searchQuery: "Billie Eilish HIT ME HARD AND SOFT",
          title: "HIT ME HARD AND SOFT",
          artist: "Billie Eilish",
          year: 2024,
          releaseDate: "17 de maio de 2024",
          genre: "Alt-Pop / Indie",
          label: "Darkroom / Interscope",
          coverUrl: PRELOADED_SEED.billie_hmhas.coverUrl,
          synopsis: "O álbum mais aclamado e atmosférico de Billie Eilish, apresentando BIRDS OF A FEATHER, L'AMOUR DE MA VIE, LUNCH e CHIHIRO em gravação original de estúdio.",
          badges: ["Lossless", "Master", "Studio Original"],
          tracks: PRELOADED_SEED.billie_hmhas.tracks
        },
        {
          id: "gaga_mayhem",
          collectionId: 1792667000,
          category: "gaga",
          filterTags: ["all", "new", "pop", "gaga"],
          searchQuery: "Lady Gaga MAYHEM",
          title: "MAYHEM",
          artist: "Lady Gaga",
          year: 2025,
          releaseDate: "7 de março de 2025",
          genre: "Dark Pop / Dance-Pop",
          label: "Interscope Records",
          coverUrl: PRELOADED_SEED.gaga_mayhem.coverUrl,
          synopsis: "A nova era explosiva de Lady Gaga reunindo os fenômenos globais Die With A Smile, Abracadabra e Disease em áudio 100% original de estúdio.",
          badges: ["Lossless", "Master", "Lançamento"],
          tracks: PRELOADED_SEED.gaga_mayhem.tracks
        },
        {
          id: "weeknd_hut",
          collectionId: 1793001000,
          category: "global",
          filterTags: ["all", "new", "pop", "rnb"],
          searchQuery: "The Weeknd Hurry Up Tomorrow",
          title: "Hurry Up Tomorrow",
          artist: "The Weeknd",
          year: 2025,
          releaseDate: "31 de janeiro de 2025",
          genre: "Synthwave / R&B",
          label: "XO / Republic Records",
          coverUrl: PRELOADED_SEED.weeknd_hut.coverUrl,
          synopsis: "O capítulo final épico da trilogia de The Weeknd com Timeless, Cry For Me, São Paulo e Wake Me Up em qualidade Lossless.",
          badges: ["Lossless", "Master", "Lançamento"],
          tracks: PRELOADED_SEED.weeknd_hut.tracks
        },
        {
          id: "sabrina_sns",
          collectionId: 1752214909,
          dzAlbumId: 631839161,
          category: "global",
          filterTags: ["all", "new", "pop"],
          searchQuery: "Sabrina Carpenter Short n Sweet",
          title: "Short n' Sweet",
          artist: "Sabrina Carpenter",
          year: 2024,
          releaseDate: "23 de agosto de 2024",
          genre: "Pop / Disco-Pop",
          label: "Island Records",
          coverUrl: PRELOADED_SEED.sabrina_sns.coverUrl,
          synopsis: "O fenômeno pop mundial com Espresso, Please Please Please, Taste, Bed Chem e Juno em versão original completa de estúdio com 12 faixas.",
          badges: ["Lossless", "Master", "Hit Global"],
          tracks: PRELOADED_SEED.sabrina_sns.tracks
        },
        {
          id: "yung_lixo_flores",
          category: "brasil",
          filterTags: ["all", "brasil", "indie", "rap"],
          searchQuery: "Yung Lixo Flores de Outro Carnaval",
          title: "Flores de Outro Carnaval",
          artist: "Yung Lixo",
          year: 2024,
          releaseDate: "2024",
          genre: "Indie / Trap / Rap",
          label: "Indie Brasil",
          coverUrl: PRELOADED_SEED.yung_lixo_flores.coverUrl,
          synopsis: "O aclamado trabalho de estúdio de Yung Lixo (Victor Gemaplys / Yun Li) com faixas completas de estúdio em qualidade Lossless pura.",
          badges: ["Lossless", "Master", "Studio Original"],
          tracks: PRELOADED_SEED.yung_lixo_flores.tracks
        },
        {
          id: "jao_super",
          collectionId: 1701857309,
          category: "jao",
          filterTags: ["all", "brasil", "jao", "pop"],
          searchQuery: "Jão SUPER",
          title: "SUPER",
          artist: "Jão",
          year: 2023,
          releaseDate: "14 de agosto de 2023",
          genre: "Pop Brasileiro",
          label: "UFO / Universal Music",
          coverUrl: PRELOADED_SEED.jao_super.coverUrl,
          synopsis: "O encerramento explosivo da tetralogia dos elementos de Jão, representado pelo fogo e repleto de hinos como Me Lambe e Alinhamento Milenar.",
          badges: ["Lossless", "Master", "Hi-Res Audio"],
          tracks: PRELOADED_SEED.jao_super.tracks
        },
        {
          id: "gaga_chromatica",
          collectionId: 1500951604,
          category: "gaga",
          filterTags: ["all", "pop", "gaga"],
          searchQuery: "Lady Gaga Chromatica",
          title: "Chromatica",
          artist: "Lady Gaga",
          year: 2020,
          releaseDate: "29 de maio de 2020",
          genre: "Pop / Dance-Pop",
          label: "Interscope Records",
          coverUrl: PRELOADED_SEED.gaga_chromatica.coverUrl,
          synopsis: "Com Chromatica, Lady Gaga retorna às suas raízes na pista de dança em um álbum eletrizante com Rain On Me, Stupid Love e 911.",
          badges: ["Lossless", "Master", "Hi-Res Audio"],
          tracks: PRELOADED_SEED.gaga_chromatica.tracks
        },
        {
          id: "weeknd_after_hours",
          collectionId: 1499378108,
          category: "global",
          filterTags: ["all", "pop", "rnb"],
          searchQuery: "The Weeknd After Hours",
          title: "After Hours",
          artist: "The Weeknd",
          year: 2020,
          releaseDate: "20 de março de 2020",
          genre: "R&B / Synthwave",
          label: "XO / Republic Records",
          coverUrl: PRELOADED_SEED.weeknd_after_hours.coverUrl,
          synopsis: "A odisseia noturna cinematográfica de The Weeknd com os fenômenos globais Blinding Lights, Save Your Tears, In Your Eyes e Heartless.",
          badges: ["Lossless", "Master", "Hi-Res Audio"],
          tracks: PRELOADED_SEED.weeknd_after_hours.tracks
        },
        {
          id: "anitta_funk_gen",
          collectionId: 1739879010,
          category: "global",
          filterTags: ["all", "new", "brasil", "pop"],
          searchQuery: "Anitta Funk Generation",
          title: "Funk Generation",
          artist: "Anitta",
          year: 2024,
          releaseDate: "26 de abril de 2024",
          genre: "Funk Brasileiro / Pop",
          label: "Republic Records / Universal",
          coverUrl: PRELOADED_SEED.anitta_funk_gen.coverUrl,
          synopsis: "Anitta leva o funk carioca para as pistas globais com batidas pesadas, produções impecáveis e colaborações eletrizantes.",
          badges: ["Lossless", "Master", "Hi-Res Audio"],
          tracks: PRELOADED_SEED.anitta_funk_gen.tracks
        },
        {
          id: "dua_future_nostalgia",
          collectionId: 1538003494,
          category: "global",
          filterTags: ["all", "pop"],
          searchQuery: "Dua Lipa Future Nostalgia",
          title: "Future Nostalgia",
          artist: "Dua Lipa",
          year: 2020,
          releaseDate: "27 de março de 2020",
          genre: "Disco-Pop / Dance",
          label: "Warner Records",
          coverUrl: PRELOADED_SEED.dua_future_nostalgia.coverUrl,
          synopsis: "Clássico absoluto do dance-pop moderno repleto de linhas de baixo irresistíveis em Levitating, Don't Start Now, Physical e Break My Heart.",
          badges: ["Lossless", "Master", "Hi-Res Audio"],
          tracks: PRELOADED_SEED.dua_future_nostalgia.tracks
        },
        {
          id: "lana_born_to_die",
          collectionId: 1440809545,
          category: "global",
          filterTags: ["all", "indie", "pop"],
          searchQuery: "Lana Del Rey Born to Die",
          title: "Born to Die",
          artist: "Lana Del Rey",
          year: 2012,
          releaseDate: "27 de janeiro de 2012",
          genre: "Indie Pop / Sadcore",
          label: "Polydor / Interscope",
          coverUrl: PRELOADED_SEED.lana_born_to_die.coverUrl,
          synopsis: "Orquestrações grandiosas e melancolia cinematográfica em Summertime Sadness, Video Games, Born to Die e Blue Jeans.",
          badges: ["Lossless", "Master", "Hi-Res Audio"],
          tracks: PRELOADED_SEED.lana_born_to_die.tracks
        },
        {
          id: "bruno_24k",
          collectionId: 1161503945,
          category: "global",
          filterTags: ["all", "rnb", "pop"],
          searchQuery: "Bruno Mars 24K Magic",
          title: "24K Magic",
          artist: "Bruno Mars",
          year: 2016,
          releaseDate: "18 de novembro de 2016",
          genre: "Funk / R&B",
          label: "Atlantic Records",
          coverUrl: PRELOADED_SEED.bruno_24k.coverUrl,
          synopsis: "Groove contagiante, vocais impecáveis e produção R&B de ouro em That's What I Like, 24K Magic, Finesse e Versace on the Floor.",
          badges: ["Lossless", "Master", "Hi-Res Audio"],
          tracks: PRELOADED_SEED.bruno_24k.tracks
        },
        {
          id: "gaga_fame_monster",
          collectionId: 1476727669,
          category: "gaga",
          filterTags: ["all", "pop", "gaga"],
          searchQuery: "Lady Gaga The Fame Monster",
          title: "The Fame Monster",
          artist: "Lady Gaga",
          year: 2009,
          releaseDate: "18 de novembro de 2009",
          genre: "Electropop / Pop",
          label: "Interscope Records",
          coverUrl: PRELOADED_SEED.gaga_fame_monster.coverUrl,
          synopsis: "Obra-prima do pop moderno que redefiniu a indústria musical com os clássicos mundiais Bad Romance, Alejandro, Telephone e Just Dance.",
          badges: ["Lossless", "Master", "Hi-Res Audio"],
          tracks: PRELOADED_SEED.gaga_fame_monster.tracks
        },
        {
          id: "gaga_born_this_way",
          collectionId: 1440824019,
          category: "gaga",
          filterTags: ["all", "pop", "gaga"],
          searchQuery: "Lady Gaga Born This Way",
          title: "Born This Way",
          artist: "Lady Gaga",
          year: 2011,
          releaseDate: "23 de maio de 2011",
          genre: "Pop / Synth-Rock",
          label: "Interscope Records",
          coverUrl: PRELOADED_SEED.gaga_born_this_way.coverUrl,
          synopsis: "Um manifesto de liberdade, identidade e potência sonora mesclando sintetizadores pesados e refrões grandiosos como Judas, Bloody Mary e Marry The Night.",
          badges: ["Lossless", "Master", "Hi-Res Audio"],
          tracks: PRELOADED_SEED.gaga_born_this_way.tracks
        },
        {
          id: "gaga_artpop",
          collectionId: 1451767863,
          category: "gaga",
          filterTags: ["all", "pop", "gaga"],
          searchQuery: "Lady Gaga ARTPOP",
          title: "ARTPOP",
          artist: "Lady Gaga",
          year: 2013,
          releaseDate: "11 de novembro de 2013",
          genre: "EDM / Synth-Pop",
          label: "Interscope Records",
          coverUrl: PRELOADED_SEED.gaga_artpop.coverUrl,
          synopsis: "A colisão ousada entre arte pop e música eletrônica visceral, apresentando Aura, Venus e G.U.Y.",
          badges: ["Lossless", "Master", "Hi-Res Audio"],
          tracks: PRELOADED_SEED.gaga_artpop.tracks
        },
        {
          id: "jao_pirata",
          collectionId: 1589525781,
          category: "jao",
          filterTags: ["all", "brasil", "jao", "pop"],
          searchQuery: "Jão Pirata",
          title: "Pirata",
          artist: "Jão",
          year: 2021,
          releaseDate: "19 de outubro de 2021",
          genre: "Pop Brasileiro",
          label: "UFO / Universal Music",
          coverUrl: PRELOADED_SEED.jao_pirata.coverUrl,
          synopsis: "Álbum regido pelo elemento água, sobre recomeços, liberdade e amores intensos, incluindo Idiota, Santo e Meninos e Meninas.",
          badges: ["Lossless", "Master", "Hi-Res Audio"],
          tracks: PRELOADED_SEED.jao_pirata.tracks
        },
        {
          id: "jao_anti_heroi",
          collectionId: 1482213601,
          category: "jao",
          filterTags: ["all", "brasil", "jao", "pop"],
          searchQuery: "Jão Anti-Herói",
          title: "Anti-Herói",
          artist: "Jão",
          year: 2019,
          releaseDate: "10 de outubro de 2019",
          genre: "Pop Brasileiro",
          label: "Universal Music",
          coverUrl: PRELOADED_SEED.jao_anti_heroi.coverUrl,
          synopsis: "Um retrato sincero e dramático sobre vulnerabilidade e fim de relacionamento, trazendo Essa Eu Fiz Pro Nosso Amor e Louquinho.",
          badges: ["Lossless", "Master", "Hi-Res Audio"],
          tracks: PRELOADED_SEED.jao_anti_heroi.tracks
        },
        {
          id: "jao_lobos",
          collectionId: 1450308333,
          category: "jao",
          filterTags: ["all", "brasil", "jao", "indie"],
          searchQuery: "Jão Lobos",
          title: "Lobos",
          artist: "Jão",
          year: 2018,
          releaseDate: "17 de agosto de 2018",
          genre: "Pop Alternativo",
          label: "Universal Music",
          coverUrl: PRELOADED_SEED.jao_lobos.coverUrl,
          synopsis: "O álbum de estreia de Jão que conquistou o país com Vou Morrer Sozinho, Imaturo e Me Beija Com Raiva.",
          badges: ["Lossless", "Master", "Hi-Res Audio"],
          tracks: PRELOADED_SEED.jao_lobos.tracks
        }
      ];

      // Garante que todas as capas dos álbuns e músicas individuais passem pelo proxy 1000x1000 HD (/api/cover)
      INITIAL_ALBUMS.forEach(alb => {
        alb.coverUrl = ensureTrackCoverUrl(alb.coverUrl, alb.title, alb.artist);
        if (Array.isArray(alb.tracks)) {
          alb.tracks.forEach(tr => {
            tr.coverUrl = ensureTrackCoverUrl(tr, tr.title, tr.artist, alb.coverUrl);
          });
        }
      });

      // Diretório base de sugestões para o Onboarding (sem Yung Lixo nos charts gerais e com subtítulo limpo "Artista")
      // Diretório base completo de artistas categorizados para Onboarding e Descoberta
      const POPULAR_ARTISTS_DIRECTORY = [
        // Pop Internacional
        { name: "Taylor Swift", genre: "Pop", role: "Artista", coverUrl: "/api/artist-image?name=Taylor%20Swift" },
        { name: "Billie Eilish", genre: "Pop", role: "Artista", coverUrl: "/api/artist-image?name=Billie%20Eilish" },
        { name: "Sabrina Carpenter", genre: "Pop", role: "Artista", coverUrl: "/api/artist-image?name=Sabrina%20Carpenter" },
        { name: "Lady Gaga", genre: "Pop", role: "Artista", coverUrl: "/api/artist-image?name=Lady%20Gaga" },
        { name: "Olivia Rodrigo", genre: "Pop", role: "Artista", coverUrl: "/api/artist-image?name=Olivia%20Rodrigo" },
        { name: "Ariana Grande", genre: "Pop", role: "Artista", coverUrl: "/api/artist-image?name=Ariana%20Grande" },
        { name: "Dua Lipa", genre: "Pop", role: "Artista", coverUrl: "/api/artist-image?name=Dua%20Lipa" },
        { name: "Bruno Mars", genre: "Pop", role: "Artista", coverUrl: "/api/artist-image?name=Bruno%20Mars" },
        { name: "Chappell Roan", genre: "Pop", role: "Artista", coverUrl: "/api/artist-image?name=Chappell%20Roan" },
        { name: "Charli xcx", genre: "Pop", role: "Artista", coverUrl: "/api/artist-image?name=Charli%20xcx" },
        { name: "Katy Perry", genre: "Pop", role: "Artista", coverUrl: "/api/artist-image?name=Katy%20Perry" },
        { name: "Harry Styles", genre: "Pop", role: "Artista", coverUrl: "/api/artist-image?name=Harry%20Styles" },
        { name: "Rihanna", genre: "Pop", role: "Artista", coverUrl: "/api/artist-image?name=Rihanna" },
        { name: "Beyoncé", genre: "Pop", role: "Artista", coverUrl: "/api/artist-image?name=Beyonce" },
        { name: "Justin Bieber", genre: "Pop", role: "Artista", coverUrl: "/api/artist-image?name=Justin%20Bieber" },
        { name: "Ed Sheeran", genre: "Pop", role: "Artista", coverUrl: "/api/artist-image?name=Ed%20Sheeran" },
        { name: "Selena Gomez", genre: "Pop", role: "Artista", coverUrl: "/api/artist-image?name=Selena%20Gomez" },
        { name: "Tate McRae", genre: "Pop", role: "Artista", coverUrl: "/api/artist-image?name=Tate%20McRae" },

        // Rock & Metal
        { name: "Ghost", genre: "Rock", role: "Artista", coverUrl: "/api/artist-image?name=Ghost" },
        { name: "Linkin Park", genre: "Rock", role: "Artista", coverUrl: "/api/artist-image?name=Linkin%20Park" },
        { name: "Queen", genre: "Rock", role: "Artista", coverUrl: "/api/artist-image?name=Queen" },
        { name: "Arctic Monkeys", genre: "Rock", role: "Artista", coverUrl: "/api/artist-image?name=Arctic%20Monkeys" },
        { name: "Red Hot Chili Peppers", genre: "Rock", role: "Artista", coverUrl: "/api/artist-image?name=Red%20Hot%20Chili%20Peppers" },
        { name: "Nirvana", genre: "Rock", role: "Artista", coverUrl: "/api/artist-image?name=Nirvana" },
        { name: "Paramore", genre: "Rock", role: "Artista", coverUrl: "/api/artist-image?name=Paramore" },
        { name: "Metallica", genre: "Metal", role: "Artista", coverUrl: "/api/artist-image?name=Metallica" },
        { name: "Iron Maiden", genre: "Metal", role: "Artista", coverUrl: "/api/artist-image?name=Iron%20Maiden" },
        { name: "Slipknot", genre: "Metal", role: "Artista", coverUrl: "/api/artist-image?name=Slipknot" },
        { name: "System of a Down", genre: "Metal", role: "Artista", coverUrl: "/api/artist-image?name=System%20of%20a%20Down" },
        { name: "Black Sabbath", genre: "Metal", role: "Artista", coverUrl: "/api/artist-image?name=Black%20Sabbath" },
        { name: "Bring Me The Horizon", genre: "Rock", role: "Artista", coverUrl: "/api/artist-image?name=Bring%20Me%20The%20Horizon" },
        { name: "AC/DC", genre: "Rock", role: "Artista", coverUrl: "/api/artist-image?name=AC%2FDC" },
        { name: "Guns N' Roses", genre: "Rock", role: "Artista", coverUrl: "/api/artist-image?name=Guns%20N%20Roses" },
        { name: "Green Day", genre: "Rock", role: "Artista", coverUrl: "/api/artist-image?name=Green%20Day" },
        { name: "Måneskin", genre: "Rock", role: "Artista", coverUrl: "/api/artist-image?name=Maneskin" },

        // Hip-Hop / Rap
        { name: "Kanye West", genre: "Hip-Hop", role: "Artista", coverUrl: "/api/artist-image?name=Kanye%20West" },
        { name: "Drake", genre: "Hip-Hop", role: "Artista", coverUrl: "/api/artist-image?name=Drake" },
        { name: "Kendrick Lamar", genre: "Hip-Hop", role: "Artista", coverUrl: "/api/artist-image?name=Kendrick%20Lamar" },
        { name: "Travis Scott", genre: "Hip-Hop", role: "Artista", coverUrl: "/api/artist-image?name=Travis%20Scott" },
        { name: "Eminem", genre: "Hip-Hop", role: "Artista", coverUrl: "/api/artist-image?name=Eminem" },
        { name: "Post Malone", genre: "Hip-Hop", role: "Artista", coverUrl: "/api/artist-image?name=Post%20Malone" },
        { name: "21 Savage", genre: "Hip-Hop", role: "Artista", coverUrl: "/api/artist-image?name=21%20Savage" },
        { name: "Tyler, The Creator", genre: "Hip-Hop", role: "Artista", coverUrl: "/api/artist-image?name=Tyler%20The%20Creator" },
        { name: "Playboi Carti", genre: "Hip-Hop", role: "Artista", coverUrl: "/api/artist-image?name=Playboi%20Carti" },
        { name: "Future", genre: "Hip-Hop", role: "Artista", coverUrl: "/api/artist-image?name=Future" },
        { name: "J. Cole", genre: "Hip-Hop", role: "Artista", coverUrl: "/api/artist-image?name=J%20Cole" },
        { name: "A$AP Rocky", genre: "Hip-Hop", role: "Artista", coverUrl: "/api/artist-image?name=ASAP%20Rocky" },

        // R&B & Soul
        { name: "The Weeknd", genre: "R&B", role: "Artista", coverUrl: "/api/artist-image?name=The%20Weeknd" },
        { name: "SZA", genre: "R&B", role: "Artista", coverUrl: "/api/artist-image?name=SZA" },
        { name: "Frank Ocean", genre: "R&B", role: "Artista", coverUrl: "/api/artist-image?name=Frank%20Ocean" },
        { name: "Daniel Caesar", genre: "R&B", role: "Artista", coverUrl: "/api/artist-image?name=Daniel%20Caesar" },
        { name: "Steve Lacy", genre: "R&B", role: "Artista", coverUrl: "/api/artist-image?name=Steve%20Lacy" },
        { name: "Brent Faiyaz", genre: "R&B", role: "Artista", coverUrl: "/api/artist-image?name=Brent%20Faiyaz" },
        { name: "Giveon", genre: "R&B", role: "Artista", coverUrl: "/api/artist-image?name=Giveon" },

        // Pop Brasil & MPB
        { name: "Jão", genre: "Pop Brasil", role: "Artista", coverUrl: "/api/artist-image?name=J%C3%A3o" },
        { name: "Anitta", genre: "Pop Brasil", role: "Artista", coverUrl: "/api/artist-image?name=Anitta" },
        { name: "Liniker", genre: "MPB", role: "Artista", coverUrl: "/api/artist-image?name=Liniker" },
        { name: "Matuê", genre: "Hip-Hop", role: "Artista", coverUrl: "/api/artist-image?name=Matu%C3%AA" },
        { name: "Luísa Sonza", genre: "Pop Brasil", role: "Artista", coverUrl: "/api/artist-image?name=Luisa%20Sonza" },
        { name: "Marina Sena", genre: "Pop Brasil", role: "Artista", coverUrl: "/api/artist-image?name=Marina%20Sena" },
        { name: "Gloria Groove", genre: "Pop Brasil", role: "Artista", coverUrl: "/api/artist-image?name=Gloria%20Groove" },
        { name: "Pabllo Vittar", genre: "Pop Brasil", role: "Artista", coverUrl: "/api/artist-image?name=Pabllo%20Vittar" },
        { name: "Duda Beat", genre: "Pop Brasil", role: "Artista", coverUrl: "/api/artist-image?name=Duda%20Beat" },
        { name: "Silva", genre: "MPB", role: "Artista", coverUrl: "/api/artist-image?name=Silva" },
        { name: "Rubel", genre: "MPB", role: "Artista", coverUrl: "/api/artist-image?name=Rubel" },
        { name: "Caetano Veloso", genre: "MPB", role: "Artista", coverUrl: "/api/artist-image?name=Caetano%20Veloso" },
        { name: "Gilberto Gil", genre: "MPB", role: "Artista", coverUrl: "/api/artist-image?name=Gilberto%20Gil" },
        { name: "Tim Maia", genre: "MPB", role: "Artista", coverUrl: "/api/artist-image?name=Tim%20Maia" },
        { name: "Djavan", genre: "MPB", role: "Artista", coverUrl: "/api/artist-image?name=Djavan" },
        { name: "Baco Exu do Blues", genre: "Hip-Hop", role: "Artista", coverUrl: "/api/artist-image?name=Baco%20Exu%20do%20Blues" },
        { name: "Filipe Ret", genre: "Hip-Hop", role: "Artista", coverUrl: "/api/artist-image?name=Filipe%20Ret" },
        { name: "Teto", genre: "Hip-Hop", role: "Artista", coverUrl: "/api/artist-image?name=Teto" },

        // Indie & Alternativo
        { name: "Lana Del Rey", genre: "Indie", role: "Artista", coverUrl: "/api/artist-image?name=Lana%20Del%20Rey" },
        { name: "The Neighbourhood", genre: "Indie", role: "Artista", coverUrl: "/api/artist-image?name=The%20Neighbourhood" },
        { name: "Cigarettes After Sex", genre: "Indie", role: "Artista", coverUrl: "/api/artist-image?name=Cigarettes%20After%20Sex" },
        { name: "The Marías", genre: "Indie", role: "Artista", coverUrl: "/api/artist-image?name=The%20Marias" },
        { name: "Wallows", genre: "Indie", role: "Artista", coverUrl: "/api/artist-image?name=Wallows" },
        { name: "Clairo", genre: "Indie", role: "Artista", coverUrl: "/api/artist-image?name=Clairo" },
        { name: "Mitski", genre: "Indie", role: "Artista", coverUrl: "/api/artist-image?name=Mitski" },
        { name: "Tame Impala", genre: "Indie", role: "Artista", coverUrl: "/api/artist-image?name=Tame%20Impala" },
        { name: "Beach House", genre: "Indie", role: "Artista", coverUrl: "/api/artist-image?name=Beach%20House" },
        { name: "Lorde", genre: "Indie", role: "Artista", coverUrl: "/api/artist-image?name=Lorde" },

        // Eletrônica
        { name: "Daft Punk", genre: "Eletrônica", role: "Artista", coverUrl: "/api/artist-image?name=Daft%20Punk" },
        { name: "Calvin Harris", genre: "Eletrônica", role: "Artista", coverUrl: "/api/artist-image?name=Calvin%20Harris" },
        { name: "David Guetta", genre: "Eletrônica", role: "Artista", coverUrl: "/api/artist-image?name=David%20Guetta" },
        { name: "Avicii", genre: "Eletrônica", role: "Artista", coverUrl: "/api/artist-image?name=Avicii" },
        { name: "Alok", genre: "Eletrônica", role: "Artista", coverUrl: "/api/artist-image?name=Alok" },
        { name: "Vintage Culture", genre: "Eletrônica", role: "Artista", coverUrl: "/api/artist-image?name=Vintage%20Culture" }
      ];

      // Mapeamento de 3 artistas relacionados automáticos ao clicar
      const ARTIST_SIMILAR_MAP = {
        "ghost": ["Metallica", "Iron Maiden", "Slipknot"],
        "sabrina carpenter": ["Olivia Rodrigo", "Chappell Roan", "Tate McRae"],
        "billie eilish": ["Lana Del Rey", "Lorde", "Olivia Rodrigo"],
        "lady gaga": ["Beyoncé", "Katy Perry", "Ariana Grande"],
        "the weeknd": ["Bruno Mars", "Frank Ocean", "Post Malone"],
        "drake": ["Kendrick Lamar", "Travis Scott", "21 Savage"],
        "kanye west": ["Travis Scott", "Kendrick Lamar", "Tyler, The Creator"],
        "taylor swift": ["Sabrina Carpenter", "Olivia Rodrigo", "Lana Del Rey"],
        "jão": ["Rubel", "Silva", "Liniker"],
        "linkin park": ["Bring Me The Horizon", "System of a Down", "Paramore"],
        "yung lixo": ["Matuê", "Baco Exu do Blues", "Teto"],
        "kendrick lamar": ["J. Cole", "Kanye West", "Travis Scott"],
        "arctic monkeys": ["The Neighbourhood", "Wallows", "Tame Impala"],
        "daft punk": ["Calvin Harris", "Avicii", "David Guetta"],
        "metallica": ["Iron Maiden", "Slipknot", "Black Sabbath"],
        "lana del rey": ["Billie Eilish", "Lorde", "Cigarettes After Sex"],
        "sza": ["Frank Ocean", "Daniel Caesar", "The Weeknd"],
        "dua lipa": ["Katy Perry", "Ariana Grande", "Olivia Rodrigo"],
        "travis scott": ["Playboi Carti", "Future", "21 Savage"]
      };

      // ------------------------------------------------------------------------
      // 3. GERENCIAMENTO DE ESTADO LOCAL E PERSISTÊNCIA (LOCALSTORAGE)
      // ------------------------------------------------------------------------
      function toProxyStreamUrl(rawUrl, title = "", artist = "", preferFull = true) {
        const cleanUrl = String(rawUrl || "").trim();
        const isSnippet =
          cleanUrl.includes("dzcdn.net") ||
          cleanUrl.includes("cdns-preview") ||
          cleanUrl.includes("itunes.apple.com") ||
          cleanUrl.includes("apple.com/itunes-assets");
        if (cleanUrl.startsWith("/api/stream") && !isSnippet && (cleanUrl.includes("preferFull=1") || cleanUrl.includes("full=1"))) {
          return cleanUrl;
        }
        const params = new URLSearchParams();
        if (title) params.set("title", String(title));
        if (artist) params.set("artist", String(artist));
        if (preferFull) params.set("preferFull", "1");
        params.set("studioOnly", "1");
        return `/api/stream?${params.toString()}`;
      }

      class MiadoState {
        constructor() {
          this.albums = INITIAL_ALBUMS;
          this.customAlbumCovers = this.loadCustomAlbumCovers();
          this.applyCustomAlbumCovers();
          this.currentAlbum = null;
          this.currentTrack = null;
          this.originalQueue = [];
          this.queue = [];
          this.queueIndex = 0;

          this.isPlaying = false;
          this.isShuffle = false;
          this.isRepeat = false;
          this.volume = this.loadVolume();
          this.isMuted = false;
          this.currentView = "home";
          this.activePlaylistId = null;
          this.activeHomeFilter = "all";
          this.historyStack = [{ view: "home", params: {} }];
          this.historyIndex = 0;

          this.user = this.loadUser();
          this.followedArtists = this.loadFollowedArtists();
          this.friends = this.loadFriends();
          this.communityProfiles = [];
          this.recentHistory = this.loadRecentHistory();
          this.playlists = this.loadPlaylists();
          this.feedPosts = this.loadFeedPosts();
          this.pendingTrackForPlaylist = null;
          this.recommendations = {
            seedArtists: this.user.favoriteArtists || [],
            recommendedArtists: [],
            recommendedSongs: []
          };

          this.hydrateFromServerDb();
          this.fetchCommunityProfiles();
          this.fetchRecommendations();
          this.fetchCharts();
        }

        async fetchCharts() {
          try {
            const res = await fetch("/api/charts");
            if (!res.ok) return;
            const data = await res.json();
            if (data && (data.ok || data.topArtists100 || data.trendingBrazil || data.newReleases)) {
              this.charts = {
                ...data,
                top100Artists: data.top100Artists || data.topArtists100 || [],
                topSongs: data.topSongs || [...(data.trendingBrazil || []), ...(data.globalTop100 || [])],
                newReleases: data.newReleases || []
              };
              if (this.currentView === "home" && window.miadoUI) {
                window.miadoUI.renderHomeView();
              }
            }
          } catch (e) {}
        }

        loadCustomAlbumCovers() {
          try {
            const raw = localStorage.getItem("miado_custom_album_covers_v1");
            if (raw) {
              const parsed = JSON.parse(raw);
              if (parsed && typeof parsed === "object") return parsed;
            }
          } catch (e) {}
          return {};
        }

        saveCustomAlbumCovers() {
          try {
            localStorage.setItem("miado_custom_album_covers_v1", JSON.stringify(this.customAlbumCovers || {}));
          } catch (e) {}
          this.syncServerDb();
        }

        getAlbumKey(albumOrId) {
          if (!albumOrId) return "";
          if (typeof albumOrId === "string") return albumOrId;
          return String(albumOrId.id || `${albumOrId.artist || ""}_${albumOrId.title || ""}`).trim();
        }

        getAlbumCover(album) {
          if (!album) return INITIAL_ALBUMS[0].coverUrl;
          const key = this.getAlbumKey(album);
          if (key && this.customAlbumCovers && this.customAlbumCovers[key]) {
            return this.customAlbumCovers[key];
          }
          return album.customCoverUrl || album.coverUrl || INITIAL_ALBUMS[0].coverUrl;
        }

        applyCustomAlbumCovers() {
          if (!this.customAlbumCovers || typeof this.customAlbumCovers !== "object") return;
          (this.albums || []).forEach(alb => {
            if (!alb) return;
            const custom = this.customAlbumCovers[alb.id];
            if (custom) {
              if (!alb.originalCoverUrl) alb.originalCoverUrl = alb.coverUrl;
              alb.customCoverUrl = custom;
              alb.coverUrl = custom;
            }
          });
        }

        setCustomAlbumCover(albumOrId, dataUrl) {
          const key = this.getAlbumKey(albumOrId);
          if (!key || !dataUrl) return;
          if (!this.customAlbumCovers) this.customAlbumCovers = {};
          this.customAlbumCovers[key] = dataUrl;
          const found = (this.albums || []).find(a => a.id === key);
          if (found) {
            if (!found.originalCoverUrl) found.originalCoverUrl = found.coverUrl;
            found.customCoverUrl = dataUrl;
            found.coverUrl = dataUrl;
          }
          if (typeof albumOrId === "object" && albumOrId) {
            if (!albumOrId.originalCoverUrl) albumOrId.originalCoverUrl = albumOrId.coverUrl;
            albumOrId.customCoverUrl = dataUrl;
            albumOrId.coverUrl = dataUrl;
          }
          this.saveCustomAlbumCovers();
        }

        removeCustomAlbumCover(albumOrId) {
          const key = this.getAlbumKey(albumOrId);
          if (!key || !this.customAlbumCovers) return;
          delete this.customAlbumCovers[key];
          const found = (this.albums || []).find(a => a.id === key);
          if (found && found.originalCoverUrl) {
            found.coverUrl = found.originalCoverUrl;
            delete found.customCoverUrl;
          }
          if (typeof albumOrId === "object" && albumOrId) {
            if (albumOrId.originalCoverUrl) {
              albumOrId.coverUrl = albumOrId.originalCoverUrl;
            } else {
              albumOrId.coverUrl = `/api/cover?title=${encodeURIComponent(albumOrId.title || "")}&artist=${encodeURIComponent(albumOrId.artist || "")}`;
            }
            delete albumOrId.customCoverUrl;
          }
          this.saveCustomAlbumCovers();
        }

        deletePlaylist(playlistId) {
          if (!playlistId) return false;
          const idx = (this.playlists || []).findIndex(p => String(p.id) === String(playlistId));
          if (idx === -1) return false;
          const removed = this.playlists[idx];
          this.playlists.splice(idx, 1);
          this.savePlaylists();
          if (window.miadoUI) {
            window.miadoUI.renderSidebarPlaylists();
          }
          showToast(`Playlist "${removed?.name || "Playlist"}" apagada com sucesso.`);
          return true;
        }

        setPlaylistCustomCover(playlistId, dataUrl) {
          const pl = (this.playlists || []).find(p => String(p.id) === String(playlistId));
          if (!pl || !dataUrl) return false;
          pl.customCoverUrl = dataUrl;
          pl.coverUrl = dataUrl;
          if (Array.isArray(pl.tracks)) {
            pl.tracks = pl.tracks.map(tr => {
              if (tr && typeof tr.coverUrl === "string" && (tr.coverUrl === dataUrl || tr.coverUrl.startsWith("data:image/"))) {
                return { ...tr, coverUrl: ensureTrackCoverUrl(tr, tr.title, tr.artist) };
              }
              return tr;
            });
          }
          this.savePlaylists();
          if (window.miadoUI) {
            window.miadoUI.renderSidebarPlaylists();
            if (this.currentView === "playlist" && this.activePlaylistId === pl.id) {
              window.miadoUI.renderPlaylistView(pl.id);
            }
          }
          return true;
        }

        static LEGACY_FAKE_HANDLES = new Set([
          "@felinabeats",
          "@jao_loves",
          "@gaga_monster",
          "@dj_miadinho",
          "felinabeats",
          "jao_loves",
          "gaga_monster",
          "dj_miadinho"
        ]);

        static isLegacyFakeHandle(handle = "") {
          const clean = String(handle || "").trim().toLowerCase();
          return MiadoState.LEGACY_FAKE_HANDLES.has(clean) || MiadoState.LEGACY_FAKE_HANDLES.has(clean.replace(/^@/, ""));
        }

        loadFollowedArtists() {
          try {
            const saved = localStorage.getItem("miado_followed_artists_v1");
            if (saved) {
              const parsed = JSON.parse(saved);
              if (Array.isArray(parsed)) {
                return parsed.filter(a => a && a.name);
              }
            }
          } catch (e) {}
          return [];
        }

        saveFollowedArtists() {
          localStorage.setItem("miado_followed_artists_v1", JSON.stringify(this.followedArtists));
          this.user.followedArtists = this.followedArtists.map(a => a.name);
          this.user.followingCount = (this.friends?.length || 0) + (this.followedArtists?.length || 0);
          this.saveUser();
        }

        isArtistFollowed(artistName = "") {
          const clean = String(artistName || "").trim().toLowerCase();
          if (!clean) return false;
          return (this.followedArtists || []).some(a => String(a.name || "").trim().toLowerCase() === clean);
        }

        toggleFollowArtist(artistOrName, role = "Artista Oficial", coverUrl = "") {
          let name = "";
          let artRole = role;
          let artCover = coverUrl;
          if (artistOrName && typeof artistOrName === "object") {
            name = String(artistOrName.name || "").trim();
            artRole = artistOrName.role || role;
            artCover = artistOrName.coverUrl || coverUrl;
          } else {
            name = String(artistOrName || "").trim();
          }
          if (!name) return false;

          const cleanKey = name.toLowerCase();
          const existingIdx = (this.followedArtists || []).findIndex(a => String(a.name || "").trim().toLowerCase() === cleanKey);
          let nowFollowing = false;

          if (existingIdx > -1) {
            this.followedArtists.splice(existingIdx, 1);
            nowFollowing = false;
            showToast(`Você deixou de seguir ${name}`);
          } else {
            const dirMatch = POPULAR_ARTISTS_DIRECTORY.find(p => p.name.toLowerCase() === cleanKey);
            this.followedArtists.unshift({
              name,
              role: (dirMatch && dirMatch.role) || artRole || "Artista Verificado",
              coverUrl: artCover || (dirMatch && dirMatch.coverUrl) || `/api/artist-image?name=${encodeURIComponent(name)}`,
              followedAt: new Date().toISOString()
            });
            if (!Array.isArray(this.user.favoriteArtists)) this.user.favoriteArtists = [];
            if (!this.user.favoriteArtists.some(f => String(f).toLowerCase() === cleanKey)) {
              this.user.favoriteArtists.unshift(name);
            }
            nowFollowing = true;
            showToast(`Agora você está seguindo ${name}!`);
          }

          this.saveFollowedArtists();
          this.fetchRecommendations();
          if (window.miadoUI) {
            window.miadoUI.renderRightSidebarBodyOnly();
          }
          return nowFollowing;
        }

        async fetchCommunityProfiles(searchQuery = "") {
          try {
            const url = searchQuery
              ? `/api/profiles?q=${encodeURIComponent(searchQuery)}`
              : `/api/profiles`;
            const res = await fetch(url);
            if (!res.ok) return this.communityProfiles;
            const data = await res.json();
            if (data && Array.isArray(data.profiles)) {
              this.communityProfiles = data.profiles.filter(p => p && p.username && !MiadoState.isLegacyFakeHandle(p.username));
              // Atualiza dados dos amigos seguidos com o estado mais recente do servidor
              const updatedFriends = [];
              for (const f of this.friends) {
                if (MiadoState.isLegacyFakeHandle(f.username)) continue;
                const live = this.communityProfiles.find(p => p.username.toLowerCase() === f.username.toLowerCase());
                updatedFriends.push(live ? { ...f, ...live } : f);
              }
              this.friends = updatedFriends;
              localStorage.setItem("miado_real_friends_v1", JSON.stringify(this.friends));
              if (window.miadoUI) {
                window.miadoUI.renderRightSidebarBodyOnly();
              }
            }
          } catch (e) {}
          return this.communityProfiles;
        }

        async createOrUpdateCommunityProfile(profileInput) {
          try {
            const res = await fetch("/api/profiles", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(profileInput)
            });
            const data = await res.json();
            if (data && data.ok && data.profile) {
              await this.fetchCommunityProfiles();
              return data.profile;
            }
          } catch (e) {}
          return null;
        }

        isProfileFollowed(username = "") {
          const clean = String(username || "").trim().toLowerCase();
          if (!clean) return false;
          const formatted = clean.startsWith("@") ? clean : `@${clean}`;
          return (this.friends || []).some(f => String(f.username || "").trim().toLowerCase() === formatted);
        }

        toggleFollowProfile(profileObj) {
          if (!profileObj || !profileObj.username) return false;
          const formatted = profileObj.username.startsWith("@") ? profileObj.username : `@${profileObj.username}`;
          if (MiadoState.isLegacyFakeHandle(formatted)) return false;

          const idx = (this.friends || []).findIndex(f => String(f.username || "").toLowerCase() === formatted.toLowerCase());
          let nowFollowing = false;

          if (idx > -1) {
            this.friends.splice(idx, 1);
            nowFollowing = false;
            showToast(`Você deixou de seguir ${formatted}`);
          } else {
            const trackObj = profileObj.trackObj || this.currentTrack || INITIAL_ALBUMS[0].tracks[0];
            this.friends.unshift({
              id: profileObj.id || `prof_${formatted.replace(/[^a-z0-9_]/gi, "")}`,
              name: profileObj.name || formatted.slice(1),
              username: formatted,
              bio: profileObj.bio || "Ouvindo música original de estúdio no Miado.",
              avatar: profileObj.avatar || profileObj.avatarUrl || CAT_AVATAR_PRESETS[1].url,
              currentTrack: profileObj.currentTrack || `${trackObj.title} - ${trackObj.artist}`,
              trackObj,
              albumId: profileObj.albumId || trackObj.albumId || INITIAL_ALBUMS[0].id,
              online: true,
              likedByMe: false
            });
            nowFollowing = true;
            showToast(`Agora você segue ${profileObj.name || formatted}!`);
          }

          localStorage.setItem("miado_real_friends_v1", JSON.stringify(this.friends));
          this.user.followingProfiles = this.friends.map(f => f.username);
          this.user.followingCount = (this.friends?.length || 0) + (this.followedArtists?.length || 0);
          this.saveUser();
          if (window.miadoUI) {
            window.miadoUI.renderRightSidebarBodyOnly();
          }
          return nowFollowing;
        }

        async fetchRecommendations() {
          try {
            const followedNames = (this.followedArtists || []).map(a => a.name).filter(Boolean);
            const favs = Array.isArray(this.user.favoriteArtists) ? this.user.favoriteArtists.filter(Boolean) : [];
            const recentArtists = (this.recentHistory || []).slice(0, 6).map(t => t.artist).filter(Boolean);
            const likedArtists = (this.user.likedTracks || []).slice(0, 6).map(t => t.artist).filter(Boolean);
            const combined = Array.from(new Set([...followedNames, ...favs, ...recentArtists, ...likedArtists])).slice(0, 8);

            if (combined.length === 0) {
              this.recommendations = {
                seedArtists: [],
                recommendedArtists: [],
                recommendedSongs: []
              };
              return;
            }

            const res = await fetch(`/api/recommendations?artists=${encodeURIComponent(combined.join(","))}`);
            if (res.ok) {
              const data = await res.json();
              if (data) {
                this.recommendations = {
                  seedArtists: data.basedOnArtists || data.seedArtists || combined,
                  recommendedArtists: Array.isArray(data.recommendedArtists) ? data.recommendedArtists : [],
                  recommendedSongs: deduplicateTracks(data.recommendedSongs || [])
                };
                if (this.currentView === "home" && window.miadoUI) {
                  window.miadoUI.renderHomeView();
                }
              }
            }
          } catch (e) {}
        }

        async saveFavoriteArtists(artistsList, genresList = []) {
          const clean = Array.isArray(artistsList) ? artistsList.filter(Boolean) : [];
          const cleanGenres = Array.isArray(genresList) ? genresList.filter(Boolean) : (this.user.favoriteGenres || []);
          this.user.favoriteArtists = clean;
          this.user.favoriteGenres = cleanGenres;
          this.user.onboardingCompleted = true;
          this.saveUser();
          try {
            await fetch("/api/user/preferences", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                email: this.user.email || "",
                name: this.user.name,
                handle: this.user.username,
                bio: this.user.bio,
                catId: this.user.avatarId,
                customAvatar: this.user.avatarUrl,
                favoriteArtists: this.user.favoriteArtists,
                followedArtists: (this.followedArtists || []).map(a => a.name),
                followingProfiles: (this.friends || []).map(f => f.username),
                onboardingCompleted: true
              })
            });
          } catch (_e) {}
          await this.fetchRecommendations();
        }

        /**
         * Define a fila de reprodução sem faixas duplicadas e aplica embaralhamento Fisher-Yates se o modo aleatório estiver ativo
         */
        setQueue(tracks, startTrack = null, forceShuffle = null) {
          const cleanList = deduplicateTracks(Array.isArray(tracks) ? tracks : []);
          if (cleanList.length === 0) return null;
          this.originalQueue = [...cleanList];

          if (typeof forceShuffle === "boolean") {
            this.isShuffle = forceShuffle;
            const btnShuffle = document.getElementById("player-btn-shuffle");
            if (btnShuffle) btnShuffle.classList.toggle("active", this.isShuffle);
          }

          if (this.isShuffle && cleanList.length > 1) {
            const pool = [...cleanList];
            let chosenFirst = startTrack;
            if (!chosenFirst) {
              const randIdx = Math.floor(Math.random() * pool.length);
              chosenFirst = pool[randIdx];
            }
            const rest = pool.filter(t => String(t.id) !== String(chosenFirst.id));
            for (let i = rest.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [rest[i], rest[j]] = [rest[j], rest[i]];
            }
            this.queue = [chosenFirst, ...rest];
            this.queueIndex = 0;
            return this.queue[0];
          } else {
            this.queue = [...cleanList];
            if (startTrack) {
              const idx = this.queue.findIndex(t => String(t.id) === String(startTrack.id));
              this.queueIndex = idx > -1 ? idx : 0;
            } else {
              this.queueIndex = 0;
            }
            return this.queue[this.queueIndex];
          }
        }

        /**
         * Alterna o Modo Aleatório (Shuffle) embaralhando de verdade a fila atual ou restaurando a ordem original
         */
        toggleShuffleMode() {
          this.isShuffle = !this.isShuffle;
          ["player-btn-shuffle", "fs-btn-shuffle"].forEach(id => {
            const btnShuffle = document.getElementById(id);
            if (btnShuffle) {
              btnShuffle.classList.toggle("active", this.isShuffle);
              btnShuffle.setAttribute("aria-pressed", this.isShuffle ? "true" : "false");
            }
          });

          const baseList = (Array.isArray(this.originalQueue) && this.originalQueue.length > 0)
            ? deduplicateTracks(this.originalQueue)
            : deduplicateTracks(this.queue);

          if (baseList.length > 1) {
            if (this.isShuffle) {
              const current = this.currentTrack || baseList[0];
              const others = baseList.filter(t => String(t.id) !== String(current.id) && normalizeTrackKey(t) !== normalizeTrackKey(current));
              for (let i = others.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [others[i], others[j]] = [others[j], others[i]];
              }
              this.queue = [current, ...others];
              this.queueIndex = 0;
            } else {
              this.queue = [...baseList];
              const idx = this.currentTrack
                ? this.queue.findIndex(t => String(t.id) === String(this.currentTrack.id) || normalizeTrackKey(t) === normalizeTrackKey(this.currentTrack))
                : 0;
              this.queueIndex = idx > -1 ? idx : 0;
            }
          }

          if (window.miadoUI) {
            window.miadoUI.renderRightSidebarBodyOnly();
            window.miadoUI.renderFullscreenUpNext();
          }
          showToast(this.isShuffle ? "Modo Aleatório ativado (fila embaralhada)" : "Modo Aleatório desativado (ordem original)");
          return this.isShuffle;
        }

        /**
         * Sincroniza globalmente o estado de isPlaying na aplicação e atualiza toda a UI
         */
        setIsPlaying(playing) {
          const nextVal = Boolean(playing);
          this.isPlaying = nextVal;
          if (window.miadoEngine) {
            window.miadoEngine.updatePlayStateUI(nextVal);
          }
          if (window.miadoUI) {
            window.miadoUI.highlightPlayingTrackInDOM();
            window.miadoUI.renderFullscreenUpNext();
          }
        }

        applyAccountPayload(payload) {
          if (!payload) return;
          const acc = payload.account || payload;
          const incomingUser = acc.user || payload.user;
          if (incomingUser && (incomingUser.name || incomingUser.email)) {
            const incomingLiked = Array.isArray(acc.likedTracks)
              ? acc.likedTracks
              : Array.isArray(payload.likedTracks)
              ? payload.likedTracks
              : (Array.isArray(incomingUser.likedTracks) ? incomingUser.likedTracks : this.user.likedTracks);
            const cleanName = String(incomingUser.name || this.user.name || "Ouvinte").trim();
            const cleanHandle = sanitizeCleanHandle(incomingUser.username || incomingUser.handle || this.user.username, cleanName);
            this.user = {
              ...this.user,
              ...incomingUser,
              name: cleanName,
              username: cleanHandle,
              handle: cleanHandle,
              email: String(incomingUser.email || acc.email || this.user.email || "").toLowerCase().trim(),
              followingCount: (this.friends?.length || 0) + (this.followedArtists?.length || 0),
              followersCount: incomingUser.followersCount === 1280 ? 0 : (incomingUser.followersCount || 0),
              likedTracks: deduplicateTracks((incomingLiked || []).map(tr => ({
                ...tr,
                coverUrl: ensureTrackCoverUrl(tr, tr.title, tr.artist)
              })))
            };
            if (!this.user.avatarUrl || this.user.avatarUrl.startsWith("data:image/svg")) {
              this.user.avatarUrl = CAT_AVATAR_PRESETS[0].url;
            }
            if (this.user.email && this.user.email !== "usr_guest@miado.app") {
              localStorage.setItem("miado_active_session_v1", "true");
            }
            localStorage.setItem("miado_user_v5", JSON.stringify(this.user));
          }
          const incomingHistory = Array.isArray(acc.recentHistory) ? acc.recentHistory : payload.recentHistory;
          if (Array.isArray(incomingHistory)) {
            this.recentHistory = incomingHistory.slice(0, 50).map(tr => ({
              ...tr,
              coverUrl: ensureTrackCoverUrl(tr, tr.title, tr.artist)
            }));
            localStorage.setItem("miado_recent_history_50", JSON.stringify(this.recentHistory));
          }
          const incomingPlaylists = Array.isArray(acc.playlists) ? acc.playlists : payload.playlists;
          if (Array.isArray(incomingPlaylists)) {
            this.playlists = incomingPlaylists
              .filter(pl => pl && !DEFAULT_LEGACY_PLAYLIST_IDS.has(String(pl.id || "")))
              .map(pl => ({
                ...pl,
                collaborators: (pl.collaborators || [this.user.username]).filter(c => !MiadoState.isLegacyFakeHandle(c)),
                tracks: (pl.tracks || []).map(tr => {
                  const plCover = pl.customCoverUrl || pl.coverUrl;
                  const hasInherited = tr.coverUrl && (tr.coverUrl === plCover || (typeof tr.coverUrl === "string" && tr.coverUrl.startsWith("data:image/")));
                  const cleanTr = hasInherited ? { ...tr, coverUrl: "" } : tr;
                  return {
                    ...cleanTr,
                    coverUrl: ensureTrackCoverUrl(cleanTr, cleanTr.title, cleanTr.artist),
                    addedBy: tr.addedBy && MiadoState.isLegacyFakeHandle(tr.addedBy.username)
                      ? { username: this.user.username || "@ouvinte", avatar: this.user.avatarUrl }
                      : tr.addedBy
                  };
                })
              }));
            localStorage.setItem("miado_playlists_v5", JSON.stringify(this.playlists));
          }
          const incomingPosts = Array.isArray(acc.feedPosts) ? acc.feedPosts : payload.feedPosts;
          if (Array.isArray(incomingPosts)) {
            this.feedPosts = incomingPosts.filter(p => p && !MiadoState.isLegacyFakeHandle(p.username));
            localStorage.setItem("miado_feed_posts_v6", JSON.stringify(this.feedPosts));
          }
          this.fetchRecommendations();
          if (window.miadoEngine) {
            window.miadoEngine.updateLikeButtonUI();
          }
          if (window.miadoUI) {
            window.miadoUI.syncHeaderUserUI();
            window.miadoUI.renderSidebarPlaylists();
            window.miadoUI.syncAllLikeButtonsInDOM();
            window.miadoUI.navigateTo(this.currentView || "home", false);
          }
        }

        async hydrateFromServerDb() {
          try {
            const res = await fetch("/api/db");
            if (!res.ok) return;
            const db = await res.json();
            if (!db || !db.authenticated || !db.user || !db.user.email || db.user.email === "usr_guest@miado.app") {
              return;
            }
            let updated = false;
            const serverLikes = Array.isArray(db.likedTracks) && db.likedTracks.length > 0
              ? db.likedTracks
              : (Array.isArray(db.user.likedTracks) ? db.user.likedTracks : this.user.likedTracks);
            const cleanName = String(db.user.name || this.user.name || "Ouvinte").trim();
            const cleanHandle = sanitizeCleanHandle(db.user.username || db.user.handle || this.user.username, cleanName);
            this.user = {
              ...this.user,
              ...db.user,
              name: cleanName,
              username: cleanHandle,
              handle: cleanHandle,
              followingCount: (this.friends?.length || 0) + (this.followedArtists?.length || 0),
              followersCount: db.user.followersCount === 1280 ? 0 : (db.user.followersCount || 0),
              likedTracks: deduplicateTracks((serverLikes || []).map(tr => ({
                ...tr,
                coverUrl: ensureTrackCoverUrl(tr, tr.title, tr.artist)
              })))
            };
            if (!this.user.avatarUrl || this.user.avatarUrl.startsWith("data:image/svg")) {
              this.user.avatarUrl = CAT_AVATAR_PRESETS[0].url;
            }
            localStorage.setItem("miado_user_v5", JSON.stringify(this.user));
            updated = true;

            if (Array.isArray(db.recentHistory) && db.recentHistory.length > 0 && this.recentHistory.length === 0) {
              this.recentHistory = db.recentHistory.slice(0, 50).map(tr => ({
                ...tr,
                coverUrl: ensureTrackCoverUrl(tr, tr.title, tr.artist)
              }));
              updated = true;
            }
            if (Array.isArray(db.playlists)) {
              const filteredPlaylists = db.playlists
                .filter(pl => pl && !DEFAULT_LEGACY_PLAYLIST_IDS.has(String(pl.id || "")))
                .map(pl => ({
                  ...pl,
                  collaborators: (pl.collaborators || [this.user.username]).filter(c => !MiadoState.isLegacyFakeHandle(c)),
                  tracks: (pl.tracks || []).map(tr => ({
                    ...tr,
                    coverUrl: ensureTrackCoverUrl(tr, tr.title, tr.artist),
                    addedBy: tr.addedBy && MiadoState.isLegacyFakeHandle(tr.addedBy.username)
                      ? { username: this.user.username || "@ouvinte", avatar: this.user.avatarUrl }
                      : tr.addedBy
                  }))
                }));
              if (filteredPlaylists.length > 0 && this.playlists.length === 0) {
                this.playlists = filteredPlaylists;
                localStorage.setItem("miado_playlists_v5", JSON.stringify(this.playlists));
                updated = true;
              }
            }
            if (db.customAlbumCovers && typeof db.customAlbumCovers === "object") {
              this.customAlbumCovers = { ...db.customAlbumCovers, ...(this.customAlbumCovers || {}) };
              localStorage.setItem("miado_custom_album_covers_v1", JSON.stringify(this.customAlbumCovers));
              this.applyCustomAlbumCovers();
              updated = true;
            }
            if (updated) {
              this.fetchRecommendations();
              if (window.miadoEngine) window.miadoEngine.updateLikeButtonUI();
              if (window.miadoUI) {
                window.miadoUI.syncHeaderUserUI();
                window.miadoUI.renderSidebarPlaylists();
                window.miadoUI.syncAllLikeButtonsInDOM();
              }
            }
          } catch (e) {}
        }

        syncServerDb() {
          const hasRealAccount = Boolean(
            this.user &&
            this.user.email &&
            this.user.email !== "usr_guest@miado.app" &&
            this.user.name !== "Visitante"
          );
          if (!hasRealAccount) return;

          try {
            fetch("/api/db", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                accountEmail: this.user.email || "",
                user: this.user,
                likedTracks: this.user.likedTracks || [],
                recentHistory: this.recentHistory,
                playlists: (this.playlists || []).filter(pl => pl && !DEFAULT_LEGACY_PLAYLIST_IDS.has(String(pl.id || ""))),
                feedPosts: this.feedPosts,
                customAlbumCovers: this.customAlbumCovers || {},
                volume: this.volume
              })
            }).catch(() => {});
          } catch (e) {}

          // Sincroniza também o perfil público do usuário autenticado na comunidade Miau
          try {
            const curTrack = this.currentTrack;
            fetch("/api/profiles", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: this.user.name,
                username: this.user.username,
                bio: this.user.bio,
                avatarUrl: this.user.avatarUrl,
                bannerUrl: this.user.bannerUrl,
                favoriteArtists: this.user.favoriteArtists || [],
                currentTrack: curTrack ? `${curTrack.title} - ${curTrack.artist}` : "Ouvindo no Miado",
                trackObj: curTrack,
                albumId: (this.currentAlbum && this.currentAlbum.id) || "billie_hmhas",
                isSelf: true
              })
            }).catch(() => {});
          } catch (e) {}

          // Sincronização Permanente com Firebase Firestore apenas para contas autenticadas
          try {
            if (window.miadoFirestore && typeof window.miadoFirestore.saveUserState === "function") {
              window.miadoFirestore.saveUserState(this);
            }
            const uid = (this.user && this.user.uid) || localStorage.getItem("miado_user_uid");
            if (!uid || uid === "usr_guest") return;
            fetch("/api/user/firestore-sync", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                uid,
                email: this.user.email,
                name: this.user.name,
                username: this.user.username,
                handle: this.user.username,
                bio: this.user.bio || "",
                catId: this.user.avatarId || "cat_1",
                avatarUrl: this.user.avatarUrl || "",
                favoriteArtists: this.user.favoriteArtists || [],
                likedTracks: this.user.likedTracks || [],
                playlists: (this.playlists || []).filter(pl => pl && !DEFAULT_LEGACY_PLAYLIST_IDS.has(String(pl.id || ""))),
                recentHistory: this.recentHistory || []
              })
            }).catch(() => {});
          } catch (e) {}
        }

        hydrateFromFirestore(data) {
          if (!data || !data.email || data.email === "usr_guest@miado.app") return;
          let changed = false;
          if (Array.isArray(data.likedTracks) && data.likedTracks.length > 0) {
            this.user.likedTracks = deduplicateTracks(data.likedTracks.map(t => ({
              ...t,
              coverUrl: ensureTrackCoverUrl(t, t.title, t.artist)
            })));
            changed = true;
          }
          if (Array.isArray(data.playlists)) {
            this.playlists = data.playlists
              .filter(pl => pl && !DEFAULT_LEGACY_PLAYLIST_IDS.has(String(pl.id || "")))
              .map(pl => ({
                ...pl,
                collaborators: (pl.collaborators || [this.user.username]).filter(c => !MiadoState.isLegacyFakeHandle(c)),
                tracks: (pl.tracks || []).map(t => ({
                  ...t,
                  coverUrl: ensureTrackCoverUrl(t, t.title, t.artist)
                }))
              }));
            changed = true;
          }
          if (Array.isArray(data.recentHistory) && data.recentHistory.length > 0) {
            this.recentHistory = deduplicateTracks(data.recentHistory.map(t => ({
              ...t,
              coverUrl: ensureTrackCoverUrl(t, t.title, t.artist)
            })));
            changed = true;
          }
          if (data.name && data.name !== "Visitante") this.user.name = data.name;
          if (data.username || data.handle) {
            this.user.username = sanitizeCleanHandle(data.username || data.handle, this.user.name);
          }
          if (data.bio) this.user.bio = data.bio;
          if (data.avatarUrl) this.user.avatarUrl = data.avatarUrl;
          if (Array.isArray(data.favoriteArtists) && data.favoriteArtists.length > 0) {
            this.user.favoriteArtists = data.favoriteArtists;
          }
          if (changed) {
            localStorage.setItem("miado_user_v5", JSON.stringify(this.user));
            localStorage.setItem("miado_playlists_v5", JSON.stringify(this.playlists));
            localStorage.setItem("miado_recent_history_50", JSON.stringify(this.recentHistory));
            if (window.miadoEngine) window.miadoEngine.updateLikeButtonUI();
            if (window.miadoUI) {
              window.miadoUI.syncHeaderUserUI();
              window.miadoUI.renderSidebarPlaylists();
              window.miadoUI.syncAllLikeButtonsInDOM();
              if (this.currentView === "liked") window.miadoUI.renderLikedTracksView();
              if (this.currentView === "library") window.miadoUI.renderLibraryView();
              if (this.currentView === "profile") window.miadoUI.renderProfileView();
            }
          }
        }

        loadVolume() {
          try {
            const v = parseFloat(localStorage.getItem("miado_volume_v5"));
            if (!isNaN(v) && v >= 0 && v <= 1) return v;
          } catch (e) {}
          return 0.85;
        }

        saveVolume(val) {
          if (typeof val === "number" && !isNaN(val)) {
            this.volume = Math.max(0, Math.min(1, val));
          }
          localStorage.setItem("miado_volume_v5", String(this.volume));
        }

        loadUser() {
          try {
            const saved = localStorage.getItem("miado_user_v5");
            if (saved) {
              const parsed = JSON.parse(saved);
              if (parsed && parsed.name && parsed.email && parsed.email !== "usr_guest@miado.app") {
                parsed.username = sanitizeCleanHandle(parsed.username || parsed.handle, parsed.name);
                if (Array.isArray(parsed.likedTracks)) {
                  parsed.likedTracks = deduplicateTracks(parsed.likedTracks.map(tr => ({
                    ...tr,
                    coverUrl: ensureTrackCoverUrl(tr, tr.title, tr.artist)
                  })));
                } else {
                  parsed.likedTracks = [];
                }
                if (!parsed.avatarUrl || parsed.avatarUrl.startsWith("data:image/svg")) {
                  parsed.avatarUrl = CAT_AVATAR_PRESETS[0].url;
                  parsed.avatarId = "cat_1";
                }
                if (!parsed.bannerUrl || parsed.bannerUrl.startsWith("data:image/svg")) {
                  parsed.bannerUrl = INITIAL_ALBUMS[0].coverUrl;
                }
                if (!Array.isArray(parsed.favoriteArtists)) {
                  parsed.favoriteArtists = [];
                }
                if (!Array.isArray(parsed.favoriteGenres)) {
                  parsed.favoriteGenres = [];
                }
                if (parsed.followingCount === 142) parsed.followingCount = 0;
                if (parsed.followersCount === 1280) parsed.followersCount = 0;
                return parsed;
              }
            }
          } catch (e) {}
          return {
            name: "Visitante",
            username: "@visitante",
            email: "",
            bio: "",
            avatarId: "cat_1",
            avatarUrl: CAT_AVATAR_PRESETS[0].url,
            bannerUrl: INITIAL_ALBUMS[0].coverUrl,
            followingCount: 0,
            followersCount: 0,
            favoriteArtists: [],
            favoriteGenres: [],
            onboardingCompleted: false,
            likedTracks: []
          };
        }

        saveUser() {
          this.user.followingCount = (this.friends?.length || 0) + (this.followedArtists?.length || 0);
          localStorage.setItem("miado_user_v5", JSON.stringify(this.user));
          this.syncServerDb();
        }

        loadRecentHistory() {
          try {
            const saved = localStorage.getItem("miado_recent_history_50");
            if (saved) {
              const parsed = JSON.parse(saved);
              if (Array.isArray(parsed) && parsed.length > 0) {
                return deduplicateTracks(parsed.slice(0, 50).map(tr => ({
                  ...tr,
                  coverUrl: ensureTrackCoverUrl(tr, tr.title, tr.artist)
                })));
              }
            }
          } catch (e) {}
          return [];
        }

        recordTrackInHistory(track, album) {
          if (!track || !track.id) return;
          const nowStr = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
          const cleanStream = `/api/stream?title=${encodeURIComponent(track.title || "")}&artist=${encodeURIComponent(track.artist || "")}&preferFull=1`;
          const item = {
            id: String(track.id),
            title: track.title,
            artist: track.artist,
            duration: track.duration || "3:30",
            previewUrl: cleanStream,
            streamUrl: cleanStream,
            coverUrl: ensureTrackCoverUrl(track, track.title, track.artist, album && album.coverUrl),
            albumId: (album && album.id) || track.albumId || "billie_hmhas",
            albumTitle: (album && album.title) || track.albumTitle || "Single",
            playedAt: nowStr
          };

          this.recentHistory = this.recentHistory.filter(t => String(t.id) !== String(item.id));
          this.recentHistory.unshift(item);
          if (this.recentHistory.length > 50) {
            this.recentHistory = this.recentHistory.slice(0, 50);
          }
          localStorage.setItem("miado_recent_history_50", JSON.stringify(this.recentHistory));

          // Registra automaticamente na timeline do Feed Miau e atualiza recomendações
          this.addAutomaticFeedPost(item);
          this.syncServerDb();
          if (this.recentHistory.length % 2 === 1) {
            this.fetchRecommendations();
          }
        }

        clearRecentHistory() {
          this.recentHistory = [];
          localStorage.setItem("miado_recent_history_50", JSON.stringify([]));
          this.syncServerDb();
        }

        loadFeedPosts() {
          try {
            const saved = localStorage.getItem("miado_feed_posts_v6");
            if (saved) {
              const parsed = JSON.parse(saved);
              if (Array.isArray(parsed)) {
                const realPosts = parsed
                  .filter(post => post && post.track && !MiadoState.isLegacyFakeHandle(post.username))
                  .map((post, idx) => ({
                    ...post,
                    avatar: (!post.avatar || post.avatar.startsWith("data:image/svg"))
                      ? (this.user?.avatarUrl || CAT_AVATAR_PRESETS[idx % CAT_AVATAR_PRESETS.length].url)
                      : post.avatar,
                    track: post.track ? {
                      ...post.track,
                      coverUrl: ensureTrackCoverUrl(post.track, post.track.title, post.track.artist)
                    } : post.track
                  }));
                localStorage.setItem("miado_feed_posts_v6", JSON.stringify(realPosts));
                return realPosts;
              }
            }
          } catch (e) {}

          localStorage.setItem("miado_feed_posts_v6", JSON.stringify([]));
          return [];
        }

        saveFeedPosts() {
          localStorage.setItem("miado_feed_posts_v6", JSON.stringify(this.feedPosts));
          this.syncServerDb();
        }

        addAutomaticFeedPost(trackItem, customComment = "") {
          if (!trackItem) return;
          if (
            this.feedPosts[0] &&
            this.feedPosts[0].username === this.user.username &&
            this.feedPosts[0].track &&
            String(this.feedPosts[0].track.id) === String(trackItem.id) &&
            !customComment
          ) {
            return;
          }
          const newPost = {
            id: `post_${Date.now()}`,
            name: this.user.name,
            username: this.user.username,
            avatar: this.user.avatarUrl,
            actionText: customComment ? "compartilhou no Feed Miau" : "acabou de ouvir",
            comment: customComment || `Ouvindo ${trackItem.title} de ${trackItem.artist} (versão original de estúdio) no Miado.`,
            time: "agora mesmo",
            likes: 1,
            likedByMe: true,
            track: {
              ...trackItem,
              coverUrl: ensureTrackCoverUrl(trackItem, trackItem.title, trackItem.artist)
            },
            albumId: trackItem.albumId || "billie_hmhas"
          };
          this.feedPosts.unshift(newPost);
          if (this.feedPosts.length > 30) this.feedPosts = this.feedPosts.slice(0, 30);
          this.saveFeedPosts();
        }

        addUserActivityPost(trackItem, actionLabel = "compartilhou no Feed Miau") {
          this.addAutomaticFeedPost(trackItem, `${this.user.name} ${actionLabel}: "${trackItem.title}" de ${trackItem.artist}!`);
        }

        buildDefaultPlaylists() {
          // Nenhuma playlist padrão pré-pronta ao criar conta ou entrar como visitante
          return [];
        }

        loadPlaylists() {
          try {
            const saved = localStorage.getItem("miado_playlists_v5");
            if (saved !== null) {
              const parsed = JSON.parse(saved);
              if (Array.isArray(parsed)) {
                const cleaned = parsed
                  .filter(pl => pl && !DEFAULT_LEGACY_PLAYLIST_IDS.has(String(pl.id || "")))
                  .map(pl => ({
                    ...pl,
                    customCoverUrl: pl.customCoverUrl || (pl.coverUrl && pl.coverUrl.startsWith("data:image/") ? pl.coverUrl : undefined),
                    coverUrl: pl.customCoverUrl || pl.coverUrl || undefined,
                    collaborators: (pl.collaborators || [this.user?.username || "@ouvinte"]).filter(c => !MiadoState.isLegacyFakeHandle(c)),
                    tracks: (pl.tracks || []).map(tr => {
                      const plCover = pl.customCoverUrl || pl.coverUrl;
                      const hasInherited = tr.coverUrl && (tr.coverUrl === plCover || (typeof tr.coverUrl === "string" && tr.coverUrl.startsWith("data:image/")));
                      const cleanTr = hasInherited ? { ...tr, coverUrl: "" } : tr;
                      return {
                        ...cleanTr,
                        coverUrl: ensureTrackCoverUrl(cleanTr, cleanTr.title, cleanTr.artist),
                        addedBy: tr.addedBy && MiadoState.isLegacyFakeHandle(tr.addedBy.username)
                          ? { username: this.user?.username || "@ouvinte", avatar: this.user?.avatarUrl || CAT_AVATAR_PRESETS[0].url }
                          : tr.addedBy
                      };
                    })
                  }));
                localStorage.setItem("miado_playlists_v5", JSON.stringify(cleaned));
                return cleaned;
              }
            }
          } catch (e) {}
          localStorage.setItem("miado_playlists_v5", JSON.stringify([]));
          return [];
        }

        savePlaylists() {
          localStorage.setItem("miado_playlists_v5", JSON.stringify(this.playlists));
          this.syncServerDb();
        }

        loadFriends() {
          try {
            const saved = localStorage.getItem("miado_real_friends_v1");
            if (saved) {
              const parsed = JSON.parse(saved);
              if (Array.isArray(parsed)) {
                const realOnly = parsed.filter(f => f && f.username && !MiadoState.isLegacyFakeHandle(f.username));
                localStorage.setItem("miado_real_friends_v1", JSON.stringify(realOnly));
                return realOnly;
              }
            }
          } catch (e) {}
          localStorage.setItem("miado_real_friends_v1", JSON.stringify([]));
          return [];
        }

        toggleLike(track) {
          if (!track) return false;
          if (!Array.isArray(this.user.likedTracks)) {
            this.user.likedTracks = [];
          }
          const idStr = String(track.id || "");
          const targetKey = normalizeTrackKey(track);
          const idx = this.user.likedTracks.findIndex(t => {
            if (!t) return false;
            if (idStr && String(t.id) === idStr) return true;
            if (targetKey && targetKey !== "__" && normalizeTrackKey(t) === targetKey) return true;
            return false;
          });
          let nowLiked = false;
          if (idx > -1) {
            this.user.likedTracks.splice(idx, 1);
            nowLiked = false;
            showToast(`"${track.title || "Música"}" removida das Músicas Curtidas`);
          } else {
            this.user.likedTracks.unshift({
              id: idStr || `like_${Date.now()}`,
              title: track.title || "Faixa Miau",
              artist: track.artist || "Artista",
              duration: track.duration || "3:30",
              previewUrl: track.previewUrl || track.streamUrl || "",
              streamUrl: track.streamUrl || track.previewUrl || "",
              rawPreviewUrl: track.rawPreviewUrl || "",
              coverUrl: ensureTrackCoverUrl(track, track.title, track.artist, this.currentAlbum && this.currentAlbum.coverUrl),
              albumTitle: track.albumTitle || (this.currentAlbum && this.currentAlbum.title) || "Single"
            });
            nowLiked = true;
            showToast(`"${track.title || "Música"}" salva nas Músicas Curtidas!`);
          }
          this.saveUser();
          if (window.miadoEngine) {
            window.miadoEngine.updateLikeButtonUI();
          }
          if (window.miadoUI) {
            window.miadoUI.syncAllLikeButtonsInDOM();
          }
          return nowLiked;
        }

        isLiked(trackOrId, title = "", artist = "") {
          if (!trackOrId && !title) return false;
          if (!Array.isArray(this.user.likedTracks)) return false;
          let idStr = "";
          let targetKey = "";
          if (typeof trackOrId === "object" && trackOrId !== null) {
            idStr = String(trackOrId.id || "");
            targetKey = normalizeTrackKey(trackOrId);
          } else {
            idStr = String(trackOrId || "");
            if (title || artist) {
              targetKey = normalizeTrackKey({ title, artist });
            }
          }
          return this.user.likedTracks.some(t => {
            if (!t) return false;
            if (idStr && String(t.id) === idStr) return true;
            if (targetKey && targetKey !== "__" && normalizeTrackKey(t) === targetKey) return true;
            return false;
          });
        }
      }

      const state = new MiadoState();
      window.miadoState = state;

      // ------------------------------------------------------------------------
      // 4. MOTOR DE ÁUDIO COMPLETO (SERVIDOR /API/SEARCH + /API/STREAM + 6 INSTÂNCIAS EM CASCATA)
      // ------------------------------------------------------------------------
      class MiadoMusicResolver {
        static INSTANCES = [
          { type: "piped", url: "https://pipedapi.tokhmi.xyz" },
          { type: "piped", url: "https://pipedapi.ducks.party" },
          { type: "piped", url: "https://pipedapi.r4fo.com" },
          { type: "invidious", url: "https://inv.tux.pizza/api/v1" },
          { type: "invidious", url: "https://invidious.nerdvpn.de/api/v1" },
          { type: "invidious", url: "https://iv.melmac.space/api/v1" }
        ];

        /**
         * Filtro Forçado "Studio Only" (Apenas Gravações Originais de Estúdio HD):
         * Detecta e bloqueia qualquer resultado marcado como 'live', 'ao vivo', 'remix', 'karaoke',
         * 'cover', 'turnê', 'superturnê', 'acústico', 'instrumental', 'sped up' ou 'slowed'.
         */
        static STUDIO_ONLY_REJECT_PATTERNS = [
          /\blive\b/i,
          /\bao[- ]?vivo\b/i,
          /\baovivo\b/i,
          /\ben vivo\b/i,
          /\blive at\b/i,
          /\blive from\b/i,
          /\blive in\b/i,
          /\bsuperturn[eê]\b/i,
          /\bturn[eê]\b/i,
          
          /\bconcert\b/i,
          /\bfestival\b/i,
          /\ballianz\b/i,
          /\bmultishow\b/i,
          /\bthe town\b/i,
          /\brock in rio\b/i,
          /\blollapalooza\b/i,
          /\bcoachella\b/i,
          /\bremix\b/i,
          /\brework\b/i,
          /\bbootleg\b/i,
          /\bmashup\b/i,
          /\bkaraok[eê]\b/i,
          /\bcover\b/i,
          /\btribute\b/i,
          /\boriginally performed\b/i,
          /\bin the style of\b/i,
          /\bac[uú]stico\b/i,
          /\bacoustic\b/i,
          /\bunplugged\b/i,
          /\binstrumental\b/i,
          /\bacapella\b/i,
          /\bsped up\b/i,
          /\bspeed up\b/i,
          /\bslowed\b/i,
          /\bnightcore\b/i,
          /\b8d audio\b/i,
          /\bpar[oó]dia\b/i
        ];

        static MIN_STUDIO_DURATION_SEC = 60;
        static MAX_STUDIO_DURATION_SEC = 720;

        // Mapa de durações de referência da versão original de estúdio ('Studio Version')
        static STUDIO_REFERENCE_DURATIONS = new Map();

        static registerStudioReferenceDuration(title, artist, durationSec) {
          if (!title || !durationSec || durationSec < 95 || durationSec > 600) return;
          const key = normalizeTrackKey(title, artist);
          if (key && !MiadoMusicResolver.STUDIO_REFERENCE_DURATIONS.has(key)) {
            MiadoMusicResolver.STUDIO_REFERENCE_DURATIONS.set(key, durationSec);
          }
        }

        static parseDurationSeconds(durationInput) {
          if (durationInput === null || durationInput === undefined || durationInput === "") return 0;
          if (typeof durationInput === "object") {
            if (durationInput.durationSec) return Number(durationInput.durationSec) || 0;
            if (durationInput.trackTimeMillis) return Math.round(Number(durationInput.trackTimeMillis) / 1000) || 0;
            if (durationInput.duration) return MiadoMusicResolver.parseDurationSeconds(durationInput.duration);
            return 0;
          }
          if (typeof durationInput === "number" && isFinite(durationInput)) {
            return durationInput > 10000 ? Math.round(durationInput / 1000) : Math.round(durationInput);
          }
          const str = String(durationInput).trim();
          if (str.includes(":")) {
            const parts = str.split(":").map(p => parseInt(p, 10) || 0);
            if (parts.length === 2) return parts[0] * 60 + parts[1];
            if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
          }
          const numeric = Number(str);
          if (!isNaN(numeric) && numeric > 0) {
            return numeric > 10000 ? Math.round(numeric / 1000) : Math.round(numeric);
          }
          return 0;
        }

        static hasExcludedNonStudioMetadata(trackOrText = "", artist = "", albumTitle = "", extraVersion = "") {
          let combined = "";
          if (trackOrText && typeof trackOrText === "object") {
            const tr = trackOrText;
            combined = [
              tr.title || tr.trackName || "",
              tr.artist || tr.artistName || artist || "",
              tr.albumTitle || tr.collectionName || albumTitle || "",
              tr.version || tr.versionType || tr.subtitle || extraVersion || ""
            ].join(" ").toLowerCase();
          } else {
            combined = `${trackOrText || ""} ${artist || ""} ${albumTitle || ""} ${extraVersion || ""}`.toLowerCase();
          }

          if (
            combined.includes("remix") ||
            combined.includes("live") ||
            combined.includes("karaoke") ||
            combined.includes("karaokê") ||
            combined.includes("ao vivo") ||
            combined.includes("aovivo") ||
            combined.includes("en vivo") ||
            combined.includes("superturne") ||
            combined.includes("superturnê")
          ) {
            return true;
          }

          for (const pattern of MiadoMusicResolver.STUDIO_ONLY_REJECT_PATTERNS) {
            if (pattern.test(combined)) return true;
          }
          return false;
        }

        static isStudioOnly(title = "", artist = "", albumTitle = "", durationInput = null) {
          const t = String(title || "").trim();
          const a = String(artist || "").trim();
          const alb = String(albumTitle || "").trim();
          if (!t) return false;
          // Allow legitimate album interludes and studio titles

          if (MiadoMusicResolver.hasExcludedNonStudioMetadata(t, a, alb)) {
            return false;
          }

          if (durationInput !== null && durationInput !== undefined && durationInput !== "") {
            const sec = MiadoMusicResolver.parseDurationSeconds(durationInput);
            if (sec > 0 && (sec < MiadoMusicResolver.MIN_STUDIO_DURATION_SEC || sec > MiadoMusicResolver.MAX_STUDIO_DURATION_SEC)) {
              return false;
            }
          }

          const aLow = a.toLowerCase();
          if (
            aLow.includes("karaoke") ||
            aLow.includes("tribute") ||
            aLow.includes("cover") ||
            aLow.includes("8-bit") ||
            aLow.includes("lullaby") ||
            aLow.includes("superturne") ||
            aLow.includes("superturnê") ||
            aLow.includes("ao vivo") ||
            aLow.includes("remix") ||
            aLow.includes("live")
          ) {
            return false;
          }
          return true;
        }

        /**
         * Avalia a fidelidade de uma faixa candidata comparando seus metadados de duração e título
         * com a versão original de estúdio ('Studio Version'), penalizando remixes, versões estendidas ou ao vivo.
         */
        static scoreStudioVersion(track, canonicalStudioDurationSec = 0) {
          if (!track || !(track.title || track.trackName)) return -999;
          const durSec = MiadoMusicResolver.parseDurationSeconds(
            track.durationSec || track.duration || track.trackTimeMillis
          );
          const effectiveDurSec = durSec > 0 ? durSec : 210;

          if (effectiveDurSec < MiadoMusicResolver.MIN_STUDIO_DURATION_SEC || effectiveDurSec > MiadoMusicResolver.MAX_STUDIO_DURATION_SEC) {
            return -999;
          }
          if (MiadoMusicResolver.hasExcludedNonStudioMetadata(track)) {
            return -999;
          }
          if (!MiadoMusicResolver.isStudioOnly(track.title || track.trackName, track.artist || track.artistName, track.albumTitle || track.collectionName, effectiveDurSec)) {
            return -999;
          }

          let score = 100;
          const rawTitle = String(track.title || track.trackName || "").trim();
          const rawAlbum = String(track.albumTitle || track.collectionName || "").trim();

          // Prioriza títulos limpos da Studio Version sem sufixos entre parênteses/colchetes/hífens
          if (!/[(\[\-–—]/.test(rawTitle)) {
            score += 40;
          } else if (/\b(edit|version|versao|versão|mix|live|ao vivo|remix|karaoke|extended|club|radio|acoustic|acustico)\b/i.test(rawTitle)) {
            return -999;
          }

          if (rawAlbum && !/\b(remix|live|karaoke|ao vivo|tour|turne|turnê|deluxe|special)\b/i.test(rawAlbum)) {
            score += 15;
          }

          // Faixas de estúdio padrão (2:00 a 5:30)
          if (effectiveDurSec >= 115 && effectiveDurSec <= 330) {
            score += 20;
          } else if (effectiveDurSec > 390) {
            score -= 30;
          }

          // Compara metadados de duração com a referência oficial da Studio Version
          if (canonicalStudioDurationSec >= MiadoMusicResolver.MIN_STUDIO_DURATION_SEC && effectiveDurSec >= MiadoMusicResolver.MIN_STUDIO_DURATION_SEC) {
            const diff = Math.abs(effectiveDurSec - canonicalStudioDurationSec);
            if (diff <= 4) {
              score += 50;
            } else if (diff <= 12) {
              score += 20;
            } else if (diff > 15) {
              // Descarta/penaliza fortemente candidatos cuja duração diverge >15s da versão de estúdio (típico de remixes/ao vivo)
              score -= 65;
            }
          }

          return score;
        }

        /**
         * Desduplica faixas validando rigorosamente a duração (>= 95 segundos) e bloqueando qualquer metadado
         * contendo 'remix', 'live' ou 'karaoke' mesmo quando coincide parcialmente com o título de estúdio.
         */
        static deduplicateStudioTracks(tracks = []) {
          if (!Array.isArray(tracks)) return [];
          const groups = new Map();
          const orderKeys = [];

          for (const tr of tracks) {
            if (!tr) continue;
            const rawTitle = String(tr.title || tr.trackName || "").trim();
            const rawArtist = String(tr.artist || tr.artistName || "").trim();
            const rawAlbum = String(tr.albumTitle || tr.collectionName || "").trim();
            if (!rawTitle) continue;

            // 1. Exclusão estrita de metadados com 'remix', 'live' ou 'karaoke' (mesmo se coincidir parcialmente com título padrão)
            if (MiadoMusicResolver.hasExcludedNonStudioMetadata(tr, rawArtist, rawAlbum)) {
              continue;
            }

            // 2. Validação estrita da duração da faixa de áudio (>= 95 segundos)
            const parsedDurSec = MiadoMusicResolver.parseDurationSeconds(
              tr.durationSec !== undefined ? tr.durationSec : (tr.duration !== undefined ? tr.duration : tr.trackTimeMillis)
            );
            const effectiveDurSec = parsedDurSec > 0 ? parsedDurSec : 210;
            if (effectiveDurSec < MiadoMusicResolver.MIN_STUDIO_DURATION_SEC || effectiveDurSec > MiadoMusicResolver.MAX_STUDIO_DURATION_SEC) {
              continue;
            }

            if (!MiadoMusicResolver.isStudioOnly(rawTitle, rawArtist, rawAlbum, effectiveDurSec)) {
              continue;
            }

            const key = normalizeTrackKey(rawTitle, rawArtist);
            if (!key || key === "|") continue;

            if (!groups.has(key)) {
              groups.set(key, []);
              orderKeys.push(key);
            }
            groups.get(key).push(tr);
          }

          const out = [];
          for (const key of orderKeys) {
            const candidates = groups.get(key) || [];
            if (candidates.length === 0) continue;

            // Determina a duração de referência da 'Studio Version' (>= 95s)
            let refDurationSec = MiadoMusicResolver.STUDIO_REFERENCE_DURATIONS.get(key) || 0;
            if (!refDurationSec) {
              const cleanCandidate =
                candidates.find(c => {
                  const cDur = MiadoMusicResolver.parseDurationSeconds(c.durationSec || c.duration || c.trackTimeMillis) || 210;
                  return !/[(\[\-–—]/.test(String(c.title || "")) && cDur >= MiadoMusicResolver.MIN_STUDIO_DURATION_SEC;
                }) || candidates[0];
              const candDur = MiadoMusicResolver.parseDurationSeconds(
                cleanCandidate && (cleanCandidate.durationSec || cleanCandidate.duration || cleanCandidate.trackTimeMillis)
              );
              refDurationSec = candDur >= MiadoMusicResolver.MIN_STUDIO_DURATION_SEC ? candDur : 210;
              if (refDurationSec >= MiadoMusicResolver.MIN_STUDIO_DURATION_SEC) {
                MiadoMusicResolver.STUDIO_REFERENCE_DURATIONS.set(key, refDurationSec);
              }
            }

            let best = null;
            let bestScore = -999;

            for (let i = 0; i < candidates.length; i++) {
              const cand = candidates[i];
              const sc = MiadoMusicResolver.scoreStudioVersion(cand, refDurationSec);
              if (sc > bestScore) {
                bestScore = sc;
                best = cand;
              }
            }

            if (!best || bestScore < 0) continue;

            best.coverUrl = ensureTrackCoverUrl(best, best.title, best.artist);
            const studioStream = `/api/stream?title=${encodeURIComponent(best.title || "")}&artist=${encodeURIComponent(best.artist || "")}&preferFull=1&studioOnly=1`;
            best.previewUrl = studioStream;
            best.streamUrl = studioStream;
            best.versionType = "Studio Version";
            delete best.rawPreviewUrl;
            out.push(best);
          }

          return out;
        }

        static filterStudioOnlyTracks(tracks = []) {
          return MiadoMusicResolver.deduplicateStudioTracks(tracks);
        }

        static filterStudioOnlyAlbums(albums = []) {
          if (!Array.isArray(albums)) return [];
          return albums.filter(alb => alb && MiadoMusicResolver.isStudioOnly(alb.title, alb.artist, alb.title));
        }

        /**
         * As fotos 1000x1000 HD de todos os artistas já são resolvidas sob demanda via /api/artist-image,
         * evitando chamadas em lote desnecessárias na inicialização e deixando o app super leve.
         */
        static async hydrateInitialCatalog() {
          return;
        }

        /**
         * Busca perfil oficial do artista + top faixas + discografia 1000x1000 HD via /api/artist
         */
        static async fetchArtistProfile(artistName) {
          try {
            const res = await fetch(`/api/artist?name=${encodeURIComponent(artistName || "")}&studioOnly=1`);
            if (res.ok) {
              const data = await res.json();
              if (data) {
                if (Array.isArray(data.songs)) {
                  data.songs = MiadoMusicResolver.filterStudioOnlyTracks(data.songs);
                }
                if (Array.isArray(data.albums)) {
                  data.albums = MiadoMusicResolver.filterStudioOnlyAlbums(data.albums);
                }
              }
              return data;
            }
          } catch (e) {}
          return null;
        }

        /**
         * Busca as faixas reais e completas de qualquer álbum via /api/album (sem músicas repetidas e Studio Only)
         */
        static async fetchAlbumDetails(album) {
          if (!album) return null;
          try {
            const params = new URLSearchParams();
            if (album.collectionId) params.set("collectionId", String(album.collectionId));
            if (album.dzAlbumId) params.set("dzAlbumId", String(album.dzAlbumId));
            if (album.title) params.set("title", album.title);
            if (album.artist) params.set("artist", album.artist);
            params.set("studioOnly", "1");
            const res = await fetch(`/api/album?${params.toString()}`);
            if (res.ok) {
              const data = await res.json();
              if (data && Array.isArray(data.tracks) && data.tracks.length > 0) {
                data.tracks = MiadoMusicResolver.filterStudioOnlyTracks(data.tracks);
                return data;
              }
            }
          } catch (e) {}
          return null;
        }

        /**
         * Busca Global Dual-Engine com Filtro "Studio Only" Forçado:
         * consulta o servidor /api/search + Catálogo Local + fallback cliente, filtrando
         * rigorosamente versões 'live', 'remix' ou 'karaoke'.
         */
        static async searchCatalog(query) {
          const cleanQ = (query || "").trim();
          const lowerQ = cleanQ.toLowerCase();

          const localArtists = POPULAR_ARTISTS_DIRECTORY.filter(a => a.name.toLowerCase().includes(lowerQ) || a.role.toLowerCase().includes(lowerQ));
          const localSongs = [];
          const localAlbums = [];
          state.albums.forEach(alb => {
            if (
              MiadoMusicResolver.isStudioOnly(alb.title, alb.artist, alb.title) &&
              (alb.title.toLowerCase().includes(lowerQ) || alb.artist.toLowerCase().includes(lowerQ) || (alb.genre && alb.genre.toLowerCase().includes(lowerQ)))
            ) {
              localAlbums.push(alb);
            }
            (alb.tracks || []).forEach(tr => {
              if (
                MiadoMusicResolver.isStudioOnly(tr.title, tr.artist, tr.albumTitle) &&
                (tr.title.toLowerCase().includes(lowerQ) || tr.artist.toLowerCase().includes(lowerQ))
              ) {
                localSongs.push(tr);
              }
            });
          });

          // 1. Consulta o backend /api/search com filtro Studio Only
          try {
            const apiRes = await fetch(`/api/search?q=${encodeURIComponent(cleanQ)}&studioOnly=1`);
            if (apiRes.ok) {
              const apiData = await apiRes.json();
              if (apiData && ((apiData.songs && apiData.songs.length > 0) || (apiData.albums && apiData.albums.length > 0) || (apiData.artists && apiData.artists.length > 0))) {
                const artistsMap = new Map();
                const albumMap = new Map();

                // Prioriza os artistas, álbuns e faixas vindos em tempo real da API (/api/search) antes do catálogo local
                (apiData.artists || []).forEach(art => {
                  const key = (art.name || "").toLowerCase();
                  if (key && !artistsMap.has(key)) {
                    artistsMap.set(key, {
                      ...art,
                      role: "Artista",
                      coverUrl: art.coverUrl || `/api/artist-image?name=${encodeURIComponent(art.name)}`
                    });
                  }
                });
                localArtists.forEach(art => {
                  const key = art.name.toLowerCase();
                  if (!artistsMap.has(key)) artistsMap.set(key, { ...art, role: "Artista" });
                });

                MiadoMusicResolver.filterStudioOnlyAlbums(apiData.albums || []).forEach(a => {
                  const key = (a.title || "").toLowerCase();
                  if (key && !albumMap.has(key)) albumMap.set(key, a);
                });
                localAlbums.forEach(alb => {
                  const key = alb.title.toLowerCase();
                  if (!albumMap.has(key)) albumMap.set(key, alb);
                });

                const combinedSongs = MiadoMusicResolver.filterStudioOnlyTracks([...(apiData.songs || []), ...localSongs]);

                return {
                  artists: Array.from(artistsMap.values()).slice(0, 10),
                  songs: combinedSongs,
                  albums: Array.from(albumMap.values()).slice(0, 14)
                };
              }
            }
          } catch (e) {}

          // 2. Fallback cliente iTunes API + Deezer JSONP API (com filtro Studio Only forçado)
          const songUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(cleanQ)}&country=BR&entity=song&limit=25`;
          const [itunesSettled, deezerSettled] = await Promise.allSettled([
            fetchItunesJson(songUrl),
            fetchDeezerJsonp(cleanQ, 25)
          ]);

          const itunesResults = (itunesSettled.status === "fulfilled" && itunesSettled.value && Array.isArray(itunesSettled.value.results))
            ? itunesSettled.value.results
            : [];
          const deezerResults = (deezerSettled.status === "fulfilled" && Array.isArray(deezerSettled.value))
            ? deezerSettled.value
            : [];

          const rawSongs = [...localSongs];
          const albumMap = new Map();

          localAlbums.forEach(alb => albumMap.set(alb.title.toLowerCase(), alb));

          itunesResults
            .filter(r => MiadoMusicResolver.isStudioOnly(r.trackName, r.artistName, r.collectionName, r.trackTimeMillis))
            .forEach((item, idx) => {
              const cover = item.artworkUrl100 ? upgradeTo1000x1000(item.artworkUrl100) : createSolidAlbumSvg(item.trackName, item.artistName);
              const proxied = toProxyStreamUrl("", item.trackName, item.artistName, true);
              rawSongs.push({
                id: String(item.trackId),
                title: item.trackName,
                artist: item.artistName,
                albumTitle: item.collectionName || "Single",
                duration: formatDurationMs(item.trackTimeMillis),
                genre: item.primaryGenreName || "Pop",
                year: item.releaseDate ? new Date(item.releaseDate).getFullYear() : 2024,
                coverUrl: cover,
                previewUrl: proxied,
                streamUrl: proxied,
                popular: idx < 4
              });
              if (item.collectionId && item.collectionName && MiadoMusicResolver.isStudioOnly(item.collectionName, item.artistName, item.collectionName)) {
                const albKey = item.collectionName.toLowerCase();
                if (!albumMap.has(albKey)) {
                  albumMap.set(albKey, {
                    id: `itunes_alb_${item.collectionId}`,
                    collectionId: item.collectionId,
                    searchQuery: `${item.artistName} ${item.collectionName}`,
                    title: item.collectionName,
                    artist: item.artistName,
                    year: item.releaseDate ? new Date(item.releaseDate).getFullYear() : 2024,
                    releaseDate: item.releaseDate ? new Date(item.releaseDate).toLocaleDateString("pt-BR") : "Lançamento Oficial",
                    genre: item.primaryGenreName || "Música",
                    label: "Catálogo Oficial HD",
                    coverUrl: cover,
                    badges: ["Lossless", "Master", "Hi-Res Audio"],
                    tracks: []
                  });
                }
              }
            });

          deezerResults
            .filter(d => MiadoMusicResolver.isStudioOnly(d.title, d.artist && d.artist.name, d.album && d.album.title, d.duration))
            .forEach((item, idx) => {
              const artistName = (item.artist && item.artist.name) ? item.artist.name : cleanQ;
              const albumTitle = (item.album && item.album.title) ? item.album.title : "Single";
              const cover = (item.album && (item.album.cover_xl || item.album.cover_big || item.album.cover_medium)) ||
                            createSolidAlbumSvg(item.title, artistName);
              const proxied = toProxyStreamUrl("", item.title, artistName, true);
              rawSongs.push({
                id: `dz_${item.id}`,
                title: item.title,
                artist: artistName,
                albumTitle: albumTitle,
                duration: formatDurationMs((item.duration || 210) * 1000),
                genre: "Lossless Stream",
                year: 2024,
                coverUrl: cover,
                previewUrl: proxied,
                streamUrl: proxied,
                popular: idx < 4
              });
              if (item.album && item.album.id && item.album.title && MiadoMusicResolver.isStudioOnly(item.album.title, artistName, item.album.title)) {
                const albKey = item.album.title.toLowerCase();
                if (!albumMap.has(albKey)) {
                  albumMap.set(albKey, {
                    id: `dz_alb_${item.album.id}`,
                    dzAlbumId: item.album.id,
                    searchQuery: `${artistName} ${item.album.title}`,
                    title: item.album.title,
                    artist: artistName,
                    year: 2024,
                    releaseDate: "Lançamento Oficial HD",
                    genre: "Pop / Lossless",
                    label: "Miado Global Catalog",
                    coverUrl: cover,
                    badges: ["Lossless", "Master", "Hi-Res Audio"],
                    tracks: []
                  });
                }
              }
            });

          const finalSongs = MiadoMusicResolver.filterStudioOnlyTracks(rawSongs);
          const finalAlbums = MiadoMusicResolver.filterStudioOnlyAlbums(Array.from(albumMap.values())).slice(0, 12);

          return {
            artists: localArtists.slice(0, 8),
            songs: finalSongs,
            albums: finalAlbums
          };
        }

        /**
         * Garante uma URL de áudio válida via proxy /api/stream (que resolve a música completa de estúdio no backend)
         */
        static async ensurePlayableUrl(track) {
          if (!track) return "";
          const raw = track.rawPreviewUrl || track.previewUrl || track.streamUrl || "";
          return toProxyStreamUrl(raw, track.title || "", track.artist || "", true);
        }

        /**
         * Consulta o resolvedor de faixa completa e percorre as 6 instâncias Piped/Invidious em cascata
         */
        static async resolveFullAudioStream(trackTitle, artistName, fallbackPreviewUrl, instanceIdx = null) {
          try {
            const idxParam = instanceIdx !== null && instanceIdx !== undefined ? `&instanceIdx=${instanceIdx}` : "";
            const res = await fetch(
              `/api/resolve-full?title=${encodeURIComponent(trackTitle || "")}&artist=${encodeURIComponent(artistName || "")}&studioOnly=1${idxParam}`
            );
            if (res.ok) {
              const data = await res.json();
              if (data && data.isFullStream && data.url) {
                return data;
              }
            }
          } catch (e) {}
          return { url: fallbackPreviewUrl, isFullStream: false, source: "Miado Proxy Stream HD" };
        }
      }
      window.MiadoMusicResolver = MiadoMusicResolver;

      // ------------------------------------------------------------------------
      // 5. MOTOR DE ÁUDIO HTML5 + LAZY AUDIOCONTEXT + VISUALIZADOR DE ONDAS OTIMIZADO
      // ------------------------------------------------------------------------
      class MiadoAudioEngine {
        constructor() {
          this.audio = document.getElementById("audio-player");
          this.audio.volume = Math.max(0, Math.min(1, state.volume ?? 0.85));
          this.playRequestId = 0;
          this.isSwitchingTrack = false;
          this.animFrameId = null;
          this.lastTimeUpdatePerf = 0;

          // O AudioContext NUNCA é instanciado no carregamento inicial da página,
          // sendo criado exclusivamente após a primeira interação do usuário.
          this.audioCtx = null;
          this.analyser = null;
          this.gainNode = null;
          this.mediaSource = null;
          this.freqData = null;
          this.timeData = null;
          this.smoothedBars = new Float32Array(32).fill(12);

          this.setupFirstInteractionUnlock();
          this.setupAudioListeners();
          this.setupCanvases();
          this.syncPlayerMetadataUI(state.currentTrack, state.currentAlbum);
          this.updateVolumeUI();
        }

        setupFirstInteractionUnlock() {
          const unlockHandler = () => {
            this.ensureAudioContext();
            window.removeEventListener("pointerdown", unlockHandler);
            window.removeEventListener("keydown", unlockHandler);
            window.removeEventListener("touchstart", unlockHandler);
          };
          window.addEventListener("pointerdown", unlockHandler, { once: true, passive: true });
          window.addEventListener("keydown", unlockHandler, { once: true, passive: true });
          window.addEventListener("touchstart", unlockHandler, { once: true, passive: true });
        }

        ensureAudioContext() {
          try {
            if (!this.audioCtx) {
              const AudioContextClass = window.AudioContext || window.webkitAudioContext;
              if (!AudioContextClass) return;
              this.audioCtx = new AudioContextClass();
              this.analyser = this.audioCtx.createAnalyser();
              this.analyser.fftSize = 128;
              this.analyser.smoothingTimeConstant = 0.85;
              this.gainNode = this.audioCtx.createGain();
              this.gainNode.gain.value = state.isMuted ? 0 : Math.max(0, Math.min(1, state.volume ?? 0.85));
              this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
              this.timeData = new Uint8Array(this.analyser.fftSize);

              try {
                this.mediaSource = this.audioCtx.createMediaElementSource(this.audio);
                this.mediaSource.connect(this.gainNode);
                this.gainNode.connect(this.analyser);
                this.analyser.connect(this.audioCtx.destination);
              } catch (srcErr) {}
            }
            if (this.audioCtx && this.audioCtx.state === "suspended") {
              this.audioCtx.resume().catch(() => {});
            }
          } catch (e) {}
        }

        setupAudioListeners() {
          this.audio.addEventListener("play", () => {
            state.setIsPlaying(true);
            this.startVisualizerLoop();
          });

          this.audio.addEventListener("playing", () => {
            this.isSwitchingTrack = false;
            state.setIsPlaying(true);
            this.startVisualizerLoop();
          });

          this.audio.addEventListener("pause", () => {
            if (!this.isSwitchingTrack && !this.audio.ended) {
              state.setIsPlaying(false);
            }
          });

          this.audio.addEventListener("loadedmetadata", () => {
            if (this.audio.duration && isFinite(this.audio.duration) && this.audio.duration > 1) {
              const formatted = this.formatTime(this.audio.duration);
              const totalEl = document.getElementById("player-total-time");
              if (totalEl) totalEl.textContent = formatted;
              const fsTotalEl = document.getElementById("fs-total-time");
              if (fsTotalEl) fsTotalEl.textContent = formatted;
              if (state.currentTrack && this.audio.duration > 45) {
                state.currentTrack.duration = formatted;
              }
            }
          });

          this.audio.addEventListener("timeupdate", () => {
            const now = performance.now();
            if (now - this.lastTimeUpdatePerf < 160) return;
            this.lastTimeUpdatePerf = now;
            if (!this.audio.duration || isNaN(this.audio.duration)) return;
            const pct = Math.min(100, Math.max(0, (this.audio.currentTime / this.audio.duration) * 100));
            const curFormatted = this.formatTime(this.audio.currentTime);
            const totFormatted = this.formatTime(this.audio.duration);

            const fillEl = document.getElementById("player-seek-fill");
            if (fillEl) fillEl.style.width = `${pct}%`;
            const fsFillEl = document.getElementById("fs-seek-fill");
            if (fsFillEl) fsFillEl.style.width = `${pct}%`;
            const mobFillEl = document.getElementById("mobile-seek-fill");
            if (mobFillEl) mobFillEl.style.width = `${pct}%`;

            const curEl = document.getElementById("player-current-time");
            const totEl = document.getElementById("player-total-time");
            if (curEl) curEl.textContent = curFormatted;
            if (totEl) totEl.textContent = totFormatted;

            const fsCurEl = document.getElementById("fs-current-time");
            const fsTotEl = document.getElementById("fs-total-time");
            if (fsCurEl) fsCurEl.textContent = curFormatted;
            if (fsTotEl) fsTotEl.textContent = totFormatted;
          });

          this.audio.addEventListener("ended", () => {
            if (state.isRepeat) {
              this.audio.currentTime = 0;
              this.audio.play().then(() => state.setIsPlaying(true)).catch(() => {});
            } else {
              this.nextTrack();
            }
          });
        }

        syncPlayerMetadataUI(track, album) {
          if (!track) {
            const emptyCover = createSolidAlbumSvg("Miado", "Player");
            ["player-cover-img", "mobile-thumb-img", "fs-cover-img"].forEach(id => {
              const img = document.getElementById(id);
              if (img) img.src = emptyCover;
            });
            ["player-track-name", "mobile-track-title", "fs-track-title"].forEach(id => {
              const el = document.getElementById(id);
              if (el) el.textContent = "Escolha uma música";
            });
            ["player-track-artist", "mobile-track-artist", "fs-track-artist"].forEach(id => {
              const el = document.getElementById(id);
              if (el) el.textContent = "Miado";
            });
            ["player-total-time", "fs-total-time"].forEach(id => {
              const el = document.getElementById(id);
              if (el) el.textContent = "0:00";
            });
            return;
          }
          const cover = ensureTrackCoverUrl(track, track.title, track.artist, album && album.coverUrl);
          track.coverUrl = cover;

          const fsAmbientEl = document.getElementById("fs-ambient-bg");
          if (fsAmbientEl && cover) {
            fsAmbientEl.style.backgroundImage = `url('${cover}')`;
          }

          const playerFooterEl = document.querySelector(".player-footer");
          if (playerFooterEl) {
            playerFooterEl.style.filter = "none";
            playerFooterEl.style.webkitFilter = "none";
          }
          const mobilePlayerEl = document.getElementById("mobile-floating-player");
          if (mobilePlayerEl) {
            mobilePlayerEl.style.filter = "none";
            mobilePlayerEl.style.webkitFilter = "none";
          }

          const imgDesktop = document.getElementById("player-cover-img");
          if (imgDesktop) {
            delete imgDesktop.dataset.retriedCover;
            imgDesktop.style.filter = "none";
            imgDesktop.style.webkitFilter = "none";
            imgDesktop.onerror = () => window.handleImgError(imgDesktop, track.title, track.artist);
            imgDesktop.src = cover;
          }

          const trackNameEl = document.getElementById("player-track-name");
          if (trackNameEl) {
            trackNameEl.textContent = track.title;
            trackNameEl.style.filter = "none";
            trackNameEl.style.webkitFilter = "none";
            applySpotifyMarquee(trackNameEl);
          }
          const trackArtistEl = document.getElementById("player-track-artist");
          if (trackArtistEl) {
            trackArtistEl.textContent = track.artist;
            trackArtistEl.style.filter = "none";
            trackArtistEl.style.webkitFilter = "none";
          }
          const totalTimeEl = document.getElementById("player-total-time");
          if (totalTimeEl) totalTimeEl.textContent = track.duration || "3:30";

          const imgMobile = document.getElementById("mobile-thumb-img");
          if (imgMobile) {
            delete imgMobile.dataset.retriedCover;
            imgMobile.style.filter = "none";
            imgMobile.style.webkitFilter = "none";
            imgMobile.onerror = () => window.handleImgError(imgMobile, track.title, track.artist);
            imgMobile.src = cover;
          }
          const mobTitleEl = document.getElementById("mobile-track-title");
          if (mobTitleEl) {
            mobTitleEl.textContent = track.title;
            mobTitleEl.style.filter = "none";
            mobTitleEl.style.webkitFilter = "none";
            applySpotifyMarquee(mobTitleEl);
          }
          const mobArtistEl = document.getElementById("mobile-track-artist");
          if (mobArtistEl) {
            mobArtistEl.textContent = track.artist;
            mobArtistEl.style.filter = "none";
            mobArtistEl.style.webkitFilter = "none";
          }

          const imgFs = document.getElementById("fs-cover-img");
          if (imgFs) {
            delete imgFs.dataset.retriedCover;
            imgFs.style.filter = "none";
            imgFs.style.webkitFilter = "none";
            imgFs.onerror = () => window.handleImgError(imgFs, track.title, track.artist);
            imgFs.src = cover;
          }
          const fsTitleEl = document.getElementById("fs-track-title");
          if (fsTitleEl) {
            fsTitleEl.textContent = track.title;
            fsTitleEl.style.filter = "none";
            fsTitleEl.style.webkitFilter = "none";
            applySpotifyMarquee(fsTitleEl);
          }
          const fsArtistEl = document.getElementById("fs-track-artist");
          if (fsArtistEl) {
            fsArtistEl.textContent = track.artist;
            fsArtistEl.style.filter = "none";
            fsArtistEl.style.webkitFilter = "none";
          }

          const fsTotEl = document.getElementById("fs-total-time");
          if (fsTotEl) fsTotEl.textContent = track.duration || "3:30";
          const fsCtxEl = document.getElementById("fs-context-title");
          if (fsCtxEl) fsCtxEl.textContent = (album && album.title) ? album.title : (track.albumTitle || "Fila de Reprodução");

          this.updateLikeButtonUI();
          if (window.miadoUI) {
            window.miadoUI.renderFullscreenUpNext();
          }
        }

        /**
         * Tenta reproduzir uma URL no elemento <audio> com timeout de segurança e verificação de erro
         */
        attemptPlayUrl(url, currentReq, timeoutMs = 11500) {
          return new Promise((resolve) => {
            if (currentReq !== this.playRequestId || !url) {
              resolve(false);
              return;
            }
            let settled = false;
            const finish = (ok) => {
              if (settled) return;
              settled = true;
              clearTimeout(timer);
              this.audio.removeEventListener("error", onErr);
              this.audio.removeEventListener("playing", onPlaying);
              resolve(ok);
            };
            const onErr = () => finish(false);
            const onPlaying = () => finish(true);
            const timer = setTimeout(() => finish(false), timeoutMs);

            this.audio.addEventListener("error", onErr, { once: true });
            this.audio.addEventListener("playing", onPlaying, { once: true });

            try {
              this.audio.src = url;
              this.audio.load();
              const playPromise = this.audio.play();
              if (playPromise && typeof playPromise.then === "function") {
                playPromise.then(() => finish(true)).catch(() => finish(false));
              }
            } catch (e) {
              finish(false);
            }
          });
        }

        /**
         * Reproduz músicas completas (3 a 5+ minutos, sem anúncios) via proxy stream URL (/api/stream),
         * com tratamento de erros e auto-retry sequencial pelas 6 instâncias Piped/Invidious definidas
         * antes de acionar o preview de contingência em último caso.
         */
        async playTrack(track, album = state.currentAlbum) {
          if (!track) return;
          this.ensureAudioContext();
          const currentReq = ++this.playRequestId;
          this.isSwitchingTrack = true;

          const isActualAlbum = album && !album.isPlaylist && !String(album.id || "").startsWith("pl_");
          track.coverUrl = ensureTrackCoverUrl(track, track.title, track.artist, isActualAlbum ? album.coverUrl : "");
          state.currentTrack = track;
          if (album) state.currentAlbum = album;

          // Sincroniza a fila sem duplicatas e posiciona o índice na música atual
          if (!Array.isArray(state.queue) || state.queue.length === 0) {
            const baseTracks = (album && Array.isArray(album.tracks) && album.tracks.length > 0)
              ? deduplicateTracks(album.tracks)
              : [track];
            state.queue = baseTracks;
            state.originalQueue = [...baseTracks];
          }
          const foundIdx = state.queue.findIndex(t => t && (String(t.id) === String(track.id) || normalizeTrackKey(t) === normalizeTrackKey(track)));
          if (foundIdx > -1) {
            state.queueIndex = foundIdx;
          } else {
            state.queue.push(track);
            state.queueIndex = state.queue.length - 1;
          }

          state.recordTrackInHistory(track, album);
          this.syncPlayerMetadataUI(track, album);

          if (window.miadoUI) {
            window.miadoUI.highlightPlayingTrackInDOM();
            window.miadoUI.renderRightSidebarBodyOnly();
          }

          const tKey = normalizeTrackKey(track);
          const cachedStream = sessionStorage.getItem("miado_stream_" + tKey);
          let started = false;

          // 1. Tenta carregar do cache local de áudio da sessão (0ms de latência)
          if (cachedStream) {
            started = await this.attemptPlayUrl(cachedStream, currentReq, 3500);
          }

          // 2. Tentativa Primária: Proxy Stream URL com resolução paralela ultrarrápida no backend
          if (!started && currentReq === this.playRequestId) {
            const rawCandidate = track.rawPreviewUrl || track.previewUrl || track.streamUrl || "";
            const primaryProxyStreamUrl = toProxyStreamUrl(rawCandidate, track.title, track.artist, true);
            started = await this.attemptPlayUrl(primaryProxyStreamUrl, currentReq, 6000);
            if (started) {
              try { sessionStorage.setItem("miado_stream_" + tKey, primaryProxyStreamUrl); } catch (_e) {}
            }
          }

          // 3. Contingência rápida pelo servidor (otimizada sem loop de 6 instâncias que esquentava o celular)
          if (!started && currentReq === this.playRequestId) {
            const contingencyUrl = `/api/stream?title=${encodeURIComponent(track.title || "")}&artist=${encodeURIComponent(track.artist || "")}&preferFull=1&retry=1`;
            started = await this.attemptPlayUrl(contingencyUrl, currentReq, 5500);
            if (started) {
              try { sessionStorage.setItem("miado_stream_" + tKey, contingencyUrl); } catch (_e) {}
            }
          }

          if ( currentReq === this.playRequestId) {
            this.isSwitchingTrack = false;
            if (started) {
              state.setIsPlaying(true);
              this.startVisualizerLoop();
              showToast(`Tocando agora: ${track.title} - ${track.artist}`);
              this.prefetchNextTrack();
            } else {
              state.setIsPlaying(false);
            }
          }
        }

        prefetchNextTrack() {
          try {
            if (!Array.isArray(state.queue) || state.queue.length < 2) return;
            const nextIdx = (state.queueIndex + 1) % state.queue.length;
            const nextTr = state.queue[nextIdx];
            if (!nextTr || !nextTr.title) return;
            fetch(`/api/resolve-full?title=${encodeURIComponent(nextTr.title)}&artist=${encodeURIComponent(nextTr.artist || "")}&studioOnly=1`).catch(() => {});
          } catch (e) {}
        }

        togglePlay() {
          this.ensureAudioContext();
          if (!state.currentTrack) {
            state.currentTrack = state.albums[0].tracks[0];
            state.currentAlbum = state.albums[0];
          }
          const currentAttrSrc = this.audio.getAttribute("src");
          if (!currentAttrSrc) {
            this.playTrack(state.currentTrack, state.currentAlbum);
            return;
          }
          if (this.audio.paused) {
            this.audio.play().then(() => {
              state.setIsPlaying(true);
              this.startVisualizerLoop();
            }).catch(() => {
              this.playTrack(state.currentTrack, state.currentAlbum);
            });
          } else {
            this.audio.pause();
            state.setIsPlaying(false);
          }
        }

        nextTrack() {
          this.ensureAudioContext();
          if (!Array.isArray(state.queue) || state.queue.length === 0) {
            const fallbackTracks = (state.currentAlbum && Array.isArray(state.currentAlbum.tracks) && state.currentAlbum.tracks.length > 0)
              ? deduplicateTracks(state.currentAlbum.tracks)
              : deduplicateTracks(state.albums[0].tracks);
            state.queue = [...fallbackTracks];
            state.originalQueue = [...fallbackTracks];
            state.queueIndex = 0;
          }

          const currentId = state.currentTrack ? String(state.currentTrack.id) : "";
          const syncedIdx = state.queue.findIndex(t => t && String(t.id) === currentId);
          if (syncedIdx > -1) {
            state.queueIndex = syncedIdx;
          }

          if (state.queue.length > 1) {
            state.queueIndex = (state.queueIndex + 1) % state.queue.length;
          } else {
            state.queueIndex = 0;
          }

          const next = state.queue[state.queueIndex] || state.albums[0].tracks[0];
          this.playTrack(next, state.currentAlbum);
        }

        prevTrack() {
          this.ensureAudioContext();
          if (!Array.isArray(state.queue) || state.queue.length === 0) {
            const fallbackTracks = (state.currentAlbum && Array.isArray(state.currentAlbum.tracks) && state.currentAlbum.tracks.length > 0)
              ? deduplicateTracks(state.currentAlbum.tracks)
              : deduplicateTracks(state.albums[0].tracks);
            state.queue = [...fallbackTracks];
            state.originalQueue = [...fallbackTracks];
            state.queueIndex = 0;
          }

          if (this.audio.currentTime > 3) {
            this.audio.currentTime = 0;
            if (this.audio.paused) {
              this.audio.play().then(() => state.setIsPlaying(true)).catch(() => {});
            }
            return;
          }

          const currentId = state.currentTrack ? String(state.currentTrack.id) : "";
          const syncedIdx = state.queue.findIndex(t => t && String(t.id) === currentId);
          if (syncedIdx > -1) {
            state.queueIndex = syncedIdx;
          }

          state.queueIndex = (state.queueIndex - 1 + state.queue.length) % state.queue.length;
          const prev = state.queue[state.queueIndex] || state.albums[0].tracks[0];
          this.playTrack(prev, state.currentAlbum);
        }

        addToQueueNext(track) {
          if (!track) return;
          const cleanTrack = {
            ...track,
            _isManualQueue: true,
            coverUrl: ensureTrackCoverUrl(track, track.title, track.artist)
          };
          if (!state.currentTrack || !Array.isArray(state.queue) || state.queue.length === 0) {
            state.queue = [cleanTrack];
            state.queueIndex = 0;
            state.manualQueueCount = 1;
            this.playTrack(cleanTrack);
          } else {
            const insertIdx = Math.max(0, (state.queueIndex ?? 0) + 1);
            state.queue.splice(insertIdx, 0, cleanTrack);
            state.manualQueueCount = (state.manualQueueCount || 0) + 1;
          }
          if (window.miadoUI) {
            window.miadoUI.renderRightSidebarBodyOnly();
            window.miadoUI.renderFullscreenUpNext();
          }
          showToast(`"${cleanTrack.title}" tocará a seguir`);
        }

        addToQueueEnd(track) {
          if (!track) return;
          const cleanTrack = {
            ...track,
            _isManualQueue: true,
            coverUrl: ensureTrackCoverUrl(track, track.title, track.artist)
          };
          if (!state.currentTrack || !Array.isArray(state.queue) || state.queue.length === 0) {
            state.queue = [cleanTrack];
            state.queueIndex = 0;
            state.manualQueueCount = 1;
            this.playTrack(cleanTrack);
          } else {
            const mCount = state.manualQueueCount || 0;
            const insertIdx = Math.min(state.queue.length, (state.queueIndex ?? 0) + 1 + mCount);
            state.queue.splice(insertIdx, 0, cleanTrack);
            state.manualQueueCount = mCount + 1;
          }
          if (window.miadoUI) {
            window.miadoUI.renderRightSidebarBodyOnly();
            window.miadoUI.renderFullscreenUpNext();
          }
          showToast(`"${cleanTrack.title}" adicionada à fila de reprodução`);
        }

        setVolume(val, showFeedback = false) {
          const clamped = Math.max(0, Math.min(1, Number(val)));
          state.saveVolume(clamped);
          state.isMuted = clamped === 0;
          this.audio.muted = state.isMuted;
          this.audio.volume = clamped;
          if (this.gainNode && this.audioCtx) {
            try {
              this.gainNode.gain.setValueAtTime(state.isMuted ? 0 : clamped, this.audioCtx.currentTime);
            } catch (e) {
              this.gainNode.gain.value = state.isMuted ? 0 : clamped;
            }
          }
          this.updateVolumeUI();
          if (showFeedback) {
            showToast(state.isMuted ? "Volume: Mudo (0%)" : `Volume: ${Math.round(clamped * 100)}%`);
          }
        }

        toggleMute() {
          if (!state.isMuted && state.volume > 0) {
            this.previousUnmutedVolume = state.volume;
            state.isMuted = true;
          } else {
            state.isMuted = false;
            if (!state.volume || state.volume === 0) {
              state.saveVolume(this.previousUnmutedVolume || 0.85);
            }
          }
          const effectiveVol = state.isMuted ? 0 : Math.max(0, Math.min(1, state.volume || 0.85));
          this.audio.muted = state.isMuted;
          this.audio.volume = effectiveVol;
          if (this.gainNode && this.audioCtx) {
            try {
              this.gainNode.gain.setValueAtTime(effectiveVol, this.audioCtx.currentTime);
            } catch (e) {
              this.gainNode.gain.value = effectiveVol;
            }
          }
          this.updateVolumeUI();
          showToast(state.isMuted ? "Áudio silenciado (Mudo)" : `Áudio ativado (${Math.round(effectiveVol * 100)}%)`);
        }

        updateVolumeUI() {
          const effectivePct = state.isMuted ? 0 : Math.round(Math.max(0, Math.min(1, state.volume ?? 0.85)) * 100);
          ["player-volume-fill", "fs-volume-fill"].forEach(id => {
            const fillEl = document.getElementById(id);
            if (fillEl) fillEl.style.width = `${effectivePct}%`;
          });
          ["player-volume-pct", "fs-volume-pct"].forEach(id => {
            const pctEl = document.getElementById(id);
            if (pctEl) pctEl.textContent = `${effectivePct}%`;
          });
          const iconEl = document.getElementById("volume-icon");
          if (iconEl) {
            if (state.isMuted || effectivePct === 0) {
              iconEl.innerHTML = `<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>`;
            } else if (effectivePct < 50) {
              iconEl.innerHTML = `<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>`;
            } else {
              iconEl.innerHTML = `<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>`;
            }
          }
        }

        updatePlayStateUI(isPlaying) {
          const playIcon = `<polygon points="6 4 20 12 6 20 6 4"/>`;
          const pauseIcon = `<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>`;
          const mainIconEl = document.getElementById("main-play-icon");
          const mobileIconEl = document.getElementById("mobile-play-icon");
          const fsIconEl = document.getElementById("fs-play-icon");
          if (mainIconEl) mainIconEl.innerHTML = isPlaying ? pauseIcon : playIcon;
          if (mobileIconEl) mobileIconEl.innerHTML = isPlaying ? pauseIcon : playIcon;
          if (fsIconEl) fsIconEl.innerHTML = isPlaying ? pauseIcon : playIcon;

          ["player-btn-play", "mobile-btn-play", "fs-btn-play"].forEach(btnId => {
            const btn = document.getElementById(btnId);
            if (btn) {
              btn.classList.toggle("playing", Boolean(isPlaying));
              btn.setAttribute("aria-pressed", isPlaying ? "true" : "false");
            }
          });
        }

        updateLikeButtonUI() {
          if (!state.currentTrack) return;
          const isLiked = state.isLiked(state.currentTrack);
          const tooltipText = isLiked
            ? "Remover das Músicas Curtidas"
            : "Curtir faixa — salvar em Músicas Curtidas";

          ["player-btn-like", "mobile-btn-like", "fs-btn-like"].forEach(btnId => {
            const btn = document.getElementById(btnId);
            if (!btn) return;
            const iconSize = btnId === "fs-btn-like" ? 19 : 18;
            btn.classList.toggle("liked", isLiked);
            btn.setAttribute("data-tooltip", tooltipText);
            btn.setAttribute("title", tooltipText);
            btn.setAttribute("aria-pressed", isLiked ? "true" : "false");
            btn.innerHTML = isLiked
              ? `<svg width="${iconSize}" height="${iconSize}" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`
              : `<svg width="${iconSize}" height="${iconSize}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`;
          });
        }

        formatTime(seconds) {
          if (!seconds || isNaN(seconds)) return "0:00";
          const m = Math.floor(seconds / 60);
          const s = Math.floor(seconds % 60);
          return `${m}:${s < 10 ? "0" : ""}${s}`;
        }

        setupCanvases() {
          const miniCanvas = document.getElementById("mini-spectrum-canvas");
          const fsCanvas = document.getElementById("fs-spectrum-canvas");
          this.startVisualizerLoop = () => {};
          if (!miniCanvas && !fsCanvas) return;
        }
      }

      const engine = new MiadoAudioEngine();
      window.miadoEngine = engine;

      // ------------------------------------------------------------------------
      // 6. INTERFACE E ROTEADOR DE VIEWS (DESKTOP & MOBILE)
      // ------------------------------------------------------------------------
      class MiadoUI {
        constructor() {
          this.scrollContainer = document.getElementById("main-content-scroll");
          this.activeRightTab = "friends";
          this.selectedCatPresetUrl = state.user.avatarUrl;
          this.historyStack = state.historyStack;
          this.historyIndex = state.historyIndex;
          this.creatingCollaborativeMode = true;
          this.currentOnboardingStep = 1;
          this.selectedFavoriteArtists = new Set(
            Array.isArray(state.user.favoriteArtists) ? state.user.favoriteArtists : []
          );
          this.selectedFavoriteGenres = new Set(
            Array.isArray(state.user.favoriteGenres) ? state.user.favoriteGenres : []
          );
          this.onboardingCustomArtists = [];
          this.extraDiscoveredArtists = [];
          this.extraDiscoveredAlbums = [];
          this.extraDiscoveredSongs = [];
          this.discoverPage = 0;
          this.isFetchingDiscover = false;
          this.onboardDiscoverPage = 0;
          this.isFetchingOnboardArtists = false;

          this.syncHeaderUserUI();
          this.setupNavigation();
          this.setupPlayerControls();
          this.setupModals();
          this.setupInfiniteScroll();
          this.renderSidebarPlaylists();
          this.renderRightSidebar();
          this.navigateTo("home", false);

          this.setupSpotifyContextMenu();
          this.closeAllModals();

          // Exibe a Tela de Boas-Vindas (#miado-welcome-screen) bloqueando o acesso até clicar em 'Criar Conta', 'Entrar' ou 'Continuar como Visitante'.
          // Persiste ao dar F5 (refresh) até que uma sessão real autenticada esteja ativa!
          this.enforceWelcomeScreenGate();
        }

        hasActiveAuthenticatedSession() {
          return Boolean(
            state.user &&
            state.user.email &&
            state.user.email !== "usr_guest@miado.app" &&
            localStorage.getItem("miado_active_session_v1") === "true"
          );
        }

        enforceWelcomeScreenGate() {
          const welcomeEl = document.getElementById("miado-welcome-screen");
          if (!welcomeEl) return;
          const sessionActive = this.hasActiveAuthenticatedSession() || Boolean(window._miadoGuestSessionActive);
          if (sessionActive) {
            welcomeEl.classList.remove("active", "closing");
          } else {
            welcomeEl.classList.remove("closing");
            welcomeEl.classList.add("active");
          }
        }

        dismissWelcomeScreenAnimated(callback) {
          const welcomeEl = document.getElementById("miado-welcome-screen");
          if (!welcomeEl) {
            if (typeof callback === "function") callback();
            return;
          }
          welcomeEl.classList.add("closing");
          setTimeout(() => {
            welcomeEl.classList.remove("active", "closing");
            if (typeof callback === "function") callback();
          }, 360);
        }

        setupInfiniteScroll() {
          if (this.scrollContainer) {
            this.scrollContainer.addEventListener("scroll", () => {
              if (state.currentView !== "home" || this.isFetchingDiscover) return;
              const { scrollTop, scrollHeight, clientHeight } = this.scrollContainer;
              if (scrollTop + clientHeight >= scrollHeight - 520) {
                this.loadMoreDiscoverContent();
              }
            });
          }

          const onboardGrid = document.getElementById("onboard-artists-grid");
          if (onboardGrid) {
            onboardGrid.addEventListener("scroll", () => {
              if (this.isFetchingOnboardArtists) return;
              const { scrollTop, scrollHeight, clientHeight } = onboardGrid;
              if (scrollTop + clientHeight >= scrollHeight - 140) {
                this.loadMoreOnboardingArtists();
              }
            });
          }
        }

        async loadMoreOnboardingArtists() {
          if (this.isFetchingOnboardArtists) return;
          this.isFetchingOnboardArtists = true;
          const nextPage = (this.onboardDiscoverPage || 0) + 1;
          try {
            const res = await fetch(`/api/discover-more?page=${nextPage}`);
            if (res.ok) {
              const data = await res.json();
              if (data && Array.isArray(data.artists) && data.artists.length > 0) {
                this.onboardDiscoverPage = nextPage;
                if (!this.onboardingCustomArtists) this.onboardingCustomArtists = [];
                data.artists.forEach(art => {
                  if (art && art.name && !this.onboardingCustomArtists.some(x => x.name.toLowerCase() === art.name.toLowerCase())) {
                    this.onboardingCustomArtists.push({
                      name: art.name,
                      coverUrl: art.coverUrl || `/api/artist-image?name=${encodeURIComponent(art.name)}`
                    });
                  }
                });
                const grid = document.getElementById("onboard-artists-grid");
                const prevScroll = grid ? grid.scrollTop : 0;
                this.renderOnboardingArtistsGrid();
                if (grid) grid.scrollTop = prevScroll;
              }
            }
          } catch (_e) {
          } finally {
            this.isFetchingOnboardArtists = false;
          }
        }

        async loadMoreDiscoverContent() {
          if (this.isFetchingDiscover || state.currentView !== "home") return;
          this.isFetchingDiscover = true;
          const nextPage = (this.discoverPage || 0) + 1;
          const statusEl = document.getElementById("home-infinite-status");
          if (statusEl) {
            statusEl.innerHTML = `<span class="infinite-scroll-dot"></span><span>Carregando mais artistas, álbuns e músicas...</span>`;
          }

          try {
            const res = await fetch(`/api/discover-more?page=${nextPage}`);
            if (!res.ok) throw new Error("Falha ao carregar página");
            const data = await res.json();
            this.discoverPage = nextPage;

            const newArtists = Array.isArray(data?.artists) ? data.artists : [];
            const newAlbums = Array.isArray(data?.albums) ? data.albums : [];
            const newSongs = Array.isArray(data?.songs) ? data.songs : [];

            const artistsGrid = document.getElementById("home-artists-infinite-grid");
            if (artistsGrid && newArtists.length > 0) {
              const existingNames = new Set(
                Array.from(artistsGrid.querySelectorAll("[data-open-artist]")).map(el =>
                  String(el.getAttribute("data-open-artist") || "").toLowerCase().trim()
                )
              );
              newArtists.forEach(art => {
                if (!art || !art.name) return;
                const k = art.name.toLowerCase().trim();
                if (existingNames.has(k)) return;
                existingNames.add(k);
                this.extraDiscoveredArtists.push(art);

                const card = document.createElement("div");
                card.className = "artist-bubble-card";
                card.setAttribute("data-open-artist", art.name);
                const cover = ensureArtistAvatarUrl(art);
                card.innerHTML = `
                  <div class="artist-avatar-wrap shimmer">
                    <img class="artist-bubble-img" data-artist-bubble-img="${art.name}" src="${cover}" alt="${art.name}" referrerpolicy="no-referrer" onload="this.classList.add('loaded'); this.parentElement.classList.remove('shimmer');" onerror="window.handleImgError(this, '${art.name.replace(/'/g, "")}', 'Artista')" />
                    <button type="button" class="floating-artist-play" data-play-artist="${art.name}" title="Tocar ${art.name}">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>
                    </button>
                  </div>
                  <div class="artist-bubble-info">
                    <div class="artist-bubble-name">${art.name}</div>
                    <div class="artist-bubble-sub">${art.role || "Artista"}</div>
                  </div>
                `;
                card.addEventListener("click", (e) => {
                  if (e.target.closest("[data-play-artist]")) return;
                  this.navigateTo("artist", true, { artistName: art.name });
                });
                const playBtn = card.querySelector("[data-play-artist]");
                if (playBtn) {
                  playBtn.addEventListener("click", async (e) => {
                    e.stopPropagation();
                    showToast(`Carregando músicas de ${art.name}...`);
                    const prof = await MiadoMusicResolver.fetchArtistProfile(art.name);
                    if (prof && Array.isArray(prof.songs) && prof.songs.length > 0) {
                      state.queue = [...prof.songs];
                      state.queueIndex = 0;
                      engine.playTrack(prof.songs[0], { id: `art_${art.name}`, title: art.name, artist: art.name, coverUrl: prof.songs[0].coverUrl });
                      this.renderRightSidebarBodyOnly();
                    } else {
                      this.navigateTo("artist", true, { artistName: art.name });
                    }
                  });
                }
                artistsGrid.appendChild(card);
              });
            }

            const albumsContainer = document.getElementById("home-albums-infinite-grid");
            if (albumsContainer && newAlbums.length > 0) {
              if (!this.homeAlbumsPool) this.homeAlbumsPool = [];
              const existingAlbIds = new Set(this.homeAlbumsPool.map(a => String(a.id)));
              newAlbums.forEach(album => {
                if (!album || !album.title || existingAlbIds.has(String(album.id))) return;
                existingAlbIds.add(String(album.id));
                const resolvedCover = ensureTrackCoverUrl(album.coverUrl, album.title, album.artist);
                const cleanAlb = { ...album, coverUrl: resolvedCover };
                this.homeAlbumsPool.push(cleanAlb);
                this.extraDiscoveredAlbums.push(cleanAlb);

                const card = document.createElement("div");
                card.className = "album-card";
                card.setAttribute("data-album-id", cleanAlb.id);
                card.innerHTML = `
                  <div class="album-cover-wrap">
                    <img class="album-cover-img" data-album-img="${cleanAlb.id}" src="${cleanAlb.coverUrl}" alt="${cleanAlb.title}" referrerpolicy="no-referrer" onerror="window.handleImgError(this, '${cleanAlb.title.replace(/'/g, "")}', '${cleanAlb.artist.replace(/'/g, "")}')" />
                    <button class="floating-card-play" data-play-album-id="${cleanAlb.id}" title="Tocar ${cleanAlb.title}">
                      <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>
                    </button>
                  </div>
                  <div class="album-card-title">${cleanAlb.title}</div>
                  <div class="album-card-sub">${cleanAlb.artist}</div>
                `;
                card.addEventListener("click", (e) => {
                  if (e.target.closest("[data-play-album-id]")) return;
                  this.navigateTo("album", true, { albumId: cleanAlb.id, customAlbum: cleanAlb });
                });
                const playBtn = card.querySelector("[data-play-album-id]");
                if (playBtn) {
                  playBtn.addEventListener("click", async (e) => {
                    e.stopPropagation();
                    if (!Array.isArray(cleanAlb.tracks) || cleanAlb.tracks.length === 0) {
                      const details = await MiadoMusicResolver.fetchAlbumDetails(cleanAlb);
                      if (details && Array.isArray(details.tracks) && details.tracks.length > 0) {
                        cleanAlb.tracks = deduplicateTracks(details.tracks);
                      }
                    }
                    if (cleanAlb.tracks && cleanAlb.tracks.length > 0) {
                      state.queue = [...cleanAlb.tracks];
                      state.queueIndex = 0;
                      engine.playTrack(cleanAlb.tracks[0], cleanAlb);
                      this.renderRightSidebarBodyOnly();
                    }
                  });
                }
                albumsContainer.appendChild(card);
              });
            }

            const tracksTable = document.getElementById("home-songs-infinite-table");
            if (tracksTable && newSongs.length > 0) {
              if (!this.homeGlobalTopTracks) this.homeGlobalTopTracks = [];
              const existingTrackKeys = new Set(this.homeGlobalTopTracks.map(t => normalizeTrackKey(t)));
              newSongs.forEach(rawTrack => {
                if (!rawTrack || !rawTrack.title) return;
                const tKey = normalizeTrackKey(rawTrack);
                if (existingTrackKeys.has(tKey)) return;
                existingTrackKeys.add(tKey);

                const track = {
                  ...rawTrack,
                  coverUrl: ensureTrackCoverUrl(rawTrack, rawTrack.title, rawTrack.artist),
                  streamUrl: toProxyStreamUrl(rawTrack.streamUrl || "", rawTrack.title, rawTrack.artist, true)
                };
                const idx = this.homeGlobalTopTracks.length;
                this.homeGlobalTopTracks.push(track);
                this.extraDiscoveredSongs.push(track);

                const isLiked = state.isLiked(track);
                const safeTitle = String(track.title || "").replace(/"/g, "&quot;");
                const safeArtist = String(track.artist || "").replace(/"/g, "&quot;");
                const likeTip = isLiked ? "Remover das Músicas Curtidas" : "Curtir faixa";

                const row = document.createElement("div");
                row.className = `track-row ${state.currentTrack && (String(state.currentTrack.id) === String(track.id) || normalizeTrackKey(state.currentTrack) === tKey) ? "playing" : ""}`;
                row.setAttribute("data-home-top-idx", String(idx));
                row.setAttribute("data-track-id", String(track.id));
                row.setAttribute("data-track-key", tKey);
                row.innerHTML = `
                  <div class="track-num-col"><span>${idx + 1}</span></div>
                  <img class="track-row-cover" src="${track.coverUrl}" alt="${safeTitle}" referrerpolicy="no-referrer" onerror="window.handleImgError(this, '${String(track.title || "").replace(/'/g, "")}', '${String(track.artist || "").replace(/'/g, "")}')" />
                  <div class="track-info-col">
                    <div class="track-title">${track.title}</div>
                    <div class="track-artist">${track.artist}${track.albumTitle ? ` · ${track.albumTitle}` : ""}</div>
                  </div>
                  <div class="track-duration-col">${track.duration || "3:30"}</div>
                  <div class="track-actions-col">
                    <button class="track-icon-btn btn-add-queue-direct" data-quick-queue-btn data-home-queue-idx="${idx}" title="Adicionar à fila" aria-label="Adicionar à fila">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M4 6h16M4 12h10M4 18h10M18 15v6m3-3h-6"/></svg>
                    </button>
                    <button class="track-icon-btn ${isLiked ? "liked" : ""}" data-home-like-idx="${idx}" data-like-track-key="${tKey}" data-like-track-id="${track.id}" data-like-track-title="${safeTitle}" data-like-track-artist="${safeArtist}" data-tooltip="${likeTip}" title="${likeTip}" aria-label="${likeTip}">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="${isLiked ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
                    </button>
                    <button class="track-icon-btn" data-home-addpl-idx="${idx}" title="Adicionar à Playlist" aria-label="Adicionar à Playlist">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    </button>
                    <button class="track-icon-btn" data-home-share-idx="${idx}" title="Compartilhar" aria-label="Compartilhar">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                    </button>
                  </div>
                `;
                row.addEventListener("click", (e) => {
                  if (e.target.closest(".track-actions-col")) return;
                  state.queue = this.homeGlobalTopTracks.map(t => ({ ...t }));
                  state.queueIndex = idx;
                  engine.playTrack(track, track.albumObj || state.currentAlbum);
                  this.renderRightSidebarBodyOnly();
                });
                const likeBtn = row.querySelector("[data-home-like-idx]");
                if (likeBtn) {
                  likeBtn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    const nowLiked = state.toggleLike(track);
                    likeBtn.classList.remove("liked-pop");
                    void likeBtn.offsetWidth;
                    if (nowLiked) likeBtn.classList.add("liked-pop");
                    engine.updateLikeButtonUI();
                    this.syncAllLikeButtonsInDOM();
                  });
                }
                const addPlBtn = row.querySelector("[data-home-addpl-idx]");
                if (addPlBtn) {
                  addPlBtn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    this.openTrackOptionsModal(track, track.albumObj);
                  });
                }
                const shareBtn = row.querySelector("[data-home-share-idx]");
                if (shareBtn) {
                  shareBtn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    this.shareTrack(track, track.albumObj);
                  });
                }
                tracksTable.appendChild(row);
              });
            }

            if (statusEl) {
              statusEl.innerHTML = `<span>Role para baixo para descobrir ainda mais músicas e artistas</span>`;
            }
          } catch (_e) {
            if (statusEl) {
              statusEl.innerHTML = `<span>Role para carregar mais</span>`;
            }
          } finally {
            this.isFetchingDiscover = false;
          }
        }

        setupSpotifyContextMenu() {
          const menu = document.getElementById("spotify-context-menu");
          if (!menu) return;

          document.addEventListener("contextmenu", (e) => {
            const row = e.target.closest(".track-row, .album-card");
            if (!row) {
              this.closeContextMenu();
              return;
            }
            e.preventDefault();
            this.openContextMenu(e, row);
          });

          document.addEventListener("click", (e) => {
            if (!e.target.closest("#spotify-context-menu")) {
              this.closeContextMenu();
            }
            const qBtn = e.target.closest("[data-action-queue-idx], [data-quick-queue-btn], [data-alb-queue-idx], [data-search-queue-idx], [data-home-queue-idx], [data-home-algo-queue], [data-pl-queue-idx], [data-liked-queue-idx], [data-artist-queue-idx], [data-prof-queue]");
            if (qBtn) {
              e.preventDefault();
              e.stopPropagation();
              const row = qBtn.closest(".track-row");
              const track = this.findTrackFromElement(row);
              if (track) {
                engine.addToQueueEnd(track);
                qBtn.classList.remove("liked-pop");
                void qBtn.offsetWidth;
                qBtn.classList.add("liked-pop");
                setTimeout(() => qBtn.classList.remove("liked-pop"), 400);
              }
            }
          });

          document.addEventListener("keydown", (e) => {
            if (e.key === "Escape") this.closeContextMenu();
          });

          window.addEventListener("scroll", () => this.closeContextMenu(), true);

          document.getElementById("ctx-item-add-queue")?.addEventListener("click", () => {
            if (this.contextMenuTrack) {
              engine.addToQueueEnd(this.contextMenuTrack);
            } else if (this.contextMenuAlbum?.tracks?.length) {
              this.contextMenuAlbum.tracks.forEach(t => engine.addToQueueEnd(t));
              showToast(`Álbum "${this.contextMenuAlbum.title}" enfileirado`);
            }
            this.closeContextMenu();
          });

          document.getElementById("ctx-item-play-next")?.addEventListener("click", () => {
            if (this.contextMenuTrack) {
              engine.addToQueueNext(this.contextMenuTrack);
            }
            this.closeContextMenu();
          });

          document.getElementById("ctx-item-toggle-like")?.addEventListener("click", () => {
            if (this.contextMenuTrack) {
              state.toggleLike(this.contextMenuTrack);
              engine.updateLikeButtonUI();
              this.syncAllLikeButtonsInDOM();
            }
            this.closeContextMenu();
          });

          document.getElementById("ctx-item-add-playlist")?.addEventListener("click", () => {
            if (this.contextMenuTrack) {
              this.openTrackOptionsModal(this.contextMenuTrack, this.contextMenuAlbum);
            }
            this.closeContextMenu();
          });

          document.getElementById("ctx-item-go-artist")?.addEventListener("click", () => {
            const art = this.contextMenuTrack?.artist || this.contextMenuAlbum?.artist;
            if (art) {
              this.navigateTo("artist", true, { artistName: art });
            }
            this.closeContextMenu();
          });

          document.getElementById("ctx-item-share")?.addEventListener("click", () => {
            if (this.contextMenuTrack) {
              this.shareTrack(this.contextMenuTrack, this.contextMenuAlbum);
            }
            this.closeContextMenu();
          });
        }

        openContextMenu(e, targetEl) {
          const menu = document.getElementById("spotify-context-menu");
          if (!menu) return;

          const track = this.findTrackFromElement(targetEl);
          this.contextMenuTrack = track;
          this.contextMenuAlbum = state.currentAlbum;

          const isLiked = track ? state.isLiked(track) : false;
          const likeIcon = document.getElementById("ctx-like-icon");
          const likeText = document.getElementById("ctx-like-text");
          if (likeIcon) likeIcon.setAttribute("fill", isLiked ? "currentColor" : "none");
          if (likeText) likeText.textContent = isLiked ? "Remover dos Curtidos" : "Curtir faixa";

          menu.classList.add("active");
          const menuW = 215;
          const menuH = 260;
          let left = e.clientX;
          let top = e.clientY;
          if (left + menuW > window.innerWidth) left = window.innerWidth - menuW - 10;
          if (top + menuH > window.innerHeight) top = window.innerHeight - menuH - 10;
          menu.style.left = `${Math.max(10, left)}px`;
          menu.style.top = `${Math.max(10, top)}px`;
        }

        closeContextMenu() {
          const menu = document.getElementById("spotify-context-menu");
          if (menu) menu.classList.remove("active");
          this.contextMenuTrack = null;
        }

        findTrackFromElement(el) {
          if (!el) return null;
          const row = el.closest(".track-row, .album-card");
          if (!row) return null;

          const tId = row.dataset.trackId;
          const tKey = row.dataset.trackKey;

          if (tId || tKey) {
            if (state.currentTrack && (String(state.currentTrack.id) === String(tId) || normalizeTrackKey(state.currentTrack) === tKey)) {
              return state.currentTrack;
            }
            const inQ = state.queue.find(t => t && (String(t.id) === String(tId) || normalizeTrackKey(t) === tKey));
            if (inQ) return inQ;
            if (state.currentAlbum?.tracks) {
              const inAlb = state.currentAlbum.tracks.find(t => t && (String(t.id) === String(tId) || normalizeTrackKey(t) === tKey));
              if (inAlb) return inAlb;
            }
            if (this.currentArtistSongs) {
              const inArt = this.currentArtistSongs.find(t => t && (String(t.id) === String(tId) || normalizeTrackKey(t) === tKey));
              if (inArt) return inArt;
            }
            if (this.lastSearchSongs) {
              const inSr = this.lastSearchSongs.find(t => t && (String(t.id) === String(tId) || normalizeTrackKey(t) === tKey));
              if (inSr) return inSr;
            }
            if (this.homeGlobalTopTracks) {
              const inHomeTop = this.homeGlobalTopTracks.find(t => t && (String(t.id) === String(tId) || normalizeTrackKey(t) === tKey));
              if (inHomeTop) return inHomeTop;
            }
            if (this.homeAlgoTracks) {
              const inHomeAlgo = this.homeAlgoTracks.find(t => t && (String(t.id) === String(tId) || normalizeTrackKey(t) === tKey));
              if (inHomeAlgo) return inHomeAlgo;
            }
            if (this.profileLikedTracks) {
              const inProf = this.profileLikedTracks.find(t => t && (String(t.id) === String(tId) || normalizeTrackKey(t) === tKey));
              if (inProf) return inProf;
            }
            if (state.user && Array.isArray(state.user.likedTracks)) {
              const inLiked = state.user.likedTracks.find(t => t && (String(t.id) === String(tId) || normalizeTrackKey(t) === tKey));
              if (inLiked) return inLiked;
            }
            for (const pl of state.playlists || []) {
              const inPl = (pl.tracks || []).find(t => t && (String(t.id) === String(tId) || normalizeTrackKey(t) === tKey));
              if (inPl) return inPl;
            }
            for (const alb of state.albums || []) {
              const inA = (alb.tracks || []).find(t => t && (String(t.id) === String(tId) || normalizeTrackKey(t) === tKey));
              if (inA) return inA;
            }
          }

          const titleEl = row.querySelector(".track-title") || row.querySelector(".album-card-title") || row.querySelector(".quick-card-title");
          const artistEl = row.querySelector(".track-artist") || row.querySelector(".album-card-sub") || row.querySelector(".quick-card-artist");
          const imgEl = row.querySelector("img");
          const durEl = row.querySelector(".track-duration-col");
          if (titleEl) {
            const title = titleEl.textContent.trim();
            const rawArtist = artistEl ? artistEl.textContent.split("·")[0].trim() : "";
            const cleanArtist = rawArtist || "Miado Artist";
            const cover = imgEl?.src || "";
            return {
              id: tId || `tr_${normalizeSongTitleKey(title)}`,
              title,
              artist: cleanArtist,
              albumTitle: (artistEl ? artistEl.textContent.split("·")[1]?.trim() : "") || "Single",
              coverUrl: cover,
              duration: durEl ? durEl.textContent.trim() : "3:30",
              streamUrl: buildFullStreamProxyUrl(title, cleanArtist)
            };
          }
          return null;
        }

        closeAllModals() {
          document.querySelectorAll(".modal-overlay.active").forEach(m => m.classList.remove("active"));
          const rightSidebar = document.getElementById("sidebar-right");
          if (rightSidebar) {
            rightSidebar.classList.remove("mobile-drawer-open");
          }
        }

        syncHeaderUserUI() {
          const nameEl = document.getElementById("top-user-name");
          if (nameEl) nameEl.textContent = state.user.name || "Visitante";
          const handleEl = document.getElementById("top-user-handle");
          if (handleEl) handleEl.textContent = state.user.username || "@novo_usuario";
          const avatarEl = document.getElementById("top-user-avatar");
          if (avatarEl) {
            avatarEl.onerror = () => window.handleCatAvatarError(avatarEl);
            avatarEl.src = state.user.avatarUrl || CAT_AVATAR_PRESETS[0].url;
          }
          const authBtn = document.getElementById("btn-open-auth-modal");
          const labelText = state.user.email ? "Minha Conta" : "Entrar / Criar Conta";
          ["top-auth-label", "top-auth-btn-label"].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = labelText;
          });
          if (authBtn) {
            authBtn.style.display = state.user.email ? "none" : "inline-flex";
          }
        }

        syncAllLikeButtonsInDOM() {
          document.querySelectorAll(".track-icon-btn[data-like-track-key]").forEach(btn => {
            const trId = btn.getAttribute("data-like-track-id") || "";
            const trTitle = btn.getAttribute("data-like-track-title") || "";
            const trArtist = btn.getAttribute("data-like-track-artist") || "";
            const liked = state.isLiked({ id: trId, title: trTitle, artist: trArtist });
            const tip = liked
              ? "Remover das Músicas Curtidas"
              : "Curtir faixa — salvar em Músicas Curtidas";
            btn.classList.toggle("liked", liked);
            btn.setAttribute("data-tooltip", tip);
            btn.setAttribute("title", tip);
            btn.setAttribute("aria-label", tip);
            btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="${liked ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`;
          });
        }

        shareTrack(track, albumContext = state.currentAlbum) {
          if (!track) return;
          const cleanTrack = {
            ...track,
            coverUrl: ensureTrackCoverUrl(track, track.title, track.artist, albumContext && albumContext.coverUrl)
          };
          state.addUserActivityPost(cleanTrack, "compartilhou no Feed Miau");
          this.renderRightSidebarBodyOnly();
          const shareText = `Ouvindo "${cleanTrack.title}" de ${cleanTrack.artist} no Miado Lossless! ${window.location.origin}`;
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(shareText).catch(() => {});
          }
          showToast(`"${cleanTrack.title}" compartilhada no Feed Miau & link copiado!`);
        }

        renderFullscreenUpNext() {
          const listEl = document.getElementById("fs-up-next-list");
          if (!listEl) return;

          const fsShuffle = document.getElementById("fs-btn-shuffle");
          if (fsShuffle) fsShuffle.classList.toggle("active", Boolean(state.isShuffle));
          const fsRepeat = document.getElementById("fs-btn-repeat");
          if (fsRepeat) fsRepeat.classList.toggle("active", Boolean(state.isRepeat));

          const queue = Array.isArray(state.queue) && state.queue.length > 0
            ? state.queue
            : (state.currentAlbum && Array.isArray(state.currentAlbum.tracks) ? state.currentAlbum.tracks : INITIAL_ALBUMS[0].tracks);

          const upcoming = [];
          const startIdx = Math.max(0, state.queueIndex || 0);
          for (let i = 0; i < Math.min(queue.length, 6); i++) {
            const qIdx = (startIdx + i) % queue.length;
            if (queue[qIdx]) {
              upcoming.push({ track: queue[qIdx], qIdx, isCurrent: i === 0 });
            }
          }

          listEl.innerHTML = upcoming.map(({ track, qIdx, isCurrent }) => {
            const cov = ensureTrackCoverUrl(track, track.title, track.artist);
            return `
              <div class="fs-up-next-item ${isCurrent ? 'playing' : ''}" data-fs-queue-idx="${qIdx}">
                <img src="${cov}" alt="${track.title}" referrerpolicy="no-referrer" onerror="window.handleImgError(this, '${String(track.title || "").replace(/'/g, "")}', '${String(track.artist || "").replace(/'/g, "")}')" />
                <div style="flex:1; min-width:0;">
                  <div style="font-size:0.8rem; font-weight:700; color:${isCurrent ? 'var(--accent-hover)' : '#ffffff'};" class="text-truncate">
                    ${isCurrent ? "Tocando · " : ""}${track.title}
                  </div>
                  <div style="font-size:0.71rem; color:var(--text-secondary);" class="text-truncate">${track.artist}</div>
                </div>
                <div style="font-size:0.72rem; color:var(--text-muted); font-variant-numeric:tabular-nums;">${track.duration || "3:30"}</div>
              </div>
            `;
          }).join("");

          listEl.querySelectorAll("[data-fs-queue-idx]").forEach(row => {
            row.addEventListener("click", () => {
              const qIdx = parseInt(row.dataset.fsQueueIdx);
              const targetTrack = queue[qIdx];
              if (targetTrack) {
                state.queueIndex = qIdx;
                engine.playTrack(targetTrack, state.currentAlbum);
                this.renderRightSidebarBodyOnly();
                this.renderFullscreenUpNext();
              }
            });
          });
        }

        highlightPlayingTrackInDOM() {
          const currentId = state.currentTrack ? String(state.currentTrack.id) : "";
          const currentKey = state.currentTrack ? normalizeTrackKey(state.currentTrack) : "";
          this.scrollContainer.querySelectorAll(".track-row[data-track-id]").forEach(row => {
            const matchId = currentId && row.dataset.trackId === currentId;
            const matchKey = currentKey && row.dataset.trackKey && row.dataset.trackKey === currentKey;
            row.classList.toggle("playing", Boolean(matchId || matchKey));
          });
        }

        openPlaylistCreatorModal(isCollaborative = true) {
          this.closeAllModals();
          this.creatingCollaborativeMode = isCollaborative;
          const modal = document.getElementById("modal-collab-playlist");
          if (!modal) return;
          const titleEl = modal.querySelector(".modal-title");
          if (titleEl) {
            titleEl.textContent = isCollaborative
              ? "Criar ou Importar Playlist Colaborativa"
              : "Criar Nova Playlist no Miado";
          }
          const submitBtn = document.getElementById("btn-create-collab-submit");
          if (submitBtn) {
            submitBtn.textContent = isCollaborative ? "Criar Conjunta" : "Criar Playlist";
          }
          modal.classList.add("active");
          setTimeout(() => {
            const input = document.getElementById("input-new-collab-name");
            if (input) input.focus();
          }, 50);
        }

        resolveBottomTabViewName(rawView = "") {
          const normalized = String(rawView || "").trim().toLowerCase();
          const viewMap = {
            home: "home",
            inicio: "home",
            "início": "home",
            search: "search",
            buscar: "search",
            busca: "search",
            library: "library",
            biblioteca: "library",
            social: "social",
            miau: "social",
            feed: "social",
            profile: "profile",
            perfil: "profile",
            liked: "liked"
          };
          return viewMap[normalized] || normalized || "home";
        }

        handleBottomTabSwitch(rawView, sourceEvent = null) {
          if (sourceEvent && typeof sourceEvent.preventDefault === "function") {
            sourceEvent.preventDefault();
          }
          const view = this.resolveBottomTabViewName(rawView);
          if (!view) return;

          const now = Date.now();
          if (this._lastNavSwitchTs && now - this._lastNavSwitchTs < 80 && this._lastNavSwitchView === view) {
            return;
          }
          this._lastNavSwitchTs = now;
          this._lastNavSwitchView = view;

          this.closeAllModals();
          const rightSidebar = document.getElementById("sidebar-right");
          if (rightSidebar) {
            rightSidebar.classList.remove("mobile-drawer-open");
            if (window.innerWidth <= 1080) {
              rightSidebar.classList.add("collapsed");
            }
          }

          this.setActiveNav(view);
          this.navigateTo(view, true);
        }

        setupNavigation() {
          const handleNavClick = (view, ev = null) => {
            this.handleBottomTabSwitch(view, ev);
          };

          // Ponte global direta para atributos onclick="window.miadoSwitchTab('...')" nos botões .bottom-tab-item
          window.miadoSwitchTab = (view, ev = null) => {
            this.handleBottomTabSwitch(view, ev);
          };

          document.querySelectorAll(".nav-btn").forEach(btn => {
            btn.addEventListener("click", (e) => {
              e.preventDefault();
              e.stopPropagation();
              const target = e.currentTarget;
              handleNavClick(target.dataset.view || target.getAttribute("data-view"), e);
            });
          });

          // Delegação de eventos robusta e sincronização de onclick para .bottom-tab-item no mobile e desktop
          const bottomTabsConfig = [
            { id: "bottom-tab-home", view: "home" },
            { id: "bottom-tab-search", view: "search" },
            { id: "bottom-tab-library", view: "library" },
            { id: "bottom-tab-social", view: "social" },
            { id: "bottom-tab-profile", view: "profile" }
          ];

          bottomTabsConfig.forEach(({ id, view }) => {
            const btn = document.getElementById(id);
            if (!btn) return;
            btn.setAttribute("data-view", view);
            btn.onclick = (e) => {
              this.handleBottomTabSwitch(view, e);
            };
          });

          document.querySelectorAll(".bottom-tab-item").forEach(btn => {
            const viewAttr = btn.dataset.view || btn.getAttribute("data-view");
            if (viewAttr) {
              btn.onclick = (e) => {
                this.handleBottomTabSwitch(viewAttr, e);
              };
            }
          });

          const bottomNavContainer = document.getElementById("mobile-bottom-nav") || document.querySelector(".mobile-bottom-nav");
          if (bottomNavContainer && !bottomNavContainer.dataset.delegatedBound) {
            bottomNavContainer.dataset.delegatedBound = "true";
            const onDelegatedBottomNavEvent = (e) => {
              const tabBtn = e.target && e.target.closest ? e.target.closest(".bottom-tab-item") : null;
              if (!tabBtn) return;
              const targetView = tabBtn.dataset.view || tabBtn.getAttribute("data-view");
              if (targetView) {
                this.handleBottomTabSwitch(targetView, e);
              }
            };
            bottomNavContainer.addEventListener("click", onDelegatedBottomNavEvent);
            bottomNavContainer.addEventListener("touchend", (e) => {
              const tabBtn = e.target && e.target.closest ? e.target.closest(".bottom-tab-item") : null;
              if (!tabBtn) return;
              const targetView = tabBtn.dataset.view || tabBtn.getAttribute("data-view");
              if (targetView) {
                this.handleBottomTabSwitch(targetView, e);
              }
            }, { passive: false });
          }

          const btnNavSearch = document.getElementById("nav-btn-search");
          if (btnNavSearch) {
            btnNavSearch.addEventListener("click", (e) => {
              e.preventDefault();
              handleNavClick("search", e);
            });
          }

          document.getElementById("btn-history-back").addEventListener("click", () => this.historyBack());
          document.getElementById("btn-history-forward").addEventListener("click", () => this.historyForward());
          document.getElementById("btn-brand-home").addEventListener("click", () => {
            this.closeAllModals();
            this.setActiveNav("home");
            this.navigateTo("home", true);
          });

          const searchInput = document.getElementById("global-search-input");
          const btnClearGlobal = document.getElementById("btn-clear-global-search");
          const syncGlobalClearBtn = () => {
            if (!btnClearGlobal || !searchInput) return;
            btnClearGlobal.classList.toggle("visible", searchInput.value.length > 0);
          };
          syncGlobalClearBtn();

          if (btnClearGlobal) {
            btnClearGlobal.addEventListener("click", (e) => {
              e.preventDefault();
              e.stopPropagation();
              searchInput.value = "";
              syncGlobalClearBtn();
              const viewInp = document.getElementById("view-search-input");
              const viewClear = document.getElementById("btn-clear-view-search");
              if (viewInp) viewInp.value = "";
              if (viewClear) viewClear.classList.remove("visible");
              searchInput.focus();
              if (state.currentView === "search") {
                this.renderSearchView("");
              }
            });
          }

          let debounceTimer = null;
          searchInput.addEventListener("focus", () => {
            syncGlobalClearBtn();
            if (state.currentView !== "search") {
              this.closeAllModals();
              this.setActiveNav("search");
              this.navigateTo("search", true, { query: searchInput.value.trim() });
            }
          });
          searchInput.addEventListener("input", () => {
            syncGlobalClearBtn();
            clearTimeout(debounceTimer);
            const q = searchInput.value.trim();
            if (q.length >= 2) {
              debounceTimer = setTimeout(() => {
                this.closeAllModals();
                this.setActiveNav("search");
                this.navigateTo("search", true, { query: q });
              }, 340);
            }
          });
          searchInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
              clearTimeout(debounceTimer);
              const q = searchInput.value.trim();
              this.closeAllModals();
              this.setActiveNav("search");
              this.navigateTo("search", true, { query: q });
            }
          });

          const btnLiked = document.getElementById("btn-nav-liked");
          if (btnLiked) {
            btnLiked.addEventListener("click", (e) => {
              e.preventDefault();
              this.closeAllModals();
              this.setActiveNav("liked");
              this.navigateTo("liked", true);
            });
          }

          const btnCreatePl = document.getElementById("btn-create-playlist");
          if (btnCreatePl) {
            btnCreatePl.addEventListener("click", (e) => {
              e.preventDefault();
              this.openPlaylistCreatorModal(false);
            });
          }

          const btnOpenCollab = document.getElementById("btn-open-collab-modal");
          if (btnOpenCollab) {
            btnOpenCollab.addEventListener("click", (e) => {
              e.preventDefault();
              this.openPlaylistCreatorModal(true);
            });
          }
        }

        setActiveNav(view, activePlaylistId = null) {
          const resolvedView = this.resolveBottomTabViewName(view);
          document.querySelectorAll(".nav-btn").forEach(b => {
            const isMatch = (b.dataset.view || b.getAttribute("data-view")) === resolvedView;
            b.classList.toggle("active", isMatch);
            b.setAttribute("aria-current", isMatch ? "page" : "false");
          });
          document.querySelectorAll(".bottom-tab-item").forEach(b => {
            const tabView = b.dataset.view || b.getAttribute("data-view");
            const isMatch = tabView === resolvedView || (resolvedView === "liked" && tabView === "library");
            b.classList.toggle("active", isMatch);
            b.setAttribute("aria-selected", isMatch ? "true" : "false");
            b.setAttribute("aria-current", isMatch ? "page" : "false");
          });
          const btnLiked = document.getElementById("btn-nav-liked");
          if (btnLiked) {
            btnLiked.classList.toggle("active", resolvedView === "liked");
          }
          document.querySelectorAll(".playlist-list-item[data-sidebar-pl-id]").forEach(item => {
            item.classList.toggle("active", resolvedView === "playlist" && item.dataset.sidebarPlId === activePlaylistId);
          });
        }

        setupPlayerControls() {
          engine.updateVolumeUI();

          ["player-btn-play", "mobile-btn-play", "fs-btn-play"].forEach(id => {
            const btn = document.getElementById(id);
            if (btn) {
              btn.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                engine.togglePlay();
              });
            }
          });

          ["player-btn-next", "mobile-btn-next", "fs-btn-next"].forEach(id => {
            const btn = document.getElementById(id);
            if (btn) {
              btn.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                engine.nextTrack();
              });
            }
          });

          ["player-btn-prev", "fs-btn-prev"].forEach(id => {
            const btn = document.getElementById(id);
            if (btn) {
              btn.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                engine.prevTrack();
              });
            }
          });

          ["player-btn-shuffle", "fs-btn-shuffle"].forEach(id => {
            const btnShuffle = document.getElementById(id);
            if (btnShuffle) {
              btnShuffle.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                state.toggleShuffleMode();
              });
            }
          });

          ["player-btn-repeat", "fs-btn-repeat"].forEach(id => {
            const btnRepeat = document.getElementById(id);
            if (btnRepeat) {
              btnRepeat.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                state.isRepeat = !state.isRepeat;
                ["player-btn-repeat", "fs-btn-repeat"].forEach(rId => {
                  const el = document.getElementById(rId);
                  if (el) el.classList.toggle("active", state.isRepeat);
                });
                showToast(state.isRepeat ? "Repetir Música Ativado" : "Repetir Música Desativado");
              });
            }
          });

          ["player-btn-like", "mobile-btn-like", "fs-btn-like"].forEach(id => {
            const btnLike = document.getElementById(id);
            if (btnLike) {
              btnLike.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!state.currentTrack) return;
                const nowLiked = state.toggleLike(state.currentTrack);
                btnLike.classList.remove("liked-pop");
                void btnLike.offsetWidth;
                if (nowLiked) btnLike.classList.add("liked-pop");
                engine.updateLikeButtonUI();
                this.syncAllLikeButtonsInDOM();
                if (state.currentView === "liked") this.renderLikedTracksView();
                if (state.currentView === "profile") this.renderProfileView();
              });
            }
          });

          ["player-btn-add-playlist", "fs-btn-add-playlist", "fs-btn-more-options"].forEach(id => {
            const btnAdd = document.getElementById(id);
            if (btnAdd) {
              btnAdd.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!state.currentTrack) return;
                this.openTrackOptionsModal(state.currentTrack, state.currentAlbum);
              });
            }
          });

          const fsBtnShare = document.getElementById("fs-btn-share");
          if (fsBtnShare) {
            fsBtnShare.addEventListener("click", (e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!state.currentTrack) return;
              this.shareTrack(state.currentTrack, state.currentAlbum);
            });
          }

          document.getElementById("player-track-name").addEventListener("click", () => {
            if (state.currentAlbum) {
              this.navigateTo("album", true, { albumId: state.currentAlbum.id, customAlbum: state.currentAlbum });
            }
          });

          ["player-track-artist", "fs-track-artist"].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
              el.addEventListener("click", () => {
                if (state.currentTrack && state.currentTrack.artist) {
                  document.getElementById("modal-fullscreen-player").classList.remove("active");
                  this.navigateTo("artist", true, { artistName: state.currentTrack.artist });
                }
              });
            }
          });

          ["player-seek-track", "fs-seek-track"].forEach(trackId => {
            const seekTrack = document.getElementById(trackId);
            if (!seekTrack) return;
            let isSeeking = false;
            let pendingSeekRatio = 0;

            const updateVisualProgress = (clientX) => {
              const rect = seekTrack.getBoundingClientRect();
              if (!rect.width) return;
              pendingSeekRatio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
              const pctStr = `${pendingSeekRatio * 100}%`;
              const fillEl = document.getElementById("player-seek-fill");
              if (fillEl) fillEl.style.width = pctStr;
              const fsFillEl = document.getElementById("fs-seek-fill");
              if (fsFillEl) fsFillEl.style.width = pctStr;
              const mobFillEl = document.getElementById("mobile-seek-fill");
              if (mobFillEl) mobFillEl.style.width = pctStr;
              if (engine.audio.duration && !isNaN(engine.audio.duration)) {
                const curSec = Math.floor(pendingSeekRatio * engine.audio.duration);
                const curM = Math.floor(curSec / 60);
                const curS = curSec % 60;
                const fmt = `${curM}:${curS < 10 ? '0' : ''}${curS}`;
                const curEl = document.getElementById("player-current-time");
                if (curEl) curEl.textContent = fmt;
                const fsCurEl = document.getElementById("fs-current-time");
                if (fsCurEl) fsCurEl.textContent = fmt;
              }
            };

            const commitSeek = () => {
              if (!isSeeking) return;
              isSeeking = false;
              if (engine.audio.duration && !isNaN(engine.audio.duration)) {
                engine.audio.currentTime = pendingSeekRatio * engine.audio.duration;
              }
            };

            // Touch events dedicados para celular com prevenção de scroll vertical
            seekTrack.addEventListener("touchstart", (e) => {
              if (e.touches && e.touches[0]) {
                isSeeking = true;
                updateVisualProgress(e.touches[0].clientX);
              }
            }, { passive: true });

            seekTrack.addEventListener("touchmove", (e) => {
              if (!isSeeking) return;
              if (e.touches && e.touches[0]) {
                if (e.cancelable) e.preventDefault();
                updateVisualProgress(e.touches[0].clientX);
              }
            }, { passive: false });

            seekTrack.addEventListener("touchend", () => {
              commitSeek();
            }, { passive: true });

            seekTrack.addEventListener("touchcancel", () => {
              isSeeking = false;
            }, { passive: true });

            // Pointer / Mouse events para Desktop e dispositivos mistos
            seekTrack.addEventListener("pointerdown", (e) => {
              isSeeking = true;
              if (seekTrack.setPointerCapture) {
                try { seekTrack.setPointerCapture(e.pointerId); } catch (err) {}
              }
              updateVisualProgress(e.clientX);
            });

            seekTrack.addEventListener("pointermove", (e) => {
              if (!isSeeking) return;
              updateVisualProgress(e.clientX);
            });

            seekTrack.addEventListener("pointerup", () => {
              commitSeek();
            });

            seekTrack.addEventListener("pointercancel", () => {
              isSeeking = false;
            });
          });

          // Controle de Volume e Mudo (Desktop Footer + Fullscreen Apple Music)
          ["player-btn-mute", "fs-btn-mute"].forEach(id => {
            const muteBtn = document.getElementById(id);
            if (muteBtn) {
              muteBtn.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                engine.toggleMute();
              });
            }
          });

          ["player-volume-slider", "fs-volume-slider"].forEach(sliderId => {
            const volSlider = document.getElementById(sliderId);
            if (!volSlider) return;
            let isDraggingVol = false;
            const applyVolumeFromClientX = (clientX) => {
              const rect = volSlider.getBoundingClientRect();
              if (!rect.width) return;
              const val = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
              engine.ensureAudioContext();
              engine.setVolume(val, false);
            };

            volSlider.addEventListener("pointerdown", (e) => {
              e.preventDefault();
              isDraggingVol = true;
              if (volSlider.setPointerCapture) {
                try { volSlider.setPointerCapture(e.pointerId); } catch (err) {}
              }
              applyVolumeFromClientX(e.clientX);
            });

            volSlider.addEventListener("pointermove", (e) => {
              if (!isDraggingVol) return;
              applyVolumeFromClientX(e.clientX);
            });

            volSlider.addEventListener("pointerup", (e) => {
              if (!isDraggingVol) return;
              isDraggingVol = false;
              applyVolumeFromClientX(e.clientX);
            });

            volSlider.addEventListener("wheel", (e) => {
              e.preventDefault();
              const step = e.deltaY < 0 ? 0.05 : -0.05;
              const baseVol = state.isMuted ? 0 : (state.volume ?? 0.85);
              engine.ensureAudioContext();
              engine.setVolume(baseVol + step, false);
            }, { passive: false });
          });

          const openSpotifyFullscreen = () => {
            this.renderFullscreenUpNext();
            document.getElementById("modal-fullscreen-player").classList.add("active");
            engine.startVisualizerLoop();
            setTimeout(() => {
              applySpotifyMarquee(document.getElementById("fs-track-title"));
            }, 100);
          };

          ["player-btn-fullscreen", "spectrum-open-fs", "player-thumb-btn", "mobile-track-trigger", "mobile-thumb-img"].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
              el.addEventListener("click", (e) => {
                e.stopPropagation();
                openSpotifyFullscreen();
              });
            }
          });

          document.getElementById("player-btn-toggle-queue").addEventListener("click", () => {
            const rightSidebar = document.getElementById("sidebar-right");
            const isMobile = window.innerWidth <= 1080;
            if (isMobile) {
              const isOpen = rightSidebar.classList.toggle("mobile-drawer-open");
              rightSidebar.classList.toggle("collapsed", !isOpen);
            } else {
              rightSidebar.classList.toggle("collapsed");
            }
            document.getElementById("app-container").classList.toggle("no-right-sidebar", rightSidebar.classList.contains("collapsed"));
            if (!rightSidebar.classList.contains("collapsed")) {
              this.activeRightTab = "queue";
              document.getElementById("tab-queue-list").classList.add("active");
              document.getElementById("tab-friends-activity").classList.remove("active");
              this.renderRightSidebarBodyOnly();
            }
          });
        }

        openProfileModal() {
          this.closeAllModals();
          this.setActiveNav("profile");
          this.navigateTo("profile", true);
        }

        openAuthModal(defaultMode = "login", step = 1) {
          const modal = document.getElementById("modal-auth");
          if (!modal) return;
          this.setAuthModalMode(defaultMode);
          this.renderOnboardingCatGrid();
          this.renderOnboardingArtistsGrid();
          this.setOnboardingStep(step);

          const statusBanner = document.getElementById("auth-logged-status-banner") || document.getElementById("auth-logged-banner");
          const emailSpan = document.getElementById("auth-logged-email");
          if (statusBanner && emailSpan) {
            if (state.user && state.user.email) {
              statusBanner.style.display = "flex";
              emailSpan.textContent = `${state.user.name} (${state.user.email})`;
            } else {
              statusBanner.style.display = "none";
            }
          }
          modal.classList.add("active");
        }

        setOnboardingStep(step = 1) {
          this.currentOnboardingStep = step;
          [1, 2, 3].forEach(idx => {
            const btn = document.getElementById(`onboard-step-btn-${idx}`);
            const pane = document.getElementById(`onboard-pane-${idx}`);
            if (btn) btn.classList.toggle("active", idx === step);
            if (pane) pane.style.display = idx === step ? "flex" : "none";
          });

          if (step === 2) {
            const nameIn = document.getElementById("onboard-input-name");
            const handleIn = document.getElementById("onboard-input-username");
            const bioIn = document.getElementById("onboard-input-bio");
            const previewImg = document.getElementById("onboard-avatar-preview");
            const cleanName = (state.user.name && state.user.name !== "Visitante") ? state.user.name : "";
            const cleanHandle = sanitizeCleanHandle(state.user.username, cleanName || "ouvinte");
            if (nameIn) nameIn.value = cleanName;
            if (handleIn) handleIn.value = cleanHandle;
            if (bioIn) bioIn.value = state.user.bio || "";
            if (previewImg) previewImg.src = state.user.avatarUrl || CAT_AVATAR_PRESETS[0].url;
            this.renderOnboardingCatGrid();
          }

          if (step === 3) {
            this.renderOnboardingArtistsGrid();
          }
        }

        renderOnboardingCatGrid() {
          const grid = document.getElementById("onboard-cat-grid");
          if (!grid) return;
          const currentAvatar = state.user.avatarUrl || CAT_AVATAR_PRESETS[0].url;
          grid.innerHTML = CAT_AVATAR_PRESETS.map((cat, idx) => `
            <div class="cat-avatar-option ${currentAvatar === cat.url ? 'selected' : ''}" data-onboard-cat-idx="${idx}">
              <img src="${cat.url}" alt="${cat.name}" referrerpolicy="no-referrer" onerror="window.handleCatAvatarError(this)" />
              <span>${cat.name}</span>
            </div>
          `).join("");

          grid.querySelectorAll("[data-onboard-cat-idx]").forEach(card => {
            card.addEventListener("click", () => {
              const preset = CAT_AVATAR_PRESETS[parseInt(card.dataset.onboardCatIdx)];
              if (!preset) return;
              state.user.avatarUrl = preset.url;
              state.user.avatarId = preset.id;
              const previewImg = document.getElementById("onboard-avatar-preview");
              if (previewImg) previewImg.src = preset.url;
              grid.querySelectorAll("[data-onboard-cat-idx]").forEach(c => c.classList.toggle("selected", c === card));
            });
          });
        }

        renderOnboardingArtistsGrid(customPool = null) {
          const grid = document.getElementById("onboard-artists-grid");
          if (!grid) return;
          if (!this.selectedFavoriteArtists) {
            this.selectedFavoriteArtists = new Set(
              Array.isArray(state.user.favoriteArtists) ? state.user.favoriteArtists : []
            );
          }
          if (!this.selectedFavoriteGenres) {
            this.selectedFavoriteGenres = new Set(
              Array.isArray(state.user.favoriteGenres) ? state.user.favoriteGenres : []
            );
          }

          const genresGrid = document.getElementById("onboard-genres-grid");
          if (genresGrid) {
            const availableGenres = ["Pop", "Rock", "Metal", "Indie", "R&B", "Hip-Hop", "Pop Brasil", "MPB", "Eletrônica", "Alternativo"];
            genresGrid.innerHTML = availableGenres.map(g => {
              const active = this.selectedFavoriteGenres.has(g);
              return `<button type="button" class="category-pill ${active ? 'active' : ''}" data-onboard-genre="${g}" style="height:28px; padding:0 12px; font-size:0.74rem;">${g}</button>`;
            }).join("");
            genresGrid.querySelectorAll("[data-onboard-genre]").forEach(btn => {
              btn.addEventListener("click", () => {
                const g = btn.dataset.onboardGenre;
                if (this.selectedFavoriteGenres.has(g)) {
                  this.selectedFavoriteGenres.delete(g);
                } else {
                  this.selectedFavoriteGenres.add(g);
                }
                this.renderOnboardingArtistsGrid(customPool);
              });
            });
          }

          // Seção de 3 Artistas Relacionados automáticos ao clicar em um artista
          const relatedWrap = document.getElementById("onboard-related-artists-wrap");
          if (relatedWrap) {
            if (this.lastClickedArtist) {
              const lowerTarget = this.lastClickedArtist.toLowerCase().trim();
              let similarNames = ARTIST_SIMILAR_MAP[lowerTarget] || [];
              if (!similarNames || similarNames.length === 0) {
                const foundInDir = POPULAR_ARTISTS_DIRECTORY.find(a => a.name.toLowerCase() === lowerTarget);
                const g = foundInDir ? foundInDir.genre : "Pop";
                similarNames = POPULAR_ARTISTS_DIRECTORY
                  .filter(a => a.genre === g && a.name.toLowerCase() !== lowerTarget)
                  .slice(0, 3)
                  .map(a => a.name);
              }
              if (similarNames.length > 0) {
                relatedWrap.innerHTML = `
                  <div style="background:rgba(168,85,247,0.08); border:1px solid rgba(168,85,247,0.25); border-radius:12px; padding:10px 12px; margin-bottom:12px;">
                    <div style="font-size:0.78rem; font-weight:600; color:#e9d5ff; margin-bottom:8px; display:flex; align-items:center; justify-content:space-between;">
                      <span>Artistas recomendados para quem curte <strong>${this.lastClickedArtist}</strong>:</span>
                    </div>
                    <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:8px;">
                      ${similarNames.map(simName => {
                        const isAdded = this.selectedFavoriteArtists.has(simName);
                        const simDir = POPULAR_ARTISTS_DIRECTORY.find(a => a.name.toLowerCase() === simName.toLowerCase());
                        const simCover = simDir ? simDir.coverUrl : `/api/artist-image?name=${encodeURIComponent(simName)}`;
                        return `
                          <div style="background:rgba(255,255,255,0.05); border:1px solid ${isAdded ? '#a855f7' : 'rgba(255,255,255,0.08)'}; border-radius:8px; padding:6px; text-align:center;">
                            <img src="${simCover}" alt="${simName}" referrerpolicy="no-referrer" style="width:38px; height:38px; border-radius:50%; object-fit:cover; margin:0 auto 4px auto; display:block;" onerror="window.handleImgError(this, '${simName.replace(/'/g, "")}', 'Artista')" />
                            <div style="font-size:0.7rem; font-weight:600; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${simName}</div>
                            <button type="button" class="btn-onboard-add-rel" data-add-rel-artist="${simName}" data-add-rel-cover="${simCover}" style="margin-top:4px; width:100%; font-size:0.64rem; padding:3px 0; border-radius:6px; background:${isAdded ? '#a855f7' : 'rgba(255,255,255,0.1)'}; color:#fff; border:none; cursor:pointer;">
                              ${isAdded ? '✓ Adicionado' : '+ Adicionar'}
                            </button>
                          </div>
                        `;
                      }).join("")}
                    </div>
                  </div>
                `;
                relatedWrap.querySelectorAll("[data-add-rel-artist]").forEach(btn => {
                  btn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    const name = btn.dataset.addRelArtist;
                    const cover = btn.dataset.addRelCover;
                    if (this.selectedFavoriteArtists.has(name)) {
                      this.selectedFavoriteArtists.delete(name);
                    } else {
                      this.selectedFavoriteArtists.add(name);
                      if (!this.onboardingCustomArtists) this.onboardingCustomArtists = [];
                      if (!this.onboardingCustomArtists.some(a => a.name.toLowerCase() === name.toLowerCase())) {
                        this.onboardingCustomArtists.unshift({ name, coverUrl: cover });
                      }
                    }
                    this.renderOnboardingArtistsGrid(customPool);
                  });
                });
              } else {
                relatedWrap.innerHTML = "";
              }
            } else {
              relatedWrap.innerHTML = "";
            }
          }

          const basePool = Array.isArray(customPool) && customPool.length > 0
            ? customPool
            : [
                ...(this.onboardingCustomArtists || []),
                ...POPULAR_ARTISTS_DIRECTORY,
                ...((state.charts && Array.isArray(state.charts.top100Artists) && state.charts.top100Artists.length > 0)
                  ? state.charts.top100Artists
                  : [])
              ];

          const seen = new Set();
          const displayArtists = [];
          const hasGenreFilter = this.selectedFavoriteGenres && this.selectedFavoriteGenres.size > 0;

          basePool.forEach(art => {
            if (!art || !art.name) return;
            const k = art.name.toLowerCase().trim();
            if (seen.has(k)) return;
            seen.add(k);

            // Filtragem por Gênero: se houver gêneros selecionados, inclui se bater com o gênero ou se já foi selecionado pelo usuário
            if (hasGenreFilter) {
              const artGenre = art.genre || (POPULAR_ARTISTS_DIRECTORY.find(p => p.name.toLowerCase() === k)?.genre) || "";
              const matchesGenre = this.selectedFavoriteGenres.has(artGenre) ||
                (this.selectedFavoriteGenres.has("Alternativo") && (artGenre === "Indie" || artGenre === "Rock")) ||
                (this.selectedFavoriteGenres.has("Indie") && artGenre === "Alternativo");
              const isAlreadySelected = this.selectedFavoriteArtists.has(art.name);
              if (!matchesGenre && !isAlreadySelected) return;
            }

            displayArtists.push({
              name: art.name,
              genre: art.genre || (POPULAR_ARTISTS_DIRECTORY.find(p => p.name.toLowerCase() === k)?.genre) || "Artista",
              coverUrl: art.coverUrl || `/api/artist-image?name=${encodeURIComponent(art.name)}`
            });
          });

          grid.innerHTML = displayArtists.map(art => {
            const isSel = this.selectedFavoriteArtists.has(art.name);
            return `
              <div class="spotify-artist-pick-card ${isSel ? 'selected' : ''}" data-pick-artist="${art.name}" data-pick-cover="${art.coverUrl}">
                <div class="pick-check">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                <img src="${art.coverUrl}" alt="${art.name}" referrerpolicy="no-referrer" onerror="window.handleImgError(this, '${art.name.replace(/'/g, "")}', 'Artista')" />
                <div class="artist-name">${art.name}</div>
                <div class="artist-genre">${art.genre || "Artista"}</div>
              </div>
            `;
          }).join("");

          ["onboard-selected-artists-count", "onboard-artists-count"].forEach(id => {
            const countEl = document.getElementById(id);
            if (countEl) {
              countEl.textContent = `${this.selectedFavoriteArtists.size} selecionado(s)`;
            }
          });

          grid.querySelectorAll("[data-pick-artist]").forEach(card => {
            card.addEventListener("click", () => {
              const name = card.dataset.pickArtist;
              const cover = card.dataset.pickCover;
              this.lastClickedArtist = name;
              if (this.selectedFavoriteArtists.has(name)) {
                this.selectedFavoriteArtists.delete(name);
              } else {
                this.selectedFavoriteArtists.add(name);
                if (!this.onboardingCustomArtists) this.onboardingCustomArtists = [];
                if (!this.onboardingCustomArtists.some(a => a.name.toLowerCase() === name.toLowerCase())) {
                  this.onboardingCustomArtists.unshift({ name, coverUrl: cover });
                }
              }
              const prevScroll = grid.scrollTop;
              this.renderOnboardingArtistsGrid(customPool);
              grid.scrollTop = prevScroll;
            });
          });
        }

        setAuthModalMode(mode = "login") {
          this.authModalMode = mode;
          const tabLogin = document.getElementById("auth-tab-login");
          const tabReg = document.getElementById("auth-tab-register");
          const regFields = document.getElementById("auth-register-extra-fields") || document.getElementById("auth-register-extra");
          const submitBtn = document.getElementById("btn-auth-submit");
          const feedbackEl = document.getElementById("auth-feedback-msg");
          if (feedbackEl) feedbackEl.style.display = "none";
          if (tabLogin) tabLogin.classList.toggle("active", mode === "login");
          if (tabReg) tabReg.classList.toggle("active", mode === "register");
          if (regFields) regFields.style.display = mode === "register" ? "grid" : "none";
          if (submitBtn) {
            submitBtn.textContent = mode === "register"
              ? "Criar Conta & Personalizar Perfil →"
              : "Entrar na Conta";
          }
        }

        renderProfileModalTabsContent() {}

        renderCatAvatarPickerGrid() {}

        setupModals() {
          document.querySelectorAll(".close-modal-btn").forEach(btn => {
            btn.addEventListener("click", () => {
              const overlay = btn.closest(".modal-overlay");
              if (overlay) {
                overlay.classList.remove("active");
                if (overlay.id === "modal-auth") {
                  this.enforceWelcomeScreenGate();
                }
              }
            });
          });

          document.querySelectorAll(".modal-overlay").forEach(overlay => {
            overlay.addEventListener("click", (e) => {
              if (e.target === overlay) {
                if (overlay.id === "modal-fullscreen-player" && window.innerWidth <= 900) {
                  return;
                }
                overlay.classList.remove("active");
                if (overlay.id === "modal-auth") {
                  this.enforceWelcomeScreenGate();
                }
              }
            });
          });

          document.getElementById("btn-user-profile").addEventListener("click", () => {
            this.closeAllModals();
            this.setActiveNav("profile");
            this.navigateTo("profile", true);
          });

          const btnOpenAuth = document.getElementById("btn-open-auth-modal");
          if (btnOpenAuth) {
            btnOpenAuth.addEventListener("click", () => {
              this.openAuthModal(state.user && state.user.email ? "login" : "register", 1);
            });
          }

          // Formatação automática em tempo real do @username ao criar conta e editar perfil
          const authNameInput = document.getElementById("auth-input-name");
          const authHandleInput = document.getElementById("auth-input-handle");
          const onboardNameInput = document.getElementById("onboard-input-name");
          const onboardHandleInput = document.getElementById("onboard-input-username");

          if (authNameInput && authHandleInput) {
            authNameInput.addEventListener("input", () => {
              if (!authHandleInput.dataset.userEdited) {
                const nameVal = authNameInput.value.trim();
                authHandleInput.value = nameVal ? sanitizeCleanHandle(nameVal, nameVal) : "";
              }
            });
            authHandleInput.addEventListener("input", () => {
              authHandleInput.dataset.userEdited = authHandleInput.value.trim() ? "1" : "";
              const raw = authHandleInput.value;
              if (raw) {
                authHandleInput.value = sanitizeCleanHandle(raw, authNameInput.value);
              }
            });
          }

          if (onboardHandleInput) {
            onboardHandleInput.addEventListener("blur", () => {
              onboardHandleInput.value = sanitizeCleanHandle(
                onboardHandleInput.value,
                onboardNameInput ? onboardNameInput.value : state.user.name
              );
            });
          }

          // Eventos da Tela de Boas-Vindas em Tela Cheia (#miado-welcome-screen)
          const btnWelcomeRegister = document.getElementById("btn-welcome-register");
          const btnWelcomeLogin = document.getElementById("btn-welcome-login");
          const btnWelcomeGuest = document.getElementById("btn-welcome-guest");

          if (btnWelcomeRegister) {
            btnWelcomeRegister.addEventListener("click", () => {
              this.dismissWelcomeScreenAnimated(() => {
                if (authNameInput) authNameInput.value = "";
                if (authHandleInput) {
                  authHandleInput.value = "";
                  delete authHandleInput.dataset.userEdited;
                }
                this.openAuthModal("register", 1);
              });
            });
          }
          if (btnWelcomeLogin) {
            btnWelcomeLogin.addEventListener("click", () => {
              this.dismissWelcomeScreenAnimated(() => {
                this.openAuthModal("login", 1);
              });
            });
          }
          if (btnWelcomeGuest) {
            btnWelcomeGuest.addEventListener("click", () => {
              window._miadoGuestSessionActive = true;
              state.user.name = "Visitante";
              state.user.username = "@visitante";
              state.user.email = "";
              this.syncHeaderUserUI();
              this.dismissWelcomeScreenAnimated(() => {
                if (state.currentView === "home") this.renderHomeView();
              });
            });
          }

          [1, 2, 3].forEach(stepIdx => {
            const stepBtn = document.getElementById(`onboard-step-btn-${stepIdx}`);
            if (stepBtn) {
              stepBtn.addEventListener("click", () => {
                if (stepIdx > 1 && !state.user.email && !window._miadoGuestSessionActive) {
                  showToast("Crie sua conta ou entre primeiro na Etapa 1.");
                  return;
                }
                this.setOnboardingStep(stepIdx);
              });
            }
          });

          const tabLogin = document.getElementById("auth-tab-login");
          const tabRegister = document.getElementById("auth-tab-register");
          if (tabLogin) tabLogin.addEventListener("click", () => this.setAuthModalMode("login"));
          if (tabRegister) tabRegister.addEventListener("click", () => this.setAuthModalMode("register"));

          const submitAuthAction = async () => {
            const mode = this.authModalMode || "login";
            const emailInput = document.getElementById("auth-input-email");
            const passInput = document.getElementById("auth-input-password");
            const nameInput = document.getElementById("auth-input-name");
            const handleInput = document.getElementById("auth-input-handle") || document.getElementById("auth-input-username");
            const feedbackEl = document.getElementById("auth-feedback-msg");

            const email = (emailInput ? emailInput.value : "").trim().toLowerCase();
            const password = passInput ? passInput.value : "";
            const rawName = (nameInput ? nameInput.value : "").trim();
            const rawUsername = (handleInput ? handleInput.value : "").trim();

            const showAuthError = (msg) => {
              if (!feedbackEl) return;
              feedbackEl.style.display = "block";
              feedbackEl.style.backgroundColor = "rgba(239, 68, 68, 0.14)";
              feedbackEl.style.border = "1px solid rgba(239, 68, 68, 0.4)";
              feedbackEl.style.color = "#fca5a5";
              feedbackEl.textContent = msg;
            };

            if (mode === "register" && !rawName) {
              showAuthError("Informe seu nome para criar a conta.");
              return;
            }
            if (!email || !email.includes("@")) {
              showAuthError("Digite um endereço de e-mail válido.");
              return;
            }
            if (!password || password.length < 4) {
              showAuthError("A senha deve ter pelo menos 4 caracteres.");
              return;
            }

            const cleanName = rawName || (state.user.name !== "Visitante" ? state.user.name : email.split("@")[0]);
            const cleanUsername = sanitizeCleanHandle(rawUsername, cleanName);

            const endpoint = mode === "register" ? "/api/auth/register" : "/api/auth/login";
            try {
              const res = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  email,
                  password,
                  name: cleanName,
                  username: cleanUsername,
                  handle: cleanUsername
                })
              });
              const data = await res.json();
              if (!res.ok || !data.ok) {
                showAuthError(data.error || "Não foi possível autenticar sua conta.");
                return;
              }
              localStorage.setItem("miado_active_session_v1", "true");
              state.applyAccountPayload(data);

              if (mode === "register") {
                state.user.name = cleanName;
                state.user.username = cleanUsername;
                state.user.email = email;
                state.playlists = [];
                localStorage.setItem("miado_playlists_v5", JSON.stringify([]));
                state.saveUser();
                this.syncHeaderUserUI();
                this.renderSidebarPlaylists();
                showToast(`Conta criada como ${cleanUsername}! Escolha sua foto e artistas.`);
                this.setOnboardingStep(2);
              } else {
                const welcomeEl = document.getElementById("miado-welcome-screen");
                if (welcomeEl) welcomeEl.classList.remove("active", "closing");
                document.getElementById("modal-auth")?.classList.remove("active");
                this.syncHeaderUserUI();
                this.renderSidebarPlaylists();
                if (state.currentView === "home") this.renderHomeView();
                showToast(`Bem-vindo de volta, ${state.user.name} (${state.user.username})!`);
              }
            } catch (err) {
              showAuthError("Erro de conexão ao acessar o servidor.");
            }
          };

          const btnAuthSubmit = document.getElementById("btn-auth-submit");
          if (btnAuthSubmit) btnAuthSubmit.addEventListener("click", submitAuthAction);
          const passInputEl = document.getElementById("auth-input-password");
          if (passInputEl) {
            passInputEl.addEventListener("keydown", (e) => {
              if (e.key === "Enter") submitAuthAction();
            });
          }

          // Etapa 2: Upload de foto e avanço para Etapa 3 (Artistas Favoritos)
          const onboardFileAvatar = document.getElementById("onboard-file-avatar");
          if (onboardFileAvatar) {
            onboardFileAvatar.addEventListener("change", (e) => {
              const file = e.target.files && e.target.files[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = (ev) => {
                const b64 = ev.target.result;
                state.user.avatarUrl = b64;
                const previewImg = document.getElementById("onboard-avatar-preview");
                if (previewImg) previewImg.src = b64;
                showToast("Sua foto de perfil foi carregada!");
              };
              reader.readAsDataURL(file);
            });
          }

          ["btn-onboard-step2-back", "btn-onboard-back-1"].forEach(id => {
            const btn = document.getElementById(id);
            if (btn) btn.addEventListener("click", () => this.setOnboardingStep(1));
          });

          ["btn-onboard-step2-next", "btn-onboard-to-step3"].forEach(id => {
            const btn = document.getElementById(id);
            if (btn) {
              btn.addEventListener("click", () => {
                const nameVal = (document.getElementById("onboard-input-name")?.value || "").trim();
                const handleVal = (document.getElementById("onboard-input-username")?.value || "").trim();
                const bioVal = (document.getElementById("onboard-input-bio")?.value || "").trim();
                if (nameVal) state.user.name = nameVal;
                state.user.username = sanitizeCleanHandle(handleVal, state.user.name);
                state.user.bio = bioVal;
                state.saveUser();
                this.syncHeaderUserUI();
                this.setOnboardingStep(3);
              });
            }
          });

          // Busca de artistas em tempo real na Etapa 3 do Onboarding
          const onboardSearchInput = document.getElementById("onboard-artist-search-input");
          if (onboardSearchInput) {
            let onboardSearchTimer = null;
            onboardSearchInput.addEventListener("input", () => {
              clearTimeout(onboardSearchTimer);
              const q = onboardSearchInput.value.trim();
              if (!q) {
                this.renderOnboardingArtistsGrid(null);
                return;
              }
              onboardSearchTimer = setTimeout(async () => {
                try {
                  const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=18`);
                  if (res.ok) {
                    const data = await res.json();
                    if (data && Array.isArray(data.artists) && data.artists.length > 0) {
                      this.renderOnboardingArtistsGrid(data.artists);
                    }
                  }
                } catch (_e) {}
              }, 240);
            });
          }

          // Etapa 3: Salvar Artistas Favoritos e acionar Algoritmo de Recomendação
          ["btn-onboard-step3-back", "btn-onboard-back-2"].forEach(id => {
            const btn = document.getElementById(id);
            if (btn) btn.addEventListener("click", () => this.setOnboardingStep(2));
          });

          const btnOnboardFinish = document.getElementById("btn-onboard-finish");
          if (btnOnboardFinish) {
            btnOnboardFinish.addEventListener("click", async () => {
              const picked = Array.from(this.selectedFavoriteArtists || []);
              if (picked.length < 3) {
                showToast("Escolha pelo menos 3 artistas favoritos para personalizar sua Home!");
                return;
              }
              const pickedGenres = Array.from(this.selectedFavoriteGenres || []);
              btnOnboardFinish.textContent = "Salvando...";
              state.user.username = sanitizeCleanHandle(state.user.username, state.user.name);
              state.user.onboardingCompleted = true;
              state.followedArtists = picked.map(name => ({
                name,
                role: "Artista",
                coverUrl: `/api/artist-image?name=${encodeURIComponent(name)}`,
                followedAt: new Date().toISOString()
              }));
              state.saveFollowedArtists();
              await state.saveFavoriteArtists(picked, pickedGenres);
              btnOnboardFinish.textContent = "Concluir";
              this.syncHeaderUserUI();

              localStorage.setItem("miado_user_onboarded_v1", "true");
              if (state.user.email) {
                localStorage.setItem("miado_active_session_v1", "true");
              }
              const welcomeEl = document.getElementById("miado-welcome-screen");
              if (welcomeEl) welcomeEl.classList.remove("active", "closing");

              await state.createOrUpdateCommunityProfile({
                name: state.user.name,
                username: state.user.username,
                bio: state.user.bio || "",
                avatarUrl: state.user.avatarUrl,
                favoriteArtists: picked
              });

              document.getElementById("modal-auth").classList.remove("active");
              if (state.currentView === "home") this.renderHomeView();
              if (state.currentView === "profile") this.renderProfileView();
              this.renderRightSidebarBodyOnly();
              showToast(`Sua Home foi montada com base nos seus ${picked.length} artistas favoritos!`);
            });
          }

          const btnAuthLogout = document.getElementById("btn-auth-logout");
          if (btnAuthLogout) {
            btnAuthLogout.addEventListener("click", async () => {
              try {
                await fetch("/api/auth/logout", { method: "POST" });
              } catch (e) {}
              localStorage.removeItem("miado_active_session_v1");
              localStorage.removeItem("miado_user_onboarded_v1");
              window._miadoGuestSessionActive = false;
              state.user = {
                name: "Visitante",
                username: "@visitante",
                email: "",
                bio: "",
                avatarId: "cat_1",
                avatarUrl: CAT_AVATAR_PRESETS[0].url,
                bannerUrl: INITIAL_ALBUMS[0].coverUrl,
                followingCount: 0,
                followersCount: 0,
                favoriteArtists: [],
                favoriteGenres: [],
                onboardingCompleted: false,
                likedTracks: []
              };
              state.playlists = [];
              localStorage.setItem("miado_user_v5", JSON.stringify(state.user));
              localStorage.setItem("miado_playlists_v5", JSON.stringify([]));
              this.syncHeaderUserUI();
              this.renderSidebarPlaylists();
              const statusBanner = document.getElementById("auth-logged-status-banner") || document.getElementById("auth-logged-banner");
              if (statusBanner) statusBanner.style.display = "none";
              document.getElementById("modal-auth")?.classList.remove("active");
              this.enforceWelcomeScreenGate();
              showToast("Você saiu da conta.");
            });
          }

          const collabCoverFileInput = document.getElementById("input-new-collab-cover-file");
          if (collabCoverFileInput) {
            collabCoverFileInput.addEventListener("change", async (e) => {
              const file = e.target.files && e.target.files[0];
              if (!file) return;
              try {
                const dataUrl = await readImageFileAsCompressedDataUrl(file, 640, 0.85);
                this.pendingNewPlaylistCoverDataUrl = dataUrl;
                const previewEl = document.getElementById("new-collab-cover-preview");
                if (previewEl) {
                  previewEl.innerHTML = `<img src="${dataUrl}" alt="Capa" style="width:100%; height:100%; object-fit:cover;" />`;
                }
                showToast("Foto da galeria selecionada para a capa da playlist!");
              } catch (err) {
                showToast("Não foi possível ler a imagem selecionada.");
              }
            });
          }

          const createPlaylistAction = () => {
            const input = document.getElementById("input-new-collab-name");
            const name = input.value.trim();
            if (!name) {
              showToast("Digite um nome para a playlist.");
              return;
            }
            const isCollab = this.creatingCollaborativeMode !== false;
            const customCover = this.pendingNewPlaylistCoverDataUrl || "";
            const newPl = {
              id: `pl_${Date.now()}`,
              name,
              description: isCollab ? "Playlist colaborativa criada no Miado" : "Playlist pessoal criada no Miado",
              isCollaborative: isCollab,
              collaborators: [state.user.username],
              customCoverUrl: customCover || undefined,
              coverUrl: customCover || undefined,
              tracks: []
            };
            state.playlists.push(newPl);
            state.savePlaylists();
            input.value = "";
            this.pendingNewPlaylistCoverDataUrl = "";
            if (collabCoverFileInput) collabCoverFileInput.value = "";
            const previewEl = document.getElementById("new-collab-cover-preview");
            if (previewEl) {
              previewEl.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent-hover)" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`;
            }
            this.renderSidebarPlaylists();
            document.getElementById("modal-collab-playlist").classList.remove("active");
            this.navigateTo("playlist", true, { playlistId: newPl.id });
            showToast(`Playlist "${name}" criada com sucesso!`);
          };

          document.getElementById("btn-create-collab-submit").addEventListener("click", createPlaylistAction);
          document.getElementById("input-new-collab-name").addEventListener("keydown", (e) => {
            if (e.key === "Enter") createPlaylistAction();
          });

          const importPlaylistAction = () => {
            const input = document.getElementById("input-import-collab-code");
            const raw = input.value.trim();
            if (!raw) return;
            try {
              const clean = raw.replace("miado-sync:", "");
              const decoded = JSON.parse(decodeURIComponent(escape(atob(clean))));
              decoded.id = `pl_imp_${Date.now()}`;
              if (!decoded.collaborators) decoded.collaborators = [];
              if (!decoded.collaborators.includes(state.user.username)) {
                decoded.collaborators.push(state.user.username);
              }
              state.playlists.push(decoded);
              state.savePlaylists();
              input.value = "";
              this.renderSidebarPlaylists();
              document.getElementById("modal-collab-playlist").classList.remove("active");
              this.navigateTo("playlist", true, { playlistId: decoded.id });
              showToast("Playlist conjunta importada com sucesso!");
            } catch (e) {
              showToast("Código Base64 inválido.");
            }
          };

          document.getElementById("btn-import-collab-submit").addEventListener("click", importPlaylistAction);
          document.getElementById("input-import-collab-code").addEventListener("keydown", (e) => {
            if (e.key === "Enter") importPlaylistAction();
          });
        }

        openTrackOptionsModal(track, albumContext = state.currentAlbum) {
          if (!track) return;
          const cleanTrack = {
            ...track,
            coverUrl: ensureTrackCoverUrl(track, track.title, track.artist, albumContext && albumContext.coverUrl)
          };
          state.pendingTrackForPlaylist = cleanTrack;
          document.getElementById("modal-track-options-title").textContent = "Adicionar à Playlist & Opções";
          const container = document.getElementById("modal-playlist-select-list");
          const isLiked = state.isLiked(cleanTrack.id);
          const trackKey = normalizeTrackKey(cleanTrack);

          container.innerHTML = `
            <!-- Cabeçalho da Música Selecionada -->
            <div style="display:flex; align-items:center; gap:14px; padding:12px 14px; background-color:var(--bg-base); border:1px solid var(--glass-border-strong); border-radius:12px; margin-bottom:4px;">
              <img src="${cleanTrack.coverUrl}" alt="${cleanTrack.title}" style="width:56px; height:56px; border-radius:10px; object-fit:cover; border:1px solid var(--glass-border);" referrerpolicy="no-referrer" onerror="window.handleImgError(this, '${String(cleanTrack.title || "").replace(/'/g, "")}', '${String(cleanTrack.artist || "").replace(/'/g, "")}')" />
              <div style="flex:1; min-width:0;">
                <div style="font-weight:800; font-size:0.98rem; color:#ffffff;" class="text-truncate">${cleanTrack.title}</div>
                <div style="font-size:0.82rem; color:var(--accent-hover); font-weight:700; margin-top:2px;" class="text-truncate">${cleanTrack.artist}</div>
                <div style="font-size:0.74rem; color:var(--text-muted); margin-top:2px;" class="text-truncate">${cleanTrack.albumTitle || (albumContext && albumContext.title) || "Single Oficial HD"} · ${cleanTrack.duration || "3:30"}</div>
              </div>
            </div>

            <!-- Ações Rápidas -->
            <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:8px; margin-bottom:8px;">
              <button class="album-action-btn primary" id="opt-btn-play-now" style="height:40px; font-size:0.78rem; padding:0 6px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>
                Tocar
              </button>
              <button class="album-action-btn" id="opt-btn-play-next" style="height:40px; font-size:0.78rem; padding:0 6px;" title="Tocar logo em seguida da faixa atual">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/></svg>
                A Seguir
              </button>
              <button class="album-action-btn" id="opt-btn-add-queue" style="height:40px; font-size:0.78rem; padding:0 6px;" title="Adicionar ao fim da fila">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/></svg>
                Fim Fila
              </button>
              <button class="album-action-btn" id="opt-btn-toggle-like" style="height:40px; font-size:0.78rem; padding:0 6px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="${isLiked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
                ${isLiked ? "Curtida" : "Curtir"}
              </button>
            </div>

            <!-- Criar Nova Playlist e Já Adicionar Esta Música -->
            <div style="background-color:var(--bg-base); border:1px solid var(--glass-border); border-radius:12px; padding:12px;">
              <div style="font-size:0.75rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em; color:var(--accent-hover); margin-bottom:8px;">
                + Criar Nova Playlist com Esta Música
              </div>
              <div style="display:flex; gap:8px;">
                <input type="text" id="input-quick-new-pl-name" placeholder="Nome da nova playlist (ex: Favoritas Miau)..." style="flex:1; height:38px; font-size:0.84rem;" />
                <button class="btn-modal-confirm" id="btn-quick-create-pl-add" style="height:38px; padding:0 14px; font-size:0.82rem; white-space:nowrap;">Criar & Adicionar</button>
              </div>
            </div>

            <!-- Lista de Playlists Existentes -->
            <div style="font-size:0.76rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em; color:var(--text-muted); margin-top:4px;">
              Escolha uma Playlist para Adicionar (${state.playlists.length}):
            </div>
            <div style="display:flex; flex-direction:column; gap:8px;">
              ${state.playlists.map(pl => {
                const plCover = pl.customCoverUrl || pl.coverUrl || (pl.tracks && pl.tracks[0] && ensureTrackCoverUrl(pl.tracks[0])) || INITIAL_ALBUMS[0].coverUrl;
                const alreadyIn = (pl.tracks || []).some(t => String(t.id) === String(cleanTrack.id) || normalizeTrackKey(t) === trackKey);
                return `
                  <div class="track-row" style="min-height:54px; padding:8px 12px; background-color:var(--bg-base); border:1px solid ${alreadyIn ? 'var(--accent)' : 'var(--glass-border)'}; border-radius:12px; display:flex; align-items:center; justify-content:space-between; gap:12px;" data-target-pl="${pl.id}">
                    <div style="display:flex; align-items:center; gap:12px; min-width:0; flex:1;">
                      <img src="${plCover}" alt="${pl.name}" style="width:40px; height:40px; border-radius:8px; object-fit:cover; border:1px solid var(--glass-border);" referrerpolicy="no-referrer" onerror="window.handleImgError(this, '${pl.name.replace(/'/g, "")}', 'Playlist')" />
                      <div style="min-width:0; flex:1;">
                        <div style="font-weight:700; font-size:0.9rem; color:#ffffff;" class="text-truncate">${pl.name}</div>
                        <div style="font-size:0.75rem; color:var(--text-secondary);">${pl.isCollaborative ? "Conjunta · " : ""}${pl.tracks.length} músicas</div>
                      </div>
                    </div>
                    <button class="album-action-btn ${alreadyIn ? '' : 'primary'}" style="flex:0 0 auto; height:34px; padding:0 14px; font-size:0.78rem;">
                      ${alreadyIn ? "✓ Já na Playlist" : "+ Adicionar"}
                    </button>
                  </div>
                `;
              }).join("")}
            </div>
          `;

          document.getElementById("opt-btn-play-now").addEventListener("click", () => {
            document.getElementById("modal-add-to-playlist").classList.remove("active");
            engine.playTrack(cleanTrack, albumContext);
          });

          document.getElementById("opt-btn-play-next").addEventListener("click", () => {
            document.getElementById("modal-add-to-playlist").classList.remove("active");
            engine.addToQueueNext(cleanTrack);
          });

          document.getElementById("opt-btn-add-queue").addEventListener("click", () => {
            document.getElementById("modal-add-to-playlist").classList.remove("active");
            engine.addToQueueEnd(cleanTrack);
          });

          document.getElementById("opt-btn-toggle-like").addEventListener("click", () => {
            state.toggleLike(cleanTrack);
            engine.updateLikeButtonUI();
            document.getElementById("modal-add-to-playlist").classList.remove("active");
            if (state.currentView === "liked") this.renderLikedTracksView();
            if (state.currentView === "profile") this.renderProfileView();
          });

          const quickCreateAndAdd = () => {
            const nameInput = document.getElementById("input-quick-new-pl-name");
            const name = (nameInput ? nameInput.value : "").trim();
            if (!name) {
              showToast("Digite um nome para criar a nova playlist!");
              if (nameInput) nameInput.focus();
              return;
            }
            const newPl = {
              id: `pl_${Date.now()}`,
              name,
              description: `Playlist criada com "${cleanTrack.title}" no Miado`,
              isCollaborative: true,
              collaborators: [state.user.username],
              tracks: [
                {
                  ...cleanTrack,
                  addedBy: { username: state.user.username, avatar: state.user.avatarUrl }
                }
              ]
            };
            state.playlists.unshift(newPl);
            state.savePlaylists();
            this.renderSidebarPlaylists();
            if (state.currentView === "library") this.renderLibraryView();
            if (state.currentView === "profile") this.renderProfileView();
            document.getElementById("modal-add-to-playlist").classList.remove("active");
            showToast(`Playlist "${name}" criada com "${cleanTrack.title}"!`);
          };

          document.getElementById("btn-quick-create-pl-add").addEventListener("click", quickCreateAndAdd);
          document.getElementById("input-quick-new-pl-name").addEventListener("keydown", (e) => {
            if (e.key === "Enter") quickCreateAndAdd();
          });

          container.querySelectorAll("[data-target-pl]").forEach(row => {
            row.addEventListener("click", () => {
              const pl = state.playlists.find(p => p.id === row.dataset.targetPl);
              if (!pl || !state.pendingTrackForPlaylist) return;
              const exists = (pl.tracks || []).some(t => String(t.id) === String(cleanTrack.id) || normalizeTrackKey(t) === trackKey);
              if (exists) {
                showToast(`"${cleanTrack.title}" já está na playlist "${pl.name}"!`);
                document.getElementById("modal-add-to-playlist").classList.remove("active");
                return;
              }
              pl.tracks.push({
                ...cleanTrack,
                addedBy: { username: state.user.username, avatar: state.user.avatarUrl }
              });
              state.savePlaylists();
              this.renderSidebarPlaylists();
              if (state.currentView === "playlist" && state.activePlaylistId === pl.id) {
                this.renderPlaylistView(pl.id);
              }
              if (state.currentView === "library") this.renderLibraryView();
              if (state.currentView === "profile") this.renderProfileView();
              document.getElementById("modal-add-to-playlist").classList.remove("active");
              showToast(`"${cleanTrack.title}" adicionada à playlist "${pl.name}"!`);
            });
          });

          document.getElementById("modal-add-to-playlist").classList.add("active");
        }

        triggerViewportTransition() {
          const viewport = document.querySelector(".main-viewport");
          if (!viewport) return;
          viewport.classList.remove("view-transitioning");
          void viewport.offsetWidth;
          viewport.classList.add("view-transitioning");
          if (this._springTransitionTimer) clearTimeout(this._springTransitionTimer);
          this._springTransitionTimer = setTimeout(() => {
            viewport.classList.remove("view-transitioning");
          }, 540);
        }

        navigateTo(viewName, pushHistory = true, params = {}) {
          if (!Array.isArray(this.historyStack)) {
            this.historyStack = [{ view: "home", params: {} }];
            this.historyIndex = 0;
          }
          if (pushHistory) {
            this.historyStack = this.historyStack.slice(0, this.historyIndex + 1);
            this.historyStack.push({ view: viewName, params });
            this.historyIndex = this.historyStack.length - 1;
            state.historyStack = this.historyStack;
            state.historyIndex = this.historyIndex;
          }
          state.currentView = viewName;
          state.activePlaylistId = viewName === "playlist" ? (params.playlistId || null) : null;
          this.setActiveNav(viewName, state.activePlaylistId);

          switch (viewName) {
            case "home":
              this.renderHomeView();
              break;
            case "album":
              this.renderAlbumView(params.albumId, params.customAlbum);
              break;
            case "search":
              this.renderSearchView(params.query || "");
              break;
            case "library":
              this.renderLibraryView();
              break;
            case "social":
              this.renderSocialView();
              break;
            case "profile":
              this.renderProfileView(params.targetUser || null);
              break;
            case "playlist":
              this.renderPlaylistView(params.playlistId);
              break;
            case "liked":
              this.renderLikedTracksView();
              break;
            case "artist":
              this.renderArtistView(params.artistName);
              break;
          }
          this.scrollContainer.scrollTop = 0;
          this.triggerViewportTransition();
        }

        historyBack() {
          if (Array.isArray(this.historyStack) && this.historyIndex > 0) {
            this.historyIndex--;
            state.historyIndex = this.historyIndex;
            const item = this.historyStack[this.historyIndex];
            if (item && item.view) {
              this.navigateTo(item.view, false, item.params || {});
            }
          } else {
            this.navigateTo("home", false);
          }
        }

        historyForward() {
          if (Array.isArray(this.historyStack) && this.historyIndex < this.historyStack.length - 1) {
            this.historyIndex++;
            state.historyIndex = this.historyIndex;
            const item = this.historyStack[this.historyIndex];
            if (item && item.view) {
              this.navigateTo(item.view, false, item.params || {});
            }
          }
        }

        getGreeting() {
          const h = new Date().getHours();
          if (h >= 5 && h < 12) return "Bom dia";
          if (h >= 12 && h < 18) return "Boa tarde";
          return "Boa noite";
        }

        // ----------------------------------------------------------------------
        // VIEW UNIFICADA DE PERFIL DO USUÁRIO (PRÓPRIO E DE OUTROS USUÁRIOS)
        // COM SEÇÕES CLICÁVEIS: ARTISTAS SEGUIDOS, SEGUIDORES, SEGUINDO, CURTIDAS E PLAYLISTS
        // ----------------------------------------------------------------------
        renderProfileView(targetUser = null) {
          const isMe = !targetUser || String(targetUser.username || "").toLowerCase() === String(state.user.username || "").toLowerCase();
          const activeUser = isMe ? state.user : targetUser;
          const userAvatar = (isMe ? state.user.avatarUrl : (activeUser.avatar || activeUser.avatarUrl)) || CAT_AVATAR_PRESETS[0].url;
          const bannerImg = activeUser.bannerUrl || (isMe ? (state.user.bannerUrl || INITIAL_ALBUMS[0].coverUrl) : INITIAL_ALBUMS[1].coverUrl);
          const currentTrack = isMe
            ? (state.currentTrack || INITIAL_ALBUMS[0].tracks[0])
            : { title: (activeUser.currentTrack ? activeUser.currentTrack.split(" - ")[0] : "BIRDS OF A FEATHER"), artist: (activeUser.currentTrack ? activeUser.currentTrack.split(" - ")[1] || "Billie Eilish" : "Billie Eilish") };
          const currentTrackCover = ensureTrackCoverUrl(currentTrack, currentTrack.title, currentTrack.artist);

          // Dados das 5 seções
          const likedTracks = isMe
            ? deduplicateTracks(state.user.likedTracks || [])
            : (activeUser.likedTracks || [INITIAL_ALBUMS[0].tracks[0], INITIAL_ALBUMS[1].tracks[0], INITIAL_ALBUMS[2].tracks[0]]);
          this.profileLikedTracks = likedTracks;

          const followedArtists = isMe
            ? (state.followedArtists || [])
            : (activeUser.followedArtists || [
                POPULAR_ARTISTS_DIRECTORY[0],
                POPULAR_ARTISTS_DIRECTORY[1],
                POPULAR_ARTISTS_DIRECTORY[2]
              ]);

          const followingUsers = isMe
            ? (state.friends || [])
            : (activeUser.following || state.friends.slice(0, 3));

          const followerUsers = isMe
            ? (state.userFollowers || (state.communityProfiles || []).slice(0, 2))
            : (activeUser.followers || [
                { name: state.user.name, username: state.user.username, avatarUrl: state.user.avatarUrl }
              ]);

          const userPlaylists = isMe
            ? (state.playlists || [])
            : (activeUser.playlists || state.playlists.slice(0, 2));

          const isFollowingProfile = !isMe && state.isProfileFollowed(activeUser.username);
          const activeSectionTab = this._activeProfileTab || (isMe ? "liked" : "liked");

          this.scrollContainer.innerHTML = `
            <div style="max-width:980px; margin:0 auto; display:flex; flex-direction:column; gap:22px;">

              <!-- HERO DO PERFIL -->
              <div class="album-card" style="padding:0; overflow:hidden; cursor:default;">
                <!-- Banner Superior com Botão de Trocar Capa -->
                <div id="prof-hero-banner" style="height:180px; width:100%; background-color:#130f22; background-image:url('${bannerImg}'); background-size:cover; background-position:center; position:relative; border-bottom:1px solid var(--glass-border-strong);">
                  <div style="position:absolute; inset:0; background:linear-gradient(180deg, rgba(7,6,11,0.2) 0%, rgba(7,6,11,0.65) 100%);"></div>

                  ${!isMe ? `
                    <button type="button" class="back-btn-pill" id="btn-prof-back" style="position:absolute; top:14px; left:16px; z-index:4; background-color:rgba(7,6,11,0.85);">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
                      Voltar
                    </button>
                  ` : `
                    <div style="position:absolute; top:14px; left:16px; display:flex; align-items:center; gap:8px; z-index:2;">
                      <span class="technical-badge" style="background-color:rgba(7,6,11,0.85); color:#ffffff;">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="var(--accent-hover)"><polygon points="12 2 15 8 22 9 17 14 18 21 12 18 6 21 7 14 2 9 9 8 12 2"/></svg>
                        Seu Perfil Miado
                      </span>
                    </div>
                  `}

                  ${isMe ? `
                    <button type="button" id="btn-prof-change-banner" style="position:absolute; right:16px; top:14px; z-index:4; background-color:rgba(7,6,11,0.85); border:1px solid var(--glass-border-strong); padding:7px 14px; border-radius:999px; font-size:0.78rem; font-weight:700; color:#ffffff; cursor:pointer; display:flex; align-items:center; gap:6px;">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                      Trocar Capa
                    </button>
                  ` : `
                    <button type="button" id="btn-prof-follow-toggle" class="category-pill ${isFollowingProfile ? 'active' : ''}" style="position:absolute; right:16px; top:14px; z-index:4; height:34px; padding:0 18px; font-size:0.82rem; font-weight:800;">
                      ${isFollowingProfile ? "✓ Seguindo" : "+ Seguir Perfil"}
                    </button>
                  `}
                </div>

                <!-- Informações do Usuário & Contadores -->
                <div style="padding:0 24px 20px; position:relative; z-index:2;">
                  <div style="display:flex; align-items:flex-end; justify-content:space-between; flex-wrap:wrap; gap:18px; margin-top:-52px; margin-bottom:18px;">
                    <div style="display:flex; align-items:flex-end; gap:18px; flex-wrap:wrap;">
                      <div style="position:relative;">
                        <img id="prof-hero-avatar" src="${userAvatar}" alt="${activeUser.name}" style="width:112px; height:112px; border-radius:50%; object-fit:cover; border:4px solid var(--accent-hover); background-color:#07060b; box-shadow:0 12px 30px rgba(0,0,0,0.75);" onerror="window.handleCatAvatarError(this)" />
                        ${isMe ? `
                          <button type="button" id="btn-prof-change-avatar" title="Escolher Foto da Galeria" style="position:absolute; right:2px; bottom:2px; width:34px; height:34px; border-radius:50%; background-color:var(--accent); border:2px solid #ffffff; display:flex; align-items:center; justify-content:center; cursor:pointer; color:#ffffff;">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                          </button>
                        ` : ""}
                      </div>
                      <div style="padding-bottom:4px;">
                        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
                          <h1 id="prof-hero-name" style="font-size:1.75rem; font-weight:800; color:#ffffff; letter-spacing:-0.02em;">${activeUser.name}</h1>
                          <span class="friend-online-badge">ONLINE AGORA</span>
                        </div>
                        <div id="prof-hero-handle" style="font-size:0.95rem; font-weight:700; color:var(--accent-hover); margin-top:2px;">${activeUser.username}</div>
                        <p id="prof-hero-bio" style="font-size:0.86rem; color:var(--text-secondary); margin-top:6px; max-width:540px;">${activeUser.bio || "Membro da comunidade Miado Streaming."}</p>
                      </div>
                    </div>

                    <!-- Status de Ouvindo Agora -->
                    <div style="background-color:var(--bg-base); border:1px solid var(--glass-border-strong); border-radius:14px; padding:10px 14px; display:flex; align-items:center; gap:12px; min-width:270px; max-width:340px;">
                      <img src="${currentTrackCover}" alt="${currentTrack.title}" style="width:44px; height:44px; border-radius:8px; object-fit:cover;" referrerpolicy="no-referrer" onerror="window.handleImgError(this, '${String(currentTrack.title || "").replace(/'/g, "")}', '${String(currentTrack.artist || "").replace(/'/g, "")}')" />
                      <div style="flex:1; min-width:0;">
                        <div style="font-size:0.65rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em; color:var(--accent-hover);">Ouvindo no Fone</div>
                        <div style="font-size:0.84rem; font-weight:700; color:#ffffff;" class="text-truncate">${currentTrack.title}</div>
                        <div style="font-size:0.74rem; color:var(--text-secondary);" class="text-truncate">${currentTrack.artist}</div>
                      </div>
                      <button class="btn-main-play" id="prof-btn-play-status" style="width:34px; height:34px; flex:0 0 auto;" title="Tocar música do perfil">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>
                      </button>
                    </div>
                  </div>

                  <!-- 5 CONTADORES CLICÁVEIS QUE ALTERNAM AS SEÇÕES -->
                  <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap:10px; padding-top:16px; border-top:1px solid var(--glass-border);">
                    <div class="category-pill ${activeSectionTab === 'artists' ? 'active' : ''}" data-prof-nav-tab="artists" style="padding:10px; text-align:center; border-radius:12px; cursor:pointer;">
                      <div style="font-size:1.25rem; font-weight:800;">${followedArtists.length}</div>
                      <div style="font-size:0.72rem; opacity:0.85;">Artistas Seguidos</div>
                    </div>
                    <div class="category-pill ${activeSectionTab === 'followers' ? 'active' : ''}" data-prof-nav-tab="followers" style="padding:10px; text-align:center; border-radius:12px; cursor:pointer;">
                      <div style="font-size:1.25rem; font-weight:800;">${followerUsers.length}</div>
                      <div style="font-size:0.72rem; opacity:0.85;">Seguidores</div>
                    </div>
                    <div class="category-pill ${activeSectionTab === 'following' ? 'active' : ''}" data-prof-nav-tab="following" style="padding:10px; text-align:center; border-radius:12px; cursor:pointer;">
                      <div style="font-size:1.25rem; font-weight:800;">${followingUsers.length}</div>
                      <div style="font-size:0.72rem; opacity:0.85;">Seguindo</div>
                    </div>
                    <div class="category-pill ${activeSectionTab === 'liked' ? 'active' : ''}" data-prof-nav-tab="liked" style="padding:10px; text-align:center; border-radius:12px; cursor:pointer;">
                      <div style="font-size:1.25rem; font-weight:800;">${likedTracks.length}</div>
                      <div style="font-size:0.72rem; opacity:0.85;">Músicas Curtidas</div>
                    </div>
                    <div class="category-pill ${activeSectionTab === 'playlists' ? 'active' : ''}" data-prof-nav-tab="playlists" style="padding:10px; text-align:center; border-radius:12px; cursor:pointer;">
                      <div style="font-size:1.25rem; font-weight:800;">${userPlaylists.length}</div>
                      <div style="font-size:0.72rem; opacity:0.85;">Playlists Criadas</div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- BARRA DE ABAS DO PERFIL -->
              <div style="display:flex; align-items:center; gap:8px; overflow-x:auto; padding-bottom:4px; scrollbar-width:none;">
                <button type="button" class="category-pill ${activeSectionTab === 'liked' ? 'active' : ''}" data-prof-nav-tab="liked">Músicas Curtidas (${likedTracks.length})</button>
                <button type="button" class="category-pill ${activeSectionTab === 'artists' ? 'active' : ''}" data-prof-nav-tab="artists">Artistas Seguidos (${followedArtists.length})</button>
                <button type="button" class="category-pill ${activeSectionTab === 'followers' ? 'active' : ''}" data-prof-nav-tab="followers">Seguidores (${followerUsers.length})</button>
                <button type="button" class="category-pill ${activeSectionTab === 'following' ? 'active' : ''}" data-prof-nav-tab="following">Seguindo (${followingUsers.length})</button>
                <button type="button" class="category-pill ${activeSectionTab === 'playlists' ? 'active' : ''}" data-prof-nav-tab="playlists">Playlists (${userPlaylists.length})</button>
                ${isMe ? `<button type="button" class="category-pill ${activeSectionTab === 'edit' ? 'active' : ''}" data-prof-nav-tab="edit">Personalizar & Gatinho</button>` : ""}
              </div>

              <!-- CONTEÚDO DA ABA SELECIONADA -->

              <!-- 1. ABA: MÚSICAS CURTIDAS -->
              <div id="prof-pane-liked" style="display:${activeSectionTab === 'liked' ? 'block' : 'none'};">
                <section class="showcase-section" style="margin-bottom:0;">
                  <div class="section-head">
                    <h2 class="section-title">Músicas Favoritas (${likedTracks.length})</h2>
                  </div>
                  ${likedTracks.length === 0 ? `
                    <div class="album-card" style="text-align:center; padding:32px; color:var(--text-secondary);">
                      Nenhuma música curtida ainda. Curta qualquer faixa para fixá-la aqui!
                    </div>
                  ` : `
                    <div class="tracklist-table">
                      ${likedTracks.map((tr, idx) => {
                        const cover = ensureTrackCoverUrl(tr, tr.title, tr.artist);
                        const tKey = normalizeTrackKey(tr);
                        const safeTitle = String(tr.title || "").replace(/"/g, "&quot;");
                        const safeArtist = String(tr.artist || "").replace(/"/g, "&quot;");
                        const isLikedTr = state.isLiked(tr);
                        return `
                          <div class="track-row ${state.currentTrack && (String(state.currentTrack.id) === String(tr.id) || normalizeTrackKey(state.currentTrack) === tKey) ? 'playing' : ''}" data-prof-liked-row="${idx}" data-track-id="${tr.id}" data-track-key="${tKey}">
                            <div class="track-num-col"><span>${idx + 1}</span></div>
                            <img class="track-row-cover" src="${cover}" alt="${tr.title}" referrerpolicy="no-referrer" onerror="window.handleImgError(this, '${String(tr.title || "").replace(/'/g, "")}', '${String(tr.artist || "").replace(/'/g, "")}')" />
                            <div class="track-info-col">
                              <div class="track-title">${tr.title}</div>
                              <div class="track-artist">${tr.artist} · ${tr.albumTitle || "Single"}</div>
                            </div>
                            <div class="track-duration-col">${tr.duration || "3:30"}</div>
                            <div class="track-actions-col">
                              <button class="track-icon-btn btn-add-queue-direct" data-quick-queue-btn data-prof-queue="${idx}" title="Adicionar à fila" aria-label="Adicionar à fila">
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M4 6h16M4 12h10M4 18h10M18 15v6m3-3h-6"/></svg>
                              </button>
                              <button class="track-icon-btn ${isLikedTr ? 'liked' : ''}" data-prof-unheart="${idx}" data-like-track-key="${tKey}" data-like-track-id="${tr.id}" data-like-track-title="${safeTitle}" data-like-track-artist="${safeArtist}" title="Curtir / Descurtir">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="${isLikedTr ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
                              </button>
                              <button class="track-icon-btn" data-prof-addpl="${idx}" title="Opções & Playlist">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                              </button>
                            </div>
                          </div>
                        `;
                      }).join("")}
                    </div>
                  `}
                </section>
              </div>

              <!-- 2. ABA: ARTISTAS SEGUIDOS -->
              <div id="prof-pane-artists" style="display:${activeSectionTab === 'artists' ? 'block' : 'none'};">
                <section class="showcase-section" style="margin-bottom:0;">
                  <div class="section-head">
                    <h2 class="section-title">Artistas Seguidos (${followedArtists.length})</h2>
                  </div>
                  ${followedArtists.length === 0 ? `
                    <div class="album-card" style="text-align:center; padding:32px; color:var(--text-secondary);">
                      Nenhum artista seguido ainda. Clique em "+ Seguir" nos cards de artistas para adicioná-los aqui!
                    </div>
                  ` : `
                    <div class="artist-bubbles-grid">
                      ${followedArtists.map((art, aIdx) => {
                        const isFollowing = state.isArtistFollowed(art.name);
                        return `
                          <div class="artist-bubble-card" data-prof-open-artist="${art.name}">
                            <img class="artist-bubble-img" src="${art.coverUrl}" alt="${art.name}" referrerpolicy="no-referrer" onerror="window.handleImgError(this, '${art.name.replace(/'/g, "")}', 'Artista')" />
                            <div class="artist-bubble-info">
                              <div class="artist-bubble-name">${art.name}</div>
                              <div class="artist-bubble-sub">${art.role || "Artista Seguido"}</div>
                            </div>
                            <button type="button" class="category-pill ${isFollowing ? 'active' : ''}" data-prof-follow-artist="${art.name}" data-artist-cover="${art.coverUrl}" data-artist-role="${art.role}">
                              ${isFollowing ? "✓ Seguindo" : "+ Seguir"}
                            </button>
                          </div>
                        `;
                      }).join("")}
                    </div>
                  `}
                </section>
              </div>

              <!-- 3. ABA: SEGUIDORES -->
              <div id="prof-pane-followers" style="display:${activeSectionTab === 'followers' ? 'block' : 'none'};">
                <section class="showcase-section" style="margin-bottom:0;">
                  <div class="section-head">
                    <h2 class="section-title">Seguidores (${followerUsers.length})</h2>
                  </div>
                  ${followerUsers.length === 0 ? `
                    <div class="album-card" style="text-align:center; padding:32px; color:var(--text-secondary);">
                      Nenhum seguidor ainda. Compartilhe seu perfil na comunidade para conquistar seguidores!
                    </div>
                  ` : `
                    <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(240px, 1fr)); gap:12px;">
                      ${followerUsers.map((u, uIdx) => {
                        const isFollowedByMe = state.isProfileFollowed(u.username);
                        return `
                          <div class="album-card" style="padding:14px; display:flex; align-items:center; justify-content:space-between; gap:12px;" data-prof-open-user="${u.username}">
                            <div style="display:flex; align-items:center; gap:12px; min-width:0; flex:1;">
                              <img src="${u.avatarUrl || u.avatar || CAT_AVATAR_PRESETS[uIdx % CAT_AVATAR_PRESETS.length].url}" alt="${u.name}" style="width:44px; height:44px; border-radius:50%; object-fit:cover; border:2px solid var(--accent);" onerror="window.handleCatAvatarError(this)" />
                              <div style="min-width:0; flex:1;">
                                <div style="font-weight:700; font-size:0.9rem; color:#ffffff;" class="text-truncate">${u.name}</div>
                                <div style="font-size:0.75rem; color:var(--accent-hover);">${u.username}</div>
                              </div>
                            </div>
                            ${u.username !== state.user.username ? `
                              <button type="button" class="category-pill ${isFollowedByMe ? 'active' : ''}" data-prof-toggle-user-follow="${u.username}" style="height:32px; padding:0 12px; font-size:0.74rem;">
                                ${isFollowedByMe ? "✓ Seguindo" : "+ Seguir"}
                              </button>
                            ` : ""}
                          </div>
                        `;
                      }).join("")}
                    </div>
                  `}
                </section>
              </div>

              <!-- 4. ABA: SEGUINDO -->
              <div id="prof-pane-following" style="display:${activeSectionTab === 'following' ? 'block' : 'none'};">
                <section class="showcase-section" style="margin-bottom:0;">
                  <div class="section-head">
                    <h2 class="section-title">Pessoas que Este Perfil Segue (${followingUsers.length})</h2>
                  </div>
                  ${followingUsers.length === 0 ? `
                    <div class="album-card" style="text-align:center; padding:32px; color:var(--text-secondary);">
                      Nenhum amigo seguido ainda. Encontre perfis reais na aba Comunidade!
                    </div>
                  ` : `
                    <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(240px, 1fr)); gap:12px;">
                      ${followingUsers.map((u, uIdx) => {
                        const isFollowedByMe = state.isProfileFollowed(u.username);
                        return `
                          <div class="album-card" style="padding:14px; display:flex; align-items:center; justify-content:space-between; gap:12px;" data-prof-open-user="${u.username}">
                            <div style="display:flex; align-items:center; gap:12px; min-width:0; flex:1;">
                              <img src="${u.avatarUrl || u.avatar || CAT_AVATAR_PRESETS[uIdx % CAT_AVATAR_PRESETS.length].url}" alt="${u.name}" style="width:44px; height:44px; border-radius:50%; object-fit:cover; border:2px solid var(--accent);" onerror="window.handleCatAvatarError(this)" />
                              <div style="min-width:0; flex:1;">
                                <div style="font-weight:700; font-size:0.9rem; color:#ffffff;" class="text-truncate">${u.name}</div>
                                <div style="font-size:0.75rem; color:var(--accent-hover);">${u.username}</div>
                              </div>
                            </div>
                            ${u.username !== state.user.username ? `
                              <button type="button" class="category-pill ${isFollowedByMe ? 'active' : ''}" data-prof-toggle-user-follow="${u.username}" style="height:32px; padding:0 12px; font-size:0.74rem;">
                                ${isFollowedByMe ? "✓ Seguindo" : "+ Seguir"}
                              </button>
                            ` : ""}
                          </div>
                        `;
                      }).join("")}
                    </div>
                  `}
                </section>
              </div>

              <!-- 5. ABA: PLAYLISTS CRIADAS -->
              <div id="prof-pane-playlists" style="display:${activeSectionTab === 'playlists' ? 'block' : 'none'};">
                <section class="showcase-section" style="margin-bottom:0;">
                  <div class="section-head">
                    <h2 class="section-title">Playlists Criadas (${userPlaylists.length})</h2>
                    ${isMe ? `<button class="btn-see-all" id="prof-btn-create-pl-sec">+ NOVA PLAYLIST</button>` : ""}
                  </div>
                  <div class="cards-row-scroll">
                    ${userPlaylists.map(pl => {
                      const plCover = pl.customCoverUrl || pl.coverUrl || (pl.tracks && pl.tracks[0] && ensureTrackCoverUrl(pl.tracks[0])) || INITIAL_ALBUMS[0].coverUrl;
                      return `
                        <div class="album-card" data-prof-card-pl="${pl.id}" style="position:relative;">
                          <div class="album-cover-wrap">
                            <img class="album-cover-img" src="${plCover}" alt="${pl.name}" referrerpolicy="no-referrer" onerror="window.handleImgError(this, '${pl.name.replace(/'/g, "")}', 'Playlist')" />
                            ${isMe ? `
                              <button type="button" data-prof-del-pl="${pl.id}" title="Apagar playlist ${pl.name}" style="position:absolute; top:8px; right:8px; width:30px; height:30px; border-radius:50%; background:rgba(15,10,25,0.85); border:1px solid rgba(248,113,113,0.55); color:#f87171; display:flex; align-items:center; justify-content:center; cursor:pointer; z-index:4;">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
                              </button>
                            ` : ""}
                            <button class="floating-card-play" data-prof-play-pl="${pl.id}" title="Tocar ${pl.name}">
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>
                            </button>
                          </div>
                          <div class="album-card-title">${pl.name}</div>
                          <div class="album-card-sub">${pl.isCollaborative ? "Conjunta · " : ""}${(pl.tracks || []).length} músicas</div>
                        </div>
                      `;
                    }).join("")}
                  </div>
                </section>
              </div>

              <!-- 6. ABA: EDITAR DADOS (SOMENTE MEU PERFIL) -->
              ${isMe ? `
                <div id="prof-pane-edit" style="display:${activeSectionTab === 'edit' ? 'block' : 'none'};">
                  <div class="album-card" style="padding:22px; cursor:default; display:flex; flex-direction:column; gap:16px;">
                    <div>
                      <h2 class="section-title">Personalização do Seu Perfil & Gatinho</h2>
                    </div>

                    <div class="cat-avatar-picker-grid" id="prof-page-cat-grid">
                      ${CAT_AVATAR_PRESETS.map((cat, idx) => {
                        const isSelected = userAvatar === cat.url;
                        return `
                          <div class="cat-avatar-option ${isSelected ? 'selected' : ''}" data-prof-cat-idx="${idx}">
                            <img src="${cat.url}" alt="${cat.name}" referrerpolicy="no-referrer" onerror="window.handleCatAvatarError(this)" />
                            <span>${cat.name}</span>
                          </div>
                        `;
                      }).join("")}
                    </div>

                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
                      <div>
                        <label style="font-size:0.75rem; color:var(--text-secondary); font-weight:700; display:block; margin-bottom:4px;">Nome no Perfil</label>
                        <input type="text" id="prof-page-input-name" value="${state.user.name}" style="width:100%;" placeholder="Seu nome" />
                      </div>
                      <div>
                        <label style="font-size:0.75rem; color:var(--text-secondary); font-weight:700; display:block; margin-bottom:4px;">@username</label>
                        <input type="text" id="prof-page-input-handle" value="${state.user.username}" style="width:100%;" placeholder="@miadinho" />
                      </div>
                    </div>

                    <div>
                      <label style="font-size:0.75rem; color:var(--text-secondary); font-weight:700; display:block; margin-bottom:4px;">Bio</label>
                      <textarea id="prof-page-input-bio" rows="2" style="width:100%;">${state.user.bio || ""}</textarea>
                    </div>

                    <div style="display:flex; gap:12px; flex-wrap:wrap;">
                      <button type="button" class="album-action-btn" id="btn-prof-upload-avatar-btn">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                        Trocar Foto do Perfil
                      </button>
                      <button type="button" class="album-action-btn" id="btn-prof-upload-banner-btn">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                        Trocar Imagem de Capa
                      </button>
                    </div>

                    <div id="prof-save-feedback-banner" style="display:none; padding:10px 14px; border-radius:10px; background-color:rgba(16, 185, 129, 0.16); border:1px solid rgba(16, 185, 129, 0.45); color:#6ee7b7; font-size:0.82rem; font-weight:700; align-items:center; gap:8px;">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><polyline points="20 6 9 17 4 12"/></svg>
                      <span>Alterações do perfil confirmadas e salvas com sucesso!</span>
                    </div>

                    <button type="button" class="btn-modal-confirm" id="prof-page-btn-save" style="width:100%; height:46px; display:flex; align-items:center; justify-content:center; gap:8px; font-size:0.92rem; font-weight:800;">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><polyline points="20 6 9 17 4 12"/></svg>
                      Confirmar e Salvar Alterações
                    </button>
                  </div>
                </div>
              ` : ""}

            </div>
          `;

          // Eventos de Navegação pelas Abas do Perfil
          this.scrollContainer.querySelectorAll("[data-prof-nav-tab]").forEach(tabBtn => {
            tabBtn.addEventListener("click", () => {
              const tab = tabBtn.dataset.profNavTab;
              this._activeProfileTab = tab;
              this.renderProfileView(targetUser);
            });
          });

          if (!isMe) {
            const btnBack = document.getElementById("btn-prof-back");
            if (btnBack) btnBack.addEventListener("click", () => this.historyBack());

            const btnFollowToggle = document.getElementById("btn-prof-follow-toggle");
            if (btnFollowToggle) {
              btnFollowToggle.addEventListener("click", () => {
                const nowFollowing = state.toggleFollowProfile(activeUser);
                showToast(nowFollowing ? `Você agora segue ${activeUser.username}!` : `Deixou de seguir ${activeUser.username}.`);
                this.renderProfileView(activeUser);
                this.renderRightSidebarBodyOnly();
              });
            }
          }

          if (isMe) {
            const btnBanner = document.getElementById("btn-prof-change-banner") || document.getElementById("btn-prof-upload-banner-btn");
            if (btnBanner) {
              btnBanner.addEventListener("click", () => {
                triggerImagePicker((dataUrl) => {
                  state.user.bannerUrl = dataUrl;
                  state.saveUser();
                  this.renderProfileView();
                  showToast("Capa do perfil atualizada!");
                });
              });
            }

            const btnAvatar = document.getElementById("btn-prof-change-avatar") || document.getElementById("btn-prof-upload-avatar-btn");
            if (btnAvatar) {
              btnAvatar.addEventListener("click", () => {
                triggerImagePicker((dataUrl) => {
                  state.user.avatarUrl = dataUrl;
                  state.saveUser();
                  this.syncHeaderUserUI();
                  this.renderProfileView();
                  showToast("Foto de perfil atualizada!");
                });
              });
            }

            this.scrollContainer.querySelectorAll("[data-prof-cat-idx]").forEach(card => {
              card.addEventListener("click", () => {
                const preset = CAT_AVATAR_PRESETS[parseInt(card.dataset.profCatIdx)];
                if (!preset) return;
                state.user.avatarUrl = preset.url;
                state.saveUser();
                this.syncHeaderUserUI();
                this.renderProfileView();
                showToast(`Gatinho "${preset.name}" aplicado!`);
              });
            });

            const btnSaveProfile = document.getElementById("prof-page-btn-save");
            if (btnSaveProfile) {
              btnSaveProfile.addEventListener("click", () => {
                const nameInp = document.getElementById("prof-page-input-name");
                const handleInp = document.getElementById("prof-page-input-handle");
                const bioInp = document.getElementById("prof-page-input-bio");
                if (nameInp && nameInp.value.trim()) state.user.name = nameInp.value.trim();
                if (handleInp && handleInp.value.trim()) {
                  const h = handleInp.value.trim();
                  state.user.username = h.startsWith("@") ? h : `@${h}`;
                }
                if (bioInp) state.user.bio = bioInp.value.trim();
                state.saveUser();
                state.createOrUpdateCommunityProfile({
                  name: state.user.name,
                  username: state.user.username,
                  bio: state.user.bio,
                  avatarUrl: state.user.avatarUrl
                }).catch(() => {});
                this.syncHeaderUserUI();
                const banner = document.getElementById("prof-save-feedback-banner");
                if (banner) banner.style.display = "flex";
                showToast("Perfil salvo com sucesso!");
              });
            }
          }

          // Clique em Artistas Seguidos -> abre discografia do artista
          this.scrollContainer.querySelectorAll("[data-prof-open-artist]").forEach(card => {
            card.addEventListener("click", (e) => {
              if (e.target.closest("[data-prof-follow-artist]")) return;
              this.navigateTo("artist", true, { artistName: card.dataset.profOpenArtist });
            });
          });

          // Botão Seguir/Deixar de Seguir Artista
          this.scrollContainer.querySelectorAll("[data-prof-follow-artist]").forEach(btn => {
            btn.addEventListener("click", (e) => {
              e.stopPropagation();
              const artName = btn.dataset.profFollowArtist;
              const artCover = btn.dataset.artistCover;
              const artRole = btn.dataset.artistRole;
              const nowFollowing = state.toggleFollowArtist({ name: artName, coverUrl: artCover, role: artRole });
              showToast(nowFollowing ? `Você agora segue ${artName}!` : `Deixou de seguir ${artName}.`);
              this.renderProfileView(targetUser);
              this.renderRightSidebarBodyOnly();
            });
          });

          // Clique em outro Usuário (Seguidores / Seguindo) -> navega para o perfil dele!
          this.scrollContainer.querySelectorAll("[data-prof-open-user]").forEach(card => {
            card.addEventListener("click", (e) => {
              if (e.target.closest("[data-prof-toggle-user-follow]")) return;
              const username = card.dataset.profOpenUser;
              const foundUser = (state.communityProfiles || []).find(p => p.username === username) ||
                                (state.friends || []).find(f => f.username === username) ||
                                { name: username.replace("@", ""), username, avatarUrl: CAT_AVATAR_PRESETS[1].url };
              this.navigateTo("profile", true, { targetUser: foundUser });
            });
          });

          this.scrollContainer.querySelectorAll("[data-prof-toggle-user-follow]").forEach(btn => {
            btn.addEventListener("click", (e) => {
              e.stopPropagation();
              const username = btn.dataset.profToggleUserFollow;
              const target = { username, name: username.replace("@", "") };
              const nowFollowing = state.toggleFollowProfile(target);
              showToast(nowFollowing ? `Você agora segue ${username}!` : `Deixou de seguir ${username}.`);
              this.renderProfileView(targetUser);
              this.renderRightSidebarBodyOnly();
            });
          });

          // Playlists no Perfil
          this.scrollContainer.querySelectorAll("[data-prof-card-pl]").forEach(card => {
            card.addEventListener("click", (e) => {
              if (e.target.closest("[data-prof-play-pl]") || e.target.closest("[data-prof-del-pl]")) return;
              this.navigateTo("playlist", true, { playlistId: card.dataset.profCardPl });
            });
          });

          this.scrollContainer.querySelectorAll("[data-prof-play-pl]").forEach(btn => {
            btn.addEventListener("click", (e) => {
              e.stopPropagation();
              const pl = (userPlaylists || []).find(p => p.id === btn.dataset.profPlayPl);
              if (pl && pl.tracks && pl.tracks.length > 0) {
                const plCover = pl.customCoverUrl || pl.coverUrl || pl.tracks[0].coverUrl;
                state.setQueue(pl.tracks, pl.tracks[0], false);
                engine.playTrack(pl.tracks[0], { id: pl.id, title: pl.name, artist: activeUser.name, coverUrl: plCover });
                this.renderRightSidebarBodyOnly();
              }
            });
          });

          this.scrollContainer.querySelectorAll("[data-prof-del-pl]").forEach(btn => {
            btn.addEventListener("click", (e) => {
              e.stopPropagation();
              const plId = btn.dataset.profDelPl;
              const removed = state.deletePlaylist(plId);
              if (removed) {
                this.renderSidebarPlaylists();
                this.renderProfileView();
                showToast(`Playlist "${removed.name}" apagada.`);
              }
            });
          });

          // Faixas Curtidas no Perfil
          this.scrollContainer.querySelectorAll("[data-prof-liked-row]").forEach(row => {
            row.addEventListener("click", (e) => {
              if (e.target.closest(".track-actions-col")) return;
              const idx = parseInt(row.dataset.profLikedRow);
              const tr = likedTracks[idx];
              if (tr) {
                state.setQueue(likedTracks, tr, state.isShuffle);
                engine.playTrack(tr, { id: "liked", title: "Músicas Curtidas", artist: tr.artist, coverUrl: tr.coverUrl });
                this.renderRightSidebarBodyOnly();
              }
            });
          });

          this.scrollContainer.querySelectorAll("[data-prof-unheart]").forEach(btn => {
            btn.addEventListener("click", (e) => {
              e.stopPropagation();
              const tr = likedTracks[parseInt(btn.dataset.profUnheart)];
              state.toggleLike(tr);
              engine.updateLikeButtonUI();
              this.renderProfileView(targetUser);
            });
          });

          this.scrollContainer.querySelectorAll("[data-prof-addpl]").forEach(btn => {
            btn.addEventListener("click", (e) => {
              e.stopPropagation();
              const tr = likedTracks[parseInt(btn.dataset.profAddpl)];
              this.openTrackOptionsModal(tr);
            });
          });
        }

        // ----------------------------------------------------------------------
        // RENDERIZAÇÃO DAS VIEWS
        // ----------------------------------------------------------------------
        renderHomeView() {
          const greeting = this.getGreeting();
          const activeFilter = ["all", "songs", "albums", "artists"].includes(state.activeHomeFilter)
            ? state.activeHomeFilter
            : "all";

          const filterOptions = [
            { id: "all", label: "Tudo" },
            { id: "songs", label: "Músicas" },
            { id: "albums", label: "Álbuns" },
            { id: "artists", label: "Artistas" }
          ];

          // Constrói os álbuns da Home a partir dos Charts em Tempo Real (/api/charts) ou dos artistas escolhidos no onboarding (sem os 6 álbuns hardcoded de Yung Lixo / Jão)
          const favArtistSet = new Set(
            [
              ...(Array.isArray(state.user.favoriteArtists) ? state.user.favoriteArtists : []),
              ...(Array.isArray(state.followedArtists) ? state.followedArtists.map(a => a.name) : [])
            ]
              .filter(Boolean)
              .map(n => n.toLowerCase().trim())
          );

          const chartNewReleases = (state.charts && Array.isArray(state.charts.newReleases) && state.charts.newReleases.length > 0)
            ? state.charts.newReleases.map((rel, idx) => ({
                id: rel.id || `chart_alb_${idx}`,
                dzAlbumId: String(rel.id || "").startsWith("dz_alb_") ? String(rel.id).replace("dz_alb_", "") : undefined,
                title: rel.title,
                artist: rel.artist,
                year: rel.releaseDate ? new Date(rel.releaseDate).getFullYear() || 2025 : 2025,
                coverUrl: ensureTrackCoverUrl(rel.coverUrl, rel.title, rel.artist),
                tracks: []
              }))
            : [];

          const baseCatalogWithoutHardcoded = state.albums.filter(a => {
            const id = String(a.id || "");
            if (id === "yung_lixo_flores" || id === "jao_super") {
              return favArtistSet.has(String(a.artist || "").toLowerCase().trim());
            }
            return true;
          }).map(a => ({
            ...a,
            coverUrl: ensureTrackCoverUrl(a.coverUrl, a.title, a.artist)
          }));

          const userFavAlbums = favArtistSet.size > 0
            ? baseCatalogWithoutHardcoded.filter(a => favArtistSet.has(String(a.artist || "").toLowerCase().trim()))
            : [];

          const homeAlbumsMap = new Map();
          [...userFavAlbums, ...chartNewReleases, ...(this.extraDiscoveredAlbums || []), ...baseCatalogWithoutHardcoded].forEach(alb => {
            if (!alb || !alb.title) return;
            const key = `${alb.title.toLowerCase().trim()}|${(alb.artist || "").toLowerCase().trim()}`;
            if (!homeAlbumsMap.has(key)) {
              homeAlbumsMap.set(key, {
                ...alb,
                coverUrl: ensureTrackCoverUrl(alb.coverUrl, alb.title, alb.artist)
              });
            }
          });
          const homeAlbumsPool = Array.from(homeAlbumsMap.values());
          this.homeAlbumsPool = homeAlbumsPool;

          const quickCards = homeAlbumsPool.slice(0, 6);
          const newReleasesAlbums = homeAlbumsPool.slice(0, activeFilter === "albums" ? Math.max(18, homeAlbumsPool.length) : Math.max(12, homeAlbumsPool.length));
          const globalAlbums = [];

          const chartSongs = (state.charts && Array.isArray(state.charts.topSongs) && state.charts.topSongs.length > 0)
            ? state.charts.topSongs
            : [];

          const globalTopTracks = [];
          [...chartSongs, ...(this.extraDiscoveredSongs || [])].forEach(tr => {
            if (tr && tr.title && !globalTopTracks.some(x => normalizeTrackKey(x) === normalizeTrackKey(tr))) {
              globalTopTracks.push({
                ...tr,
                coverUrl: ensureTrackCoverUrl(tr, tr.title, tr.artist),
                streamUrl: toProxyStreamUrl(tr.streamUrl || "", tr.title, tr.artist, true)
              });
            }
          });
          baseCatalogWithoutHardcoded.slice(0, 8).forEach(alb => {
            if (alb.tracks && alb.tracks[0] && globalTopTracks.length < 16) {
              const tr0 = alb.tracks[0];
              if (!globalTopTracks.some(x => normalizeTrackKey(x) === normalizeTrackKey(tr0))) {
                globalTopTracks.push({
                  ...tr0,
                  coverUrl: ensureTrackCoverUrl(tr0, tr0.title, tr0.artist, alb.coverUrl),
                  albumObj: alb
                });
              }
            }
          });

          // "Artistas do Momento" baseados nos Charts Reais + Descobertas Infinitas
          const chartArtistsRaw = [
            ...((state.charts && Array.isArray(state.charts.top100Artists) && state.charts.top100Artists.length > 0)
              ? state.charts.top100Artists
              : []),
            ...(this.extraDiscoveredArtists || []),
            ...POPULAR_ARTISTS_DIRECTORY.filter(a => a.name.toLowerCase() !== "yung lixo")
          ];
          const seenChartNames = new Set();
          const homeArtistsList = [];
          chartArtistsRaw.forEach(art => {
            if (!art || !art.name) return;
            const key = art.name.toLowerCase().trim();
            if (key === "yung lixo" || seenChartNames.has(key)) return;
            seenChartNames.add(key);
            homeArtistsList.push({
              name: art.name,
              role: art.role || "Artista",
              coverUrl: ensureArtistAvatarUrl(art)
            });
          });

          // "Seus Artistas Favoritos" e "Feito Para Você" aparecem apenas se o usuário já escolheu favoritos ou ouviu músicas
          const userHasPersonalTaste =
            (Array.isArray(state.user.favoriteArtists) && state.user.favoriteArtists.length > 0) ||
            (Array.isArray(state.followedArtists) && state.followedArtists.length > 0) ||
            (Array.isArray(state.recentHistory) && state.recentHistory.length > 0);

          const recSongsFromAlgo = state.recommendations && (state.recommendations.recommendedSongs || state.recommendations.recommendedTracks);
          const algoTracks = (Array.isArray(recSongsFromAlgo) && recSongsFromAlgo.length > 0)
            ? deduplicateTracks(recSongsFromAlgo)
            : [];

          this.homeGlobalTopTracks = globalTopTracks;
          this.homeAlgoTracks = algoTracks;

          this.homeTopTracksLimit = this.homeTopTracksLimit || 30;
          this.homeAlgoTracksLimit = this.homeAlgoTracksLimit || 30;

          const visibleTopTracks = globalTopTracks.slice(0, this.homeTopTracksLimit);
          const hasMoreTopTracks = globalTopTracks.length > this.homeTopTracksLimit;

          const visibleAlgoTracks = algoTracks.slice(0, this.homeAlgoTracksLimit);
          const hasMoreAlgoTracks = algoTracks.length > this.homeAlgoTracksLimit;

          const showArtistsSection = activeFilter === "all" || activeFilter === "artists";
          const showAlbumsSection = activeFilter === "all" || activeFilter === "albums";
          const showSongsSection = activeFilter === "all" || activeFilter === "songs";

          this.scrollContainer.innerHTML = `
            <div class="greeting-header">
              <div>
                <h1 class="greeting-title">${greeting}${state.user.name && state.user.name !== "Visitante" ? `, ${state.user.name}` : ""}</h1>
              </div>
            </div>

            <!-- Filtros Limpos Estilo Spotify / Apple Music -->
            <div class="category-carousel-wrapper">
              <div class="category-pills-row" id="home-category-pills-row">
                ${filterOptions.map(f => `
                  <button class="category-pill ${activeFilter === f.id ? 'active' : ''}" data-home-filter="${f.id}">
                    ${f.label}
                  </button>
                `).join("")}
              </div>
            </div>

            ${showAlbumsSection && activeFilter === "all" ? `
              <div class="quick-grid-3x2">
                ${quickCards.map(album => `
                  <div class="quick-card" data-album-id="${album.id}">
                    <img class="quick-card-img" data-album-img="${album.id}" src="${album.coverUrl}" alt="${album.title}" referrerpolicy="no-referrer" onerror="window.handleImgError(this, '${album.title.replace(/'/g, "")}', '${album.artist.replace(/'/g, "")}')" />
                    <div class="quick-card-info">
                      <div class="quick-card-title">${album.title}</div>
                      <div class="quick-card-artist">${album.artist}</div>
                    </div>
                    <button class="quick-play-btn" data-play-album-id="${album.id}" title="Tocar ${album.title}">
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>
                    </button>
                  </div>
                `).join("")}
              </div>
            ` : ""}

            ${showArtistsSection ? `
              <section class="showcase-section" style="margin-bottom:28px;">
                <div class="section-head">
                  <h2 class="section-title">Artistas do Momento</h2>
                </div>
                <div class="artist-bubbles-grid" id="home-artists-infinite-grid">
                  ${homeArtistsList.slice(0, activeFilter === "artists" ? Math.max(24, homeArtistsList.length) : Math.max(12, Math.min(24, homeArtistsList.length))).map(art => `
                    <div class="artist-bubble-card" data-open-artist="${art.name}">
                      <div class="artist-avatar-wrap shimmer">
                        <img class="artist-bubble-img" data-artist-bubble-img="${art.name}" src="${art.coverUrl}" alt="${art.name}" referrerpolicy="no-referrer" onload="this.classList.add('loaded'); this.parentElement.classList.remove('shimmer');" onerror="window.handleImgError(this, '${art.name.replace(/'/g, "")}', 'Artista')" />
                        <button type="button" class="floating-artist-play" data-play-artist="${art.name}" title="Tocar ${art.name}">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>
                        </button>
                      </div>
                      <div class="artist-bubble-info">
                        <div class="artist-bubble-name">${art.name}</div>
                        <div class="artist-bubble-sub">${art.role || "Artista"}</div>
                      </div>
                    </div>
                  `).join("")}
                </div>
              </section>
            ` : ""}

            ${showAlbumsSection ? `
              <section class="showcase-section">
                <div class="section-head">
                  <h2 class="section-title">Álbuns em Alta</h2>
                </div>
                <div class="cards-grid-albums home-albums-grid-3rows" id="home-albums-infinite-grid">
                  ${newReleasesAlbums.concat(globalAlbums.filter(g => !newReleasesAlbums.includes(g))).map(album => `
                    <div class="album-card" data-album-id="${album.id}">
                      <div class="album-cover-wrap">
                        <img class="album-cover-img" data-album-img="${album.id}" src="${album.coverUrl}" alt="${album.title}" referrerpolicy="no-referrer" onerror="window.handleImgError(this, '${album.title.replace(/'/g, "")}', '${album.artist.replace(/'/g, "")}')" />
                        <button class="floating-card-play" data-play-album-id="${album.id}" title="Tocar ${album.title}">
                          <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>
                        </button>
                      </div>
                      <div class="album-card-title">${album.title}</div>
                      <div class="album-card-sub">${album.artist}</div>
                    </div>
                  `).join("")}
                </div>
              </section>
            ` : ""}

            ${showSongsSection ? `
              <section class="showcase-section">
                <div class="section-head">
                  <h2 class="section-title">Músicas em Alta</h2>
                </div>
                <div class="tracklist-table" id="home-songs-infinite-table">
                  ${visibleTopTracks.map((track, idx) => {
                    const isLiked = state.isLiked(track);
                    const tKey = normalizeTrackKey(track);
                    const safeTitle = String(track.title || "").replace(/"/g, "&quot;");
                    const safeArtist = String(track.artist || "").replace(/"/g, "&quot;");
                    const likeTip = isLiked ? "Remover das Músicas Curtidas" : "Curtir faixa";
                    return `
                    <div class="track-row ${state.currentTrack && (String(state.currentTrack.id) === String(track.id) || normalizeTrackKey(state.currentTrack) === tKey) ? 'playing' : ''}" data-home-top-idx="${idx}" data-track-id="${track.id}" data-track-key="${tKey}">
                      <div class="track-num-col">
                        <span>${idx + 1}</span>
                      </div>
                      <img class="track-row-cover" src="${ensureTrackCoverUrl(track)}" alt="${track.title}" referrerpolicy="no-referrer" onerror="window.handleImgError(this, '${track.title.replace(/'/g, "")}', '${track.artist.replace(/'/g, "")}')" />
                      <div class="track-info-col">
                        <div class="track-title">${track.title}</div>
                        <div class="track-artist">${track.artist}${track.albumTitle ? ` · ${track.albumTitle}` : ""}</div>
                      </div>
                      <div class="track-duration-col">${track.duration || "3:30"}</div>
                      <div class="track-actions-col">
                        <button class="track-icon-btn btn-add-queue-direct" data-quick-queue-btn data-home-queue-idx="${idx}" title="Adicionar à fila" aria-label="Adicionar à fila">
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M4 6h16M4 12h10M4 18h10M18 15v6m3-3h-6"/></svg>
                        </button>
                        <button class="track-icon-btn ${isLiked ? 'liked' : ''}" data-home-like-idx="${idx}" data-like-track-key="${tKey}" data-like-track-id="${track.id}" data-like-track-title="${safeTitle}" data-like-track-artist="${safeArtist}" data-tooltip="${likeTip}" title="${likeTip}" aria-label="${likeTip}">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="${isLiked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
                        </button>
                        <button class="track-icon-btn" data-home-addpl-idx="${idx}" title="Adicionar à Playlist" aria-label="Adicionar à Playlist">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        </button>
                        <button class="track-icon-btn" data-home-share-idx="${idx}" title="Compartilhar" aria-label="Compartilhar">
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                        </button>
                      </div>
                    </div>
                  `;
                  }).join("")}
                </div>
                ${hasMoreTopTracks ? `
                  <div style="text-align:center; padding:14px 0 22px 0;">
                    <button type="button" id="btn-load-more-top-tracks" style="background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.15); color:#fff; border-radius:24px; padding:10px 24px; font-size:0.84rem; font-weight:600; cursor:pointer;">
                      + Carregar Mais Músicas (${Math.min(30, globalTopTracks.length - this.homeTopTracksLimit)} restantes)
                    </button>
                  </div>
                ` : ""}
              </section>
            ` : ""}

            ${showSongsSection && userHasPersonalTaste && algoTracks.length > 0 ? `
              <section class="showcase-section">
                <div class="section-head">
                  <h2 class="section-title">Feito Para Você</h2>
                  <button class="btn-see-all" id="btn-refresh-recommendations">Atualizar</button>
                </div>
                <div class="tracklist-table">
                  ${visibleAlgoTracks.map((track, idx) => {
                    const isLiked = state.isLiked(track);
                    const tKey = normalizeTrackKey(track);
                    const safeTitle = String(track.title || "").replace(/"/g, "&quot;");
                    const safeArtist = String(track.artist || "").replace(/"/g, "&quot;");
                    const likeTip = isLiked ? "Remover das Músicas Curtidas" : "Curtir faixa";
                    return `
                    <div class="track-row ${state.currentTrack && (String(state.currentTrack.id) === String(track.id) || normalizeTrackKey(state.currentTrack) === tKey) ? 'playing' : ''}" data-home-algo-idx="${idx}" data-track-id="${track.id}" data-track-key="${tKey}">
                      <div class="track-num-col">
                        <span>${idx + 1}</span>
                      </div>
                      <img class="track-row-cover" src="${ensureTrackCoverUrl(track)}" alt="${track.title}" referrerpolicy="no-referrer" onerror="window.handleImgError(this, '${String(track.title || "").replace(/'/g, "")}', '${String(track.artist || "").replace(/'/g, "")}')" />
                      <div class="track-info-col">
                        <div class="track-title">${track.title}</div>
                        <div class="track-artist">${track.artist}</div>
                      </div>
                      <div class="track-duration-col">${track.duration || "3:40"}</div>
                      <div class="track-actions-col">
                        <button class="track-icon-btn btn-add-queue-direct" data-quick-queue-btn data-home-algo-queue="${idx}" title="Adicionar à fila" aria-label="Adicionar à fila">
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M4 6h16M4 12h10M4 18h10M18 15v6m3-3h-6"/></svg>
                        </button>
                        <button class="track-icon-btn ${isLiked ? 'liked' : ''}" data-home-algo-like="${idx}" data-like-track-key="${tKey}" data-like-track-id="${track.id}" data-like-track-title="${safeTitle}" data-like-track-artist="${safeArtist}" data-tooltip="${likeTip}" title="${likeTip}" aria-label="${likeTip}">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="${isLiked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
                        </button>
                        <button class="track-icon-btn" data-home-algo-addpl="${idx}" title="Adicionar à Playlist" aria-label="Adicionar à Playlist">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        </button>
                        <button class="track-icon-btn" data-home-algo-share="${idx}" title="Compartilhar" aria-label="Compartilhar">
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                        </button>
                      </div>
                    </div>
                  `;
                  }).join("")}
                </div>
                ${hasMoreAlgoTracks ? `
                  <div style="text-align:center; padding:14px 0 22px 0;">
                    <button type="button" id="btn-load-more-algo-tracks" style="background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.15); color:#fff; border-radius:24px; padding:10px 24px; font-size:0.84rem; font-weight:600; cursor:pointer;">
                      + Carregar Mais Recomendações (${Math.min(30, algoTracks.length - this.homeAlgoTracksLimit)} restantes)
                    </button>
                  </div>
                ` : ""}
              </section>
            ` : ""}

            ${showAlbumsSection && state.playlists.length > 0 ? `
              <section class="showcase-section">
                <div class="section-head">
                  <h2 class="section-title">Suas Playlists</h2>
                </div>
                <div class="cards-row-scroll">
                  ${state.playlists.map(pl => {
                    const plCover = pl.customCoverUrl || pl.coverUrl || (pl.tracks[0] && pl.tracks[0].coverUrl) || INITIAL_ALBUMS[0].coverUrl;
                    return `
                      <div class="album-card" data-home-pl-id="${pl.id}">
                        <div class="album-cover-wrap">
                          <img class="album-cover-img" src="${plCover}" alt="${pl.name}" referrerpolicy="no-referrer" onerror="window.handleImgError(this, '${pl.name.replace(/'/g, "")}', 'Playlist')" />
                          <button class="floating-card-play" data-play-pl-id="${pl.id}" title="Tocar ${pl.name}">
                            <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>
                          </button>
                        </div>
                        <div class="album-card-title">${pl.name}</div>
                        <div class="album-card-sub">${pl.tracks.length} músicas</div>
                      </div>
                    `;
                  }).join("")}
                </div>
              </section>
            ` : ""}

            <div class="infinite-scroll-sentinel" id="home-infinite-status">
              <span>Role para baixo para descobrir mais artistas, álbuns e músicas</span>
            </div>
          `;

          const btnRefreshRecs = document.getElementById("btn-refresh-recommendations");
          if (btnRefreshRecs) {
            btnRefreshRecs.addEventListener("click", async () => {
              btnRefreshRecs.textContent = "Atualizando...";
              await state.fetchRecommendations();
              this.renderHomeView();
            });
          }

          const btnLoadMoreTop = document.getElementById("btn-load-more-top-tracks");
          if (btnLoadMoreTop) {
            btnLoadMoreTop.addEventListener("click", () => {
              this.homeTopTracksLimit = (this.homeTopTracksLimit || 30) + 30;
              this.renderHomeView();
            });
          }

          const btnLoadMoreAlgo = document.getElementById("btn-load-more-algo-tracks");
          if (btnLoadMoreAlgo) {
            btnLoadMoreAlgo.addEventListener("click", () => {
              this.homeAlgoTracksLimit = (this.homeAlgoTracksLimit || 30) + 30;
              this.renderHomeView();
            });
          }

          this.scrollContainer.querySelectorAll("[data-home-filter]").forEach(btn => {
            btn.addEventListener("click", () => {
              state.activeHomeFilter = btn.dataset.homeFilter;
              this.renderHomeView();
            });
          });

          this.scrollContainer.querySelectorAll("[data-album-id]").forEach(card => {
            card.addEventListener("click", (e) => {
              if (e.target.closest("[data-play-album-id]")) return;
              const albId = card.dataset.albumId;
              const alb = (this.homeAlbumsPool || []).find(a => a.id === albId) || state.albums.find(a => a.id === albId);
              this.navigateTo("album", true, { albumId: albId, customAlbum: alb });
            });
          });

          this.scrollContainer.querySelectorAll("[data-play-album-id]").forEach(btn => {
            btn.addEventListener("click", async (e) => {
              e.stopPropagation();
              const albId = btn.dataset.playAlbumId;
              const alb = (this.homeAlbumsPool || []).find(a => a.id === albId) || state.albums.find(a => a.id === albId);
              if (!alb) return;
              if (!Array.isArray(alb.tracks) || alb.tracks.length === 0) {
                const details = await MiadoMusicResolver.fetchAlbumDetails(alb);
                if (details && Array.isArray(details.tracks) && details.tracks.length > 0) {
                  alb.tracks = deduplicateTracks(details.tracks);
                }
              }
              if (alb.tracks && alb.tracks.length > 0) {
                state.queue = [...alb.tracks];
                state.queueIndex = 0;
                engine.playTrack(alb.tracks[0], alb);
                this.renderRightSidebarBodyOnly();
              }
            });
          });

          this.scrollContainer.querySelectorAll("[data-home-algo-idx]").forEach(row => {
            row.addEventListener("click", (e) => {
              if (e.target.closest(".track-actions-col")) return;
              const idx = parseInt(row.dataset.homeAlgoIdx);
              const item = algoTracks[idx];
              if (item) {
                state.queue = algoTracks.map(t => ({ ...t }));
                state.queueIndex = idx;
                engine.playTrack(item, item.albumObj || state.currentAlbum);
                this.renderRightSidebarBodyOnly();
              }
            });
          });

          this.scrollContainer.querySelectorAll("[data-home-algo-like]").forEach(btn => {
            btn.addEventListener("click", (e) => {
              e.stopPropagation();
              const item = algoTracks[parseInt(btn.dataset.homeAlgoLike)];
              if (item) {
                const nowLiked = state.toggleLike(item);
                btn.classList.remove("liked-pop");
                void btn.offsetWidth;
                if (nowLiked) btn.classList.add("liked-pop");
                engine.updateLikeButtonUI();
                this.syncAllLikeButtonsInDOM();
              }
            });
          });

          this.scrollContainer.querySelectorAll("[data-home-algo-addpl]").forEach(btn => {
            btn.addEventListener("click", (e) => {
              e.stopPropagation();
              const item = algoTracks[parseInt(btn.dataset.homeAlgoAddpl)];
              if (item) {
                this.openTrackOptionsModal(item, item.albumObj || state.currentAlbum);
              }
            });
          });

          this.scrollContainer.querySelectorAll("[data-home-algo-share]").forEach(btn => {
            btn.addEventListener("click", (e) => {
              e.stopPropagation();
              const item = algoTracks[parseInt(btn.dataset.homeAlgoShare)];
              if (item) {
                this.shareTrack(item, item.albumObj || state.currentAlbum);
              }
            });
          });

          this.scrollContainer.querySelectorAll("[data-home-top-idx]").forEach(row => {
            row.addEventListener("click", (e) => {
              if (e.target.closest(".track-actions-col")) return;
              const idx = parseInt(row.dataset.homeTopIdx);
              const item = globalTopTracks[idx];
              if (item) {
                state.queue = globalTopTracks.map(t => ({ ...t }));
                state.queueIndex = idx;
                engine.playTrack(item, item.albumObj || state.currentAlbum);
                this.renderRightSidebarBodyOnly();
              }
            });
          });

          this.scrollContainer.querySelectorAll("[data-home-like-idx]").forEach(btn => {
            btn.addEventListener("click", (e) => {
              e.stopPropagation();
              const item = globalTopTracks[parseInt(btn.dataset.homeLikeIdx)];
              if (item) {
                const nowLiked = state.toggleLike(item);
                btn.classList.remove("liked-pop");
                void btn.offsetWidth;
                if (nowLiked) btn.classList.add("liked-pop");
                engine.updateLikeButtonUI();
                this.syncAllLikeButtonsInDOM();
              }
            });
          });

          this.scrollContainer.querySelectorAll("[data-home-addpl-idx]").forEach(btn => {
            btn.addEventListener("click", (e) => {
              e.stopPropagation();
              const item = globalTopTracks[parseInt(btn.dataset.homeAddplIdx)];
              if (item) {
                this.openTrackOptionsModal(item, item.albumObj);
              }
            });
          });

          this.scrollContainer.querySelectorAll("[data-home-share-idx]").forEach(btn => {
            btn.addEventListener("click", (e) => {
              e.stopPropagation();
              const item = globalTopTracks[parseInt(btn.dataset.homeShareIdx)];
              if (item) {
                this.shareTrack(item, item.albumObj);
              }
            });
          });

          this.scrollContainer.querySelectorAll("[data-play-artist]").forEach(btn => {
            btn.addEventListener("click", async (e) => {
              e.stopPropagation();
              const artName = btn.dataset.playArtist;
              if (!artName) return;
              showToast(`Carregando músicas de ${artName}...`);
              const prof = await MiadoMusicResolver.fetchArtistProfile(artName);
              if (prof && Array.isArray(prof.songs) && prof.songs.length > 0) {
                state.queue = [...prof.songs];
                state.queueIndex = 0;
                engine.playTrack(prof.songs[0], { id: `art_${artName}`, title: artName, artist: artName, coverUrl: prof.songs[0].coverUrl });
                this.renderRightSidebarBodyOnly();
              } else {
                this.navigateTo("artist", true, { artistName: artName });
              }
            });
          });

          this.scrollContainer.querySelectorAll("[data-open-artist]").forEach(card => {
            card.addEventListener("click", (e) => {
              if (e.target.closest("[data-play-artist]")) return;
              this.navigateTo("artist", true, { artistName: card.dataset.openArtist });
            });
          });

          this.scrollContainer.querySelectorAll("[data-home-pl-id]").forEach(card => {
            card.addEventListener("click", (e) => {
              if (e.target.closest("[data-play-pl-id]")) return;
              this.navigateTo("playlist", true, { playlistId: card.dataset.homePlId });
            });
          });

          this.scrollContainer.querySelectorAll("[data-play-pl-id]").forEach(btn => {
            btn.addEventListener("click", (e) => {
              e.stopPropagation();
              const pl = state.playlists.find(p => p.id === btn.dataset.playPlId);
              if (pl && pl.tracks.length > 0) {
                state.queue = [...pl.tracks];
                state.queueIndex = 0;
                engine.playTrack(pl.tracks[0], { id: pl.id, title: pl.name, artist: "Playlist", coverUrl: pl.tracks[0].coverUrl });
                this.renderRightSidebarBodyOnly();
              }
            });
          });
        }

        async renderAlbumView(albumId, customAlbum = null) {
          let album = customAlbum || state.albums.find(a => a.id === albumId) || state.albums[0];
          state.currentAlbum = album;
          const albumCustomKey = state.getAlbumKey(album);
          const hasCustomAlbumCover = Boolean(state.customAlbumCovers && state.customAlbumCovers[albumCustomKey]);
          if (hasCustomAlbumCover) {
            album.coverUrl = state.customAlbumCovers[albumCustomKey];
          }

          if ((!album.tracks || album.tracks.length < 4 || !album._studioOrderVerified) && (album.collectionId || album.dzAlbumId || album.searchQuery || album.title)) {
            if (!album.tracks || album.tracks.length < 4) {
              this.scrollContainer.innerHTML = `<div style="padding:40px; text-align:center; color:var(--text-secondary);">Carregando faixas oficiais na ordem de estúdio e capa 1000x1000 HD do álbum...</div>`;
            }
            try {
              const details = await MiadoMusicResolver.fetchAlbumDetails(album);
              if (details && Array.isArray(details.tracks) && details.tracks.length >= 4) {
                album.tracks = MiadoMusicResolver.filterStudioOnlyTracks(details.tracks);
                album._studioOrderVerified = true;
                if (details.coverUrl && !hasCustomAlbumCover && (!album.coverUrl || album.coverUrl.startsWith("data:"))) {
                  album.coverUrl = details.coverUrl;
                }
                if (details.year) album.year = details.year;
                if (details.genre) album.genre = details.genre;
                if (details.releaseDate) album.releaseDate = details.releaseDate;
              } else if (!album.tracks || album.tracks.length === 0) {
                const q = album.searchQuery || `${album.artist} ${album.title}`;
                const res = await MiadoMusicResolver.searchCatalog(q);
                if (res.songs && res.songs.length > 0) {
                  album.tracks = MiadoMusicResolver.filterStudioOnlyTracks(res.songs);
                  if (!hasCustomAlbumCover && (!album.coverUrl || album.coverUrl.startsWith("data:"))) {
                    album.coverUrl = res.songs[0].coverUrl;
                  }
                }
              }
            } catch (e) {}
          }

          if (hasCustomAlbumCover) {
            album.coverUrl = state.customAlbumCovers[albumCustomKey];
          }

          if (Array.isArray(album.tracks) && album.tracks.length > 0) {
            album.tracks = MiadoMusicResolver.filterStudioOnlyTracks(album.tracks);
          }

          let totalSec = 0;
          (album.tracks || []).forEach(t => {
            const parts = String(t.duration || "3:45").split(":");
            if (parts.length === 2) {
              totalSec += (parseInt(parts[0]) || 3) * 60 + (parseInt(parts[1]) || 0);
            }
          });
          const totalMinutes = Math.max(1, Math.round(totalSec / 60));

          this.scrollContainer.innerHTML = `
            <div class="album-view-container">
              <!-- Blur radial da própria capa do álbum no topo para iluminar o Liquid Glass -->
              <div class="album-ambient-glow" style="background-image: url('${album.coverUrl}');"></div>

              <div class="album-view-top-actions">
                <button class="back-btn-pill" id="btn-album-back" style="color:#a855f7;">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
                  Voltar
                </button>
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                  <button type="button" class="back-btn-pill" id="btn-album-pick-cover-top" title="Colocar capa personalizada da galeria neste álbum">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                    Capa da Galeria
                  </button>
                  ${hasCustomAlbumCover ? `
                    <button class="back-btn-pill" id="btn-album-reset-cover" style="color:#f87171; border-color:rgba(248,113,113,0.4);" title="Restaurar capa original do álbum">
                      Restaurar Capa
                    </button>
                  ` : ""}
                  <button class="back-btn-pill" id="btn-album-save-lib" title="Adicionar álbum à biblioteca">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  </button>
                  <button class="back-btn-pill" id="btn-album-more-opts" title="Mais opções do álbum">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
                  </button>
                </div>
              </div>

              <div class="album-hero-center">
                <div style="position:relative; display:inline-block;">
                  <img class="album-hero-artwork" id="album-hero-artwork-img" src="${album.coverUrl}" alt="${album.title}" referrerpolicy="no-referrer" onerror="window.handleImgError(this, '${album.title.replace(/'/g, "")}', '${album.artist.replace(/'/g, "")}')" />
                  <button type="button" id="btn-album-pick-cover-badge" title="Alterar capa do álbum com imagem da galeria" style="position:absolute; right:10px; bottom:28px; background:rgba(10,8,18,0.86); border:1px solid rgba(168,85,247,0.65); color:#ffffff; border-radius:999px; padding:6px 12px; font-size:0.74rem; font-weight:700; display:flex; align-items:center; gap:6px; cursor:pointer; backdrop-filter:blur(10px);">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    Trocar Capa
                  </button>
                </div>
                <h1 class="album-hero-title">${album.title}</h1>
                <div class="album-hero-artist" id="btn-album-artist-link">${album.artist}</div>
                <div class="album-meta-line">${(album.genre || "POP").toUpperCase()} · ${album.year || 2024} · ${(album.tracks || []).length} MÚSICAS</div>

                <div class="album-action-buttons" style="flex-wrap:wrap; margin-top:14px;">
                  <button class="album-action-btn primary" id="btn-album-play-all">
                    <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>
                    Play
                  </button>
                  <button class="album-action-btn" id="btn-album-shuffle-all">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 3h5v5"/><path d="M4 20L21 3"/><path d="M21 16v5h-5"/><path d="M15 15l6 6"/><path d="M4 4l5 5"/></svg>
                    Aleatório
                  </button>
                  <button type="button" class="album-action-btn" id="btn-album-pick-cover-hero">
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                    Capa da Galeria
                  </button>
                </div>
              </div>

              <div class="tracklist-table">
                ${(album.tracks || []).map((track, idx) => {
                  const isLiked = state.isLiked(track);
                  const tKey = normalizeTrackKey(track);
                  const safeTitle = String(track.title || "").replace(/"/g, "&quot;");
                  const safeArtist = String(track.artist || "").replace(/"/g, "&quot;");
                  const likeTip = isLiked ? "Remover das Músicas Curtidas" : "Curtir faixa — salvar em Músicas Curtidas";
                  return `
                  <div class="track-row ${state.currentTrack && (String(state.currentTrack.id) === String(track.id) || normalizeTrackKey(state.currentTrack) === tKey) ? 'playing' : ''}" data-track-idx="${idx}" data-track-id="${track.id}" data-track-key="${tKey}">
                    <div class="track-num-col">
                      ${track.popular ? `<span class="popular-star" title="Faixa Popular"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></span>` : `<span style="width:10px; display:inline-block;"></span>`}
                      <span>${idx + 1}</span>
                    </div>
                    <img class="track-row-cover" src="${ensureTrackCoverUrl(track, track.title, track.artist, album.coverUrl)}" alt="${track.title}" referrerpolicy="no-referrer" onerror="window.handleImgError(this, '${track.title.replace(/'/g, "")}', '${track.artist.replace(/'/g, "")}')" />
                    <div class="track-info-col">
                      <div class="track-title">${track.title}</div>
                      <div class="track-artist">${track.artist}</div>
                    </div>
                    <div class="track-duration-col">${track.duration}</div>
                    <div class="track-actions-col">
                      <button class="track-icon-btn btn-add-queue-direct" data-quick-queue-btn data-alb-queue-idx="${idx}" title="Adicionar à fila" aria-label="Adicionar à fila">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M4 6h16M4 12h10M4 18h10M18 15v6m3-3h-6"/></svg>
                      </button>
                      <button class="track-icon-btn ${isLiked ? 'liked' : ''}" data-like-idx="${idx}" data-like-track-key="${tKey}" data-like-track-id="${track.id}" data-like-track-title="${safeTitle}" data-like-track-artist="${safeArtist}" data-tooltip="${likeTip}" title="${likeTip}" aria-label="${likeTip}">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="${isLiked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
                      </button>
                      <button class="track-icon-btn" data-add-pl-idx="${idx}" data-tooltip="Adicionar à Playlist ou Criar Nova" title="Adicionar à Playlist ou Criar Nova" aria-label="Adicionar à Playlist ou Criar Nova">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      </button>
                      <button class="track-icon-btn" data-share-idx="${idx}" data-tooltip="Compartilhar no Feed Miau & Copiar Link" title="Compartilhar no Feed Miau & Copiar Link" aria-label="Compartilhar no Feed Miau & Copiar Link">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                      </button>
                    </div>
                  </div>
                `;
                }).join("")}
              </div>

              <div class="album-footer-meta">
                <div>${album.releaseDate || `Lançado em ${album.year || 2024}`}</div>
                <div>${(album.tracks || []).length} músicas, ${totalMinutes} minutos</div>
                <div>${album.label || `℗ ${album.year || 2024} Universal Music / Interscope Records`}</div>
              </div>
            </div>
          `;

          document.getElementById("btn-album-back").addEventListener("click", () => this.historyBack());
          document.getElementById("btn-album-artist-link").addEventListener("click", () => {
            this.navigateTo("artist", true, { artistName: album.artist });
          });

          const handlePickAlbumCover = () => {
            triggerImagePicker((dataUrl) => {
              state.setCustomAlbumCover(album, dataUrl);
              album.coverUrl = dataUrl;
              this.renderAlbumView(album.id, album);
              showToast(`Capa personalizada aplicada ao álbum "${album.title}"!`);
            });
          };

          const btnCoverTop = document.getElementById("btn-album-pick-cover-top");
          if (btnCoverTop) btnCoverTop.addEventListener("click", handlePickAlbumCover);
          const btnCoverBadge = document.getElementById("btn-album-pick-cover-badge");
          if (btnCoverBadge) btnCoverBadge.addEventListener("click", handlePickAlbumCover);
          const btnCoverHero = document.getElementById("btn-album-pick-cover-hero");
          if (btnCoverHero) btnCoverHero.addEventListener("click", handlePickAlbumCover);

          const btnResetAlbumCover = document.getElementById("btn-album-reset-cover");
          if (btnResetAlbumCover) {
            btnResetAlbumCover.addEventListener("click", () => {
              state.removeCustomAlbumCover(album);
              album.coverUrl = `/api/cover?title=${encodeURIComponent(album.title)}&artist=${encodeURIComponent(album.artist)}`;
              this.renderAlbumView(album.id, album);
              showToast("Capa original do álbum restaurada!");
            });
          }

          document.getElementById("btn-album-save-lib").addEventListener("click", () => {
            const newPl = {
              id: `pl_alb_${Date.now()}`,
              name: `${album.title} - ${album.artist}`,
              description: "Álbum completo salvo na biblioteca",
              isCollaborative: false,
              collaborators: [state.user.username],
              customCoverUrl: hasCustomAlbumCover ? album.coverUrl : undefined,
              coverUrl: album.coverUrl,
              tracks: (album.tracks || []).map(t => ({
                ...t,
                coverUrl: ensureTrackCoverUrl(t, t.title, t.artist, album.coverUrl),
                addedBy: { username: state.user.username, avatar: state.user.avatarUrl }
              }))
            };
            state.playlists.push(newPl);
            state.savePlaylists();
            this.renderSidebarPlaylists();
            showToast(`Álbum "${album.title}" salvo na Sua Biblioteca!`);
          });

          document.getElementById("btn-album-more-opts").addEventListener("click", () => {
            if (album.tracks && album.tracks[0]) {
              this.openTrackOptionsModal(album.tracks[0], album);
            }
          });

          document.getElementById("btn-album-play-all").addEventListener("click", () => {
            if (!album.tracks || !album.tracks.length) return;
            const first = state.setQueue(album.tracks, album.tracks[0], false);
            engine.playTrack(first || album.tracks[0], album);
            this.renderRightSidebarBodyOnly();
          });

          document.getElementById("btn-album-shuffle-all").addEventListener("click", () => {
            if (!album.tracks || !album.tracks.length) return;
            const picked = state.setQueue(album.tracks, null, true);
            showToast("Reproduzindo álbum em Modo Aleatório!");
            engine.playTrack(picked || state.queue[0], album);
            this.renderRightSidebarBodyOnly();
          });

          this.scrollContainer.querySelectorAll(".track-row").forEach(row => {
            row.addEventListener("click", (e) => {
              if (e.target.closest(".track-actions-col")) return;
              const idx = parseInt(row.dataset.trackIdx);
              const track = album.tracks[idx];
              if (track) {
                state.setQueue(album.tracks, track, state.isShuffle);
                engine.playTrack(track, album);
                this.renderRightSidebarBodyOnly();
              }
            });
          });

          this.scrollContainer.querySelectorAll("[data-like-idx]").forEach(btn => {
            btn.addEventListener("click", (e) => {
              e.stopPropagation();
              const track = album.tracks[parseInt(btn.dataset.likeIdx)];
              const nowLiked = state.toggleLike(track);
              btn.classList.remove("liked-pop");
              void btn.offsetWidth;
              if (nowLiked) btn.classList.add("liked-pop");
              engine.updateLikeButtonUI();
              this.syncAllLikeButtonsInDOM();
            });
          });

          this.scrollContainer.querySelectorAll("[data-add-pl-idx]").forEach(btn => {
            btn.addEventListener("click", (e) => {
              e.stopPropagation();
              const track = album.tracks[parseInt(btn.dataset.addPlIdx)];
              this.openTrackOptionsModal(track, album);
            });
          });

          this.scrollContainer.querySelectorAll("[data-share-idx]").forEach(btn => {
            btn.addEventListener("click", (e) => {
              e.stopPropagation();
              const track = album.tracks[parseInt(btn.dataset.shareIdx)];
              if (track) this.shareTrack(track, album);
            });
          });
        }

        renderSearchView(initialQuery = "") {
          const cleanInitial = (initialQuery || "").trim();

          this.scrollContainer.innerHTML = `
            <div style="max-width:960px; margin:0 auto;">
              <h1 class="greeting-title" style="margin-bottom:14px;">Buscar</h1>

              <div style="display:flex; gap:10px; margin-bottom:20px;">
                <div style="position:relative; flex:1;">
                  <input type="text" id="view-search-input" value="${cleanInitial.replace(/"/g, "&quot;")}" placeholder="O que você quer ouvir?" style="width:100%; height:46px; border-radius:12px; padding:0 40px 0 42px; font-size:0.96rem;" autocomplete="off" />
                  <svg style="position:absolute; left:14px; top:50%; transform:translateY(-50%); color:var(--text-muted); pointer-events:none;" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                  <button type="button" class="search-clear-btn ${cleanInitial ? 'visible' : ''}" id="btn-clear-view-search" title="Limpar pesquisa" aria-label="Limpar pesquisa">✕</button>
                </div>
                <button class="album-action-btn primary" id="btn-trigger-search" style="flex:0 0 auto; height:46px; padding:0 22px;">Buscar</button>
              </div>

              <div id="search-results-container"></div>
            </div>
          `;

          const input = document.getElementById("view-search-input");
          const btnSearch = document.getElementById("btn-trigger-search");
          const btnClearView = document.getElementById("btn-clear-view-search");
          const globalInput = document.getElementById("global-search-input");
          const btnClearGlobal = document.getElementById("btn-clear-global-search");

          const renderEmptyBrowseState = () => {
            const container = document.getElementById("search-results-container");
            if (!container) return;
            const browseArtists = (state.charts && Array.isArray(state.charts.top100Artists) && state.charts.top100Artists.length > 0)
              ? state.charts.top100Artists
              : POPULAR_ARTISTS_DIRECTORY;
            container.innerHTML = `
              <div class="showcase-section">
                <div class="section-head">
                  <h2 class="section-title">Artistas em Destaque</h2>
                </div>
                <div class="artist-bubbles-grid search-artists-grid-3rows">
                  ${browseArtists.map(art => `
                    <div class="artist-bubble-card" data-search-artist-name="${art.name}">
                      <div class="artist-avatar-wrap shimmer">
                        <img class="artist-bubble-img" src="${ensureArtistAvatarUrl(art)}" alt="${art.name}" referrerpolicy="no-referrer" onload="this.classList.add('loaded'); this.parentElement.classList.remove('shimmer');" onerror="window.handleImgError(this, '${art.name.replace(/'/g, "")}', 'Artista')" />
                      </div>
                      <div class="artist-bubble-info">
                        <div class="artist-bubble-name">${art.name}</div>
                        <div class="artist-bubble-sub">Artista</div>
                      </div>
                    </div>
                  `).join("")}
                </div>
              </div>
            `;
            container.querySelectorAll("[data-search-artist-name]").forEach(card => {
              card.addEventListener("click", () => {
                this.navigateTo("artist", true, { artistName: card.dataset.searchArtistName });
              });
            });
          };

          const syncViewClearState = () => {
            if (btnClearView && input) {
              btnClearView.classList.toggle("visible", input.value.length > 0);
            }
            if (globalInput && input) {
              globalInput.value = input.value;
            }
            if (btnClearGlobal && input) {
              btnClearGlobal.classList.toggle("visible", input.value.length > 0);
            }
          };

          if (input) {
            input.addEventListener("input", syncViewClearState);
          }
          if (btnClearView) {
            btnClearView.addEventListener("click", (e) => {
              e.preventDefault();
              e.stopPropagation();
              input.value = "";
              syncViewClearState();
              input.focus();
              renderEmptyBrowseState();
            });
          }

          const executeSearch = async (term) => {
            const cleanTerm = (term || "").trim();
            if (!cleanTerm) {
              renderEmptyBrowseState();
              return;
            }
            const container = document.getElementById("search-results-container");
            container.innerHTML = `<div style="padding:24px; color:var(--text-secondary);">Buscando "${cleanTerm}"...</div>`;

            try {
              const { artists = [], songs = [], albums = [] } = await MiadoMusicResolver.searchCatalog(cleanTerm);
              this.lastSearchSongs = songs;

              if (!songs.length && !albums.length && !artists.length) {
                container.innerHTML = `<div style="padding:24px; color:var(--text-muted);">Nenhum resultado encontrado para "${cleanTerm}".</div>`;
                return;
              }

              container.innerHTML = `
                ${artists.length > 0 ? `
                  <div class="showcase-section">
                    <div class="section-head">
                      <h2 class="section-title">Artistas</h2>
                    </div>
                    <div class="artist-bubbles-grid search-artists-grid-3rows">
                      ${artists.map(art => `
                        <div class="artist-bubble-card" data-search-artist-name="${art.name}">
                          <div class="artist-avatar-wrap shimmer">
                            <img class="artist-bubble-img" src="${ensureArtistAvatarUrl(art)}" alt="${art.name}" referrerpolicy="no-referrer" onload="this.classList.add('loaded'); this.parentElement.classList.remove('shimmer');" onerror="window.handleImgError(this, '${art.name.replace(/'/g, "")}', 'Artista')" />
                          </div>
                          <div class="artist-bubble-info">
                            <div class="artist-bubble-name">${art.name}</div>
                            <div class="artist-bubble-sub">Artista</div>
                          </div>
                        </div>
                      `).join("")}
                    </div>
                  </div>
                ` : ""}

                ${albums.length > 0 ? `
                  <div class="showcase-section">
                    <div class="section-head">
                      <h2 class="section-title">Álbuns</h2>
                    </div>
                    <div class="cards-row-scroll">
                      ${albums.map((alb, aIdx) => `
                        <div class="album-card" data-api-album-idx="${aIdx}">
                          <div class="album-cover-wrap">
                            <img class="album-cover-img" src="${alb.coverUrl}" alt="${alb.title}" referrerpolicy="no-referrer" onerror="window.handleImgError(this, '${alb.title.replace(/'/g, "")}', '${alb.artist.replace(/'/g, "")}')" />
                            <button class="floating-card-play" data-api-album-play="${aIdx}" title="Tocar ${alb.title}">
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>
                            </button>
                          </div>
                          <div class="album-card-title">${alb.title}</div>
                          <div class="album-card-sub">${alb.artist} · ${alb.year}</div>
                        </div>
                      `).join("")}
                    </div>
                  </div>
                ` : ""}

                <div class="showcase-section">
                  <div class="section-head">
                    <h2 class="section-title">Músicas</h2>
                  </div>
                  <div class="tracklist-table">
                    ${songs.map((tr, idx) => {
                      const isLiked = state.isLiked(tr);
                      const tKey = normalizeTrackKey(tr);
                      const safeTitle = String(tr.title || "").replace(/"/g, "&quot;");
                      const safeArtist = String(tr.artist || "").replace(/"/g, "&quot;");
                      const likeTip = isLiked ? "Remover das Músicas Curtidas" : "Curtir faixa";
                      return `
                      <div class="track-row ${state.currentTrack && (String(state.currentTrack.id) === String(tr.id) || normalizeTrackKey(state.currentTrack) === tKey) ? 'playing' : ''}" data-search-song-idx="${idx}" data-track-id="${tr.id}" data-track-key="${tKey}">
                        <img class="track-row-cover" src="${ensureTrackCoverUrl(tr)}" alt="${tr.title}" referrerpolicy="no-referrer" onerror="window.handleImgError(this, '${tr.title.replace(/'/g, "")}', '${tr.artist.replace(/'/g, "")}')" />
                        <div class="track-info-col">
                          <div class="track-title">${tr.title}</div>
                          <div class="track-artist">${tr.artist} · ${tr.albumTitle}</div>
                        </div>
                        <div class="track-duration-col">${tr.duration}</div>
                        <div class="track-actions-col">
                          <button class="track-icon-btn btn-add-queue-direct" data-quick-queue-btn data-search-queue-idx="${idx}" title="Adicionar à fila" aria-label="Adicionar à fila">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M4 6h16M4 12h10M4 18h10M18 15v6m3-3h-6"/></svg>
                          </button>
                          <button class="track-icon-btn ${isLiked ? 'liked' : ''}" data-search-like-idx="${idx}" data-like-track-key="${tKey}" data-like-track-id="${tr.id}" data-like-track-title="${safeTitle}" data-like-track-artist="${safeArtist}" data-tooltip="${likeTip}" title="${likeTip}" aria-label="${likeTip}">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="${isLiked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
                          </button>
                          <button class="track-icon-btn" data-search-addpl-idx="${idx}" title="Adicionar à Playlist" aria-label="Adicionar à Playlist">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                          </button>
                          <button class="track-icon-btn" data-search-share-idx="${idx}" title="Compartilhar" aria-label="Compartilhar">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                          </button>
                        </div>
                      </div>
                    `;
                    }).join("")}
                  </div>
                </div>
              `;

              container.querySelectorAll("[data-search-artist-name]").forEach(card => {
                card.addEventListener("click", () => {
                  this.navigateTo("artist", true, { artistName: card.dataset.searchArtistName });
                });
              });

              container.querySelectorAll("[data-api-album-idx]").forEach(card => {
                card.addEventListener("click", (e) => {
                  if (e.target.closest("[data-api-album-play]")) return;
                  const alb = albums[parseInt(card.dataset.apiAlbumIdx)];
                  this.navigateTo("album", true, { albumId: alb.id, customAlbum: alb });
                });
              });

              container.querySelectorAll("[data-api-album-play]").forEach(btn => {
                btn.addEventListener("click", (e) => {
                  e.stopPropagation();
                  const alb = albums[parseInt(btn.dataset.apiAlbumPlay)];
                  if (alb) {
                    const trList = (alb.tracks && alb.tracks.length > 0) ? alb.tracks : songs;
                    if (trList.length > 0) {
                      state.queue = [...trList];
                      state.queueIndex = 0;
                      engine.playTrack(trList[0], alb);
                      this.renderRightSidebarBodyOnly();
                    }
                  }
                });
              });

              container.querySelectorAll("[data-search-song-idx]").forEach(row => {
                row.addEventListener("click", (e) => {
                  if (e.target.closest(".track-actions-col")) return;
                  const idx = parseInt(row.dataset.searchSongIdx);
                  const tr = songs[idx];
                  state.queue = [...songs];
                  state.queueIndex = idx;
                  engine.playTrack(tr, {
                    id: `search_${tr.id}`,
                    title: tr.albumTitle,
                    artist: tr.artist,
                    coverUrl: ensureTrackCoverUrl(tr)
                  });
                  this.renderRightSidebarBodyOnly();
                });
              });

              container.querySelectorAll("[data-search-like-idx]").forEach(btn => {
                btn.addEventListener("click", (e) => {
                  e.stopPropagation();
                  const tr = songs[parseInt(btn.dataset.searchLikeIdx)];
                  const nowLiked = state.toggleLike(tr);
                  btn.classList.remove("liked-pop");
                  void btn.offsetWidth;
                  if (nowLiked) btn.classList.add("liked-pop");
                  engine.updateLikeButtonUI();
                  this.syncAllLikeButtonsInDOM();
                });
              });

              container.querySelectorAll("[data-search-addpl-idx]").forEach(btn => {
                btn.addEventListener("click", (e) => {
                  e.stopPropagation();
                  const tr = songs[parseInt(btn.dataset.searchAddplIdx)];
                  this.openTrackOptionsModal(tr);
                });
              });

              container.querySelectorAll("[data-search-share-idx]").forEach(btn => {
                btn.addEventListener("click", (e) => {
                  e.stopPropagation();
                  const tr = songs[parseInt(btn.dataset.searchShareIdx)];
                  if (tr) this.shareTrack(tr);
                });
              });
            } catch (err) {
              container.innerHTML = `<div style="padding:24px; color:var(--text-muted);">Erro ao consultar catálogo. Tente novamente.</div>`;
            }
          };

          btnSearch.addEventListener("click", () => executeSearch(input.value));
          input.addEventListener("keydown", (e) => {
            if (e.key === "Enter") executeSearch(input.value);
          });

          if (cleanInitial) {
            executeSearch(cleanInitial);
          } else {
            renderEmptyBrowseState();
          }
        }

        renderLibraryView() {
          const historyList = state.recentHistory;

          this.scrollContainer.innerHTML = `
            <div style="max-width:960px; margin:0 auto;">
              <h1 class="greeting-title" style="margin-bottom:6px;">Sua Biblioteca</h1>
              <p class="greeting-sub" style="margin-bottom:24px;">Suas playlists salvas, músicas curtidas e histórico recente das últimas 50 músicas.</p>

              <div class="cards-row-scroll" style="grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); margin-bottom:38px;">
                <div class="album-card" id="btn-lib-liked-card">
                  <div class="album-cover-wrap" style="background-color: var(--accent); display:flex; align-items:center; justify-content:center;">
                    <svg width="52" height="52" viewBox="0 0 24 24" fill="#ffffff"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
                  </div>
                  <div class="album-card-title">Músicas Curtidas</div>
                  <div class="album-card-sub">${state.user.likedTracks.length} músicas salvas</div>
                </div>

                ${state.playlists.map(pl => {
                  const cover = pl.customCoverUrl || pl.coverUrl || (pl.tracks[0] && pl.tracks[0].coverUrl) || INITIAL_ALBUMS[0].coverUrl;
                  return `
                    <div class="album-card" data-lib-pl-id="${pl.id}" style="position:relative;">
                      <div class="album-cover-wrap">
                        <img class="album-cover-img" src="${cover}" alt="${pl.name}" referrerpolicy="no-referrer" onerror="window.handleImgError(this, '${pl.name.replace(/'/g, "")}', 'Playlist')" />
                        <button type="button" data-lib-del-pl="${pl.id}" title="Apagar playlist ${pl.name}" style="position:absolute; top:8px; right:8px; width:30px; height:30px; border-radius:50%; background:rgba(15,10,25,0.85); border:1px solid rgba(248,113,113,0.55); color:#f87171; display:flex; align-items:center; justify-content:center; cursor:pointer; z-index:4;">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
                        </button>
                        <button class="floating-card-play" data-lib-play-pl="${pl.id}">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>
                        </button>
                      </div>
                      <div class="album-card-title">${pl.name}</div>
                      <div class="album-card-sub">${pl.isCollaborative ? "Conjunta · " : ""}${pl.tracks.length} músicas</div>
                    </div>
                  `;
                }).join("")}
              </div>

              <!-- SEÇÃO: HISTÓRICO RECENTE (ÚLTIMAS 50 MÚSICAS) -->
              <section class="showcase-section">
                <div class="section-head">
                  <div>
                    <h2 class="section-title">Histórico Recente</h2>
                    <p style="font-size:0.82rem; color:var(--text-secondary); margin-top:2px;">
                      Últimas ${historyList.length} de 50 músicas ouvidas · Clique em qualquer faixa para tocar novamente
                    </p>
                  </div>
                  <div style="display:flex; gap:8px;">
                    ${historyList.length > 0 ? `
                      <button class="btn-see-all" id="btn-play-history-all">Tocar Histórico</button>
                      <button class="btn-see-all" id="btn-clear-history" style="color:var(--text-secondary);">Limpar</button>
                    ` : ""}
                  </div>
                </div>

                ${historyList.length === 0 ? `
                  <div class="album-editorial-card" style="text-align:center; padding:32px;">
                    <div style="font-weight:700; color:#ffffff; margin-bottom:6px;">Seu histórico recente está vazio</div>
                    <div style="color:var(--text-secondary); font-size:0.88rem;">As últimas 50 músicas que você escutar serão registradas automaticamente aqui.</div>
                  </div>
                ` : `
                  <div class="tracklist-table">
                    ${historyList.map((track, idx) => {
                      const isLiked = state.isLiked(track);
                      const tKey = normalizeTrackKey(track);
                      const safeTitle = String(track.title || "").replace(/"/g, "&quot;");
                      const safeArtist = String(track.artist || "").replace(/"/g, "&quot;");
                      const likeTip = isLiked ? "Remover das Músicas Curtidas" : "Curtir faixa — salvar em Músicas Curtidas";
                      return `
                      <div class="track-row ${state.currentTrack && (String(state.currentTrack.id) === String(track.id) || normalizeTrackKey(state.currentTrack) === tKey) ? 'playing' : ''}" data-history-idx="${idx}" data-track-id="${track.id}" data-track-key="${tKey}">
                        <div class="track-num-col"><span>${idx + 1}</span></div>
                        <img class="track-row-cover" src="${ensureTrackCoverUrl(track)}" alt="${track.title}" referrerpolicy="no-referrer" onerror="window.handleImgError(this, '${track.title.replace(/'/g, "")}', '${track.artist.replace(/'/g, "")}')" />
                        <div class="track-info-col">
                          <div class="track-title">${track.title}</div>
                          <div class="track-artist">${track.artist} · ${track.albumTitle || "Single"}</div>
                        </div>
                        <div class="track-duration-col">${track.playedAt || ""}</div>
                        <div class="track-duration-col">${track.duration}</div>
                        <div class="track-actions-col">
                          <button class="track-icon-btn ${isLiked ? 'liked' : ''}" data-hist-like-idx="${idx}" data-like-track-key="${tKey}" data-like-track-id="${track.id}" data-like-track-title="${safeTitle}" data-like-track-artist="${safeArtist}" data-tooltip="${likeTip}" title="${likeTip}" aria-label="${likeTip}">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="${isLiked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
                          </button>
                          <button class="track-icon-btn" data-hist-opt-idx="${idx}" data-tooltip="Adicionar à Playlist ou Criar Nova" title="Adicionar à Playlist ou Criar Nova" aria-label="Adicionar à Playlist ou Criar Nova">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                          </button>
                          <button class="track-icon-btn" data-hist-share-idx="${idx}" data-tooltip="Compartilhar no Feed Miau & Copiar Link" title="Compartilhar no Feed Miau & Copiar Link" aria-label="Compartilhar no Feed Miau & Copiar Link">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                          </button>
                        </div>
                      </div>
                    `;
                    }).join("")}
                  </div>
                `}
              </section>
            </div>
          `;

          document.getElementById("btn-lib-liked-card").addEventListener("click", () => this.navigateTo("liked"));
          this.scrollContainer.querySelectorAll("[data-lib-pl-id]").forEach(card => {
            card.addEventListener("click", (e) => {
              if (e.target.closest("[data-lib-play-pl]") || e.target.closest("[data-lib-del-pl]")) return;
              this.navigateTo("playlist", true, { playlistId: card.dataset.libPlId });
            });
          });
          this.scrollContainer.querySelectorAll("[data-lib-del-pl]").forEach(btn => {
            btn.addEventListener("click", (e) => {
              e.stopPropagation();
              const plId = btn.dataset.libDelPl;
              const removed = state.deletePlaylist(plId);
              if (removed) {
                this.renderSidebarPlaylists();
                this.renderLibraryView();
                showToast(`Playlist "${removed.name}" apagada com sucesso!`);
              }
            });
          });
          this.scrollContainer.querySelectorAll("[data-lib-play-pl]").forEach(btn => {
            btn.addEventListener("click", (e) => {
              e.stopPropagation();
              const pl = state.playlists.find(p => p.id === btn.dataset.libPlayPl);
              if (pl && pl.tracks.length > 0) {
                const plCover = pl.customCoverUrl || pl.coverUrl || pl.tracks[0].coverUrl;
                state.queue = [...pl.tracks];
                state.queueIndex = 0;
                engine.playTrack(pl.tracks[0], { id: pl.id, title: pl.name, artist: "Miau Social", coverUrl: plCover });
                this.renderRightSidebarBodyOnly();
              }
            });
          });

          if (document.getElementById("btn-play-history-all")) {
            document.getElementById("btn-play-history-all").addEventListener("click", () => {
              if (!historyList.length) return;
              state.queue = [...historyList];
              state.queueIndex = 0;
              const first = historyList[0];
              engine.playTrack(first, { id: first.albumId, title: first.albumTitle, artist: first.artist, coverUrl: ensureTrackCoverUrl(first) });
              this.renderRightSidebarBodyOnly();
            });
          }

          if (document.getElementById("btn-clear-history")) {
            document.getElementById("btn-clear-history").addEventListener("click", () => {
              state.clearRecentHistory();
              this.renderLibraryView();
              showToast("Histórico recente limpo.");
            });
          }

          this.scrollContainer.querySelectorAll("[data-history-idx]").forEach(row => {
            row.addEventListener("click", (e) => {
              if (e.target.closest(".track-actions-col")) return;
              const idx = parseInt(row.dataset.historyIdx);
              const track = historyList[idx];
              if (track) {
                state.queue = [...historyList];
                state.queueIndex = idx;
                engine.playTrack(track, { id: track.albumId, title: track.albumTitle, artist: track.artist, coverUrl: ensureTrackCoverUrl(track) });
                this.renderRightSidebarBodyOnly();
              }
            });
          });

          this.scrollContainer.querySelectorAll("[data-hist-like-idx]").forEach(btn => {
            btn.addEventListener("click", (e) => {
              e.stopPropagation();
              const track = historyList[parseInt(btn.dataset.histLikeIdx)];
              const nowLiked = state.toggleLike(track);
              btn.classList.remove("liked-pop");
              void btn.offsetWidth;
              if (nowLiked) btn.classList.add("liked-pop");
              engine.updateLikeButtonUI();
              this.syncAllLikeButtonsInDOM();
            });
          });

          this.scrollContainer.querySelectorAll("[data-hist-opt-idx]").forEach(btn => {
            btn.addEventListener("click", (e) => {
              e.stopPropagation();
              const track = historyList[parseInt(btn.dataset.histOptIdx)];
              this.openTrackOptionsModal(track);
            });
          });

          this.scrollContainer.querySelectorAll("[data-hist-share-idx]").forEach(btn => {
            btn.addEventListener("click", (e) => {
              e.stopPropagation();
              const track = historyList[parseInt(btn.dataset.histShareIdx)];
              if (track) this.shareTrack(track);
            });
          });
        }

        async renderSocialView(searchQuery = "") {
          if (!this._communityLoadedOnce) {
            this._communityLoadedOnce = true;
            await state.fetchCommunityProfiles("");
          }
          const qLower = (searchQuery || "").trim().toLowerCase();
          const myHandle = String(state.user.username || "").toLowerCase();
          const communityList = (state.communityProfiles || []).filter(p => {
            if (!p || !p.username) return false;
            if (!qLower) return true;
            return (
              String(p.name || "").toLowerCase().includes(qLower) ||
              String(p.username || "").toLowerCase().includes(qLower) ||
              String(p.bio || "").toLowerCase().includes(qLower)
            );
          });

          this.scrollContainer.innerHTML = `
            <div style="max-width:960px; margin:0 auto;">
              <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; margin-bottom:24px;">
                <div>
                  <h1 class="greeting-title">Comunidade & Feed Miau</h1>
                  <p class="greeting-sub">Zero perfis falsos · Encontre ou cadastre perfis reais dos seus amigos, siga artistas e compartilhe músicas.</p>
                </div>
                <div style="display:flex; gap:10px; flex-wrap:wrap;">
                  <button class="album-action-btn" id="btn-social-share-now" style="flex:0 0 auto; height:42px; padding:0 16px;">
                    Publicar Música Atual
                  </button>
                  <button class="album-action-btn" id="btn-social-edit-cat" style="flex:0 0 auto; height:42px; padding:0 16px;">
                    Editar Meu Perfil (${state.user.username})
                  </button>
                  <button class="album-action-btn primary" id="btn-social-open-collab" style="flex:0 0 auto; height:42px; padding:0 18px;">
                    + Playlist Colaborativa
                  </button>
                </div>
              </div>

              <!-- Seção 0: BUSCAR PERFIS REAIS & CADASTRAR AMIGOS -->
              <div class="showcase-section">
                <div class="album-card" style="padding:20px; cursor:default;">
                  <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; margin-bottom:14px;">
                    <div>
                      <h2 class="section-title" style="font-size:1.15rem;">Encontrar Perfis & Seguir Amigos</h2>
                      <p style="font-size:0.8rem; color:var(--text-secondary); margin-top:2px;">
                        Busque pelo @username ou nome de qualquer perfil criado no Miado, ou adicione o perfil de um amigo abaixo.
                      </p>
                    </div>
                    <button type="button" class="btn-see-all" id="btn-toggle-new-friend-form" style="border-color:var(--accent); color:#ffffff; background-color:var(--accent-subtle);">
                      + Criar / Adicionar Perfil de Amigo
                    </button>
                  </div>

                  <!-- Barra de Busca de Perfis -->
                  <div style="display:flex; gap:10px; margin-bottom:14px; flex-wrap:wrap;">
                    <input type="text" id="social-profile-search-input" value="${searchQuery.replace(/"/g, "&quot;")}" placeholder="Buscar perfil por @username ou nome (ex: @seuamigo)..." style="flex:1; min-width:220px;" />
                    <button type="button" class="album-action-btn primary" id="btn-social-search-profiles" style="height:42px; padding:0 18px;">
                      Buscar Perfil
                    </button>
                    ${searchQuery ? `
                      <button type="button" class="album-action-btn" id="btn-social-clear-search" style="height:42px; padding:0 14px;">
                        Limpar
                      </button>
                    ` : ""}
                  </div>

                  <!-- Formulário Expansível para Criar / Cadastrar Perfil de Amigo Real -->
                  <div id="social-create-friend-box" style="display:none; background-color:var(--bg-base); border:1px solid var(--glass-border-strong); border-radius:14px; padding:16px; margin-bottom:16px;">
                    <div style="font-weight:800; font-size:0.95rem; color:#ffffff; margin-bottom:10px;">Cadastrar Novo Perfil na Comunidade e Seguir</div>
                    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap:10px; margin-bottom:10px;">
                      <div>
                        <label style="font-size:0.74rem; color:var(--text-secondary); font-weight:700; display:block; margin-bottom:4px;">Nome do Amigo(a)</label>
                        <input type="text" id="new-friend-name" placeholder="Ex: Ana Clara" style="width:100%;" />
                      </div>
                      <div>
                        <label style="font-size:0.74rem; color:var(--text-secondary); font-weight:700; display:block; margin-bottom:4px;">@username</label>
                        <input type="text" id="new-friend-handle" placeholder="Ex: @anaclara" style="width:100%;" />
                      </div>
                      <div>
                        <label style="font-size:0.74rem; color:var(--text-secondary); font-weight:700; display:block; margin-bottom:4px;">Música Favorita / Ouvindo</label>
                        <input type="text" id="new-friend-track" placeholder="Ex: L'AMOUR DE MA VIE - Billie Eilish" style="width:100%;" />
                      </div>
                    </div>
                    <div style="display:grid; grid-template-columns: 1fr auto; gap:10px; align-items:end;">
                      <div>
                        <label style="font-size:0.74rem; color:var(--text-secondary); font-weight:700; display:block; margin-bottom:4px;">Bio do Perfil (opcional)</label>
                        <input type="text" id="new-friend-bio" placeholder="Fã de Billie Eilish, The Weeknd e Lady Gaga..." style="width:100%;" />
                      </div>
                      <button type="button" class="btn-modal-confirm" id="btn-confirm-create-friend" style="height:42px; padding:0 20px; white-space:nowrap;">
                        Salvar Perfil & Seguir
                      </button>
                    </div>
                  </div>

                  <!-- Lista de Perfis Reais Encontrados no Diretório -->
                  <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(265px, 1fr)); gap:12px;">
                    ${communityList.map((prof, pIdx) => {
                      const isMe = String(prof.username || "").toLowerCase() === myHandle;
                      const isFollowing = state.isProfileFollowed(prof.username);
                      return `
                        <div class="album-card" style="padding:14px; cursor:default; background-color:var(--bg-base);">
                          <div style="display:flex; align-items:center; gap:12px; margin-bottom:10px;">
                            <img src="${prof.avatar || prof.avatarUrl || CAT_AVATAR_PRESETS[0].url}" style="width:46px; height:46px; border-radius:50%; object-fit:cover; border:2px solid var(--accent-hover);" alt="${prof.name}" onerror="window.handleCatAvatarError(this)" />
                            <div style="flex:1; min-width:0;">
                              <div style="display:flex; align-items:center; gap:6px;">
                                <div style="font-weight:800; font-size:0.92rem; color:#fff;" class="text-truncate">${prof.name}</div>
                                ${isMe ? `<span class="friend-online-badge">VOCÊ</span>` : ""}
                              </div>
                              <div style="font-size:0.78rem; color:var(--accent-hover); font-weight:700;">${prof.username}</div>
                            </div>
                          </div>
                          <div style="font-size:0.78rem; color:var(--text-secondary); margin-bottom:10px; min-height:20px;" class="text-truncate">
                            ${prof.bio || "Perfil oficial no Miado."}
                          </div>
                          <div style="display:flex; gap:8px;">
                            ${isMe ? `
                              <button type="button" class="album-action-btn" id="btn-open-my-prof-card" style="flex:1; height:34px; font-size:0.78rem;">
                                Editar Meu Perfil
                              </button>
                            ` : `
                              <button type="button" class="album-action-btn ${isFollowing ? '' : 'primary'}" data-toggle-follow-prof="${pIdx}" style="flex:1; height:34px; font-size:0.78rem;">
                                ${isFollowing ? "✓ Seguindo (Deixar de Seguir)" : "+ Seguir Amigo"}
                              </button>
                            `}
                          </div>
                        </div>
                      `;
                    }).join("")}
                  </div>
                </div>
              </div>

              <!-- Seção 1: Status dos Seus Amigos Seguidos -->
              <div class="showcase-section">
                <div class="section-head">
                  <div>
                    <h2 class="section-title">Amigos que Você Segue (${state.friends.length})</h2>
                    <p style="font-size:0.78rem; color:var(--text-secondary); margin-top:2px;">
                      Apenas os perfis reais que você escolheu seguir aparecem aqui.
                    </p>
                  </div>
                </div>
                ${state.friends.length === 0 ? `
                  <div class="album-editorial-card" style="text-align:center; padding:28px;">
                    <div style="font-weight:800; color:#ffffff; font-size:1rem;">Sua lista de amigos está zerada e pronta para você!</div>
                    <div style="font-size:0.84rem; color:var(--text-secondary); margin-top:6px;">
                      Removemos todos os perfis falsos. Use o botão <strong>"+ Criar / Adicionar Perfil de Amigo"</strong> acima para cadastrar e seguir seus amigos.
                    </div>
                  </div>
                ` : `
                  <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(265px, 1fr)); gap:14px;">
                    ${state.friends.map((f, fIdx) => `
                      <div class="album-card" style="padding:16px; cursor:default;">
                        <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
                          <img src="${f.avatar}" style="width:48px; height:48px; border-radius:50%; object-fit:cover; border:2px solid var(--accent-hover);" alt="${f.name}" onerror="window.handleCatAvatarError(this)" />
                          <div style="flex:1; min-width:0;">
                            <div style="font-weight:700; font-size:0.95rem; color:#fff;" class="text-truncate">${f.name}</div>
                            <div style="font-size:0.78rem; color:var(--accent-hover);">${f.username}</div>
                          </div>
                          <button type="button" class="track-icon-btn" data-unfollow-friend-idx="${fIdx}" title="Deixar de seguir ${f.username}" style="width:28px; height:28px;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                          </button>
                        </div>
                        <div style="background-color:var(--bg-base); border:1px solid var(--glass-border); padding:10px 12px; border-radius:10px; margin-bottom:12px; display:flex; align-items:center; justify-content:space-between; gap:10px;">
                          <div style="overflow:hidden;">
                            <div style="font-size:0.68rem; color:var(--text-muted); text-transform:uppercase; font-weight:700;">Ouvindo Agora</div>
                            <div style="font-size:0.85rem; font-weight:600; color:#fff; margin-top:2px;" class="text-truncate">${f.currentTrack}</div>
                          </div>
                          <button class="track-icon-btn ${f.likedByMe ? 'liked' : ''}" data-like-friend-idx="${fIdx}" title="Curtir atividade do amigo">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="${f.likedByMe ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
                          </button>
                        </div>
                        <div style="display:flex; gap:8px;">
                          <button class="album-action-btn primary" style="flex:1; height:36px; font-size:0.82rem;" data-play-friend-idx="${fIdx}">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>
                            Dar Play
                          </button>
                          <button class="album-action-btn" style="flex:1; height:36px; font-size:0.82rem;" data-open-friend-album="${f.albumId}">
                            Ver Álbum
                          </button>
                        </div>
                      </div>
                    `).join("")}
                  </div>
                `}
              </div>

              <!-- Seção 1.5: Artistas Seguidos por Você -->
              <div class="showcase-section">
                <div class="section-head">
                  <div>
                    <h2 class="section-title">Artistas que Você Segue (${state.followedArtists.length})</h2>
                    <p style="font-size:0.78rem; color:var(--text-secondary); margin-top:2px;">
                      Clique em qualquer artista para abrir a discografia de estúdio ou gerencie quem você segue.
                    </p>
                  </div>
                </div>
                ${state.followedArtists.length === 0 ? `
                  <div class="album-editorial-card" style="text-align:center; padding:22px;">
                    <div style="font-size:0.86rem; color:var(--text-secondary);">Você ainda não está seguindo nenhum artista. Clique em <strong>+ Seguir</strong> nos cards de artistas na aba Início ou na página de qualquer artista!</div>
                  </div>
                ` : `
                  <div class="artist-bubbles-grid">
                    ${state.followedArtists.map((art, aIdx) => `
                      <div class="artist-bubble-card" data-social-open-artist="${art.name}">
                        <img class="artist-bubble-img" src="${art.coverUrl}" alt="${art.name}" referrerpolicy="no-referrer" onerror="window.handleImgError(this, '${art.name.replace(/'/g, "")}', 'Artista')" />
                        <div class="artist-bubble-name">${art.name}</div>
                        <div class="artist-bubble-sub">${art.role || "Artista Seguido"}</div>
                        <button type="button" class="category-pill active" data-social-unfollow-artist="${aIdx}" style="margin-top:8px; height:28px; padding:0 12px; font-size:0.72rem; width:100%;">
                          ✓ Seguindo
                        </button>
                      </div>
                    `).join("")}
                  </div>
                `}
              </div>

              <!-- Seção 2: Timeline de Atividades Recentes (Feed Miau) -->
              <div class="showcase-section">
                <div class="section-head">
                  <h2 class="section-title">Suas Publicações & Timeline (${state.feedPosts.length})</h2>
                </div>
                ${state.feedPosts.length === 0 ? `
                  <div class="album-editorial-card" style="text-align:center; padding:24px;">
                    <div style="font-weight:700; color:#ffffff;">Nenhuma publicação no Feed ainda</div>
                    <div style="font-size:0.84rem; color:var(--text-secondary); margin-top:4px;">Clique em "Publicar Música Atual" no topo para compartilhar o que você está ouvindo!</div>
                  </div>
                ` : `
                  <div style="display:flex; flex-direction:column; gap:12px;">
                    ${state.feedPosts.map((post, pIdx) => {
                      const tr = post.track || INITIAL_ALBUMS[0].tracks[0];
                      return `
                        <div class="album-card" style="padding:16px 18px; display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap; cursor:default;">
                          <div style="display:flex; align-items:center; gap:14px; flex:1; min-width:240px;">
                            <img src="${post.avatar}" style="width:46px; height:46px; border-radius:50%; object-fit:cover; border:2px solid var(--accent);" alt="${post.name || post.username}" onerror="window.handleCatAvatarError(this)" />
                            <div style="flex:1; min-width:0;">
                              <div style="font-size:0.9rem; color:#fff;">
                                <strong style="color:var(--accent-hover);">${post.username}</strong> ${post.actionText || "acabou de ouvir"}
                                <strong>${tr.title}</strong> de <strong>${tr.artist}</strong>
                              </div>
                              ${post.comment ? `<div style="font-size:0.81rem; color:var(--text-secondary); margin-top:3px;">"${post.comment}"</div>` : ""}
                              <div style="font-size:0.75rem; color:var(--text-muted); margin-top:3px;">${post.time || "agora mesmo"} · Áudio Original de Estúdio</div>
                            </div>
                          </div>
                          <div style="display:flex; align-items:center; gap:12px;">
                            <img src="${ensureTrackCoverUrl(tr)}" style="width:48px; height:48px; border-radius:10px; object-fit:cover; border:1px solid var(--glass-border);" alt="${tr.title}" referrerpolicy="no-referrer" onerror="window.handleImgError(this, '${tr.title.replace(/'/g, "")}', '${tr.artist.replace(/'/g, "")}')" />
                            <button class="album-action-btn primary" style="height:36px; padding:0 16px; font-size:0.82rem; flex:0 0 auto;" data-play-post-idx="${pIdx}">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>
                              Tocar
                            </button>
                            <button class="track-icon-btn ${post.likedByMe ? 'liked' : ''}" style="width:auto; padding:0 10px; gap:5px; border:1px solid var(--glass-border); border-radius:999px; height:36px;" data-like-post-idx="${pIdx}">
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="${post.likedByMe ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
                              <span style="font-size:0.78rem; font-weight:700;">${post.likes || 0}</span>
                            </button>
                          </div>
                        </div>
                      `;
                    }).join("")}
                  </div>
                `}
              </div>
            </div>
          `;

          document.getElementById("btn-social-share-now").addEventListener("click", () => {
            if (!state.currentTrack) return;
            state.addUserActivityPost(state.currentTrack, "compartilhou no Feed Miau");
            this.renderSocialView(searchQuery);
            this.renderRightSidebarBodyOnly();
            showToast("Atividade publicada no Feed Miau!");
          });
          document.getElementById("btn-social-edit-cat").addEventListener("click", () => {
            this.setActiveNav("profile");
            this.navigateTo("profile", true);
          });
          const btnOpenMyProf = document.getElementById("btn-open-my-prof-card");
          if (btnOpenMyProf) {
            btnOpenMyProf.addEventListener("click", () => {
              this.setActiveNav("profile");
              this.navigateTo("profile", true);
            });
          }
          document.getElementById("btn-social-open-collab").addEventListener("click", () => {
            document.getElementById("modal-collab-playlist").classList.add("active");
          });

          const btnToggleForm = document.getElementById("btn-toggle-new-friend-form");
          const formBox = document.getElementById("social-create-friend-box");
          if (btnToggleForm && formBox) {
            btnToggleForm.addEventListener("click", () => {
              formBox.style.display = formBox.style.display === "none" ? "block" : "none";
            });
          }

          const searchInp = document.getElementById("social-profile-search-input");
          const btnSearchProf = document.getElementById("btn-social-search-profiles");
          if (btnSearchProf && searchInp) {
            btnSearchProf.addEventListener("click", async () => {
              const q = searchInp.value.trim();
              await state.fetchCommunityProfiles(q);
              this.renderSocialView(q);
            });
            searchInp.addEventListener("keydown", async (e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                const q = searchInp.value.trim();
                await state.fetchCommunityProfiles(q);
                this.renderSocialView(q);
              }
            });
          }
          const btnClearSearch = document.getElementById("btn-social-clear-search");
          if (btnClearSearch) {
            btnClearSearch.addEventListener("click", async () => {
              await state.fetchCommunityProfiles("");
              this.renderSocialView("");
            });
          }

          const btnConfirmFriend = document.getElementById("btn-confirm-create-friend");
          if (btnConfirmFriend) {
            btnConfirmFriend.addEventListener("click", async () => {
              const nameVal = (document.getElementById("new-friend-name")?.value || "").trim();
              const handleVal = (document.getElementById("new-friend-handle")?.value || "").trim();
              const trackVal = (document.getElementById("new-friend-track")?.value || "").trim() || "L'AMOUR DE MA VIE - Billie Eilish";
              const bioVal = (document.getElementById("new-friend-bio")?.value || "").trim() || "Amigo(a) na comunidade Miado.";
              if (!nameVal && !handleVal) {
                showToast("Digite o nome ou @username do perfil para adicionar!");
                return;
              }
              const cleanHandle = (handleVal || nameVal.toLowerCase().replace(/\s+/g, "")).startsWith("@")
                ? (handleVal || `@${nameVal.toLowerCase().replace(/\s+/g, "")}`)
                : `@${handleVal || nameVal.toLowerCase().replace(/\s+/g, "")}`;
              const randomCat = CAT_AVATAR_PRESETS[Math.floor(Math.random() * CAT_AVATAR_PRESETS.length)];
              const created = await state.createOrUpdateCommunityProfile({
                name: nameVal || cleanHandle.replace("@", ""),
                username: cleanHandle,
                bio: bioVal,
                avatarUrl: randomCat.url,
                currentTrack: trackVal,
                albumId: "alb-hit-me-hard-and-soft"
              });
              state.toggleFollowProfile(created || {
                name: nameVal || cleanHandle.replace("@", ""),
                username: cleanHandle,
                bio: bioVal,
                avatar: randomCat.url,
                currentTrack: trackVal,
                albumId: "alb-hit-me-hard-and-soft"
              });
              showToast(`Perfil ${cleanHandle} criado e seguido com sucesso!`);
              this.renderSocialView("");
              this.renderRightSidebarBodyOnly();
            });
          }

          this.scrollContainer.querySelectorAll("[data-toggle-follow-prof]").forEach(btn => {
            btn.addEventListener("click", () => {
              const prof = communityList[parseInt(btn.dataset.toggleFollowProf)];
              if (!prof) return;
              const nowFollowing = state.toggleFollowProfile(prof);
              showToast(nowFollowing ? `Agora você segue ${prof.username}!` : `Você deixou de seguir ${prof.username}.`);
              this.renderSocialView(searchQuery);
              this.renderRightSidebarBodyOnly();
            });
          });

          this.scrollContainer.querySelectorAll("[data-unfollow-friend-idx]").forEach(btn => {
            btn.addEventListener("click", () => {
              const f = state.friends[parseInt(btn.dataset.unfollowFriendIdx)];
              if (!f) return;
              state.toggleFollowProfile(f);
              showToast(`Você deixou de seguir ${f.username}.`);
              this.renderSocialView(searchQuery);
              this.renderRightSidebarBodyOnly();
            });
          });

          this.scrollContainer.querySelectorAll("[data-social-open-artist]").forEach(card => {
            card.addEventListener("click", (e) => {
              if (e.target.closest("[data-social-unfollow-artist]")) return;
              this.navigateTo("artist", true, { artistName: card.dataset.socialOpenArtist });
            });
          });

          this.scrollContainer.querySelectorAll("[data-social-unfollow-artist]").forEach(btn => {
            btn.addEventListener("click", (e) => {
              e.stopPropagation();
              const art = state.followedArtists[parseInt(btn.dataset.socialUnfollowArtist)];
              if (!art) return;
              state.toggleFollowArtist(art);
              showToast(`Você deixou de seguir ${art.name}.`);
              this.renderSocialView(searchQuery);
              this.renderRightSidebarBodyOnly();
            });
          });

          this.scrollContainer.querySelectorAll("[data-play-friend-idx]").forEach(btn => {
            btn.addEventListener("click", () => {
              const f = state.friends[parseInt(btn.dataset.playFriendIdx)];
              const alb = state.albums.find(a => a.id === f.albumId) || state.albums[0];
              const tr = f.trackObj || alb.tracks[0];
              if (tr) {
                state.queue = [...alb.tracks];
                state.queueIndex = 0;
                engine.playTrack(tr, alb);
                this.renderRightSidebarBodyOnly();
              }
            });
          });

          this.scrollContainer.querySelectorAll("[data-like-friend-idx]").forEach(btn => {
            btn.addEventListener("click", () => {
              const f = state.friends[parseInt(btn.dataset.likeFriendIdx)];
              f.likedByMe = !f.likedByMe;
              state.saveFriends();
              showToast(f.likedByMe ? `Você curtiu o som de ${f.username}!` : "Curtida removida");
              this.renderSocialView(searchQuery);
              this.renderRightSidebarBodyOnly();
            });
          });

          this.scrollContainer.querySelectorAll("[data-open-friend-album]").forEach(btn => {
            btn.addEventListener("click", () => {
              this.navigateTo("album", true, { albumId: btn.dataset.openFriendAlbum });
            });
          });

          this.scrollContainer.querySelectorAll("[data-play-post-idx]").forEach(btn => {
            btn.addEventListener("click", () => {
              const post = state.feedPosts[parseInt(btn.dataset.playPostIdx)];
              if (post && post.track) {
                const alb = state.albums.find(a => a.id === post.albumId || a.id === post.track.albumId) || state.albums[0];
                engine.playTrack(post.track, alb);
                this.renderRightSidebarBodyOnly();
              }
            });
          });

          this.scrollContainer.querySelectorAll("[data-like-post-idx]").forEach(btn => {
            btn.addEventListener("click", () => {
              const post = state.feedPosts[parseInt(btn.dataset.likePostIdx)];
              if (!post) return;
              post.likedByMe = !post.likedByMe;
              post.likes = Math.max(0, (post.likes || 0) + (post.likedByMe ? 1 : -1));
              state.saveFeedPosts();
              this.renderSocialView(searchQuery);
            });
          });
        }

        renderPlaylistView(playlistId) {
          const pl = state.playlists.find(p => p.id === playlistId) || state.playlists[0];
          if (!pl) {
            this.setActiveNav("library");
            this.renderLibraryView();
            return;
          }
          const shareCode = `miado-sync:${btoa(unescape(encodeURIComponent(JSON.stringify(pl))))}`;
          const coverHero = pl.customCoverUrl || pl.coverUrl || (pl.tracks[0] && ensureTrackCoverUrl(pl.tracks[0])) || INITIAL_ALBUMS[0].coverUrl;

          this.scrollContainer.innerHTML = `
            <div class="album-view-container">
              <div class="album-ambient-glow" style="background-image: url('${coverHero}');"></div>

              <div class="album-view-top-actions">
                <button class="back-btn-pill" id="btn-pl-back" style="color:#a855f7;">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
                  Voltar
                </button>
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                  <button type="button" class="back-btn-pill" id="btn-pl-pick-cover-top" title="Escolher capa personalizada da galeria">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                    Capa da Galeria
                  </button>
                  <button class="back-btn-pill" id="btn-copy-sync-code">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    Código Base64
                  </button>
                  <button class="back-btn-pill" id="btn-pl-delete" style="color:#f87171; border-color:rgba(248,113,113,0.45);">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
                    Apagar Playlist
                  </button>
                </div>
              </div>

              <div class="album-hero-center">
                <div style="position:relative; display:inline-block;">
                  <img class="album-hero-artwork" src="${coverHero}" alt="${pl.name}" referrerpolicy="no-referrer" onerror="window.handleImgError(this, '${pl.name.replace(/'/g, "")}', 'Playlist')" />
                  <button type="button" id="btn-pl-pick-cover-badge" title="Alterar capa da playlist com imagem da galeria" style="position:absolute; right:10px; bottom:28px; background:rgba(10,8,18,0.86); border:1px solid rgba(168,85,247,0.65); color:#ffffff; border-radius:999px; padding:6px 12px; font-size:0.74rem; font-weight:700; display:flex; align-items:center; gap:6px; cursor:pointer; backdrop-filter:blur(10px);">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    Trocar Capa
                  </button>
                </div>
                <h1 class="album-hero-title">${pl.name}</h1>
                <div class="album-hero-artist">${pl.isCollaborative ? "Playlist Colaborativa Miau" : "Playlist Pessoal"}</div>
                <div class="album-meta-line">${pl.tracks.length} FAIXAS · ${pl.collaborators ? pl.collaborators.join(", ") : state.user.username}</div>

                <div class="album-action-buttons" style="flex-wrap:wrap; margin-top:14px;">
                  <button class="album-action-btn primary" id="btn-pl-play-all">
                    <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>
                    Play
                  </button>
                  <button class="album-action-btn" id="btn-pl-shuffle-all">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 3h5v5"/><path d="M4 20L21 3"/><path d="M21 16v5h-5"/><path d="M15 15l6 6"/><path d="M4 4l5 5"/></svg>
                    Aleatório
                  </button>
                  <button type="button" class="album-action-btn" id="btn-pl-toggle-add-songs" style="color:var(--accent-hover); border-color:var(--glass-border-strong);">
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    + Adicionar Músicas
                  </button>
                  <button type="button" class="album-action-btn" id="btn-pl-pick-cover-hero">
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                    Capa da Galeria
                  </button>
                  <button class="album-action-btn" id="btn-pl-delete-hero" style="color:#f87171; border-color:rgba(248,113,113,0.4);">
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
                    Apagar Playlist
                  </button>
                </div>
              </div>

              <!-- SESSÃO PARA ADICIONAR MÚSICAS A ESTA PLAYLIST -->
              <div id="pl-add-songs-box" style="margin:20px 0; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.1); border-radius:16px; padding:18px; display:${pl.tracks.length === 0 ? 'block' : 'none'};">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                  <h3 style="font-size:1.02rem; font-weight:800; color:#fff; display:flex; align-items:center; gap:8px;">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-hover)" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
                    Adicionar Músicas a Esta Playlist
                  </h3>
                  <button type="button" class="back-btn-pill" id="btn-pl-close-add-songs" style="font-size:0.75rem; padding:4px 10px;">Fechar</button>
                </div>
                <div style="position:relative; margin-bottom:12px;">
                  <input type="text" id="pl-add-songs-search-input" placeholder="Buscar música ou artista para adicionar a esta playlist..." style="width:100%; background:rgba(0,0,0,0.45); border:1px solid rgba(255,255,255,0.18); border-radius:12px; padding:10px 14px 10px 38px; color:#fff; font-size:0.92rem;" />
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="position:absolute; left:12px; top:50%; transform:translateY(-50%); color:var(--text-muted);"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                </div>
                <div id="pl-add-songs-results" style="display:flex; flex-direction:column; gap:6px; max-height:280px; overflow-y:auto;"></div>
              </div>

              <div class="tracklist-table">
                ${pl.tracks.length === 0 ? `<div style="text-align:center; padding:32px; color:var(--text-muted);">Esta playlist ainda não possui faixas. Use o campo acima para adicionar qualquer música!</div>` : ""}
                ${pl.tracks.map((track, idx) => {
                  const isLiked = state.isLiked(track);
                  const tKey = normalizeTrackKey(track);
                  const safeTitle = String(track.title || "").replace(/"/g, "&quot;");
                  const safeArtist = String(track.artist || "").replace(/"/g, "&quot;");
                  const likeTip = isLiked ? "Remover das Músicas Curtidas" : "Curtir faixa — salvar em Músicas Curtidas";
                  return `
                  <div class="track-row ${state.currentTrack && (String(state.currentTrack.id) === String(track.id) || normalizeTrackKey(state.currentTrack) === tKey) ? 'playing' : ''}" data-pl-track-idx="${idx}" data-track-id="${track.id}" data-track-key="${tKey}">
                    <div class="track-num-col"><span>${idx + 1}</span></div>
                    <img class="track-row-cover" src="${ensureTrackCoverUrl(track, track.title, track.artist)}" alt="${track.title}" referrerpolicy="no-referrer" onerror="window.handleImgError(this, '${track.title.replace(/'/g, "")}', '${track.artist.replace(/'/g, "")}')" />
                    <div class="track-info-col">
                      <div class="track-title">${track.title}</div>
                      <div style="display:flex; align-items:center; margin-top:2px;">
                        <span class="track-artist">${track.artist}</span>
                        ${track.addedBy ? `
                          <span class="collab-contributor-tag">
                            <img src="${track.addedBy.avatar}" style="width:15px; height:15px; border-radius:50%; object-fit:cover;" onerror="window.handleCatAvatarError(this)" />
                            ${track.addedBy.username}
                          </span>
                        ` : ""}
                      </div>
                    </div>
                    <div class="track-duration-col">${track.duration}</div>
                    <div class="track-actions-col">
                      <button class="track-icon-btn btn-add-queue-direct" data-quick-queue-btn data-pl-queue-idx="${idx}" title="Adicionar à fila" aria-label="Adicionar à fila">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M4 6h16M4 12h10M4 18h10M18 15v6m3-3h-6"/></svg>
                      </button>
                      <button class="track-icon-btn ${isLiked ? 'liked' : ''}" data-pl-like-idx="${idx}" data-like-track-key="${tKey}" data-like-track-id="${track.id}" data-like-track-title="${safeTitle}" data-like-track-artist="${safeArtist}" data-tooltip="${likeTip}" title="${likeTip}" aria-label="${likeTip}">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="${isLiked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
                      </button>
                      <button class="track-icon-btn" data-pl-addother-idx="${idx}" data-tooltip="Adicionar à Playlist ou Criar Nova" title="Adicionar à Playlist ou Criar Nova" aria-label="Adicionar à Playlist ou Criar Nova">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      </button>
                      <button class="track-icon-btn" data-pl-share-idx="${idx}" data-tooltip="Compartilhar no Feed Miau & Copiar Link" title="Compartilhar no Feed Miau & Copiar Link" aria-label="Compartilhar no Feed Miau & Copiar Link">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                      </button>
                      <button class="track-icon-btn" data-pl-remove-idx="${idx}" data-tooltip="Remover da Playlist" title="Remover da Playlist" aria-label="Remover da Playlist">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>
                  </div>
                `;
                }).join("")}
              </div>
            </div>
          `;

          document.getElementById("btn-pl-back").addEventListener("click", () => this.historyBack());
          document.getElementById("btn-copy-sync-code").addEventListener("click", () => {
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(shareCode).then(() => showToast("Código Base64 copiado para a área de transferência!"));
            } else {
              showToast("Código gerado: " + shareCode.slice(0, 24) + "...");
            }
          });

          const handlePickPlaylistCover = () => {
            triggerImagePicker(async (dataUrl) => {
              state.setPlaylistCustomCover(pl.id, dataUrl);
              this.renderSidebarPlaylists();
              this.renderPlaylistView(pl.id);
              showToast(`Capa personalizada salva na playlist "${pl.name}"!`);
            });
          };

          const btnPlCoverTop = document.getElementById("btn-pl-pick-cover-top");
          if (btnPlCoverTop) btnPlCoverTop.addEventListener("click", handlePickPlaylistCover);
          const btnPlCoverBadge = document.getElementById("btn-pl-pick-cover-badge");
          if (btnPlCoverBadge) btnPlCoverBadge.addEventListener("click", handlePickPlaylistCover);
          const btnPlCoverHero = document.getElementById("btn-pl-pick-cover-hero");
          if (btnPlCoverHero) btnPlCoverHero.addEventListener("click", handlePickPlaylistCover);

          // Lógica Interativa para Adicionar Músicas a Esta Playlist
          const addSongsBox = document.getElementById("pl-add-songs-box");
          const toggleAddSongsBtn = document.getElementById("btn-pl-toggle-add-songs");
          const closeAddSongsBtn = document.getElementById("btn-pl-close-add-songs");
          const addSearchInput = document.getElementById("pl-add-songs-search-input");
          const addResultsContainer = document.getElementById("pl-add-songs-results");

          if (toggleAddSongsBtn && addSongsBox) {
            toggleAddSongsBtn.addEventListener("click", () => {
              const isHidden = addSongsBox.style.display === "none";
              addSongsBox.style.display = isHidden ? "block" : "none";
              if (isHidden && addSearchInput) {
                addSearchInput.focus();
                renderAddSongsList(addSearchInput.value.trim());
              }
            });
          }

          if (closeAddSongsBtn && addSongsBox) {
            closeAddSongsBtn.addEventListener("click", () => {
              addSongsBox.style.display = "none";
            });
          }

          const renderAddSongsList = async (query = "") => {
            if (!addResultsContainer) return;
            const qClean = query.toLowerCase();
            let pool = [];

            // Obter faixas dos álbuns precarregados
            state.albums.forEach(alb => {
              (alb.tracks || []).forEach(tr => {
                pool.push({
                  ...tr,
                  coverUrl: ensureTrackCoverUrl(tr, tr.title, tr.artist, alb.coverUrl),
                  albumId: alb.id
                });
              });
            });

            // Adicionar curtidas
            (state.user.likedTracks || []).forEach(tr => {
              pool.push(tr);
            });

            // Desduplicar do pool
            const uniquePool = deduplicateTracks(pool);

            let matches = uniquePool.filter(tr => {
              if (pl.tracks.some(existing => normalizeTrackKey(existing) === normalizeTrackKey(tr))) return false;
              if (!qClean) return true;
              return (tr.title && tr.title.toLowerCase().includes(qClean)) ||
                     (tr.artist && tr.artist.toLowerCase().includes(qClean));
            }).slice(0, 8);

            if (matches.length === 0 && qClean.length >= 2) {
              addResultsContainer.innerHTML = `<div style="padding:12px; font-size:0.8rem; color:var(--text-secondary); text-align:center;">Buscando faixas no catálogo global para "${query}"...</div>`;
              try {
                const searchRes = await MiadoMusicResolver.searchCatalog(query);
                if (searchRes && searchRes.songs && searchRes.songs.length > 0) {
                  matches = searchRes.songs.filter(tr => !pl.tracks.some(e => normalizeTrackKey(e) === normalizeTrackKey(tr))).slice(0, 8);
                }
              } catch (e) {}
            }

            if (matches.length === 0) {
              addResultsContainer.innerHTML = `<div style="padding:12px; font-size:0.8rem; color:var(--text-secondary); text-align:center;">Nenhuma música encontrada para adicionar. Tente pesquisar outro termo!</div>`;
              return;
            }

            addResultsContainer.innerHTML = matches.map((tr, mIdx) => `
              <div class="track-row" style="padding:6px 10px; border-radius:10px; background:rgba(255,255,255,0.02); min-height:48px;" data-pl-add-candidate="${mIdx}">
                <img src="${ensureTrackCoverUrl(tr, tr.title, tr.artist)}" style="width:36px; height:36px; border-radius:6px; object-fit:cover; margin-right:10px; flex-shrink:0;" onerror="window.handleImgError(this, '${tr.title.replace(/'/g, "")}', '${tr.artist.replace(/'/g, "")}')" />
                <div style="flex:1; min-width:0;">
                  <div style="font-size:0.85rem; font-weight:700; color:#fff;" class="text-truncate">${tr.title}</div>
                  <div style="font-size:0.73rem; color:var(--text-secondary);" class="text-truncate">${tr.artist}</div>
                </div>
                <div style="font-size:0.75rem; color:var(--text-muted); margin-right:8px;">${tr.duration || "3:30"}</div>
                <button type="button" class="album-action-btn primary" data-btn-add-track-to-pl="${mIdx}" style="height:30px; font-size:0.75rem; padding:0 12px; flex-shrink:0;">
                  + Adicionar
                </button>
              </div>
            `).join("");

            addResultsContainer.querySelectorAll("[data-btn-add-track-to-pl]").forEach(btn => {
              btn.addEventListener("click", (e) => {
                e.stopPropagation();
                const mIdx = parseInt(btn.dataset.btnAddTrackToPl);
                const trToAdd = matches[mIdx];
                if (!trToAdd) return;
                const newTrack = {
                  ...trToAdd,
                  coverUrl: ensureTrackCoverUrl(trToAdd, trToAdd.title, trToAdd.artist),
                  addedBy: { username: state.user.username, avatar: state.user.avatarUrl }
                };
                pl.tracks.push(newTrack);
                state.savePlaylists();
                this.renderPlaylistView(pl.id);
                showToast(`"${newTrack.title}" adicionada a "${pl.name}"!`);
              });
            });
          };

          if (addSearchInput) {
            let addDebounce = null;
            addSearchInput.addEventListener("input", () => {
              clearTimeout(addDebounce);
              addDebounce = setTimeout(() => {
                renderAddSongsList(addSearchInput.value.trim());
              }, 300);
            });
          }

          if (addSongsBox && addSongsBox.style.display !== "none") {
            renderAddSongsList();
          }

          const handleDeletePlaylist = () => {
            const removed = state.deletePlaylist(pl.id);
            if (removed) {
              this.renderSidebarPlaylists();
              this.setActiveNav("library");
              this.navigateTo("library", true);
              showToast(`Playlist "${removed.name}" apagada com sucesso!`);
            }
          };
          const btnPlDelTop = document.getElementById("btn-pl-delete");
          if (btnPlDelTop) btnPlDelTop.addEventListener("click", handleDeletePlaylist);
          const btnPlDelHero = document.getElementById("btn-pl-delete-hero");
          if (btnPlDelHero) btnPlDelHero.addEventListener("click", handleDeletePlaylist);

          document.getElementById("btn-pl-play-all").addEventListener("click", () => {
            if (!pl.tracks.length) return;
            const first = state.setQueue(pl.tracks, pl.tracks[0], false) || pl.tracks[0];
            engine.playTrack(first, { id: pl.id, title: pl.name, artist: first.artist || "Playlist Miau", isPlaylist: true, coverUrl: ensureTrackCoverUrl(first, first.title, first.artist) });
            this.renderRightSidebarBodyOnly();
          });

          document.getElementById("btn-pl-shuffle-all").addEventListener("click", () => {
            if (!pl.tracks.length) return;
            const picked = state.setQueue(pl.tracks, null, true) || state.queue[0];
            showToast("Reproduzindo playlist em Modo Aleatório!");
            engine.playTrack(picked, { id: pl.id, title: pl.name, artist: picked.artist || "Playlist Miau", isPlaylist: true, coverUrl: ensureTrackCoverUrl(picked, picked.title, picked.artist) });
            this.renderRightSidebarBodyOnly();
          });

          this.scrollContainer.querySelectorAll("[data-pl-track-idx]").forEach(row => {
            row.addEventListener("click", (e) => {
              if (e.target.closest(".track-actions-col")) return;
              const idx = parseInt(row.dataset.plTrackIdx);
              const track = pl.tracks[idx];
              if (track) {
                state.setQueue(pl.tracks, track, state.isShuffle);
                engine.playTrack(track, { id: pl.id, title: pl.name, artist: track.artist, isPlaylist: true, coverUrl: ensureTrackCoverUrl(track, track.title, track.artist) });
                this.renderRightSidebarBodyOnly();
              }
            });
          });

          this.scrollContainer.querySelectorAll("[data-pl-like-idx]").forEach(btn => {
            btn.addEventListener("click", (e) => {
              e.stopPropagation();
              const track = pl.tracks[parseInt(btn.dataset.plLikeIdx)];
              const nowLiked = state.toggleLike(track);
              btn.classList.remove("liked-pop");
              void btn.offsetWidth;
              if (nowLiked) btn.classList.add("liked-pop");
              engine.updateLikeButtonUI();
              this.syncAllLikeButtonsInDOM();
            });
          });

          this.scrollContainer.querySelectorAll("[data-pl-addother-idx]").forEach(btn => {
            btn.addEventListener("click", (e) => {
              e.stopPropagation();
              const track = pl.tracks[parseInt(btn.dataset.plAddotherIdx)];
              if (track) this.openTrackOptionsModal(track);
            });
          });

          this.scrollContainer.querySelectorAll("[data-pl-share-idx]").forEach(btn => {
            btn.addEventListener("click", (e) => {
              e.stopPropagation();
              const track = pl.tracks[parseInt(btn.dataset.plShareIdx)];
              if (track) this.shareTrack(track);
            });
          });

          this.scrollContainer.querySelectorAll("[data-pl-remove-idx]").forEach(btn => {
            btn.addEventListener("click", (e) => {
              e.stopPropagation();
              pl.tracks.splice(parseInt(btn.dataset.plRemoveIdx), 1);
              state.savePlaylists();
              this.renderPlaylistView(pl.id);
              showToast("Faixa removida da playlist");
            });
          });
        }

        renderLikedTracksView() {
          const likedTracks = deduplicateTracks(state.user.likedTracks);

          this.scrollContainer.innerHTML = `
            <div class="album-view-container">
              <div class="album-view-top-actions">
                <button class="back-btn-pill" id="btn-liked-back" style="color:#a855f7;">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
                  Voltar
                </button>
              </div>

              <div class="album-hero-center">
                <div style="width:200px; height:200px; border-radius:14px; background-color:var(--accent); border:1px solid var(--glass-border-strong); display:flex; align-items:center; justify-content:center; margin-bottom:20px;">
                  <svg width="72" height="72" viewBox="0 0 24 24" fill="#ffffff"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
                </div>
                <h1 class="album-hero-title">Músicas Curtidas</h1>
                <div class="album-hero-artist">${state.user.name}</div>
                <div class="album-meta-line">${likedTracks.length} FAIXAS SALVAS</div>

                <div class="album-action-buttons">
                  <button class="album-action-btn primary" id="btn-liked-play-all">
                    <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>
                    Play
                  </button>
                  <button class="album-action-btn" id="btn-liked-shuffle-all">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 3h5v5"/><path d="M4 20L21 3"/><path d="M21 16v5h-5"/><path d="M15 15l6 6"/><path d="M4 4l5 5"/></svg>
                    Aleatório
                  </button>
                </div>
              </div>

              <div class="tracklist-table">
                ${likedTracks.length === 0 ? `<div style="text-align:center; padding:32px; color:var(--text-muted);">Você ainda não curtiu nenhuma faixa.</div>` : ""}
                ${likedTracks.map((track, idx) => {
                  const tKey = normalizeTrackKey(track);
                  const safeTitle = String(track.title || "").replace(/"/g, "&quot;");
                  const safeArtist = String(track.artist || "").replace(/"/g, "&quot;");
                  return `
                  <div class="track-row ${state.currentTrack && (String(state.currentTrack.id) === String(track.id) || normalizeTrackKey(state.currentTrack) === tKey) ? 'playing' : ''}" data-liked-idx="${idx}" data-track-id="${track.id}" data-track-key="${tKey}">
                    <div class="track-num-col"><span>${idx + 1}</span></div>
                    <img class="track-row-cover" src="${ensureTrackCoverUrl(track)}" alt="${track.title}" referrerpolicy="no-referrer" onerror="window.handleImgError(this, '${track.title.replace(/'/g, "")}', '${track.artist.replace(/'/g, "")}')" />
                    <div class="track-info-col">
                      <div class="track-title">${track.title}</div>
                      <div class="track-artist">${track.artist}</div>
                    </div>
                    <div class="track-duration-col">${track.duration}</div>
                    <div class="track-actions-col">
                      <button class="track-icon-btn btn-add-queue-direct" data-quick-queue-btn data-liked-queue-idx="${idx}" title="Adicionar à fila" aria-label="Adicionar à fila">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M4 6h16M4 12h10M4 18h10M18 15v6m3-3h-6"/></svg>
                      </button>
                      <button class="track-icon-btn liked" data-unheart-idx="${idx}" data-like-track-key="${tKey}" data-like-track-id="${track.id}" data-like-track-title="${safeTitle}" data-like-track-artist="${safeArtist}" data-tooltip="Remover das Músicas Curtidas" title="Remover das Músicas Curtidas" aria-label="Remover das Músicas Curtidas">
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
                      </button>
                      <button class="track-icon-btn" data-liked-addpl-idx="${idx}" data-tooltip="Adicionar à Playlist ou Criar Nova" title="Adicionar à Playlist ou Criar Nova" aria-label="Adicionar à Playlist ou Criar Nova">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      </button>
                      <button class="track-icon-btn" data-liked-share-idx="${idx}" data-tooltip="Compartilhar no Feed Miau & Copiar Link" title="Compartilhar no Feed Miau & Copiar Link" aria-label="Compartilhar no Feed Miau & Copiar Link">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                      </button>
                    </div>
                  </div>
                `;
                }).join("")}
              </div>
            </div>
          `;

          document.getElementById("btn-liked-back").addEventListener("click", () => this.historyBack());
          document.getElementById("btn-liked-play-all").addEventListener("click", () => {
            if (!likedTracks.length) return;
            const first = state.setQueue(likedTracks, likedTracks[0], false);
            engine.playTrack(first || likedTracks[0], { id: "liked", title: "Músicas Curtidas", artist: state.user.name, coverUrl: ensureTrackCoverUrl(likedTracks[0]) });
            this.renderRightSidebarBodyOnly();
          });

          document.getElementById("btn-liked-shuffle-all").addEventListener("click", () => {
            if (!likedTracks.length) return;
            const picked = state.setQueue(likedTracks, null, true);
            showToast("Reproduzindo Músicas Curtidas em Modo Aleatório!");
            engine.playTrack(picked || state.queue[0], { id: "liked", title: "Músicas Curtidas", artist: state.user.name, coverUrl: ensureTrackCoverUrl(likedTracks[0]) });
            this.renderRightSidebarBodyOnly();
          });

          this.scrollContainer.querySelectorAll("[data-liked-idx]").forEach(row => {
            row.addEventListener("click", (e) => {
              if (e.target.closest(".track-actions-col")) return;
              const idx = parseInt(row.dataset.likedIdx);
              const track = likedTracks[idx];
              if (track) {
                state.setQueue(likedTracks, track, state.isShuffle);
                engine.playTrack(track, { id: "liked", title: "Músicas Curtidas", artist: track.artist, coverUrl: ensureTrackCoverUrl(track) });
                this.renderRightSidebarBodyOnly();
              }
            });
          });

          this.scrollContainer.querySelectorAll("[data-unheart-idx]").forEach(btn => {
            btn.addEventListener("click", (e) => {
              e.stopPropagation();
              const track = likedTracks[parseInt(btn.dataset.unheartIdx)];
              state.toggleLike(track);
              engine.updateLikeButtonUI();
              this.renderLikedTracksView();
            });
          });

          this.scrollContainer.querySelectorAll("[data-liked-addpl-idx]").forEach(btn => {
            btn.addEventListener("click", (e) => {
              e.stopPropagation();
              const track = likedTracks[parseInt(btn.dataset.likedAddplIdx)];
              if (track) this.openTrackOptionsModal(track);
            });
          });

          this.scrollContainer.querySelectorAll("[data-liked-share-idx]").forEach(btn => {
            btn.addEventListener("click", (e) => {
              e.stopPropagation();
              const track = likedTracks[parseInt(btn.dataset.likedShareIdx)];
              if (track) this.shareTrack(track);
            });
          });
        }

        async renderArtistView(artistName = "Lady Gaga") {
          const cleanArtist = (artistName || "").trim() || "Lady Gaga";
          this.scrollContainer.innerHTML = `<div style="padding:48px; text-align:center; color:var(--text-secondary);">Carregando perfil oficial, foto 1000x1000 HD e discografia de ${cleanArtist}...</div>`;

          const dirEntry = POPULAR_ARTISTS_DIRECTORY.find(a => a.name.toLowerCase() === cleanArtist.toLowerCase());
          let localAlbums = state.albums.filter(a => a.artist.toLowerCase().includes(cleanArtist.toLowerCase()));
          let songs = [];
          let apiAlbums = [];
          let artistPortrait = `/api/artist-image?name=${encodeURIComponent(cleanArtist)}`;
          let fanCount = 1450000;

          try {
            const profileData = await MiadoMusicResolver.fetchArtistProfile(cleanArtist);
            if (profileData) {
              songs = deduplicateTracks(profileData.songs || []);
              apiAlbums = profileData.albums || [];
              if (profileData.artist?.pictureUrl && !profileData.artist.pictureUrl.startsWith("data:")) {
                artistPortrait = profileData.artist.pictureUrl;
              }
              if (profileData.artist?.nbFan) {
                fanCount = profileData.artist.nbFan;
              }
            }
          } catch (e) {}

          if (songs.length === 0 && apiAlbums.length === 0) {
            try {
              const res = await MiadoMusicResolver.searchCatalog(cleanArtist);
              songs = deduplicateTracks(res.songs || []);
              apiAlbums = res.albums || [];
              if (res.artists?.[0]?.coverUrl && !res.artists[0].coverUrl.startsWith("data:")) {
                artistPortrait = res.artists[0].coverUrl;
              }
            } catch (e) {}
          }

          const mergedAlbums = [...localAlbums];
          apiAlbums.forEach(alb => {
            if (!mergedAlbums.some(m => m.title.toLowerCase() === alb.title.toLowerCase())) {
              mergedAlbums.push(alb);
            }
          });

          if (localAlbums.length > 0) {
            const localTracks = [];
            localAlbums.forEach(a => localTracks.push(...(a.tracks || [])));
            songs = deduplicateTracks([...songs, ...localTracks]);
          }

          this.currentArtistSongs = songs;

          const heroCover = artistPortrait || (dirEntry && dirEntry.coverUrl) || `/api/artist-image?name=${encodeURIComponent(cleanArtist)}`;
          const isFollowingArtist = state.isArtistFollowed(cleanArtist);

          this.scrollContainer.innerHTML = `
            <div class="album-view-container">
              <div class="album-ambient-glow" style="background-image: url('${heroCover}');"></div>

              <div class="album-view-top-actions">
                <button class="back-btn-pill" id="btn-artist-back" style="color:#a855f7;">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
                  Voltar
                </button>
              </div>

              <div class="album-hero-center">
                <img class="album-hero-artwork" style="width:210px; height:210px; border-radius:50%; border:none; box-shadow:0 12px 36px rgba(0,0,0,0.55); object-fit:cover;" src="${heroCover}" alt="${cleanArtist}" referrerpolicy="no-referrer" onerror="window.handleImgError(this, '${cleanArtist.replace(/'/g, "")}', 'Artista')" />
                <div class="technical-badge" style="margin-bottom:8px;">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="var(--accent-hover)"><polygon points="12 2 15 8 22 9 17 14 18 21 12 18 6 21 7 14 2 9 9 8 12 2"/></svg>
                  Artista Verificado · ${Number(fanCount).toLocaleString("pt-BR")} Ouvintes
                </div>
                <h1 class="album-hero-title">${cleanArtist}</h1>
                <div class="album-meta-line">${mergedAlbums.length} ÁLBUNS · ${songs.length} FAIXAS POPULARES</div>

                <div class="album-action-buttons">
                  <button class="album-action-btn primary" id="btn-artist-play">
                    <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>
                    Play
                  </button>
                  <button class="album-action-btn" id="btn-artist-shuffle">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 3h5v5"/><path d="M4 20L21 3"/><path d="M21 16v5h-5"/><path d="M15 15l6 6"/><path d="M4 4l5 5"/></svg>
                    Aleatório
                  </button>
                  <button class="album-action-btn ${isFollowingArtist ? 'primary' : ''}" id="btn-artist-follow-toggle" style="${isFollowingArtist ? 'background-color:rgba(168,85,247,0.22); border:1px solid var(--accent-hover); color:#ffffff;' : ''}">
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="${isFollowingArtist ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2.2"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
                    ${isFollowingArtist ? "✓ Seguindo Artista" : "+ Seguir Artista"}
                  </button>
                </div>
              </div>

              ${songs.length > 0 ? `
                <section class="showcase-section">
                  <div class="section-head">
                    <h2 class="section-title">Populares</h2>
                  </div>
                  <div class="tracklist-table">
                    ${songs.slice(0, 15).map((tr, idx) => {
                      const isLiked = state.isLiked(tr);
                      const tKey = normalizeTrackKey(tr);
                      const safeTitle = String(tr.title || "").replace(/"/g, "&quot;");
                      const safeArtist = String(tr.artist || cleanArtist || "").replace(/"/g, "&quot;");
                      const likeTip = isLiked ? "Remover das Músicas Curtidas" : "Curtir faixa — salvar em Músicas Curtidas";
                      return `
                      <div class="track-row ${state.currentTrack && (String(state.currentTrack.id) === String(tr.id) || normalizeTrackKey(state.currentTrack) === tKey) ? 'playing' : ''}" data-artist-song-idx="${idx}" data-track-id="${tr.id}" data-track-key="${tKey}">
                        <div class="track-num-col">
                          ${idx < 3 ? `<span class="popular-star"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></span>` : `<span style="width:10px; display:inline-block;"></span>`}
                          <span>${idx + 1}</span>
                        </div>
                        <img class="track-row-cover" src="${ensureTrackCoverUrl(tr, tr.title, cleanArtist, heroCover)}" alt="${tr.title}" referrerpolicy="no-referrer" onerror="window.handleImgError(this, '${tr.title.replace(/'/g, "")}', '${cleanArtist.replace(/'/g, "")}')" />
                        <div class="track-info-col">
                          <div class="track-title">${tr.title}</div>
                          <div class="track-artist">${tr.albumTitle || cleanArtist}</div>
                        </div>
                        <div class="track-duration-col">${tr.duration}</div>
                        <div class="track-actions-col">
                          <button class="track-icon-btn btn-add-queue-direct" data-quick-queue-btn data-artist-queue-idx="${idx}" title="Adicionar à fila" aria-label="Adicionar à fila">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M4 6h16M4 12h10M4 18h10M18 15v6m3-3h-6"/></svg>
                          </button>
                          <button class="track-icon-btn ${isLiked ? 'liked' : ''}" data-artist-like-idx="${idx}" data-like-track-key="${tKey}" data-like-track-id="${tr.id}" data-like-track-title="${safeTitle}" data-like-track-artist="${safeArtist}" data-tooltip="${likeTip}" title="${likeTip}" aria-label="${likeTip}">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="${isLiked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
                          </button>
                          <button class="track-icon-btn" data-artist-addpl-idx="${idx}" data-tooltip="Adicionar à Playlist ou Criar Nova" title="Adicionar à Playlist ou Criar Nova" aria-label="Adicionar à Playlist ou Criar Nova">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                          </button>
                          <button class="track-icon-btn" data-artist-share-idx="${idx}" data-tooltip="Compartilhar no Feed Miau & Copiar Link" title="Compartilhar no Feed Miau & Copiar Link" aria-label="Compartilhar no Feed Miau & Copiar Link">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                          </button>
                        </div>
                      </div>
                    `;
                    }).join("")}
                  </div>
                </section>
              ` : ""}

              ${mergedAlbums.length > 0 ? `
                <section class="showcase-section">
                  <div class="section-head">
                    <h2 class="section-title">Discografia Oficial</h2>
                  </div>
                  <div class="cards-row-scroll">
                    ${mergedAlbums.map((alb, aIdx) => `
                      <div class="album-card" data-artist-alb-idx="${aIdx}">
                        <div class="album-cover-wrap">
                          <img class="album-cover-img" src="${alb.coverUrl}" alt="${alb.title}" referrerpolicy="no-referrer" onerror="window.handleImgError(this, '${alb.title.replace(/'/g, "")}', '${alb.artist.replace(/'/g, "")}')" />
                          <button class="floating-card-play" data-artist-alb-play="${aIdx}" title="Tocar ${alb.title}">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>
                          </button>
                        </div>
                        <div class="album-card-title">${alb.title}</div>
                        <div class="album-card-sub">${alb.year || 2024} · Álbum</div>
                      </div>
                    `).join("")}
                  </div>
                </section>
              ` : ""}
            </div>
          `;

          document.getElementById("btn-artist-back").addEventListener("click", () => this.historyBack());
          document.getElementById("btn-artist-play").addEventListener("click", () => {
            if (!songs.length) return;
            const first = state.setQueue(songs, songs[0], false);
            engine.playTrack(first || songs[0], mergedAlbums[0] || { id: "artist", title: cleanArtist, artist: cleanArtist, coverUrl: heroCover });
            this.renderRightSidebarBodyOnly();
          });
          document.getElementById("btn-artist-shuffle").addEventListener("click", () => {
            if (!songs.length) return;
            const picked = state.setQueue(songs, null, true);
            showToast(`Modo Aleatório ativado para ${cleanArtist}!`);
            engine.playTrack(picked || state.queue[0], mergedAlbums[0] || { id: "artist", title: cleanArtist, artist: cleanArtist, coverUrl: heroCover });
            this.renderRightSidebarBodyOnly();
          });
          const btnFollowToggle = document.getElementById("btn-artist-follow-toggle");
          if (btnFollowToggle) {
            btnFollowToggle.addEventListener("click", () => {
              const nowFollowing = state.toggleFollowArtist({
                name: cleanArtist,
                coverUrl: heroCover,
                role: (dirEntry && dirEntry.role) || "Artista Verificado"
              });
              btnFollowToggle.classList.toggle("primary", nowFollowing);
              btnFollowToggle.style.cssText = nowFollowing
                ? "background-color:rgba(168,85,247,0.22); border:1px solid var(--accent-hover); color:#ffffff;"
                : "";
              btnFollowToggle.innerHTML = `
                <svg width="17" height="17" viewBox="0 0 24 24" fill="${nowFollowing ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2.2"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
                ${nowFollowing ? "✓ Seguindo Artista" : "+ Seguir Artista"}
              `;
              showToast(nowFollowing ? `Agora você segue ${cleanArtist}!` : `Você deixou de seguir ${cleanArtist}.`);
              this.renderRightSidebarBodyOnly();
            });
          }

          this.scrollContainer.querySelectorAll("[data-artist-song-idx]").forEach(row => {
            row.addEventListener("click", (e) => {
              if (e.target.closest(".track-actions-col")) return;
              const idx = parseInt(row.dataset.artistSongIdx);
              const tr = songs[idx];
              if (tr) {
                state.setQueue(songs, tr, state.isShuffle);
                engine.playTrack(tr, mergedAlbums[0] || { id: "artist", title: tr.albumTitle || cleanArtist, artist: cleanArtist, coverUrl: ensureTrackCoverUrl(tr, tr.title, cleanArtist, heroCover) });
                this.renderRightSidebarBodyOnly();
              }
            });
          });

          this.scrollContainer.querySelectorAll("[data-artist-like-idx]").forEach(btn => {
            btn.addEventListener("click", (e) => {
              e.stopPropagation();
              const tr = songs[parseInt(btn.dataset.artistLikeIdx)];
              if (tr) {
                const nowLiked = state.toggleLike(tr);
                btn.classList.remove("liked-pop");
                void btn.offsetWidth;
                if (nowLiked) btn.classList.add("liked-pop");
                engine.updateLikeButtonUI();
                this.syncAllLikeButtonsInDOM();
              }
            });
          });

          this.scrollContainer.querySelectorAll("[data-artist-addpl-idx]").forEach(btn => {
            btn.addEventListener("click", (e) => {
              e.stopPropagation();
              const tr = songs[parseInt(btn.dataset.artistAddplIdx)];
              if (tr) {
                this.openTrackOptionsModal(tr, mergedAlbums[0] || { id: "artist", title: tr.albumTitle || cleanArtist, artist: cleanArtist, coverUrl: ensureTrackCoverUrl(tr, tr.title, cleanArtist, heroCover) });
              }
            });
          });

          this.scrollContainer.querySelectorAll("[data-artist-share-idx]").forEach(btn => {
            btn.addEventListener("click", (e) => {
              e.stopPropagation();
              const tr = songs[parseInt(btn.dataset.artistShareIdx)];
              if (tr) {
                this.shareTrack(tr, mergedAlbums[0] || { id: "artist", title: tr.albumTitle || cleanArtist, artist: cleanArtist, coverUrl: ensureTrackCoverUrl(tr, tr.title, cleanArtist, heroCover) });
              }
            });
          });

          this.scrollContainer.querySelectorAll("[data-artist-alb-idx]").forEach(card => {
            card.addEventListener("click", (e) => {
              if (e.target.closest("[data-artist-alb-play]")) return;
              const alb = mergedAlbums[parseInt(card.dataset.artistAlbIdx)];
              if (alb) {
                this.navigateTo("album", true, { albumId: alb.id, customAlbum: alb });
              }
            });
          });

          this.scrollContainer.querySelectorAll("[data-artist-alb-play]").forEach(btn => {
            btn.addEventListener("click", async (e) => {
              e.stopPropagation();
              const alb = mergedAlbums[parseInt(btn.dataset.artistAlbPlay)];
              if (alb) {
                if (!alb.tracks || alb.tracks.length < 3) {
                  const details = await MiadoMusicResolver.fetchAlbumDetails(alb);
                  if (details && Array.isArray(details.tracks) && details.tracks.length > 0) {
                    alb.tracks = deduplicateTracks(details.tracks);
                  }
                }
                const trList = (alb.tracks && alb.tracks.length > 0) ? alb.tracks : songs;
                if (trList.length > 0) {
                  const first = state.setQueue(trList, trList[0], state.isShuffle);
                  engine.playTrack(first || trList[0], alb);
                  this.renderRightSidebarBodyOnly();
                }
              }
            });
          });
        }

        renderSidebarPlaylists() {
          const container = document.getElementById("sidebar-playlists-container");
          if (!container) return;
          container.innerHTML = state.playlists.map(pl => `
            <div class="playlist-list-item ${state.currentView === 'playlist' && state.activePlaylistId === pl.id ? 'active' : ''}" data-sidebar-pl-id="${pl.id}">
              <span class="text-truncate" style="flex:1;">${pl.name}</span>
              <div style="display:flex; align-items:center; gap:6px; flex:0 0 auto;">
                ${pl.isCollaborative ? `<span class="collab-tag">Conjunta</span>` : ""}
                <button type="button" data-sidebar-del-pl="${pl.id}" title="Apagar playlist ${pl.name}" style="background:transparent; border:none; color:var(--text-muted); cursor:pointer; padding:2px 4px; display:flex; align-items:center; justify-content:center; border-radius:6px;">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                </button>
              </div>
            </div>
          `).join("");

          container.querySelectorAll("[data-sidebar-pl-id]").forEach(item => {
            item.addEventListener("click", (e) => {
              if (e.target.closest("[data-sidebar-del-pl]")) return;
              e.preventDefault();
              this.closeAllModals();
              const plId = item.dataset.sidebarPlId;
              this.setActiveNav("playlist", plId);
              this.navigateTo("playlist", true, { playlistId: plId });
            });
          });

          container.querySelectorAll("[data-sidebar-del-pl]").forEach(btn => {
            btn.addEventListener("click", (e) => {
              e.preventDefault();
              e.stopPropagation();
              const plId = btn.dataset.sidebarDelPl;
              const removed = state.deletePlaylist(plId);
              if (removed) {
                this.renderSidebarPlaylists();
                if (state.currentView === "playlist" && state.activePlaylistId === plId) {
                  this.setActiveNav("library");
                  this.navigateTo("library", true);
                } else if (state.currentView === "library") {
                  this.renderLibraryView();
                } else if (state.currentView === "profile") {
                  this.renderProfileView();
                } else if (state.currentView === "home") {
                  this.renderHomeView();
                }
                showToast(`Playlist "${removed.name}" apagada!`);
              }
            });
          });
        }

        renderRightSidebar() {
          const btnFriends = document.getElementById("tab-friends-activity");
          const btnQueue = document.getElementById("tab-queue-list");

          btnFriends.addEventListener("click", () => {
            this.activeRightTab = "friends";
            btnFriends.classList.add("active");
            btnQueue.classList.remove("active");
            this.renderRightSidebarBodyOnly();
          });

          btnQueue.addEventListener("click", () => {
            this.activeRightTab = "queue";
            btnQueue.classList.add("active");
            btnFriends.classList.remove("active");
            this.renderRightSidebarBodyOnly();
          });

          this.renderRightSidebarBodyOnly();
        }

        renderRightSidebarBodyOnly() {
          if (this.activeRightTab === "queue") {
            this.renderQueue();
          } else {
            this.renderFriendsActivity();
          }
        }

        renderFriendsActivity() {
          const container = document.getElementById("right-sidebar-body");
          container.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;">
              <div style="font-size:0.75rem; text-transform:uppercase; letter-spacing:0.06em; color:var(--text-muted); font-weight:700;">Amigos Seguidos (${state.friends.length})</div>
              <button type="button" class="btn-see-all" id="btn-sidebar-find-friends" style="font-size:0.7rem;">+ Buscar Amigos</button>
            </div>
            ${state.friends.length === 0 ? `
              <div class="friend-activity-card" style="padding:12px; text-align:center;">
                <div style="font-size:0.8rem; font-weight:700; color:#ffffff;">Nenhum perfil falso!</div>
                <div style="font-size:0.73rem; color:var(--text-secondary); margin-top:4px;">Busque ou crie o perfil dos seus amigos reais no Feed Miau para segui-los.</div>
                <button type="button" class="album-action-btn primary" id="btn-sidebar-open-social" style="width:100%; height:32px; font-size:0.75rem; margin-top:10px;">
                  Encontrar / Criar Perfis
                </button>
              </div>
            ` : state.friends.map((f, idx) => `
              <div class="friend-activity-card">
                <div class="friend-top-row" data-friend-album="${f.albumId}">
                  <img class="friend-avatar" src="${f.avatar}" alt="${f.name}" onerror="window.handleCatAvatarError(this)" />
                  <div class="friend-info">
                    <div class="friend-name-row">
                      <span class="friend-name">${f.name}</span>
                      ${f.online ? `<span class="friend-online-badge">ON</span>` : ""}
                    </div>
                    <div class="friend-handle">${f.username}</div>
                  </div>
                </div>
                <div class="friend-track-pill">
                  <div class="friend-status" title="${f.currentTrack}">${f.currentTrack}</div>
                  <div style="display:flex; align-items:center; gap:4px;">
                    <button class="track-icon-btn" style="width:28px; height:28px; color:var(--accent-hover);" data-sidebar-play-friend="${idx}" title="Tocar essa música">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>
                    </button>
                    <button class="track-icon-btn ${f.likedByMe ? 'liked' : ''}" style="width:28px; height:28px;" data-sidebar-like-friend="${idx}" title="Curtir atividade">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="${f.likedByMe ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
                    </button>
                  </div>
                </div>
              </div>
            `).join("")}

            <div style="font-size:0.75rem; text-transform:uppercase; letter-spacing:0.06em; color:var(--text-muted); font-weight:700; margin:18px 0 10px;">Artistas Seguidos (${state.followedArtists.length})</div>
            ${state.followedArtists.map((art) => `
              <div class="friend-activity-card" style="padding:10px; cursor:pointer;" data-sidebar-open-artist="${art.name}">
                <div style="display:flex; align-items:center; gap:10px;">
                  <img src="${art.coverUrl}" style="width:36px; height:36px; border-radius:50%; object-fit:cover; border:1px solid var(--accent-hover);" alt="${art.name}" referrerpolicy="no-referrer" onerror="window.handleImgError(this, '${art.name.replace(/'/g, "")}', 'Artista')" />
                  <div style="flex:1; min-width:0;">
                    <div style="font-size:0.84rem; font-weight:700; color:#ffffff;" class="text-truncate">${art.name}</div>
                    <div style="font-size:0.7rem; color:var(--accent-hover);" class="text-truncate">${art.role || "Artista Oficial"}</div>
                  </div>
                </div>
              </div>
            `).join("")}

            <div style="font-size:0.75rem; text-transform:uppercase; letter-spacing:0.06em; color:var(--text-muted); font-weight:700; margin:18px 0 10px;">Suas Publicações no Feed</div>
            ${state.feedPosts.slice(0, 4).map((post, pIdx) => {
              const tr = post.track || INITIAL_ALBUMS[0].tracks[0];
              return `
                <div class="friend-activity-card" style="padding:10px;">
                  <div style="font-size:0.78rem; color:#fff; line-height:1.35;">
                    <strong style="color:var(--accent-hover);">${post.username}</strong> ${post.actionText || "acabou de ouvir"} <strong>${tr.title}</strong>
                  </div>
                  <div style="display:flex; align-items:center; justify-content:space-between; margin-top:6px;">
                    <span style="font-size:0.68rem; color:var(--text-muted);">${post.time || "agora mesmo"}</span>
                    <button class="btn-see-all" style="font-size:0.72rem;" data-sidebar-play-post="${pIdx}">Dar Play</button>
                  </div>
                </div>
              `;
            }).join("")}
          `;

          const btnFindFriends = document.getElementById("btn-sidebar-find-friends");
          if (btnFindFriends) {
            btnFindFriends.addEventListener("click", () => {
              this.setActiveNav("social");
              this.navigateTo("social", true);
            });
          }
          const btnOpenSocial = document.getElementById("btn-sidebar-open-social");
          if (btnOpenSocial) {
            btnOpenSocial.addEventListener("click", () => {
              this.setActiveNav("social");
              this.navigateTo("social", true);
            });
          }

          container.querySelectorAll("[data-sidebar-open-artist]").forEach(card => {
            card.addEventListener("click", () => {
              this.navigateTo("artist", true, { artistName: card.dataset.sidebarOpenArtist });
            });
          });

          container.querySelectorAll("[data-friend-album]").forEach(row => {
            row.addEventListener("click", () => {
              this.navigateTo("album", true, { albumId: row.dataset.friendAlbum });
            });
          });

          container.querySelectorAll("[data-sidebar-play-friend]").forEach(btn => {
            btn.addEventListener("click", (e) => {
              e.stopPropagation();
              const f = state.friends[parseInt(btn.dataset.sidebarPlayFriend)];
              const alb = state.albums.find(a => a.id === f.albumId) || state.albums[0];
              const tr = f.trackObj || alb.tracks[0];
              if (tr) {
                state.queue = [...alb.tracks];
                state.queueIndex = 0;
                engine.playTrack(tr, alb);
              }
            });
          });

          container.querySelectorAll("[data-sidebar-like-friend]").forEach(btn => {
            btn.addEventListener("click", (e) => {
              e.stopPropagation();
              const f = state.friends[parseInt(btn.dataset.sidebarLikeFriend)];
              f.likedByMe = !f.likedByMe;
              state.saveFriends();
              showToast(f.likedByMe ? `Curtiu ${f.username}` : "Curtida removida");
              this.renderFriendsActivity();
            });
          });

          container.querySelectorAll("[data-sidebar-play-post]").forEach(btn => {
            btn.addEventListener("click", () => {
              const post = state.feedPosts[parseInt(btn.dataset.sidebarPlayPost)];
              if (post && post.track) {
                const alb = state.albums.find(a => a.id === post.albumId || a.id === post.track.albumId) || state.albums[0];
                engine.playTrack(post.track, alb);
              }
            });
          });
        }

        renderQueue() {
          const container = document.getElementById("right-sidebar-body");
          if (!container) return;

          if (!Array.isArray(state.queue) || state.queue.length === 0) {
            container.innerHTML = `
              <div style="text-align:center; padding:32px 14px; color:var(--text-muted);">
                <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="margin-bottom:8px; opacity:0.6;"><path d="M4 6h16M4 12h10M4 18h10M18 15v6m3-3h-6"/></svg>
                <div style="font-weight:700; color:#fff; font-size:0.88rem;">Sua fila está vazia</div>
                <div style="font-size:0.74rem; color:var(--text-secondary); margin-top:4px;">Adicione faixas de qualquer álbum ou artista para ouvi-las a seguir.</div>
              </div>
            `;
            return;
          }

          const currentIdx = state.queueIndex ?? 0;
          const currentTr = state.queue[currentIdx] || state.currentTrack;
          const upcoming = state.queue.slice(currentIdx + 1);

          const manualUpcoming = upcoming.filter(t => t && t._isManualQueue);
          const contextUpcoming = upcoming.filter(t => t && !t._isManualQueue);

          container.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
              <div style="font-size:0.75rem; text-transform:uppercase; letter-spacing:0.06em; color:var(--text-muted); font-weight:800;">Fila de Reprodução (${state.queue.length})</div>
              ${upcoming.length > 0 ? `<button id="btn-clear-queue" style="font-size:0.75rem; color:var(--accent-hover); font-weight:700; cursor:pointer;">Limpar Fila</button>` : ""}
            </div>

            <!-- 1. TOCANDO AGORA -->
            ${currentTr ? `
              <div style="font-size:0.72rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em; color:var(--accent-hover); margin-bottom:6px;">Tocando Agora</div>
              <div class="track-row playing" style="min-height:48px; padding:6px 8px; border-radius:10px; margin-bottom:12px; gap:8px;" data-queue-idx="${currentIdx}">
                <img class="track-row-cover" style="width:38px; height:38px; border-radius:6px;" src="${ensureTrackCoverUrl(currentTr)}" alt="${currentTr.title}" referrerpolicy="no-referrer" onerror="window.handleImgError(this, '${currentTr.title.replace(/'/g, "")}', '${currentTr.artist.replace(/'/g, "")}')" />
                <div class="track-info-col">
                  <div class="track-title" style="font-size:0.85rem; color:#fff; font-weight:700;">${currentTr.title}</div>
                  <div class="track-artist" style="font-size:0.73rem;">${currentTr.artist}</div>
                </div>
                <div style="display:flex; align-items:center; gap:2px; margin-right:4px;">
                  <button class="track-icon-btn" style="width:28px; height:28px;" data-queue-addpl="${currentIdx}" title="Adicionar à Playlist">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  </button>
                </div>
              </div>
            ` : ""}

            <!-- 2. A SEGUIR NA FILA (MANUAIS DO USUÁRIO) -->
            ${manualUpcoming.length > 0 ? `
              <div style="font-size:0.72rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em; color:var(--text-secondary); margin-bottom:6px;">A Seguir na Fila (${manualUpcoming.length})</div>
              ${manualUpcoming.map((track) => {
                const globalIdx = state.queue.indexOf(track);
                return `
                <div class="track-row" style="min-height:46px; padding:5px 8px; border-radius:8px; margin-bottom:4px; gap:8px;" data-queue-idx="${globalIdx}">
                  <img class="track-row-cover" style="width:36px; height:36px; border-radius:6px;" src="${ensureTrackCoverUrl(track)}" alt="${track.title}" referrerpolicy="no-referrer" onerror="window.handleImgError(this, '${track.title.replace(/'/g, "")}', '${track.artist.replace(/'/g, "")}')" />
                  <div class="track-info-col">
                    <div class="track-title" style="font-size:0.83rem;">${track.title}</div>
                    <div class="track-artist" style="font-size:0.72rem;">${track.artist}</div>
                  </div>
                  <div style="display:flex; align-items:center; gap:2px;">
                    <button class="track-icon-btn" style="width:28px; height:28px;" data-queue-addpl="${globalIdx}" title="Adicionar à Playlist">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    </button>
                    <button class="track-icon-btn" style="width:28px; height:28px;" data-remove-queue="${globalIdx}" title="Remover da fila">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </div>
                </div>
                `;
              }).join("")}
            ` : ""}

            <!-- 3. A SEGUIR DO CONTEXTO ATUAL -->
            ${contextUpcoming.length > 0 ? `
              <div style="font-size:0.72rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em; color:var(--text-muted); margin:12px 0 6px;">
                A Seguir de: ${(state.currentAlbum && state.currentAlbum.title) || "Álbum Atual"}
              </div>
              ${contextUpcoming.slice(0, 20).map((track) => {
                const globalIdx = state.queue.indexOf(track);
                return `
                <div class="track-row" style="min-height:46px; padding:5px 8px; border-radius:8px; margin-bottom:4px; gap:8px;" data-queue-idx="${globalIdx}">
                  <img class="track-row-cover" style="width:36px; height:36px; border-radius:6px;" src="${ensureTrackCoverUrl(track)}" alt="${track.title}" referrerpolicy="no-referrer" onerror="window.handleImgError(this, '${track.title.replace(/'/g, "")}', '${track.artist.replace(/'/g, "")}')" />
                  <div class="track-info-col">
                    <div class="track-title" style="font-size:0.83rem;">${track.title}</div>
                    <div class="track-artist" style="font-size:0.72rem;">${track.artist}</div>
                  </div>
                  <div style="display:flex; align-items:center; gap:2px;">
                    <button class="track-icon-btn" style="width:28px; height:28px;" data-queue-addpl="${globalIdx}" title="Adicionar à Playlist">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    </button>
                    <button class="track-icon-btn" style="width:28px; height:28px;" data-remove-queue="${globalIdx}" title="Remover da fila">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </div>
                </div>
                `;
              }).join("")}
            ` : ""}
          `;

          const clearBtn = document.getElementById("btn-clear-queue");
          if (clearBtn) {
            clearBtn.addEventListener("click", () => {
              state.queue = state.currentTrack ? [state.currentTrack] : [];
              state.queueIndex = 0;
              state.manualQueueCount = 0;
              this.renderQueue();
              showToast("Fila limpa com sucesso.");
            });
          }

          container.querySelectorAll("[data-queue-addpl]").forEach(btn => {
            btn.addEventListener("click", (e) => {
              e.stopPropagation();
              const tr = state.queue[parseInt(btn.dataset.queueAddpl)];
              if (tr) this.openTrackOptionsModal(tr);
            });
          });

          container.querySelectorAll("[data-remove-queue]").forEach(btn => {
            btn.addEventListener("click", (e) => {
              e.stopPropagation();
              state.queue.splice(parseInt(btn.dataset.removeQueue), 1);
              this.renderQueue();
            });
          });

          container.querySelectorAll("[data-queue-idx]").forEach(row => {
            row.addEventListener("click", (e) => {
              if (e.target.closest("[data-remove-queue]") || e.target.closest("[data-queue-addpl]")) return;
              const idx = parseInt(row.dataset.queueIdx);
              state.queueIndex = idx;
              const tr = state.queue[idx];
              engine.playTrack(tr, { id: tr.albumId, title: tr.albumTitle, artist: tr.artist, coverUrl: ensureTrackCoverUrl(tr) });
              this.renderQueue();
            });
          });
        }
      }

      window.miadoUI = new MiadoUI();
      MiadoMusicResolver.hydrateInitialCatalog();
    })();
}
