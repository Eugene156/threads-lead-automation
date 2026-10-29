// Threads -> Apify webhook -> D1 -> Telegram.
// This update keeps the existing D1 schema, bindings, routes and digest schedule.
const THIRTY_MINUTES = 30 * 60 * 1000;
const TWO_HOURS = 2 * 60 * 60 * 1000;
const MAX_PER_DIGEST = 8;

const SPECIALIST = /психолог[а-я]*|психотерапевт[а-я]*/g;
const DIRECT_CUE = /ищу|ищем|нужен|нужна|нужны|посоветуй(?:те|шь)?|порекомендуй(?:те|шь)?|подскажи(?:те)?|помогите\s+найти|хочу\s+найти|где\s+(?:найти|искать)|кто\s+(?:может\s+)?(?:посоветовать|порекомендовать)|кто\s+знает/g;
const DIRECT_PHRASE = /хочу\s+(?:к\s+психолог[а-я]*|в\s+терапи[юи]|(?:пойти|обратиться|записаться)\s+к\s+психолог[а-я]*)|как\s+выбрать\s+психолог[а-я]*|нужна\s+психологическая\s+помощь/i;

// Exclude explicit professional self-promotion and recruitment, not neutral
// references to therapy, prices or an online consultation in client requests.
const PROMOTION = [
  /(?:ищу|набираю|беру)\s+(?:новых\s+)?(?:клиент[а-я]*|пациент[а-я]*|сотрудник[а-я]*)/i,
  /(?:записывайтесь|запись\s+(?:открыта|на\s+(?:консультаци|сесси))|открыт[а-я]*\s+запис[а-я]*)/i,
  /(?:приглашаю\s+(?:вас\s+)?на\s+(?:консультаци|сесси)|провожу\s+(?:онлайн[ -])?(?:консультаци|сесси))/i,
  /(?:я\s+(?:психолог|психотерапевт)[а-я]*|психолог\s+с\s+(?:опытом|стажем)).{0,100}(?:принимаю|работаю|запись|клиент|консультаци)/i,
  /(?:реклама|рекламный\s+пост|промокод|скидка\s+на\s+(?:консультаци|сесси))/i,
  /ищу\s+(?:работу|ваканси[юи]|учеников|моделей)/i,

  // Recruiters looking for psychologists as staff, not therapy clients.
  /(?:ищу|ищем|нужен|нужна|нужны|требуется|приглашаем|набираем)[^.!?\n]{0,100}(?:психолог|психотерапевт)[а-я]*[^.!?\n]{0,100}(?:в\s+(?:нашу\s+)?команду|в\s+штат|в\s+коллектив|на\s+работу|на\s+ваканси[юи]|для\s+(?:нашей\s+)?команды)/i,

  // Professional peer events, e.g. paid intervision or supervision.
  /(?:ищу|ищем|приглашаю|приглашаем|набираю|набираем)[^.!?\n]{0,100}(?:психолог|психотерапевт)[а-я]*[^.!?\n]{0,100}(?:для|на)\s+(?:платн[а-я]*\s+)?(?:интервизи|супервизи)[а-я]*/i,

  // Marketing offers addressed to psychologists, not requests for help.
  /(?:ищу|ищем|приглашаю|приглашаем)[^.!?\n]{0,80}(?:психолог|психотерапевт)[а-я]*[^.!?\n]{0,180}(?:хоч(?:ет|ешь|ят)\s+(?:стать\s+заметн|привлекать\s+клиент)|для\s+(?:рекламы|продвижения|маркетинга)|продвижени[а-я]*\s+(?:блога|услуг|аккаунта))/i,

  // Self-promotion in question form: "Looking for a psychologist? I am one."
  /ищете\s+(?:(?:себе|хорошего)\s+)?(?:психолог|психотерапевт)[а-я]*[\s\S]{0,180}я\s*[-—–]?\s*(?:профессиональн[а-я]*\s+)?(?:психолог|психотерапевт)[а-я]*/i
];

const REJECTION = /(?:^|[^а-я])(?:не\s+нуж(?:ен|на|ны)\s+(?:мне\s+)?психолог[а-я]*|психолог\s+(?:мне\s+)?не\s+нужен|не\s+ищу\s+(?:психолог|психотерапевт)[а-я]*)/i;

const PROBLEMS = [
  "не справляюсь", "я не вывожу", "устала от всего", "устал от всего",
  "не могу расслабиться", "постоянно накручиваю себя",
  "эмоциональное выгорание", "хочу развестись",
  "не могу решиться на развод", "как пережить расставание",
  "не могу отпустить", "всё на мне", "не могу делегировать",
  "устал от бизнеса", "боюсь поднять цены", "не умею себя продавать",
  "синдром самозванца", "не верю в себя", "не могу сказать нет",
  "не знаю чего хочу"
];

