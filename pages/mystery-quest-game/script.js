/**
 * script.js — マツッター 謎解きゲーム ロジック
 * ============================================================
 *
 * ✏️ 【編集ガイド】
 *   このファイルで変更する箇所は主に2つです：
 *
 *   1. STAGE_ANSWER  : 1〜6問クリア用の「捜査コード」（正解キーワード）
 *   2. FINAL_ANSWER  : 最終問題（犯人がタイムラインに新たに投稿する謎、
 *                       種別=final_puzzle の投稿）の答え
 *
 *   正解はすべて「半角英数字小文字に統一して比較」します。
 *   大文字・スペース・全角は自動的に正規化されます。
 *
 * ============================================================
 */

'use strict';

/* ===========================================================
   ① 正解キーワード設定
   ===========================================================
   ✏️ 【編集ガイド】
      STAGE_ANSWER  : 捜査コード（1〜6問目をまとめたキーワード）
      FINAL_ANSWER  : 最終問題（犯人が新たにタイムラインへ投稿する謎、
                      種別=final_puzzle の投稿）の答え

      例えば正解を「matsuda」にしたい場合：
        const STAGE_ANSWER = 'matsuda';

      複数の正解を許容したい場合は配列で：
        const STAGE_ANSWER = ['matsuda', 'まつだ'];
   =========================================================== */

/** 捜査コード（1〜6問クリア用）正解キーワード */
const STAGE_ANSWER = ['クイーン', 'くいーん', 'ｸｲｰﾝ'];   // ← 正式な正解キーワードに更新

/** 最終問題（犯人が新たにタイムラインに投稿する謎、種別=final_puzzle の投稿）の答え。
 *  なぞとき班から共有された正解（複数表記に対応）。 */
const FINAL_ANSWER = ['ルパン車', 'るぱん車', 'るぱんしゃ', 'ルパンシャ', 'rupansya', 'rupansha', 'rupansixya'];

/* ===========================================================
   ①-2 スプレッドシート連携の設定
   ===========================================================
   ✏️ 【編集ガイド】
      タイムラインの雑談投稿（種別=timeline）とヒント投稿（種別=hint）は
      下記の公開CSV（Googleスプレッドシート「ウェブに公開」）から読み込みます。
      投稿の追加・修正はスプレッドシートを編集するだけでOKです。

      取得に失敗した場合は localStorage のキャッシュ →
      それも無ければ DEFAULT_CSV（このファイル下部）で表示します。
   =========================================================== */
const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTwLgsSgWQ6TqzSPro4A6DDnF5tZQNlSP10EENuA8iKivNs0c_ovbV6ekIaNioyEMIwo1mIckbb39uv/pub?gid=1802561556&single=true&output=csv';
const FETCH_TIMEOUT_MS = 6000;
const CACHE_KEY = 'matsutter_posts_csv_v1';
const PROGRESS_KEY = 'matsutter_progress_v1';

/* ===========================================================
   ② ゲーム状態管理
   =========================================================== */
const state = {
  stage1Cleared: false,
  finalCleared: false,
  posts: [], // fetchPostsCSV → csvToObjects の結果。各ハンドラーから参照できるよう保持
};

/** 進行度（stage1Cleared / finalCleared）をlocalStorageに保存する */
function saveProgress() {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify({
      stage1Cleared: state.stage1Cleared,
      finalCleared: state.finalCleared,
    }));
  } catch (e) { /* 無視（保存できない環境でもゲーム自体は動く） */ }
}

/** 保存済みの進行度を読み込む（無ければnull） */
function loadProgress() {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

/* ===========================================================
   ③ ユーティリティ関数
   =========================================================== */

/**
 * 入力値を正規化する（全角→半角、大文字→小文字、スペース除去）
 * これにより「MATSUDA」「Ｍａｔｓｕｄａ」「matsuda 」などすべて一致します。
 * @param {string} str
 * @returns {string}
 */
function normalize(str) {
  return str
    .trim()
    // 全角英数字→半角
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)
    )
    // 全角スペース→半角
    .replace(/　/g, ' ')
    // 前後スペース除去・小文字化
    .replace(/\s+/g, '')
    .toLowerCase();
}

/**
 * 正解チェック（配列または文字列で複数正解に対応）
 * @param {string} input
 * @param {string|string[]} answer
 * @returns {boolean}
 */
function checkAnswer(input, answer) {
  const normalized = normalize(input);
  if (Array.isArray(answer)) {
    return answer.some((a) => normalize(a) === normalized);
  }
  return normalize(answer) === normalized;
}

/**
 * 要素を hidden から表示してアニメーションを付与する
 * @param {HTMLElement} el
 */
function revealElement(el) {
  if (!el) return;
  el.hidden = false;
  // 次のフレームでアニメーションを有効化（hidden解除直後はtransition無効のため）
  requestAnimationFrame(() => {
    el.classList.add('post--animate-in');
  });
}

/* ===========================================================
   DM新着通知トースト（画面上部から出てくる通知）
   =========================================================== */
let dmToastHideTimer = null;

/**
 * 画面上部にトースト通知を表示する。タップでDMタブへジャンプできる。
 * @param {string} text 通知本文
 */
function showDmToast(text) {
  const toast   = document.getElementById('dm-toast');
  const textEl  = document.getElementById('dm-toast-text');
  if (!toast || !textEl) return;

  textEl.textContent = text;
  toast.classList.add('is-visible');

  if (dmToastHideTimer) clearTimeout(dmToastHideTimer);
  dmToastHideTimer = setTimeout(() => {
    toast.classList.remove('is-visible');
  }, 3200);
}

