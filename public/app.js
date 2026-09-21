/**
 * Ɔkwankyerɛfo Pa — Voice Accessibility Layer & Dataset Integration Studio
 * Client-Side Controller
 */

(function () {
  'use strict';

  // ── DTMF Telephone Audio Synthesizer (Web Audio API) ──────────────────
  class DtmfSynthesizer {
    constructor() {
      this.ctx = null;
      this.enabled = true;
      // Standard ITU-T Q.23 DTMF Frequencies (Hz)
      this.freqs = {
        '1': [697, 1209], '2': [697, 1336], '3': [697, 1477],
        '4': [770, 1209], '5': [770, 1336], '6': [770, 1477],
        '7': [852, 1209], '8': [852, 1336], '9': [852, 1477],
        '*': [941, 1209], '0': [941, 1336], '#': [941, 1477]
      };
    }

    init() {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          this.ctx = new AudioCtx();
        }
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    }

    playTone(digit, durationMs = 160) {
      if (!this.enabled) return;
      this.init();
      if (!this.ctx || !this.freqs[digit]) return;

      const [f1, f2] = this.freqs[digit];
      const now = this.ctx.currentTime;
      const durationSec = durationMs / 1000;

      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gainNode = this.ctx.createGain();

      osc1.frequency.value = f1;
      osc2.frequency.value = f2;

      // Soft envelope to avoid clicking
      gainNode.gain.setValueAtTime(0.01, now);
      gainNode.gain.linearRampToValueAtTime(0.12, now + 0.01);
      gainNode.gain.linearRampToValueAtTime(0.01, now + durationSec);

      osc1.connect(gainNode);
      osc2.connect(gainNode);
      gainNode.connect(this.ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + durationSec);
      osc2.stop(now + durationSec);
    }
  }

  // ── Main Application Controller ───────────────────────────────────────
  const app = {
    dtmf: new DtmfSynthesizer(),
    callState: {
      active: false,
      step: 'idle',
      lang: 'twi',
      service: 'momo',
      provider: 'MTN',
      phone: '0553838464',
      name: 'Kwame Nyamebere',
      amount: '500',
      lastInput: '',
      timerInterval: null,
      seconds: 0,
      sessionId: 'session_' + Math.random().toString(36).substring(2, 9),
      activeConvState: null,
      enteredPinDigits: ''
    },
    phrases: [],
    subscribers: [],
    prototypeData: null,
    activePrototypeAudio: null,
    activePrototypeIdx: null,
    twiData: null,
    activeTwiAudio: null,
    activeTwiIdx: null,
    voiceMode: 'twi', // 'twi' (Authentic Twi Studio Audio) | 'en' (Dedicated English Audio) | 'auto' (Interactive IVR)
    recorder: {
      mediaRecorder: null,
      audioChunks: [],
      stream: null,
      timerInterval: null,
      seconds: 0,
      recordedBlob: null
    },
    uploadFile: null,

    // ── Initialization ──────────────────────────────────────────────────
    init() {
      this.bindKeyboard();
      this.loadStatus();
      this.checkRenderStatus();
      this.loadPhrases();
      this.loadPrototypeAudio();
      this.loadTwiAudio();
      this.loadSubscribers();
      this.initWaveformCanvas();
      this.setIdleState();

      // Pre-bind user interaction gestures anywhere on page to unlock media playback
      const unlockHandler = () => {
        this.unlockAudio();
        document.removeEventListener('pointerdown', unlockHandler);
        document.removeEventListener('keydown', unlockHandler);
      };
      document.addEventListener('pointerdown', unlockHandler, { once: true });
      document.addEventListener('keydown', unlockHandler, { once: true });

      // Setup dropzone
      const dropzone = document.getElementById('audioDropzone');
      if (dropzone) {
        ['dragenter', 'dragover'].forEach(name => {
          dropzone.addEventListener(name, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.add('dragover');
          });
        });
        ['dragleave', 'drop'].forEach(name => {
          dropzone.addEventListener(name, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.remove('dragover');
          });
        });
        dropzone.addEventListener('drop', (e) => {
          const dt = e.dataTransfer;
          const files = dt.files;
          if (files && files[0]) {
            this.setUploadFile(files[0]);
          }
        });
      }
    },

    // ── Navigation Tabs ─────────────────────────────────────────────────
    switchTab(tabId) {
      document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));

      const btnMap = {
        'simulator': 'tabBtnSimulator',
        'studio': 'tabBtnStudio',
        'kyc': 'tabBtnKyc',
        'grammar': 'tabBtnNavGrammar',
        'api': 'tabBtnApi'
      };
      const panelMap = {
        'simulator': 'panelSimulator',
        'studio': 'panelStudio',
        'kyc': 'panelKyc',
        'grammar': 'panelGrammar',
        'api': 'panelApi'
      };

      const btn = document.getElementById(btnMap[tabId]);
      const panel = document.getElementById(panelMap[tabId]);
      if (btn) btn.classList.add('active');
      if (panel) panel.classList.add('active');
    },

    switchCodeTab(tab) {
      document.querySelectorAll('.code-tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.code-tab-content').forEach(c => c.classList.remove('active'));

      if (tab === 'python') {
        document.getElementById('codeTabPython').classList.add('active');
        document.getElementById('codeContentPython').classList.add('active');
      } else if (tab === 'curl') {
        document.getElementById('codeTabCurl').classList.add('active');
        document.getElementById('codeContentCurl').classList.add('active');
      } else if (tab === 'node') {
        document.getElementById('codeTabNode').classList.add('active');
        document.getElementById('codeContentNode').classList.add('active');
      }
    },

    // ── Load Server Status ──────────────────────────────────────────────
    async loadStatus() {
      try {
        const res = await fetch('/health');
        const data = await res.json();
        const liveOrigin = window.location.origin;
        const liveCallback = `${liveOrigin}/voice-menu`;

        const cfgBaseUrl = document.getElementById('cfgBaseUrl');
        if (cfgBaseUrl) cfgBaseUrl.innerText = liveOrigin;

        const cfgCallbackUrl = document.getElementById('cfgCallbackUrl');
        if (cfgCallbackUrl) cfgCallbackUrl.innerText = '/voice-menu';

        const inputLiveCallbackUrl = document.getElementById('inputLiveCallbackUrl');
        if (inputLiveCallbackUrl) inputLiveCallbackUrl.value = liveCallback;

        const cfgVoiceNumber = document.getElementById('cfgVoiceNumber');
        if (cfgVoiceNumber && data.voiceNumber) cfgVoiceNumber.innerText = data.voiceNumber;

        const cfgUsername = document.getElementById('cfgUsername');
        if (cfgUsername && data.username) cfgUsername.innerText = data.username;
      } catch (err) {
        console.error('Failed to load status:', err);
      }
    },

    copyCallbackUrl() {
      const liveCallback = `${window.location.origin}/voice-menu`;
      navigator.clipboard.writeText(liveCallback).then(() => {
        const btn = document.getElementById('btnCopyCallbackUrl');
        if (btn) {
          const original = btn.innerHTML;
          btn.innerHTML = '✅ Copied to Clipboard!';
          btn.style.background = '#059669';
          setTimeout(() => {
            btn.innerHTML = original;
            btn.style.background = '';
          }, 3000);
        }
      }).catch(err => {
        alert('Callback URL: ' + liveCallback);
      });
    },

    async testInboundWebhook() {
      const statusBox = document.getElementById('testWebhookStatus');
      const btn = document.getElementById('btnTestInboundWebhook');
      if (statusBox) {
        statusBox.style.display = 'block';
        statusBox.style.color = '#38bdf8';
        statusBox.innerText = 'Simulating incoming Africa\'s Talking call (POST /voice-menu)...';
      }
      try {
        const res = await fetch('/voice-menu', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            isActive: '1',
            direction: 'Inbound',
            callerNumber: '+233543546010',
            destinationNumber: '+233308048098',
            sessionId: 'ATVId_sim_' + Date.now()
          })
        });
        const xml = await res.text();
        if (statusBox) {
          statusBox.style.color = '#4ade80';
          statusBox.innerText = `✅ Inbound Gateway Active!\nHTTP ${res.status} OK (VoiceXML Generated with Barge-In):\n\n${xml}`;
        }
      } catch (err) {
        if (statusBox) {
          statusBox.style.color = '#f87171';
          statusBox.innerText = '❌ Error testing inbound webhook: ' + err.message;
        }
      }
    },

    async checkRenderStatus() {
      const statusBadge = document.getElementById('renderStatusBadge');
      const descEl = document.getElementById('renderStatusDesc');
      if (statusBadge) {
        statusBadge.innerText = 'Checking Render...';
        statusBadge.style.background = '#475569';
        statusBadge.style.color = '#fff';
      }
      try {
        const res = await fetch('/api/render/status');
        const data = await res.json();
        if (data.online) {
          if (data.inSync) {
            if (statusBadge) {
              statusBadge.innerText = 'Render Cloud: Synchronized & Live';
              statusBadge.style.background = '#059669';
            }
            if (descEl) {
              descEl.innerHTML = '<span style="color:#10b981;">✅ Render Cloud is running the latest build with instant barge-in support.</span>';
            }
          } else {
            if (statusBadge) {
              statusBadge.innerText = 'Render Cloud: Online (Sync Pending)';
              statusBadge.style.background = '#d97706';
            }
            if (descEl) {
              descEl.innerHTML = '<span style="color:#f59e0b;">⚠️ Render is online, but running an earlier commit without instant barge-in.</span><br>' +
                'Push or Export the latest code from GitHub to trigger Render\'s auto-deploy, or use the Cloud Run Callback URL above for immediate live testing.';
            }
          }
        } else {
          if (statusBadge) {
            statusBadge.innerText = 'Render Cloud: Sleeping / Cold Start';
            statusBadge.style.background = '#64748b';
          }
          if (descEl) {
            descEl.innerHTML = '<span style="color:#94a3b8;">Render instance is spinning up. Retrying in a few moments...</span>';
          }
        }
      } catch (err) {
        if (statusBadge) {
          statusBadge.innerText = 'Render Cloud: Offline';
          statusBadge.style.background = '#dc2626';
        }
      }
    },

    // ── Load Phrase Bank ────────────────────────────────────────────────
    async loadPhrases() {
      try {
        const res = await fetch('/api/phrase-bank');
        const data = await res.json();
        this.phrases = data.phrases || [];
        this.renderPhraseCatalog();
        this.populatePhraseSelects();
        this.updateDatasetMetrics();
      } catch (err) {
        console.error('Failed to load phrases:', err);
      }
    },

    updateDatasetMetrics() {
      const total = this.phrases.length;
      const native = this.phrases.filter(p => p.exists).length;
      const tts = total - native;

      const dsTotalPhrases = document.getElementById('dsTotalPhrases');
      if (dsTotalPhrases) dsTotalPhrases.innerText = total;

      const dsNativeAudioCount = document.getElementById('dsNativeAudioCount');
      if (dsNativeAudioCount) dsNativeAudioCount.innerText = native;

      const dsTtsFallbackCount = document.getElementById('dsTtsFallbackCount');
      if (dsTtsFallbackCount) dsTtsFallbackCount.innerText = tts;

      const statCoverage = document.getElementById('statCoverage');
      if (statCoverage) {
        const pct = total > 0 ? Math.round((native / total) * 100) : 0;
        statCoverage.innerText = `${pct}% Native`;
      }

      const statDatasetSamples = document.getElementById('statDatasetSamples');
      if (statDatasetSamples) statDatasetSamples.innerText = total;

      // Storage size calculation
      let totalBytes = 0;
      this.phrases.forEach(p => { if (p.sizeBytes) totalBytes += p.sizeBytes; });
      const dsStorageSize = document.getElementById('dsStorageSize');
      if (dsStorageSize) {
        dsStorageSize.innerText = `${(totalBytes / 1024).toFixed(1)} KB`;
      }
    },

    populatePhraseSelects() {
      const selRecord = document.getElementById('selectRecordPhrase');
      const selModal = document.getElementById('modalSelectPhrase');
      if (!selRecord && !selModal) return;

      const options = this.phrases.map(p => 
        `<option value="${p.id}">${p.title} (${p.language.toUpperCase()} - ${p.filename})</option>`
      ).join('');

      if (selRecord) selRecord.innerHTML = options;
      if (selModal) selModal.innerHTML = options;

      this.onPhraseSelectionChange();
    },

    onPhraseSelectionChange() {
      const sel = document.getElementById('selectRecordPhrase');
      if (!sel) return;
      const id = sel.value;
      const phrase = this.phrases.find(p => p.id === id);
      const scriptBox = document.getElementById('selectedPhraseScript');
      if (phrase && scriptBox) {
        scriptBox.innerHTML = `<strong>Spoken Script:</strong> "${phrase.spokenText}"<br><small style="color:var(--text-muted);">${phrase.description}</small>`;
      }
    },

    renderPhraseCatalog(filterCategory = 'all', filterSearch = '') {
      const tbody = document.getElementById('phraseTableBody');
      if (!tbody) return;

      let list = this.phrases;
      if (filterCategory !== 'all') {
        list = list.filter(p => p.category === filterCategory);
      }
      if (filterSearch) {
        const s = filterSearch.toLowerCase();
        list = list.filter(p => 
          p.title.toLowerCase().includes(s) ||
          p.spokenText.toLowerCase().includes(s) ||
          p.filename.toLowerCase().includes(s)
        );
      }

      const countBadge = document.getElementById('phraseFilterCount');
      if (countBadge) countBadge.innerText = `${list.length} Prompts`;

      tbody.innerHTML = list.map(item => {
        const statusBadge = item.exists
          ? `<span class="status-badge-native">● Native Audio (${item.sizeFormatted})</span>`
          : `<span class="status-badge-tts">&#9881; TTS Fallback (Missing)</span>`;

        const playBtn = item.exists
          ? `<button class="btn btn-sm btn-secondary" onclick="window.app.playCatalogAudio('${item.url}')">▶ Play</button>`
          : `<button class="btn btn-sm btn-outline" onclick="window.app.quickRecordPhrase('${item.id}')">🎙️ Record</button>`;

        return `
          <tr>
            <td>
              <strong>${item.title}</strong><br>
              <code style="font-size:11px; color:var(--text-muted);">${item.filename}</code>
            </td>
            <td><span class="badge">${item.category}</span></td>
            <td><strong>${item.language.toUpperCase()}</strong></td>
            <td style="max-width:300px; font-size:12.5px;">"${item.spokenText}"</td>
            <td>${statusBadge}</td>
            <td>
              <div style="display:flex; gap:6px;">
                ${playBtn}
                <button class="btn btn-sm btn-ghost" title="Replace or Upload" onclick="window.app.openUploadModal('${item.id}')">Upload</button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    },

    filterPhraseCatalog() {
      const cat = document.getElementById('selectCategoryFilter').value;
      const search = document.getElementById('inputFilterPhrases').value;
      this.renderPhraseCatalog(cat, search);
    },

    playCatalogAudio(url) {
      const audio = new Audio(url);
      audio.play().catch(e => console.log('Playback error:', e));
    },

    // ── Dedicated Voice Audio Suite Selection (Twi / English / Interactive) ──
    setVoiceMode(mode) {
      this.voiceMode = mode; // 'twi' | 'en' | 'auto'

      if (mode === 'twi') {
        this.callState.lang = 'twi';
      } else if (mode === 'en') {
        this.callState.lang = 'en';
      }

      const btnTwi = document.getElementById('btnVoiceModeTwi');
      const btnEn = document.getElementById('btnVoiceModeEn');
      const btnAuto = document.getElementById('btnVoiceModeAuto');
      const btnDefault = document.getElementById('btnVoiceModeDefault');
      const btnProt = document.getElementById('btnVoiceModePrototype');

      if (btnTwi) btnTwi.classList.toggle('active', mode === 'twi');
      if (btnEn) btnEn.classList.toggle('active', mode === 'en');
      if (btnAuto) btnAuto.classList.toggle('active', mode === 'auto');
      if (btnDefault) btnDefault.classList.toggle('active', mode === 'twi' || mode === 'auto' || mode === 'bilingual');
      if (btnProt) btnProt.classList.toggle('active', mode === 'en' || mode === 'prototype');

      this.updatePromptDisplayLanguage();

      const indicator = document.getElementById('audioSourceIndicator');
      if (indicator) {
        if (mode === 'twi') {
          indicator.innerText = 'Track: 🇬🇭 Authentic Akan Twi Audio (/audio/Twi/)';
        } else if (mode === 'en') {
          indicator.innerText = 'Track: 🇬🇧 Dedicated English Audio (/audio/English/)';
        } else {
          indicator.innerText = 'Track: 🌐 Interactive IVR (Follows Call Language Selection)';
        }
      }

      // Re-trigger current step audio with new language engine
      if (this.callState.active && this.callState.step !== 'idle') {
        this.goToStep(this.callState.step);
      }
    },

    updatePromptDisplayLanguage() {
      const isTwi = this.callState.lang === 'twi';
      const langBadge = document.getElementById('currentLangBadge');
      const primaryLabel = document.getElementById('primaryPromptLabel');
      const secondaryLabel = document.getElementById('secondaryPromptLabel');
      const promptTwi = document.getElementById('currentPromptTwi');
      const promptEn = document.getElementById('currentPromptEn');

      if (langBadge) {
        langBadge.innerHTML = isTwi ? '🇬🇭 Akan Twi Active' : '🇬🇧 English Active';
        langBadge.style.color = isTwi ? 'var(--emerald-accent)' : '#38bdf8';
        langBadge.style.background = isTwi ? 'rgba(16,185,129,0.15)' : 'rgba(56,189,248,0.15)';
        langBadge.style.borderColor = isTwi ? 'rgba(16,185,129,0.3)' : 'rgba(56,189,248,0.3)';
      }

      if (primaryLabel) {
        primaryLabel.innerText = isTwi ? 'Spoken Prompt (Akan Twi)' : 'Spoken Prompt (English)';
        primaryLabel.style.color = isTwi ? 'var(--emerald-accent)' : '#38bdf8';
      }
      if (secondaryLabel) {
        secondaryLabel.innerText = isTwi ? 'English Translation' : 'Twi (Akan) Nkyerɛaseɛ';
      }

      if (promptTwi && promptEn) {
        if (isTwi) {
          promptTwi.style.fontSize = '14.5px';
          promptTwi.style.fontWeight = '700';
          promptTwi.style.color = '#f8fafc';
          promptEn.style.fontSize = '12px';
          promptEn.style.color = '#94a3b8';
        } else {
          promptEn.style.fontSize = '14.5px';
          promptEn.style.fontWeight = '700';
          promptEn.style.color = '#f8fafc';
          promptTwi.style.fontSize = '12px';
          promptTwi.style.color = '#94a3b8';
        }
      }
    },

    async loadPrototypeAudio() {
      try {
        const res = await fetch('/api/prototype-audio');
        const data = await res.json();
        this.prototypeData = data;
        this.renderPrototypeGrid(data);
      } catch (err) {
        console.error('Failed to load prototype audio:', err);
      }
    },

    renderPrototypeGrid(data) {
      const container = document.getElementById('prototypePromptsGrid');
      if (!container) return;

      const manifestPrompts = (data.manifest && data.manifest.prompts) || [];
      const files = data.files || [];

      if (!files.length && !manifestPrompts.length) {
        container.innerHTML = `<div style="padding:20px; text-align:center; color:var(--ink-muted); grid-column:1/-1;">No prototype audio found in /audio/English_audio_prot/</div>`;
        return;
      }

      const items = manifestPrompts.map(p => {
        const matchingFile = files.find(f => f.name === p.filename);
        return {
          ...p,
          sizeFormatted: matchingFile ? matchingFile.sizeFormatted : '96.0 KB',
          url: matchingFile ? matchingFile.url : `/audio/English_audio_prot/${p.filename}`
        };
      });

      container.innerHTML = items.map((item, idx) => `
        <div class="prompt-item-card" id="protCard_${idx}">
          <div>
            <div class="prompt-top-row">
              <span class="prompt-seq-tag">TRACK ${item.number || (idx + 1)}</span>
              <span class="prompt-filesize">${item.sizeFormatted}</span>
            </div>
            <div class="prompt-card-title">${item.title}</div>
            <div class="prompt-card-script">"${item.spokenText}"</div>
          </div>
          <div class="prompt-card-actions">
            <button class="btn-play-prompt" id="btnPlayProt_${idx}" onclick="window.app.togglePrototypePlay('${item.url}', ${idx})">
              <span>▶ Play</span>
            </button>
            <button class="btn-copy-url" title="Copy streaming URL" onclick="window.app.copyUrl('${item.url}')">
              <span>🔗 Copy URL</span>
            </button>
            <button class="btn-copy-url" title="Replace file" onclick="window.app.openUploadModal('prot_${item.number}')">
              <span>Replace</span>
            </button>
          </div>
        </div>
      `).join('');
    },

    togglePrototypePlay(url, idx) {
      if (this.activePrototypeAudio && this.activePrototypeIdx === idx) {
        this.activePrototypeAudio.pause();
        this.activePrototypeAudio = null;
        this.activePrototypeIdx = null;
        this.updatePrototypePlayButtons();
        return;
      }

      if (this.activePrototypeAudio) {
        this.activePrototypeAudio.pause();
      }

      const audio = new Audio(url);
      this.activePrototypeAudio = audio;
      this.activePrototypeIdx = idx;
      this.updatePrototypePlayButtons();

      audio.play().catch(e => console.log('Playback error:', e));
      audio.onended = () => {
        this.activePrototypeAudio = null;
        this.activePrototypeIdx = null;
        this.updatePrototypePlayButtons();
      };
    },

    updatePrototypePlayButtons() {
      const cards = document.querySelectorAll('.prompt-item-card');
      cards.forEach((card, idx) => {
        const isCurrent = this.activePrototypeIdx === idx;
        card.classList.toggle('is-playing', isCurrent);
        const btn = document.getElementById(`btnPlayProt_${idx}`);
        if (btn) {
          btn.innerHTML = isCurrent ? `<span>⏹ Stop</span>` : `<span>▶ Play</span>`;
        }
      });
    },

    playAllPrototypeSequence() {
      if (!this.prototypeData || !this.prototypeData.manifest || !this.prototypeData.manifest.prompts) return;
      const prompts = this.prototypeData.manifest.prompts;
      let cur = 0;
      const playNext = () => {
        if (cur >= prompts.length) {
          this.activePrototypeIdx = null;
          this.updatePrototypePlayButtons();
          return;
        }
        const p = prompts[cur];
        const url = `/audio/English_audio_prot/${p.filename}`;
        this.togglePrototypePlay(url, cur);
        if (this.activePrototypeAudio) {
          this.activePrototypeAudio.onended = () => {
            cur++;
            this.updatePrototypePlayButtons();
            playNext();
          };
        }
      };
      playNext();
    },

    copyUrl(url) {
      const fullUrl = window.location.origin + url;
      navigator.clipboard.writeText(fullUrl).then(() => {
        alert(`Copied URL:\n${fullUrl}`);
      }).catch(() => {
        alert(fullUrl);
      });
    },

    async loadTwiAudio() {
      try {
        const res = await fetch('/api/twi-audio');
        const data = await res.json();
        this.twiData = data;
        this.renderTwiGrid(data);
      } catch (err) {
        console.error('Failed to load Twi audio:', err);
      }
    },

    renderTwiGrid(data) {
      const container = document.getElementById('twiPromptsGrid');
      if (!container) return;

      const manifestPrompts = (data.manifest && data.manifest.prompts) || [];
      const files = data.files || [];

      if (!files.length && !manifestPrompts.length) {
        container.innerHTML = `<div style="padding:20px; text-align:center; color:var(--ink-muted); grid-column:1/-1;">No Twi audio found in /audio/twi_recording/</div>`;
        return;
      }

      const items = manifestPrompts.map(p => {
        const matchingFile = files.find(f => f.name === p.filename);
        return {
          ...p,
          sizeFormatted: matchingFile ? matchingFile.sizeFormatted : '110.0 KB',
          url: matchingFile ? matchingFile.url : `/audio/twi_recording/${p.filename}`
        };
      });

      container.innerHTML = items.map((item, idx) => `
        <div class="prompt-item-card" id="twiCard_${idx}" style="border-left: 3px solid #2e7d32;">
          <div>
            <div class="prompt-top-row">
              <span class="prompt-seq-tag" style="background:#e8f5e9; color:#2e7d32;">TWI ${item.number || (idx + 1)}</span>
              <span class="prompt-filesize">${item.sizeFormatted}</span>
            </div>
            <div class="prompt-card-title">${item.description || item.filename}</div>
            <div class="prompt-card-script">"${item.spokenText}"</div>
          </div>
          <div class="prompt-card-actions">
            <button class="btn-play-prompt" id="btnPlayTwi_${idx}" onclick="window.app.toggleTwiPlay('${item.url}', ${idx})">
              <span>▶ Play</span>
            </button>
            <button class="btn-copy-url" title="Copy streaming URL" onclick="window.app.copyUrl('${item.url}')">
              <span>🔗 Copy URL</span>
            </button>
            <button class="btn-copy-url" title="Replace file" onclick="window.app.openUploadModal('twi_${item.number}')">
              <span>Replace</span>
            </button>
          </div>
        </div>
      `).join('');
    },

    toggleTwiPlay(url, idx) {
      if (this.activeTwiAudio && this.activeTwiIdx === idx) {
        this.activeTwiAudio.pause();
        this.activeTwiAudio = null;
        this.activeTwiIdx = null;
        this.updateTwiPlayButtons();
        return;
      }

      if (this.activeTwiAudio) {
        this.activeTwiAudio.pause();
      }

      const audio = new Audio(url);
      this.activeTwiAudio = audio;
      this.activeTwiIdx = idx;
      this.updateTwiPlayButtons();

      audio.play().catch(e => console.log('Playback error:', e));
      audio.onended = () => {
        this.activeTwiAudio = null;
        this.activeTwiIdx = null;
        this.updateTwiPlayButtons();
      };
    },

    updateTwiPlayButtons() {
      const cards = document.querySelectorAll('#twiPromptsGrid .prompt-item-card');
      cards.forEach((card, idx) => {
        const isCurrent = this.activeTwiIdx === idx;
        card.classList.toggle('is-playing', isCurrent);
        const btn = document.getElementById(`btnPlayTwi_${idx}`);
        if (btn) {
          btn.innerHTML = isCurrent ? `<span>⏹ Stop</span>` : `<span>▶ Play</span>`;
        }
      });
    },

    playAllTwiSequence() {
      if (!this.twiData || !this.twiData.manifest || !this.twiData.manifest.prompts) return;
      const prompts = this.twiData.manifest.prompts;
      let cur = 0;
      const playNext = () => {
        if (cur >= prompts.length) {
          this.activeTwiIdx = null;
          this.updateTwiPlayButtons();
          return;
        }
        const p = prompts[cur];
        const url = `/audio/twi_recording/${p.filename}`;
        this.toggleTwiPlay(url, cur);
        if (this.activeTwiAudio) {
          this.activeTwiAudio.onended = () => {
            cur++;
            this.updateTwiPlayButtons();
            playNext();
          };
        }
      };
      playNext();
    },

    // ── KYC Subscribers ─────────────────────────────────────────────────
    async loadSubscribers() {
      try {
        const res = await fetch('/api/kyc/list');
        const data = await res.json();
        this.subscribers = data.subscribers || [];
        this.renderSubscribers();
      } catch (err) {
        // Fallback default subscribers
        this.subscribers = [
          { phoneNumber: "0241234567", name: "Kwame Nyameba", network: "MTN" },
          { phoneNumber: "0543546010", name: "Hannes Aboagye", network: "MTN" },
          { phoneNumber: "0244123456", name: "Kwame Mensah", network: "MTN" },
          { phoneNumber: "0249876543", name: "Kofi Annan", network: "MTN" },
          { phoneNumber: "0201234567", name: "Ama Serwaa", network: "Telecel" },
          { phoneNumber: "0271234567", name: "Yaw Osei", network: "AT" },
          { phoneNumber: "0551234567", name: "Abena Mansa", network: "MTN" }
        ];
        this.renderSubscribers();
      }
    },

    renderSubscribers() {
      const tbody = document.getElementById('subscriberTableBody');
      if (!tbody) return;

      tbody.innerHTML = this.subscribers.map(sub => `
        <tr>
          <td><strong class="font-mono">${sub.phoneNumber}</strong></td>
          <td><span class="highlight-name">${sub.name}</span></td>
          <td><span class="badge">${sub.network}</span></td>
          <td style="font-size:12px; color:var(--sky-accent);">"Woremane sika kɔma ${sub.name}, a ne nɔma wie ${sub.phoneNumber.slice(-4)}..."</td>
          <td>
            <button class="btn btn-sm btn-outline" onclick="window.app.testKycWithPhone('${sub.phoneNumber}')">Test in Call</button>
          </td>
        </tr>
      `).join('');

      const countBadge = document.getElementById('subscriberCountBadge');
      if (countBadge) countBadge.innerText = `${this.subscribers.length} Verified Records`;
    },

    testKycWithPhone(phone) {
      this.switchTab('simulator');
      this.callState.phone = phone;
      this.startCall();
    },

    fillKycPhone(phone) {
      document.getElementById('inputKycTestPhone').value = phone;
      this.testKycLookup();
    },

    async testKycLookup() {
      const phoneInput = document.getElementById('inputKycTestPhone').value.trim();
      if (!phoneInput) return;

      try {
        const res = await fetch(`/api/kyc/lookup?phone=${encodeURIComponent(phoneInput)}`);
        const data = await res.json();
        const box = document.getElementById('kycResultBox');
        box.style.display = 'block';

        if (data.valid && data.record) {
          document.getElementById('kycResultName').innerText = data.record.name;
          document.getElementById('kycResultPhone').innerText = data.record.phoneNumber;
          document.getElementById('kycResultNetwork').innerHTML = `<span class="badge">${data.record.network}</span> (Prefix verified)`;
          document.getElementById('kycResultSpeech').innerText = `"Sending money to ${data.record.name}, ending in ${data.record.phoneNumber.slice(-4)}."`;
        } else {
          document.getElementById('kycResultName').innerText = 'Unregistered / Invalid';
          document.getElementById('kycResultPhone').innerText = phoneInput;
          document.getElementById('kycResultNetwork').innerText = data.error || 'Unknown';
          document.getElementById('kycResultSpeech').innerText = 'Invalid Ghanaian phone number format.';
        }
      } catch (e) {
        console.error('KYC lookup error:', e);
      }
    },

    async submitNewSubscriber(e) {
      e.preventDefault();
      const phone = document.getElementById('inputNewPhone').value.trim();
      const name = document.getElementById('inputNewName').value.trim();
      const network = document.getElementById('selectNewNetwork').value;

      try {
        const res = await fetch('/api/kyc/subscriber', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone, name, network })
        });
        const data = await res.json();
        if (data.success) {
          alert(`Successfully registered ${name} (${phone}) on ${network}`);
          document.getElementById('formAddSubscriber').reset();
          this.loadSubscribers();
        } else {
          alert(`Error: ${data.error}`);
        }
      } catch (err) {
        alert('Failed to register subscriber');
      }
    },

    // ── Call Simulator Pipeline ─────────────────────────────────────────
    startCall() {
      this.callState.active = true;
      this.callState.seconds = 0;
      this.callState.sessionId = 'session_' + Math.random().toString(36).substring(2, 9);
      this.callState.activeConvState = null;
      this.callState.enteredPinDigits = '';
      this.callState.phone = '0553838464';
      this.callState.name = 'Kwame Nyamebere';
      this.callState.amount = '500';
      this.callState.provider = 'MTN';

      clearInterval(this.callState.timerInterval);
      this.callState.timerInterval = setInterval(() => {
        this.callState.seconds++;
        const mins = String(Math.floor(this.callState.seconds / 60)).padStart(2, '0');
        const secs = String(this.callState.seconds % 60).padStart(2, '0');
        const timer = document.getElementById('callTimer');
        if (timer) timer.innerText = `${mins}:${secs}`;
      }, 1000);

      document.getElementById('callStatusBadge').innerText = 'Call Connected';
      document.getElementById('callStatusBadge').style.color = 'var(--emerald-accent)';

      this.resetConvInspector();

      // Acquire mic constraints with AEC and noise suppression early
      this.initMicrophoneConstraints().catch(e => console.warn('[Microphone] AEC init notice:', e));

      // Reset selection state and prepare live voice status
      this.isPinPromptOpen = false;
      this.optionSelectedForCurrentPrompt = false;
      this.lastFastVoiceTriggerKey = null;
      this.lastFastVoiceTriggerTime = 0;

      const transcript = document.getElementById('transcriptText');
      if (transcript) {
        transcript.innerHTML = '🎙️ <em>Listening &mdash; Speak a number (e.g. \'1\', \'2\') or phrase...</em>';
      }

      this.goToStep('welcome');
    },

    setIdleState() {
      this.callState.active = false;
      this.callState.step = 'idle';
      clearInterval(this.callState.timerInterval);
      clearTimeout(this.speechRestartTimer);
      this.isPinPromptOpen = false;
      this.isPromptPlaying = false;
      this.optionSelectedForCurrentPrompt = true;
      this.lastProcessedVoiceText = '';
      this.lastProcessedVoiceTime = 0;
      this.lastFastVoiceTriggerKey = null;
      this.lastFastVoiceTriggerTime = 0;

      const transcript = document.getElementById('transcriptText');
      if (transcript) {
        transcript.innerText = 'Waiting to place call...';
      }

      const timer = document.getElementById('callTimer');
      if (timer) timer.innerText = '00:00';

      const statusBadge = document.getElementById('callStatusBadge');
      if (statusBadge) {
        statusBadge.innerText = 'Call Idle';
        statusBadge.style.color = 'var(--sky-accent)';
      }

      this.stopPhoneAudio();
      this.setSpeechRecognitionActive(false, 'Simulation idle');
      this.updateStepIndicators('idle');

      const fileTag = document.getElementById('currentAudioFileName');
      if (fileTag) fileTag.innerText = 'No audio loaded';

      const stepTag = document.getElementById('currentStepTag');
      if (stepTag) stepTag.innerText = 'Simulation Ready';

      const promptTwi = document.getElementById('currentPromptTwi');
      if (promptTwi) promptTwi.innerText = '"Mia \'Start Call Simulation\' anaa \'Place New Call\' sɛ wobɛhyɛ aseɛ."';

      const promptEn = document.getElementById('currentPromptEn');
      if (promptEn) promptEn.innerText = '"Simulation idle. Click \'Start Call Simulation\' or \'Place New Call\' to begin."';

      const viewport = document.getElementById('stepControlsViewport');
      if (viewport) {
        viewport.innerHTML = `
          <div style="padding: 16px 8px; text-align: center;">
            <div style="font-size: 28px; margin-bottom: 8px;">📞</div>
            <div style="font-weight: 700; font-size: 14px; margin-bottom: 4px; color: var(--ink);">Ready to Test Ɔkwankyerɛfo Pa</div>
            <p style="font-size: 12px; color: var(--ink-secondary); margin-bottom: 14px; line-height: 1.5;">
              Dual-track accessibility IVR voice layer with Akan Twi and English speech.
            </p>
            <button class="btn btn-call-start" style="width: 100%; justify-content: center; font-size: 13.5px; padding: 10px 16px;" onclick="window.app.startCall()">
              <span>📞</span> Place New Call
            </button>
          </div>
        `;
      }

      const liveXml = document.getElementById('liveXmlCode');
      if (liveXml) liveXml.innerText = '<!-- Call not started. Click "Start Call Simulation" or "Place New Call" to stream VoiceXML -->';

      const transcript = document.getElementById('transcriptText');
      if (transcript) transcript.innerText = 'Waiting to place call...';

      const chips = document.getElementById('voiceSuggestionsChips');
      if (chips) chips.innerHTML = '';
    },

    endCall() {
      this.setIdleState();
      const stepTag = document.getElementById('currentStepTag');
      if (stepTag) stepTag.innerText = 'Call Ended';
      const promptTwi = document.getElementById('currentPromptTwi');
      if (promptTwi) promptTwi.innerText = 'Fa call no firi mu anaa sɔ bio.';
      const promptEn = document.getElementById('currentPromptEn');
      if (promptEn) promptEn.innerText = 'Call disconnected. Click "Start Call Simulation" to begin again.';
      const liveXml = document.getElementById('liveXmlCode');
      if (liveXml) liveXml.innerText = '<!-- Call disconnected -->';
    },

    // ── Speech Recognition & Listening Lifecycle ─────────────────────────
    speechRecogInstance: null,
    listeningServiceEnabled: true,
    isListeningActive: false,
    isPromptPlaying: false,
    optionSelectedForCurrentPrompt: false,
    isPinPromptOpen: false,
    speechRestartTimer: null,
    audioStreamWithAec: null,
    lastProcessedVoiceText: '',
    lastProcessedVoiceTime: 0,
    lastFastVoiceTriggerKey: null,
    lastFastVoiceTriggerTime: 0,

    // Step 1: Microphone constraints with echoCancellation & noiseSuppression
    async initMicrophoneConstraints() {
      if (this.audioStreamWithAec) return this.audioStreamWithAec;
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        try {
          const constraints = {
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true
            }
          };
          this.audioStreamWithAec = await navigator.mediaDevices.getUserMedia(constraints);
          console.log('[Microphone] Stream acquired with echoCancellation: true and noiseSuppression: true');
          return this.audioStreamWithAec;
        } catch (err) {
          console.warn('[Microphone] getUserMedia with AEC constraints warning:', err);
        }
      }
      return null;
    },

    // Central state controller for Speech Recognition
    // STRICT RULES:
    // 1. When the user PIN prompt is open, the speech layer MUST be turned off (Zero-PIN security).
    // 2. When an audio prompt is playing, the speech layer remains ACTIVE for Barge-In (cut-through), allowing users to speak "baako", "1", "one", etc. immediately to interrupt.
    // 3. After the prompt finishes (provided PIN prompt is not open and no option chosen yet), speech resumes/continues seamlessly.
    setSpeechRecognitionActive(active, reason = '') {
      console.log(`[SpeechRecognition Lifecycle] setSpeechRecognitionActive(${active}) - Reason: ${reason} (callActive=${this.callState.active}, isPromptPlaying=${this.isPromptPlaying}, isPinPromptOpen=${this.isPinPromptOpen}, optionSelected=${this.optionSelectedForCurrentPrompt}, enabled=${this.listeningServiceEnabled})`);

      const bar = document.getElementById('simultaneousListeningBar');
      const dot = document.getElementById('listeningPulseDot');
      const micBtn = document.getElementById('btnToggleListeningMic');
      const micIcon = document.getElementById('listeningMicIcon');
      const statusText = document.getElementById('listeningStatusText');

      if (active) {
        // Enforce strict activation condition:
        // Must be in an active call, PIN prompt NOT open, no option selected yet, and user has not muted/disabled.
        // NOTE: Barge-in enabled: listening is allowed even while prompt is playing!
        if (!this.callState.active || this.isPinPromptOpen || this.optionSelectedForCurrentPrompt || !this.listeningServiceEnabled) {
          console.log('[SpeechRecognition Lifecycle] Activation prevented - conditions not met');
          return;
        }

        this.isListeningActive = true;

        if (bar) bar.classList.add('listening');
        if (dot) dot.classList.remove('paused');
        if (micBtn) {
          micBtn.classList.add('active');
          micBtn.classList.remove('muted');
        }
        if (micIcon) micIcon.innerText = this.isPromptPlaying ? '⚡ Live Mic (Barge-In)' : '🎙️ Live Mic On';
        if (statusText) {
          if (this.isPromptPlaying) {
            statusText.innerHTML = '<strong>⚡ Prompt Playing (Barge-In Active):</strong> Say your choice (e.g. "baako", "1") or punch keypad anytime to interrupt';
          } else {
            statusText.innerHTML = '<strong>Prompt Finished:</strong> Listening — Speak your choice or press keypad';
          }
        }

        this.startBrowserSpeechRecognition();
      } else {
        this.isListeningActive = false;

        if (bar) bar.classList.remove('listening');
        if (dot) dot.classList.add('paused');
        if (micBtn) {
          micBtn.classList.remove('active');
          micBtn.classList.add('muted');
        }
        if (micIcon) {
          micIcon.innerText = this.isPinPromptOpen ? '🔒 PIN Secure (Mic Off)' : '🔇 Mic Inactive';
        }
        if (statusText) {
          if (!this.callState.active) {
            statusText.innerHTML = '<strong>Call Idle:</strong> Click "Place New Call" to begin';
          } else if (this.isPinPromptOpen) {
            statusText.innerHTML = '<strong>PIN Prompt Open:</strong> Speech layer turned off for Zero-PIN security. Enter PIN on handset.';
          } else if (this.optionSelectedForCurrentPrompt) {
            statusText.innerHTML = '<strong>Option Selected:</strong> Processing next prompt...';
          } else if (!this.listeningServiceEnabled) {
            statusText.innerHTML = '<strong>Mic Muted:</strong> Voice input disabled';
          } else {
            statusText.innerHTML = '<strong>Listening Inactive</strong>';
          }
        }

        this.stopBrowserSpeechRecognition();
      }
    },

    extractSpokenDigit(rawText) {
      if (!rawText) return null;
      let text = String(rawText).toLowerCase().trim();

      // 1. Direct single digit or symbol
      if (/^[0-9]$/.test(text)) {
        return { key: text, label: `Digit ${text}` };
      }
      if (text === '*' || text === 'star' || text === 'asterisk' || text === 'nsoroma') {
        return { key: '*', label: 'Star / Pesewas (*)' };
      }
      if (text === '#' || text === 'hash' || text === 'pound' || text === 'submit') {
        return { key: '#', label: 'Hash / Submit (#)' };
      }

      // Strip conversational prefixes so "number 1", "press 1", "option two", "mepe baako", "give me one", etc. match cleanly
      const cleaned = text.replace(/^(please\s+)?(press|key|option|number|choice|select|choose|give me|i want|i choose|it is|it's|me\s*pɛ|mepe|fa|mia)\s+/i, '').trim();
      if (/^[0-9]$/.test(cleaned)) {
        return { key: cleaned, label: `Digit ${cleaned}` };
      }

      // 2. English & Akan Twi word mappings (including homophones and spoken variations)
      const map = [
        { regex: /\b(1|one|won|first|baako|bako|koro)\b/i, key: '1', label: 'One / Baako (1)' },
        { regex: /\b(2|two|too|second|mmienu|mienu|abien)\b/i, key: '2', label: 'Two / Mmienu (2)' },
        { regex: /\b(3|three|tree|third|mmiensa|mmiɛnsa|miensa|abiesa)\b/i, key: '3', label: 'Three / Mmiɛnsa (3)' },
        { regex: /\b(4|four|fore|fourth|anan|enan|nan)\b/i, key: '4', label: 'Four / Anan (4)' },
        { regex: /\b(5|five|fifth|enum|num|anom)\b/i, key: '5', label: 'Five / Enum (5)' },
        { regex: /\b(6|six|sixth|nsia|sia)\b/i, key: '6', label: 'Six / Nsia (6)' },
        { regex: /\b(7|seven|seventh|nson|son)\b/i, key: '7', label: 'Seven / Nson (7)' },
        { regex: /\b(8|eight|ate|eighth|nwɔtwe|nwotwe|motwe|wotwe)\b/i, key: '8', label: 'Eight / Nwɔtwe (8)' },
        { regex: /\b(9|nine|ninth|nkron|kron)\b/i, key: '9', label: 'Nine / Nkron (9)' },
        { regex: /\b(0|zero|oh|hwee|koraa)\b/i, key: '0', label: 'Zero / Hwee (0)' },
      ];

      for (const item of map) {
        if (item.regex.test(cleaned) || item.regex.test(text)) {
          return { key: item.key, label: item.label };
        }
      }

      return null;
    },

    extractSpokenPhoneNumber(rawText) {
      if (!rawText) return null;
      const text = String(rawText).toLowerCase().trim();
      const directDigits = text.replace(/[^0-9]/g, '');
      if (directDigits.length === 10 && directDigits.startsWith('0')) {
        return directDigits;
      }
      if (directDigits.length > 10) {
        const m = directDigits.match(/0[25][0-9]{8}/);
        if (m) return m[0];
      }
      const wordMap = {
        'zero': '0', 'oh': '0', 'o': '0', 'hwee': '0',
        'one': '1', 'won': '1', 'baako': '1', 'bako': '1',
        'two': '2', 'too': '2', 'mmienu': '2', 'mienu': '2',
        'three': '3', 'tree': '3', 'mmiensa': '3',
        'four': '4', 'anan': '4',
        'five': '5', 'enum': '5',
        'six': '6', 'nsia': '6',
        'seven': '7', 'nson': '7',
        'eight': '8', 'ate': '8', 'nwɔtwe': '8', 'nwotwe': '8',
        'nine': '9', 'nkron': '9'
      };
      const tokens = text.split(/[\s-]+/);
      let digits = '';
      for (const token of tokens) {
        if (/^[0-9]$/.test(token)) {
          digits += token;
        } else if (wordMap[token]) {
          digits += wordMap[token];
        }
      }
      if (digits.length === 10 && digits.startsWith('0')) {
        return digits;
      }
      return null;
    },

    extractSpokenAmount(rawText) {
      if (!rawText) return null;
      const text = String(rawText).toLowerCase().trim();
      if (/\b(five hundred|500)\b/i.test(text)) return '500';
      if (/\b(fifty|50)\b/i.test(text)) return '50';
      if (/\b(one hundred|hundred|100)\b/i.test(text)) return '100';
      if (/\b(two hundred|200)\b/i.test(text)) return '200';
      if (/\b(three hundred|300)\b/i.test(text)) return '300';
      if (/\b(four hundred|400)\b/i.test(text)) return '400';
      if (/\b(twenty|20)\b/i.test(text)) return '20';
      if (/\b(ten|10)\b/i.test(text)) return '10';

      const numMatch = text.match(/\b([1-9][0-9]{0,4}(?:\.[0-9]{1,2})?)\b/);
      if (numMatch) {
        const val = numMatch[1];
        if ((val === '8' && /\b(back|go back)\b/i.test(text)) || (val === '9' && /\b(repeat|again)\b/i.test(text))) {
          return null;
        }
        return val;
      }
      return null;
    },

    // ⚡ Ultra-Fast Client-Side Intent Matcher (0ms Network Latency)
    matchFastVoiceIntent(rawTranscript, step, lang) {
      if (!rawTranscript) return null;
      const raw = String(rawTranscript).toLowerCase().trim();
      const text = raw.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, ' ').replace(/\s+/g, ' ').trim();
      if (!text) return null;

      const currentStep = step || this.callState.step || 'welcome';
      const isTwi = (lang === 'twi') || (this.callState.lang === 'twi');

      // 1. Spoken digit extraction
      const spokenDigit = this.extractSpokenDigit(text);

      // 2. Universal Navigation Keywords (Active across steps)
      if (/\b(exit|cancel|hang up|quit|stop|bye|goodbye|firi mu)\b/i.test(text)) {
        return { matchedKey: '0', label: 'Exit (Key 0)', explanation: 'Exit Call' };
      }
      if (/\b(go back|back|previous|return|san akyi)\b/i.test(text)) {
        return { matchedKey: '8', label: 'Back (Key 8)', explanation: 'Go Back' };
      }
      if (/\b(repeat|replay|say again|hear again|pardon|tie wei bio|tie bio)\b/i.test(text)) {
        const repeatKey = (isTwi && currentStep === 'network') ? '4' : '9';
        return { matchedKey: repeatKey, label: `Repeat (Key ${repeatKey})`, explanation: 'Repeat Prompt' };
      }

      // 3. Step-Specific Rules
      // STEP 1: Welcome & Language Choice
      if (currentStep === 'welcome') {
        if (/\b(english|anglais)\b/i.test(text) || text.includes('for english') || text.includes('speak english') || spokenDigit?.key === '1') {
          return { matchedKey: '1', label: 'English (Key 1)', explanation: 'Selected English' };
        }
        if (/\b(twi|akan|asante)\b/i.test(text) || text.includes('for twi') || text.includes('speak twi') || spokenDigit?.key === '2') {
          return { matchedKey: '2', label: 'Twi (Key 2)', explanation: 'Selected Akan Twi' };
        }
        // Other digits voiced on welcome prompt trigger Audio 11
        if (spokenDigit) {
          return { matchedKey: spokenDigit.key, label: `Digit ${spokenDigit.key}`, explanation: `Wrong Figure (${spokenDigit.key})` };
        }
        return null;
      }

      // STEP 2: Service Selection (English Flow)
      if (currentStep === 'service') {
        if (/\b(telecom|momo|mobile money)\b/i.test(text) || spokenDigit?.key === '1') {
          return { matchedKey: '1', label: 'Mobile Money (Key 1)', explanation: 'Selected Mobile Money' };
        }
        if (/\b(banking|bank)\b/i.test(text) || spokenDigit?.key === '2') {
          return { matchedKey: '2', label: 'Banking (Key 2)', explanation: 'Selected Banking' };
        }
        if (spokenDigit) {
          return { matchedKey: spokenDigit.key, label: `Digit ${spokenDigit.key}`, explanation: `Wrong Figure (${spokenDigit.key})` };
        }
        return null;
      }

      // STEP 3: Network / Provider Selection
      if (currentStep === 'network' || currentStep === 'provider') {
        if (isTwi && (/\b(tie|bio)\b/i.test(text) || spokenDigit?.key === '4')) {
          return { matchedKey: '4', label: 'Tie bio (Key 4)', explanation: 'Repeat Network Prompt' };
        }
        if (/\b(mtn|scancom|yellow)\b/i.test(text) || spokenDigit?.key === '1') {
          return { matchedKey: '1', label: 'MTN (Key 1)', explanation: 'Selected MTN Network' };
        }
        if (/\b(telecel|vodafone|voda|red)\b/i.test(text) || spokenDigit?.key === '2') {
          return { matchedKey: '2', label: 'Telecel (Key 2)', explanation: 'Selected Telecel Network' };
        }
        if (/\b(airteltigo|airtel|tigo|at|blue)\b/i.test(text) || spokenDigit?.key === '3') {
          return { matchedKey: '3', label: 'AirtelTigo (Key 3)', explanation: 'Selected AirtelTigo Network' };
        }
        if (spokenDigit) {
          return { matchedKey: spokenDigit.key, label: `Digit ${spokenDigit.key}`, explanation: `Wrong Figure (${spokenDigit.key})` };
        }
        return null;
      }

      // STEP 4: Services / Actions Menu
      if (currentStep === 'services' || currentStep === 'action') {
        if (/\b(send money|send|transfer|momo user|another momo|send cash|mena sika)\b/i.test(text) || spokenDigit?.key === '1') {
          return { matchedKey: '1', label: 'Send Money (Key 1)', explanation: 'Selected Send Money' };
        }
        if (/\b(pay bills|bills|utility|utilities|bill|tua bills)\b/i.test(text) || spokenDigit?.key === '2') {
          return { matchedKey: '2', label: 'Pay Bills (Key 2)', explanation: 'Selected Pay Bills' };
        }
        if (/\b(buy airtime|airtime|bundle|data|credit|tɔ airtime|to airtime)\b/i.test(text) || spokenDigit?.key === '3') {
          return { matchedKey: '3', label: 'Buy Airtime (Key 3)', explanation: 'Selected Buy Airtime' };
        }
        if (/\b(allow cashout|cashout|cash out|withdraw)\b/i.test(text) || spokenDigit?.key === '4') {
          return { matchedKey: '4', label: 'Allow Cashout (Key 4)', explanation: 'Selected Allow Cashout' };
        }
        if (/\b(check account|check balance|account|balance)\b/i.test(text) || spokenDigit?.key === '5') {
          return { matchedKey: '5', label: 'Check Account (Key 5)', explanation: 'Selected Check Account' };
        }
        if (spokenDigit) {
          return { matchedKey: spokenDigit.key, label: `Digit ${spokenDigit.key}`, explanation: `Wrong Figure (${spokenDigit.key})` };
        }
        return null;
      }

      // STEP 5: Recipient Phone Number Entry
      if (currentStep === 'recipient') {
        const phoneFromText = this.extractSpokenPhoneNumber(text);
        if (phoneFromText) {
          return {
            nextStep: 'recipient_verify',
            slots: { phone: phoneFromText, name: 'Kwame Nyamebere' },
            label: `Phone: ${phoneFromText}`,
            explanation: `Entered phone number ${phoneFromText}`
          };
        }
        if (/\b(kwame|nyamebere|brother|friend|preferred)\b/i.test(text)) {
          return {
            nextStep: 'recipient_verify',
            slots: { phone: '0553838464', name: 'Kwame Nyamebere' },
            label: 'Kwame Nyamebere (055 383 8464)',
            explanation: 'Selected saved contact Kwame Nyamebere'
          };
        }
        if (text === '#' || /\b(hash|pound|submit|enter|done)\b/i.test(text) || spokenDigit?.key === '#') {
          return { matchedKey: '#', label: 'Submit (#)', explanation: 'Submit Phone Number' };
        }
        if (spokenDigit && /^[0-9]$/.test(spokenDigit.key)) {
          return { appendDigit: spokenDigit.key, label: `Digit ${spokenDigit.key}`, explanation: `Appended digit ${spokenDigit.key}` };
        }
        return null;
      }

      // STEP 6: Recipient Confirmation (KYC Verification)
      if (currentStep === 'recipient_verify' || currentStep === 'verify_recipient') {
        if (/\b(confirm and send|confirm|send|yes|correct|proceed|okay|sure|gye tum)\b/i.test(text) || spokenDigit?.key === '1') {
          return { matchedKey: '1', label: 'Confirm & Send (Key 1)', explanation: 'Confirmed recipient details' };
        }
        if (/\b(cancel|no|re-enter|change|edit|wrong|different|sesa no)\b/i.test(text) || spokenDigit?.key === '2') {
          return { matchedKey: '2', label: 'Cancel / Re-enter (Key 2)', explanation: 'Re-enter recipient phone' };
        }
        if (spokenDigit) {
          return { matchedKey: spokenDigit.key, label: `Digit ${spokenDigit.key}`, explanation: `Wrong Figure (${spokenDigit.key})` };
        }
        return null;
      }

      // STEP 7: Amount Entry
      if (currentStep === 'amount') {
        const amountVal = this.extractSpokenAmount(text);
        if (amountVal) {
          return {
            nextStep: 'confirm',
            slots: { amount: String(amountVal) },
            label: `GH₵ ${amountVal}`,
            explanation: `Entered amount GH₵ ${amountVal}`
          };
        }
        if (text === '#' || /\b(hash|pound|submit|done)\b/i.test(text) || spokenDigit?.key === '#') {
          return { matchedKey: '#', label: 'Submit (#)', explanation: 'Submit Amount' };
        }
        if (spokenDigit && /^[0-9]$/.test(spokenDigit.key)) {
          return { appendDigit: spokenDigit.key, label: `Digit ${spokenDigit.key}`, explanation: `Appended digit ${spokenDigit.key}` };
        }
        return null;
      }

      // STEP 8: Final Payment Confirmation
      if (currentStep === 'confirm') {
        if (/\b(confirm and send|confirm|send|yes|send it|proceed|okay|correct|pay|transfer|gye tum)\b/i.test(text) || spokenDigit?.key === '1') {
          return { matchedKey: '1', label: 'Confirm Transfer (Key 1)', explanation: 'Proceed to PIN authorization' };
        }
        if (/\b(cancel|no|stop|abort|don't send|do not send)\b/i.test(text) || spokenDigit?.key === '2') {
          return { matchedKey: '2', label: 'Cancel (Key 2)', explanation: 'Cancelled transfer' };
        }
        if (spokenDigit) {
          return { matchedKey: spokenDigit.key, label: `Digit ${spokenDigit.key}`, explanation: `Wrong Figure (${spokenDigit.key})` };
        }
        return null;
      }

      // STEP 9: Receipt / Exit
      if (currentStep === 'receipt') {
        if (/\b(no|nothing|that's all|that is all|goodbye|bye|no thanks|done|exit|dabi)\b/i.test(text) || spokenDigit?.key === '0' || spokenDigit?.key === '2') {
          return { matchedKey: '0', label: 'Exit (Key 0)', explanation: 'Ended call' };
        }
        if (/\b(yes|another|check balance|pay bills|send more|aane)\b/i.test(text) || spokenDigit?.key === '1') {
          return { matchedKey: '1', label: 'Another Service (Key 1)', explanation: 'Requested another service' };
        }
        return null;
      }

      // Generic fallback: direct spoken digit
      if (spokenDigit) {
        return { matchedKey: spokenDigit.key, label: spokenDigit.label, explanation: `Voiced digit ${spokenDigit.key}` };
      }

      return null;
    },

    executeFastVoiceAction(match, rawTranscript) {
      if (match.appendDigit) {
        if (this.callState.step === 'recipient') {
          const inputEl = document.getElementById('inPhoneSim');
          if (inputEl) {
            if (inputEl.value.length >= 10) inputEl.value = '';
            inputEl.value += match.appendDigit;
            this.callState.phone = inputEl.value;
            if (inputEl.value.length === 10) {
              setTimeout(() => { this.submitSimRecipient(); }, 400);
            }
          }
        } else if (this.callState.step === 'amount') {
          const inputEl = document.getElementById('inAmountSim');
          if (inputEl) {
            inputEl.value += match.appendDigit;
            this.callState.amount = inputEl.value;
          }
        }
        return;
      }

      if (match.matchedKey) {
        this.pressVoiceKey(match.matchedKey, rawTranscript);
        return;
      }

      if (match.nextStep) {
        this.optionSelectedForCurrentPrompt = true;
        this.setSpeechRecognitionActive(false, `Fast voice next step: ${match.nextStep}`);
        if (match.slots) {
          if (match.slots.phone) this.callState.phone = match.slots.phone;
          if (match.slots.name) this.callState.name = match.slots.name;
          if (match.slots.amount) this.callState.amount = String(match.slots.amount);
          if (match.slots.provider) this.callState.provider = match.slots.provider;
        }
        this.goToStep(match.nextStep);
      }
    },

    pressVoiceKey(key, spokenLabel) {
      if (this.isPromptPlaying) {
        console.log(`[Barge-In] Interrupting audio prompt for voice key [${key}]`);
        this.stopPhoneAudio();
      }

      if (!this.callState.active) {
        console.log('[Voice Keypad] Call inactive, starting call simulation...');
        this.startCall();
        setTimeout(() => {
          this.pressVoiceKey(key, spokenLabel);
        }, 500);
        return;
      }

      const displayWord = spokenLabel || key;
      console.log(`[Voice Keypad] Voice-to-Keypad Substitution: "${displayWord}" -> Punching Key [${key}]`);

      // 1. Visual feedback in live transcript box
      const preview = document.getElementById('listeningTranscriptPreview');
      const textEl = document.getElementById('transcriptText');
      if (preview) preview.style.display = 'flex';
      if (textEl) {
        textEl.innerHTML = `<strong>🗣️ Voiced:</strong> "${displayWord}" &rarr; <span class="transcript-match-badge">⚡ Punched [${key}]</span>`;
      }

      // 2. Animate physical button on handset
      const btnIdMap = { '*': 'keyStar', '#': 'keyHash' };
      const btnId = btnIdMap[key] || `key${key}`;
      const btnEl = document.getElementById(btnId);
      if (btnEl) {
        btnEl.classList.remove('key-voiced');
        void btnEl.offsetWidth; // trigger reflow
        btnEl.classList.add('key-voiced');
        btnEl.classList.add('key-pressed');
        setTimeout(() => {
          btnEl.classList.remove('key-pressed');
        }, 300);
        setTimeout(() => {
          btnEl.classList.remove('key-voiced');
        }, 600);
      }

      // 3. Mark option selected and deactivate speech recognition for menu selection prompts
      if (this.callState.step !== 'recipient' && this.callState.step !== 'amount') {
        this.optionSelectedForCurrentPrompt = true;
        this.setSpeechRecognitionActive(false, `Voice substitution punching key [${key}]`);
      }

      // 4. Delegate to physical pressKey logic
      this.pressKey(key);
    },

    speakVoiceDigit(key, word) {
      this.pressVoiceKey(key, word);
    },

    startBrowserSpeechRecognition() {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        const statusText = document.getElementById('listeningStatusText');
        if (statusText) {
          statusText.innerHTML = '<strong>Listening Service:</strong> Voice chips or keypad ready';
        }
        return;
      }

      if (this.speechRecogInstance) {
        // Recognition already alive and continuous
        return;
      }

      try {
        const recog = new SpeechRecognition();
        // en-US achieves instant local recognition (<50ms) across all desktop and mobile browsers
        recog.lang = 'en-US';
        recog.continuous = true;
        recog.interimResults = true;
        recog.maxAlternatives = 3;

        recog.onresult = (event) => {
          if (!this.isListeningActive || !this.callState.active || this.isPinPromptOpen || this.optionSelectedForCurrentPrompt) {
            return;
          }

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const res = event.results[i];
            const isFinal = res.isFinal;
            const alt = res[0];
            const rawTranscript = (alt && alt.transcript) ? alt.transcript.trim() : '';
            if (!rawTranscript) continue;

            const textEl = document.getElementById('transcriptText');

            // ⚡ ULTRA-FAST INTENT EVALUATION (Direct execution on interim or final result)
            const fastMatch = this.matchFastVoiceIntent(rawTranscript, this.callState.step, this.callState.lang);
            if (fastMatch) {
              const now = Date.now();
              const actionKey = fastMatch.matchedKey || fastMatch.nextStep || fastMatch.appendDigit;
              // Guard against rapid duplicate triggers within 500ms
              if (this.lastFastVoiceTriggerKey === actionKey && (now - this.lastFastVoiceTriggerTime < 500)) {
                return;
              }
              this.lastFastVoiceTriggerKey = actionKey;
              this.lastFastVoiceTriggerTime = now;

              console.log(`[FastVoiceEngine] ⚡ Instant Match (${isFinal ? 'final' : 'interim'}): "${rawTranscript}" ->`, fastMatch);
              if (this.isPromptPlaying) {
                this.stopPhoneAudio();
              }

              if (textEl) {
                textEl.innerHTML = `<strong>🗣️ Voiced:</strong> "${rawTranscript}" &rarr; <span class="transcript-match-badge">⚡ Instant Match: ${fastMatch.label || ('Key [' + fastMatch.matchedKey + ']')}</span>`;
              }

              this.executeFastVoiceAction(fastMatch, rawTranscript);
              return;
            }

            // If interim and not matched yet, display real-time live hearing feedback
            if (!isFinal) {
              if (textEl) {
                textEl.innerHTML = `🗣️ Hearing: <strong style="color:#6ee7b7;">"${rawTranscript}..."</strong>`;
              }
              continue;
            }

            // Final result received and not matched by fast engine: delegate to natural voice parser
            console.log(`[SpeechRecognition] Final speech received for natural parsing: "${rawTranscript}"`);
            if (this.isPromptPlaying) {
              this.stopPhoneAudio();
            }
            this.handleNaturalVoiceInput(rawTranscript);
          }
        };

        recog.onerror = (err) => {
          console.warn('[SpeechRecognition onerror]:', err.error);
          if (err.error === 'not-allowed') {
            this.listeningServiceEnabled = false;
            this.setSpeechRecognitionActive(false, 'Microphone permission denied');
          } else if (err.error === 'language-not-supported') {
            console.log('[SpeechRecognition] Falling back to en-US');
            recog.lang = 'en-US';
          }
        };

        recog.onend = () => {
          console.log('[SpeechRecognition onend]');
          this.speechRecogInstance = null;
          // Reconnect seamlessly if call is active and PIN prompt is NOT open
          if (this.isListeningActive && this.callState.active && !this.isPinPromptOpen && !this.optionSelectedForCurrentPrompt && this.listeningServiceEnabled) {
            clearTimeout(this.speechRestartTimer);
            this.speechRestartTimer = setTimeout(() => {
              if (this.isListeningActive && this.callState.active && !this.isPinPromptOpen && !this.optionSelectedForCurrentPrompt && this.listeningServiceEnabled) {
                this.startBrowserSpeechRecognition();
              }
            }, 100);
          }
        };

        recog.start();
        this.speechRecogInstance = recog;
      } catch (err) {
        console.warn('SpeechRecognition startup notice:', err);
      }
    },

    stopBrowserSpeechRecognition() {
      clearTimeout(this.speechRestartTimer);
      if (this.speechRecogInstance) {
        try {
          this.speechRecogInstance.onend = null;
          this.speechRecogInstance.abort();
        } catch(e) {}
        try {
          this.speechRecogInstance.stop();
        } catch(e) {}
        this.speechRecogInstance = null;
      }
    },

    startListeningService() {
      this.listeningServiceEnabled = true;
      if (this.callState.active && !this.isPinPromptOpen && !this.optionSelectedForCurrentPrompt) {
        this.setSpeechRecognitionActive(true, 'startListeningService called');
      } else {
        this.setSpeechRecognitionActive(false, 'startListeningService called (waiting for call or PIN prompt)');
      }
    },

    stopListeningService() {
      this.listeningServiceEnabled = false;
      this.setSpeechRecognitionActive(false, 'stopListeningService called');
    },

    toggleListeningService() {
      if (this.listeningServiceEnabled) {
        this.stopListeningService();
      } else {
        this.startListeningService();
      }
    },

    duckPromptAudio() {},
    unduckPromptAudio() {},
    pauseListeningForDtmf() {},

    // Step Keyword/Intent validator reusing existing step options
    isStepKeywordMatch(step, rawTranscript) {
      if (!rawTranscript) return false;
      const text = rawTranscript.toLowerCase().trim();
      const currentStep = step || this.callState.step || 'welcome';

      const stepKeywordsMap = {
        'welcome': [
          'english', '1', 'one', 'twi', '2', 'two', 'akan', 'first', 'second', 'anglais'
        ],
        'network': [
          'mtn', '1', 'one', 'momo', 'scancom', 'yellow', 'telecel', '2', 'two',
          'vodafone', 'voda', 'red', 'airteltigo', '3', 'three', 'airtel', 'tigo', 'at', 'blue',
          'repeat', '9', 'nine', 'again', 'pardon', 'exit', '0', 'zero', 'cancel', 'quit', 'stop', 'bye'
        ],
        'provider': [
          'mtn', '1', 'one', 'momo', 'scancom', 'yellow', 'telecel', '2', 'two',
          'vodafone', 'voda', 'red', 'airteltigo', '3', 'three', 'airtel', 'tigo', 'at', 'blue',
          'repeat', '9', 'nine', 'again', 'pardon', 'exit', '0', 'zero', 'cancel', 'quit', 'stop', 'bye'
        ],
        'services': [
          'send money', 'send', 'money', '1', 'one', 'transfer', 'momo user', 'pay bills', 'bills',
          '2', 'two', 'utility', 'utilities', 'bill', 'buy airtime', 'airtime', '3', 'three',
          'bundle', 'data', 'credit', 'allow cashout', 'cashout', 'cash out', '4', 'four', 'withdraw',
          'check account', 'account', 'check balance', 'balance', '5', 'five', 'go back', 'back',
          'previous', 'return', '8', 'eight', 'exit', '0', 'zero', 'cancel', 'quit', 'stop', 'bye'
        ],
        'action': [
          'send money', 'send', 'money', '1', 'one', 'transfer', 'momo user', 'pay bills', 'bills',
          '2', 'two', 'utility', 'utilities', 'bill', 'buy airtime', 'airtime', '3', 'three',
          'bundle', 'data', 'credit', 'allow cashout', 'cashout', 'cash out', '4', 'four', 'withdraw',
          'check account', 'account', 'check balance', 'balance', '5', 'five', 'go back', 'back',
          'previous', 'return', '8', 'eight', 'exit', '0', 'zero', 'cancel', 'quit', 'stop', 'bye'
        ],
        'recipient': [
          'kwame', 'nyamebere', '0553838464', '8464', 'number', 'phone', 'brother', 'friend',
          'exit', '0', 'zero', 'cancel', 'quit', 'stop'
        ],
        'recipient_verify': [
          'confirm and send', 'confirm', 'send', 'yes', 'correct', 'proceed', 'okay', 'sure',
          '1', 'one', 'cancel', 'no', 're-enter', 'change', 'edit', 'wrong', 'different',
          '2', 'two', 'exit', 'exit completely', 'quit', 'stop', '0', 'zero'
        ],
        'verify_recipient': [
          'confirm and send', 'confirm', 'send', 'yes', 'correct', 'proceed', 'okay', 'sure',
          '1', 'one', 'cancel', 'no', 're-enter', 'change', 'edit', 'wrong', 'different',
          '2', 'two', 'exit', 'exit completely', 'quit', 'stop', '0', 'zero'
        ],
        'amount': [
          '500 cedis', '500', '50 cedis', '50', '100 cedis', '100', 'cedis', 'cedi',
          'five hundred', 'fifty', 'one hundred', 'hundred', 'amount', 'go back', 'back',
          '8', 'eight', 'exit', '0', 'zero', 'cancel', 'quit'
        ],
        'confirm': [
          'confirm and send', 'confirm', 'send', 'yes', 'send it', 'proceed', 'okay', 'correct',
          'pay', 'transfer', '1', 'one', 'cancel', 'no', 'stop', 'abort', "don't send", 'do not send',
          '2', 'two', 'exit', 'quit', '0', 'zero'
        ],
        'pin_handoff': [
          'pin entered', 'pin', 'entered', 'authorize', 'authorized', 'done', '1234',
          'authenticate', 'verified', 'submitted', 'ok', 'yes'
        ],
        'auth': [
          'pin entered', 'pin', 'entered', 'authorize', 'authorized', 'done', '1234',
          'authenticate', 'verified', 'submitted', 'ok', 'yes'
        ],
        'receipt': [
          'no', "that's all", 'that is all', 'nothing', 'goodbye', 'bye', 'no thanks',
          'exit', 'done', '0', 'zero', 'yes', 'another', 'check balance', 'balance',
          'pay bills', 'bills', 'send more', '1', '2'
        ],
        'not_available': [
          'place new call', 'new call', 'call', 'restart', 'exit'
        ]
      };

      const keywords = stepKeywordsMap[currentStep] || [];
      for (const kw of keywords) {
        if (text === kw) return true;
        if (kw.length > 2 && text.includes(kw)) return true;
        if (new RegExp(`\\b${kw}\\b`, 'i').test(text)) return true;
      }

      // Step-specific regex fallbacks matching server.ts parseIvrNaturalInput
      if (currentStep === 'welcome') {
        if (/\b(english|one|1|first|anglais)\b/i.test(text) || /\b(twi|two|2|akan|second)\b/i.test(text)) return true;
      }
      if (currentStep === 'network' || currentStep === 'provider') {
        if (/\b(mtn|momo|scancom|yellow|1|one)\b/i.test(text)) return true;
        if (/\b(telecel|vodafone|voda|red|2|two)\b/i.test(text)) return true;
        if (/\b(airteltigo|airtel|tigo|at|blue|3|three)\b/i.test(text)) return true;
        if (/\b(repeat|again|say again|hear again|pardon|9|nine)\b/i.test(text)) return true;
        if (/\b(exit|cancel|quit|stop|hang up|bye|goodbye|0|zero)\b/i.test(text)) return true;
      }
      if (currentStep === 'services' || currentStep === 'action') {
        if (/\b(send money|send|transfer|momo user|another momo user|send cash|1|one)\b/i.test(text)) return true;
        if (/\b(pay bills|bills|utility|utilities|bill|2|two)\b/i.test(text)) return true;
        if (/\b(buy airtime|airtime|bundle|data|credit|3|three)\b/i.test(text)) return true;
        if (/\b(allow cashout|cashout|cash out|withdraw|4|four)\b/i.test(text)) return true;
        if (/\b(check account|check your account|account|check balance|balance|5|five)\b/i.test(text)) return true;
        if (/\b(back|go back|previous|return|8|eight)\b/i.test(text)) return true;
        if (/\b(exit|cancel|quit|stop|hang up|bye|goodbye|0|zero)\b/i.test(text)) return true;
      }
      if (currentStep === 'recipient') {
        const digitsOnly = text.replace(/[^0-9]/g, '');
        if (digitsOnly.length === 10 || digitsOnly.endsWith('8464')) return true;
        if (/\b(kwame|nyamebere|brother|friend)\b/i.test(text)) return true;
        if (/\b(exit|cancel|quit|stop|0|zero)\b/i.test(text)) return true;
      }
      if (currentStep === 'recipient_verify' || currentStep === 'verify_recipient') {
        if (/\b(confirm|send|confirm and send|yes|correct|proceed|okay|sure|send the money|1|one)\b/i.test(text)) return true;
        if (/\b(cancel|no|re-enter|change|edit|wrong|different|2|two)\b/i.test(text)) return true;
        if (/\b(exit|exit completely|quit|stop|0|zero)\b/i.test(text)) return true;
      }
      if (currentStep === 'amount') {
        if (/\b\d+(\.\d+)?\b/.test(text) || /\b(cedis|cedi|five hundred|500|fifty|50|one hundred|hundred|100)\b/i.test(text)) return true;
        if (/\b(back|go back|8|eight|exit|cancel|quit|0|zero)\b/i.test(text)) return true;
      }
      if (currentStep === 'confirm') {
        if (/\b(confirm|send|confirm and send|yes|send it|proceed|okay|correct|pay|transfer|1|one)\b/i.test(text)) return true;
        if (/\b(cancel|no|stop|abort|don't send|do not send|2|two)\b/i.test(text)) return true;
        if (/\b(exit|quit|0|zero)\b/i.test(text)) return true;
      }
      if (currentStep === 'pin_handoff' || currentStep === 'auth') {
        if (/\b(entered|authorized|pin|done|1234|authenticate|verified|submitted|authorize)\b/i.test(text)) return true;
      }
      if (currentStep === 'receipt') {
        if (/\b(no|nothing|that's all|that is all|goodbye|bye|no thanks|exit|done|0|zero)\b/i.test(text)) return true;
        if (/\b(yes|another|check balance|pay bills|send more|[1-9])\b/i.test(text)) return true;
      }
      if (currentStep === 'not_available') {
        if (/\b(call|place new call|new call|restart|exit)\b/i.test(text)) return true;
      }

      // Generic single digit check
      const cleanDigits = text.replace(/[^0-9]/g, '');
      if (cleanDigits.length === 1) return true;
      if (/\b(one|two|three|four|five|six|seven|eight|nine|zero)\b/i.test(text)) return true;

      return false;
    },

    async handleNaturalVoiceInput(transcript) {
      if (!transcript || !this.callState.active || this.isPinPromptOpen || this.isPromptPlaying || this.optionSelectedForCurrentPrompt) return;

      const normText = transcript.toLowerCase().trim();
      const now = Date.now();
      // Step 3 Guard: Ensure no more than one action per utterance (debounce identical rapid bursts within 1.4s)
      if (normText === this.lastProcessedVoiceText && (now - this.lastProcessedVoiceTime < 1400)) {
        console.log(`[SpeechRecognition] Debounced duplicate utterance within 1.4s: "${transcript}"`);
        return;
      }
      this.lastProcessedVoiceText = normText;
      this.lastProcessedVoiceTime = now;

      const preview = document.getElementById('listeningTranscriptPreview');
      const textEl = document.getElementById('transcriptText');
      if (preview) preview.style.display = 'flex';
      if (textEl) textEl.innerText = `"${transcript}"`;

      // ⚡ FAST-PATH INTENT MATCH CHECK (Zero network delay)
      const fastMatch = this.matchFastVoiceIntent(transcript, this.callState.step, this.callState.lang);
      if (fastMatch) {
        console.log(`[FastVoiceEngine] ⚡ Instant Local Intent Match: "${transcript}" ->`, fastMatch);
        if (textEl) {
          textEl.innerHTML = `<strong>🗣️ Voiced:</strong> "${transcript}" &rarr; <span class="transcript-match-badge">⚡ Instant Match: ${fastMatch.label || ('Key [' + fastMatch.matchedKey + ']')}</span>`;
        }
        this.executeFastVoiceAction(fastMatch, transcript);
        return;
      }

      try {
        const res = await fetch('/api/ivr/natural-input', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            step: this.callState.step,
            text: transcript,
            language: this.callState.lang,
            currentContext: {
              provider: this.callState.provider,
              phone: this.callState.phone,
              name: this.callState.name,
              amount: this.callState.amount
            }
          })
        });
        const data = await res.json();
        if (!data.success) {
          console.warn('Natural voice interpretation returned unsuccessful:', data);
          return;
        }

        // Check if unmentioned / wrong figure was returned by parser or IVR tree
        if (data.actionType === 'unrecognized' || data.nextStep === 'wrong_figure') {
          this.optionSelectedForCurrentPrompt = true;
          this.setSpeechRecognitionActive(false, 'Unrecognized spoken input detected');
          this.handleWrongFigure(transcript);
          return;
        }

        // Low confidence guard for ambiguous noise
        if (typeof data.confidence === 'number' && data.confidence < 0.65 && !data.matchedKey && !data.nextStep) {
          console.log(`[SpeechRecognition] Ambiguous low confidence speech (${data.confidence}): "${transcript}"`);
          if (textEl) {
            textEl.innerText = `Didn't catch that clearly. Please repeat or press keypad.`;
          }
          return;
        }

        // Visual feedback on screen
        if (textEl) {
          textEl.innerText = `"${transcript}" → ${data.explanation || data.actionType}`;
        }

        // If slots were extracted (e.g. amount or recipient)
        if (data.extractedSlots) {
          if (data.extractedSlots.network) this.callState.provider = data.extractedSlots.network;
          if (data.extractedSlots.recipientPhone) this.callState.phone = data.extractedSlots.recipientPhone;
          if (data.extractedSlots.recipientName) this.callState.name = data.extractedSlots.recipientName;
          if (data.extractedSlots.amount) this.callState.amount = String(data.extractedSlots.amount);
        }

        // Update AI monitor card
        this.updateConvInspector({
          activeIntent: data.actionType || 'VOICE_RESPONSE',
          confidence: data.confidence || 0.95,
          state: {
            status: data.nextStep ? `TRANSITION_TO_${data.nextStep.toUpperCase()}` : 'LISTENING',
            network: this.callState.provider,
            amount: this.callState.amount,
            recipient_name: this.callState.name,
            recipient_phone: this.callState.phone
          }
        });

        // Act on result - mark option selected and immediately deactivate speech recognition until next prompt finishes
        if (data.actionType === 'authorize_pin') {
          this.optionSelectedForCurrentPrompt = true;
          this.setSpeechRecognitionActive(false, 'Spoken PIN authorization option detected');
          this.submitPinAuthorization();
          return;
        }

        if (data.actionType === 'complete_and_exit' || data.actionType === 'exit_call') {
          this.optionSelectedForCurrentPrompt = true;
          this.setSpeechRecognitionActive(false, 'Spoken exit option detected');
          this.goToStep('done_exit');
          return;
        }

        if (data.nextStep === 'not_available' || data.actionType === 'unsupported_option') {
          this.optionSelectedForCurrentPrompt = true;
          this.setSpeechRecognitionActive(false, 'Spoken unavailable option detected');
          this.goToStep('not_available');
          return;
        }

        if (data.matchedKey) {
          // Trigger the DTMF key action cleanly via Voice Keypad Substitution
          this.pressVoiceKey(data.matchedKey, transcript);
        } else if (data.nextStep) {
          this.optionSelectedForCurrentPrompt = true;
          this.setSpeechRecognitionActive(false, `Spoken next step "${data.nextStep}" detected`);
          this.goToStep(data.nextStep);
        }
      } catch (err) {
        console.error('Error handling natural voice input:', err);
      }
    },

    submitNaturalVoiceInput() {
      const input = document.getElementById('voiceNaturalInput');
      if (!input) return;
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      this.handleNaturalVoiceInput(text);
    },

    renderVoiceSuggestions(step) {
      const container = document.getElementById('voiceSuggestionsChips');
      if (!container) return;

      const isTwi = this.callState.lang === 'twi';
      const chipsMapEn = {
        'welcome': [
          { label: '🗣️ "English"', val: 'English', primary: true },
          { label: '🗣️ "Twi"', val: 'Twi' },
          { label: '🗣️ "One (1)"', val: '1' }
        ],
        'service': [
          { label: '🗣️ "Telecom / MoMo (1)"', val: 'Telecom', primary: true },
          { label: '🗣️ "Banking (2)"', val: 'Banking' },
          { label: '🗣️ "Replay (9)"', val: 'Replay' },
          { label: '🗣️ "Exit (0)"', val: 'Exit' }
        ],
        'network': [
          { label: '🗣️ "MTN (1)"', val: 'MTN', primary: true },
          { label: '🗣️ "Telecel (2)"', val: 'Telecel' },
          { label: '🗣️ "AirtelTigo (3)"', val: 'AirtelTigo' },
          { label: '🗣️ "Repeat prompt (9)"', val: 'Repeat' },
          { label: '🗣️ "Exit (0)"', val: 'Exit' }
        ],
        'services': [
          { label: '🗣️ "Send money (1)"', val: 'Send money', primary: true },
          { label: '🗣️ "Pay bills (2)"', val: 'Pay bills' },
          { label: '🗣️ "Buy airtime (3)"', val: 'Buy airtime' },
          { label: '🗣️ "Allow cashout (4)"', val: 'Allow cashout' },
          { label: '🗣️ "Check account (5)"', val: 'Check account' },
          { label: '🗣️ "Go back (8)"', val: 'Go back' }
        ],
        'recipient': [
          { label: '🗣️ "Kwame Nyamebere"', val: 'Kwame Nyamebere', primary: true },
          { label: '🗣️ "0553838464"', val: '0553838464' },
          { label: '🗣️ "Number ends 8464"', val: 'Number ends 8464' },
          { label: '🗣️ "Exit (0)"', val: 'Exit' }
        ],
        'recipient_verify': [
          { label: '🗣️ "Confirm and send (1)"', val: 'Confirm and send', primary: true },
          { label: '🗣️ "Cancel / Re-enter (2)"', val: 'Cancel' },
          { label: '🗣️ "Exit completely (0)"', val: 'Exit' }
        ],
        'amount': [
          { label: '🗣️ "500 cedis"', val: '500 cedis', primary: true },
          { label: '🗣️ "50 cedis"', val: '50 cedis' },
          { label: '🗣️ "100 cedis"', val: '100 cedis' },
          { label: '🗣️ "Go back (8)"', val: 'Go back' }
        ],
        'confirm': [
          { label: '🗣️ "Confirm and send (1)"', val: 'Confirm and send', primary: true },
          { label: '🗣️ "Cancel (2)"', val: 'Cancel' }
        ],
        'pin_handoff': [],
        'receipt': [
          { label: '🗣️ "No, that\'s all (Exit 0)"', val: 'No, that is all', primary: true },
          { label: '🗣️ "Yes, check balance"', val: 'Check balance' },
          { label: '🗣️ "Yes, pay bills"', val: 'Pay bills' }
        ],
        'not_available': [
          { label: '🗣️ "Place new call"', val: 'Place new call', primary: true }
        ]
      };

      const chipsMapTwi = {
        'welcome': [
          { label: '🗣️ "English (1)"', val: 'English' },
          { label: '🗣️ "Akan Twi (2)"', val: 'Twi', primary: true }
        ],
        'service': [
          { label: '🗣️ "Mobile Money (1)"', val: 'MoMo', primary: true },
          { label: '🗣️ "Sikakorabea (2)"', val: 'Banking' }
        ],
        'network': [
          { label: '🗣️ "MTN (1)"', val: 'MTN', primary: true },
          { label: '🗣️ "Telecel (2)"', val: 'Telecel' },
          { label: '🗣️ "AirtelTigo (3)"', val: 'AirtelTigo' },
          { label: '🗣️ "Tie wei bio (4)"', val: 'Repeat' },
          { label: '🗣️ "Si ha (0)"', val: 'Exit' }
        ],
        'services': [
          { label: '🗣️ "Mena sika (1)"', val: 'Send money', primary: true },
          { label: '🗣️ "Tua bills (2)"', val: 'Pay bills' },
          { label: '🗣️ "Tɔ airtime (3)"', val: 'Buy airtime' },
          { label: '🗣️ "Allow cashout (4)"', val: 'Allow cashout' },
          { label: '🗣️ "Check account (5)"', val: 'Check account' },
          { label: '🗣️ "Kɔ back (8)"', val: 'Go back' }
        ],
        'recipient': [
          { label: '🗣️ "Kwame Nyamebrɛ"', val: 'Kwame Nyamebere', primary: true },
          { label: '🗣️ "0553838464"', val: '0553838464' },
          { label: '🗣️ "Nɔma wie 8464"', val: 'Number ends 8464' },
          { label: '🗣️ "San akyi (0)"', val: 'Exit' }
        ],
        'recipient_verify': [
          { label: '🗣️ "Gye tum na sendi (1)"', val: 'Confirm and send', primary: true },
          { label: '🗣️ "Cancel / Sesa no (2)"', val: 'Cancel' },
          { label: '🗣️ "Firi mu (0)"', val: 'Exit' }
        ],
        'amount': [
          { label: '🗣️ "500 cedis"', val: '500 cedis', primary: true },
          { label: '🗣️ "50 cedis"', val: '50 cedis' },
          { label: '🗣️ "100 cedis"', val: '100 cedis' },
          { label: '🗣️ "San akyi (8)"', val: 'Go back' }
        ],
        'confirm': [
          { label: '🗣️ "Gye tum na sendi (1)"', val: 'Confirm and send', primary: true },
          { label: '🗣️ "Cancel (2)"', val: 'Cancel' }
        ],
        'pin_handoff': [],
        'receipt': [
          { label: '🗣️ "Dabi, wie pɔtee (0)"', val: 'No, that is all', primary: true },
          { label: '🗣️ "Aane, dwumadie foforɔ"', val: 'Other' }
        ],
        'not_available': [
          { label: '🗣️ "San bɔ fɔn"', val: 'Place new call', primary: true }
        ]
      };

      if (step === 'pin_handoff' || step === 'auth') {
        container.innerHTML = `
          <div style="font-size: 11.5px; color: #a7f3d0; padding: 7px 12px; background: rgba(16, 185, 129, 0.15); border-radius: 6px; border: 1px solid rgba(16, 185, 129, 0.35); text-align: center; width: 100%;">
            🔒 ${isTwi ? 'Kasa nnyigyei no ayɛ din ma Zero-PIN ahobammbɔ. Bɔ wo PIN nɔma 4 wɔ wo fon no anim pɔtee.' : 'Speech layer is turned off for Zero-PIN security. Enter your 4-digit PIN on the handset keypad.'}
          </div>
        `;
        return;
      }

      const chips = (isTwi ? chipsMapTwi[step] : chipsMapEn[step]) || [
        { label: isTwi ? '🗣️ "Aane / Gye tum"' : '🗣️ "Yes / Confirm"', val: 'Yes' },
        { label: isTwi ? '🗣️ "Dabi / Cancel"' : '🗣️ "No / Cancel"', val: 'No' },
        { label: isTwi ? '🗣️ "Firi mu"' : '🗣️ "Exit"', val: 'Exit' }
      ];

      container.innerHTML = chips.map(c => `
        <button class="voice-chip ${c.primary ? 'primary-chip' : ''}" onclick="window.app.handleNaturalVoiceInput('${c.val}')">
          ${c.label}
        </button>
      `).join('');
    },

    // ── IVR Flow Steps Navigation (Strict Language-Separated Execution) ──
    async goToStep(step) {
      this.callState.step = step;
      this.updateStepIndicators(step);
      this.renderVoiceSuggestions(step);

      // Reset option selected state for the new step
      this.optionSelectedForCurrentPrompt = false;

      // When the user PIN prompt is open, the speech layer must be turned off until PIN prompt is done
      if (step === 'pin_handoff' || step === 'auth') {
        this.isPinPromptOpen = true;
        this.setSpeechRecognitionActive(false, `Entering step: ${step} (PIN prompt open - speech disabled)`);
      } else {
        this.isPinPromptOpen = false;
        if (this.listeningServiceEnabled && this.callState.active) {
          this.setSpeechRecognitionActive(true, `Entering step: ${step} (Fast Voice Ready)`);
        }
      }

      // Enforce strict language separation:
      // Once chosen at Welcome, lang stays locked. Never mix Twi audio into English, nor English audio into Twi!
      if (this.voiceMode === 'twi') {
        this.callState.lang = 'twi';
      } else if (this.voiceMode === 'en') {
        this.callState.lang = 'en';
      }
      const isTwi = this.callState.lang === 'twi';
      this.updatePromptDisplayLanguage();

      const promptTwi = document.getElementById('currentPromptTwi');
      const promptEn = document.getElementById('currentPromptEn');
      const stepTag = document.getElementById('currentStepTag');
      const viewport = document.getElementById('stepControlsViewport');

      const last4 = (this.callState.phone || '0553838464').slice(-4);
      const recipientName = this.callState.name || 'Kwame Nyamebere';

      // ─────────────────────────────────────────────────────────────────
      // DEDICATED PROMPTS SUITE FOR ENGLISH (Strictly /audio/English/*.mp3)
      // ─────────────────────────────────────────────────────────────────
      const ENGLISH_FLOW = {
        welcome: {
          tag: 'Step 1: Welcome & Language Choice',
          audio: '/audio/welcome_prompt_01.mp3',
          promptText: 'First introduction audio playing (welcome_prompt_01.mp3). For English, press 1. For Twi, press 2.',
          xmlUrl: '/voice-menu',
          render: () => `
            <div class="step-options-grid">
              <button class="step-opt-btn" onclick="window.app.pressKey('1')">
                <span style="color:var(--emerald-accent); font-weight:bold;">🇬🇧 1: English Language (Select 1)</span>
                <span class="opt-key-tag">Press 1</span>
              </button>
              <button class="step-opt-btn" onclick="window.app.pressKey('2')">
                <span>🇬🇭 2: Akan Twi (Select 2)</span>
                <span class="opt-key-tag">Press 2</span>
              </button>
            </div>
          `
        },
        service: {
          tag: 'Step 2: Service Selection (Telecoms vs Banking)',
          audio: '/audio/English/Audio_prompt_02.mp3',
          promptText: '"For telecom or mobile money services, press 1. For banking services, press 2. To hear this again, press 9. To exit, press 0."',
          xmlUrl: `/service-select?lang=en`,
          render: () => `
            <div class="step-options-grid">
              <button class="step-opt-btn" onclick="window.app.pressKey('1')">
                <span style="color:var(--emerald-accent); font-weight:bold;">1: Telecom / Mobile Money</span>
                <span class="opt-key-tag">Key 1</span>
              </button>
              <button class="step-opt-btn" onclick="window.app.pressKey('2')">
                <span>2: Banking Services (Pilot)</span>
                <span class="opt-key-tag">Key 2</span>
              </button>
              <button class="step-opt-btn" onclick="window.app.pressKey('9')">
                <span>9: Replay Prompt</span>
                <span class="opt-key-tag">Key 9</span>
              </button>
              <button class="step-opt-btn" onclick="window.app.pressKey('0')">
                <span style="color:var(--danger-accent);">0: Exit</span>
                <span class="opt-key-tag">Key 0</span>
              </button>
            </div>
          `
        },
        network: {
          tag: 'Step 3: Network Provider Selection',
          audio: '/audio/English/Audio_prompt_03.mp3',
          promptText: '"Select your network. For MTN, press 1. For Telecel, press 2. For AirtelTigo, press 3. Press 9 to hear this again, or 0 to exit."',
          xmlUrl: `/provider-select?lang=en&service=momo`,
          render: () => `
            <div class="step-options-grid">
              <button class="step-opt-btn" onclick="window.app.pressKey('1')">
                <span style="color:var(--emerald-accent); font-weight:bold;">1: MTN Mobile Money</span>
                <span class="opt-key-tag">Key 1</span>
              </button>
              <button class="step-opt-btn" onclick="window.app.pressKey('2')">
                <span>2: Telecel Cash</span>
                <span class="opt-key-tag">Key 2</span>
              </button>
              <button class="step-opt-btn" onclick="window.app.pressKey('3')">
                <span>3: AirtelTigo Money</span>
                <span class="opt-key-tag">Key 3</span>
              </button>
              <button class="step-opt-btn" onclick="window.app.pressKey('9')">
                <span>9: Replay Prompt</span>
                <span class="opt-key-tag">Key 9</span>
              </button>
              <button class="step-opt-btn" onclick="window.app.pressKey('0')">
                <span style="color:var(--danger-accent);">0: Exit</span>
                <span class="opt-key-tag">Key 0</span>
              </button>
            </div>
          `
        },
        services: {
          tag: 'Step 4: MTN Services Menu',
          audio: '/audio/English/Audio_prompt_05.mp3',
          promptText: '"MTN services. To send money to another MoMo user, press 1. To pay bills, press 2. To buy airtime or bundle, press 3. To allow cashout, press 4. To check your account, press 5. Press 8 to go back, or 0 to exit."',
          xmlUrl: `/action-select?lang=en&provider=${this.callState.provider || 'MTN'}`,
          render: () => `
            <div class="step-options-grid">
              <button class="step-opt-btn" onclick="window.app.pressKey('1')">
                <span style="color:var(--emerald-accent); font-weight:bold;">1: Send Money to another MoMo user</span>
                <span class="opt-key-tag">Key 1</span>
              </button>
              <button class="step-opt-btn" onclick="window.app.pressKey('2')">
                <span>2: Pay Bills</span>
                <span class="opt-key-tag">Key 2</span>
              </button>
              <button class="step-opt-btn" onclick="window.app.pressKey('3')">
                <span>3: Buy Airtime or Bundle</span>
                <span class="opt-key-tag">Key 3</span>
              </button>
              <button class="step-opt-btn" onclick="window.app.pressKey('4')">
                <span>4: Allow Cashout</span>
                <span class="opt-key-tag">Key 4</span>
              </button>
              <button class="step-opt-btn" onclick="window.app.pressKey('5')">
                <span>5: Check Account Balance</span>
                <span class="opt-key-tag">Key 5</span>
              </button>
              <button class="step-opt-btn" onclick="window.app.pressKey('8')">
                <span>8: Go Back</span>
                <span class="opt-key-tag">Key 8</span>
              </button>
            </div>
          `
        },
        recipient: {
          tag: 'Step 5: Recipient Number Entry (# to submit)',
          audio: '/audio/English/Audio_prompt_06.mp3',
          promptText: '"Enter the 10-digit number you want to send money to, followed by hash. Press 0 to exit."',
          xmlUrl: `/enter-recipient?lang=en&provider=${this.callState.provider || 'MTN'}`,
          render: () => `
            <div style="text-align:center;">
              <input type="text" id="inPhoneSim" value="${this.callState.phone || '0553838464'}" maxlength="10" 
                style="width:90%; padding:8px; font-size:16px; font-weight:bold; text-align:center; background:#000; border:1px solid var(--border-subtle); color:#fff; border-radius:6px; margin-bottom:8px;">
              <button class="btn btn-sm btn-primary" style="width:90%; margin-bottom:6px;" onclick="window.app.submitSimRecipient()">
                Submit Number (#)
              </button>
              <div style="font-size:11px; color:var(--sky-accent); cursor:pointer;" onclick="document.getElementById('inPhoneSim').value='0553838464'; window.app.submitSimRecipient();">
                👉 Fast-dial: Kwame Nyamebere (0553838464)
              </div>
            </div>
          `
        },
        recipient_verify: {
          tag: 'Step 6: KYC Verification (Kwame Nyamebere)',
          audio: '/audio/English/Audio_prompt_08.mp3',
          promptText: `"You are about to send money to Kwame Nyamebere, whose phone number ends with ${last4}. To confirm and send the money, press 1. To cancel, press 2. To exit completely, press 0."`,
          render: () => `
            <div class="step-options-grid">
              <button class="step-opt-btn" onclick="window.app.pressKey('1')">
                <span style="color:var(--emerald-accent); font-weight:bold;">1: Confirm and Send the Money</span>
                <span class="opt-key-tag">Key 1</span>
              </button>
              <button class="step-opt-btn" onclick="window.app.pressKey('2')">
                <span>2: Cancel / Re-enter Number</span>
                <span class="opt-key-tag">Key 2</span>
              </button>
              <button class="step-opt-btn" onclick="window.app.pressKey('0')">
                <span style="color:var(--danger-accent);">0: Exit Completely</span>
                <span class="opt-key-tag">Key 0</span>
              </button>
            </div>
          `
        },
        amount: {
          tag: 'Step 7: Enter Cedi Amount (# to submit)',
          audio: '/audio/English/Audio_prompt_09.mp3',
          promptText: '"Enter the cedi amount you want to send to Kwame Nyamebere, followed by hash. Use star for pesewas."',
          xmlUrl: `/enter-amount?lang=en&provider=${this.callState.provider}&phone=${this.callState.phone}&name=${encodeURIComponent(recipientName)}`,
          render: () => `
            <div style="text-align:center;">
              <input type="text" id="inAmountSim" value="${this.callState.amount || '500'}" 
                style="width:90%; padding:8px; font-size:16px; font-weight:bold; text-align:center; background:#000; border:1px solid var(--border-subtle); color:#fff; border-radius:6px; margin-bottom:8px;">
              <button class="btn btn-sm btn-primary" style="width:90%; margin-bottom:6px;" onclick="window.app.submitSimAmount()">
                Submit Amount (#)
              </button>
              <div style="display:flex; justify-content:center; gap:6px;">
                <button class="btn btn-xs btn-outline" onclick="document.getElementById('inAmountSim').value='500'; window.app.submitSimAmount();">500 Cedis</button>
                <button class="btn btn-xs btn-outline" onclick="document.getElementById('inAmountSim').value='50'; window.app.submitSimAmount();">50 Cedis</button>
                <button class="btn btn-xs btn-outline" onclick="document.getElementById('inAmountSim').value='100'; window.app.submitSimAmount();">100 Cedis</button>
              </div>
            </div>
          `
        },
        confirm: {
          tag: 'Step 8: Transfer Confirmation Read-Back',
          audio: '/audio/English/Audio_prompt_10.mp3',
          promptText: '"You are about to send 500 Ghana cedis to Kwame Nyamebere. To confirm and send, press 1. To cancel, press 2."',
          xmlUrl: `/safe-confirmation?lang=en&provider=${this.callState.provider}&phone=${this.callState.phone}&name=${encodeURIComponent(recipientName)}&amount=${this.callState.amount}`,
          render: () => `
            <div class="step-options-grid">
              <button class="step-opt-btn" onclick="window.app.pressKey('1')">
                <span style="color:var(--emerald-accent); font-weight:bold;">1: Confirm and Send</span>
                <span class="opt-key-tag">Key 1</span>
              </button>
              <button class="step-opt-btn" onclick="window.app.pressKey('2')">
                <span style="color:var(--danger-accent);">2: Cancel</span>
                <span class="opt-key-tag">Key 2</span>
              </button>
            </div>
          `
        },
        pin_handoff: {
          tag: 'Step 9: Zero-PIN Security Handset Handoff',
          audio: '/audio/English/Audio_prompt_11.mp3',
          promptText: '"Confirmed. Now, please check your phone screen and enter your momo pin accurately. Thank you for using Ɔkwankyerɛfo Pa. Goodbye."',
          xmlUrl: `/safe-outcome?lang=en&provider=${this.callState.provider}&phone=${this.callState.phone}&name=${encodeURIComponent(recipientName)}&amount=${this.callState.amount}&dtmfDigits=1`,
          render: () => this.renderPinPadUi('Transfer GH₵ 500.00 to Kwame Nyamebere', false)
        },
        receipt: {
          tag: 'Step 10: Transaction Receipt & Continuation',
          audio: '/audio/English/Audio_prompt_12.mp3',
          promptText: '"Congratulations! You have successfully sent 500 Ghana cedis to Kwame Nyamebere. Your transaction was completed on 17 September 2026 at 5:00 PM. Your reference number is OKP-847291. Your transaction details have also been sent to you. Would you like to do anything else?"',
          render: () => this.renderReceiptUi(false)
        },
        not_available: {
          tag: 'Option Unavailable',
          audio: '/audio/English/Audio_prompt_error.mp3',
          promptText: '"Sorry, that option is not available here. Thank you for using Ɔkwankyerɛfo Pa. Goodbye."',
          render: () => this.renderUnavailableUi('"Sorry, that option is not available here. Thank you for using Ɔkwankyerɛfo Pa. Goodbye."', 'Place New Call')
        },
        wrong_figure: {
          tag: '⚠️ Option Not in Prompt (Wrong Figure)',
          audio: '/audio/English/Audio_prompt_11.mp3',
          promptText: '"That option was not recognized in the audio prompt. Please punch a valid number or option from the menu."',
          render: () => `
            <div style="background:#1e1e2e; border:1px solid var(--amber-accent); border-radius:8px; padding:12px; text-align:center; color:#fff;">
              <div style="font-size:24px; margin-bottom:4px;">⚠️</div>
              <div style="font-size:13px; font-weight:bold; margin-bottom:6px; color:var(--amber-accent);">
                Option Not in Audio Prompt
              </div>
              <div style="font-size:11.5px; color:#cbd5e1; margin-bottom:10px;">
                ${this.callState.lastInvalidKey ? `You punched <strong style="color:var(--amber-accent); font-size:14px;">[${this.callState.lastInvalidKey}]</strong>. ` : ''}Audio prompt 11 plays to inform you this figure is not recognized. Please punch a valid option.
              </div>
              <div style="display:flex; justify-content:center; gap:8px;">
                <button class="btn btn-sm btn-primary" onclick="window.app.retryStepAfterError()">
                  🔄 Punch Again
                </button>
                <button class="btn btn-sm btn-outline" onclick="window.app.pressKey('0')">
                  0: Exit
                </button>
              </div>
            </div>
          `
        },
        done_exit: {
          tag: 'Call Finished',
          audio: '/audio/English/Audio_prompt_11.mp3',
          promptText: '"Thank you for using Ɔkwankyerɛfo Pa. Goodbye."',
          render: () => this.renderDoneExitUi('"Thank you for using Ɔkwankyerɛfo Pa. Goodbye."', 'Place New Call')
        },
        cancel: {
          tag: 'Transaction Cancelled',
          audio: '/audio/English/Audio_prompt_11.mp3',
          promptText: '"Transaction cancelled. No money has been deducted from your account. Goodbye."',
          render: () => `
            <button class="btn btn-sm btn-secondary" style="width:100%;" onclick="window.app.startCall()">
              Restart Flow
            </button>
          `
        }
      };

      // ─────────────────────────────────────────────────────────────────
      // DEDICATED PROMPTS SUITE FOR TWI (Strictly /audio/Twi/*.mp3)
      // ─────────────────────────────────────────────────────────────────
      const TWI_FLOW = {
        welcome: {
          tag: 'Step 1: Welcome & Kasa Paw',
          audio: '/audio/welcome_prompt_01.mp3',
          promptText: 'First introduction audio playing (welcome_prompt_01.mp3). For English, press 1. Twi firi mu, mia 2.',
          xmlUrl: '/voice-menu',
          render: () => `
            <div class="step-options-grid">
              <button class="step-opt-btn" onclick="window.app.pressKey('1')">
                <span>🇬🇧 1: English Language (Mia 1)</span>
                <span class="opt-key-tag">Mia 1</span>
              </button>
              <button class="step-opt-btn" onclick="window.app.pressKey('2')">
                <span style="color:var(--emerald-accent); font-weight:bold;">🇬🇭 2: Akan Twi (Mia 2)</span>
                <span class="opt-key-tag">Mia 2</span>
              </button>
            </div>
          `
        },
        service: {
          tag: 'Step 2: Dwumadie a Wopɛ (MoMo vs Sikakorabea)',
          audio: '/audio/Twi/Audio_prompt_twi_03.mp3',
          promptText: '"Sɛ wopɛ sɛ wosende sika kɔ Mobile Money a, mia baako (1). Sikakorabea dwumadie no, mia mmienu (2)."',
          xmlUrl: `/service-select?lang=twi`,
          render: () => `
            <div class="step-options-grid">
              <button class="step-opt-btn" onclick="window.app.pressKey('1')">
                <span style="color:var(--emerald-accent); font-weight:bold;">1: Mobile Money Dwumadie</span>
                <span class="opt-key-tag">Mia 1</span>
              </button>
              <button class="step-opt-btn" onclick="window.app.pressKey('2')">
                <span>2: Sikakorabea Banking</span>
                <span class="opt-key-tag">Mia 2</span>
              </button>
              <button class="step-opt-btn" onclick="window.app.pressKey('0')">
                <span style="color:var(--danger-accent);">0: Firi ha</span>
                <span class="opt-key-tag">Mia 0</span>
              </button>
            </div>
          `
        },
        network: {
          tag: 'Step 2: Yi Wo Network Dwumakuo',
          audio: '/audio/Twi/Audio_prompt_twi_02.mp3',
          promptText: '"Afei selecte wo network. Sɛ MTN a, mia baako (1). Sɛ Telecel a, mia mmienu (2). Sɛ AirtelTigo a, mia mmiɛnsa (3). Mia anan (4) na tie wei biom. Mia zero (0) na si ha."',
          xmlUrl: `/provider-select?lang=twi&service=momo`,
          render: () => `
            <div class="step-options-grid">
              <button class="step-opt-btn" onclick="window.app.pressKey('1')">
                <span style="color:var(--emerald-accent); font-weight:bold;">1: MTN Mobile Money</span>
                <span class="opt-key-tag">Mia 1</span>
              </button>
              <button class="step-opt-btn" onclick="window.app.pressKey('2')">
                <span>2: Telecel Cash</span>
                <span class="opt-key-tag">Mia 2</span>
              </button>
              <button class="step-opt-btn" onclick="window.app.pressKey('3')">
                <span>3: AirtelTigo Money</span>
                <span class="opt-key-tag">Mia 3</span>
              </button>
              <button class="step-opt-btn" onclick="window.app.pressKey('4')">
                <span>4: Tie wei biom (Replay)</span>
                <span class="opt-key-tag">Mia 4</span>
              </button>
              <button class="step-opt-btn" onclick="window.app.pressKey('0')">
                <span style="color:var(--danger-accent);">0: Si ha (Exit)</span>
                <span class="opt-key-tag">Mia 0</span>
              </button>
            </div>
          `
        },
        services: {
          tag: 'Step 3: MTN MoMo Dwumadie Menu',
          audio: '/audio/Twi/Audio_prompt_twi_04.mp3',
          promptText: '"Sɛ wopɛ sɛ wosend sika kɔ ma MoMo user a, mia 1. Sɛ wopɛ sɛ wotua bills a, mia 2. Sɛ wopɛ sɛ wotɔ airtime anaa bundle a, mia 3. Sɛ wopɛ sɛ woallow-i cash out a, mia 4. Sɛ wopɛ sɛ wocheck-i wo account no a, mia 5. Mia 8 na kɔ back. Mia 0 na firi ha."',
          xmlUrl: `/action-select?lang=twi&provider=${this.callState.provider || 'MTN'}`,
          render: () => `
            <div class="step-options-grid">
              <button class="step-opt-btn" onclick="window.app.pressKey('1')">
                <span style="color:var(--emerald-accent); font-weight:bold;">1: Send sika kɔ ma MoMo user</span>
                <span class="opt-key-tag">Mia 1</span>
              </button>
              <button class="step-opt-btn" onclick="window.app.pressKey('2')">
                <span>2: Tua Bills (Ka)</span>
                <span class="opt-key-tag">Mia 2</span>
              </button>
              <button class="step-opt-btn" onclick="window.app.pressKey('3')">
                <span>3: Tɔ Airtime anaa Bundle</span>
                <span class="opt-key-tag">Mia 3</span>
              </button>
              <button class="step-opt-btn" onclick="window.app.pressKey('4')">
                <span>4: Allow Cashout</span>
                <span class="opt-key-tag">Mia 4</span>
              </button>
              <button class="step-opt-btn" onclick="window.app.pressKey('5')">
                <span>5: Checki wo Account</span>
                <span class="opt-key-tag">Mia 5</span>
              </button>
              <button class="step-opt-btn" onclick="window.app.pressKey('8')">
                <span>8: Kɔ Back (Akyi)</span>
                <span class="opt-key-tag">Mia 8</span>
              </button>
            </div>
          `
        },
        recipient: {
          tag: 'Step 4: Bɔ Nea Oregye Sika No Nɔmba (#)',
          audio: '/audio/Twi/Audio_prompt_twi_05.mp3',
          promptText: '"Afei, bɔ nɔmba no a wopɛ sɛ wosende sika no to so no. Wowie a, fa hash ka ho. Mia zero na san akyi."',
          xmlUrl: `/enter-recipient?lang=twi&provider=${this.callState.provider || 'MTN'}`,
          render: () => `
            <div style="text-align:center;">
              <input type="text" id="inPhoneSim" value="${this.callState.phone || '0553838464'}" maxlength="10" 
                style="width:90%; padding:8px; font-size:16px; font-weight:bold; text-align:center; background:#000; border:1px solid var(--border-subtle); color:#fff; border-radius:6px; margin-bottom:8px;">
              <button class="btn btn-sm btn-primary" style="width:90%; margin-bottom:6px;" onclick="window.app.submitSimRecipient()">
                Fa Hash Ka Ho (#)
              </button>
              <div style="font-size:11px; color:var(--sky-accent); cursor:pointer;" onclick="document.getElementById('inPhoneSim').value='0553838464'; window.app.submitSimRecipient();">
                👉 Kwame Nyamebrɛ nɔmba: 0553838464
              </div>
            </div>
          `
        },
        recipient_verify: {
          tag: 'Step 5: KYC Verification (Kwame Nyamebrɛ)',
          audio: '/audio/Twi/Audio_prompt_twi_06.mp3',
          promptText: `"Me pɛ sɛ wo bɛ sendi sika kɔ Kwame Nyamebrɛ fɔn so, anaa number ${last4} ɛna ɛtɔ. Sɛ wo pɛ sɛ wo gye tum na wo sendi sika ma me a baako (1). Sɛ wo pɛ sɛ wo cancel a mia mmienu (2). Sɛ wo pɛ sɛ wo firi mu a mia zero (0)."`,
          render: () => `
            <div class="step-options-grid">
              <button class="step-opt-btn" onclick="window.app.pressKey('1')">
                <span style="color:var(--emerald-accent); font-weight:bold;">1: Gye tum na sendi sika no</span>
                <span class="opt-key-tag">Mia 1</span>
              </button>
              <button class="step-opt-btn" onclick="window.app.pressKey('2')">
                <span>2: Cancel / Sesa nɔmba no</span>
                <span class="opt-key-tag">Mia 2</span>
              </button>
              <button class="step-opt-btn" onclick="window.app.pressKey('0')">
                <span style="color:var(--danger-accent);">0: Firi mu koraa</span>
                <span class="opt-key-tag">Mia 0</span>
              </button>
            </div>
          `
        },
        amount: {
          tag: 'Step 6: Bɔ Cedi Dodow (#)',
          audio: '/audio/Twi/Audio_prompt_twi_07.mp3',
          promptText: '"Mepa wo kyɛw, si di amount a wo pɛ sɛ wo send ɛkɔ Kwame Nyame Brɛfo so, woyɛ a fa hash ɛntua to."',
          xmlUrl: `/enter-amount?lang=twi&provider=${this.callState.provider}&phone=${this.callState.phone}&name=${encodeURIComponent(recipientName)}`,
          render: () => `
            <div style="text-align:center;">
              <input type="text" id="inAmountSim" value="${this.callState.amount || '500'}" 
                style="width:90%; padding:8px; font-size:16px; font-weight:bold; text-align:center; background:#000; border:1px solid var(--border-subtle); color:#fff; border-radius:6px; margin-bottom:8px;">
              <button class="btn btn-sm btn-primary" style="width:90%; margin-bottom:6px;" onclick="window.app.submitSimAmount()">
                Fa Hash Wie (#)
              </button>
              <div style="display:flex; justify-content:center; gap:6px;">
                <button class="btn btn-xs btn-outline" onclick="document.getElementById('inAmountSim').value='500'; window.app.submitSimAmount();">500 Cedis</button>
                <button class="btn btn-xs btn-outline" onclick="document.getElementById('inAmountSim').value='50'; window.app.submitSimAmount();">50 Cedis</button>
                <button class="btn btn-xs btn-outline" onclick="document.getElementById('inAmountSim').value='100'; window.app.submitSimAmount();">100 Cedis</button>
              </div>
            </div>
          `
        },
        confirm: {
          tag: 'Step 7: Pene Sika no so (Read-back)',
          audio: '/audio/Twi/Audio_prompt_twi_08.mp3',
          promptText: '"Me pɛ sɛ wo sendi 500 Ghana cedis asɛm a kɔ m\'abɛɛ na namba so. Sɛ wopɛ sɛ woyi tum na wo sendi a, mia baako (1). Sɛ wopɛ sɛ wo cancel a, mia mmienu (2)."',
          xmlUrl: `/safe-confirmation?lang=twi&provider=${this.callState.provider}&phone=${this.callState.phone}&name=${encodeURIComponent(recipientName)}&amount=${this.callState.amount}`,
          render: () => `
            <div class="step-options-grid">
              <button class="step-opt-btn" onclick="window.app.pressKey('1')">
                <span style="color:var(--emerald-accent); font-weight:bold;">1: Yi tum na sendi (Pene so)</span>
                <span class="opt-key-tag">Mia 1</span>
              </button>
              <button class="step-opt-btn" onclick="window.app.pressKey('2')">
                <span style="color:var(--danger-accent);">2: Cancel (Twa mu)</span>
                <span class="opt-key-tag">Mia 2</span>
              </button>
            </div>
          `
        },
        pin_handoff: {
          tag: 'Step 8: Zero-PIN Fon Ahobammbɔ',
          audio: '/audio/Twi/Audio_prompt_twi_09.mp3',
          promptText: '"Me pɛ sɛ ɔfa ɛsi wo phone no so na bɔ wo momo PIN."',
          xmlUrl: `/safe-outcome?lang=twi&provider=${this.callState.provider}&phone=${this.callState.phone}&name=${encodeURIComponent(recipientName)}&amount=${this.callState.amount}&dtmfDigits=1`,
          render: () => this.renderPinPadUi('Mena GH₵ 500.00 kɔma Kwame Nyamebrɛ', true)
        },
        receipt: {
          tag: 'Step 9: Nkratoɔ & Reference Nɔmba',
          audio: '/audio/Twi/Audio_prompt_twi_10.mp3',
          promptText: '"Congratulations! 500 Ghana Cedis a wosendee to Kwame Nyamebrɛ namba no so no yɛ successful. Wo transaction no yɛ completed wɔ 17th September 2026..."',
          render: () => this.renderReceiptUi(true)
        },
        wrong_figure: {
          tag: '⚠️ Nɔmba a Wobɔe no Nni Hɔ (Wrong Figure - Prompt 11)',
          audio: '/audio/Twi/Audio_prompt_twi_11.mp3',
          promptText: '"Mpanimfoɔ, fakyɛ yɛn sɛ option yi nni hɔ bio. Yɛdaase sɛ woayɛ use wɔ Ɔkwankyerɛfo Pa. Goodbye."',
          render: () => `
            <div style="background:#1e1e2e; border:1px solid var(--amber-accent); border-radius:8px; padding:12px; text-align:center; color:#fff;">
              <div style="font-size:24px; margin-bottom:4px;">⚠️</div>
              <div style="font-size:13px; font-weight:bold; margin-bottom:6px; color:var(--amber-accent);">
                Nɔmba a Wobɔe no Nni Audio Prompt no Mu
              </div>
              <div style="font-size:11.5px; color:#cbd5e1; margin-bottom:10px;">
                ${this.callState.lastInvalidKey ? `Wobɔɔ <strong style="color:var(--amber-accent); font-size:14px;">[${this.callState.lastInvalidKey}]</strong>. ` : ''}Audio prompt 11 reka kyerɛ wo sɛ option yi nni dwumadie no mu. Yɛsrɛ wo, san bɔ nɔmba pɔtee a wɔbɔɔ din no.
              </div>
              <div style="display:flex; justify-content:center; gap:8px;">
                <button class="btn btn-sm btn-primary" onclick="window.app.retryStepAfterError()">
                  🔄 San Bɔ Biom (Punch Again)
                </button>
                <button class="btn btn-sm btn-outline" onclick="window.app.pressKey('0')">
                  0: Firi Mu (Exit)
                </button>
              </div>
            </div>
          `
        },
        not_available: {
          tag: 'Option Yi Nni Hɔ Bio',
          audio: '/audio/Twi/Audio_prompt_twi_11.mp3',
          promptText: '"Mpanimfoɔ, fakyɛ yɛn sɛ option yi nni hɔ bio. Yɛdaase sɛ woayɛ use wɔ Ɔkwankyerɛfo Pa. Goodbye."',
          render: () => this.renderUnavailableUi('"Mpanimfoɔ, fakyɛ yɛn sɛ option yi nni hɔ bio. Yɛdaase sɛ woayɛ use wɔ Ɔkwankyerɛfo Pa. Goodbye."', 'San Bɔ Fɔn Foforɔ')
        },
        done_exit: {
          tag: 'Dwumadie no Awie',
          audio: '/audio/Twi/Audio_prompt_twi_12.mp3',
          promptText: '"Yɛda wo ase sɛ wode Ɔkwankyerɛfo Pa adi dwuma. Nante yie."',
          render: () => this.renderDoneExitUi('"Yɛda wo ase sɛ wode Ɔkwankyerɛfo Pa adi dwuma. Nante yie."', 'San Bɔ Fɔn Foforɔ')
        },
        cancel: {
          tag: 'Dwumadie no Atwa Mu',
          audio: '/audio/Twi/Audio_prompt_twi_12.mp3',
          promptText: '"Yɛda wo ase sɛ wode Ɔkwankyerɛfo Pa adi dwuma. Nante yie."',
          render: () => `
            <button class="btn btn-sm btn-secondary" style="width:100%;" onclick="window.app.startCall()">
              San Hyɛ Ase Foforɔ
            </button>
          `
        }
      };

      // Select flow strictly based on language
      const flow = isTwi ? TWI_FLOW : ENGLISH_FLOW;
      const stepConfig = flow[step] || flow['welcome'];

      // Update Header & Prompt Text
      stepTag.innerText = stepConfig.tag;
      if (isTwi) {
        promptTwi.innerText = stepConfig.promptText;
        promptEn.innerText = ENGLISH_FLOW[step]?.promptText || '';
      } else {
        promptEn.innerText = stepConfig.promptText;
        promptTwi.innerText = TWI_FLOW[step]?.promptText || '';
      }

      // Play audio strictly from the dedicated language asset suite
      const audioFile = stepConfig.audio;
      const audioEl = document.getElementById('phoneAudioElement');
      if (step === 'welcome') {
        // First introduction audio is welcome_prompt_01.mp3 - never read a synthetic welcome message
        if (!audioEl || audioEl.paused || audioEl.ended || this.currentAudioUrl !== audioFile) {
          this.playPhoneAudio(audioFile, null);
        }
      } else {
        this.playPhoneAudio(audioFile, stepConfig.promptText);
      }

      // Fetch voice XML if route is defined
      if (stepConfig.xmlUrl) {
        this.fetchVoiceXml(stepConfig.xmlUrl);
      }

      // Render step interactive viewport
      viewport.innerHTML = stepConfig.render();

      // Auto-disconnect timers for closing steps
      if (step === 'not_available') {
        setTimeout(() => {
          if (this.callState.active && this.callState.step === 'not_available') {
            this.endCall();
          }
        }, 4200);
      } else if (step === 'done_exit') {
        setTimeout(() => {
          if (this.callState.active && this.callState.step === 'done_exit') {
            this.endCall();
          }
        }, 3200);
      } else if (step === 'wrong_figure') {
        clearTimeout(this.errorReturnTimer);
        this.errorReturnTimer = setTimeout(() => {
          if (this.callState.active && this.callState.step === 'wrong_figure') {
            this.retryStepAfterError();
          }
        }, 6000);
      }
    },

    handleWrongFigure(key) {
      console.log(`[Invalid Input Handler] Wrong figure punched: "${key}" on step: "${this.callState.step}"`);
      
      // Preserve original step before error
      if (this.callState.step !== 'wrong_figure') {
        this.callState.previousStepBeforeError = this.callState.step;
      }
      this.callState.lastInvalidKey = key || 'Unrecognized';

      // Visual feedback on the status indicator
      const statusText = document.getElementById('listeningStatusText');
      if (statusText) {
        if (this.callState.lang === 'twi') {
          statusText.innerHTML = `⚠️ <strong style="color:var(--amber-accent);">Nɔmba a wobɔe no nni prompt no mu:</strong> Audio prompt 11 reka kyerɛ wo sɛ nɔmba [${this.callState.lastInvalidKey}] nni dwumadie no mu.`;
        } else {
          statusText.innerHTML = `⚠️ <strong style="color:var(--amber-accent);">Option not in prompt:</strong> Audio prompt 11 playing: key [${this.callState.lastInvalidKey}] is not recognized.`;
        }
      }

      this.goToStep('wrong_figure');
    },

    retryStepAfterError() {
      clearTimeout(this.errorReturnTimer);
      const targetStep = this.callState.previousStepBeforeError || (this.callState.lang === 'twi' ? 'network' : 'welcome');
      console.log(`[Invalid Input Handler] Returning to step: ${targetStep} so caller can punch again`);
      this.goToStep(targetStep);
    },

    renderPinPadUi(title, isTwi) {
      return `
        <div class="pin-handoff-card" style="background:#0f172a; border:1px solid var(--emerald-accent); border-radius:8px; padding:12px; text-align:center;">
          <div style="font-size:12px; color:var(--emerald-accent); font-weight:bold; margin-bottom:4px;">
            📲 ${isTwi ? 'Fon So MoMo PIN Ahobammbɔ' : 'Secure Handset PIN Authentication Prompt'}
          </div>
          <div style="font-size:11px; color:#cbd5e1; margin-bottom:8px;">
            ${title}
          </div>
          <div class="pin-display-dots" id="pinDisplayDots" style="font-size:22px; letter-spacing:8px; color:var(--emerald-accent); margin-bottom:8px;">
            ○ ○ ○ ○
          </div>
          <div class="pin-keypad-mini" style="display:grid; grid-template-columns:repeat(3, 1fr); gap:4px; max-width:180px; margin:0 auto;">
            <button class="btn btn-xs btn-outline" onclick="window.app.enterPinDigit('1')">1</button>
            <button class="btn btn-xs btn-outline" onclick="window.app.enterPinDigit('2')">2</button>
            <button class="btn btn-xs btn-outline" onclick="window.app.enterPinDigit('3')">3</button>
            <button class="btn btn-xs btn-outline" onclick="window.app.enterPinDigit('4')">4</button>
            <button class="btn btn-xs btn-outline" onclick="window.app.enterPinDigit('5')">5</button>
            <button class="btn btn-xs btn-outline" onclick="window.app.enterPinDigit('6')">6</button>
            <button class="btn btn-xs btn-outline" onclick="window.app.enterPinDigit('7')">7</button>
            <button class="btn btn-xs btn-outline" onclick="window.app.enterPinDigit('8')">8</button>
            <button class="btn btn-xs btn-outline" onclick="window.app.enterPinDigit('9')">9</button>
            <button class="btn btn-xs btn-ghost" onclick="window.app.clearPin()">${isTwi ? 'Popa' : 'Clear'}</button>
            <button class="btn btn-xs btn-outline" onclick="window.app.enterPinDigit('0')">0</button>
            <button class="btn btn-xs btn-primary" onclick="window.app.submitPinAuthorization()">OK</button>
          </div>
          <div style="margin-top:6px; font-size:10px; color:#6ee7b7;">
            🛡️ ${isTwi ? 'Zero-PIN Ahobammbɔ: Nne kwan no nntie PIN da.' : 'Zero-PIN Security: Voice channel never captures PIN'}
          </div>
        </div>
      `;
    },

    renderReceiptUi(isTwi) {
      return `
        <div class="receipt-card">
          <div class="receipt-header">
            <span>✅</span>
            <span>${isTwi ? 'Woatumi Awie Dwumadie No Pɛpɛɛpɛ' : 'Transaction Successfully Completed'}</span>
          </div>
          <div class="receipt-row">
            <span>${isTwi ? 'Nea Onyae:' : 'Recipient:'}</span>
            <strong>Kwame Nyamebere (0553838464)</strong>
          </div>
          <div class="receipt-row">
            <span>${isTwi ? 'Sika a Womenee:' : 'Amount Sent:'}</span>
            <strong style="color:var(--emerald-accent);">GH₵ 500.00</strong>
          </div>
          <div class="receipt-row">
            <span>${isTwi ? 'Reference Nɔmba:' : 'Reference No:'}</span>
            <strong>OKP-847291</strong>
          </div>
          <div class="receipt-row">
            <span>${isTwi ? 'Da & Berɛ:' : 'Date & Time:'}</span>
            <span>17 Sep 2026, 5:00 PM</span>
          </div>
          <div class="receipt-row">
            <span>Status:</span>
            <strong style="color:var(--emerald-accent);">${isTwi ? 'Awie (Completed)' : 'Completed'}</strong>
          </div>
          <div style="margin-top:8px; border-top:1px dashed rgba(255,255,255,0.15); padding-top:6px; font-size:11.5px; color:#e2e8f0; text-align:center;">
            ${isTwi ? '"Wopɛ sɛ woyɛ biribi foforɔ bi bio anaa?"' : '"Would you like to do anything else?"'}
          </div>
          <div style="display:flex; gap:6px; margin-top:8px;">
            <button class="btn btn-sm btn-primary" style="flex:1;" onclick="window.app.pressKey('0')">
              ${isTwi ? 'Dabi, ma no nso (Mia 0)' : "No, that's all (Exit 0)"}
            </button>
            <button class="btn btn-sm btn-outline" style="flex:1;" onclick="window.app.goToStep('not_available')">
              ${isTwi ? 'Aane, dwumadie foforɔ' : 'Yes, other service'}
            </button>
          </div>
        </div>
      `;
    },

    renderUnavailableUi(text, btnLabel) {
      return `
        <div style="background:#1e1e2e; border:1px solid var(--amber-accent); border-radius:8px; padding:12px; text-align:center; color:#fff;">
          <div style="font-size:24px; margin-bottom:4px;">⚠️</div>
          <div style="font-size:13px; font-weight:bold; margin-bottom:6px; color:var(--amber-accent);">
            Option Not Available
          </div>
          <div style="font-size:11.5px; color:#cbd5e1; margin-bottom:10px;">
            ${text}
          </div>
          <button class="btn btn-sm btn-primary" onclick="window.app.startCall()">
            ${btnLabel}
          </button>
        </div>
      `;
    },

    renderDoneExitUi(text, btnLabel) {
      return `
        <div style="text-align:center; padding:14px 0;">
          <div style="font-size:26px; margin-bottom:6px;">👋</div>
          <div style="font-size:13px; color:var(--emerald-accent); font-weight:bold; margin-bottom:10px;">
            ${text}
          </div>
          <button class="btn btn-sm btn-primary" onclick="window.app.startCall()">
            ${btnLabel}
          </button>
        </div>
      `;
    },

    updateStepIndicators(step) {
      const steps = ['welcome', 'network', 'services', 'recipient', 'recipient_verify', 'amount', 'confirm', 'pin_handoff', 'receipt'];
      const map = {
        'welcome': 'stepIndicatorWelcome',
        'network': 'stepIndicatorProvider',
        'service': 'stepIndicatorService',
        'provider': 'stepIndicatorProvider',
        'services': 'stepIndicatorAction',
        'action': 'stepIndicatorAction',
        'recipient': 'stepIndicatorRecipient',
        'recipient_verify': 'stepIndicatorRecipient',
        'amount': 'stepIndicatorAmount',
        'confirm': 'stepIndicatorConfirm',
        'pin_handoff': 'stepIndicatorDone',
        'done': 'stepIndicatorDone',
        'receipt': 'stepIndicatorReceipt'
      };

      const stepOrder = {
        'welcome': 0,
        'service': 1,
        'network': 2,
        'provider': 2,
        'services': 3,
        'action': 3,
        'recipient': 4,
        'recipient_verify': 4,
        'amount': 5,
        'confirm': 6,
        'pin_handoff': 7,
        'done': 7,
        'receipt': 8
      };

      const currIdx = stepOrder[step] !== undefined ? stepOrder[step] : -1;
      const allIndicators = [
        'stepIndicatorWelcome',
        'stepIndicatorService',
        'stepIndicatorProvider',
        'stepIndicatorAction',
        'stepIndicatorRecipient',
        'stepIndicatorAmount',
        'stepIndicatorConfirm',
        'stepIndicatorDone',
        'stepIndicatorReceipt'
      ];

      allIndicators.forEach((id, idx) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.remove('current', 'completed');
        if (currIdx >= 0) {
          if (idx < currIdx) el.classList.add('completed');
          if (idx === currIdx) el.classList.add('current');
        }
      });

      const badge = document.getElementById('flowStepBadge');
      if (badge) {
        if (currIdx >= 0) {
          badge.innerText = `Step ${currIdx + 1} of 9`;
        } else {
          badge.innerText = 'Ready';
        }
      }
    },

    // ── Keypress / DTMF Handler ─────────────────────────────────────────
    pressKey(key) {
      this.dtmf.playTone(key);

      // Visual feedback on keypad button
      const keyEl = document.getElementById(`key${key === '*' ? 'Star' : key === '#' ? 'Hash' : key}`);
      if (keyEl) {
        keyEl.classList.add('key-pressed');
        setTimeout(() => keyEl.classList.remove('key-pressed'), 140);
      }

      // Barge-in: If audio prompt is currently playing, immediately cut it off on keypad press
      if (this.isPromptPlaying) {
        console.log(`[Barge-In] Keypad key [${key}] cut through prompt audio playback`);
        this.stopPhoneAudio();
      }

      if (!this.callState.active) {
        // STRICT USER REQUIREMENT: The simulation must only start when the user presses
        // "Start Call Simulation" or when the user places a new call.
        const transcriptText = document.getElementById('transcriptText');
        if (transcriptText) {
          transcriptText.innerText = 'Simulation idle. Click "Start Call Simulation" or "Place New Call" to begin.';
        }
        return;
      }

      // Keypad interaction while call is active: mark option selected and immediately deactivate speech recognition
      this.optionSelectedForCurrentPrompt = true;
      this.setSpeechRecognitionActive(false, `Keypad key "${key}" pressed`);

      // If user is inside phone recipient number entry
      if (this.callState.step === 'recipient') {
        const phoneInput = document.getElementById('inPhoneSim');
        if (key === '#') {
          this.submitSimRecipient();
          return;
        }
        if (key === '0' && (!phoneInput || phoneInput.value.length === 0)) {
          this.goToStep('cancel');
          return;
        }
        if (phoneInput && /^[0-9]$/.test(key) && phoneInput.value.length < 10) {
          phoneInput.value += key;
          return;
        }
      }

      // If user is inside amount entry
      if (this.callState.step === 'amount') {
        const amountInput = document.getElementById('inAmountSim');
        if (key === '#') {
          this.submitSimAmount();
          return;
        }
        if (key === '0' && (!amountInput || amountInput.value.length === 0)) {
          this.goToStep('cancel');
          return;
        }
        if (amountInput) {
          if (/^[0-9]$/.test(key)) {
            amountInput.value += key;
            return;
          }
          if (key === '*' && !amountInput.value.includes('.')) {
            amountInput.value += '.';
            return;
          }
        }
      }

      // If user is inside PIN handoff
      if (this.callState.step === 'pin_handoff') {
        if (/^[0-9]$/.test(key)) {
          this.enterPinDigit(key);
          return;
        }
        if (key === '#') {
          this.submitPinAuthorization();
          return;
        }
        if (key === '*') {
          this.clearPin();
          return;
        }
      }

      // If currently displaying wrong figure prompt, any key cancels timer and restores previous step
      if (this.callState.step === 'wrong_figure') {
        clearTimeout(this.errorReturnTimer);
        const prevStep = this.callState.previousStepBeforeError || (this.callState.lang === 'twi' ? 'network' : 'welcome');
        this.callState.step = prevStep;
      }

      // Universal Navigation Grammar handlers
      if (key === '0') {
        if (this.callState.step === 'receipt') {
          this.goToStep('done_exit');
        } else {
          this.goToStep('cancel');
        }
        return;
      }
      if (key === '9') {
        // Steps where 9 is NOT a valid repeat key
        if (this.callState.step === 'welcome' || this.callState.step === 'recipient' || this.callState.step === 'amount' || this.callState.step === 'pin_handoff') {
          this.handleWrongFigure('9');
          return;
        }
        if (this.callState.lang === 'twi' && this.callState.step === 'network') {
          // In Twi prompt 02, repeat is explicitly key 4 ("Mia anan 4 na tie wei biom"), so 9 is invalid
          this.handleWrongFigure('9');
          return;
        }
        // Valid repeat current prompt
        this.goToStep(this.callState.step);
        return;
      }
      if (key === '8') {
        // Back to previous step (language aware)
        const isTwi = this.callState.lang === 'twi';
        const prevSteps = isTwi ? {
          'services': 'network',
          'action': 'network',
          'recipient': 'services',
          'recipient_verify': 'recipient',
          'amount': 'recipient_verify',
          'confirm': 'amount'
        } : {
          'service': 'welcome',
          'network': 'service',
          'provider': 'service',
          'services': 'network',
          'action': 'network',
          'recipient': 'services',
          'recipient_verify': 'recipient',
          'amount': 'recipient_verify',
          'confirm': 'amount'
        };
        const prev = prevSteps[this.callState.step];
        if (prev) {
          this.goToStep(prev);
          return;
        }
        // 8 is not an option in welcome or Twi network
        if (this.callState.step === 'welcome' || (isTwi && this.callState.step === 'network')) {
          this.handleWrongFigure('8');
          return;
        }
      }

      // Step-specific routing
      if (this.callState.step === 'welcome') {
        if (key === '1') {
          // English chosen exclusively
          this.callState.lang = 'en';
          this.voiceMode = 'en';
          this.setVoiceMode('en');
          this.goToStep('service');
        } else if (key === '2') {
          // Twi chosen exclusively
          this.callState.lang = 'twi';
          this.voiceMode = 'twi';
          this.setVoiceMode('twi');
          this.goToStep('network');
        } else {
          // Any other figure on welcome -> Prompt 11
          this.handleWrongFigure(key);
        }
      } else if (this.callState.step === 'service') {
        if (key === '1' || key === '2') {
          this.callState.service = key === '2' ? 'banking' : 'momo';
          this.goToStep('network');
        } else {
          this.handleWrongFigure(key);
        }
      } else if (this.callState.step === 'network' || this.callState.step === 'provider') {
        if (this.callState.lang === 'twi' && key === '4') {
          // Twi prompt 02 explicitly states: "Mia anan (4) na tie wei biom"
          this.goToStep('network');
          return;
        }
        if (key === '1') {
          this.callState.provider = 'MTN';
          this.goToStep('services');
        } else if (key === '2') {
          this.callState.provider = 'Telecel';
          this.goToStep('services');
        } else if (key === '3') {
          this.callState.provider = 'AT';
          this.goToStep('services');
        } else {
          // Unmentioned figure -> Audio 11
          this.handleWrongFigure(key);
        }
      } else if (this.callState.step === 'services' || this.callState.step === 'action') {
        if (key === '1') {
          this.goToStep('recipient');
        } else if (['2', '3', '4', '5'].includes(key)) {
          this.goToStep('not_available');
        } else {
          // Any unlisted figure (6, 7, *, #) -> Audio 11
          this.handleWrongFigure(key);
        }
      } else if (this.callState.step === 'recipient') {
        const inputEl = document.getElementById('inPhoneSim');
        if (key === '#') {
          this.submitSimRecipient();
        } else if (['0','1','2','3','4','5','6','7','8','9'].includes(key)) {
          if (inputEl && inputEl.value.length < 10) {
            inputEl.value += key;
            this.callState.phone = inputEl.value;
          }
        } else {
          this.handleWrongFigure(key);
        }
      } else if (this.callState.step === 'recipient_verify') {
        if (key === '1') {
          this.goToStep('amount');
        } else if (key === '2') {
          this.goToStep('recipient');
        } else {
          this.handleWrongFigure(key);
        }
      } else if (this.callState.step === 'amount') {
        const inputEl = document.getElementById('inAmountSim');
        if (key === '#') {
          this.submitSimAmount();
        } else if (key === '*') {
          if (inputEl && !inputEl.value.includes('.')) {
            inputEl.value += '.';
            this.callState.amount = inputEl.value;
          }
        } else if (['0','1','2','3','4','5','6','7','8','9'].includes(key)) {
          if (inputEl) {
            inputEl.value += key;
            this.callState.amount = inputEl.value;
          }
        } else {
          this.handleWrongFigure(key);
        }
      } else if (this.callState.step === 'confirm') {
        if (key === '1') {
          this.goToStep('pin_handoff');
        } else if (key === '2') {
          this.goToStep('recipient');
        } else {
          this.handleWrongFigure(key);
        }
      } else if (this.callState.step === 'receipt') {
        if (key === '0' || key === '2') {
          this.goToStep('done_exit');
        } else if (key === '1') {
          this.goToStep('not_available');
        } else {
          this.handleWrongFigure(key);
        }
      }
    },

    submitSimRecipient() {
      const inputEl = document.getElementById('inPhoneSim');
      const val = inputEl ? inputEl.value.trim() : (this.callState.phone || '0553838464');
      if (val.length < 10) {
        this.handleWrongFigure(val ? `Nɔma ${val}` : 'Incomplete');
        return;
      }
      this.callState.phone = val;

      // Find in subscribers
      const sub = this.subscribers.find(s => s.phoneNumber === val);
      if (sub) {
        this.callState.name = sub.name;
        this.callState.provider = sub.network;
      } else {
        this.callState.name = val.endsWith('8464') ? 'Kwame Nyamebere' : `Subscriber (ends ${val.slice(-4)})`;
      }
      this.goToStep('recipient_verify');
    },

    submitSimAmount() {
      const inputEl = document.getElementById('inAmountSim');
      const val = inputEl ? inputEl.value.trim().replace('*', '.') : (this.callState.amount || '500');
      const num = parseFloat(val);
      if (isNaN(num) || num <= 0) {
        this.handleWrongFigure(val ? `${val} Cedis` : 'Invalid Amount');
        return;
      }
      this.callState.amount = String(num);
      this.goToStep('confirm');
    },

    bindKeyboard() {
      window.addEventListener('keydown', (e) => {
        // Only capture keypad if not actively typing in an input
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') {
          return;
        }
        const valid = ['0','1','2','3','4','5','6','7','8','9','*','#'];
        if (valid.includes(e.key)) {
          e.preventDefault();
          this.pressKey(e.key);
        }
      });
    },

    // ── Voice & Audio Playback in Phone ──────────────────────────────────
    unlockAudio(targetUrl) {
      const audioEl = document.getElementById('phoneAudioElement');
      if (audioEl) {
        const urlToPrime = targetUrl || this.currentAudioUrl || '/audio/welcome_prompt_01.mp3';
        if (audioEl.src !== urlToPrime && !audioEl.src.endsWith(urlToPrime)) {
          audioEl.src = urlToPrime;
        }
        audioEl.load();
        const p = audioEl.play();
        if (p && typeof p.then === 'function') {
          p.then(() => {
            const fileName = urlToPrime.split('/').pop();
            const sourceInd = document.getElementById('audioSourceIndicator');
            const playLabel = document.getElementById('playPromptLabel');
            if (sourceInd) sourceInd.innerText = `🎙️ Pre-recorded Voice: ${fileName}`;
            if (playLabel) playLabel.innerText = '⏸️ Pause Voice';
            this.startWaveformAnimation();
          }).catch(() => {
            // Ignored if user hasn't interacted or primed
          });
        }
      }
    },

    forcePlayAudio() {
      const audioEl = document.getElementById('phoneAudioElement');
      const sourceInd = document.getElementById('audioSourceIndicator');
      const playLabel = document.getElementById('playPromptLabel');

      if (!audioEl) return;

      if (!audioEl.paused && !audioEl.ended && audioEl.currentTime > 0) {
        audioEl.pause();
        this.isPromptPlaying = false;
        this.stopWaveformAnimation();
        if (playLabel) playLabel.innerText = '▶️ Play Voice';
        if (sourceInd) sourceInd.innerText = 'Audio paused';
        return;
      }

      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }

      const targetUrl = this.currentAudioUrl || '/audio/welcome_prompt_01.mp3';
      if (audioEl.src !== targetUrl && !audioEl.src.endsWith(targetUrl)) {
        audioEl.src = targetUrl;
        audioEl.load();
      }

      this.isPromptPlaying = true;
      this.setSpeechRecognitionActive(false, 'Manual audio play initiated');

      audioEl.play().then(() => {
        const fileName = targetUrl.split('/').pop();
        if (sourceInd) sourceInd.innerText = `🎙️ Pre-recorded Prompt: ${fileName}`;
        if (playLabel) playLabel.innerText = '⏸️ Pause Voice';
        this.startWaveformAnimation();
      }).catch((err) => {
        console.warn('Manual audio play failed:', err);
      });
    },

    playPhoneAudio(audioUrl, fallbackTtsText) {
      const audioEl = document.getElementById('phoneAudioElement');
      const sourceInd = document.getElementById('audioSourceIndicator');
      const playLabel = document.getElementById('playPromptLabel');

      this.stopPhoneAudio();
      this.currentAudioUrl = audioUrl;

      // Never speak a fallback synthetic welcome message for the intro prompt
      if ((audioUrl && audioUrl.toLowerCase().includes('welcome_prompt_01')) || this.callState.step === 'welcome') {
        fallbackTtsText = null;
      }

      const fileTag = document.getElementById('currentAudioFileName');
      if (fileTag) {
        fileTag.innerText = audioUrl ? audioUrl : 'None';
      }

      // When audio prompt begins, speech recognition is ACTIVE for Barge-In (cut-through),
      // allowing the caller to speak their choice (e.g. "baako", "1", "one") or press keypad to interrupt!
      this.isPromptPlaying = true;
      this.optionSelectedForCurrentPrompt = false;

      if (this.callState.active && !this.isPinPromptOpen && this.listeningServiceEnabled) {
        this.setSpeechRecognitionActive(true, 'Audio prompt playback started - Barge-In listening active');
      }

      if (audioEl) {
        audioEl.volume = 1.0;
      }

      // In English mode or whenever an audioUrl is supplied, NEVER use computer TTS
      if (audioUrl) {
        if (audioEl.src !== audioUrl && !audioEl.src.endsWith(audioUrl)) {
          audioEl.src = audioUrl;
          audioEl.load();
        }
        const playPromise = audioEl.play();
        if (playPromise !== undefined) {
          playPromise.then(() => {
            const fileName = audioUrl.split('/').pop();
            const langLabel = this.callState.lang === 'twi' ? 'Twi Recording' : 'English Prototype';
            if (sourceInd) sourceInd.innerText = `🎙️ Pre-recorded Voice: ${fileName} (${langLabel})`;
            if (playLabel) playLabel.innerText = '⏸️ Pause Voice';
            this.startWaveformAnimation();
          }).catch((err) => {
            console.log('Autoplay deferred or blocked:', err);
            const fileName = audioUrl.split('/').pop();
            if (sourceInd) sourceInd.innerText = `🎙️ Pre-recorded Clip: ${fileName} (Ready — Click Play)`;
            if (playLabel) playLabel.innerText = '▶️ Play Voice';
          });
        }

        audioEl.onended = () => {
          this.isPromptPlaying = false;
          this.stopWaveformAnimation();
          if (sourceInd) sourceInd.innerText = 'Audio playback completed';
          if (playLabel) playLabel.innerText = '▶️ Play Voice';

          // STRICT RULE: Speech recognition is active ONLY after each prompt is done playing
          // whiles the user has still not selected an option with the keypad yet,
          // AND provided the PIN prompt is not open.
          if (this.callState.active && !this.optionSelectedForCurrentPrompt && this.listeningServiceEnabled && !this.isPinPromptOpen) {
            console.log('[Audio Prompt Ended] Activating speech recognition for user response...');
            this.setSpeechRecognitionActive(true, 'Prompt playback finished, waiting for choice');
          } else {
            console.log('[Audio Prompt Ended] Speech recognition remains inactive (option selected, PIN prompt open, or call inactive)');
            if (this.isPinPromptOpen) {
              this.setSpeechRecognitionActive(false, 'PIN prompt is open - speech turned off');
            }
          }
        };

        audioEl.onerror = () => {
          this.isPromptPlaying = false;
          this.stopWaveformAnimation();
          if (this.callState.active && !this.optionSelectedForCurrentPrompt && this.listeningServiceEnabled && !this.isPinPromptOpen) {
            this.setSpeechRecognitionActive(true, 'Audio error fallback, waiting for response');
          }
        };
      } else {
        if (this.callState.lang === 'twi') {
          this.speakFallback(fallbackTtsText);
        } else {
          this.isPromptPlaying = false;
          if (this.callState.active && !this.optionSelectedForCurrentPrompt && this.listeningServiceEnabled && !this.isPinPromptOpen) {
            this.setSpeechRecognitionActive(true, 'Prompt step ready (no audio URL)');
          }
        }
      }
    },

    speakFallback(text) {
      // Only called for missing Akan Twi dynamic phrases, never for English prototype prompts
      if (this.callState.lang === 'en') return;

      this.isPromptPlaying = true;
      this.setSpeechRecognitionActive(false, 'TTS fallback prompt playing');

      const sourceInd = document.getElementById('audioSourceIndicator');
      if (sourceInd) sourceInd.innerText = 'TTS Audio Synthesis Simulation';

      if ('speechSynthesis' in window && text) {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(text);
        utter.rate = 0.95;
        this.startWaveformAnimation();
        const onDone = () => {
          this.isPromptPlaying = false;
          this.stopWaveformAnimation();
          if (this.callState.active && !this.optionSelectedForCurrentPrompt && this.listeningServiceEnabled && !this.isPinPromptOpen) {
            this.setSpeechRecognitionActive(true, 'TTS prompt finished, waiting for response');
          }
        };
        utter.onend = onDone;
        utter.onerror = onDone;
        window.speechSynthesis.speak(utter);
      } else {
        this.isPromptPlaying = false;
        if (this.callState.active && !this.optionSelectedForCurrentPrompt && this.listeningServiceEnabled && !this.isPinPromptOpen) {
          this.setSpeechRecognitionActive(true, 'TTS unavailable, waiting for response');
        }
      }
    },

    stopPhoneAudio() {
      const audioEl = document.getElementById('phoneAudioElement');
      const playLabel = document.getElementById('playPromptLabel');
      if (audioEl) {
        audioEl.pause();
        audioEl.currentTime = 0;
        audioEl.volume = 1.0;
      }
      this.isPromptPlaying = false;
      if (playLabel) {
        playLabel.innerText = '▶️ Play Voice';
      }
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      this.stopWaveformAnimation();
    },

    replayCurrentAudio() {
      if (this.currentAudioUrl) {
        this.forcePlayAudio();
      } else {
        this.pressKey('9');
      }
    },

    toggleDtmfSound() {
      this.dtmf.enabled = !this.dtmf.enabled;
      const label = document.getElementById('muteLabel');
      if (label) {
        label.innerText = this.dtmf.enabled ? '🔊 DTMF Sound On' : '🔇 DTMF Sound Off';
      }
    },

    // ── Conversational Accessibility Layer ──────────────────────────────
    resetConvInspector() {
      const intentEl = document.getElementById('convIntentBadge');
      const confEl = document.getElementById('convConfidenceBadge');
      const statusEl = document.getElementById('convStatusBadge');
      const netEl = document.getElementById('slotNetwork');
      const amtEl = document.getElementById('slotAmount');
      const recEl = document.getElementById('slotRecipient');
      if (intentEl) intentEl.innerText = 'OPEN_CONVERSATION';
      if (confEl) confEl.innerText = 'Ready';
      if (statusEl) statusEl.innerText = 'LISTENING_AT_ENTRY';
      if (netEl) netEl.innerText = '--';
      if (amtEl) amtEl.innerText = '--';
      if (recEl) recEl.innerText = '--';
    },

    updateConvInspector(turn) {
      if (!turn) return;
      const intentEl = document.getElementById('convIntentBadge');
      const confEl = document.getElementById('convConfidenceBadge');
      const statusEl = document.getElementById('convStatusBadge');
      const netEl = document.getElementById('slotNetwork');
      const amtEl = document.getElementById('slotAmount');
      const recEl = document.getElementById('slotRecipient');

      if (intentEl && turn.activeIntent) intentEl.innerText = turn.activeIntent;
      if (confEl && turn.confidence != null) {
        confEl.innerText = `${Math.round(turn.confidence * 100)}% Confidence`;
      }
      if (statusEl && turn.state && turn.state.status) {
        statusEl.innerText = turn.state.status;
      }
      if (turn.state) {
        if (netEl) netEl.innerText = turn.state.network || '--';
        if (amtEl) amtEl.innerText = turn.state.amount ? `${turn.state.amount} GHS` : '--';
        if (recEl) {
          if (turn.state.recipient_name) {
            const phoneSuffix = turn.state.recipient_phone ? ` (ends ${turn.state.recipient_phone.slice(-4)})` : '';
            recEl.innerText = `${turn.state.recipient_name}${phoneSuffix}`;
          } else {
            recEl.innerText = '--';
          }
        }
      }
    },

    speakConversationalPrompt(text) {
      if (!text) return;
      this.stopPhoneAudio();

      this.isPromptPlaying = true;
      this.setSpeechRecognitionActive(false, 'AI conversational prompt playing');

      const sourceInd = document.getElementById('audioSourceIndicator');
      if (sourceInd) sourceInd.innerText = '🗣️ AI Conversational Voice';
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        // Format digit sequences so speech synthesis speaks them as courteous individual digits with natural pauses
        const formattedSpeech = text
          .replace(/(\b0\d{9}\b)/g, (m) => m.slice(0, 3).split('').join(' ') + ', ' + m.slice(3, 6).split('').join(' ') + ', ' + m.slice(6).split('').join(' '))
          .replace(/ending in (\d{4})/gi, (_m, digits) => `ending in ${digits.split('').join(' ')}`);
        const utter = new SpeechSynthesisUtterance(formattedSpeech);
        utter.rate = 0.95; // Courteous, measured cadence
        utter.pitch = 1.0;
        this.startWaveformAnimation();
        const onDone = () => {
          this.isPromptPlaying = false;
          this.stopWaveformAnimation();
          if (sourceInd) sourceInd.innerText = 'Audio playback completed';
          if (this.callState.active && !this.optionSelectedForCurrentPrompt && this.listeningServiceEnabled && !this.isPinPromptOpen) {
            this.setSpeechRecognitionActive(true, 'Conversational prompt finished, waiting for choice');
          } else {
            if (this.isPinPromptOpen) {
              this.setSpeechRecognitionActive(false, 'PIN prompt is open - speech turned off');
            }
          }
        };
        utter.onend = onDone;
        utter.onerror = onDone;
        window.speechSynthesis.speak(utter);
      } else {
        this.isPromptPlaying = false;
        if (this.callState.active && !this.optionSelectedForCurrentPrompt && this.listeningServiceEnabled && !this.isPinPromptOpen) {
          this.setSpeechRecognitionActive(true, 'Conversational prompt ready, waiting for choice');
        }
      }
    },

    toggleSpeechRecognition() {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        alert("Speech recognition is not supported in this browser. Please type or click the demo speech chips below.");
        return;
      }
      if (this.playgroundRecogInstance) {
        this.playgroundRecogInstance.stop();
        this.playgroundRecogInstance = null;
        const mic = document.getElementById('btnVoiceMic');
        if (mic) mic.classList.remove('recording');
        return;
      }
      const recog = new SpeechRecognition();
      recog.lang = this.callState.lang === 'twi' ? 'ak-GH' : 'en-US';
      recog.continuous = false;
      recog.interimResults = false;
      const mic = document.getElementById('btnVoiceMic');
      if (mic) mic.classList.add('recording');

      recog.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        if (mic) mic.classList.remove('recording');
        this.playgroundRecogInstance = null;
        this.sendConversationalTurn(transcript);
      };
      recog.onerror = (err) => {
        console.warn('Speech recognition error:', err);
        if (mic) mic.classList.remove('recording');
        this.playgroundRecogInstance = null;
      };
      recog.onend = () => {
        if (mic) mic.classList.remove('recording');
        this.playgroundRecogInstance = null;
      };
      this.playgroundRecogInstance = recog;
      recog.start();
    },

    submitConversationalInput() {
      const inputEl = document.getElementById('convTextInput');
      if (!inputEl) return;
      const text = inputEl.value.trim();
      if (!text) return;
      inputEl.value = '';
      this.sendConversationalTurn(text);
    },

    async sendConversationalTurn(userText) {
      if (!userText) return;
      this.callState.step = 'conversational-turn';
      const promptEn = document.getElementById('currentPromptEn');
      const promptTwi = document.getElementById('currentPromptTwi');
      const stepTag = document.getElementById('currentStepTag');
      const sourceInd = document.getElementById('audioSourceIndicator');

      if (promptEn) promptEn.innerText = `Analyzing: "${userText}"...`;
      if (sourceInd) sourceInd.innerText = '⚡ Processing Conversational Turn...';

      try {
        const res = await fetch('/api/conversation/turn', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: this.callState.sessionId,
            text: userText,
            language: this.callState.lang
          })
        });
        const data = await res.json();
        if (!data.success) {
          alert('Error in conversational processing: ' + data.error);
          return;
        }

        const turn = data.turn;
        this.callState.activeConvState = turn.state;

        if (stepTag) stepTag.innerText = turn.displayStepTag || 'Conversational Turn';
        if (promptEn) promptEn.innerText = turn.spokenPrompt;
        if (promptTwi) promptTwi.innerText = turn.spokenPrompt;

        this.updateConvInspector(turn);
        this.speakConversationalPrompt(turn.spokenPrompt);

        if (turn.requiresPinInput) {
          this.renderHandsetPinPrompt(turn.state.amount, turn.state.recipient_name, turn.state.recipient_phone);
        } else if (turn.state && turn.state.status === 'COMPLETED') {
          this.renderCompletedState(turn);
        } else {
          this.renderConversationalTurnViewport(turn);
        }
      } catch (err) {
        console.error('Conversational turn failed:', err);
        alert('Could not complete conversational turn');
      }
    },

    renderConversationalTurnViewport(turn) {
      const viewport = document.getElementById('stepControlsViewport');
      if (!viewport) return;

      const state = turn.state || {};
      let demoChipsHtml = '';

      if (state.status === 'AWAITING_NETWORK') {
        demoChipsHtml = `
          <button class="demo-chip highlight" onclick="window.app.sendConversationalTurn('MTN')">💬 "MTN"</button>
          <button class="demo-chip" onclick="window.app.sendConversationalTurn('Telecel')">💬 "Telecel"</button>
          <button class="demo-chip" onclick="window.app.sendConversationalTurn('AT')">💬 "AT"</button>
        `;
      } else if (state.status === 'AWAITING_RECIPIENT') {
        demoChipsHtml = `
          <button class="demo-chip highlight" onclick="window.app.sendConversationalTurn('My preferred number is 055 383 8464')">💬 "055 383 8464 (Preferred Number)"</button>
          <button class="demo-chip" onclick="window.app.sendConversationalTurn('024 123 4567')">💬 "024 123 4567"</button>
          <button class="demo-chip" onclick="window.app.sendConversationalTurn('Kwame Nyamebere')">💬 "Kwame Nyamebere"</button>
        `;
      } else if (state.status === 'AWAITING_AMOUNT') {
        demoChipsHtml = `
          <button class="demo-chip highlight" onclick="window.app.sendConversationalTurn('500 cedis')">💬 "500 Cedis"</button>
          <button class="demo-chip" onclick="window.app.sendConversationalTurn('200 cedis')">💬 "200 Cedis"</button>
          <button class="demo-chip" onclick="window.app.sendConversationalTurn('50 cedis')">💬 "50 Cedis"</button>
        `;
      } else if (state.status === 'AWAITING_CONFIRMATION') {
        demoChipsHtml = `
          <button class="demo-chip highlight" onclick="window.app.sendConversationalTurn('Yes')">💬 "1: Yes / Confirm"</button>
          <button class="demo-chip" onclick="window.app.sendConversationalTurn('No, change number')">💬 "2: Change Number"</button>
          <button class="demo-chip" onclick="window.app.sendConversationalTurn('Cancel')">💬 "Cancel"</button>
        `;
      } else if (state.status === 'OFFER_CONTINUATION') {
        demoChipsHtml = `
          <button class="demo-chip highlight" onclick="window.app.sendConversationalTurn('Yes. Check my balance.')">💬 "Yes. Check my balance."</button>
          <button class="demo-chip" onclick="window.app.sendConversationalTurn('No')">📞 "No, that's all (Hang Up)"</button>
        `;
      } else {
        demoChipsHtml = `
          <button class="demo-chip highlight" onclick="window.app.sendConversationalTurn('I want to send 500 cedis to my preferred number 055 383 8464.')">💬 "Send 500 to preferred number 055 383 8464"</button>
          <button class="demo-chip" onclick="window.app.sendConversationalTurn('Send 500 cedis to Kwame.')">💬 "Send 500 to Kwame"</button>
          <button class="demo-chip" onclick="window.app.sendConversationalTurn('Check my balance.')">💬 "Check my balance"</button>
        `;
      }

      viewport.innerHTML = `
        <div class="conv-container">
          <div class="conv-input-row">
            <button class="btn-mic" id="btnVoiceMic" title="Click to speak" onclick="window.app.toggleSpeechRecognition()">
              <span id="micIcon">🎙️</span>
            </button>
            <input type="text" id="convTextInput" class="conv-text-input" placeholder="Speak or type your answer..." onkeydown="if(event.key==='Enter') window.app.submitConversationalInput()" />
            <button class="btn-conv-send" onclick="window.app.submitConversationalInput()">Send</button>
          </div>
          
          <div style="font-size:11px; color:var(--ink-muted); margin-top:2px;">
            <span>Suggested Responses:</span>
          </div>
          <div class="demo-chips-grid">
            ${demoChipsHtml}
          </div>

          <div style="margin-top:6px; border-top:1px dashed var(--border); padding-top:6px; display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:11.5px; color:var(--ink-muted);">Keypad Shortcut:</span>
            <span style="font-size:11.5px; color:var(--ink); font-weight:600;">1: Confirm / Select • 2: Cancel • 8: Back</span>
          </div>
        </div>
      `;
    },

    renderHandsetPinPrompt(amount, recipientName, recipientPhone) {
      const viewport = document.getElementById('stepControlsViewport');
      if (!viewport) return;
      this.callState.enteredPinDigits = '';
      this.isPinPromptOpen = true;
      this.setSpeechRecognitionActive(false, 'Handset PIN prompt opened — speech turned off for Zero-PIN security');

      viewport.innerHTML = `
        <div class="secure-pin-card">
          <div style="font-size:11.5px; color:var(--emerald-accent); font-weight:700; letter-spacing:0.5px;">🔒 SECURE HANDSET PROMPT</div>
          <div style="font-size:14px; font-weight:700; margin: 4px 0;">Authorize MTN Mobile Money Transfer</div>
          <div style="font-size:12px; color:#cbd5e1; margin-bottom:8px;">
            Transfer <strong>GH₵ ${amount}.00</strong> to <strong>${recipientName}</strong> (${recipientPhone})
          </div>
          <div style="font-size:11px; color:#94a3b8;">Enter 4-Digit MoMo PIN to Authorize:</div>
          <div class="pin-display-dots" id="pinDisplayDots">○ ○ ○ ○</div>
          <div class="pin-keypad-grid">
            <button class="pin-key-btn" onclick="window.app.enterPinDigit('1')">1</button>
            <button class="pin-key-btn" onclick="window.app.enterPinDigit('2')">2</button>
            <button class="pin-key-btn" onclick="window.app.enterPinDigit('3')">3</button>
            <button class="pin-key-btn" onclick="window.app.enterPinDigit('4')">4</button>
            <button class="pin-key-btn" onclick="window.app.enterPinDigit('5')">5</button>
            <button class="pin-key-btn" onclick="window.app.enterPinDigit('6')">6</button>
            <button class="pin-key-btn" onclick="window.app.enterPinDigit('7')">7</button>
            <button class="pin-key-btn" onclick="window.app.enterPinDigit('8')">8</button>
            <button class="pin-key-btn" onclick="window.app.enterPinDigit('9')">9</button>
            <button class="pin-key-btn action-clear" onclick="window.app.clearPin()">Clear</button>
            <button class="pin-key-btn" onclick="window.app.enterPinDigit('0')">0</button>
            <button class="pin-key-btn action-ok" onclick="window.app.submitPinAuthorization()">Authorize</button>
          </div>
          <div style="margin-top:10px; font-size:10.5px; color:#6ee7b7;">
            🛡️ Zero-PIN Security Boundary: Handset verifies credentials. Voice layer is turned off.
          </div>
        </div>
      `;
    },

    enterPinDigit(digit) {
      if (!this.callState.enteredPinDigits) this.callState.enteredPinDigits = '';
      if (this.callState.enteredPinDigits.length < 4) {
        this.callState.enteredPinDigits += digit;
        this.updatePinDots();
        if (this.callState.enteredPinDigits.length === 4) {
          setTimeout(() => this.submitPinAuthorization(), 300);
        }
      }
    },

    clearPin() {
      this.callState.enteredPinDigits = '';
      this.updatePinDots();
    },

    updatePinDots() {
      const dotsEl = document.getElementById('pinDisplayDots');
      if (!dotsEl) return;
      const count = (this.callState.enteredPinDigits || '').length;
      let s = '';
      for (let i = 0; i < 4; i++) {
        s += i < count ? '● ' : '○ ';
      }
      dotsEl.innerText = s.trim();
    },

    async submitPinAuthorization() {
      const pinDots = document.getElementById('pinDisplayDots');
      if (pinDots) pinDots.innerText = 'Verifying...';

      // Zero-PIN security guarantee: Clear entered PIN immediately, never send it
      this.callState.enteredPinDigits = '';

      try {
        const res = await fetch('/api/conversation/authorize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: this.callState.sessionId })
        });
        const data = await res.json();
        if (data.success) {
          // PIN prompt is now done! Mark PIN prompt closed so the cycle resumes
          this.isPinPromptOpen = false;

          const promptEn = document.getElementById('currentPromptEn');
          const promptTwi = document.getElementById('currentPromptTwi');
          const stepTag = document.getElementById('currentStepTag');
          const viewport = document.getElementById('stepControlsViewport');

          if (stepTag) stepTag.innerText = 'Transaction Successful & Receipt';
          if (promptEn) promptEn.innerText = data.spokenReceipt;
          if (promptTwi) promptTwi.innerText = data.spokenReceipt;

          this.updateConvInspector({
            activeIntent: 'SEND_MONEY',
            confidence: 1.0,
            state: {
              status: 'OFFER_CONTINUATION',
              network: 'MTN',
              amount: data.amount || this.callState.amount || '500',
              recipient_name: data.recipientName || this.callState.name || 'Kwame Nyamebere',
              recipient_phone: data.recipientPhone || this.callState.phone || '0553838464'
            }
          });

          // Resume cycle: Navigate directly to the receipt step where audio prompt plays, speech is off during playback, and resumes after prompt finishes
          this.goToStep('receipt');
        } else {
          alert(`Authorization failed: ${data.error}`);
        }
      } catch (err) {
        console.error('Authorization error:', err);
        alert('Failed to authorize transaction');
      }
    },

    renderCompletedState(turn) {
      const viewport = document.getElementById('stepControlsViewport');
      if (!viewport) return;
      viewport.innerHTML = `
        <div style="padding: 12px; text-align: center;">
          <div style="font-size: 24px; margin-bottom: 8px;">👋</div>
          <div style="font-weight: 700; color: var(--green-800); margin-bottom: 4px;">Call Completed</div>
          <p style="font-size: 13px; color: var(--ink-secondary); margin-bottom: 12px;">Thank you for using Ɔkwankyerɛfo Pa.</p>
          <button class="btn btn-call-start" style="width: 100%;" onclick="window.app.startCall()">
            <span>📞</span> Place New Call
          </button>
        </div>
      `;
    },

    handleKeypadInConversation(key) {
      const state = this.callState.activeConvState;
      if (!state) {
        if (key === '1') this.goToStep('service');
        return;
      }
      if (state.status === 'AWAITING_CONFIRMATION') {
        if (key === '1') this.sendConversationalTurn('Yes');
        else if (key === '2') this.sendConversationalTurn('Cancel');
        else if (key === '8') this.sendConversationalTurn('Go back');
        else if (key === '0') this.sendConversationalTurn('Exit');
      } else if (state.status === 'AWAITING_NETWORK') {
        if (key === '1') this.sendConversationalTurn('MTN');
        else if (key === '2') this.sendConversationalTurn('Telecel');
        else if (key === '3') this.sendConversationalTurn('AT');
      } else if (state.status === 'OFFER_CONTINUATION') {
        if (key === '1') this.sendConversationalTurn('Yes, check my balance');
        else if (key === '2' || key === '0') this.sendConversationalTurn('No');
      }
    },

    // ── Waveform Canvas Visualizer ───────────────────────────────────────
    initWaveformCanvas() {
      this.animCanvas = document.getElementById('waveformCanvas');
      this.animCtx = this.animCanvas ? this.animCanvas.getContext('2d') : null;
      this.isAnimating = false;
      this.drawIdleWaveform();
    },

    drawIdleWaveform() {
      if (!this.animCtx || !this.animCanvas) return;
      const ctx = this.animCtx;
      const w = this.animCanvas.width;
      const h = this.animCanvas.height;

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(0, h / 2 - 1, w, 2);
    },

    startWaveformAnimation() {
      this.isAnimating = true;
      let step = 0;
      const draw = () => {
        if (!this.isAnimating || !this.animCtx) return;
        const ctx = this.animCtx;
        const w = this.animCanvas.width;
        const h = this.animCanvas.height;

        ctx.clearRect(0, 0, w, h);
        const bars = 24;
        const barWidth = w / bars - 2;

        for (let i = 0; i < bars; i++) {
          const heightFactor = Math.sin(step * 0.15 + i * 0.4) * 0.5 + 0.5;
          const barHeight = Math.max(4, heightFactor * (h - 8));
          const x = i * (barWidth + 2);
          const y = (h - barHeight) / 2;

          ctx.fillStyle = i % 2 === 0 ? '#f59e0b' : '#38bdf8';
          ctx.fillRect(x, y, barWidth, barHeight);
        }
        step++;
        this.animFrameId = requestAnimationFrame(draw);
      };
      draw();
    },

    stopWaveformAnimation() {
      this.isAnimating = false;
      if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
      this.drawIdleWaveform();
    },

    // ── Fetch VoiceXML for Inspector ─────────────────────────────────────
    async fetchVoiceXml(endpoint) {
      try {
        const res = await fetch(endpoint);
        const xml = await res.text();
        const codeEl = document.getElementById('liveXmlCode');
        if (codeEl) codeEl.innerText = xml;
      } catch (err) {
        console.error('Failed to fetch XML:', err);
      }
    },

    copyCurrentXml() {
      const code = document.getElementById('liveXmlCode').innerText;
      navigator.clipboard.writeText(code).then(() => {
        alert('VoiceXML copied to clipboard!');
      });
    },

    // ── In-Browser Voice Recording Studio ────────────────────────────────
    async startRecording() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.recorder.stream = stream;
        this.recorder.audioChunks = [];

        const mediaRecorder = new MediaRecorder(stream);
        this.recorder.mediaRecorder = mediaRecorder;

        mediaRecorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            this.recorder.audioChunks.push(e.data);
          }
        };

        mediaRecorder.onstop = () => {
          const blob = new Blob(this.recorder.audioChunks, { type: 'audio/mp3' });
          this.recorder.recordedBlob = blob;
          const preview = document.getElementById('recordedAudioPreview');
          preview.src = URL.createObjectURL(blob);
          preview.style.display = 'block';

          document.getElementById('btnUploadRecorded').disabled = false;
        };

        mediaRecorder.start();
        document.getElementById('recordingStatusBadge').innerText = '🔴 Recording...';
        document.getElementById('recordingStatusBadge').className = 'badge badge-accent';
        document.getElementById('btnStartRecord').disabled = true;
        document.getElementById('btnStopRecord').disabled = false;

        // Start timer
        this.recorder.seconds = 0;
        this.recorder.timerInterval = setInterval(() => {
          this.recorder.seconds++;
          const m = String(Math.floor(this.recorder.seconds / 60)).padStart(2, '0');
          const s = String(this.recorder.seconds % 60).padStart(2, '0');
          document.getElementById('recordDuration').innerText = `${m}:${s}`;
        }, 1000);

      } catch (err) {
        alert(`Microphone access error: ${err.message || err}`);
      }
    },

    stopRecording() {
      if (this.recorder.mediaRecorder && this.recorder.mediaRecorder.state !== 'inactive') {
        this.recorder.mediaRecorder.stop();
      }
      if (this.recorder.stream) {
        this.recorder.stream.getTracks().forEach(track => track.stop());
      }
      clearInterval(this.recorder.timerInterval);
      document.getElementById('recordingStatusBadge').innerText = 'Recording Saved (Preview ready)';
      document.getElementById('recordingStatusBadge').className = 'badge';
      document.getElementById('btnStartRecord').disabled = false;
      document.getElementById('btnStopRecord').disabled = true;
    },

    async uploadRecordedAudio() {
      if (!this.recorder.recordedBlob) return;

      const sel = document.getElementById('selectRecordPhrase').value;
      const phrase = this.phrases.find(p => p.id === sel);
      if (!phrase) return;

      const dialect = document.getElementById('selectRecordDialect').value;
      const filename = phrase.filename;

      const reader = new FileReader();
      reader.readAsDataURL(this.recorder.recordedBlob);
      reader.onloadend = async () => {
        const base64Data = reader.result;
        try {
          const res = await fetch('/api/upload-audio', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              filename,
              phraseId: phrase.id,
              dialect,
              base64Data
            })
          });
          const data = await res.json();
          if (data.success) {
            alert(`Voice clip for "${phrase.title}" successfully uploaded and mapped to ${filename}!`);
            document.getElementById('btnUploadRecorded').disabled = true;
            this.loadPhrases();
          } else {
            alert(`Upload error: ${data.error}`);
          }
        } catch (e) {
          alert('Failed to upload recording');
        }
      };
    },

    quickRecordPhrase(phraseId) {
      this.switchTab('studio');
      const sel = document.getElementById('selectRecordPhrase');
      if (sel) {
        sel.value = phraseId;
        this.onPhraseSelectionChange();
      }
      document.getElementById('embeddedRecorderCard').scrollIntoView({ behavior: 'smooth' });
    },

    // ── Upload Modal Dialog ──────────────────────────────────────────────
    openUploadModal(preselectedPhraseId) {
      const modal = document.getElementById('modalUpload');
      if (modal) {
        modal.showModal();
        if (preselectedPhraseId) {
          const sel = document.getElementById('modalSelectPhrase');
          if (sel) sel.value = preselectedPhraseId;
        }
      }
    },

    closeUploadModal() {
      const modal = document.getElementById('modalUpload');
      if (modal) modal.close();
      this.uploadFile = null;
      document.getElementById('fileChosenName').innerText = '';
    },

    openRecordModal() {
      this.switchTab('studio');
      document.getElementById('embeddedRecorderCard').scrollIntoView({ behavior: 'smooth' });
    },

    handleFileSelect(e) {
      const file = e.target.files[0];
      if (file) this.setUploadFile(file);
    },

    setUploadFile(file) {
      this.uploadFile = file;
      const el = document.getElementById('fileChosenName');
      if (el) el.innerText = `Selected file: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
    },

    async submitAudioUpload() {
      if (!this.uploadFile) {
        alert('Please select an audio file first.');
        return;
      }

      const phraseId = document.getElementById('modalSelectPhrase').value;
      const phrase = this.phrases.find(p => p.id === phraseId);
      const filename = phrase ? phrase.filename : this.uploadFile.name;
      const dialect = document.getElementById('modalSelectDialect').value;
      const folderEl = document.getElementById('modalSelectFolder');
      const folder = folderEl ? folderEl.value : 'English_audio_prot';

      const reader = new FileReader();
      reader.readAsDataURL(this.uploadFile);
      reader.onloadend = async () => {
        try {
          const res = await fetch('/api/upload-audio', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              filename,
              phraseId,
              dialect,
              folder,
              base64Data: reader.result
            })
          });
          const data = await res.json();
          if (data.success) {
            alert(`Voice file ${filename} indexed successfully into the dataset!`);
            this.closeUploadModal();
            this.loadPhrases();
            this.loadPrototypeAudio();
          } else {
            alert(`Upload error: ${data.error}`);
          }
        } catch (err) {
          alert('Network error while uploading audio');
        }
      };
    },

    // ── Outbound Trigger ────────────────────────────────────────────────
    quickTriggerCall() {
      this.switchTab('api');
      document.getElementById('inputOutboundPhone').focus();
    },

    async triggerRealCall() {
      const phoneInput = document.getElementById('inputOutboundPhone');
      const statusEl = document.getElementById('outboundCallStatus');
      const btn = document.getElementById('btnTriggerOutbound');
      const phone = phoneInput ? phoneInput.value.trim() : '';

      const showStatus = (msg, isSuccess, isWarn = false) => {
        if (!statusEl) return;
        statusEl.style.display = 'block';
        if (isWarn) {
          statusEl.style.background = '#fffbeb';
          statusEl.style.border = '1px solid #fde68a';
          statusEl.style.color = '#92400e';
        } else if (isSuccess) {
          statusEl.style.background = '#f0fdf4';
          statusEl.style.border = '1px solid #bbf7d0';
          statusEl.style.color = '#166534';
        } else {
          statusEl.style.background = '#fef2f2';
          statusEl.style.border = '1px solid #fecaca';
          statusEl.style.color = '#991b1b';
        }
        statusEl.innerHTML = msg;
      };

      if (!phone) {
        showStatus('⚠️ Please enter a destination phone number with country code, e.g. <strong>+233543546010</strong>', false, true);
        if (phoneInput) phoneInput.focus();
        return;
      }

      if (btn) {
        btn.disabled = true;
        btn.innerText = 'Dialing...';
      }
      showStatus(`📡 Connecting to Africa's Talking Voice Gateway for <strong>${phone}</strong>...`, true, true);

      try {
        const res = await fetch('/api/at/trigger-call', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phoneNumber: phone })
        });
        const data = await res.json();
        if (data.success) {
          if (data.simulated) {
            showStatus(`📞 <strong>${data.provider}</strong>: ${data.message}<br><small style="opacity:0.85">Set <code>AT_API_KEY</code> in environment variables to route live calls through Ghana GSM towers.</small>`, true, true);
          } else {
            showStatus(`✅ <strong>Call Dispatched!</strong> Live call placed to <strong>${phone}</strong> via Africa's Talking (+233308048098). Pick up your phone to experience the IVR flow!`, true);
          }
        } else {
          showStatus(`❌ Gateway error: ${data.error || 'Failed to dispatch call'}`, false);
        }
      } catch (err) {
        // Fallback to legacy ussd-trigger if endpoint fails
        try {
          const params = new URLSearchParams();
          params.append('phoneNumber', phone);
          const res = await fetch('/ussd-trigger', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString()
          });
          const text = await res.text();
          showStatus(`📡 Gateway Response: ${text}`, true);
        } catch (innerErr) {
          showStatus('❌ Network error while connecting to voice gateway.', false);
        }
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerText = 'Dial Phone';
        }
      }
    }
  };

  // Expose to window for inline event handlers
  window.app = app;

  // Run upon DOM ready
  document.addEventListener('DOMContentLoaded', () => {
    app.init();
  });
})();
