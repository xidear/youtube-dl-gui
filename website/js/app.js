(function () {
  'use strict';

  function getOS() {
    var platform = window.navigator.platform;
    var userAgent = window.navigator.userAgent;
    var macosPlatforms = ['Macintosh', 'MacIntel', 'MacPPC', 'Mac68K'];
    var windowsPlatforms = ['Win32', 'Win64', 'Windows', 'WinCE'];
    var iosPlatforms = ['iPhone', 'iPad', 'iPod'];

    if (macosPlatforms.indexOf(platform) !== -1) {
      return 'MacOS Silicon';
    }
    if (iosPlatforms.indexOf(platform) !== -1 || /Android/.test(userAgent)) {
      return 'other';
    }
    if (windowsPlatforms.indexOf(platform) !== -1) {
      return 'Windows';
    }
    if (/Linux/.test(platform)) {
      return 'Linux x64';
    }
    return 'other';
  }

  function setOtherVersionsText(os) {
    var el = document.getElementById('other-versions');
    if (!el) return;
    if (os === 'MacOS Silicon') {
      el.textContent = '其他版本（macOS Intel）';
    } else if (os === 'Linux x64') {
      el.textContent = '其他版本（Linux ARM / deb / rpm）';
    } else if (os === 'Windows') {
      el.textContent = '其他版本（便携版 / 安装包）';
    } else {
      el.textContent = '其他版本（Linux ARM、macOS Intel 等）';
    }
  }

  function setupMicrosoftButton(os) {
    // Fork 站点不展示 Microsoft Store（该链接指向上游应用）
  }

  function setDownloadButton() {
    var os = getOS();
    setOtherVersionsText(os);
    setupMicrosoftButton(os);

    var fallbackUrl = 'https://gitee.com/binnarui/binary-video-downloader/releases';

    var typeEl = document.getElementById('download-type');
    var btn = document.getElementById('download-button');
    var link = document.getElementById('download-link');

    if (!btn || !link) return;

    if (typeEl) {
      typeEl.textContent = os === 'other' ? '' : '适用于 ' + os;
      if (os === 'other') typeEl.style.display = 'none';
    }
    btn.onclick = function () { window.location.href = fallbackUrl; };
    link.setAttribute('href', fallbackUrl);
  }

  function initNav() {
    var toggle = document.getElementById('hamburger');
    var list = document.getElementById('nav-list');
    if (!toggle || !list) return;

    toggle.addEventListener('click', function () {
      list.classList.toggle('is-open');
    });

    list.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () {
        list.classList.remove('is-open');
      });
    });
  }

  setDownloadButton();
  initNav();
})();