/** トースト通知をタップしたら、DMタブに切り替える */
function initDmToastClick() {
  const toast = document.getElementById('dm-toast');
  const dmTabBtn = document.querySelector('.tabbar__btn[data-view="view-dm"]');
  if (!toast || !dmTabBtn) return;
  toast.addEventListener('click', () => {
    dmTabBtn.click();
    toast.classList.remove('is-visible');
  });
}

/**
 * スムーズスクロールでターゲットまで移動
 * @param {HTMLElement} el
 */
function scrollToElement(el) {
  if (!el) return;
  setTimeout(() => {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 120);
}

/**
 * エラーメッセージを表示してシェイクアニメーションをリセット
 * @param {HTMLElement} errorEl
 */
function showError(errorEl) {
  if (!errorEl) return;
  errorEl.hidden = false;
  // シェイクアニメーションを再実行するためにリセット
  errorEl.style.animation = 'none';
  requestAnimationFrame(() => {
    errorEl.style.animation = '';
  });
}

/* ===========================================================
   ④ Stage 1 : 捜査コード 送信処理
   =========================================================== */

/**
 * Stage 1 の正解処理
 * - 入力欄を正解表示にする
 * - エラーを非表示
 * - 「鍵解除」演出メッセージを挿入
 * - 最終問題ポストを表示してスクロール
 */
function handleStage1Success() {
  state.stage1Cleared = true;
  saveProgress();

  const inputEl        = document.getElementById('stage1-input');
  const submitEl       = document.getElementById('stage1-submit');
  const errorEl        = document.getElementById('stage1-error');
  const finalPuzzleSlot = document.getElementById('final-puzzle-slot');
  const dmMsg2         = document.getElementById('dm-msg-2');
  const dmMsg2Quote    = document.getElementById('dm-msg-2-quote');
  const finalZone      = document.getElementById('input-zone-final');

  // 入力欄をクリア状態に
  if (inputEl)  inputEl.classList.add('is-correct');
  if (submitEl) submitEl.disabled = true;
  // エラーを必ず非表示（直前まで表示されていた場合も含む）
  if (errorEl) { errorEl.hidden = true; errorEl.style.animation = 'none'; }

  // タイムライン側：犯人の最終問題投稿（種別=final_puzzle）を表示
  // ※ DMタブを見ている場合もあるので、強制的なタブ切り替え・スクロールはしない
  if (finalPuzzleSlot) revealElement(finalPuzzleSlot);

  // DM側：2通目メッセージに、犯人の最終問題投稿の本文（＋画像があれば画像も）を引用として差し込む
  if (dmMsg2Quote) {
    const finalPuzzlePost = state.posts.find((p) => p['種別'] === 'final_puzzle');
    if (finalPuzzlePost) {
      dmMsg2Quote.innerHTML = escapeHtml(finalPuzzlePost['本文']) + postImageHtml(finalPuzzlePost);
    }
  }

  // DM側：2通目メッセージと最終回答入力フォームを表示
  if (dmMsg2)    revealElement(dmMsg2);
  if (finalZone) {
    revealElement(finalZone);
    scrollToElement(finalZone);
  }
}

/**
 * Stage 1 の不正解処理
 */
function handleStage1Fail() {
  showError(document.getElementById('stage1-error'));
  // 入力欄を軽く振動（CSSシェイク）
  const inputEl = document.getElementById('stage1-input');
  if (inputEl) {
    inputEl.style.animation = 'none';
    requestAnimationFrame(() => {
      inputEl.style.animation = 'shake 0.35s ease';
    });
  }
}

/* ===========================================================
   ⑤ Final : 最終問題 送信処理
   =========================================================== */

/**
 * Final の正解処理
 * - 最終回答欄を正解状態に
 * - エンディングを表示してスクロール
 */
function handleFinalSuccess() {
  state.finalCleared = true;
  saveProgress();

  const inputEl          = document.getElementById('final-input');
  const submitEl         = document.getElementById('final-submit');
  const errorEl          = document.getElementById('final-error');
  const dmContactCulprit  = document.getElementById('dm-contact-culprit');
  const dmTabBadge        = document.getElementById('dm-tab-badge');
  const dmCulpritNotice   = document.getElementById('dm-culprit-notice');

  if (inputEl)  inputEl.classList.add('is-correct');
  if (submitEl) submitEl.disabled = true;
  if (errorEl)  errorEl.hidden = true;

  // DM側：トーク一覧に犯人を出現させ、DMタブに新着通知バッジを表示
  // （スタッフRからの3通目メッセージ＝事件解決の連絡と、タイムラインの種明かし投稿は、
  //   犯人とのエピローグ会話が終わった後に culpritRenderNext() 側から表示される。
  //   下記②③を参照）
  if (dmContactCulprit) dmContactCulprit.hidden = false;
  if (dmTabBadge)        dmTabBadge.hidden = false;
  if (dmCulpritNotice)   dmCulpritNotice.hidden = false;

  showDmToast('謎の人物「???」から新着メッセージ');
}

/**
 * 犯人とのエピローグ会話が最後まで終わったタイミングで、
 * スタッフRから3通目メッセージ（事件解決・景品受け取り案内）と、
 * タイムライン側の種明かし投稿（種別=reveal）の両方を届ける。
 */
function showStaffFollowupMessage() {
  const dmMsg3          = document.getElementById('dm-msg-3');
  const revealPostsSlot = document.getElementById('reveal-posts-slot');
  const dmTabBadge      = document.getElementById('dm-tab-badge');
  const staffUnread     = document.getElementById('dm-staff-unread');

  if (dmMsg3) revealElement(dmMsg3);
  if (revealPostsSlot) revealElement(revealPostsSlot);
  // DMタブに新着通知バッジを再表示（プレイヤーは今このとき犯人とのトーク画面を
  // 見ているはずなので、スタッフR側に新着が来たことをタブバッジで知らせる）
  if (dmTabBadge) dmTabBadge.hidden = false;
  // トーク一覧の「キャンフェススタッフR」の行にも、新着が来たことを示す赤丸を表示
  if (staffUnread) staffUnread.hidden = false;
  // 画面上部にトースト通知も表示
  showDmToast('キャンフェススタッフRから新着メッセージ');
}

/**
 * Final の不正解処理
 */
function handleFinalFail() {
  showError(document.getElementById('final-error'));
  const inputEl = document.getElementById('final-input');
  if (inputEl) {
    inputEl.style.animation = 'none';
    requestAnimationFrame(() => {
      inputEl.style.animation = 'shake 0.35s ease';
    });
  }
}

/* ===========================================================
   ⑥ イベントリスナー設定
   =========================================================== */

/**
 * 送信ボタン + Enter キーの両方に対応する汎用バインド
 * @param {string} inputId    - input要素のID
 * @param {string} submitId   - buttonのID
 * @param {Function} onSubmit - 送信時に呼ぶコールバック
 */
function bindInputActions(inputId, submitId, onSubmit) {
  const inputEl  = document.getElementById(inputId);
  const submitEl = document.getElementById(submitId);

  if (submitEl) {
    submitEl.addEventListener('click', onSubmit);
  }

  if (inputEl) {
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        onSubmit();
      }
    });
  }
}

