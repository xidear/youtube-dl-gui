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

  function httpGet(url) {
    return new Promise(function (resolve) {
      var xhr = new XMLHttpRequest();
      xhr.onreadystatechange = function () {
        if (xhr.readyState === 4) {
          resolve(xhr.status === 200 ? xhr.responseText : null);
        }
      };
      xhr.open('GET', url, true);
      xhr.send(null);
    });
  }

  function getAssetDownload(os, release) {
    var version = release.tag_name.replace(/^v/, '');
    var assetName;
    switch (os) {
      case 'Windows':
        assetName = 'Open.Video.Downloader_' + version + '_x64-setup.exe';
        break;
      case 'MacOS Silicon':
        assetName = 'Open.Video.Downloader_' + version + '_aarch64.dmg';
        break;
      case 'Linux x64':
        assetName = 'Open.Video.Downloader_' + version + '_amd64.AppImage';
        break;
      default:
        return null;
    }
    for (var i = 0; i < release.assets.length; i++) {
      if (release.assets[i].name === assetName) {
        return release.assets[i].browser_download_url;
      }
    }
    return null;
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

    var releaseUrl = 'https://gitee.com/api/v5/repos/binnarui/binary-video-downloader/releases/latest';
    var fallbackUrl = 'https://gitee.com/binnarui/binary-video-downloader/releases';

    var typeEl = document.getElementById('download-type');
    var btn = document.getElementById('download-button');
    var link = document.getElementById('download-link');

    if (!btn || !link) return;

    httpGet(releaseUrl).then(function (data) {
      if (!data) {
        if (typeEl) typeEl.textContent = '适用于 ' + os;
        btn.onclick = function () { window.location.href = fallbackUrl; };
        link.setAttribute('href', fallbackUrl);
        return;
      }

      var release;
      try {
        release = JSON.parse(data);
      } catch (e) {
        if (typeEl) typeEl.textContent = '适用于 ' + os;
        btn.onclick = function () { window.location.href = fallbackUrl; };
        link.setAttribute('href', fallbackUrl);
        return;
      }

      if (os === 'other') {
        if (typeEl) typeEl.style.display = 'none';
        btn.onclick = function () { window.location.href = fallbackUrl; };
        link.setAttribute('href', fallbackUrl);
        return;
      }

      var url = getAssetDownload(os, release);
      if (typeEl) {
        typeEl.textContent = release.tag_name + ' · ' + os;
      }
      if (url) {
        btn.onclick = function () { window.location.href = url; };
        link.setAttribute('href', url);
      } else {
        btn.onclick = function () { window.location.href = fallbackUrl; };
        link.setAttribute('href', fallbackUrl);
      }
    });
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
