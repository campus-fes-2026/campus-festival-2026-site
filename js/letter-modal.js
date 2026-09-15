/**
 * letter-modal.js — 謎解き封筒モーダル 自動生成 + 開閉ロジック
 * ============================================================
 * このスクリプトが読み込まれたページでは、以下を自動的に行います：
 *
 *   1. ナビの .site-nav__hamburger を探し、その位置に
 *      .site-nav__right（封筒アイコン＋ハンバーガー）を生成・挿入する
 *      （.site-nav__hamburger が見つからないページでは何もしません）
 *   2. 封筒モーダル本体（#letter-overlay 一式）を body の末尾に生成する
 *   3. 「🔍 捜査を開始する」ボタンの遷移先を、このスクリプト自身のURL
 *      （document.currentScript.src）から算出したサイトルートを使って
 *      動的に決定する（index.html / pages/xxx/index.html のどちらから
 *      読み込まれても、ページの深さに関係なく正しいリンク先になります）
 *   4. 生成した要素に対して、開閉イベント（クリック／×ボタン／
 *      オーバーレイ外クリック／Escapeキー）をアタッチする
 *
 * 各ページのHTML側に残すのは、次の2行だけです：
 *   <link rel="stylesheet" href="（css/ または ../../css/）letter-modal.css">
 *   <script src="（js/ または ../../js/）letter-modal.js"></script>
 * ページ全体が再提出・上書きされても、この2行さえ残っていれば
 * 手紙アイコン＆モーダルは自動的に復活します。
 *
 * ⚠️ 【重要】document.currentScript を使うため、上記の <script> タグは
 *   type="module" や async / defer を付けない、通常の同期スクリプトの
 *   ままにしてください。
 *
 * ✏️ 【編集ガイド】挑戦状の文面はここで変更できます。
 *   下の LETTER_OVERLAY_HTML 内のテキストを書き換えてください。
 * ============================================================
 */

(function () {
  'use strict';

  // document.currentScript はこのスクリプトが同期実行されている
  // このタイミングでしか取得できないため、ここで先に控えておく
  // （DOMContentLoaded のコールバック内では null になってしまう）
  var thisScript = document.currentScript;

  /* --- ① 封筒アイコンボタン（index.html の現行マークアップと同一） --- */
  var ICON_BUTTON_HTML =
    '<button class="header-letter-icon" id="header-letter-btn" aria-label="謎解きゲームへの挑戦状を開く" type="button">' +
      '<svg class="header-letter-icon__svg" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
        '<rect x="2" y="5" width="20" height="14" rx="2" stroke="currentColor" stroke-width="1.6" />' +
        '<polyline points="2,5 12,14 22,5" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />' +
      '</svg>' +
      '<span class="header-letter-icon__badge" aria-hidden="true">!</span>' +
    '</button>';

  /* --- ② 封筒モーダル本体（index.html の現行マークアップ・文面と同一） ---
     ✏️ 【編集ガイド】挑戦状の文面（タイトル・本文・ボタンのテキスト等）を
        変更したい場合は、この HTML 文字列を書き換えてください。
     遷移先（href）はこの後 ③ で動的に上書きするため、ここでは仮の値のままでOKです。
  --- */
  var LETTER_OVERLAY_HTML =
    '<div class="letter-overlay" id="letter-overlay" role="dialog" aria-modal="true" aria-label="謎解きゲームへの挑戦状" aria-hidden="true">' +
      '<div class="letter-envelope" id="letter-envelope">' +
        '<button class="letter-overlay__close" id="letter-close" aria-label="挑戦状を閉じる" type="button">&times;</button>' +
        '<div class="letter-envelope__body">' +
          '<div class="letter-envelope__flap" aria-hidden="true">' +
            '<div class="letter-envelope__flap-inner"></div>' +
          '</div>' +
          '<div class="letter-card" role="document">' +
            '<p class="letter-card__from">— FROM: UNKNOWN X —</p>' +
            '<h2 class="letter-card__title">🔍 キャンフェススタッフへの挑戦状</h2>' +
            '<p class="letter-card__body">' +
              '先ほど、私がキャンフェスに関するさまざまなデマをSNSに流した。<br>' +
              '止めたければ、キャンフェス会場に仕掛けた謎をすべて解き明かして、<br>' +
              '導かれた言葉を専用サイトに入力し、私の元へたどりついてみたまえ。' +
            '</p>' +
            '<a href="#" class="letter-card__btn" id="letter-start-btn">🔍 捜査を開始する</a>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';

  document.addEventListener('DOMContentLoaded', function () {

    var hamburger = document.querySelector('.site-nav__hamburger');
    if (!hamburger) return; // この機能を持たないページでは何もしない（安全に中断）

    /* --- 1. アイコンを生成し、ナビへ差し込む --- */
    var rightWrap = document.createElement('div');
    rightWrap.className = 'site-nav__right';
    // .site-nav__hamburger があった位置に .site-nav__right を挿入
    hamburger.parentNode.insertBefore(rightWrap, hamburger);

    var iconTemp = document.createElement('div');
    iconTemp.innerHTML = ICON_BUTTON_HTML;
    rightWrap.appendChild(iconTemp.firstElementChild);

    // 既存の .site-nav__hamburger 要素をそのまま移動（作り直さない＝for属性等を保持）
    rightWrap.appendChild(hamburger);

    /* --- 2. モーダルHTMLを生成し、body末尾へ追加 --- */
    var modalTemp = document.createElement('div');
    modalTemp.innerHTML = LETTER_OVERLAY_HTML;
    document.body.appendChild(modalTemp.firstElementChild);

    /* --- 3. 「捜査を開始する」ボタンの遷移先を動的に決定 --- */
    var startBtn = document.getElementById('letter-start-btn');
    if (startBtn && thisScript && thisScript.src) {
      // 例：".../campus-festival-2026-site/js/letter-modal.js" → サイトルートは
      //     末尾の "js/letter-modal.js" を取り除いた部分
      var siteRoot = thisScript.src.replace(/js\/letter-modal\.js(?:[?#].*)?$/, '');
      startBtn.setAttribute('href', siteRoot + 'pages/mystery-quest-game/index.html');
    }

    /* --- 4. 開閉ロジック（既存の挙動を完全に踏襲） --- */
    var overlay  = document.getElementById('letter-overlay');
    var openBtn  = document.getElementById('header-letter-btn');
    var closeBtn = document.getElementById('letter-close');

    if (!overlay || !openBtn) return;

    /* モーダルを開く */
    function openModal() {
      overlay.classList.add('is-open');
      overlay.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden'; // スクロール防止
      // フォーカスを閉じるボタンへ（アニメーション完了後）
      if (closeBtn) {
        setTimeout(function () { closeBtn.focus(); }, 500);
      }
    }

    /* モーダルを閉じる */
    function closeModal() {
      overlay.classList.remove('is-open');
      overlay.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      // フォーカスをアイコンボタンへ戻す
      openBtn.focus();
    }

    // 手紙アイコンクリックで開く
    openBtn.addEventListener('click', openModal);

    // × ボタンで閉じる
    if (closeBtn) {
      closeBtn.addEventListener('click', closeModal);
    }

    // オーバーレイの外枠クリックで閉じる
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeModal();
    });

    // Escape キーで閉じる
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlay.classList.contains('is-open')) {
        closeModal();
      }
    });
  });
})();