// Diagnostic abbreviations alone are not a help-seeking signal: a personal
// problem, symptom or request for help must also be expressed.
const CONTEXTUAL_PROBLEMS = new Set(["эмоциональное выгорание", "синдром самозванца"]);
const DISTRESS = /(?:борюсь|мучаюсь|испытываю|страдаю|столкнул[а-я]*|тяжело|выматывает|тревожит|как\s+побороть|что\s+делать)/i;
const ABBREVIATION = /(?:^|[^\p{L}\p{N}])(?:окр|птср|нрл|прл)(?=$|[^\p{L}\p{N}])/iu;
const PERSONAL_CONTEXT = /(?:у\s+меня|у\s+себя|у\s+(?:сына|дочери|мужа|жены|ребенка)|(?:^|[^а-я])(?:мой|моя|мое|мои)(?=$|[^а-я])|мне\s+(?:поставили|диагностировали|тяжело)|я\s+(?:живу|страдаю|подозреваю|боюсь)|не\s+(?:знаю|понимаю)\s+что\s+делать|как\s+(?:жить|справиться|справляться|лечить|пережить)|нужна\s+помощь|помогите|подскажите|кто\s+сталкивался)/i;
const NEGATED_DIAGNOSIS = /(?:у\s+меня\s+нет|не\s+страдаю)\s+(?:окр|птср|нрл|прл)(?=$|[^\p{L}\p{N}])/iu;

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .trim();
}

function hasDirectRequest(t) {
  if (DIRECT_PHRASE.test(t)) return true;

  const specialists = [...t.matchAll(SPECIALIST)];
  const requests = [...t.matchAll(DIRECT_CUE)];

  // A cue and a specialist must be close together. This prevents a request
  // about employment, for example, from matching an unrelated psychologist
  // reference elsewhere in a long post.
  return specialists.some(s => requests.some(r => {
    if (Math.abs(s.index - r.index) > 100) return false;
    const between = t.slice(
      Math.min(s.index, r.index),
      Math.max(s.index, r.index)
    );
    // Mentions in different sentences are not a request to find a specialist.
    return !/[.!?\n]/.test(between);
  }));
}

function category(text) {
  const t = normalize(text);
  if (!t || REJECTION.test(t) || PROMOTION.some(r => r.test(t))) return null;

  if (hasDirectRequest(t)) return "Прямой запрос";

  if (PROBLEMS.some(p => t.includes(normalize(p)) &&
      (!CONTEXTUAL_PROBLEMS.has(p) || PERSONAL_CONTEXT.test(t) || DISTRESS.test(t)))) {
    return "Потенциальный запрос";
  }

  if (ABBREVIATION.test(t) && PERSONAL_CONTEXT.test(t) &&
      !NEGATED_DIAGNOSIS.test(t)) {
    return "Потенциальный запрос";
  }

  return null;
}

function parsePost(raw) {
  // Apify keyword search returns replies even when "Replies per post URL" = 0.
  // Require an explicit "original post" flag; missing metadata is not safe.
  if (raw?.is_reply !== false || raw?.is_paid_partnership === true) return null;
  if (typeof raw?.text !== "string" || typeof raw?.url !== "string") {
    return null;
  }

  const text = raw.text.trim();
  const kind = category(text);
  if (!kind) return null;

  // No hard raw.language gate: detection can misclassify short Russian posts.
  // The Russian-language matching rules above provide a contextual filter.

  const timestamp = Date.parse(raw.published_at || "");
  const now = Date.now();
  if (!Number.isFinite(timestamp) || timestamp > now + 300000 ||
      now - timestamp > TWO_HOURS) return null;

  let url;
  try {
    url = new URL(raw.url);
    if (url.protocol !== "https:" || ![
      "threads.com", "www.threads.com", "threads.net", "www.threads.net"
    ].includes(url.hostname.toLowerCase())) return null;
    url.search = "";
    url.hash = "";
  } catch {
    return null;
  }

  const author = String(
    raw.user?.username || raw.username || raw.author_username || ""
  ).replace(/^@/, "").slice(0, 60);

  return {
    id: url.toString(),
    url: url.toString(),
    excerpt: text.replace(/\s+/g, " ").slice(0, 240),
    author,
    published: new Date(timestamp).toISOString()
  };
}

