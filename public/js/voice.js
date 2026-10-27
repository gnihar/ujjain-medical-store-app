(function () {
  let active = null;

  function Ctor() {
    return window.SpeechRecognition || window.webkitSpeechRecognition || null;
  }

  window.VoiceInput = {
    supported: function () {
      return !!Ctor();
    },
    stop: function () {
      if (!active) return;
      try {
        active.onend = null;
        active.stop();
      } catch (_e) {}
      active = null;
    },
    start: function (lang, cb) {
      const Rec = Ctor();
      cb = cb || {};
      if (!Rec) {
        if (cb.onError) cb.onError({ error: 'not-supported' });
        return;
      }
      this.stop();
      const rec = new Rec();
      active = rec;
      rec.lang = lang || 'hi-IN';
      rec.interimResults = true;
      rec.maxAlternatives = 5;
      rec.continuous = false;
      rec.onresult = function (event) {
        let interim = '';
        let finalText = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const piece = event.results[i][0].transcript || '';
          if (event.results[i].isFinal) finalText += piece;
          else interim += piece;
        }
        if (interim && cb.onPartial) cb.onPartial(interim);
        if (finalText && cb.onFinal) cb.onFinal(finalText.trim());
      };
      rec.onerror = function (event) {
        if (cb.onError) cb.onError(event);
      };
      rec.onend = function () {
        active = null;
        if (cb.onEnd) cb.onEnd();
      };
      try {
        rec.start();
      } catch (err) {
        if (cb.onError) cb.onError(err);
      }
    }
  };
})();
