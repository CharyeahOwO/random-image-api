const fileInput = document.querySelector('#fileInput');
const dropZone = document.querySelector('#dropZone');
const fileList = document.querySelector('#fileList');
const uploadForm = document.querySelector('#uploadForm');
const uploadMessage = document.querySelector('#uploadMessage');
const selectedCount = document.querySelector('#selectedCount');
const selectAllImages = document.querySelector('#selectAllImages');
const batchForm = document.querySelector('#batchForm');
const nameMode = document.querySelector('#nameMode');
const customName = document.querySelector('#customName');
const imageGrid = document.querySelector('.image-grid');
const imageSearch = document.querySelector('#imageSearch');
const imageSort = document.querySelector('#imageSort');
const imageResultCount = document.querySelector('#imageResultCount');
const resetImageFilters = document.querySelector('#resetImageFilters');
const loadMoreImages = document.querySelector('#loadMoreImages');
const loadMoreStatus = document.querySelector('#loadMoreStatus');
const maxFiles = Number.parseInt(uploadForm?.dataset.maxFiles || '20', 10);
const imagePageSize = 24;
const imageSearchKey = 'nyaovo:imageSearch';
const imageSortKey = 'nyaovo:imageSort';
let queuedFiles = [];
let visibleImageLimit = imagePageSize;
let filterLoading = false;
let currentPathSearch = `${window.location.pathname}${window.location.search}`;
const previewUrls = new Map();

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function showUploadMessage(text, type = 'info') {
  if (!uploadMessage) return;
  uploadMessage.hidden = false;
  uploadMessage.textContent = text;
  uploadMessage.className = `upload-message ${type}`;
}

function clearUploadMessage() {
  if (!uploadMessage) return;
  uploadMessage.hidden = true;
  uploadMessage.textContent = '';
  uploadMessage.className = 'upload-message';
}

function syncFileInput() {
  if (!fileInput) return;
  const transfer = new DataTransfer();
  queuedFiles.forEach((file) => transfer.items.add(file));
  fileInput.files = transfer.files;
}

function fileKey(file) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function getPreviewUrl(file) {
  const key = fileKey(file);
  if (!previewUrls.has(key)) {
    previewUrls.set(key, URL.createObjectURL(file));
  }
  return previewUrls.get(key);
}

function revokePreviewUrl(file) {
  const key = fileKey(file);
  const url = previewUrls.get(key);
  if (!url) return;
  URL.revokeObjectURL(url);
  previewUrls.delete(key);
}

function setSubmitLoading(button, text) {
  if (!button) return;
  button.disabled = true;
  button.dataset.originalText = button.textContent;
  button.textContent = text;
}

function preserveSubmitterValue(form, submitter) {
  if (!form || !submitter?.name) return;
  form.querySelectorAll(`input[data-submit-preserve="${submitter.name}"]`).forEach((input) => input.remove());
  const input = document.createElement('input');
  input.type = 'hidden';
  input.name = submitter.name;
  input.value = submitter.value;
  input.dataset.submitPreserve = submitter.name;
  form.appendChild(input);
}

function addFiles(files) {
  const current = new Set(queuedFiles.map(fileKey));
  const incoming = Array.from(files || []);
  let added = 0;
  for (const file of incoming) {
    if (queuedFiles.length >= maxFiles) break;
    const key = fileKey(file);
    if (current.has(key)) continue;
    queuedFiles.push(file);
    current.add(key);
    added += 1;
  }
  syncFileInput();
  renderSelectedFiles();
  if (incoming.length > added) {
    showUploadMessage(`已添加 ${added} 个文件，重复文件或超过上限的文件已跳过。`, 'info');
  } else {
    clearUploadMessage();
  }
}

function removeQueuedFile(index) {
  const [removed] = queuedFiles.splice(index, 1);
  if (removed) revokePreviewUrl(removed);
  syncFileInput();
  renderSelectedFiles();
}

function clearQueuedFiles() {
  queuedFiles.forEach(revokePreviewUrl);
  queuedFiles = [];
  syncFileInput();
  renderSelectedFiles();
}

function renderSelectedFiles() {
  if (!fileList) return;
  if (queuedFiles.length === 0) {
    fileList.hidden = true;
    fileList.innerHTML = '';
    return;
  }

  fileList.hidden = false;
  fileList.innerHTML = `
    <div class="selected-summary">
      <span>已选择 ${queuedFiles.length} 个文件</span>
      <button type="button" class="text-button" id="clearQueuedFiles">清空</button>
    </div>
    <ul>
      ${queuedFiles
        .map((file, index) => {
          const name = escapeHtml(file.name);
          const previewUrl = escapeHtml(getPreviewUrl(file));
          return `<li>
            <img src="${previewUrl}" alt="" loading="lazy">
            <span title="${name}">${name}</span>
            <em>${formatSize(file.size)}</em>
            <button type="button" class="remove-file" data-index="${index}" aria-label="移除 ${name}">移除</button>
          </li>`;
        })
        .join('')}
    </ul>
  `;
}

