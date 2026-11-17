const $ = id => document.getElementById(id);

let history = [];
let imageData = null;
let recorder = null;
let audioChunks = [];
let cameraStream = null;
let lastAnswer = '';

const headers = () => {
  const h = {};
  const token = $('token').value.trim();
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
};

/* ---------- Helpers ---------- */
function scrollToBottom() {
  const box = $('messages');
  box.scrollTop = box.scrollHeight;
}

function hideWelcome() {
  const w = $('welcome');
  if (w) w.remove();
}

function safeUrl(url) {
  try {
    const u = new URL(url);
    return ['http:', 'https:'].includes(u.protocol) ? u.href : null;
  } catch {
    return null;
  }
}

function sourceLabel(src) {
  if (src.type === 'pdf') return `PDF page ${src.page}`;
  try {
    return new URL(src.url).hostname.replace(/^www\./, '');
  } catch {
    return src.url || 'Source';
  }
}

function addSources(container, sources = []) {
  if (!sources.length) return;
  const wrap = document.createElement('div');
  wrap.className = 'sources';
  const label = document.createElement('span');
  label.className = 'label';
  label.textContent = 'Sources';
  wrap.append(label);

  sources.slice(0, 8).forEach(src => {
    const href = src.type === 'pdf' ? null : safeUrl(src.url);
    const chip = document.createElement(href ? 'a' : 'span');
    chip.className = 'source-chip';
    chip.textContent = sourceLabel(src);
    if (href) {
      chip.href = href;
      chip.target = '_blank';
      chip.rel = 'noopener noreferrer';
      chip.title = href;
    }
    wrap.append(chip);
  });
  container.append(wrap);
}

/* Creates a message row. Returns the bubble element. */
function bubble(text, kind = 'bot', sources = [], image = null) {
  hideWelcome();
  const row = document.createElement('div');
  row.className = `row ${kind}`;

  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.textContent = kind === 'user' ? 'You' : 'AI';

  const el = document.createElement('article');
  el.className = kind;

  if (image) {
    const img = document.createElement('img');
    img.className = 'msg-image';
    img.src = image;
    img.alt = 'Attached image';
    el.append(img);
  }
  if (text) el.append(document.createTextNode(text));
  addSources(el, sources);

  row.append(avatar, el);
  $('messages').append(row);
  scrollToBottom();
  return el;
}

function showTyping() {
  const el = bubble('', 'bot');
  const dots = document.createElement('span');
  dots.className = 'typing';
  dots.setAttribute('aria-label', 'Assistant is thinking');
  dots.innerHTML = '<i></i><i></i><i></i>';
  el.append(dots);
  return el;
}

/* ---------- Lightweight, safe markdown renderer ---------- */
function appendInlineMarkdown(element, text) {
  const pattern = /\*\*([^*\n]+)\*\*/g;
  let start = 0;
  for (const match of text.matchAll(pattern)) {
    element.append(document.createTextNode(text.slice(start, match.index)));
    const strong = document.createElement('strong');
    strong.textContent = match[1];
    element.append(strong);
    start = match.index + match[0].length;
  }
  element.append(document.createTextNode(text.slice(start)));
}

function renderAnswer(element, text) {
  element.replaceChildren();
  const lines = text.split(/\r?\n/);
  const isBullet = l => /^\s*[-*]\s+/.test(l);
  const isNumber = l => /^\s*\d+[.)]\s+/.test(l);
  const isHeading = l => /^#{1,6}\s+/.test(l);
  let i = 0;

  while (i < lines.length) {
    if (!lines[i].trim()) { i++; continue; }

    const heading = lines[i].match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const block = document.createElement(`h${Math.min(heading[1].length + 1, 4)}`);
      appendInlineMarkdown(block, heading[2]);
      element.append(block);
      i++;
      continue;
    }

    if (isBullet(lines[i]) || isNumber(lines[i])) {
      const ordered = isNumber(lines[i]);
      const list = document.createElement(ordered ? 'ol' : 'ul');
      while (i < lines.length && (ordered ? isNumber(lines[i]) : isBullet(lines[i]))) {
        const content = lines[i].replace(ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*]\s+/, '');
        const item = document.createElement('li');
        appendInlineMarkdown(item, content);
        list.append(item);
        i++;
      }
      element.append(list);
      continue;
    }

    const paragraph = document.createElement('p');
    while (i < lines.length && lines[i].trim() && !isHeading(lines[i]) && !isBullet(lines[i]) && !isNumber(lines[i])) {
      if (paragraph.childNodes.length) paragraph.append(document.createElement('br'));
      appendInlineMarkdown(paragraph, lines[i]);
      i++;
    }
    element.append(paragraph);
  }
}

function addActions(element, answer) {
  const bar = document.createElement('div');
  bar.className = 'bot-actions';
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'mini';
  copy.textContent = 'Copy';
  copy.onclick = async () => {
    try {
      await navigator.clipboard.writeText(answer);
      copy.textContent = 'Copied ✓';
      setTimeout(() => (copy.textContent = 'Copy'), 1500);
    } catch {
      copy.textContent = 'Failed';
    }
  };
  bar.append(copy);
  element.append(bar);
}

/* ---------- Server status ---------- */
async function check() {
  const s = $('status');
  try {
    const r = await fetch('/api/health');
    const d = await r.json();
    s.dataset.state = d.configured ? 'ok' : 'warn';
    s.textContent = d.configured ? 'Connected' : 'Configure API keys';
  } catch {
    s.dataset.state = 'off';
    s.textContent = 'Server offline';
  }
}
check();

