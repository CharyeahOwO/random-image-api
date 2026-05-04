import { $, $$, adminHref } from './utils.js';

const imagePageSize = 15;
const imageSearchKey = 'nyaovo:imageSearch';
const imageSortKey = 'nyaovo:imageSort';

export function initFilters({ updateBatchState }) {
  const imageGrid = $('.image-grid');
  const imageSearch = $('#imageSearch');
  const imageSort = $('#imageSort');
  const imageResultCount = $('#imageResultCount');
  const resetImageFilters = $('#resetImageFilters');
  const loadMoreImages = $('#loadMoreImages');
  const loadMoreStatus = $('#loadMoreStatus');
  const loadMoreRow = $('.load-more-row');
  let filterLoading = false;
  let currentPathSearch = `${window.location.pathname}${window.location.search}`;
  let currentPage = 1;

  function rememberFilters() {
    const adminPath = window.location.pathname;
    if (!window.location.search) {
      const saved = localStorage.getItem('nyaovo:lastFilter');
      if (saved && saved.startsWith(adminPath) && adminHref(saved) !== window.location.pathname) {
        window.location.replace(adminHref(saved));
      }
    }
  }

  function rememberImageTools() {
    if (imageSearch) {
      imageSearch.value = localStorage.getItem(imageSearchKey) || '';
    }
    if (imageSort) {
      const savedSort = localStorage.getItem(imageSortKey);
      if (savedSort && Array.from(imageSort.options).some((option) => option.value === savedSort)) {
        imageSort.value = savedSort;
      }
    }
  }

  function cardValue(card, key) {
    const value = Number.parseFloat(card.dataset[key] || '0');
    return Number.isFinite(value) ? value : 0;
  }

  function sortedImageCards(cards) {
    const sort = imageSort?.value || 'newest';
    return [...cards].sort((a, b) => {
      if (sort === 'oldest') return cardValue(a, 'mtime') - cardValue(b, 'mtime');
      if (sort === 'name-asc') return (a.dataset.filename || '').localeCompare(b.dataset.filename || '');
      if (sort === 'name-desc') return (b.dataset.filename || '').localeCompare(a.dataset.filename || '');
      if (sort === 'size-desc') return cardValue(b, 'size') - cardValue(a, 'size');
      if (sort === 'size-asc') return cardValue(a, 'size') - cardValue(b, 'size');
      if (sort === 'resolution-desc') return cardValue(b, 'width') * cardValue(b, 'height') - cardValue(a, 'width') * cardValue(a, 'height');
      if (sort === 'resolution-asc') return cardValue(a, 'width') * cardValue(a, 'height') - cardValue(b, 'width') * cardValue(b, 'height');
      return cardValue(b, 'mtime') - cardValue(a, 'mtime');
    });
  }

  function renderPagination(total) {
    const totalPages = Math.ceil(total / imagePageSize);
    let paginationRow = document.querySelector('.pagination-row');
    if (!paginationRow) {
      paginationRow = document.createElement('div');
      paginationRow.className = 'pagination-row';
      const loadMoreRow = document.querySelector('.load-more-row');
      if (loadMoreRow) loadMoreRow.parentNode.insertBefore(paginationRow, loadMoreRow);
    }

    if (totalPages <= 1) {
      paginationRow.innerHTML = '';
      paginationRow.hidden = true;
      return;
    }

    paginationRow.hidden = false;

    let html = '';
    html += `<button class="page-nav" data-page="${currentPage - 1}" ${currentPage === 1 ? 'disabled' : ''} aria-label="上一页">上一页</button>`;

    const maxVisible = 5;
    let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let end = Math.min(totalPages, start + maxVisible - 1);
    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }

    if (start > 1) {
      html += '<button class="page-number" data-page="1">1</button>';
      if (start > 2) html += '<span class="pagination-ellipsis">...</span>';
    }

    for (let i = start; i <= end; i++) {
      html += `<button class="page-number ${i === currentPage ? 'active' : ''}" data-page="${i}" ${i === currentPage ? 'aria-current="page"' : ''}>${i}</button>`;
    }

    if (end < totalPages) {
      if (end < totalPages - 1) html += '<span class="pagination-ellipsis">...</span>';
      html += `<button class="page-number" data-page="${totalPages}">${totalPages}</button>`;
    }

    html += `<button class="page-nav" data-page="${currentPage + 1}" ${currentPage === totalPages ? 'disabled' : ''} aria-label="下一页">下一页</button>`;

    paginationRow.innerHTML = html;

    paginationRow.querySelectorAll('button[data-page]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const page = parseInt(btn.dataset.page, 10);
        if (page >= 1 && page <= totalPages) {
          currentPage = page;
          applyImageFilters({ resetPage: false });
          const section = document.getElementById('images');
          if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });
  }

  function applyImageFilters({ resetPage = true } = {}) {
    if (!imageGrid) return;
    if (resetPage) {
      currentPage = 1;
    }

    const query = (imageSearch?.value || '').trim().toLowerCase();
    const cards = $$('.image-card', imageGrid);
    const matched = sortedImageCards(cards.filter((card) => !query || (card.dataset.filename || '').includes(query)));

    matched.forEach((card) => imageGrid.appendChild(card));

    cards.forEach((card) => {
      card.hidden = true;
      card.dataset.filteredVisible = 'false';
    });

    const totalPages = Math.max(1, Math.ceil(matched.length / imagePageSize));
    currentPage = Math.min(currentPage, totalPages);
    const startIndex = (currentPage - 1) * imagePageSize;
    const visibleCards = matched.slice(startIndex, startIndex + imagePageSize);

    visibleCards.forEach((card) => {
      card.hidden = false;
      card.dataset.filteredVisible = 'true';
    });

    if (imageResultCount) {
      if (matched.length) {
        imageResultCount.textContent = `当前 ${matched.length} 张，第 ${currentPage} / ${totalPages} 页，每页最多 ${imagePageSize} 张`;
      } else {
        imageResultCount.textContent = '当前 0 张';
      }
    }

    if (loadMoreImages) loadMoreImages.hidden = true;
    if (loadMoreRow) loadMoreRow.hidden = true;
    if (loadMoreStatus) {
      loadMoreStatus.textContent = matched.length ? `本页显示 ${visibleCards.length} 张` : '无匹配图片';
    }

    renderPagination(matched.length);
    updateBatchState?.();
  }

  async function loadFilterUrl(href, { push = true } = {}) {
    if (!imageGrid || filterLoading) return;
    const target = adminHref(href);
    const currentScroll = { x: window.scrollX, y: window.scrollY };
    filterLoading = true;
    if (loadMoreStatus) loadMoreStatus.textContent = '正在更新筛选...';

    try {
      const response = await fetch(target, {
        headers: { 'X-Requested-With': 'fetch' }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const nextFilters = doc.querySelector('.filters');
      const nextGrid = doc.querySelector('.image-grid');
      const filters = document.querySelector('.filters');
      if (!nextFilters || !nextGrid || !filters) throw new Error('页面结构不完整');

      filters.innerHTML = nextFilters.innerHTML;
      imageGrid.innerHTML = nextGrid.innerHTML;
      currentPage = 1;
      applyImageFilters();

      if (push) {
        window.history.pushState({ filterUrl: target }, '', target);
      }
      currentPathSearch = target;
      localStorage.setItem('nyaovo:lastFilter', target);
      window.scrollTo(currentScroll.x, currentScroll.y);
    } catch {
      window.location.assign(target);
    } finally {
      filterLoading = false;
    }
  }

  rememberFilters();
  rememberImageTools();

  document.addEventListener('click', (event) => {
    const link = event.target.closest('.filter-row a');
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = adminHref(link.getAttribute('href'));
    if (!target.startsWith(window.location.pathname)) return;
    event.preventDefault();
    loadFilterUrl(target);
  });

  imageSearch?.addEventListener('input', () => {
    localStorage.setItem(imageSearchKey, imageSearch.value);
    applyImageFilters();
  });

  imageSearch?.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !imageSearch.value) return;
    imageSearch.value = '';
    localStorage.removeItem(imageSearchKey);
    applyImageFilters();
  });

  imageSort?.addEventListener('change', () => {
    localStorage.setItem(imageSortKey, imageSort.value);
    applyImageFilters();
  });

  loadMoreImages?.addEventListener('click', () => {
    currentPage += 1;
    applyImageFilters({ resetPage: false });
  });

  resetImageFilters?.addEventListener('click', (event) => {
    localStorage.removeItem('nyaovo:lastFilter');
    localStorage.removeItem(imageSearchKey);
    localStorage.removeItem(imageSortKey);
    if (imageSearch) imageSearch.value = '';
    if (imageSort) imageSort.value = 'newest';
    const target = adminHref(resetImageFilters.getAttribute('href'));
    if (!target.startsWith(window.location.pathname)) return;
    event.preventDefault();
    loadFilterUrl(target);
  });

  applyImageFilters();

  window.addEventListener('popstate', () => {
    const nextPathSearch = `${window.location.pathname}${window.location.search}`;
    if (nextPathSearch === currentPathSearch) return;
    currentPathSearch = nextPathSearch;
    loadFilterUrl(nextPathSearch, { push: false });
  });
}