async function ingestWebhook(payload, env) {
  if (payload?.eventType !== "ACTOR.RUN.SUCCEEDED") {
    return { ignored: true };
  }

  const datasetId = payload?.resource?.defaultDatasetId;
  if (typeof datasetId !== "string" ||
      !/^[a-zA-Z0-9]{10,40}$/.test(datasetId)) {
    throw new Error("Missing Apify dataset ID");
  }

  const response = await fetch(
    `https://api.apify.com/v2/datasets/${datasetId}/items?format=json&limit=100`,
    { headers: { Authorization: `Bearer ${env.APIFY_API_TOKEN}` } }
  );
  if (!response.ok) throw new Error(`Apify API returned ${response.status}`);

  const items = await response.json();
  if (!Array.isArray(items)) throw new Error("Unexpected Apify dataset");

  let queued = 0;
  for (const item of items) {
    const p = parsePost(item);
    if (!p) continue;

    const result = await env.DB.prepare(
      `INSERT OR IGNORE INTO posts_queue
       (post_id, post_url, excerpt, author,
        published_at, queued_at, sent_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL)`
    ).bind(p.id, p.url, p.excerpt, p.author, p.published, Date.now()).run();

    queued += result.meta?.changes || 0;
  }

  return { fetched: items.length, queued };
}

async function sendTelegram(env, message) {
  const response = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text: message,
        disable_web_page_preview: true
      })
    }
  );

  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok) {
    throw new Error(`Telegram sendMessage failed (${response.status})`);
  }
}

async function digest(env) {
  const now = Date.now();
  await env.DB.prepare(
    "DELETE FROM posts_queue WHERE queued_at < ?"
  ).bind(now - 7 * 24 * 3600000).run();

  const data = await env.DB.prepare(
    `SELECT post_id, post_url, excerpt, author
     FROM posts_queue
     WHERE sent_at IS NULL
     ORDER BY queued_at ASC
     LIMIT 100`
  ).all();

  // Recheck pending records at send time, including records queued by an
  // earlier version of the Worker. D1 doesn't store is_reply, so previously
  // queued replies cannot be reliably distinguished here (see deployment note).
  const posts = (data.results || [])
    .map(p => ({ ...p, kind: category(p.excerpt) }))
    .filter(p => p.kind !== null)
    .sort((a, b) =>
      (a.kind === "Прямой запрос" ? 0 : 1) -
      (b.kind === "Прямой запрос" ? 0 : 1)
    )
    .slice(0, MAX_PER_DIGEST);

  if (!posts.length) return;

  const reservation = await env.DB.prepare(
    `UPDATE notification_control
     SET last_attempt_at = ?
     WHERE name = 'telegram_digest'
       AND (last_attempt_at IS NULL OR last_attempt_at <= ?)`
  ).bind(now, now - THIRTY_MINUTES).run();
  if (reservation.meta?.changes !== 1) return;

  const lines = [`Threads — подходящие публикации (${posts.length})`];
  for (const [i, post] of posts.entries()) {
    lines.push(
      `\n${i + 1}. ${post.kind}\n` +
      `${post.excerpt}\n` +
      `${post.author ? "@" + post.author + "\n" : ""}` +
      post.post_url
    );
  }

  try {
    await sendTelegram(env, lines.join("\n"));
  } catch (error) {
    await env.DB.prepare(
      `UPDATE notification_control
       SET last_attempt_at = ?
       WHERE name = 'telegram_digest' AND last_attempt_at = ?`
    ).bind(now - THIRTY_MINUTES, now).run();
    throw error;
  }

  const keys = posts.map(() => "?").join(",");
  await env.DB.prepare(
    `UPDATE posts_queue SET sent_at = ? WHERE post_id IN (${keys})`
  ).bind(Date.now(), ...posts.map(p => p.post_id)).run();
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);

    if (request.method === "GET" && pathname === "/health") {
      return new Response("OK");
    }
    if (request.method !== "POST" || pathname !== "/apify-webhook") {
      return new Response("Not found", { status: 404 });
    }
    if (!env.WEBHOOK_SECRET ||
        request.headers.get("X-Webhook-Secret") !== env.WEBHOOK_SECRET) {
      return new Response("Forbidden", { status: 403 });
    }

    try {
      const result = await ingestWebhook(await request.json(), env);
      return Response.json({ ok: true, ...result });
    } catch (error) {
      console.error("Apify webhook error", error.message);
      return new Response("Webhook processing failed", { status: 502 });
    }
  },

  async scheduled(_event, env) {
    await digest(env);
  }
};

// Named exports enable local regression tests; Cloudflare uses default export.
export { category, parsePost };
