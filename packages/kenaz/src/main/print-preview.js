// Print Preview — vanilla JS controller for print-preview.html
// Communicates with main process via window.kenaz IPC bridge (shared preload).

(function () {
  var contentFrame = document.getElementById('contentFrame');
  var loadingMsg = document.getElementById('loadingMsg');
  var pageContainer = document.getElementById('pageContainer');
  var printBtn = document.getElementById('printBtn');
  var cancelBtn = document.getElementById('cancelBtn');
  var paperSize = document.getElementById('paperSize');
  var copiesInput = document.getElementById('copies');

  // ── Load email HTML into the preview iframe ──
  window.__loadPrintContent = function () {
    var html = window.__printContent;
    if (!html) return;

    loadingMsg.style.display = 'none';
    contentFrame.style.display = 'block';

    var doc = contentFrame.contentDocument;
    doc.open();
    doc.write(html);
    doc.close();

    // Auto-resize iframe to match content height
    function resize() {
      var h = Math.max(
        doc.body ? doc.body.scrollHeight : 0,
        doc.documentElement ? doc.documentElement.scrollHeight : 0,
        400
      );
      contentFrame.style.height = h + 'px';
    }

    setTimeout(resize, 100);
    setTimeout(resize, 500);
    setTimeout(resize, 1500);

    // Observe dynamic content changes
    if (typeof ResizeObserver !== 'undefined' && doc.body) {
      new ResizeObserver(resize).observe(doc.body);
    }

    // Open links in default browser
    doc.addEventListener('click', function (e) {
      var anchor = e.target.closest ? e.target.closest('a') : null;
      if (anchor && anchor.href && !anchor.href.startsWith('about:')) {
        e.preventDefault();
        window.open(anchor.href, '_blank');
      }
    });
  };

  // If content was already injected before this script loaded
  if (window.__printContent) {
    window.__loadPrintContent();
  }

  // ── Print button ──
  printBtn.addEventListener('click', function () {
    var copies = parseInt(copiesInput.value) || 1;
    var size = paperSize.value;
    window.kenaz.printPreviewExecute({ copies: copies, pageSize: size });
  });

  // ── Cancel button ──
  cancelBtn.addEventListener('click', function () {
    window.kenaz.printPreviewCancel();
  });

  // ── Keyboard shortcuts ──
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      window.kenaz.printPreviewCancel();
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
      e.preventDefault();
      printBtn.click();
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      printBtn.click();
    }
  });

  // ── Paper size toggle ──
  paperSize.addEventListener('change', function () {
    if (paperSize.value === 'a4') {
      pageContainer.style.width = '794px'; // 210mm at 96dpi
    } else {
      pageContainer.style.width = '816px'; // 8.5in at 96dpi
    }
  });
})();