/* ===========================================================
   ⑦ スプレッドシート連携：投稿データの取得・パース・描画
   =========================================================== */

/* --- アイコン対応表（インラインSVG / stroke="currentColor"） ---
   このページで既に使われているアバターSVGを流用（circle-help のみ Lucide から新規取得）。
   CSV の「アイコン」列がこのどれにも一致しない場合は user にフォールバックする。 */
const ICON_SVG_HEAD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">';
const ICONS = {
  'graduation-cap': ICON_SVG_HEAD + '<path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/></svg>',
  'search': ICON_SVG_HEAD + '<path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/></svg>',
  'fingerprint': ICON_SVG_HEAD + '<path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4"/><path d="M14 13.12c0 2.38 0 6.38-1 8.88"/><path d="M17.29 21.02c.12-.6.43-2.3.5-3.02"/><path d="M2 12a10 10 0 0 1 18-6"/><path d="M2 16h.01"/><path d="M21.8 16c.2-2 .131-5.354 0-6"/><path d="M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2"/><path d="M8.65 22c.21-.66.45-1.32.57-2"/><path d="M9 6.8a6 6 0 0 1 9 5.2v2"/></svg>',
  'camera': ICON_SVG_HEAD + '<path d="M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z"/><circle cx="12" cy="13" r="3"/></svg>',
  'laptop': ICON_SVG_HEAD + '<path d="M18 5a2 2 0 0 1 2 2v8.526a2 2 0 0 0 .212.897l1.068 2.127a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45l1.068-2.127A2 2 0 0 0 4 15.526V7a2 2 0 0 1 2-2z"/><path d="M20.054 15.987H3.946"/></svg>',
  'megaphone': ICON_SVG_HEAD + '<path d="M11 6a13 13 0 0 0 8.4-2.8A1 1 0 0 1 21 4v12a1 1 0 0 1-1.6.8A13 13 0 0 0 11 14H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"/><path d="M6 14a12 12 0 0 0 2.4 7.2 2 2 0 0 0 3.2-2.4A8 8 0 0 1 10 14"/><path d="M8 6v8"/></svg>',
  // ももこ（雑談）で使われているSVGそのまま
  'smile': ICON_SVG_HEAD + '<path d="M15 10V9"/><path d="M9 10V9"/><path d="M9 16a5 5 0 0 0 6 0"/><circle cx="12" cy="12" r="10"/></svg>',
  // だいすけ先輩（雑談）で使われているSVGそのまま
  'user': ICON_SVG_HEAD + '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  // Lucide circle-help（新規取得・ISCライセンス）
  'circle-help': ICON_SVG_HEAD + '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>',
};

/** アイコン名 → SVG文字列（未知の名前は user にフォールバック） */
function iconSvg(name) {
  return ICONS[name] || ICONS.user;
}

/** ヒント番号 → 丸数字（1〜9のみ。範囲外はそのままの数字を返す） */
const HINT_CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨'];

/**
 * HTMLに差し込む前に危険な文字を実体参照へ。innerHTMLに生の文字列を入れないこと。
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 簡易 RFC4180 CSVパーサー（引用符・カンマ/改行を含むセル・BOM付きに対応）
 * @param {string} text
 * @returns {string[][]}
 */
function parseCSV(text) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); // BOM除去
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        row.push(field); field = '';
      } else if (c === '\r') {
        // 何もしない（\nで改行処理）
      } else if (c === '\n') {
        row.push(field); field = '';
        rows.push(row); row = [];
      } else {
        field += c;
      }
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