/* ---------- Image handling ---------- */
function setImage(file) {
  if (!file) return;
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5e6) {
    alert('Use PNG/JPEG/WebP under 5MB');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    imageData = reader.result;
    $('thumbnail').src = imageData;
    $('preview').hidden = false;
  };
  reader.readAsDataURL(file);
}

$('image').addEventListener('change', e => setImage(e.target.files[0]));
$('remove').onclick = () => {
  imageData = null;
  $('preview').hidden = true;
  $('image').value = '';
};

/* ---------- Composer behaviour ---------- */
const textarea = $('message');
function autoGrow() {
  textarea.style.height = 'auto';
  textarea.style.height = Math.min(textarea.scrollHeight, 160) + 'px';
}
textarea.addEventListener('input', autoGrow);
textarea.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    $('chatForm').requestSubmit();
  }
});

document.addEventListener('click', e => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  textarea.value = chip.dataset.prompt;
  autoGrow();
  $('chatForm').requestSubmit();
});

/* ---------- Chat ---------- */
$('chatForm').addEventListener('submit', async e => {
  e.preventDefault();
  const message = textarea.value.trim();
  if (!message) return;

  const prior = history.slice(-8);
  const sentImage = imageData;
  bubble(message, 'user', [], sentImage);
  textarea.value = '';
  autoGrow();
  $('send').disabled = true;
  const pending = showTyping();

  try {
    const r = await fetch('/api/chat', {
      method: 'POST',
      headers: { ...headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history: prior, image_data: sentImage })
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.detail || 'Request failed');

    renderAnswer(pending, d.answer);
    addSources(pending, d.sources || []);
    addActions(pending, d.answer);
    if (currentUtterance) stopReading();
    lastAnswer = d.answer;
    history.push({ role: 'user', content: message }, { role: 'assistant', content: d.answer });
    $('remove').click();
  } catch (err) {
    pending.replaceChildren(document.createTextNode('Error: ' + err.message));
    pending.classList.add('error');
  } finally {
    $('send').disabled = false;
    scrollToBottom();
    textarea.focus();
  }
});

/* ---------- Voice input ---------- */
$('mic').onclick = async () => {
  const micLabel = $('mic').querySelector('.label');

  if (recorder && recorder.state === 'recording') {
    recorder.stop();
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks = [];
    recorder = new MediaRecorder(stream);
    recorder.ondataavailable = e => audioChunks.push(e.data);
    recorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      $('mic').classList.remove('recording');
      micLabel.textContent = 'Voice';
      const blob = new Blob(audioChunks, { type: recorder.mimeType });
      const data = new FormData();
      const extension = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'webm';
      data.append('file', blob, `voice.${extension}`);
      $('mic').disabled = true;
      micLabel.textContent = 'Transcribing…';
      try {
        const r = await fetch('/api/transcribe', { method: 'POST', headers: headers(), body: data });
        const out = await r.json();
        if (!r.ok) throw new Error(out.detail || 'Transcription failed');
        textarea.value = out.text;
        autoGrow();
        textarea.focus();
      } catch (err) {
        alert(err.message);
      } finally {
        $('mic').disabled = false;
        micLabel.textContent = 'Voice';
      }
    };
    recorder.start();
    $('mic').classList.add('recording');
    micLabel.textContent = 'Stop recording';
  } catch (err) {
    alert('Microphone unavailable: ' + err.message);
  }
};

/* ---------- Read answer aloud ---------- */
let currentUtterance = null;
const listenButton = $('listen');
const listenLabel = listenButton.querySelector('.label');

function stopReading() {
  window.speechSynthesis.cancel();
  currentUtterance = null;
  listenButton.classList.remove('reading');
  listenButton.setAttribute('aria-pressed', 'false');
  listenLabel.textContent = 'Read answer';
}

listenButton.onclick = () => {
  if (!lastAnswer) return alert('Ask a question first');
  if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) {
    return alert('Speech playback is not supported by this browser');
  }

  if (currentUtterance) {
    stopReading();
    return;
  }

  const text = lastAnswer
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1');
  const utterance = new SpeechSynthesisUtterance(text);
  currentUtterance = utterance;
  utterance.onend = () => {
    if (currentUtterance === utterance) stopReading();
  };
  utterance.onerror = event => {
    if (currentUtterance !== utterance) return;
    stopReading();
    if (!['canceled', 'interrupted'].includes(event.error)) {
      alert('Speech playback failed');
    }
  };
  window.speechSynthesis.speak(utterance);
  listenButton.classList.add('reading');
  listenButton.setAttribute('aria-pressed', 'true');
  listenLabel.textContent = 'Stop reading';
};

/* ---------- Camera ---------- */
function closeCamera() {
  cameraStream?.getTracks().forEach(t => t.stop());
  cameraStream = null;
  $('video').srcObject = null;
  $('video').hidden = true;
  $('cameraActions').hidden = true;
  $('cameraModal').hidden = true;
}

$('camera').onclick = async () => {
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    $('video').srcObject = cameraStream;
    $('video').hidden = false;
    $('cameraActions').hidden = false;
    $('cameraModal').hidden = false;
  } catch (err) {
    alert('Camera unavailable: ' + err.message);
  }
};

$('closeCamera').onclick = closeCamera;
$('cameraModal').addEventListener('click', e => { if (e.target === $('cameraModal')) closeCamera(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('cameraModal').hidden) closeCamera(); });

$('snap').onclick = () => {
  const v = $('video'), c = $('canvas');
  c.width = v.videoWidth;
  c.height = v.videoHeight;
  c.getContext('2d').drawImage(v, 0, 0);
  c.toBlob(b => setImage(new File([b], 'camera.jpg', { type: 'image/jpeg' })), 'image/jpeg', 0.85);
  closeCamera();
};
