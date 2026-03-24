export function getIndexHtml(port: number): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OpenCode Memory Manager</title>
  <style>
    :root {
      --bg-color: #0f172a;
      --panel-bg: #1e293b;
      --text-main: #f8fafc;
      --text-muted: #94a3b8;
      --accent: #3b82f6;
      --accent-hover: #2563eb;
      --danger: #ef4444;
      --danger-hover: #dc2626;
      --border: #334155;
      --radius: 8px;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      background-color: var(--bg-color);
      color: var(--text-main);
      font-family: system-ui, -apple-system, sans-serif;
      line-height: 1.5;
      height: 100vh;
      display: flex;
      flex-direction: column;
    }

    header {
      background-color: var(--panel-bg);
      padding: 1rem 2rem;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    h1 {
      font-size: 1.25rem;
      font-weight: 600;
    }

    .container {
      display: flex;
      flex: 1;
      overflow: hidden;
    }

    aside {
      width: 300px;
      background-color: var(--panel-bg);
      border-right: 1px solid var(--border);
      padding: 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 2rem;
      overflow-y: auto;
    }

    main {
      flex: 1;
      padding: 2rem;
      display: flex;
      flex-direction: column;
      overflow-y: auto;
    }

    .section-title {
      font-size: 0.875rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
      margin-bottom: 0.75rem;
    }

    .stat-box {
      background-color: var(--bg-color);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 1rem;
    }

    .profile-box {
      background-color: var(--bg-color);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 1rem;
      font-size: 0.875rem;
      white-space: pre-wrap;
    }

    .search-container {
      margin-bottom: 1.5rem;
    }

    input[type="text"] {
      width: 100%;
      padding: 0.75rem 1rem;
      background-color: var(--panel-bg);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      color: var(--text-main);
      font-size: 1rem;
    }

    input[type="text"]:focus {
      outline: none;
      border-color: var(--accent);
    }

    .memory-list {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .pagination {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      margin-top: 1.5rem;
      padding-top: 1rem;
      border-top: 1px solid var(--border);
    }

    .pagination-info {
      font-size: 0.875rem;
      color: var(--text-muted);
      margin-right: 0.5rem;
    }

    .btn-page {
      background: none;
      border: 1px solid var(--border);
      color: var(--text-main);
      cursor: pointer;
      font-size: 0.875rem;
      padding: 0.375rem 0.75rem;
      border-radius: 4px;
      transition: all 0.15s;
    }

    .btn-page:hover:not(:disabled) {
      border-color: var(--accent);
      color: var(--accent);
    }

    .btn-page:disabled {
      opacity: 0.35;
      cursor: not-allowed;
    }

    .btn-page.active {
      background-color: var(--accent);
      border-color: var(--accent);
      color: white;
    }

    .memory-card {
      background-color: var(--panel-bg);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .memory-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }

    .memory-content {
      white-space: pre-wrap;
      word-break: break-word;
    }

    .btn {
      background: none;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      font-size: 0.875rem;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      transition: all 0.2s;
    }

    .btn-delete {
      color: var(--danger);
      background-color: rgba(239, 68, 68, 0.1);
    }

    .btn-delete:hover {
      background-color: var(--danger);
      color: white;
    }

    .tags {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    .tag {
      background-color: var(--bg-color);
      border: 1px solid var(--border);
      color: var(--text-muted);
      padding: 0.125rem 0.5rem;
      border-radius: 9999px;
      font-size: 0.75rem;
    }

    @media (max-width: 768px) {
      .container {
        flex-direction: column;
      }
      aside {
        width: 100%;
        border-right: none;
        border-bottom: 1px solid var(--border);
      }
    }
  </style>
</head>
<body>
  <header>
    <h1>OpenCode Memory</h1>
    <div style="font-size: 0.875rem; color: var(--text-muted);">Port: ${port}</div>
  </header>

  <div class="container">
    <aside>
      <div>
        <div class="section-title">Stats</div>
        <div id="stats" class="stat-box">Loading...</div>
      </div>
      <div>
        <div class="section-title">User Profile</div>
        <div id="profile" class="profile-box">Loading...</div>
      </div>
    </aside>

    <main>
      <div class="search-container">
        <input type="text" id="search" placeholder="Search memories...">
      </div>
      <div id="memories" class="memory-list">
        <div>Loading memories...</div>
      </div>
      <div id="pagination" class="pagination" style="display:none"></div>
    </main>
  </div>

  <script>
    const API_PORT = ${port};
    const BASE_URL = \`http://localhost:\${API_PORT}\`;

    const els = {
      search: document.getElementById('search'),
      memories: document.getElementById('memories'),
      pagination: document.getElementById('pagination'),
      stats: document.getElementById('stats'),
      profile: document.getElementById('profile')
    };

    let searchTimeout;
    let currentPage = 1;
    const PAGE_SIZE = 20;

    async function loadStats() {
      try {
        const res = await fetch(\`\${BASE_URL}/api/stats\`);
        const data = await res.json();
        els.stats.innerHTML = \`Total Memories: <strong>\${data.total || 0}</strong>\`;
      } catch (err) {
        els.stats.innerText = 'Error loading stats';
      }
    }

    async function loadProfile() {
      try {
        const res = await fetch(\`\${BASE_URL}/api/profile\`);
        const data = await res.json();
        if (!data || Object.keys(data).length === 0) {
          els.profile.innerText = 'No profile data';
          return;
        }
        
        let html = '';
        if (data.preferences && data.preferences.length > 0) {
          html += '<strong>Preferences:</strong>\\n' + data.preferences.map(p => \`• \${p.value}\`).join('\\n') + '\\n\\n';
        }
        if (data.patterns && data.patterns.length > 0) {
          html += '<strong>Patterns:</strong>\\n' + data.patterns.map(p => \`• \${p.value}\`).join('\\n') + '\\n\\n';
        }
        if (data.workflows && data.workflows.length > 0) {
          html += '<strong>Workflows:</strong>\\n' + data.workflows.map(p => \`• \${p.value}\`).join('\\n');
        }
        
        els.profile.innerHTML = html || 'Empty profile';
      } catch (err) {
        els.profile.innerText = 'Error loading profile';
      }
    }

    function renderMemories(memories) {
      if (memories.length === 0) {
        els.memories.innerHTML = '<div style="color: var(--text-muted)">No memories found.</div>';
        return;
      }
      els.memories.innerHTML = memories.map(m => \`
        <div class="memory-card">
          <div class="memory-header">
            <div class="tags">
              \${m.metadata && m.metadata.tags ? m.metadata.tags.map(t => \`<span class="tag">\${t}</span>\`).join('') : ''}
            </div>
            <button class="btn btn-delete" onclick="deleteMemory('\${m.id}')">Delete</button>
          </div>
          <div class="memory-content">\${escapeHtml(m.content)}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">ID: \${m.id}</div>
        </div>
      \`).join('');
    }

    function renderPagination(page, totalPages, total) {
      if (totalPages <= 1) {
        els.pagination.style.display = 'none';
        return;
      }

      els.pagination.style.display = 'flex';

      const from = (page - 1) * PAGE_SIZE + 1;
      const to = Math.min(page * PAGE_SIZE, total);

      let html = \`<span class="pagination-info">\${from}–\${to} of \${total}</span>\`;
      html += \`<button class="btn-page" onclick="goToPage(1)" \${page === 1 ? 'disabled' : ''}>«</button>\`;
      html += \`<button class="btn-page" onclick="goToPage(\${page - 1})" \${page === 1 ? 'disabled' : ''}>‹</button>\`;

      const range = getPageRange(page, totalPages);
      for (const p of range) {
        if (p === '...') {
          html += \`<span style="color:var(--text-muted);padding:0 0.25rem">…</span>\`;
        } else {
          html += \`<button class="btn-page\${p === page ? ' active' : ''}" onclick="goToPage(\${p})">\${p}</button>\`;
        }
      }

      html += \`<button class="btn-page" onclick="goToPage(\${page + 1})" \${page === totalPages ? 'disabled' : ''}>›</button>\`;
      html += \`<button class="btn-page" onclick="goToPage(\${totalPages})" \${page === totalPages ? 'disabled' : ''}>»</button>\`;

      els.pagination.innerHTML = html;
    }

    function getPageRange(current, total) {
      if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
      if (current <= 4) return [1, 2, 3, 4, 5, '...', total];
      if (current >= total - 3) return [1, '...', total - 4, total - 3, total - 2, total - 1, total];
      return [1, '...', current - 1, current, current + 1, '...', total];
    }

    async function loadMemories(query = '', page = 1) {
      try {
        let url;
        if (query) {
          url = \`\${BASE_URL}/api/memories?q=\${encodeURIComponent(query)}\`;
        } else {
          url = \`\${BASE_URL}/api/memories?page=\${page}&limit=\${PAGE_SIZE}\`;
        }
        const res = await fetch(url);
        const data = await res.json();

        const memories = data.memories ?? (Array.isArray(data) ? data : []);
        const total = data.total ?? memories.length;
        const totalPages = data.totalPages ?? 1;

        renderMemories(memories);
        renderPagination(page, totalPages, total);
      } catch (err) {
        els.memories.innerHTML = '<div style="color: var(--danger)">Error loading memories</div>';
      }
    }

    function goToPage(page) {
      currentPage = page;
      loadMemories(els.search.value, currentPage);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    async function deleteMemory(id) {
      if (!confirm('Are you sure you want to delete this memory?')) {
        return;
      }
      
      try {
        const res = await fetch(\`\${BASE_URL}/api/memories/\${id}\`, { method: 'DELETE' });
        if (res.ok) {
          loadMemories(els.search.value, currentPage);
          loadStats();
        } else {
          alert('Failed to delete memory');
        }
      } catch (err) {
        alert('Error communicating with server');
      }
    }

    function escapeHtml(unsafe) {
      if (!unsafe) return '';
      return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }

    els.search.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        currentPage = 1;
        loadMemories(e.target.value, currentPage);
      }, 300);
    });

    // Initialize
    loadStats();
    loadProfile();
    loadMemories('', currentPage);
  </script>
</body>
</html>`;
}
