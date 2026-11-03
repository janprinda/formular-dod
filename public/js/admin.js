document.addEventListener('DOMContentLoaded', () => {
  const cardsGrid = document.getElementById('cardsGrid');
  const emptyState = document.getElementById('emptyState');
  const resultsCount = document.getElementById('resultsCount');
  const searchInput = document.getElementById('searchInput');
  const classFilter = document.getElementById('classFilter');
  const photoFilter = document.getElementById('photoFilter');
  const refreshBtn = document.getElementById('refreshBtn');

  // Stats elements
  const statTotal = document.getElementById('statTotal');
  const statWithPhotos = document.getElementById('statWithPhotos');
  const statClasses = document.getElementById('statClasses');
  const statLatest = document.getElementById('statLatest');

  // Modal elements
  const detailModal = document.getElementById('detailModal');
  const modalCloseBtn = document.getElementById('modalCloseBtn');
  const modalBody = document.getElementById('modalBody');

  let allSubmissions = [];

  // Helper to escape HTML and prevent XSS
  function escapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('cs-CZ', {
      day: 'numeric',
      month: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  // Load submissions and stats
  async function loadData() {
    resultsCount.textContent = 'Načítám data...';
    try {
      const [resSubmissions, resStats] = await Promise.all([
        fetch('/api/submissions'),
        fetch('/api/stats'),
      ]);

      if (!resSubmissions.ok || !resStats.ok) {
        throw new Error('Chyba při stahování dat');
      }

      allSubmissions = await resSubmissions.json();
      const stats = await resStats.json();

      updateStats(stats);
      populateClassFilter(stats.classCounts || {});
      renderList();
    } catch (err) {
      console.error(err);
      resultsCount.textContent = 'Chyba při načítání dat z databáze.';
    }
  }

  function updateStats(stats) {
    statTotal.textContent = stats.total || 0;
    statWithPhotos.textContent = stats.withPhotos || 0;
    statClasses.textContent = Object.keys(stats.classCounts || {}).length;
    statLatest.textContent = stats.latestAt ? formatDate(stats.latestAt) : '—';
  }

  function populateClassFilter(classCounts) {
    const currentVal = classFilter.value;
    classFilter.innerHTML = '<option value="">Všechny třídy</option>';

    const classes = Object.keys(classCounts).sort();
    for (const cls of classes) {
      if (!cls) continue;
      const opt = document.createElement('option');
      opt.value = cls;
      opt.textContent = `${cls} (${classCounts[cls]})`;
      classFilter.appendChild(opt);
    }

    if (currentVal && classes.includes(currentVal)) {
      classFilter.value = currentVal;
    }
  }

  function filterSubmissions() {
    const query = searchInput.value.toLowerCase().trim();
    const selectedClass = classFilter.value;
    const photoOpt = photoFilter.value;

    return allSubmissions.filter((item) => {
      // Class filter
      if (selectedClass && item.schoolClass !== selectedClass) {
        return false;
      }

      // Photo filter
      if (photoOpt === 'withPhoto' && !item.photo) return false;
      if (photoOpt === 'withoutPhoto' && item.photo) return false;

      // Text query
      if (query) {
        const fullContent = [
          item.fullName,
          item.schoolClass,
          item.whySchool,
          item.whatYouLike,
          item.projects,
          item.competitions,
          item.email,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        if (!fullContent.includes(query)) {
          return false;
        }
      }

      return true;
    });
  }

  function renderList() {
    const filtered = filterSubmissions();

    resultsCount.textContent = `Zobrazeno ${filtered.length} z ${allSubmissions.length} odpovědí`;

    if (filtered.length === 0) {
      cardsGrid.innerHTML = '';
      emptyState.style.display = 'block';
      return;
    }

    emptyState.style.display = 'none';

    cardsGrid.innerHTML = filtered
      .map((item) => {
        const photoHtml = item.photo
          ? `<img src="${item.photo.url}" alt="${escapeHTML(item.fullName)}" class="card-photo">`
          : `<div class="card-photo-placeholder"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>`;

        const quote = item.whatYouLike || item.whySchool || 'Žádné podrobnosti.';

        return `
        <div class="student-card" data-id="${item.id}">
          <div class="card-top">
            ${photoHtml}
            <div>
              <div class="card-name">${escapeHTML(item.fullName)}</div>
              <span class="card-class-badge">${escapeHTML(item.schoolClass)}</span>
            </div>
          </div>

          <div class="card-quote">
            "${escapeHTML(quote)}"
          </div>

          <div class="card-footer">
            <span class="card-date">${formatDate(item.createdAt)}</span>
            <div class="card-actions">
              <button type="button" class="btn-icon view-btn" data-id="${item.id}" title="Zobrazit detail">
                Detail
              </button>
              ${
                item.photo
                  ? `<a href="${item.photo.url}" download="${escapeHTML(item.fullName)}_foto" class="btn-icon" title="Stáhnout fotku">Foto ⤓</a>`
                  : ''
              }
              <button type="button" class="btn-icon delete-btn" data-id="${item.id}" title="Smazat" style="color: var(--danger);">
                &times;
              </button>
            </div>
          </div>
        </div>
      `;
      })
      .join('');

    // Attach click handlers
    cardsGrid.querySelectorAll('.view-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openDetail(btn.dataset.id);
      });
    });

    cardsGrid.querySelectorAll('.delete-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteItem(btn.dataset.id);
      });
    });

    cardsGrid.querySelectorAll('.student-card').forEach((card) => {
      card.addEventListener('click', () => {
        openDetail(card.dataset.id);
      });
    });
  }

  function openDetail(id) {
    const item = allSubmissions.find((s) => s.id === id);
    if (!item) return;

    let linksHtml = '';
    const links = [];
    if (item.instagram) links.push({ label: 'Instagram', url: item.instagram.startsWith('http') ? item.instagram : `https://instagram.com/${item.instagram.replace('@', '')}` });
    if (item.github) links.push({ label: 'GitHub', url: item.github.startsWith('http') ? item.github : `https://${item.github}` });
    if (item.linkedin) links.push({ label: 'LinkedIn', url: item.linkedin.startsWith('http') ? item.linkedin : `https://${item.linkedin}` });
    if (item.portfolio) links.push({ label: 'Web / Portfolio', url: item.portfolio.startsWith('http') ? item.portfolio : `https://${item.portfolio}` });

    if (links.length > 0) {
      linksHtml = `
        <div class="modal-field">
          <div class="modal-field-label">Odkazy a sítě</div>
          <div class="links-list">
            ${links.map((l) => `<a href="${escapeHTML(l.url)}" target="_blank" rel="noopener noreferrer" class="link-pill">${escapeHTML(l.label)} ↗</a>`).join('')}
          </div>
        </div>
      `;
    }

    modalBody.innerHTML = `
      <div style="display: flex; gap: 20px; align-items: flex-start; flex-wrap: wrap; margin-bottom: 20px;">
        ${
          item.photo
            ? `<div style="text-align: center;">
                 <img src="${item.photo.url}" alt="${escapeHTML(item.fullName)}" class="modal-detail-photo">
                 <div>
                   <a href="${item.photo.url}" download="${escapeHTML(item.fullName)}_foto" class="btn btn-secondary" style="padding: 6px 14px; font-size: 0.8rem;">
                     Stáhnout originál ⤓
                   </a>
                 </div>
               </div>`
            : `<div class="modal-detail-photo" style="display: flex; align-items: center; justify-content: center; background: var(--bg-subtle); color: var(--text-subtle);">Bez fotky</div>`
        }

        <div style="flex: 1; min-width: 240px;">
          <span class="card-class-badge" style="margin-bottom: 6px;">${escapeHTML(item.schoolClass)}</span>
          <h2 style="font-size: 1.5rem; font-weight: 700; color: var(--text-main); margin-bottom: 4px;">${escapeHTML(item.fullName)}</h2>
          ${item.email ? `<p style="font-size: 0.88rem; color: var(--text-muted); margin-bottom: 8px;">${escapeHTML(item.email)}</p>` : ''}
          <p style="font-size: 0.78rem; color: var(--text-subtle);">Odesláno: ${formatDate(item.createdAt)}</p>
        </div>
      </div>

      <div class="modal-field">
        <div class="modal-field-label">Proč právě tato škola?</div>
        <div class="modal-field-value">${escapeHTML(item.whySchool || 'Neuvedeno')}</div>
      </div>

      <div class="modal-field">
        <div class="modal-field-label">Co se ti na škole líbí / co tě baví?</div>
        <div class="modal-field-value">${escapeHTML(item.whatYouLike || 'Neuvedeno')}</div>
      </div>

      ${
        item.favoriteSubject
          ? `<div class="modal-field">
              <div class="modal-field-label">Oblíbený předmět nebo zaměření</div>
              <div class="modal-field-value">${escapeHTML(item.favoriteSubject)}</div>
            </div>`
          : ''
      }

      ${
        item.adviceForFreshmen
          ? `<div class="modal-field">
              <div class="modal-field-label">Vzkaz pro budoucí studenty</div>
              <div class="modal-field-value">${escapeHTML(item.adviceForFreshmen)}</div>
            </div>`
          : ''
      }

      ${
        item.projects
          ? `<div class="modal-field">
              <div class="modal-field-label">Projekty</div>
              <div class="modal-field-value">${escapeHTML(item.projects)}</div>
            </div>`
          : ''
      }

      ${
        item.competitions
          ? `<div class="modal-field">
              <div class="modal-field-label">Soutěže a úspěchy</div>
              <div class="modal-field-value">${escapeHTML(item.competitions)}</div>
            </div>`
          : ''
      }

      ${linksHtml}

      <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--border-light); display: flex; justify-content: space-between; align-items: center;">
        <span style="font-size: 0.8rem; color: var(--text-subtle);">Souhlas se zveřejněním: ${item.consent ? '✅ Udělen' : '❌ Ne'}</span>
        <button type="button" class="btn btn-danger" id="modalDeleteBtn" style="padding: 6px 14px; font-size: 0.85rem;">
          Smazat odpověď
        </button>
      </div>
    `;

    document.getElementById('modalDeleteBtn').addEventListener('click', () => {
      deleteItem(item.id);
      closeModal();
    });

    detailModal.classList.add('active');
  }

  function closeModal() {
    detailModal.classList.remove('active');
  }

  modalCloseBtn.addEventListener('click', closeModal);
  detailModal.addEventListener('click', (e) => {
    if (e.target === detailModal) closeModal();
  });

  async function deleteItem(id) {
    const item = allSubmissions.find((s) => s.id === id);
    const name = item ? item.fullName : 'tuto odpověď';
    if (!confirm(`Opravdu chcete smazat záznam pro: ${name}?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/submissions/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Nepodařilo se smazat');

      allSubmissions = allSubmissions.filter((s) => s.id !== id);
      loadData(); // reload stats and list
    } catch (err) {
      alert('Chyba při mazání záznamu: ' + err.message);
    }
  }

  // Filter change handlers
  searchInput.addEventListener('input', renderList);
  classFilter.addEventListener('change', renderList);
  photoFilter.addEventListener('change', renderList);
  refreshBtn.addEventListener('click', loadData);

  // Initial load
  loadData();
});
