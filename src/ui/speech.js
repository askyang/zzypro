/** Web Speech API 中文语音封装 */
export class SpeechGuide {
  constructor() {
    this.utterance = null;
    this.speakingText = '';
    this.enabled = typeof window !== 'undefined' && 'speechSynthesis' in window;
    this.onStateChange = null;
  }

  isSpeaking() {
    return this.enabled && window.speechSynthesis.speaking;
  }

  speak(text, { interrupt = true } = {}) {
    if (!this.enabled || !text) return false;
    if (interrupt) this.stop();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN';
    u.rate = 1.02;
    u.pitch = 1;
    this.utterance = u;
    this.speakingText = text;
    u.onend = () => {
      this.speakingText = '';
      this.onStateChange?.(false);
    };
    u.onerror = () => {
      this.speakingText = '';
      this.onStateChange?.(false);
    };
    window.speechSynthesis.speak(u);
    this.onStateChange?.(true);
    return true;
  }

  pause() {
    if (!this.enabled) return;
    if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
      window.speechSynthesis.pause();
      this.onStateChange?.(false);
    }
  }

  resume() {
    if (!this.enabled) return;
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
      this.onStateChange?.(true);
    }
  }

  stop() {
    if (!this.enabled) return;
    window.speechSynthesis.cancel();
    this.speakingText = '';
    this.onStateChange?.(false);
  }

  toggle(text) {
    if (!this.enabled) return 'unsupported';
    if (this.isSpeaking()) {
      this.stop();
      return 'stopped';
    }
    this.speak(text);
    return 'playing';
  }
}