/** CSVの行配列を、ヘッダー行をキーにしたオブジェクトの配列に変換する */
function csvToObjects(csvText) {
  const rows = parseCSV(csvText);
  if (rows.length < 2) return [];
  const headers = rows[0];
  return rows.slice(1).map((row) => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (row[i] || '').trim(); });
    return obj;
  });
}

/**
 * 投稿データCSVを取得する（fetch → localStorageキャッシュ → DEFAULT_CSV の3段構え）
 * @returns {Promise<string>}
 */
async function fetchPostsCSV() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const url = SHEET_CSV_URL + '&_=' + Date.now(); // キャッシュバスター
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const text = await res.text();
    try { localStorage.setItem(CACHE_KEY, text); } catch (e) { /* 無視 */ }
    return text;
  } catch (e) {
    console.warn('[マツッター] スプレッドシート取得失敗。キャッシュ/デフォルトを使用します。', e);
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) return cached;
    } catch (e2) { /* 無視 */ }
    return DEFAULT_CSV;
  }
}

/** 「表示順」で昇順ソートしたコピーを返す */
function sortByOrder(list) {
  return list.slice().sort((a, b) =>
    (parseFloat(a['表示順']) || 0) - (parseFloat(b['表示順']) || 0)
  );
}

/** ハッシュタグ文字列（スペース区切り）→ <span class="post__hashtag"> の連結 */
function hashtagSpans(raw) {
  const tags = String(raw || '').trim().split(/\s+/).filter(Boolean);
  return tags.map((t) => ' <span class="post__hashtag">' + escapeHtml(t) + '</span>').join('');
}

/**
 * 「画像」列 → <img class="post__image"> のHTML（値が無ければ空文字）
 * ファイル名は pages/mystery-quest-game/images/posts/ 内のファイル名のみを想定
 * （例：final-puzzle-16.jpg）。属性値として問題ないファイル名のみを想定しているため
 * escapeHtml ではなく encodeURIComponent でURLエンコードする。
 */
function postImageHtml(obj) {
  const filename = obj['画像'];
  if (!filename) return '';
  return '<img class="post__image" src="images/posts/' + encodeURIComponent(filename) + '" alt="投稿画像" loading="lazy">';
}

/** 1投稿ぶんの共通パーツ（ヘッダー行 + 本文 + 画像） */
function postBodyInner(obj) {
  return (
    '<div class="post__header">' +
      '<span class="post__name">' + escapeHtml(obj['名前']) + '</span>' +
      '<span class="post__handle">' + escapeHtml(obj['ID']) + '</span>' +
      '<span class="post__time">' + escapeHtml(obj['時刻']) + '</span>' +
    '</div>' +
    '<p class="post__text">' + escapeHtml(obj['本文']) + hashtagSpans(obj['ハッシュタグ']) + '</p>' +
    postImageHtml(obj)
  );
}

/** フッター行（リツイート数・いいね数 + 任意の追加バッジ） */
function postFooter(obj, extraBadgeHtml) {
  return (
    '<div class="post__footer">' +
      '<span class="post__stat">🔁 ' + escapeHtml(obj['リツイート数']) + '</span>' +
      '<span class="post__stat">❤️ ' + escapeHtml(obj['いいね数']) + '</span>' +
      (extraBadgeHtml || '') +
    '</div>'
  );
}

/** 雑談投稿（種別=timeline）を #ambient-posts-slot に描画する */
function renderAmbientPosts(rows) {
  const slot = document.getElementById('ambient-posts-slot');
  if (!slot) return;
  slot.innerHTML = sortByOrder(rows).map((obj) =>
    '<article class="post post--witness" data-post="ambient">' +
      '<div class="post__avatar" aria-hidden="true">' + iconSvg(obj['アイコン']) + '</div>' +
      '<div class="post__body">' + postBodyInner(obj) + postFooter(obj) + '</div>' +
    '</article>'
  ).join('');
}

/** ヒント投稿（種別=hint）を #hint-pool に描画する */
function renderHintPosts(rows) {
  const pool = document.getElementById('hint-pool');
  if (!pool) return;
  pool.innerHTML = sortByOrder(rows).map((obj) => {
    const num = obj['ヒント番号'] || '';
    const n = parseInt(num, 10);
    const mark = (n >= 1 && n <= 9) ? HINT_CIRCLED[n - 1] : escapeHtml(num);
    const badge = '<span class="post__hint-badge">🔎 ヒント' + mark + '</span>';
    return (
      '<article class="post post--witness" data-post="hint" data-hint="' + escapeHtml(num) + '">' +
        '<div class="post__avatar" aria-hidden="true">' + iconSvg(obj['アイコン']) + '</div>' +
        '<div class="post__body">' + postBodyInner(obj) + postFooter(obj, badge) + '</div>' +
      '</article>'
    );
  }).join('');
}

/** 犯人の最終問題投稿（種別=final_puzzle）を #final-puzzle-slot に描画する */
function renderFinalPuzzlePost(rows) {
  const slot = document.getElementById('final-puzzle-slot');
  if (!slot) return;
  slot.innerHTML = sortByOrder(rows).map((obj) =>
    '<article class="post post--witness" data-post="final-puzzle">' +
      '<div class="post__avatar" aria-hidden="true">' + iconSvg(obj['アイコン']) + '</div>' +
      '<div class="post__body">' + postBodyInner(obj) + postFooter(obj) + '</div>' +
    '</article>'
  ).join('');
}

