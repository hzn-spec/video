/* 单视频站点前端:拉状态、渲染播放器或空状态、展示分享地址 */

(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var video = $('video');
  var lastHasVideo = null;
  var lastStatus = null;
  var baseMeta = '';
  // 静态导出时 index.html 会设这个变量,指向同目录的 status.json。
  // 静态托管下配置不会变,所以只加载一次、不轮询。
  var STATIC_MODE = !!window.__STATUS_URL__;

  /**
   * 取站点状态。
   * 线上跑 Node 服务时用 /api/status;静态托管(GitHub Pages 等)没有后端,
   * 会退回到同目录下的 status.json —— 同一份前端代码两边都能用。
   */
  async function loadStatus() {
    var url = window.__STATUS_URL__ || 'api/status';
    try {
      var res = await fetch(url, { cache: 'no-store' });
      if (res.ok) return await res.json();
    } catch (e) { /* 没有后端,走下面的兜底 */ }

    try {
      var res2 = await fetch('status.json', { cache: 'no-store' });
      if (res2.ok) return await res2.json();
    } catch (e) { /* 两边都没有 */ }

    return null;
  }

  /* ------------------------------------------------------------ 小工具 */

  function escapeHtml(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function toast(message, kind) {
    var area = $('toast-area');
    var el = document.createElement('div');
    el.className = 'toast' + (kind ? ' ' + kind : '');
    el.textContent = message;
    area.appendChild(el);
    setTimeout(function () {
      el.style.transition = 'opacity .25s';
      el.style.opacity = '0';
      setTimeout(function () { el.remove(); }, 250);
    }, 2200);
  }

  async function copy(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      toast('已复制', 'ok');
    } catch (e) {
      // 剪贴板在非 HTTPS 下可能被禁用,退化成让用户手动复制
      window.prompt('浏览器不允许自动复制,请手动复制:', text);
    }
  }

  function formatDuration(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0) return null;
    var s = Math.floor(seconds % 60);
    var m = Math.floor(seconds / 60) % 60;
    var h = Math.floor(seconds / 3600);
    function p(n) { return n < 10 ? '0' + n : String(n); }
    return h > 0 ? h + ':' + p(m) + ':' + p(s) : m + ':' + p(s);
  }

  function formatTime(ms) {
    var d = new Date(ms);
    if (Number.isNaN(d.getTime())) return '';
    function p(n) { return n < 10 ? '0' + n : String(n); }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
      ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  /* ------------------------------------------------------------ 渲染 */

  /**
   * 按来源模式渲染播放器。
   *   file  → 本站的 /stream(带 Range,可拖动)
   *   url   → 外部直链(对象存储 / CDN),不经过本站
   *   embed → iframe 嵌入 B 站 / YouTube 等,不经过本站
   */
  function renderPlayer(s) {
    var v = s.video || {};
    var frame = $('embed');
    var dl = $('download-btn');
    var origin = $('origin-btn');

    $('empty-view').classList.add('hidden');
    $('player-view').classList.remove('hidden');

    function setMeta(parts) {
      baseMeta = parts.filter(Boolean).join(' · ');
      $('video-meta').textContent = baseMeta;
    }

    /* ---- 平台嵌入 ---- */
    if (s.mode === 'embed') {
      video.classList.add('hidden');
      video.removeAttribute('src');
      frame.classList.remove('hidden');
      if (frame.getAttribute('src') !== s.embed) frame.setAttribute('src', s.embed);

      document.title = s.title || '视频';
      $('video-name').textContent = v.name || '嵌入视频';
      setMeta([
        s.platform ? '来自 ' + s.platform : '第三方播放器',
        '视频由平台服务器提供,不占用本站带宽'
      ]);

      dl.classList.add('hidden');
      if (s.origin) {
        origin.classList.remove('hidden');
        origin.href = s.origin;
      } else {
        origin.classList.add('hidden');
      }
      $('format-warning').classList.add('hidden');
      return;
    }

    /* ---- 本地文件 / 外部直链 ---- */
    frame.classList.add('hidden');
    frame.removeAttribute('src');
    video.classList.remove('hidden');
    origin.classList.add('hidden');
    dl.classList.remove('hidden');

    var src = s.mode === 'url' ? s.url : (s.streamUrl || 'stream');
    if (video.getAttribute('src') !== src) {
      video.setAttribute('src', src);
      video.load();
    }

    if (s.mode === 'url') {
      dl.removeAttribute('download');      // 跨域时 download 属性无效,直接让它打开
      dl.href = s.url;
    } else {
      dl.setAttribute('download', '');
      dl.href = s.downloadUrl || 'download';
    }

    document.title = v.name || s.title || '视频';
    $('video-name').textContent = v.name || '视频';
    setMeta([
      v.sizeText,
      v.ext ? v.ext.replace('.', '').toUpperCase() + ' 格式' : null,
      v.mtimeMs ? '更新于 ' + formatTime(v.mtimeMs) : null,
      s.mode === 'url' ? '外部直链托管,不占用本站带宽' : null
    ]);

    var warn = $('format-warning');
    if (v.playable === false) {
      warn.classList.remove('hidden');
      warn.innerHTML = '浏览器通常无法直接播放 <code>' + escapeHtml(v.ext) + '</code> 格式。' +
        '可以点上面的「下载」观看,或者用 ffmpeg 转成 MP4:' +
        '<br><code>ffmpeg -i 输入' + escapeHtml(v.ext) + ' -c:v libx264 -crf 20 -c:a aac -movflags +faststart 输出.mp4</code>';
    } else {
      warn.classList.add('hidden');
    }
  }

  function renderEmpty(s) {
    $('player-view').classList.add('hidden');
    $('empty-view').classList.remove('hidden');
    document.title = '还没有视频 · ' + s.title;

    var box = $('path-box');
    if (s.videoDir) {
      box.classList.remove('hidden');
      $('video-dir').textContent = s.videoDir;
    } else {
      // 访客在外面,不该看到服务器本机路径
      box.classList.add('hidden');
      $('empty-lead').textContent = '站长还没有上传视频。稍后再来看看,或者联系站长。';
    }
  }

  function addrRow(label, url, note, isPublic) {
    return '<div class="addr' + (isPublic ? ' is-public' : '') + '">' +
      '<span class="addr-label">' + escapeHtml(label) + '</span>' +
      '<a class="addr-value" href="' + escapeHtml(url) + '" target="_blank" rel="noopener">' + escapeHtml(url) + '</a>' +
      '<button class="btn btn-sm" type="button" data-copy="' + escapeHtml(url) + '">复制</button>' +
      (note ? '<span class="addr-note">' + note + '</span>' : '') +
      '</div>';
  }

  function renderShare(s) {
    var html = '';

    if (s.publicUrl) {
      var temporary = /trycloudflare\.com|lhr\.life|localtunnel|ngrok/.test(s.publicUrl);
      html += addrRow('公网地址', s.publicUrl,
        temporary
          ? '任何设备、任何网络都能打开。这是临时隧道地址,重启隧道后会变。'
          : '任何设备、任何网络都能打开,地址固定不变。',
        true);
      if (s.mode === 'file') {
        html += addrRow('播放直链', s.publicUrl.replace(/\/$/, '') + '/stream',
          '可以直接贴到播放器里,或嵌入其他网页。');
      }
    } else {
      // 静态托管(GitHub Pages 等)没有后端,公网地址就是当前页面的地址
      var here = location.origin + location.pathname;
      html += addrRow('本页地址', here, '把这个链接发给别人就能看,地址固定不变。', true);
    }

    if (s.isLocal && s.lanUrls && s.lanUrls.length) {
      s.lanUrls.forEach(function (u) {
        html += addrRow('局域网', u, '同一 WiFi 下的手机、平板可以直接打开。');
      });
    }

    if (s.isLocal && s.tailscaleUrls && s.tailscaleUrls.length) {
      s.tailscaleUrls.forEach(function (u) {
        html += addrRow('Tailscale', u,
          '你自己的设备(Tailscale 已登录同一账号)在<strong>任何网络</strong>下都能打开,包括用流量的时候。');
      });
    }

    $('share-body').innerHTML = html;
  }

  /* ------------------------------------------------------------ 拉状态 */

  var timer = null;

  async function poll() {
    var s = await loadStatus();
    if (!s) return;

    $('site-title').textContent = s.title || '视频';
    $('site-subtitle').textContent = s.subtitle || '';
    lastStatus = s;

    if (s.hasVideo) {
      renderPlayer(s);
      if (lastHasVideo === false) toast('检测到视频,已加载', 'ok');
      lastHasVideo = true;
    } else {
      renderEmpty(s);
      lastHasVideo = false;
    }

    renderShare(s);

    // 静态托管下配置不会变,不用轮询;
    // 本地服务模式下勤快点查(丢完文件 / 改完配置马上能看到)
    if (STATIC_MODE) return;
    clearTimeout(timer);
    timer = setTimeout(poll, s.hasVideo ? 5000 : 2000);
  }

  /* ------------------------------------------------------------ 交互 */

  video.addEventListener('loadedmetadata', function () {
    var parts = [];
    if (video.videoWidth) parts.push(video.videoWidth + '×' + video.videoHeight);
    var d = formatDuration(video.duration);
    if (d) parts.push('时长 ' + d);
    if (baseMeta) parts.push(baseMeta);
    if (parts.length) $('video-meta').textContent = parts.join(' · ');
  });

  video.addEventListener('error', function () {
    if (!lastHasVideo || (lastStatus && lastStatus.mode === 'embed')) return;
    if (lastStatus && lastStatus.mode === 'url') {
      toast('外部直链加载失败:地址可能失效,或存储端不允许跨域播放', 'error');
    } else {
      toast('视频加载失败,试试刷新页面', 'error');
    }
  });

  $('copy-stream').addEventListener('click', function () {
    var s = lastStatus || {};
    var target;
    if (s.mode === 'embed') target = s.origin || s.embed;
    else if (s.mode === 'url') target = s.url;
    else target = new URL(s.streamUrl || 'stream', location.href).href;
    copy(target);
  });

  $('copy-dir').addEventListener('click', function () {
    copy($('video-dir').textContent);
  });

  $('fullscreen').addEventListener('click', function () {
    var el = (lastStatus && lastStatus.mode === 'embed') ? $('embed') : video;
    if (el.requestFullscreen) el.requestFullscreen();
    else if (el.webkitEnterFullscreen) el.webkitEnterFullscreen();   // iOS Safari
  });

  $('share-body').addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-copy]');
    if (btn) copy(btn.getAttribute('data-copy'));
  });

  poll();
})();
