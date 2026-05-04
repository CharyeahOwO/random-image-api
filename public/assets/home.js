function copyText(text, btn) {
  var ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
    btn.textContent = '已复制';
    btn.classList.add('copied');
    setTimeout(function() { btn.textContent = '复制'; btn.classList.remove('copied'); }, 1500);
  } catch(e) {
    btn.textContent = '失败';
  }
  document.body.removeChild(ta);
}

document.addEventListener('click', function(e) {
  var btn = e.target.closest('.copy-btn');
  if (!btn) return;
  var text = btn.getAttribute('data-copy');
  var path = btn.getAttribute('data-copy-path');
  if (!text && path) text = window.location.origin + path;
  copyText(text, btn);
});

var modal = document.getElementById('apiModal');
var modalBody = document.getElementById('modalBody');
var modalTitle = document.getElementById('modalTitle');

document.addEventListener('click', function(e) {
  var btn = e.target.closest('.api-btn');
  if (!btn) return;
  var g = btn.getAttribute('data-gallery');
  var base = window.location.origin;
  modalTitle.textContent = g + ' — API 调用';
  var items = [
    { label: '随机图（图片）', path: '/image/api/random?gallery=' + g },
    { label: '随机图（JSON）', path: '/image/api/random?gallery=' + g + '&type=json' },
    { label: '随机图（跳转）', path: '/image/api/random?gallery=' + g + '&type=redirect' },
    { label: 'PC 随机图', path: '/image/api/random?gallery=' + g + '&device=pc' },
    { label: 'Mobile 随机图', path: '/image/api/random?gallery=' + g + '&device=mobile' },
    { label: 'PC JSON', path: '/image/api/random?gallery=' + g + '&device=pc&type=json' },
    { label: 'Mobile JSON', path: '/image/api/random?gallery=' + g + '&device=mobile&type=json' }
  ];
  var html = '';
  for (var i = 0; i < items.length; i++) {
    var full = base + items[i].path;
    html += '<div class="api-row">' +
      '<span class="api-label">' + items[i].label + '</span>' +
      '<code class="api-url">' + full + '</code>' +
      '<button type="button" class="copy-btn" data-copy="' + full + '">复制</button>' +
      '</div>';
  }
  modalBody.innerHTML = html;
  modal.hidden = false;
});

document.getElementById('modalClose').addEventListener('click', function() {
  modal.hidden = true;
});

modal.addEventListener('click', function(e) {
  if (e.target === modal) modal.hidden = true;
});

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape' && !modal.hidden) modal.hidden = true;
});