/** 事件解決後の種明かし投稿（種別=reveal）を #reveal-posts-slot に描画する */
function renderRevealPosts(rows) {
  const slot = document.getElementById('reveal-posts-slot');
  if (!slot) return;
  slot.innerHTML = sortByOrder(rows).map((obj) =>
    '<article class="post post--witness" data-post="reveal">' +
      '<div class="post__avatar" aria-hidden="true">' + iconSvg(obj['アイコン']) + '</div>' +
      '<div class="post__body">' + postBodyInner(obj) + postFooter(obj) + '</div>' +
    '</article>'
  ).join('');
}

/** ヒント投稿に出てくるハッシュタグから検索チップ（#search-chips）を生成する */
function renderSearchChips() {
  const container = document.getElementById('search-chips');
  const pool = document.getElementById('hint-pool');
  if (!container || !pool) return;
  const seen = new Set();
  const tags = [];
  pool.querySelectorAll('.post__hashtag').forEach((el) => {
    const t = el.textContent.trim();
    if (t && !seen.has(t)) { seen.add(t); tags.push(t); }
  });
  container.innerHTML = tags.map((t) =>
    '<button type="button" class="search-chip" data-query="' + escapeHtml(t) + '">' + escapeHtml(t) + '</button>'
  ).join('');
}

/* ===========================================================
   ⑧ 下部タブバー：3ビューの切り替え
   =========================================================== */

/** タブバーを初期化する（初期表示はタイムライン） */
function initTabBar() {
  const tabbar = document.querySelector('.tabbar');
  if (!tabbar) return;

  const buttons = Array.from(tabbar.querySelectorAll('.tabbar__btn'));
  const viewIds = ['view-timeline', 'view-search', 'view-dm'];

  function activate(targetId) {
    viewIds.forEach((id) => {
      const view = document.getElementById(id);
      if (view) view.hidden = (id !== targetId);
    });
    buttons.forEach((btn) => {
      const isActive = btn.dataset.view === targetId;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-current', isActive ? 'page' : 'false');
    });
    // ビュー切り替え時はページ上端へ（アプリらしい挙動）
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  buttons.forEach((btn) => {
    btn.addEventListener('click', () => activate(btn.dataset.view));
  });

  activate('view-timeline');
}

/* ===========================================================
   ⑧-2 DM画面：トーク一覧 ⇄ 個別チャットの切り替え
   =========================================================== */

/**
 * DMタブの「未読」表示（トーク行の赤丸バッジ・下部タブの通知バッジ）を消す
 */
function markCulpritRead() {
  const badge = document.getElementById('dm-tab-badge');
  if (badge) badge.hidden = true;

  const contact = document.getElementById('dm-contact-culprit');
  const unread  = contact ? contact.querySelector('.dm-contact__unread') : null;
  if (unread) unread.hidden = true;

  const notice = document.getElementById('dm-culprit-notice');
  if (notice) notice.hidden = true;
}

/**
 * DM画面の「トーク一覧 ⇄ 個別チャット」切り替えを初期化する
 * （タブバー全体の切り替え＝initTabBar とは別の、DM画面内部だけの状態）
 */
function initDmInbox() {
  const inbox = document.getElementById('dm-inbox');
  if (!inbox) return;

  const conversations = {
    staff:   document.getElementById('dm-conversation-staff'),
    culprit: document.getElementById('dm-conversation-culprit'),
  };

  function backToInbox() {
    Object.keys(conversations).forEach((key) => {
      const el = conversations[key];
      if (el) el.hidden = true;
    });
    inbox.hidden = false;
  }

  function openConversation(name) {
    const target = conversations[name];
    if (!target) return;

    inbox.hidden = true;
    // target以外の会話は確実に隠す（開いている会話から別の会話へ直接ジャンプしても
    // 両方が同時に表示されたままにならないようにするため）
    Object.keys(conversations).forEach((key) => {
      const el = conversations[key];
      if (el) el.hidden = (key !== name);
    });

    if (name === 'culprit') {
      markCulpritRead();
      initCulpritConversation(); // 初回のみ会話を開始（2回目以降は何もしない）
    }

    if (name === 'staff') {
      // スタッフRとのトークを開いたら、DMタブの新着バッジ（②で再表示したもの）と
      // トーク一覧の未読赤丸を消す
      const badge = document.getElementById('dm-tab-badge');
      if (badge) badge.hidden = true;
      const staffUnread = document.getElementById('dm-staff-unread');
      if (staffUnread) staffUnread.hidden = true;
    }
  }

  inbox.querySelectorAll('.dm-contact[data-contact]').forEach((btn) => {
    btn.addEventListener('click', () => openConversation(btn.dataset.contact));
  });

  document.querySelectorAll('[data-back-to-inbox]').forEach((btn) => {
    btn.addEventListener('click', backToInbox);
  });

  // スタッフR会話内の通知ボタンから、犯人とのトークに直接ジャンプ
  const openCulpritBtn = document.getElementById('dm-open-culprit-btn');
  if (openCulpritBtn) {
    openCulpritBtn.addEventListener('click', () => openConversation('culprit'));
  }

  // DM画面を開いたときの初期状態は常にトーク一覧
  backToInbox();
}

/* ===========================================================
   ⑨ 検索ビュー：ヒント投稿のリアルタイム絞り込み
   =========================================================== */

/** 検索ビューを初期化する */
function initSearch() {
  const input   = document.getElementById('search-input');
  const results = document.getElementById('search-results');
  const pool    = document.getElementById('hint-pool');
  if (!input || !results || !pool) return;

  const hintPosts = Array.from(pool.querySelectorAll('.post'));

  function runSearch(rawQuery) {
    const query = (rawQuery || '').trim().toLowerCase();
    results.innerHTML = '';

    // 空欄のときは結果を出さない（ガイド文＋チップのみの状態）
    if (!query) return;

    const matched = hintPosts.filter((post) =>
      post.textContent.toLowerCase().includes(query)
    );

    if (matched.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'search-empty';
      empty.textContent = '「' + rawQuery.trim() + '」に一致する投稿は見つかりませんでした。';
      results.appendChild(empty);
      return;
    }

    matched.forEach((post) => {
      const clone = post.cloneNode(true);
      clone.hidden = false;
      results.appendChild(clone);
    });
  }

  // 入力のたびにリアルタイムで絞り込み
  input.addEventListener('input', () => runSearch(input.value));

  // 候補ハッシュタグチップ：クリックで検索欄に入れて実行
  document.querySelectorAll('.search-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      input.value = chip.dataset.query || chip.textContent.trim();
      runSearch(input.value);
      input.focus();
    });
  });
}

