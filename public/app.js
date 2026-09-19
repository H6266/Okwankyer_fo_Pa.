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
      lang: 'en',
      service: 'momo',
      provider: 'MTN',
      phone: '0241234567',
      name: 'Kwame Nyameba',
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
    voiceMode: 'prototype', // 'prototype' (12 uploaded studio prompts for English) | 'bilingual'
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
      this.loadPhrases();
      this.loadPrototypeAudio();
      this.loadSubscribers();
      this.initWaveformCanvas();

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
        if (data.service) {
          const cfgBaseUrl = document.getElementById('cfgBaseUrl');
          if (cfgBaseUrl) cfgBaseUrl.innerText = window.location.origin;
        }
      } catch (err) {
        console.error('Failed to load status:', err);
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

    // ── English Prototype Audio Suite (/audio/English_audio_prot/) ────────
    setVoiceMode(mode) {
      this.voiceMode = mode;
      const btnDefault = document.getElementById('btnVoiceModeDefault');
      const btnProt = document.getElementById('btnVoiceModePrototype');
      if (btnDefault && btnProt) {
        btnDefault.classList.toggle('active', mode === 'bilingual');
        btnProt.classList.toggle('active', mode === 'prototype');
      }
      const indicator = document.getElementById('audioSourceIndicator');
      if (indicator) {
        indicator.innerText = mode === 'prototype' 
          ? 'Source: English Prototype Audio (/audio/English_audio_prot/)'
          : 'Source: Bilingual Akan Twi & English Core';
      }
      // Re-trigger current step audio with new engine
      if (this.callState.active && this.callState.step !== 'idle') {
        this.goToStep(this.callState.step);
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
      // 1. Prime/play audio element immediately and synchronously within the user interaction event
      const welcomeAudio = '/audio/English_audio_prot/12_welcome_language_intro.mp3';
      this.playPhoneAudio(welcomeAudio, 'Welcome to Okwankyerɛfo Pa. For English, press 1. For Twi, press 2.');

      this.callState.active = true;
      this.callState.seconds = 0;
      this.callState.sessionId = 'session_' + Math.random().toString(36).substring(2, 9);
      this.callState.activeConvState = null;
      this.callState.enteredPinDigits = '';
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
      this.goToStep('welcome');
    },

    endCall() {
      this.callState.active = false;
      clearInterval(this.callState.timerInterval);
      document.getElementById('callTimer').innerText = '00:00';
      document.getElementById('callStatusBadge').innerText = 'Call Idle';
      document.getElementById('callStatusBadge').style.color = 'var(--sky-accent)';

      this.stopPhoneAudio();
      this.updateStepIndicators('idle');

      document.getElementById('currentStepTag').innerText = 'Call Ended';
      document.getElementById('currentPromptTwi').innerText = 'Fa call no firi mu anaa sɔ bio.';
      document.getElementById('currentPromptEn').innerText = 'Call disconnected. Click "Start Call Simulation" to begin again.';
      document.getElementById('stepControlsViewport').innerHTML = `
        <button class="btn btn-call-start" style="width:100%;" onclick="window.app.startCall()">
          <span>📞</span> Place New Call
        </button>
      `;
      document.getElementById('liveXmlCode').innerText = '<!-- Call disconnected -->';
    },

    async goToStep(step) {
      this.callState.step = step;
      this.updateStepIndicators(step);

      const isTwi = this.callState.lang === 'twi';
      const promptTwi = document.getElementById('currentPromptTwi');
      const promptEn = document.getElementById('currentPromptEn');
      const stepTag = document.getElementById('currentStepTag');
      const viewport = document.getElementById('stepControlsViewport');
      const xmlInspector = document.getElementById('liveXmlCode');

      if (step === 'welcome') {
        stepTag.innerText = 'Step 1: Welcome & Language Choice';
        promptTwi.innerText = '"For English, press 1. Twi firi mu, mia 2."';
        promptEn.innerText = '"Welcome to Ɔkwankyerɛfo Pa, an easy financial transaction service. For English, press 1. For Twi, press 2."';

        const audioFile = '/audio/English_audio_prot/12_welcome_language_intro.mp3';
        const audioEl = document.getElementById('phoneAudioElement');
        if (!audioEl || audioEl.paused || audioEl.ended || this.currentAudioUrl !== audioFile) {
          this.playPhoneAudio(audioFile, 'Welcome to Okwankyerɛfo Pa. For English, press 1. For Twi, press 2.');
        }
        this.fetchVoiceXml('/voice-menu');

        viewport.innerHTML = `
          <div class="step-options-grid">
            <button class="step-opt-btn" onclick="window.app.pressKey('1')">
              <span>English Language</span>
              <span class="opt-key-tag">Press 1</span>
            </button>
            <button class="step-opt-btn" onclick="window.app.pressKey('2')">
              <span>Twi (Akan Kasa)</span>
              <span class="opt-key-tag">Press 2</span>
            </button>
          </div>
        `;
      } else if (step === 'conversational-entry') {
        stepTag.innerText = 'Conversational Assistant & MoMo Hub';
        const entryPromptEn = "How can I help you today? You can say things like 'send money to someone,' 'buy airtime,' or 'check my balance.' Or press 1 for the menu.";
        const entryPromptTwi = "Ɛdeɛn na me ntumi mmoa wo nnɛ? Wotumi ka sɛ 'me pɛ sɛ me mane sika,' 'tɔ airtime,' anaa 'hwɛ me balance.' Anaa mia baako (1) ma menu no.";

        promptEn.innerText = `"${entryPromptEn}"`;
        promptTwi.innerText = `"${entryPromptTwi}"`;

        this.speakConversationalPrompt(isTwi ? entryPromptTwi : entryPromptEn);
        this.updateConvInspector({
          activeIntent: 'OPEN_CONVERSATION',
          confidence: 1.0,
          state: { status: 'LISTENING_AT_ENTRY', network: null, amount: null, recipient_name: null }
        });

        viewport.innerHTML = `
          <div class="conv-container">
            <div class="conv-input-row">
              <button class="btn-mic" id="btnVoiceMic" title="Click to speak with microphone" onclick="window.app.toggleSpeechRecognition()">
                <span id="micIcon">🎙️</span>
              </button>
              <input type="text" id="convTextInput" class="conv-text-input" placeholder="Speak or type (e.g. 'I want to send 500 cedis to Kwame')..." onkeydown="if(event.key==='Enter') window.app.submitConversationalInput()" />
              <button class="btn-conv-send" onclick="window.app.submitConversationalInput()">Send</button>
            </div>
            
            <div style="font-size:11px; color:var(--ink-muted); margin-top:2px;">
              <span>Quick Demo Phrases:</span>
            </div>
            <div class="demo-chips-grid">
              <button class="demo-chip highlight" onclick="window.app.sendConversationalTurn('I want to send 500 cedis to Kwame.')">
                💬 "I want to send 500 cedis to Kwame."
              </button>
              <button class="demo-chip" onclick="window.app.sendConversationalTurn('Check my balance.')">
                💬 "Check my balance."
              </button>
              <button class="demo-chip" onclick="window.app.sendConversationalTurn('Buy 20 cedis airtime.')">
                💬 "Buy 20 cedis airtime."
              </button>
            </div>

            <div style="margin-top:6px; border-top:1px dashed var(--border); padding-top:6px; display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:11.5px; color:var(--ink-muted);">Prefer classic keypad?</span>
              <button class="btn btn-sm btn-ghost" style="font-size:11.5px; color:var(--green-800); font-weight:700;" onclick="window.app.pressKey('1')">
                🔢 Press 1 for Standard Menu
              </button>
            </div>
          </div>
        `;
      } else if (step === 'service') {
        stepTag.innerText = 'Step 2: Service Selection';
        promptTwi.innerText = '"Sɛ worepɛ Mobile Money anaa Telecom a, mia baako (1). Sikakorabea Banking, mia mmienu (2). Mia hwee (0) sɛ worepɛ agyae."';
        promptEn.innerText = '"For telecom or mobile money services, press 1. For banking services, press 2. To hear this again, press 9. To exit, press 0."';

        const audioFile = !isTwi
          ? '/audio/English_audio_prot/01_service_select.mp3'
          : null;
        this.playPhoneAudio(audioFile, isTwi ? 'Mobile money mia baako. Banking mia mmienu.' : 'For telecom or mobile money services, press 1. For banking services, press 2.');
        this.fetchVoiceXml(`/service-select?lang=${this.callState.lang}`);

        viewport.innerHTML = `
          <div class="step-options-grid">
            <button class="step-opt-btn" onclick="window.app.pressKey('1')">
              <span>Mobile Money / Telecom</span>
              <span class="opt-key-tag">Key 1</span>
            </button>
            <button class="step-opt-btn" onclick="window.app.pressKey('2')">
              <span>Banking (Pilot)</span>
              <span class="opt-key-tag">Key 2</span>
            </button>
          </div>
        `;
      } else if (step === 'provider') {
        stepTag.innerText = 'Step 3: Network Provider Selection';
        promptTwi.innerText = '"Paw wo network. MTN, mia baako (1). Telecel, mia mmienu (2). Africa\'s Talking AT, mia mmiɛnsa (3). Mia akron (9) ma replay, hwee (0) ma agyae."';
        promptEn.innerText = '"Select your network. For MTN, press 1. For Telecel, press 2. For AirtelTigo, press 3. Press 9 to hear this again. Press 0 to exit."';

        const audioFile = !isTwi
          ? '/audio/English_audio_prot/02_network_select.mp3'
          : null;
        this.playPhoneAudio(audioFile, isTwi ? 'Paw wo network: MTN baako, Telecel mmienu, AT mmiɛnsa.' : 'Select your network: For MTN press 1. For Telecel press 2. For AirtelTigo press 3.');
        this.fetchVoiceXml(`/provider-select?lang=${this.callState.lang}&service=${this.callState.service}`);

        viewport.innerHTML = `
          <div class="step-options-grid">
            <button class="step-opt-btn" onclick="window.app.pressKey('1')">
              <span>MTN Mobile Money</span>
              <span class="opt-key-tag">Key 1</span>
            </button>
            <button class="step-opt-btn" onclick="window.app.pressKey('2')">
              <span>Telecel Cash</span>
              <span class="opt-key-tag">Key 2</span>
            </button>
            <button class="step-opt-btn" onclick="window.app.pressKey('3')">
              <span>AT Money</span>
              <span class="opt-key-tag">Key 3</span>
            </button>
          </div>
        `;
      } else if (step === 'action') {
        stepTag.innerText = `Step 4: ${this.callState.provider} Action Menu`;
        promptTwi.innerText = `"${this.callState.provider} dwumadie. Sɛ woremane sika a, mia baako (1). Sɛ woregye wo balance a, mia mmienu (2). Mia 8 ma akyi, 0 ma agyae."`;
        promptEn.innerText = '"MTN services. To send money to another MoMo user, press 1. To pay bills, press 2. To buy airtime or bundle, press 3. To allow cash out, press 4. To check your account, press 5. Press 8 to go back or 0 to exit."';

        const audioFile = !isTwi
          ? '/audio/English_audio_prot/04_mtn_services_menu.mp3'
          : null;
        this.playPhoneAudio(audioFile, isTwi ? 'Sɛ woremane sika a mia baako. Balance mia mmienu.' : 'To send money to another MoMo user press 1.');
        this.fetchVoiceXml(`/action-select?lang=${this.callState.lang}&provider=${this.callState.provider}`);

        viewport.innerHTML = `
          <div class="step-options-grid">
            <button class="step-opt-btn" onclick="window.app.pressKey('1')">
              <span>Send Mobile Money</span>
              <span class="opt-key-tag">Key 1</span>
            </button>
            <button class="step-opt-btn" onclick="window.app.pressKey('2')">
              <span>Check MoMo Balance</span>
              <span class="opt-key-tag">Key 2</span>
            </button>
          </div>
        `;
      } else if (step === 'recipient') {
        stepTag.innerText = 'Step 5: Enter Recipient Number (# to submit)';
        promptTwi.innerText = '"Fa nɔma du (10) a woremane kɔma no nwura mu, na wie no hash (#). Mia hwee (0) sɛ worepɛ agyae."';
        promptEn.innerText = '"Enter the 10-digit number you want to send money to, followed by hash. Press 0 to exit."';

        const audioFile = !isTwi
          ? '/audio/English_audio_prot/05_enter_recipient_phone.mp3'
          : null;
        this.playPhoneAudio(audioFile, isTwi ? 'Fa nɔma du no nwura mu na wie hash.' : 'Enter the 10-digit number you want to send money to, followed by hash.');
        this.fetchVoiceXml(`/enter-recipient?lang=${this.callState.lang}&provider=${this.callState.provider}`);

        viewport.innerHTML = `
          <div style="text-align:center;">
            <input type="text" id="inPhoneSim" value="${this.callState.phone}" maxlength="10" 
              style="width:90%; padding:8px; font-size:16px; font-weight:bold; text-align:center; background:#000; border:1px solid var(--border-subtle); color:#fff; border-radius:6px; margin-bottom:8px;">
            <button class="btn btn-sm btn-primary" style="width:90%;" onclick="window.app.submitSimRecipient()">
              Submit Number (#)
            </button>
          </div>
        `;
      } else if (step === 'amount') {
        stepTag.innerText = `Step 6: Enter Amount to ${this.callState.name}`;
        promptTwi.innerText = `"Fa cedi dodow a woremane kɔma ${this.callState.name} no nwura mu, na wie no hash (#). Fa nsoroma (*) di dwuma ma pesewa."`;
        promptEn.innerText = `"Enter the cedi amount you want to send to ${this.callState.name}, followed by hash. Use star for pesewas."`;

        const audioFile = !isTwi
          ? '/audio/English_audio_prot/08_enter_amount_cedis.mp3'
          : null;
        this.playPhoneAudio(audioFile, isTwi ? `Fa cedi dodow a woremane kɔma ${this.callState.name} nwura mu.` : `Enter the cedi amount you want to send to ${this.callState.name}, followed by hash.`);
        this.fetchVoiceXml(`/enter-amount?lang=${this.callState.lang}&provider=${this.callState.provider}&phone=${this.callState.phone}&name=${encodeURIComponent(this.callState.name)}`);

        viewport.innerHTML = `
          <div style="text-align:center;">
            <input type="text" id="inAmountSim" value="${this.callState.amount}" 
              style="width:90%; padding:8px; font-size:16px; font-weight:bold; text-align:center; background:#000; border:1px solid var(--border-subtle); color:#fff; border-radius:6px; margin-bottom:8px;">
            <button class="btn btn-sm btn-primary" style="width:90%;" onclick="window.app.submitSimAmount()">
              Submit Amount (#)
            </button>
          </div>
        `;
      } else if (step === 'confirm') {
        stepTag.innerText = 'Step 7: Safe Confirmation (Name Read-Back)';
        const last4 = this.callState.phone.slice(-4);
        promptTwi.innerText = `"Woremane sika cedi ${this.callState.amount} kɔma ${this.callState.name}, a ne fon nɔma wie ${last4}. Sɛ wopene so a, mia baako (1). Sɛ worepɛ sesa no a, mia mmienu (2). Mia hwee (0) ma agyae."`;
        promptEn.innerText = `"You are about to send ${this.callState.amount} Ghana Cedis to ${this.callState.name}. To confirm and send, press 1. To cancel, press 2."`;

        if (!isTwi) {
          this.playPhoneAudio('/audio/English_audio_prot/09_confirm_transfer_summary.mp3', promptEn.innerText);
        } else if (this.callState.amount === '50') {
          this.playPhoneAudio('/audio/confirm_twi.mp3', promptTwi.innerText);
        } else {
          this.playPhoneAudio(null, promptTwi.innerText);
        }

        this.fetchVoiceXml(`/safe-confirmation?lang=${this.callState.lang}&provider=${this.callState.provider}&phone=${this.callState.phone}&name=${encodeURIComponent(this.callState.name)}&amount=${this.callState.amount}`);

        viewport.innerHTML = `
          <div class="step-options-grid">
            <button class="step-opt-btn" onclick="window.app.pressKey('1')">
              <span style="color:var(--emerald-accent); font-weight:bold;">1: Confirm Transfer</span>
              <span class="opt-key-tag">Key 1</span>
            </button>
            <button class="step-opt-btn" onclick="window.app.pressKey('2')">
              <span>2: Edit / Re-enter Number</span>
              <span class="opt-key-tag">Key 2</span>
            </button>
            <button class="step-opt-btn" onclick="window.app.pressKey('0')">
              <span style="color:var(--danger-accent);">0: Cancel Transaction</span>
              <span class="opt-key-tag">Key 0</span>
            </button>
          </div>
        `;
      } else if (step === 'done') {
        stepTag.innerText = 'Step 8: Zero-PIN Security Handoff';
        promptTwi.innerText = `"Yɛapene cedi ${this.callState.amount} a woremane kɔma ${this.callState.name} no so. Sesei, hwɛ wo screen na fa wo MoMo PIN nwura mu pɛpɛɛpɛ."`;
        promptEn.innerText = '"Confirmed. Now, please check your phone screen and enter your MoMo PIN accurately. Thank you for using Okwankyerɛfo Pa. Goodbye."';

        const successAudio = !isTwi
          ? '/audio/English_audio_prot/10_pin_prompt_screen_handoff.mp3'
          : '/audio/success_twi.mp3';
        this.playPhoneAudio(successAudio, promptEn.innerText);

        this.fetchVoiceXml(`/safe-outcome?lang=${this.callState.lang}&provider=${this.callState.provider}&phone=${this.callState.phone}&name=${encodeURIComponent(this.callState.name)}&amount=${this.callState.amount}&dtmfDigits=1`);

        viewport.innerHTML = `
          <div style="text-align:center; padding:10px 0;">
            <div style="font-size:24px; margin-bottom:4px;">🔒</div>
            <div style="font-size:12.5px; color:var(--emerald-accent); font-weight:bold;">
              Zero-PIN Gate Enforced: Phone Prompt Sent to Handset
            </div>
            <button class="btn btn-sm btn-secondary" style="margin-top:10px;" onclick="window.app.startCall()">
              Place New Call
            </button>
          </div>
        `;
      } else if (step === 'cancel') {
        stepTag.innerText = 'Transaction Cancelled';
        promptTwi.innerText = '"Yɛatwa mu. Sika no mfiri wo account mu. Akwaaba."';
        promptEn.innerText = '"Transaction cancelled. No money has been deducted from your account. Goodbye."';

        const cancelAudio = isTwi ? '/audio/cancel_twi.mp3' : '/audio/English_audio_prot/10_pin_prompt_screen_handoff.mp3';
        this.playPhoneAudio(cancelAudio, promptEn.innerText);

        viewport.innerHTML = `
          <button class="btn btn-sm btn-secondary" style="width:100%;" onclick="window.app.startCall()">
            Restart Flow
          </button>
        `;
      }
    },

    updateStepIndicators(step) {
      const steps = ['welcome', 'service', 'provider', 'action', 'recipient', 'amount', 'confirm', 'done'];
      const map = {
        'welcome': 'stepIndicatorWelcome',
        'service': 'stepIndicatorService',
        'provider': 'stepIndicatorProvider',
        'action': 'stepIndicatorAction',
        'recipient': 'stepIndicatorRecipient',
        'amount': 'stepIndicatorAmount',
        'confirm': 'stepIndicatorConfirm',
        'done': 'stepIndicatorDone'
      };

      const currIdx = steps.indexOf(step);
      steps.forEach((s, idx) => {
        const el = document.getElementById(map[s]);
        if (!el) return;
        el.classList.remove('current', 'completed');
        if (currIdx >= 0) {
          if (idx < currIdx) el.classList.add('completed');
          if (idx === currIdx) el.classList.add('current');
        }
      });

      const badge = document.getElementById('flowStepBadge');
      if (badge && currIdx >= 0) {
        badge.innerText = `Step ${currIdx + 1} of 8`;
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

      if (!this.callState.active) {
        // Auto start if user starts dialling
        this.startCall();
        return;
      }

      // Universal Navigation Grammar handlers:
      if (key === '0') {
        // Cancel transaction / exit
        this.goToStep('cancel');
        return;
      }
      if (key === '9') {
        // Repeat current prompt
        this.goToStep(this.callState.step);
        return;
      }
      if (key === '8') {
        // Back to previous step
        const prevSteps = {
          'service': 'welcome',
          'provider': 'service',
          'action': 'provider',
          'recipient': 'action',
          'amount': 'recipient',
          'confirm': 'amount'
        };
        const prev = prevSteps[this.callState.step];
        if (prev) {
          this.goToStep(prev);
        }
        return;
      }

      // Step-specific routing
      if (this.callState.step === 'welcome') {
        this.callState.lang = key === '2' ? 'twi' : 'en';
        this.goToStep('conversational-entry');
      } else if (this.callState.step === 'conversational-entry' || this.callState.step === 'conversational-turn') {
        if (this.callState.step === 'conversational-entry' && key === '1') {
          this.goToStep('service');
        } else {
          this.handleKeypadInConversation(key);
        }
      } else if (this.callState.step === 'service') {
        this.callState.service = key === '2' ? 'banking' : 'momo';
        this.goToStep('provider');
      } else if (this.callState.step === 'provider') {
        if (key === '1') this.callState.provider = 'MTN';
        else if (key === '2') this.callState.provider = 'Telecel';
        else if (key === '3') this.callState.provider = 'AT';
        this.goToStep('action');
      } else if (this.callState.step === 'action') {
        if (key === '1') {
          this.goToStep('recipient');
        } else if (key === '2') {
          alert('Balance check requested. Handset notification triggered.');
          this.goToStep('done');
        }
      } else if (this.callState.step === 'confirm') {
        if (key === '1') {
          this.goToStep('done');
        } else if (key === '2') {
          this.goToStep('recipient');
        }
      }
    },

    submitSimRecipient() {
      const val = document.getElementById('inPhoneSim').value.trim();
      if (val.length < 10) {
        alert('Please enter a valid 10-digit Ghanaian phone number.');
        return;
      }
      this.callState.phone = val;

      // Find in subscribers
      const sub = this.subscribers.find(s => s.phoneNumber === val);
      if (sub) {
        this.callState.name = sub.name;
        this.callState.provider = sub.network;
      } else {
        this.callState.name = `Subscriber (ends ${val.slice(-4)})`;
      }
      this.goToStep('amount');
    },

    submitSimAmount() {
      const val = document.getElementById('inAmountSim').value.trim().replace('*', '.');
      const num = parseFloat(val);
      if (isNaN(num) || num <= 0) {
        alert('Please enter a valid amount.');
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
        const urlToPrime = targetUrl || this.currentAudioUrl || '/audio/English_audio_prot/12_welcome_language_intro.mp3';
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
        this.stopWaveformAnimation();
        if (playLabel) playLabel.innerText = '▶️ Play Voice';
        if (sourceInd) sourceInd.innerText = 'Audio paused';
        return;
      }

      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }

      const targetUrl = this.currentAudioUrl || '/audio/English_audio_prot/12_welcome_language_intro.mp3';
      if (audioEl.src !== targetUrl && !audioEl.src.endsWith(targetUrl)) {
        audioEl.src = targetUrl;
        audioEl.load();
      }
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
            if (sourceInd) sourceInd.innerText = `🎙️ Pre-recorded Voice: ${fileName}`;
            if (playLabel) playLabel.innerText = '⏸️ Pause Voice';
            this.startWaveformAnimation();
          }).catch((err) => {
            console.log('Autoplay deferred or blocked:', err);
            const fileName = audioUrl.split('/').pop();
            if (sourceInd) sourceInd.innerText = `🎙️ Pre-recorded Clip: ${fileName} (Ready)`;
            if (playLabel) playLabel.innerText = '▶️ Play Voice';
            // Do NOT call speakFallback for English prompts. Keep human voice authentic.
            if (this.callState.lang === 'twi' && !audioUrl.includes('English_audio_prot')) {
              this.speakFallback(fallbackTtsText);
            }
          });
        }

        audioEl.onended = () => {
          this.stopWaveformAnimation();
          if (sourceInd) sourceInd.innerText = 'Audio playback completed';
          if (playLabel) playLabel.innerText = '▶️ Play Voice';
        };
      } else {
        if (this.callState.lang === 'twi') {
          this.speakFallback(fallbackTtsText);
        }
      }
    },

    speakFallback(text) {
      // Only called for missing Akan Twi dynamic phrases, never for English prototype prompts
      if (this.callState.lang === 'en') return;

      const sourceInd = document.getElementById('audioSourceIndicator');
      if (sourceInd) sourceInd.innerText = 'TTS Audio Synthesis Simulation';

      if ('speechSynthesis' in window && text) {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(text);
        utter.rate = 0.95;
        this.startWaveformAnimation();
        utter.onend = () => this.stopWaveformAnimation();
        utter.onerror = () => this.stopWaveformAnimation();
        window.speechSynthesis.speak(utter);
      }
    },

    stopPhoneAudio() {
      const audioEl = document.getElementById('phoneAudioElement');
      const playLabel = document.getElementById('playPromptLabel');
      if (audioEl) {
        audioEl.pause();
        audioEl.currentTime = 0;
      }
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
      const sourceInd = document.getElementById('audioSourceIndicator');
      if (sourceInd) sourceInd.innerText = '🗣️ AI Conversational Voice';
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(text);
        utter.rate = 1.0;
        utter.pitch = 1.0;
        this.startWaveformAnimation();
        utter.onend = () => {
          this.stopWaveformAnimation();
          if (sourceInd) sourceInd.innerText = 'Audio playback completed';
        };
        utter.onerror = () => {
          this.stopWaveformAnimation();
        };
        window.speechSynthesis.speak(utter);
      }
    },

    toggleSpeechRecognition() {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        alert("Speech recognition is not supported in this browser. Please type or click the demo speech chips below.");
        return;
      }
      if (this.speechRecogInstance) {
        this.speechRecogInstance.stop();
        this.speechRecogInstance = null;
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
        this.speechRecogInstance = null;
        this.sendConversationalTurn(transcript);
      };
      recog.onerror = (err) => {
        console.warn('Speech recognition error:', err);
        if (mic) mic.classList.remove('recording');
        this.speechRecogInstance = null;
      };
      recog.onend = () => {
        if (mic) mic.classList.remove('recording');
        this.speechRecogInstance = null;
      };
      this.speechRecogInstance = recog;
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
      } else if (state.status === 'AWAITING_CONFIRMATION') {
        demoChipsHtml = `
          <button class="demo-chip highlight" onclick="window.app.sendConversationalTurn('Yes')">💬 "1: Yes / Confirm"</button>
          <button class="demo-chip" onclick="window.app.sendConversationalTurn('No, make it 200')">💬 "No, make it 200"</button>
          <button class="demo-chip" onclick="window.app.sendConversationalTurn('Cancel')">💬 "Cancel"</button>
        `;
      } else if (state.status === 'OFFER_CONTINUATION') {
        demoChipsHtml = `
          <button class="demo-chip highlight" onclick="window.app.sendConversationalTurn('Yes. Check my balance.')">💬 "Yes. Check my balance."</button>
          <button class="demo-chip" onclick="window.app.sendConversationalTurn('No')">📞 "No, that's all (Hang Up)"</button>
        `;
      } else {
        demoChipsHtml = `
          <button class="demo-chip highlight" onclick="window.app.sendConversationalTurn('I want to send 500 cedis to Kwame.')">💬 "I want to send 500 cedis to Kwame."</button>
          <button class="demo-chip" onclick="window.app.sendConversationalTurn('Check my balance.')">💬 "Check my balance."</button>
          <button class="demo-chip" onclick="window.app.sendConversationalTurn('Cancel')">💬 "Cancel"</button>
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
            🛡️ Zero-PIN Security Boundary: Handset verifies credentials. The AI layer receives ONLY an authorization outcome token.
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
          const promptEn = document.getElementById('currentPromptEn');
          const promptTwi = document.getElementById('currentPromptTwi');
          const stepTag = document.getElementById('currentStepTag');
          const viewport = document.getElementById('stepControlsViewport');

          if (stepTag) stepTag.innerText = 'Transaction Successful & Receipt';
          if (promptEn) promptEn.innerText = data.spokenReceipt;
          if (promptTwi) promptTwi.innerText = data.spokenReceipt;

          this.speakConversationalPrompt(data.spokenReceipt);

          this.updateConvInspector({
            activeIntent: 'SEND_MONEY',
            confidence: 1.0,
            state: {
              status: 'OFFER_CONTINUATION',
              network: 'MTN',
              amount: data.amount,
              recipient_name: data.recipientName,
              recipient_phone: data.recipientPhone
            }
          });

          const formattedTime = new Date(data.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

          viewport.innerHTML = `
            <div class="receipt-card">
              <div class="receipt-header">
                <span>✅</span>
                <span>Transfer Successfully Sent!</span>
              </div>
              <div class="receipt-row">
                <span>Reference:</span>
                <strong>${data.reference}</strong>
              </div>
              <div class="receipt-row">
                <span>Amount Sent:</span>
                <strong>GH₵ ${Number(data.amount).toFixed(2)}</strong>
              </div>
              <div class="receipt-row">
                <span>Recipient:</span>
                <strong>${data.recipientName} (${data.recipientPhone})</strong>
              </div>
              <div class="receipt-row">
                <span>Completed At:</span>
                <strong>${formattedTime}</strong>
              </div>
            </div>

            <div style="font-size:12px; color:var(--ink-secondary); margin: 6px 0;">Would you like to do anything else?</div>
            <div class="demo-chips-grid">
              <button class="demo-chip highlight" onclick="window.app.sendConversationalTurn('Yes. Check my balance.')">
                💬 "Yes. Check my balance."
              </button>
              <button class="demo-chip" onclick="window.app.sendConversationalTurn('No')">
                📞 "No, that's all (Hang Up)"
              </button>
            </div>
          `;
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
      const phone = document.getElementById('inputOutboundPhone').value.trim();
      if (!phone) {
        alert('Please enter a destination phone number with country code, e.g. +233543546010');
        return;
      }
      alert(`Initiating Africa's Talking outbound callback call to: ${phone}`);
      try {
        const params = new URLSearchParams();
        params.append('phoneNumber', phone);
        const res = await fetch('/ussd-trigger', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params.toString()
        });
        const text = await res.text();
        alert(`Gateway response: ${text}`);
      } catch (err) {
        alert('Error triggering outbound call');
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
