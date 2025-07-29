const BASE_URL = 'https://aissociate.scalors.it';
const API_KEY  = 'ck:4ea46438-b20e-438d-8127-55cd026e794b:c4207d7b-6885-432c-85b5-9ba938410992';

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('chat-form');
  const textarea = document.getElementById('question');
  const askButton = document.getElementById('ask-button');
  const buttonText = document.getElementById('button-text');
  const spinner = document.getElementById('spinner');
  const responseBox = document.getElementById('response');
  const historyList = document.getElementById('history-list');
  const clearHistoryBt = document.getElementById('clear-history');

  // Verlauf laden (aus localStorage)
  loadHistory();

  form.addEventListener('submit', async (evt) => {
    evt.preventDefault();
    const question = textarea.value.trim();
    if (!question) return;

    toggleBusy(true);
    responseBox.textContent = '';
    responseBox.classList.remove('error');

    try {
      const answer = await streamAsk(question, { responseEl: responseBox });
    } catch (err) {
      console.error(err);
      responseBox.textContent = `Fehler: ${err.message}`;
      responseBox.classList.add('error');
    } finally {
      toggleBusy(false);
      textarea.value = '';
      textarea.focus();
    }
  });

  function toggleBusy(isBusy) {
    askButton.disabled = isBusy;
    spinner.style.display = isBusy ? 'inline-block' : 'none';
    buttonText.textContent = isBusy ? 'Wird generiert …' : 'Antwort generieren';
  }

  async function streamAsk(question, { legalArea = null, scope = null, files = [], responseEl } = {}) {
    if (!API_KEY) throw new Error('AISSOCIATE_API_KEY fehlt oder ist leer.');

    const endpoint = `${BASE_URL}/api/public/v1/chat/ask`;
    const payload = {
      question,
      law: legalArea,
      sub_law: scope,
      file_context: files,
      file_query_type: 'general',
    };

    let res;
    try {
      res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_KEY,
        },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      if (err instanceof TypeError && /Failed to fetch/i.test(err.message)) {
        throw new Error([
          'Netzwerkfehler: „Failed to fetch“.',
          'Ursachen:',
          '- CORS blockiert',
          '- HTTPS/SSL-Fehler',
          '- Falscher Endpoint',
        ].join('\n'));
      }
      throw err;
    }

    if (!res.ok || !res.body) {
      const t = await res.text().catch(() => '');
      throw new Error(`Request failed (${res.status}): ${t}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split(/\r?\n\r?\n/);
      buffer = parts.pop();

      for (const rawBlock of parts) {
        if (!rawBlock.trim()) continue;
        const parsed = parseSSEBlock(rawBlock);
        if (parsed?.type === 'message' && typeof parsed.text === 'string') {
          fullText += parsed.text;
          if (responseEl) {
            responseEl.textContent += parsed.text;
            responseEl.scrollTop = responseEl.scrollHeight;
          }
        } else if (parsed?.type === 'ERROR') {
          throw new Error(parsed.text || 'Unbekannter Fehler');
        }
      }
    }

    return fullText.trim();
  }

  function parseSSEBlock(block) {
    const lines = block.split(/\r?\n/);
    let dataStr = '';
    for (const line of lines) {
      if (line.startsWith('data:')) {
        dataStr += (dataStr ? '\n' : '') + line.slice(5).trim();
      }
    }
    try {
      return JSON.parse(dataStr);
    } catch {
      return null;
    }
  }

  function addHistoryEntry(entry) {
    const li = document.createElement('li');
    li.innerHTML = `<strong>Q:</strong> ${entry.q}<br><strong>A:</strong> ${entry.a}`;
    historyList.prepend(li);
  }

  function saveHistory() {
    const items = Array.from(historyList.children).map(li => li.innerText);
    localStorage.setItem('chatHistory', JSON.stringify(items));
  }

  function loadHistory() {
    const items = JSON.parse(localStorage.getItem('chatHistory') || '[]');
    for (const item of items) {
      const li = document.createElement('li');
      li.innerText = item;
      historyList.appendChild(li);
    }
  }

  if (clearHistoryBt) {
    clearHistoryBt.addEventListener('click', () => {
      historyList.innerHTML = '';
      localStorage.removeItem('chatHistory');
    });
  }
});