/** 保存済みの進行度があれば、既存の正解処理をそのまま呼び出して画面を復元する */
function restoreProgress() {
  const saved = loadProgress();
  if (!saved) return;
  if (saved.stage1Cleared) handleStage1Success();
  if (saved.finalCleared)  handleFinalSuccess();
}

/* ===========================================================
   ⑩ 初期化（DOMContentLoaded）
   =========================================================== */
document.addEventListener('DOMContentLoaded', async () => {

  initTabBar();
  initDmInbox();
  initDmToastClick();

  /* --- 入力フォームのバインド ---
     ゲーム核心の入力欄はスプレッドシート取得を待たずに先に有効化する。 */
  bindInputActions('stage1-input', 'stage1-submit', () => {
    if (state.stage1Cleared) return; // 二重送信防止

    const inputEl = document.getElementById('stage1-input');
    const value   = inputEl ? inputEl.value : '';

    if (checkAnswer(value, STAGE_ANSWER)) {
      handleStage1Success();
    } else {
      handleStage1Fail();
    }
  });

  bindInputActions('final-input', 'final-submit', () => {
    if (state.finalCleared) return; // 二重送信防止

    const inputEl = document.getElementById('final-input');
    const value   = inputEl ? inputEl.value : '';

    if (checkAnswer(value, FINAL_ANSWER)) {
      handleFinalSuccess();
    } else {
      handleFinalFail();
    }
  });

  /* --- スプレッドシートから投稿を取得して描画 ---
     initSearch() は #hint-pool の中身と .search-chip の存在を前提にしているため、
     描画（renderHintPosts / renderSearchChips）が終わってから呼ぶ。 */
  const csvText = await fetchPostsCSV();
  const posts = csvToObjects(csvText);
  state.posts = posts; // handleStage1Success 等、他のハンドラーからも参照できるよう保持
  renderAmbientPosts(posts.filter((p) => p['種別'] === 'timeline'));
  renderHintPosts(posts.filter((p) => p['種別'] === 'hint'));
  renderFinalPuzzlePost(posts.filter((p) => p['種別'] === 'final_puzzle'));
  renderRevealPosts(posts.filter((p) => p['種別'] === 'reveal'));
  renderSearchChips();

  initSearch();

  // 投稿データ（state.posts）の描画が終わってから、保存済みの進行度を復元する
  restoreProgress();

  /*
  ✏️ 【開発用デバッグ】
     ブラウザのコンソールで以下を実行すると各ステージをスキップできます。
       handleStage1Success();  // stage1をクリア
       handleFinalSuccess();   // finalをクリア
  */
});

/* ===========================================================
   ⑩-2 犯人とのDM会話スクリプト（エンディングの会話パート）
   ===========================================================
   ✏️ 【編集ガイド】
      犯人との個別チャットで表示するセリフを、上から順番に定義します。

      { type: 'text', text: '犯人のセリフ' }
        → 1通のメッセージとして表示。画面をタップすると次に進む。

      { type: 'choice', options: ['選択肢A', '選択肢B', '選択肢C'] }
        → プレイヤーが選ぶボタンを表示。選んだ文言がプレイヤー自身の
          発言として吹き出しに追加されたあと、自動的に次に進む。
          ※ どれを選んでも次のセリフは変わりません（結末は一本道）。

      内容はすべて仮テキストです。実際のセリフ・選択肢が決まったら、
      この配列の中身を書き換えるだけで反映されます。
   =========================================================== */
