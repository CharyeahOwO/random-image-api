export function initClipboard() {
  document.addEventListener('click', async (event) => {
    const copyButton = event.target.closest('.copy-button');
    if (!copyButton) return;

    const paths = copyButton.dataset.copyPaths;
    const path = copyButton.dataset.copyPath;
    const text = copyButton.dataset.copy || (paths ? paths.split('\n').map((item) => `${window.location.origin}${item}`).join('\n') : path ? `${window.location.origin}${path}` : '');
    const originalText = copyButton.dataset.originalText || copyButton.textContent;
    copyButton.dataset.originalText = originalText;
    try {
      await navigator.clipboard.writeText(text);
      copyButton.textContent = '已复制';
      setTimeout(() => {
        copyButton.textContent = originalText;
      }, 1200);
    } catch {
      window.prompt('复制 URL', text);
    }
  });
}