function rememberFormControls() {
  document.querySelectorAll('[data-remember]').forEach((control) => {
    const key = `nyaovo:${control.dataset.remember}`;
    const saved = localStorage.getItem(key);
    if (saved !== null) control.value = saved;
    control.addEventListener('change', () => localStorage.setItem(key, control.value));
    control.addEventListener('input', () => localStorage.setItem(key, control.value));
  });
}

function syncNameModeState() {
  if (!nameMode || !customName) return;
  const customEnabled = nameMode.value === 'custom';
  customName.disabled = !customEnabled;
  if (!customEnabled) {
    customName.value = '';
    localStorage.removeItem(`nyaovo:${customName.dataset.remember}`);
  }
}

function adminHref(href) {
  try {
    const url = new URL(href, window.location.origin);
    return `${url.pathname}${url.search}`;
  } catch {
    return href;
  }
}

function rememberFilters() {
  const adminPath = window.location.pathname;
  if (!window.location.search) {
    const saved = localStorage.getItem('nyaovo:lastFilter');
    if (saved && saved.startsWith(adminPath) && adminHref(saved) !== window.location.pathname) {
      window.location.replace(adminHref(saved));
    }
  }
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
    visibleImageLimit = imagePageSize;
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

function checkedImages() {
  return Array.from(document.querySelectorAll('.image-checkbox:checked'));
}

function updateBatchState() {
  const checkboxes = Array.from(document.querySelectorAll('.image-checkbox'));
  const checked = checkedImages();
  if (selectedCount) selectedCount.textContent = `已选 ${checked.length} 张`;
  batchForm?.classList.toggle('has-selection', checked.length > 0);
  if (selectAllImages) {
    const visibleCheckboxes = checkboxes.filter((checkbox) => checkbox.closest('.image-card')?.dataset.filteredVisible === 'true');
    const visibleChecked = visibleCheckboxes.filter((checkbox) => checkbox.checked);
    selectAllImages.checked = visibleCheckboxes.length > 0 && visibleChecked.length === visibleCheckboxes.length;
    selectAllImages.indeterminate = visibleChecked.length > 0 && visibleChecked.length < visibleCheckboxes.length;
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

function applyImageFilters({ resetPage = true } = {}) {
  if (!imageGrid) return;
  if (resetPage) visibleImageLimit = imagePageSize;

  const query = (imageSearch?.value || '').trim().toLowerCase();
  const cards = Array.from(imageGrid.querySelectorAll('.image-card'));
  const matched = sortedImageCards(cards.filter((card) => !query || (card.dataset.filename || '').includes(query)));

  matched.forEach((card) => imageGrid.appendChild(card));

  cards.forEach((card) => {
    card.hidden = true;
    card.dataset.filteredVisible = 'false';
  });

  matched.slice(0, visibleImageLimit).forEach((card) => {
    card.hidden = false;
    card.dataset.filteredVisible = 'true';
  });

  if (imageResultCount) {
    imageResultCount.textContent = `当前 ${matched.length} 张，已显示 ${Math.min(matched.length, visibleImageLimit)} 张`;
  }

  const hasMore = matched.length > visibleImageLimit;
  if (loadMoreImages) loadMoreImages.hidden = !hasMore;
  if (loadMoreStatus) {
    loadMoreStatus.textContent = hasMore ? `还有 ${matched.length - visibleImageLimit} 张` : matched.length ? '已全部显示' : '无匹配图片';
  }

  updateBatchState();
}

rememberFormControls();
rememberFilters();
rememberImageTools();
syncNameModeState();

if (nameMode) {
  nameMode.addEventListener('change', syncNameModeState);
}

if (fileInput) {
  fileInput.addEventListener('change', () => {
    addFiles(fileInput.files);
  });
}

if (fileList) {
  fileList.addEventListener('click', (event) => {
    const removeButton = event.target.closest('.remove-file');
    if (removeButton) {
      removeQueuedFile(Number.parseInt(removeButton.dataset.index, 10));
      return;
    }
    if (event.target.closest('#clearQueuedFiles')) {
      clearQueuedFiles();
    }
  });
}

if (dropZone && fileInput) {
  ['dragenter', 'dragover'].forEach((name) => {
    dropZone.addEventListener(name, (event) => {
      event.preventDefault();
      dropZone.classList.add('dragging');
    });
  });

  ['dragleave', 'drop'].forEach((name) => {
    dropZone.addEventListener(name, (event) => {
      event.preventDefault();
      dropZone.classList.remove('dragging');
    });
  });

  dropZone.addEventListener('drop', (event) => {
    if (!event.dataTransfer?.files?.length) return;
    addFiles(event.dataTransfer.files);
  });
}

if (uploadForm && fileInput) {
  uploadForm.addEventListener('submit', (event) => {
    if (uploadForm.dataset.submitting === 'true') {
      event.preventDefault();
      return;
    }
    syncFileInput();
    if (!fileInput.files || fileInput.files.length === 0) {
      event.preventDefault();
      showUploadMessage('请先选择或拖入至少一张图片。', 'error');
      return;
    }
    uploadForm.dataset.submitting = 'true';
    setSubmitLoading(event.submitter || uploadForm.querySelector('button[type="submit"]'), '上传中...');
  });
}

document.addEventListener('change', (event) => {
  if (!event.target.matches('.image-checkbox')) return;
  event.target.closest('.image-card')?.classList.toggle('selected', event.target.checked);
  updateBatchState();
});

document.addEventListener('click', (event) => {
  const link = event.target.closest('.filter-row a');
  if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const target = adminHref(link.getAttribute('href'));
  if (!target.startsWith(window.location.pathname)) return;
  event.preventDefault();
  loadFilterUrl(target);
});

document.addEventListener('click', (event) => {
  const card = event.target.closest('.image-card');
  if (!card || event.target.closest('button, a, input, select, label, .card-actions')) return;
  const checkbox = card.querySelector('.image-checkbox');
  if (!checkbox) return;
  checkbox.checked = !checkbox.checked;
  card.classList.toggle('selected', checkbox.checked);
  updateBatchState();
});

if (selectAllImages) {
  selectAllImages.addEventListener('change', () => {
    document.querySelectorAll('.image-checkbox').forEach((checkbox) => {
      if (checkbox.closest('.image-card')?.dataset.filteredVisible !== 'true') return;
      checkbox.checked = selectAllImages.checked;
      checkbox.closest('.image-card')?.classList.toggle('selected', checkbox.checked);
    });
    updateBatchState();
  });
}

if (batchForm) {
  batchForm.addEventListener('submit', (event) => {
    if (batchForm.dataset.submitting === 'true') {
      event.preventDefault();
      return;
    }
    batchForm.querySelectorAll('input[name="images"]').forEach((input) => input.remove());
    const checked = checkedImages();
    if (checked.length === 0) {
      event.preventDefault();
      window.alert('请先选择要批量处理的图片。');
      return;
    }

    const submitter = event.submitter || batchForm.querySelector('button[type="submit"]');
    const action = submitter?.value;
    if (action === 'delete' && !window.confirm(`确定删除选中的 ${checked.length} 张图片吗？`)) {
      event.preventDefault();
      return;
    }

    checked.forEach((checkbox) => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = 'images';
      input.value = checkbox.value;
      batchForm.appendChild(input);
    });
    preserveSubmitterValue(batchForm, submitter);
    batchForm.dataset.submitting = 'true';
    setSubmitLoading(submitter, '处理中...');
  });
}

if (imageSearch) {
  imageSearch.addEventListener('input', () => {
    localStorage.setItem(imageSearchKey, imageSearch.value);
    applyImageFilters();
  });
  imageSearch.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !imageSearch.value) return;
    imageSearch.value = '';
    localStorage.removeItem(imageSearchKey);
    applyImageFilters();
  });
}