const CULPRIT_DM_SCRIPT = [
  { type: 'text', text: 'よくぞすべての謎を解いてくれたね。' },
  { type: 'choice', options: ['なんで最後の答えがルパン車だったの？', '結局あなたの正体は何だったの？'] },
  { type: 'text', text: '私はフォトスポット班の班員さ。' },
  { type: 'text', text: 'ルパン車制作の関係者だったから、答えをルパン車にしたというわけだ。' },
  { type: 'choice', options: ['なんでデマを流したの？', 'なんで謎解きをキャンパスに仕掛けたの？'] },
  { type: 'text', text: '私は、このキャンフェスで謎解き企画がやりたかったんだ。だがその企画は誰からも支持されず却下され、代わりに入れさせられたのがフォトスポット班だ。' },
  { type: 'text', text: 'そこで私は、他の企画にデマを流して客を減らし、その企画の近くに謎を貼ることで、みんなが私の謎に注目してくれると思ったのさ。' },
  { type: 'choice', options: ['みんな困ってたよ', '投稿は全て消した方がいいと思うな'] },
  { type: 'text', text: 'ああ。マツッターのデマは全部削除しておく。謝罪文も投稿しておくよ。' },
  { type: 'choice', options: ['そうだね。デマを流したことは決して許されることじゃないけど、、、'] },
  { type: 'choice', options: ['君の謎は面白かったな！来年こそはみんなで謎解き企画やろうよ！', 'もっと君の謎解いてみたい！来年こそはみんなで謎解き企画やって欲しいな！'] },
  { type: 'text', text: '・・・そうか。もし来年謎解き企画が実現したら、もう一度解いてくれるかい？' },
  { type: 'choice', options: ['いいよ！', 'もちろん！', '楽しみにしてるね！'] },
  { type: 'text', text: 'ありがとう。' },
];

/** CULPRIT_DM_SCRIPT のうち、次に処理するノードのインデックス */
let culpritStep = 0;
/** 会話を開始済みか（2回目以降に開いたときは最初から作り直さない） */
let culpritConversationStarted = false;
/** 犯人とのエピローグ会話が終わった後の処理を、二重に呼ばないためのフラグ */
let culpritEpilogueFinished = false;

/** 「・・・」を表示しておく時間（ミリ秒） */
const CULPRIT_TYPING_DELAY_MS = 900;
/** 本文表示後、次のノードに自動で進むまでの、1文字あたりの追加待ち時間（ミリ秒） */
const CULPRIT_READ_MS_PER_CHAR = 60;
/** 自動で次に進むまでの待ち時間の下限・上限（ミリ秒） */
const CULPRIT_READ_MIN_MS = 1200;
const CULPRIT_READ_MAX_MS = 4500;

/**
 * 犯人側のメッセージを、「・・・」（入力中）→ 実際の本文、の順で1件表示する。
 * 本文表示後、文字数に応じた時間だけ待ってから onDone() を呼ぶ（自動で次のノードへ）。
 * @param {string} text
 * @param {Function} onDone
 */
function renderCulpritTypingThenText(text, onDone) {
  const thread = document.getElementById('culprit-dm-thread');
  if (!thread) { onDone(); return; }

  const el = document.createElement('div');
  el.className = 'dm-msg';
  el.innerHTML =
    '<span class="dm-msg__avatar" aria-hidden="true">' + iconSvg('circle-help') + '</span>' +
    '<div class="dm-msg__bubble dm-msg__bubble--typing"><p>・・・</p></div>';
  thread.appendChild(el);
  scrollToElement(el);

  setTimeout(() => {
    const bubble = el.querySelector('.dm-msg__bubble');
    const p = el.querySelector('p');
    if (bubble) bubble.classList.remove('dm-msg__bubble--typing');
    if (p) p.textContent = text; // textContentで代入するのでエスケープ処理は不要
    scrollToElement(el);

    const readDelay = Math.min(
      CULPRIT_READ_MAX_MS,
      Math.max(CULPRIT_READ_MIN_MS, text.length * CULPRIT_READ_MS_PER_CHAR)
    );
    setTimeout(onDone, readDelay);
  }, CULPRIT_TYPING_DELAY_MS);
}

/**
 * プレイヤー自身の発言（右寄せの自分側吹き出し）を #culprit-dm-thread に1件追加する
 * @param {string} text
 */
function renderCulpritSelfNode(text) {
  const thread = document.getElementById('culprit-dm-thread');
  if (!thread) return;
  const el = document.createElement('div');
  el.className = 'dm-msg dm-msg--self';
  el.innerHTML = '<div class="dm-msg__bubble dm-msg__bubble--self"><p>' + escapeHtml(text) + '</p></div>';
  thread.appendChild(el);
  scrollToElement(el);
}

/**
 * 選択肢ボタン群を #culprit-dm-thread に追加する。
 * いずれかがクリックされたら、ボタン群を消してプレイヤーの発言として表示し、
 * onDone() を呼んで自動的に次のノードへ進む（タップ待ちにしない）。
 * @param {{options: string[]}} node
 * @param {Function} onDone
 */
function renderCulpritChoiceNode(node, onDone) {
  const thread = document.getElementById('culprit-dm-thread');
  if (!thread) { onDone(); return; }

  const group = document.createElement('div');
  group.className = 'dm-choice-group';

  node.options.forEach((optionText) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dm-choice-btn';
    btn.textContent = optionText;
    btn.addEventListener('click', (e) => {
      // タップ進行用のスレッドクリックリスナーへ伝播させない（二重進行を防ぐ）
      e.stopPropagation();
      group.remove();
      renderCulpritSelfNode(optionText);
      onDone();
    });
    group.appendChild(btn);
  });

  thread.appendChild(group);
  scrollToElement(group);
}

/**
 * CULPRIT_DM_SCRIPT の次のノードを処理する。
 * text ノードは表示してタップ待ちに、choice ノードは選択待ちにし、
 * 選択後は自動的にこの関数を再度呼んで次に進む。
 */
function culpritRenderNext() {
  if (culpritStep >= CULPRIT_DM_SCRIPT.length) {
    if (!culpritEpilogueFinished) {
      culpritEpilogueFinished = true;
      showStaffFollowupMessage();
    }
    return;
  }
  const node = CULPRIT_DM_SCRIPT[culpritStep];
  culpritStep++;

  if (node.type === 'choice') {
    renderCulpritChoiceNode(node, () => {
      culpritRenderNext(); // 選択後は自動的に次へ
    });
  } else {
    renderCulpritTypingThenText(node.text, () => {
      culpritRenderNext(); // 本文の表示・読み終わり待ちが終わったら自動的に次へ
    });
  }
}

/**
 * 犯人との個別チャットを初期化する（初回に開いたときだけ会話を開始する）。
 */
function initCulpritConversation() {
  const thread = document.getElementById('culprit-dm-thread');
  if (!thread || culpritConversationStarted) return;
  culpritConversationStarted = true;

  culpritRenderNext(); // 最初のノードを表示
}

/* ===========================================================
   ⑪ オフライン用フォールバックデータ（DEFAULT_CSV）
   ===========================================================
   スプレッドシートも localStorage キャッシュも使えない場合に
   これで表示する。列構成・内容は公開スプレッドシート／従来の
   HTML直書きと一致させること（デグレ防止）。
   ※ 本文は書式なしのプレーンテキスト（<strong> 等の装飾は入らない）。
   =========================================================== */
const DEFAULT_CSV = `種別,表示順,名前,ID,アイコン,時刻,本文,ハッシュタグ,リツイート数,いいね数,ヒント番号,画像
timeline,1,ももこ,@momo_camp26,smile,09:14,うそやばい、まじで中止なの!? 出店の準備めっちゃしたのに…😭 誰か本当か教えて,#キャンフェス2026,46,73,,
timeline,2,りく（3年A組）,@riku_3a,user,09:22,え待って中止の話拡散されすぎてて草。てかソースどこ？公式そんなアナウンス出してなくない？,,88,154,,
timeline,3,だいすけ先輩,@daisuke_senpai,user,09:40,後輩から中止って聞いて焦って先生に聞きに行ったら『そんな話聞いてない』って言われた。これデマだ,,205,367,,
timeline,4,匿名希望,@anon_student2026,user,09:58,なんか変な投稿からめっちゃ広まってるらしい。RTする前に一回確認した方がいいと思うよ〜,,132,219,,
hint,1,たろちゃん,@taro_campfes,graduation-cap,09:18,え、中止？！さっき正門で「M」と書かれたステッカーが貼られた看板を見たけど… あれが怪しいのかな。,#キャンフェスデマ事件,23,87,1,
hint,2,花子 探偵,@hanako_detective,search,09:31,不審な投稿のIPログを辿ったら…発信場所は「A棟 3階」の端末から。 あの場所には誰がいたんだろう。,#調査中,61,112,2,
hint,3,松田 捜査官,@matsuda_detective,fingerprint,09:45,目撃情報：投稿直前、黒いパーカーの人物が図書館前のベンチに座ってスマホを操作していた。 手元には「5」と書かれたメモが…,#目撃者募集,89,204,3,
hint,4,写真部 ゆい,@yui_photo_club,camera,10:02,写真整理してたら偶然写ってた！9時10分ごろ、A棟3階の窓から外を覗いてる人物。 名札に「T・S」って書いてあるっぽい…？,#証拠写真,310,521,4,
hint,5,情報部 けんた,@kenta_itclub,laptop,10:15,アカウント @unknown_x_2026 を解析したら プロフィール画像のメタデータに「Matsuda_2026」という文字列が残ってた。 これ、本名じゃないか？,#デジタル捜査,178,399,5,
hint,6,実行委員長 あおい,@aoi_committee,megaphone,10:29,みなさん、落ち着いてください。キャンフェスは予定通り開催です！ デマを流した人物の特定を進めています。 心当たりのある方はDMを。,#キャンフェス開催,892,1.2K,6,
final_puzzle,1,（未定）,@unknown,circle-help,たった今,（なぞとき班が最終問題の内容を追加予定。それまでの仮テキストです）,,0,0,,final-puzzle-16.jpg
reveal,1,ももこ,@momo_camp26,smile,たった今,さっきの中止デマの件、実行委員に聞いたら「この投稿、地味に画像加工が凝ってて逆に手間かかってたと思う」って言ってた(笑) 犯人ちゃんと捕まったみたいで安心した〜,,128,402,,
reveal,2,生徒（仮）1,@unknown1,user,たった今,（未定・なぞとき班からの企画①デマ真相の共有待ちです）,,0,0,,
reveal,3,生徒（仮）2,@unknown2,user,たった今,（未定・なぞとき班からの企画②デマ真相の共有待ちです）,,0,0,,
reveal,4,生徒（仮）3,@unknown3,user,たった今,（未定・なぞとき班からの企画③デマ真相の共有待ちです）,,0,0,,
reveal,5,生徒（仮）4,@unknown4,user,たった今,（未定・なぞとき班からの企画④デマ真相の共有待ちです）,,0,0,,
reveal,6,生徒（仮）5,@unknown5,user,たった今,（未定・なぞとき班からの企画⑤デマ真相の共有待ちです）,,0,0,,
reveal,7,生徒（仮）6,@unknown6,user,たった今,（未定・なぞとき班からの企画⑥デマ真相の共有待ちです）,,0,0,,
reveal,8,匿名希望,@anon_mob1,user,たった今,（未定・なぞとき班からのモブ生徒の反応共有待ちです）,,0,0,,
reveal,9,通りすがりの生徒,@anon_mob2,user,たった今,（未定・なぞとき班からのモブ生徒の反応共有待ちです）,,0,0,,
`;