if (imageSort) {
  imageSort.addEventListener('change', () => {
    localStorage.setItem(imageSortKey, imageSort.value);
    applyImageFilters();
  });
}

if (loadMoreImages) {
  loadMoreImages.addEventListener('click', () => {
    visibleImageLimit += imagePageSize;
    applyImageFilters({ resetPage: false });
  });
}

if (resetImageFilters) {
  resetImageFilters.addEventListener('click', (event) => {
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
}

applyImageFilters();

window.addEventListener('popstate', () => {
  const nextPathSearch = `${window.location.pathname}${window.location.search}`;
  if (nextPathSearch === currentPathSearch) return;
  currentPathSearch = nextPathSearch;
  loadFilterUrl(nextPathSearch, { push: false });
});

window.addEventListener('beforeunload', () => {
  queuedFiles.forEach(revokePreviewUrl);
});

document.addEventListener('click', async (event) => {
  const copyButton = event.target.closest('.copy-button');
  if (!copyButton) return;

  const text = copyButton.dataset.copy;
  try {
    await navigator.clipboard.writeText(text);
    copyButton.textContent = '已复制';
    setTimeout(() => {
      copyButton.textContent = '复制 URL';
    }, 1200);
  } catch {
    window.prompt('复制 URL', text);
  }
});

document.addEventListener('submit', (event) => {
  const form = event.target.closest('.confirm-form');
  if (!form) return;
  if (form.dataset.submitting === 'true') {
    event.preventDefault();
    return;
  }
  const message = form.dataset.confirm || '确定执行此操作吗？';
  if (!window.confirm(message)) {
    event.preventDefault();
    return;
  }
  form.dataset.submitting = 'true';
  setSubmitLoading(event.submitter || form.querySelector('button[type="submit"]'), '处理中...');
});
