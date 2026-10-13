import 'dotenv/config';
import WebSocket from 'ws';
import wrtc from '@roamhq/wrtc';
import { spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const API = 'https://api.vsync.lat';
const TOKEN = process.env.VSYNC_BOT_TOKEN;
const PYTHON = process.env.PYTHON_PATH || (process.platform === 'win32' ? 'python' : 'python3');
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const TEXT_CHANNEL_ONLY = (process.env.TTS_TEXT_CHANNEL_ID || '').trim();
const MAX_CHARS = Math.max(80, Math.min(600, Number(process.env.TTS_MAX_CHARS || 280)));
const requestedSpeed = Number(process.env.TTS_SPEED || '1.30');
const TTS_SPEED = Number.isFinite(requestedSpeed) ? Math.max(1.0, Math.min(1.5, requestedSpeed)) : 1.20;
const requestedQueueLimit = Number(process.env.TTS_QUEUE_LIMIT || '5');
const TTS_QUEUE_LIMIT = Number.isFinite(requestedQueueLimit) ? Math.max(3, Math.min(80, Math.floor(requestedQueueLimit))) : 12;
const requestedIdleMinutes = Number(process.env.TTS_IDLE_LEAVE_MINUTES || '5');
const TTS_IDLE_LEAVE_MINUTES = Number.isFinite(requestedIdleMinutes) ? Math.max(1, Math.min(240, requestedIdleMinutes)) : 5;
const TTS_IDLE_LEAVE_MS = TTS_IDLE_LEAVE_MINUTES * 60_000;
const FRAME_SAMPLES = 480; // 10 ms de áudio em 48 kHz mono
const FRAME_BYTES = FRAME_SAMPLES * 2; // PCM signed 16-bit
const ROOT_DIR = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_FILE = path.join(ROOT_DIR, 'data', 'config.json');
const TTS_ACL_ADMIN_USER_IDS = parseIdSet(process.env.TTS_ACL_ADMIN_USER_IDS || '');
const TTS_ACL_ADMIN_ROLE_IDS = parseIdSet(process.env.TTS_ACL_ADMIN_ROLE_IDS || '');
const memberRoleCache = new Map(); // guildId:userId -> { at, roles }
const roleLookupWarnings = new Map();

if (!TOKEN || TOKEN === 'COLE_SEU_TOKEN_AQUI') {
  console.error('Configure VSYNC_BOT_TOKEN no arquivo .env antes de iniciar.');
  process.exit(1);
}

const VOICES = {
  francisca: { name: 'Francisca', gender: 'feminina', id: 'pt-BR-FranciscaNeural' },
  brenda:    { name: 'Brenda', gender: 'feminina', id: 'pt-BR-BrendaNeural' },
  elza:      { name: 'Elza', gender: 'feminina', id: 'pt-BR-ElzaNeural' },
  giovanna:  { name: 'Giovanna', gender: 'feminina', id: 'pt-BR-GiovannaNeural' },
  leticia:   { name: 'Letícia', gender: 'feminina', id: 'pt-BR-LeticiaNeural' },
  manuela:   { name: 'Manuela', gender: 'feminina', id: 'pt-BR-ManuelaNeural' },
  thalita:   { name: 'Thalita', gender: 'feminina', id: 'pt-BR-ThalitaNeural' },
  mita:      { name: 'Mita (Português BR · Fish Audio)', gender: 'feminina', id: 'fish:ea3bf7f7c7af4b59be4715013e1c4428' },
  nobara:    { name: 'Nobara (Português · Fish Audio)', gender: 'feminina', id: 'fish:12beaca044c547bdbc90d346ce248798' },
  goldship:  { name: 'Goldship (Fish Audio)', gender: 'feminina', id: 'fish:4b7229e0fe634f8ab83eb6ba31f7c845' },
  brainrot:  { name: 'Steal a Brainrot (Fish Audio)', gender: 'masculina', id: 'fish:1e17dc57eaba4f27ac3ee8d50cb8d040' },
  toph:      { name: 'Toph Beifong (Fish Audio)', gender: 'feminina', id: 'fish:991f22b7fae049dab2f279c65f1b7715' },
  yumeko:    { name: 'Yumeko (Fish Audio)', gender: 'feminina', id: 'fish:f6541f6ac4924eab967b2bd32621e3d2' },
  saga:      { name: 'Saga de Gêmeos (Fish Audio)', gender: 'masculina', id: 'fish:ccb99b3f77864ef28e1212f1d939024c' },
  miku:      { name: 'Hatsune Miku (Fish Audio)', gender: 'feminina', id: 'fish:a2e2bed323bd4a3a88e9b05117a4ba73' },
  kobayashi: { name: 'Kobayashi (Fish Audio)', gender: 'feminina', id: 'fish:2558cde63fef4d15b9ee2acc5ae59d66' },
  bolsonaro: { name: 'Bolsonaro (Fish Audio)', gender: 'masculina', id: 'fish:ebbfcf7d5e8f41d99bdcb80348bc0e5c' },
  sukuna:    { name: 'Sukuna (Fish Audio)', gender: 'masculina', id: 'fish:3a164c7d00b2437682042ebd01755521' },
  corazon:   { name: 'Corazon (Fish Audio)', gender: 'masculina', id: 'fish:b56cd01dd9d34cd5b2aaf893dd8f5d63' },
  tengen:    { name: 'Narrador Tengen de JJK (Fish Audio)', gender: 'feminina', id: 'fish:adcc1e7a98514541a15a4b256e220645' },
  kaiser:    { name: 'Kaiser (Fish Audio)', gender: 'masculina', id: 'fish:c8f774deff58482a872fbfb67e88f7ca' },
  rick:      { name: 'Rick (Fish Audio)', gender: 'masculina', id: 'fish:18a909f443c643a5b49c7b39f77fb201' },
  morty:     { name: 'Morty (Fish Audio)', gender: 'masculina', id: 'fish:1e82d6a51def409792b9be325524ce0a' },
  peridot:  { name: 'Peridot (Steven Universe · Fish Audio)', gender: 'feminina', id: 'fish:9b11ae0dfcc4495a807bf753f89db6f1' },
  mu:       { name: 'Mu de Áries (Saint Seiya · Fish Audio)', gender: 'masculina', id: 'fish:1fb89a91a42542c18ffd871d4fcf1cd3' },
  gojo:     { name: 'Satoru Gojo (Jujutsu Kaisen · Fish Audio)', gender: 'masculina', id: 'fish:e653fc010599474789d4c6773ed1b587' },
  naoya:    { name: 'Naoya Zenin (Jujutsu Kaisen · Fish Audio)', gender: 'masculina', id: 'fish:476f426980c74ae4948eb0737ac9a9e7' },
  luffy:    { name: 'Monkey D. Luffy (One Piece · Fish Audio)', gender: 'masculina', id: 'fish:648e3798c86647ce9efc139c5aa112b9' },
  garnet:   { name: 'Garnet (Steven Universe · Fish Audio)', gender: 'feminina', id: 'fish:610032baf9044fff94f275aad2d16509' },
  brasileira:{ name: 'Português BR Feminina (TikTok)', gender: 'feminina', id: 'tiktok:br_001' },
  lhays:     { name: 'Lhays Macedo (Portugal)', gender: 'feminina', id: 'tiktok:pt_female_lhays' },
  antonio:   { name: 'Antônio', gender: 'masculina', id: 'pt-BR-AntonioNeural' },
  donato:    { name: 'Donato', gender: 'masculina', id: 'pt-BR-DonatoNeural' },
  fabio:     { name: 'Fábio', gender: 'masculina', id: 'pt-BR-FabioNeural' },
  humberto:  { name: 'Humberto', gender: 'masculina', id: 'pt-BR-HumbertoNeural' },
  julio:     { name: 'Júlio', gender: 'masculina', id: 'pt-BR-JulioNeural' },
  nicolau:   { name: 'Nicolau', gender: 'masculina', id: 'pt-BR-NicolauNeural' },
  thiago:    { name: 'Thiago', gender: 'masculina', id: 'pt-BR-ThiagoNeural' },
};
const RANDOM_VOICES = Object.keys(VOICES);

// Tags curtas de interpretação para TODAS as vozes Fish Audio do bot.
// O S2.1 entende tags inline; preferimos tags simples para não confundir o texto falado.
const FISH_VOICE_STYLES = {
  mita: 'cheerful', nobara: 'confident', goldship: 'playful',
  brainrot: 'excited', toph: 'confident', yumeko: 'playful',
  saga: 'dramatic', miku: 'cheerful', kobayashi: 'calm',
  bolsonaro: 'confident', sukuna: 'angry', corazon: 'gentle',
  tengen: 'dramatic', kaiser: 'confident',
  rick: 'sarcastic', morty: 'nervous', peridot: 'curious', mu: 'confident',
  gojo: 'confident', naoya: 'arrogant', luffy: 'excited', garnet: 'confident',
};

function addFishIntonation(text, voice) {
  if (!voice?.id?.startsWith('fish:')) return text;
  const clean = String(text ?? '').trim();
  if (!clean) return '';

  const voiceKey = Object.keys(VOICES).find((key) => VOICES[key].id === voice.id);
  const baseStyle = FISH_VOICE_STYLES[voiceKey] || 'expressive';

  // Modo especial para a fala de "Explosão Galáctica": direção inline em
  // crescendo, terminando em um grito sustentado. As tags não fazem parte
  // do texto que o bot publica no chat; são enviadas apenas ao Fish Audio S2.
  const hasGalacticExplosion = /explos[aã]o\s+gal[aá]ctica/iu.test(clean);
  if (hasGalacticExplosion) {
    let guided = clean;
    guided = guided.replace(
      /^(\s*seres malignos[^,;.!?]*[,;]?)/iu,
      '[deep, ominous, theatrical anime villain voice, slowly building tension] $1',
    );
    guided = guided.replace(
      /\b(ouçam\s+bem!*)/iu,
      '[commanding, forceful shout, projecting voice] $1',
    );
    guided = guided.replace(
      /\b(ouçam\s+a\s+explosão\s+das\s+estrelas\s+da\s+galáxia\s+colidindo!*)/iu,
      '[shouting, rising volume, building energy and intensity] $1',
    );
    guided = guided.replace(
      /\b(explos[aã]o\s+gal[aá]ctica)(!*)/iu,
      '[long pause] [inhale] [full-throated screaming, maximum intensity, sustained anime battle cry] [screaming] [shouting] [volume up] [emphasis] $1$2',
    );
    return guided;
  }

  const sentences = clean.split(/(?<=[.!?~…])\s+/u);
  const styledSentences = sentences.map((sentence) => {
    if (!sentence.trim()) return sentence;
    const spoken = sentence.trim();
    const letters = spoken.match(/\p{L}/gu) || [];
    const upperLetters = spoken.match(/\p{Lu}/gu) || [];
    const mostlyUppercase = letters.length >= 5 && (upperLetters.length / letters.length) >= 0.85;
    const endsWithExclamation = /!+\s*$/u.test(spoken);

    let tagText;
    if ((mostlyUppercase && endsWithExclamation) || /!{2,}\s*$/u.test(spoken)) {
      tagText = '[shouting] [excited] [loud voice]';
    } else if (/\b(odeio|raiva|idiota|burro|inferno|desgraça|cala a boca|que saco)\b/i.test(spoken)) {
      tagText = '[angry]';
    } else if (/(kkkk+|hahaha+|rsrs+|\blol\b|\bmds kkk)/i.test(spoken)) {
      tagText = '[laughing]';
    } else if (/\b(triste|saudade|perdi|acabou|desculpa|sinto muito)\b/i.test(spoken)) {
      tagText = '[sad]';
    } else if (/[!?]{2,}$/u.test(spoken)) {
      tagText = '[surprised] [shouting]';
    } else if (/!\s*$/u.test(spoken)) {
      tagText = '[excited]';
    } else if (/\?\s*$/u.test(spoken)) {
      tagText = '[curious]';
    } else if (/~\s*$/u.test(spoken)) {
      tagText = '[playful]';
    } else if (/(?:\.\.\.|…)$/u.test(spoken)) {
      tagText = '[hesitant]';
    } else {
      tagText = `[${baseStyle}]`;
    }

    const spokenWithPauses = spoken.replace(/,(\s*)(?=\S)/gu, ', [short pause] ');
    let result = `${tagText} ${spokenWithPauses}`;
    if (/\.$/u.test(spoken)) result += ' [short pause]';
    return result;
  });
  return styledSentences.join(' ');
}

const headers = {
  Authorization: `Bot ${TOKEN}`,
  'Content-Type': 'application/json',
};

const configs = new Map();            // guildId -> { enabled, voice }
const voiceSessions = new Map();      // guildId -> { channelId, peers: Map(connId, peer) }
const guildSnapshotCache = new Map(); // guildId -> { at, data }
const queues = new Map();             // guildId -> { items: [], running: boolean }
const lastJoinAt = new Map();
const idleLeaveTimers = new Map(); // guildId -> timeout; leave voice after TTS inactivity
let ws;
let heartbeat;
let reconnectDelay = 1000;
let botAccountId = null;
let appId = null;
let iceServers = [];
let stopping = false;

function parseIdSet(value) {
  return new Set(String(value || '').split(/[\s,;]+/).map((part) => part.trim()).filter(Boolean));
}

// Limita caches temporários para não acumularem indefinidamente em servidores ativos.
function pruneTimedCache(cache, maxSize, maxAgeMs) {
  const now = Date.now();
  for (const [key, value] of cache) {
    const at = typeof value === 'number' ? value : value?.at;
    if (Number.isFinite(at) && now - at > maxAgeMs) cache.delete(key);
  }
  while (cache.size > maxSize) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey === undefined) break;
    cache.delete(oldestKey);
  }
}

function normalizeRoleIds(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map((item) => {
      if (typeof item === 'string' || typeof item === 'number') return String(item);
      if (item && typeof item === 'object') {
        const id = item.id ?? item.roleId ?? item.role_id;
        return id == null ? '' : String(id);
      }
      return '';
    }).filter(Boolean))];
  }
  if (value && typeof value === 'object') {
    if (value.id != null || value.roleId != null || value.role_id != null) {
      return [String(value.id ?? value.roleId ?? value.role_id)];
    }
    return Object.entries(value).filter(([, enabled]) => enabled === true).map(([id]) => String(id));
  }
  return [];
}

function rolesFromObject(object) {
  if (!object || typeof object !== 'object') return null;
  const candidates = [
    object.member?.roleIds, object.member?.role_ids, object.member?.roles,
    object.author?.member?.roleIds, object.author?.member?.role_ids, object.author?.member?.roles,
    object.author?.roleIds, object.author?.role_ids, object.author?.roles,
    object.data?.member?.roleIds, object.data?.member?.role_ids, object.data?.member?.roles,
    object.data?.roleIds, object.data?.role_ids, object.data?.roles,
    object.roleIds, object.role_ids, object.roles,
  ];
  for (const candidate of candidates) {
    if (candidate !== undefined && candidate !== null) return normalizeRoleIds(candidate);
  }
  return null;
}

function rolePolicy(guildId) {
  const config = configFor(guildId);
  const whitelistRoleIds = normalizeRoleIds(config.whitelistRoleIds);
  const blacklistRoleIds = normalizeRoleIds(config.blacklistRoleIds);
  return { whitelistRoleIds, blacklistRoleIds };
}

function rolePolicyDescription(guildId) {
  const { whitelistRoleIds, blacklistRoleIds } = rolePolicy(guildId);
  const formatRoles = (ids) => ids.length ? ids.map((id) => `<@&${id}>`).join(', ') : 'nenhum';
  const whitelist = whitelistRoleIds.length
    ? formatRoles(whitelistRoleIds)
    : 'desativada — todos podem falar, exceto cargos bloqueados';
  const blacklist = formatRoles(blacklistRoleIds);
  return `🔐 **REGRAS DE FALA**\n✅ **Permitidos:** ${whitelist}\n⛔ **Bloqueados:** ${blacklist}\n\nA lista de bloqueio sempre tem prioridade.`;
}

async function memberRoleIds(guildId, userId, message = null) {
  const embedded = rolesFromObject(message);
  if (embedded !== null) return embedded;

  pruneTimedCache(memberRoleCache, 1000, 10_000);
  const cacheKey = `${guildId}:${userId}`;
  const cached = memberRoleCache.get(cacheKey);
  if (cached && Date.now() - cached.at < 10_000) return cached.roles;

  // A VSync pode incluir cargos no MESSAGE_CREATE; se não incluir, consulta o endpoint de membro.
  try {
    const result = await apiFetch(`/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(userId)}`);
    const ids = rolesFromObject(result) ?? rolesFromObject(result?.member) ?? rolesFromObject(result?.data);
    if (ids !== null) {
      memberRoleCache.set(cacheKey, { at: Date.now(), roles: ids });
      return ids;
    }
  } catch (err) {
    // O acesso ao endpoint de membros pode variar conforme permissões/API; tentamos o snapshot abaixo.
  }

  try {
    const snapshot = await getGuildSnapshot(guildId);
    const members = snapshot?.members || snapshot?.guild?.members || snapshot?.data?.members || [];
    const member = Array.isArray(members)
      ? members.find((item) => String(item?.userId ?? item?.user_id ?? item?.id ?? item?.user?.id ?? '') === String(userId))
      : (members && typeof members === 'object' ? members[userId] : null);
    const ids = rolesFromObject(member);
    if (ids !== null) {
      memberRoleCache.set(cacheKey, { at: Date.now(), roles: ids });
      return ids;
    }
  } catch (err) {
    // O bloqueio abaixo será fail-closed quando ACL estiver configurada.
  }

  memberRoleCache.set(cacheKey, { at: Date.now(), roles: null });
  return null;
}

function permissionNameIsAdmin(value) {
  const normalized = String(value ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  return [
    'ADMIN', 'ADMINISTRATOR', 'ADMINISTRATOR_PERMISSION', 'SERVER_ADMIN',
    'GUILD_ADMIN', 'MANAGE_GUILD', 'MANAGE_SERVER', 'MANAGE_SERVERS',
  ].includes(normalized);
}

function permissionValueHasAdmin(value, depth = 0) {
  if (depth > 5 || value == null) return false;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number' || typeof value === 'bigint') {
    try { return (BigInt(value) & 8n) === 8n; } catch { return false; }
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return false;
    if (permissionNameIsAdmin(trimmed)) return true;
    if (/[\s,|]/.test(trimmed)) {
      return trimmed.split(/[\s,|]+/).some((part) => permissionNameIsAdmin(part));
    }
    // A VSync role may expose Discord-compatible permission bitmasks as strings.
    if (/^\d+$/.test(trimmed)) {
      try { return (BigInt(trimmed) & 8n) === 8n; } catch { return false; }
    }
    return false;
  }
  if (Array.isArray(value)) return value.some((item) => {
    if (typeof item === 'string') return permissionNameIsAdmin(item);
    return permissionValueHasAdmin(item, depth + 1);
  });
  if (typeof value === 'object') {
    const explicitAdminKeys = [
      'administrator', 'isAdministrator', 'is_administrator', 'admin', 'isAdmin', 'is_admin',
      'serverAdmin', 'server_admin', 'manageGuild', 'manage_guild', 'manageServer', 'manage_server',
    ];
    for (const key of explicitAdminKeys) {
      const candidate = value[key];
      if (candidate === true || candidate === 1 || candidate === 'true') return true;
    }
    for (const key of ['permissions', 'permission', 'permissionFlags', 'permission_flags', 'flags', 'values']) {
      if (value[key] !== undefined && permissionValueHasAdmin(value[key], depth + 1)) return true;
    }
    // Permission maps may be shaped as { ADMINISTRATOR: true }.
    for (const [key, candidate] of Object.entries(value)) {
      if (permissionNameIsAdmin(key) && (candidate === true || candidate === 1 || candidate === 'true')) return true;
    }
  }
  return false;
}

function objectExplicitlyMarksOwnerOrAdmin(object) {
  if (!object || typeof object !== 'object') return false;
  for (const key of ['isOwner', 'is_owner', 'owner', 'isAdmin', 'is_admin', 'administrator', 'isAdministrator', 'is_administrator']) {
    const value = object[key];
    if (value === true || value === 1 || value === 'true') return true;
  }
  for (const key of ['permissions', 'permission', 'permissionFlags', 'permission_flags', 'guildPermissions', 'guild_permissions']) {
    if (object[key] !== undefined && permissionValueHasAdmin(object[key])) return true;
  }
  return false;
}

function messageHasAdminPermission(message) {
  const candidates = [
    message, message?.member, message?.author, message?.author?.member,
    message?.data, message?.data?.member, message?.data?.author,
    message?.data?.author?.member,
  ];
  return candidates.some((candidate) => objectExplicitlyMarksOwnerOrAdmin(candidate));
}

function unwrapRoleDefinitions(snapshot) {
  const candidates = [
    snapshot?.roles, snapshot?.guild?.roles, snapshot?.data?.roles,
    snapshot?.guild?.data?.roles,
  ];
  for (const value of candidates) {
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') {
      const nested = value.roles ?? value.items ?? value.data;
      if (Array.isArray(nested)) return nested;
      return Object.entries(value).map(([id, role]) => role && typeof role === 'object' ? { id: role.id ?? id, ...role } : null).filter(Boolean);
    }
  }
  return [];
}

function isMessageAuthorGuildOwner(snapshot, authorId) {
  const candidateObjects = [snapshot, snapshot?.guild, snapshot?.data, snapshot?.data?.guild];
  for (const object of candidateObjects) {
    if (!object || typeof object !== 'object') continue;
    const rawOwner = object.ownerId ?? object.owner_id ?? object.ownerUserId ?? object.owner_user_id ?? object.ownerAccountId ?? object.owner_account_id;
    if (rawOwner != null && String(rawOwner) === String(authorId)) return true;
    const owner = object.owner;
    if ((typeof owner === 'string' || typeof owner === 'number') && String(owner) === String(authorId)) return true;
    if (owner && typeof owner === 'object' && String(owner.id ?? owner.userId ?? owner.user_id ?? '') === String(authorId)) return true;
  }
  return false;
}

async function isAclAdmin(message) {
  const guildId = String(message.guildId || '');
  const authorId = String(message.authorId || '');

  // Bot owner can always manage ACLs; optional .env overrides remain available.
  if (TTS_ACL_ADMIN_USER_IDS.has(authorId)) return true;
  if (messageHasAdminPermission(message)) return true;

  const memberRoles = await memberRoleIds(guildId, authorId, message);
  if (TTS_ACL_ADMIN_ROLE_IDS.size && Array.isArray(memberRoles) && memberRoles.some((id) => TTS_ACL_ADMIN_ROLE_IDS.has(id))) {
    return true;
  }

  // Most servers include owner/role definitions in the guild snapshot. This makes
  // each server's own owner/admins capable of editing only that server's lists.
  try {
    const snapshot = await getGuildSnapshot(guildId, true);
    if (isMessageAuthorGuildOwner(snapshot, authorId)) return true;

    const memberCandidates = [
      snapshot?.members, snapshot?.guild?.members, snapshot?.data?.members,
      snapshot?.guild?.data?.members,
    ];
    let member = null;
    for (const collection of memberCandidates) {
      if (Array.isArray(collection)) {
        member = collection.find((item) => String(item?.userId ?? item?.user_id ?? item?.id ?? item?.user?.id ?? '') === authorId);
      } else if (collection && typeof collection === 'object') {
        member = collection[authorId] || null;
      }
      if (member) break;
    }
    if (objectExplicitlyMarksOwnerOrAdmin(member)) return true;

    const roles = Array.isArray(memberRoles) ? memberRoles : (rolesFromObject(member) || []);
    if (roles.length) {
      const definitions = unwrapRoleDefinitions(snapshot);
      const adminRoleIds = definitions
        .filter((role) => permissionValueHasAdmin(role))
        .map((role) => String(role.id ?? role.roleId ?? role.role_id ?? ''))
        .filter(Boolean);
      if (roles.some((id) => adminRoleIds.includes(String(id)))) return true;

      // If role definitions are not part of the guild snapshot, try the roles endpoint.
      if (!definitions.length) {
        try {
          const result = await apiFetch(`/guilds/${encodeURIComponent(guildId)}/roles`);
          const externalRoles = Array.isArray(result) ? result : (result?.roles || result?.data?.roles || result?.data || []);
          if (Array.isArray(externalRoles)) {
            const ids = externalRoles
              .filter((role) => permissionValueHasAdmin(role))
              .map((role) => String(role.id ?? role.roleId ?? role.role_id ?? ''))
              .filter(Boolean);
            if (roles.some((id) => ids.includes(String(id)))) return true;
          }
        } catch {
          // Some VSync deployments don't expose a roles endpoint; deny unless another check passed.
        }
      }
    }
  } catch {
    // Fail closed: inability to confirm admin rights must never grant ACL editing.
  }
  return false;
}

async function canSpeakByRolePolicy(message) {
  const { whitelistRoleIds, blacklistRoleIds } = rolePolicy(message.guildId);
  if (!whitelistRoleIds.length && !blacklistRoleIds.length) return true;

  const roles = await memberRoleIds(message.guildId, message.authorId, message);
  if (!Array.isArray(roles)) {
    pruneTimedCache(roleLookupWarnings, 100, 60_000);
    const key = String(message.guildId);
    if (Date.now() - (roleLookupWarnings.get(key) || 0) > 15_000) {
      roleLookupWarnings.set(key, Date.now());
      console.warn(`[ACL ${key}] não consegui consultar os cargos do autor; mensagem bloqueada por segurança. Confira acesso do bot ao endpoint de membros.`);
    }
    return false;
  }

  if (roles.some((id) => blacklistRoleIds.includes(id))) {
    console.log(`[ACL ${message.guildId}] mensagem não falada: autor tem cargo na blacklist.`);
    return false;
  }
  if (whitelistRoleIds.length && !roles.some((id) => whitelistRoleIds.includes(id))) {
    console.log(`[ACL ${message.guildId}] mensagem não falada: autor não tem cargo na whitelist.`);
    return false;
  }
  return true;
}

async function handleRoleAclCommand(message, lower) {
  const body = String(message.body || '').trim();
  const parts = body.split(/\s+/);
  const command = String(parts[1] || '').toLowerCase();
  const guildId = message.guildId;
  const channelId = message.channelId;
  if (!guildId || !channelId) return true;

  // Comandos curtos recomendados:
  // !tts permitir @cargo / !tts tirar @cargo
  // !tts bloquear @cargo / !tts desbloquear @cargo
  // !tts limpar permitidos / !tts limpar bloqueados
  let group = command;
  let action = String(parts[2] || '').toLowerCase();
  let roleArgument = parts.slice(3).join(' ').trim();

  if (['roles', 'cargos', 'acesso'].includes(command)) {
    await sayInTextChannel(guildId, channelId,
      `${rolePolicyDescription(guildId)}\n\n**Gerenciar cargos (admin):**\n` +
      '`!tts permitir @Cargo` — permitir falar\n' +
      '`!tts tirar @Cargo` — remover dos permitidos\n' +
      '`!tts bloquear @Cargo` — bloquear falar\n' +
      '`!tts desbloquear @Cargo` — remover dos bloqueados\n' +
      '`!tts limpar permitidos` ou `!tts limpar bloqueados` — limpar uma lista.');
    return true;
  }

  if (['whitelist', 'blacklist'].includes(command) && (!parts[2] || ['list', 'lista', 'listar'].includes(action))) {
    await sayInTextChannel(guildId, channelId, rolePolicyDescription(guildId) + '\n\nUse `!tts cargos` para ver os comandos simplificados.');
    return true;
  }

  if (command === 'permitir') {
    group = 'whitelist'; action = 'add'; roleArgument = parts.slice(2).join(' ').trim();
  } else if (['tirar', 'despermitir', 'remover-permissao'].includes(command)) {
    group = 'whitelist'; action = 'remove'; roleArgument = parts.slice(2).join(' ').trim();
  } else if (command === 'bloquear') {
    group = 'blacklist'; action = 'add'; roleArgument = parts.slice(2).join(' ').trim();
  } else if (['desbloquear', 'liberar-bloqueio'].includes(command)) {
    group = 'blacklist'; action = 'remove'; roleArgument = parts.slice(2).join(' ').trim();
  } else if (command === 'limpar') {
    const target = String(parts[2] || '').toLowerCase();
    if (['permitidos', 'permitido', 'whitelist', 'permitir'].includes(target)) group = 'whitelist';
    else if (['bloqueados', 'bloqueado', 'blacklist', 'bloquear'].includes(target)) group = 'blacklist';
    else {
      await sayInTextChannel(guildId, channelId, 'Escolha qual lista limpar: `!tts limpar permitidos` ou `!tts limpar bloqueados`.');
      return true;
    }
    action = 'clear';
  }

  if (!['whitelist', 'blacklist'].includes(group)) return false;

  if (!['add', 'adicionar', 'remove', 'remover', 'clear', 'limpar'].includes(action)) {
    await sayInTextChannel(guildId, channelId,
      'Use um comando curto:\n`!tts permitir @Cargo`\n`!tts tirar @Cargo`\n`!tts bloquear @Cargo`\n`!tts desbloquear @Cargo`\n`!tts limpar permitidos`\n`!tts limpar bloqueados`');
    return true;
  }

  // Viewing is allowed to everyone; changes require server owner/admin.
  if (!(await isAclAdmin(message))) {
    await sayInTextChannel(guildId, channelId, '🔒 Só o dono do servidor ou um administrador pode editar essas listas. Você pode consultar com `!tts cargos`.');
    return true;
  }

  const config = configFor(guildId);
  const listKey = group === 'whitelist' ? 'whitelistRoleIds' : 'blacklistRoleIds';
  const listName = group === 'whitelist' ? 'permitidos' : 'bloqueados';

  if (['clear', 'limpar'].includes(action)) {
    config[listKey] = [];
    await saveConfigs();
    await sayInTextChannel(guildId, channelId, `✅ Lista de ${listName} limpa.\n${rolePolicyDescription(guildId)}`);
    return true;
  }

  const mention = roleArgument.match(/<@&([^>]+)>/);
  const roleId = String(mention ? mention[1] : roleArgument).trim();
  if (!/^[A-Za-z0-9_-]{2,100}$/.test(roleId)) {
    await sayInTextChannel(guildId, channelId,
      `Mencione um cargo ou informe o ID dele. Exemplo: \`!tts ${group === 'whitelist' ? 'permitir' : 'bloquear'} @Cargo\`.`);
    return true;
  }

  const current = normalizeRoleIds(config[listKey]);
  if (['add', 'adicionar'].includes(action)) {
    if (!current.includes(roleId)) current.push(roleId);
    config[listKey] = current;
  } else {
    config[listKey] = current.filter((id) => id !== roleId);
  }
  await saveConfigs();
  const adding = ['add', 'adicionar'].includes(action);
  const verb = group === 'whitelist'
    ? (adding ? 'adicionado aos permitidos' : 'removido dos permitidos')
    : (adding ? 'adicionado aos bloqueados' : 'removido dos bloqueados');
  await sayInTextChannel(guildId, channelId, `✅ Cargo ${verb}: <@&${roleId}>\n${rolePolicyDescription(guildId)}`);
  return true;
}

async function loadConfigs() {
  try {
    const parsed = JSON.parse(await readFile(CONFIG_FILE, 'utf8'));
    for (const [guildId, value] of Object.entries(parsed)) {
      // A configuração precisa guardar a CHAVE da voz (ex.: 'antonio'), não
      // o objeto VOICES inteiro. Versões antigas podem ter salvo esse objeto;
      // migra também value.voice.key para não voltar sempre à voz Francisca.
      let savedVoice = typeof value?.voice === 'string'
        ? value.voice
        : (typeof value?.voice?.key === 'string' ? value.voice.key : '');
      // Algumas versões antigas salvaram o objeto {name, gender, id} em vez
      // da chave. Recupere a chave a partir do id/nome para preservar a escolha.
      if (!savedVoice && value?.voice && typeof value.voice === 'object') {
        const match = Object.entries(VOICES).find(([, definition]) =>
          (value.voice.id && definition.id === value.voice.id) ||
          (value.voice.name && definition.name === value.voice.name)
        );
        if (match) savedVoice = match[0];
      }
      // Preserva a antiga voz brasileira; Carlinhos agora migra para ela.
      const canonicalVoice = (key) => ({ carlinhos: 'brasileira', brasileira: 'brasileira', laizza: 'nobara', extra: 'kaiser', fish18a9: 'rick', fish1e82: 'morty', novavoz: 'peridot', nova: 'peridot', fish9b11: 'peridot', fish1fb89: 'mu', aries: 'mu', satoru: 'gojo', 'satoru gojo': 'gojo', 'gojo satoru': 'gojo', zenin: 'naoya', 'naoya zenin': 'naoya', 'zenin naoya': 'naoya', 'monkey d luffy': 'luffy', 'luffy': 'luffy', 'steven universe garnet': 'garnet' }[key] || key);
      if (savedVoice) savedVoice = canonicalVoice(savedVoice);
      // Suporte a configurações antigas que guardavam o objeto em vez da chave.
      if (!savedVoice && value?.voice && typeof value.voice === 'object') {
        if (value.voice.id === 'tiktok:br_001' || value.voice.name === 'Português BR Feminina (TikTok)') savedVoice = 'brasileira';
        if (value.voice.id === 'fish:3a94866ef48b43d19e71c390230657c0' || /carlinhos/i.test(value.voice.name || '')) savedVoice = 'brasileira';
        if (value.voice.id === 'tiktok:pt_female_laizza' || value.voice.name === 'Laizza (Portugal)') savedVoice = 'nobara';
      }
      const validSavedVoice = savedVoice === 'aleatoria' || Object.prototype.hasOwnProperty.call(VOICES, savedVoice);
      const rawUserVoices = value?.userVoices && typeof value.userVoices === 'object' && !Array.isArray(value.userVoices)
        ? value.userVoices
        : {};
      const migratedUserVoices = Object.fromEntries(Object.entries(rawUserVoices).map(([userId, userVoice]) => [userId, canonicalVoice(userVoice)]));
      const userVoices = Object.fromEntries(Object.entries(migratedUserVoices).filter(([userId, userVoice]) =>
        Boolean(userId) && (userVoice === 'aleatoria' || Object.prototype.hasOwnProperty.call(VOICES, userVoice))
      ));
      configs.set(guildId, {
        enabled: value?.enabled !== false,
        // A voz antiga fica como padrão do servidor para manter compatibilidade;
        // novos comandos de voz salvam apenas a preferência do usuário.
        voice: validSavedVoice ? savedVoice : 'francisca',
        userVoices,
        whitelistRoleIds: normalizeRoleIds(value?.whitelistRoleIds),
        blacklistRoleIds: normalizeRoleIds(value?.blacklistRoleIds),
        // Configurações por servidor. 'env' respeita TTS_TEXT_CHANNEL_ID do .env;
        // 'only' usa o canal definido pelo comando e 'all' libera todos os canais.
        textChannelMode: ['env', 'only', 'all'].includes(value?.textChannelMode) ? value.textChannelMode : 'env',
        textChannelId: typeof value?.textChannelId === 'string' ? value.textChannelId : '',
        speed: Number.isFinite(Number(value?.speed)) && Number(value.speed) >= 1 && Number(value.speed) <= 1.5 ? Number(value.speed) : TTS_SPEED,
        maxChars: Number.isFinite(Number(value?.maxChars)) && Number(value.maxChars) >= 80 && Number(value.maxChars) <= 600 ? Math.floor(Number(value.maxChars)) : MAX_CHARS,
        queueLimit: Number.isFinite(Number(value?.queueLimit)) && Number(value.queueLimit) >= 3 && Number(value.queueLimit) <= 80 ? Math.floor(Number(value.queueLimit)) : TTS_QUEUE_LIMIT,
      });
    }
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('Não consegui ler data/config.json:', err.message);
  }
}

async function saveConfigs() {
  const plain = Object.fromEntries(configs.entries());
  await mkdir(path.dirname(CONFIG_FILE), { recursive: true });
  await writeFile(CONFIG_FILE, JSON.stringify(plain, null, 2), 'utf8');
}

function configFor(guildId) {
  if (!configs.has(guildId)) configs.set(guildId, {
    enabled: true,
    voice: 'francisca',
    userVoices: {},
    whitelistRoleIds: [],
    blacklistRoleIds: [],
    textChannelMode: 'env',
    textChannelId: '',
    speed: TTS_SPEED,
    maxChars: MAX_CHARS,
    queueLimit: TTS_QUEUE_LIMIT,
  });
  const config = configs.get(guildId);
  if (!config.userVoices || typeof config.userVoices !== 'object' || Array.isArray(config.userVoices)) config.userVoices = {};
  if (!Array.isArray(config.whitelistRoleIds)) config.whitelistRoleIds = [];
  if (!Array.isArray(config.blacklistRoleIds)) config.blacklistRoleIds = [];
  if (!['env', 'only', 'all'].includes(config.textChannelMode)) config.textChannelMode = 'env';
  if (typeof config.textChannelId !== 'string') config.textChannelId = '';
  if (!Number.isFinite(config.speed) || config.speed < 1 || config.speed > 1.5) config.speed = TTS_SPEED;
  if (!Number.isFinite(config.maxChars) || config.maxChars < 80 || config.maxChars > 600) config.maxChars = MAX_CHARS;
  if (!Number.isFinite(config.queueLimit) || config.queueLimit < 3 || config.queueLimit > 80) config.queueLimit = TTS_QUEUE_LIMIT;
  return config;
}

async function apiFetch(route, options = {}) {
  const response = await fetch(`${API}${route}`, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) },
  });
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  if (!response.ok) {
    const message = body?.error || body?.message || response.statusText;
    throw new Error(`${response.status} ${route}: ${message}`);
  }
  return body;
}

async function sayInTextChannel(guildId, channelId, body) {
  try {
    await apiFetch(`/guilds/${encodeURIComponent(guildId)}/channels/${encodeURIComponent(channelId)}/messages`, {
      method: 'POST', body: JSON.stringify({ body }),
    });
  } catch (err) {
    console.warn('Não consegui responder no chat:', err.message);
  }
}

function sendGateway(payload) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}

function sendSignal(guildId, connId, data) {
  sendGateway({ op: 'voice_signal', to: connId, data });
}

function cleanText(body = '', maxChars = MAX_CHARS) {
  return String(body)
    // Links Markdown: mantém só o texto visível, nunca a URL.
    .replace(/\[([^\]]+)\]\((?:https?:\/\/)?[^)\s]+\)/gi, '$1')
    // URLs completas e links com www.
    .replace(/\bhttps?:\/\/[^\s<>]+/gi, ' ')
    .replace(/\bwww\.[^\s<>]+/gi, ' ')
    // Domínios sem protocolo, por exemplo exemplo.com/pagina ou discord.gg/abc.
    .replace(/\b(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?:\/[^\s<>]*)?/gi, ' ')
    .replace(/<@!?[a-zA-Z0-9_-]+>/g, ' menção ')
    .replace(/<#[a-zA-Z0-9_-]+>/g, ' canal ')
    .replace(/```[\s\S]*?```/g, ' bloco de código ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*|__|~~|\*/g, '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, maxChars);
}

function runProcess(command, args, { input, maxOutputBytes = 40 * 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    const stdout = [];
    const stderr = [];
    let size = 0;
    child.stdout.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxOutputBytes) {
        child.kill();
        reject(new Error('O áudio gerado ficou grande demais.'));
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('error', (err) => reject(new Error(`Não consegui iniciar ${command}: ${err.message}`)));
    child.on('close', (code) => {
      const errorText = Buffer.concat(stderr).toString('utf8').trim();
      if (code === 0) {
        if (errorText) console.log(errorText);
        resolve(Buffer.concat(stdout));
      } else {
        reject(new Error(`${command} falhou: ${errorText || `código ${code}`}`));
      }
    });
    if (input !== undefined) child.stdin.end(input);
    else child.stdin.end();
  });
}

async function* textToPCMFrames(text, voice, speed = TTS_SPEED) {
  // A saída da Fish Audio é passada diretamente ao FFmpeg por pipes. Quando a
  // Fish envia blocos via WebSocket, os primeiros frames são reproduzidos sem
  // esperar que o MP3 inteiro termine de ser gerado.
  const spokenText = addFishIntonation(text, voice);
  const isGalacticClimax = voice?.id?.startsWith('fish:')
    && /explos[aã]o\s+gal[aá]ctica/iu.test(text);
  // Só no grito final: compressão leve + ganho + limitador deixam o clímax
  // mais presente sem estourar os picos do áudio no canal de voz.
  const audioFilter = isGalacticClimax
    ? `atempo=${speed},volume=2dB,acompressor=threshold=0.18:ratio=3:attack=6:release=120:makeup=1.5,alimiter=limit=0.95`
    : `atempo=${speed}`;
  const py = spawn(PYTHON, [path.join(ROOT_DIR, 'tts_generate.py'), voice.id], {
    windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
  });
  const ff = spawn(FFMPEG, [
    '-hide_banner', '-loglevel', 'error', '-i', 'pipe:0',
    '-af', audioFilter,
    '-f', 's16le', '-acodec', 'pcm_s16le', '-ar', '48000', '-ac', '1', 'pipe:1',
  ], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });

  const pyErrors = [];
  const ffErrors = [];
  py.stderr.on('data', (chunk) => pyErrors.push(chunk));
  ff.stderr.on('data', (chunk) => ffErrors.push(chunk));
  py.stdout.pipe(ff.stdin);
  py.stdin.end(spokenText, 'utf8');

  const closed = (child) => new Promise((resolve) => {
    child.once('close', (code, signal) => resolve({ code, signal }));
    child.once('error', (err) => resolve({ code: -1, signal: err.message }));
  });
  const pyClosed = closed(py);
  const ffClosed = closed(ff);
  let pending = Buffer.alloc(0);
  let producedFrames = 0;
  let streamCompleted = false;
  try {
    for await (const chunk of ff.stdout) {
      pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
      while (pending.length >= FRAME_BYTES) {
        const frame = pending.subarray(0, FRAME_BYTES);
        pending = pending.subarray(FRAME_BYTES);
        producedFrames++;
        yield frame;
      }
    }
    if (pending.length) {
      const frame = Buffer.alloc(FRAME_BYTES);
      pending.copy(frame);
      producedFrames++;
      yield frame;
    }
    streamCompleted = true;
  } finally {
    if (!streamCompleted) {
      if (py.exitCode === null) py.kill();
      if (ff.exitCode === null) ff.kill();
    }
  }
  const [pyResult, ffResult] = await Promise.all([pyClosed, ffClosed]);
  const pyDetail = Buffer.concat(pyErrors).toString('utf8').trim();
  const ffDetail = Buffer.concat(ffErrors).toString('utf8').trim();
  if (pyResult.code !== 0) throw new Error(`Gerador TTS falhou: ${pyDetail || pyResult.signal || pyResult.code}`);
  if (ffResult.code !== 0) throw new Error(`FFmpeg falhou: ${ffDetail || ffResult.signal || ffResult.code}`);
  if (!producedFrames) throw new Error('O serviço TTS não retornou áudio.');
  if (pyDetail) console.log(pyDetail);
}

function createPeer(guildId, connId) {
  const session = voiceSessions.get(guildId);
  if (!session) throw new Error('A sessão de voz ainda não está pronta.');
  const pc = new wrtc.RTCPeerConnection({ iceServers });
  const source = new wrtc.nonstandard.RTCAudioSource();
  const track = source.createTrack();
  pc.addTrack(track);

  const peer = {
    guildId, connId, pc, source, track, polite: true,
    makingOffer: false, ignoreOffer: false,
    pendingCandidates: [], closed: false,
  };
  session.peers.set(connId, peer);

  pc.onicecandidate = ({ candidate }) => {
    if (candidate && !peer.closed) sendSignal(guildId, connId, { kind: 'ice', candidate: candidate.toJSON() });
  };
  pc.onconnectionstatechange = () => {
    console.log(`[voz ${guildId}] participante ${connId}: ${pc.connectionState}`);
    if (pc.connectionState === 'failed' || pc.connectionState === 'closed') closePeer(guildId, connId);
  };
  pc.oniceconnectionstatechange = () => {
    if (pc.iceConnectionState === 'failed') console.warn(`[voz ${guildId}] ICE falhou para ${connId}; confira firewall/TURN.`);
  };
  return peer;
}

function closePeer(guildId, connId) {
  const session = voiceSessions.get(guildId);
  const peer = session?.peers.get(connId);
  if (!peer || peer.closed) return;
  peer.closed = true;
  session.peers.delete(connId);
  try { peer.track.stop(); } catch {}
  try { peer.pc.close(); } catch {}
}

function closeAllPeers(guildId) {
  const session = voiceSessions.get(guildId);
  if (!session) return;
  for (const connId of [...session.peers.keys()]) closePeer(guildId, connId);
}

function normalizeDescription(data, peer) {
  const description = data?.sdp;
  if (description && typeof description === 'object' && description.type && description.sdp) {
    return { type: description.type, sdp: description.sdp };
  }
  if (typeof description === 'string') {
    const type = data.type || (peer.pc.signalingState === 'have-local-offer' ? 'answer' : 'offer');
    return { type, sdp: description };
  }
  if (description && typeof description === 'object' && description.sdp) {
    return { type: data.type || (peer.pc.signalingState === 'have-local-offer' ? 'answer' : 'offer'), sdp: description.sdp };
  }
  throw new Error('Sinalização de descrição SDP inválida.');
}

async function flushCandidates(peer) {
  const pending = peer.pendingCandidates.splice(0);
  for (const candidate of pending) {
    try { await peer.pc.addIceCandidate(candidate); }
    catch (err) { console.warn('Candidato ICE ignorado:', err.message); }
  }
}

async function startOffer(guildId, connId) {
  const session = voiceSessions.get(guildId);
  let peer = session?.peers.get(connId);
  if (!peer) peer = createPeer(guildId, connId);
  try {
    peer.makingOffer = true;
    const offer = await peer.pc.createOffer();
    await peer.pc.setLocalDescription(offer);
    sendSignal(guildId, connId, { kind: 'description', sdp: peer.pc.localDescription.toJSON() });
  } catch (err) {
    console.error(`[voz ${guildId}] não foi possível criar oferta para ${connId}:`, err.message);
    closePeer(guildId, connId);
  } finally {
    peer.makingOffer = false;
  }
}

async function handleVoiceSignal(data) {
  const guildId = data.guildId;
  const connId = data.from;
  if (!guildId || !connId || !data.data) return;
  try {
    let peer = voiceSessions.get(guildId)?.peers.get(connId);
    if (!peer) peer = createPeer(guildId, connId);
    const signal = data.data;

    if (signal.kind === 'ice') {
      let candidate = signal.candidate;
      if (typeof candidate === 'string') candidate = { candidate, sdpMid: '0', sdpMLineIndex: 0 };
      if (!candidate) return;
      if (peer.pc.remoteDescription) {
        try { await peer.pc.addIceCandidate(new wrtc.RTCIceCandidate(candidate)); }
        catch (err) { if (!peer.ignoreOffer) console.warn('ICE remoto ignorado:', err.message); }
      } else {
        peer.pendingCandidates.push(candidate);
      }
      return;
    }

    if (signal.kind !== 'description') return;
    const description = normalizeDescription(signal, peer);
    const readyForOffer = !peer.makingOffer && peer.pc.signalingState === 'stable';
    const collision = description.type === 'offer' && !readyForOffer;
    peer.ignoreOffer = !peer.polite && collision;
    if (peer.ignoreOffer) return;
    if (collision && peer.polite && peer.pc.signalingState === 'have-local-offer') {
      await peer.pc.setLocalDescription({ type: 'rollback' });
    }
    await peer.pc.setRemoteDescription(new wrtc.RTCSessionDescription(description));
    await flushCandidates(peer);
    if (description.type === 'offer') {
      const answer = await peer.pc.createAnswer();
      await peer.pc.setLocalDescription(answer);
      sendSignal(guildId, connId, { kind: 'description', sdp: peer.pc.localDescription.toJSON() });
    }
  } catch (err) {
    console.error(`[voz ${guildId}] sinalização falhou:`, err.message);
  }
}

async function loadIceServers() {
  try {
    const result = await apiFetch('/ice');
    const servers = Array.isArray(result) ? result : (result.iceServers || result.ice?.iceServers || result.data?.iceServers || []);
    if (!Array.isArray(servers)) throw new Error('Formato inesperado na resposta de /ice.');
    iceServers = servers;
    console.log(`Configuração ICE carregada (${iceServers.length} servidor(es)).`);
  } catch (err) {
    console.error('Não consegui carregar /ice:', err.message);
    console.error('A conexão de voz pode falhar sem as credenciais ICE/TURN do VSync.');
    iceServers = [];
  }
}

function getVoiceMap(snapshot) {
  const voice = snapshot?.voice ?? snapshot?.guild?.voice ?? snapshot?.data?.voice ?? {};
  if (Array.isArray(voice)) return new Map(voice.map((item) => [item.channelId, item.participants || item.members || []]));
  if (voice && typeof voice === 'object') {
    return new Map(Object.entries(voice).map(([channelId, value]) => [channelId,
      Array.isArray(value) ? value : (value?.participants || value?.members || [])]));
  }
  return new Map();
}

async function getGuildSnapshot(guildId, force = false) {
  pruneTimedCache(guildSnapshotCache, 10, 5_000);
  const cached = guildSnapshotCache.get(guildId);
  if (!force && cached && Date.now() - cached.at < 900) return cached.data;
  const data = await apiFetch(`/guilds/${encodeURIComponent(guildId)}`);
  guildSnapshotCache.set(guildId, { at: Date.now(), data });
  pruneTimedCache(guildSnapshotCache, 10, 5_000);
  return data;
}

function participantAccountId(participant) {
  return participant?.accountId || participant?.userId || participant?.memberId || participant?.user?.id || participant?.id || null;
}

function chooseVoiceChannel(snapshot, authorId) {
  const channels = snapshot?.channels || snapshot?.guild?.channels || [];
  const voiceMap = getVoiceMap(snapshot);
  const channelById = new Map(channels.map((channel) => [channel.id, channel]));
  const occupied = [];
  for (const [channelId, participants] of voiceMap.entries()) {
    const channel = channelById.get(channelId);
    if (channel && channel.type !== 'voice') continue;
    const humans = participants.filter((p) => {
      const id = participantAccountId(p);
      return id && id !== botAccountId && p?.bot !== true && p?.user?.bot !== true;
    });
    if (humans.length) {
      if (humans.some((p) => participantAccountId(p) === authorId)) return channelId;
      occupied.push(channelId);
    }
  }
  return occupied[0] || null;
}

async function findVoiceChannel(guildId, authorId) {
  const snapshot = await getGuildSnapshot(guildId);
  return chooseVoiceChannel(snapshot, authorId);
}

function clearIdleLeaveTimer(guildId) {
  const timer = idleLeaveTimers.get(guildId);
  if (timer) clearTimeout(timer);
  idleLeaveTimers.delete(guildId);
}

function scheduleIdleLeave(guildId) {
  clearIdleLeaveTimer(guildId);
  if (!voiceSessions.has(guildId)) return;

  const timer = setTimeout(async () => {
    // Ignore a timer that was replaced by more recent activity.
    if (idleLeaveTimers.get(guildId) !== timer) return;
    idleLeaveTimers.delete(guildId);

    if (!voiceSessions.has(guildId)) return;
    const queue = queues.get(guildId);
    if (queue?.running || queue?.items?.length) {
      // Do not disconnect while a message is being generated or played.
      scheduleIdleLeave(guildId);
      return;
    }

    console.log(`[voz ${guildId}] sem mensagens de TTS por ${TTS_IDLE_LEAVE_MINUTES} minutos; saindo automaticamente.`);
    try {
      await leaveVoice(guildId);
    } catch (err) {
      console.warn(`[voz ${guildId}] não consegui sair automaticamente: ${err.message}`);
    }
  }, TTS_IDLE_LEAVE_MS);
  timer.unref?.();
  idleLeaveTimers.set(guildId, timer);
}

async function joinVoice(guildId, channelId, { forceMove = false } = {}) {
  if (!channelId) return false;
  const existing = voiceSessions.get(guildId);
  if (existing?.channelId === channelId) {
    scheduleIdleLeave(guildId);
    return true;
  }
  const last = lastJoinAt.get(guildId) || 0;
  if (existing && Date.now() - last < 12_000 && !forceMove) {
    console.log(`[voz ${guildId}] evitando troca rápida de canal; ainda conectado em ${existing.channelId}`);
    return true; // fala na call atual em vez de perder a mensagem durante o limite de troca
  }
  if (existing && existing.channelId !== channelId) {
    closeAllPeers(guildId);
  }
  lastJoinAt.set(guildId, Date.now());
  voiceSessions.set(guildId, { channelId, peers: new Map() });
  scheduleIdleLeave(guildId);
  sendGateway({ op: 'voice_join', guildId, channelId });
  console.log(`[voz ${guildId}] solicitando entrada no canal ${channelId}...`);
  return true;
}

async function leaveVoice(guildId) {
  clearIdleLeaveTimer(guildId);
  sendGateway({ op: 'voice_leave', guildId });
  closeAllPeers(guildId);
  voiceSessions.delete(guildId);
}

async function ensureVoiceForAuthor(guildId, authorId) {
  let channelId;
  try {
    channelId = await findVoiceChannel(guildId, authorId);
  } catch (err) {
    console.warn(`[voz ${guildId}] não consegui verificar quem está na call: ${err.message}`);
    return false;
  }
  if (!channelId) {
    console.log(`[voz ${guildId}] nenhuma call ocupada. A pessoa precisa entrar em uma call para o bot saber onde falar.`);
    return false;
  }
  return joinVoice(guildId, channelId);
}

function selectedVoice(guildId, authorId) {
  const config = configFor(guildId);
  // Cada pessoa tem sua própria preferência dentro do servidor. Se ainda não
  // escolheu uma, usa a voz padrão que já estava salva para esse servidor.
  const personal = authorId ? config.userVoices[String(authorId)] : undefined;
  const preferred = personal || config.voice;
  if (preferred === 'aleatoria') {
    const key = RANDOM_VOICES[Math.floor(Math.random() * RANDOM_VOICES.length)];
    return { key, ...VOICES[key] };
  }
  const key = VOICES[preferred] ? preferred : 'francisca';
  return { key, ...VOICES[key] };
}

async function broadcastFrame(guildId, frame) {
  const session = voiceSessions.get(guildId);
  if (!session) return;
  // O VSync exige que o ArrayBuffer subjacente tenha exatamente 960 bytes.
  // Buffer.subarray() pode apontar para um buffer muito maior (o chunk inteiro
  // do FFmpeg), mesmo quando a view tem só 960 bytes. Copiamos para um buffer
  // independente para evitar: Expected a .byteLength of 960, not 65934.
  const frameBuffer = new ArrayBuffer(FRAME_BYTES);
  new Uint8Array(frameBuffer).set(frame.subarray(0, FRAME_BYTES));
  const samples = new Int16Array(frameBuffer);
  for (const peer of session.peers.values()) {
    if (peer.closed || peer.pc.connectionState === 'closed') continue;
    try {
      peer.source.onData({ samples, sampleRate: 48000, bitsPerSample: 16, channelCount: 1, numberOfFrames: FRAME_SAMPLES });
    } catch (err) {
      console.warn('Não consegui enviar um frame de áudio:', err.message);
    }
  }
}

async function broadcastPCM(guildId, pcm) {
  const session = voiceSessions.get(guildId);
  if (!session) return;
  for (let offset = 0; offset < pcm.length; offset += FRAME_BYTES) {
    const frame = Buffer.alloc(FRAME_BYTES);
    pcm.copy(frame, 0, offset, Math.min(offset + FRAME_BYTES, pcm.length));
    const samples = new Int16Array(frame.buffer, frame.byteOffset, FRAME_SAMPLES);
    const current = voiceSessions.get(guildId);
    if (current) {
      for (const peer of current.peers.values()) {
        if (peer.closed || peer.pc.connectionState === 'closed') continue;
        try {
          peer.source.onData({
            samples,
            sampleRate: 48000,
            bitsPerSample: 16,
            channelCount: 1,
            numberOfFrames: FRAME_SAMPLES,
          });
        } catch (err) {
          console.warn('Não consegui enviar um frame de áudio:', err.message);
        }
      }
    }
    await sleep(10);
  }
}

async function waitForVoicePeer(guildId, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const session = voiceSessions.get(guildId);
    const connected = [...(session?.peers?.values() || [])].some((peer) =>
      !peer.closed && (
        peer.pc.connectionState === 'connected' ||
        peer.pc.iceConnectionState === 'connected' ||
        peer.pc.iceConnectionState === 'completed'
      )
    );
    if (connected) return true;
    await sleep(200);
  }
  const session = voiceSessions.get(guildId);
  const states = [...(session?.peers?.values() || [])].map((peer) =>
    `${peer.connId}: conexão=${peer.pc.connectionState}, ICE=${peer.pc.iceConnectionState}`
  );
  console.warn(`[voz ${guildId}] nenhum ouvinte WebRTC conectado após ${timeoutMs / 1000}s.`);
  if (states.length) console.warn(`[voz ${guildId}] estado dos participantes: ${states.join('; ')}`);
  else console.warn(`[voz ${guildId}] ainda não há participantes WebRTC na sessão.`);
  return false;
}

async function speak(guildId, authorId, body) {
  const config = configFor(guildId);
  if (!config.enabled) {
    console.log(`[TTS ${guildId}] leitura desativada; mensagem ignorada.`);
    return;
  }
  const text = cleanText(body, config.maxChars || MAX_CHARS);
  if (!text) {
    console.log(`[TTS ${guildId}] mensagem ignorada porque ficou vazia após remover links/formatação.`);
    return;
  }
  console.log(`[TTS ${guildId}] preparando fala para: ${text.slice(0, 90)}`);
  const joined = await ensureVoiceForAuthor(guildId, authorId);
  if (!joined) {
    console.warn(`[TTS ${guildId}] não foi possível escolher uma call; entre em uma call com alguém e tente novamente.`);
    return;
  }
  const voice = selectedVoice(guildId, authorId);
  const speed = Number.isFinite(config.speed) ? config.speed : TTS_SPEED;
  console.log(`[TTS ${guildId}] gerando voz ${voice.name} (${voice.gender}); velocidade ${speed.toFixed(2)}x.`);

  // Aguarda a conexão WebRTC enquanto o TTS é gerado, em vez de somar os dois tempos.
  // Isso reduz especialmente o atraso quando o bot acabou de entrar no canal de voz.
  const readyPromise = waitForVoicePeer(guildId);
  const generationStartedAt = Date.now();
  let ready = false;
  let firstFrame = true;
  let framesSent = 0;
  for await (const frame of textToPCMFrames(text, voice, speed)) {
    if (!ready) {
      ready = await readyPromise;
      if (!ready) {
        console.warn(`[TTS ${guildId}] conexão de voz atrasada; aguardando mais 20s...`);
        ready = await waitForVoicePeer(guildId, 20_000);
      }
      if (!ready) {
        console.warn(`[TTS ${guildId}] áudio não enviado: a conexão WebRTC não ficou pronta.`);
        return;
      }
    }
    if (firstFrame) {
      firstFrame = false;
      console.log(`[TTS ${guildId}] primeiro áudio disponível em ${((Date.now() - generationStartedAt) / 1000).toFixed(2)}s; iniciando reprodução em streaming.`);
    }
    await broadcastFrame(guildId, frame);
    framesSent++;
    await sleep(10);
  }
  scheduleIdleLeave(guildId);
  console.log(`[TTS ${guildId}] envio concluído (${framesSent} frames; ${((Date.now() - generationStartedAt) / 1000).toFixed(1)}s total).`);
}

function queueSpeak(guildId, authorId, body) {
  let queue = queues.get(guildId);
  if (!queue) { queue = { items: [], running: false }; queues.set(guildId, queue); }
  const queueLimit = Number.isFinite(configFor(guildId).queueLimit) ? configFor(guildId).queueLimit : TTS_QUEUE_LIMIT;
  while (queue.items.length >= queueLimit) {
    queue.items.shift();
    console.warn(`[TTS ${guildId}] fila cheia (${queueLimit}); descartei a mensagem mais antiga para reduzir o atraso.`);
  }
  queue.items.push({ authorId, body });
  // Qualquer mensagem nova renova os cinco minutos se já estivermos na call.
  scheduleIdleLeave(guildId);
  if (!queue.running) void drainQueue(guildId, queue);
}

async function drainQueue(guildId, queue) {
  queue.running = true;
  try {
    while (queue.items.length) {
      const item = queue.items.shift();
      if (!configFor(guildId).enabled) continue;
      try { await speak(guildId, item.authorId, item.body); }
      catch (err) { console.error(`[TTS ${guildId}] falha ao falar:`, err.message); }
    }
  } finally {
    queue.running = false;
    if (queue.items.length) void drainQueue(guildId, queue);
  }
}

function voiceListText() {
  const female = Object.entries(VOICES).filter(([, v]) => v.gender === 'feminina').map(([key, v]) => `\`${key}\` — ${v.name}`).join('\n');
  const male = Object.entries(VOICES).filter(([, v]) => v.gender === 'masculina').map(([key, v]) => `\`${key}\` — ${v.name}`).join('\n');
  return `🎙️ **VOZES DISPONÍVEIS**\n\n**Femininas**\n${female}\n\n**Masculinas**\n${male}\n\nPara escolher sua voz: \`!tts voz NOME\`\nPara voltar à voz padrão do servidor: \`!tts voz padrao\`\nPara alternar suas vozes aleatoriamente: \`!tts voz aleatoria\``;
}

async function chooseVoice(message, requestedVoice) {
  const guildId = message.guildId;
  const channelId = message.channelId;
  const authorId = String(message.authorId || '');
  const requested = String(requestedVoice || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  // Alias para comandos antigos enviados antes da troca de nomes.
  const canonical = ({ carlinhos: 'brasileira', brasileira: 'brasileira', 'portugues br feminina': 'brasileira', 'portugues br feminina tiktok': 'brasileira', laizza: 'nobara', extra: 'kaiser', fish18a9: 'rick', fish1e82: 'morty', fish9b11: 'peridot', novavoz: 'peridot', nova: 'peridot', fish1fb89: 'mu', aries: 'mu', 'mu de aries': 'mu', saintseiya: 'mu', satoru: 'gojo', 'satoru gojo': 'gojo', 'gojo satoru': 'gojo', zenin: 'naoya', 'naoya zenin': 'naoya', 'zenin naoya': 'naoya', 'monkey d luffy': 'luffy', 'steven universe garnet': 'garnet' })[requested] || requested;
  const key = ['aleatoria', 'aleatorio', 'random'].includes(canonical) ? 'aleatoria' : canonical;
  const config = configFor(guildId);

  // "padrao" remove apenas a escolha pessoal e volta à configuração do servidor.
  if (['padrao', 'default', 'servidor'].includes(key)) {
    delete config.userVoices[authorId];
    await saveConfigs();
    await sayInTextChannel(guildId, channelId, '✅ Sua preferência pessoal foi removida. Suas mensagens usarão a voz padrão do servidor.');
    return;
  }
  if (key !== 'aleatoria' && !VOICES[key]) {
    await sayInTextChannel(guildId, channelId, `Não encontrei essa voz.\n${voiceListText()}`);
    return;
  }
  if (!authorId) {
    await sayInTextChannel(guildId, channelId, 'Não consegui identificar seu usuário; não salvei a preferência de voz.');
    return;
  }
  // Não altera config.voice: a troca passa a valer só para quem enviou o comando.
  config.userVoices[authorId] = key;
  await saveConfigs();
  await sayInTextChannel(guildId, channelId, key === 'aleatoria'
    ? '✅ Sua voz aleatória foi ativada; isso afeta só suas mensagens.'
    : `✅ Sua voz foi definida: **${VOICES[key].name}**. Isso afeta só suas mensagens.`);
}

function getEffectiveTextChannel(config) {
  if (config.textChannelMode === 'all') return '';
  if (config.textChannelMode === 'only') return String(config.textChannelId || '');
  return TEXT_CHANNEL_ONLY;
}

function currentChannelRestriction(config) {
  if (config.textChannelMode === 'all') return 'Todos os canais de texto';
  if (config.textChannelMode === 'only') return config.textChannelId ? `Somente canal ${config.textChannelId}` : 'Canal único sem ID definido';
  return TEXT_CHANNEL_ONLY ? `Somente canal ${TEXT_CHANNEL_ONLY} (definido no .env)` : 'Todos os canais (padrão do .env)';
}

function formatServerSettings(guildId) {
  const config = configFor(guildId);
  const queue = queues.get(guildId);
  const queued = queue?.items?.length || 0;
  const defaultVoice = VOICES[config.voice] || VOICES.francisca;
  return [
    '⚙️ **CONFIGURAÇÕES DO VSync TTS**',
    `• Leitura automática: ${config.enabled ? 'ligada' : 'desligada'}`,
    `• Voz padrão do servidor: ${defaultVoice.name} (${config.voice})`,
    `• Canal de leitura: ${currentChannelRestriction(config)}`,
    `• Velocidade: ${(config.speed || TTS_SPEED).toFixed(2)}x`,
    `• Máximo de caracteres: ${config.maxChars || MAX_CHARS}`,
    `• Limite da fila: ${config.queueLimit || TTS_QUEUE_LIMIT}`,
    `• Falas aguardando: ${queued}`,
  ].join('\n');
}

async function adminOnlyReply(message, purpose = 'alterar estas configurações') {
  if (await isAclAdmin(message)) return true;
  await sayInTextChannel(message.guildId, message.channelId,
    `🔒 Só o dono do servidor ou um administrador pode ${purpose}.`);
  return false;
}

function parseChannelId(raw) {
  const text = String(raw || '').trim();
  const mention = text.match(/<#([A-Za-z0-9_-]+)>/);
  const id = mention ? mention[1] : text;
  return /^[A-Za-z0-9_-]{2,100}$/.test(id) ? id : '';
}

async function handleTextCommand(message) {
  // Este gateway da VSync entrega mensagens de chat, não interações de barra
  // nativas. Para poder usar a mesma família de comandos, aceita tanto !tts
  // quanto /tts digitado no chat; comandos nativos/autocomplete precisam ser
  // expostos pela API da plataforma.
  let body = String(message.body || '').trim();
  body = body.replace(/^\/(tts|voz)(?=\s|$)/i, '!$1');
  const lower = body.toLowerCase();
  if (!lower.startsWith('!tts') && !lower.startsWith('!voz')) return false;
  const commandMessage = { ...message, body };
  const guildId = message.guildId;
  const channelId = message.channelId;
  const authorId = message.authorId;
  if (!guildId || !channelId) return true;

  if (/^!tts\s+(whitelist|blacklist|roles|cargos|acesso|permitir|tirar|despermitir|remover-permissao|bloquear|desbloquear|liberar-bloqueio|limpar)(?:\s|$)/i.test(body)) {
    return handleRoleAclCommand(commandMessage, lower);
  }

  if (['!tts voz', '!tts vozes', '!tts voz lista', '!voz', '!voz lista', '!voz ajuda'].includes(lower)) {
    await sayInTextChannel(guildId, channelId, voiceListText());
    return true;
  }
  if (lower === '!tts voz atual' || lower === '!tts voz current') {
    const config = configFor(guildId);
    const preferred = config.userVoices[String(authorId)];
    const voice = VOICES[preferred || config.voice] || VOICES.francisca;
    await sayInTextChannel(guildId, channelId, `🎙️ Sua voz atual é **${voice.name}**${preferred ? ' (preferência pessoal)' : ' (voz padrão do servidor)'}.`);
    return true;
  }
  if (lower.startsWith('!tts voz ')) {
    await chooseVoice(commandMessage, body.slice('!tts voz '.length));
    return true;
  }
  if (lower.startsWith('!voz ')) {
    await chooseVoice(commandMessage, body.slice('!voz '.length));
    return true;
  }

  const config = configFor(guildId);
  const [rawCommand = '', ...restParts] = body.slice(body.indexOf(' ') + 1).split(/\s+/);
  const command = (body === '!tts' ? 'ajuda' : rawCommand).toLowerCase();
  const args = body === '!tts' ? [] : restParts;
  const rest = args.join(' ').trim();
  const response = (text) => sayInTextChannel(guildId, channelId, text);

  if (['ajuda', 'help', 'comandos', ''].includes(command)) {
    await response([
      '🎙️ **VSync TTS — COMANDOS**',
      'Você pode usar `!tts ...` ou `/tts ...` digitado no chat. `!voz` e `/voz` também são aceitos.',
      '',
      '**Leitura e call**',
      '`!tts on` / `/tts on` — ativar leitura',
      '`!tts off` / `/tts off` — pausar leitura',
      '`!tts entrar` — entrar na call ocupada',
      '`!tts sair` — sair da call',
      '`!tts teste [texto]` — testar voz com uma frase',
      '`!tts status` — ver estado do bot',
      '`!tts ping` — testar resposta do bot',
      '',
      '**Vozes**',
      '`!tts vozes` — listar vozes',
      '`!tts voz NOME` — definir sua voz pessoal',
      '`!tts voz atual` — ver sua preferência',
      '`!tts voz padrao` — voltar à preferência padrão do servidor',
      '`!tts voz aleatoria` — voz aleatória por fala',
      '`!tts voz-servidor NOME` — mudar a voz padrão (admin)',
      '',
      '**Configuração do servidor (dono/admin)**',
      '`!tts canal #canal` ou `!tts canal definir #canal` — ler apenas um canal',
      '`!tts canal ver` — ver restrição atual',
      '`!tts canal todos` — aceitar mensagens de todos os canais',
      '`!tts canal reset` — voltar ao ajuste do `.env`',
      '`!tts velocidade 1.0-1.5` — ajustar velocidade',
      '`!tts limite 80-600` — máximo de caracteres por mensagem',
      '`!tts fila limite 3-80` — limite de mensagens na fila',
      '`!tts fila` — ver tamanho da fila',
      '`!tts limparfila` — esvaziar mensagens aguardando',
      '`!tts config` — mostrar configuração do servidor',
      '',
      '**Cargos (dono/admin)**',
      '`!tts cargos`, `permitir @Cargo`, `tirar @Cargo`, `bloquear @Cargo`, `desbloquear @Cargo`, `limpar permitidos`, `limpar bloqueados`',
      '',
      'Dica: você pode usar `/tts canal ver` e os demais equivalentes com `/tts` como prefixo digitado.',
    ].join('\n'));
    return true;
  }

  if (['ping'].includes(command)) {
    await response(`🏓 Pong! Bot ativo. Gateway conectado: ${Boolean(ws && ws.readyState === WebSocket.OPEN) ? 'sim' : 'não'}.`);
    return true;
  }

  if (['status', 'estado', 'info'].includes(command)) {
    const voice = VOICES[config.voice] || VOICES.francisca;
    const session = voiceSessions.get(guildId);
    const queue = queues.get(guildId);
    await response([
      `📊 **STATUS DO BOT**`,
      `• Leitura: ${config.enabled ? 'ligada' : 'desligada'}`,
      `• Voz padrão: ${voice.name}`,
      `• Canal de voz: ${session?.channelId ? session.channelId : 'não conectado'}`,
      `• Fila: ${queue?.items?.length || 0} aguardando${queue?.running ? ' (falando/processando)' : ''}`,
      `• Restrição de texto: ${currentChannelRestriction(config)}`,
    ].join('\n'));
    return true;
  }

  if (['on', 'ligar', 'retomar', 'ativar'].includes(command)) {
    config.enabled = true;
    await saveConfigs();
    await response('✅ Leitura automática ativada neste servidor.');
    return true;
  }
  if (['off', 'desligar', 'pausar', 'desativar'].includes(command)) {
    config.enabled = false;
    await saveConfigs();
    await response('⏸️ Leitura automática pausada neste servidor. Use `!tts on` ou `/tts on` para reativar.');
    return true;
  }

  if (['canal', 'channel'].includes(command)) {
    const action = (args[0] || 'ver').toLowerCase();
    if (['ver', 'view', 'status'].includes(action)) {
      await response(`📍 **Canal de leitura:** ${currentChannelRestriction(config)}\nPara configurar: /tts canal #canal; todos os canais: /tts canal todos; voltar ao .env: /tts canal reset.`);
      return true;
    }
    if (!(await adminOnlyReply(commandMessage, 'configurar o canal único'))) return true;
    if (['todos', 'all', 'qualquer', 'qualquer-canal'].includes(action)) {
      config.textChannelMode = 'all'; config.textChannelId = '';
      await saveConfigs();
      await response('✅ O bot pode ler mensagens de todos os canais de texto deste servidor.');
      return true;
    }
    if (['reset', 'padrao', 'padrão', 'env', 'limpar'].includes(action)) {
      config.textChannelMode = 'env'; config.textChannelId = '';
      await saveConfigs();
      await response(`✅ Restrição restaurada para o valor do .env: ${TEXT_CHANNEL_ONLY || 'todos os canais'}.`);
      return true;
    }
    const channelArgs = ['set', 'definir', 'configurar', 'unico', 'único'].includes(action) ? args.slice(1) : args;
    const id = parseChannelId(channelArgs.join(' '));
    if (!id) {
      await response('Use `!tts canal #canal`, `!tts canal ID`, `!tts canal todos` ou `!tts canal reset`.');
      return true;
    }
    config.textChannelMode = 'only'; config.textChannelId = id;
    await saveConfigs();
    await response(`✅ Canal único definido: <#${id}>. A leitura automática só vai considerar mensagens nesse canal.`);
    return true;
  }

  if (['voz-servidor', 'vozservidor', 'voz-servidor-padrao', 'default-voice'].includes(command)) {
    if (!rest) {
      const voice = VOICES[config.voice] || VOICES.francisca;
      await response(`🎙️ Voz padrão do servidor: **${voice.name}**. Para mudar: /tts voz-servidor NOME.`);
      return true;
    }
    if (!(await adminOnlyReply(commandMessage, 'mudar a voz padrão do servidor'))) return true;
    const requested = rest.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[_-]+/g, ' ').trim();
    const mapped = ({ 'voz brasileira': 'brasileira', 'portugues brasileiro': 'brasileira', 'br': 'brasileira', 'voz padrao': 'francisca', 'saga de gemeos': 'saga', 'mu de aries': 'mu', 'satoru gojo': 'gojo', 'naoya zenin': 'naoya', 'monkey d luffy': 'luffy' })[requested] || requested.replace(/\s+/g, '');
    if (!VOICES[mapped] && mapped !== 'aleatoria') {
      await response(`❌ Voz não encontrada: ${rest}. Use !tts vozes para ver opções.`);
      return true;
    }
    config.voice = mapped;
    await saveConfigs();
    await response(`✅ Voz padrão do servidor definida para **${mapped === 'aleatoria' ? 'Aleatória' : VOICES[mapped].name}**. Preferências pessoais continuam valendo para cada usuário.`);
    return true;
  }

  if (['velocidade', 'speed'].includes(command)) {
    if (!rest) { await response(`⚡ Velocidade atual deste servidor: **${(config.speed || TTS_SPEED).toFixed(2)}x** (permitido de 1.00 a 1.50).`); return true; }
    if (!(await adminOnlyReply(commandMessage, 'mudar a velocidade'))) return true;
    const value = Number(args[0].replace(',', '.'));
    if (!Number.isFinite(value) || value < 1 || value > 1.5) { await response('Use um valor entre `1.00` e `1.50`, por exemplo `!tts velocidade 1.25`.'); return true; }
    config.speed = Math.round(value * 100) / 100;
    await saveConfigs();
    await response(`✅ Velocidade definida para **${config.speed.toFixed(2)}x** neste servidor.`);
    return true;
  }

  if (['limite', 'caracteres', 'maxchars'].includes(command)) {
    if (!rest) { await response(`📝 Limite atual: **${config.maxChars || MAX_CHARS} caracteres** por mensagem (80–600).`); return true; }
    if (!(await adminOnlyReply(commandMessage, 'mudar o limite de caracteres'))) return true;
    const value = Number(args[0]);
    if (!Number.isInteger(value) || value < 80 || value > 600) { await response('Use um número inteiro de 80 a 600, por exemplo `!tts limite 280`.'); return true; }
    config.maxChars = value;
    await saveConfigs();
    await response(`✅ Limite definido para **${value} caracteres** por mensagem.`);
    return true;
  }

  if (['fila', 'queue'].includes(command)) {
    if (['limite', 'limit'].includes((args[0] || '').toLowerCase())) {
      if (!args[1]) { await response(`📚 Limite atual da fila: ${config.queueLimit || TTS_QUEUE_LIMIT} mensagens.`); return true; }
      if (!(await adminOnlyReply(commandMessage, 'mudar o limite da fila'))) return true;
      const limit = Number(args[1]);
      if (!Number.isInteger(limit) || limit < 3 || limit > 80) { await response('O limite da fila deve ser um número inteiro entre 3 e 80.'); return true; }
      config.queueLimit = limit;
      await saveConfigs();
      await response(`✅ Limite da fila definido para ${limit} mensagens.`);
      return true;
    }
    const queue = queues.get(guildId);
    await response(`📚 Fila: **${queue?.items?.length || 0}** mensagem(ns) aguardando; ${queue?.running ? 'há uma fala em processamento.' : 'nenhuma fala em processamento.'}\nLimite: ${config.queueLimit || TTS_QUEUE_LIMIT}. Use !tts limparfila para esvaziar.`);
    return true;
  }

  if (['limparfila', 'limpar-fila', 'fila-limpar', 'clearqueue'].includes(command)) {
    if (!(await adminOnlyReply(commandMessage, 'limpar a fila'))) return true;
    const queue = queues.get(guildId);
    const count = queue?.items?.length || 0;
    if (queue) queue.items.length = 0;
    await response(`🧹 Fila limpa. ${count} mensagem(ns) aguardando foram removidas. A fala que já começou não é interrompida.`);
    return true;
  }

  if (['config', 'configuracao', 'configuração', 'settings'].includes(command)) {
    await response(formatServerSettings(guildId));
    return true;
  }

  if (['teste', 'test', 'falar', 'say'].includes(command)) {
    if (!config.enabled) { await response('⏸️ A leitura automática está pausada. Ative com `!tts on` antes de testar.'); return true; }
    const text = rest || 'Este é um teste de voz do VSync TTS!';
    queueSpeak(guildId, authorId, text);
    await response(`🎙️ Teste enviado para a fila: “${text.slice(0, 150)}${text.length > 150 ? '…' : ''}”`);
    return true;
  }

  if (['entrar', 'join'].includes(command)) {
    const ok = await ensureVoiceForAuthor(guildId, authorId);
    await response(ok ? '✅ Solicitei entrada na call ocupada.' : 'Não encontrei uma call ocupada. Entre em um canal de voz primeiro.');
    return true;
  }
  if (['sair', 'leave'].includes(command)) {
    await leaveVoice(guildId);
    await response('👋 Saí do canal de voz. Vou entrar novamente quando alguém mandar uma mensagem e houver uma call ocupada.');
    return true;
  }

  if (['voz-atual', 'minha-voz', 'vozver'].includes(command)) {
    const preferred = config.userVoices[String(authorId)];
    const voice = VOICES[preferred || config.voice] || VOICES.francisca;
    await response(`🎙️ Sua voz atual é **${voice.name}**${preferred ? ' (preferência pessoal)' : ' (voz padrão do servidor)'}. Use /tts voz NOME para mudar.`);
    return true;
  }

  if (['vozes', 'voices'].includes(command)) {
    await response(voiceListText());
    return true;
  }

  if (['pausar', 'resume', 'retomar', 'ajuda'].includes(command)) {
    // aliases tratados pelas regras acima; ajuda cai na seção de ajuda.
    if (command === 'ajuda') { await response('Use `!tts ajuda` para ver todos os comandos disponíveis.'); return true; }
  }
  return false;
}

async function handleDispatch(event, data) {
  switch (event) {
    case 'GUILD_CREATE': {
      const guildId = data.guild?.id || data.id;
      if (guildId) console.log(`Servidor disponível: ${data.guild?.name || guildId}`);
      break;
    }
    case 'MESSAGE_CREATE': {
      const guildId = data.guildId || data.guild?.id;
      const authorId = data.authorId || data.author?.id;
      const body = String(data.body ?? '');
      const authorName = data.author?.displayName || data.author?.username || authorId || 'desconhecido';
      console.log(`[chat] MESSAGE_CREATE: servidor=${guildId || 'sem servidor'}, canal=${data.channelId || 'desconhecido'}, autor=${authorName}, texto=${body.slice(0, 100)}`);
      if (!guildId || !authorId || !body.trim() || data.author?.bot) {
        console.log('[chat] mensagem ignorada: falta servidor/autor/texto ou a mensagem é de um bot.');
        break;
      }
      const normalizedMessage = { ...data, guildId, authorId, body };
      const handled = await handleTextCommand(normalizedMessage);
      if (handled) break;
      const channelRestriction = getEffectiveTextChannel(configFor(guildId));
      if (channelRestriction && data.channelId !== channelRestriction) {
        console.log(`[chat] mensagem ignorada: leitura restrita ao canal ${channelRestriction}.`);
        break;
      }
      if (await canSpeakByRolePolicy(normalizedMessage)) queueSpeak(guildId, authorId, body);
      break;
    }
    case 'VOICE_JOINED': {
      const guildId = data.guildId;
      const old = voiceSessions.get(guildId);
      voiceSessions.set(guildId, { channelId: data.channelId || old?.channelId, peers: old?.peers || new Map() });
      console.log(`[voz ${guildId}] conectado no canal ${data.channelId}; participantes: ${data.peers?.length || 0}`);
      for (const peer of data.peers || []) if (peer.connId) void startOffer(guildId, peer.connId);
      break;
    }
    case 'VOICE_PEER_JOINED': {
      // Pessoas que chegam depois normalmente enviam uma oferta para o bot.
      console.log(`[voz ${data.guildId}] novo participante: ${data.connId || data.accountId}`);
      break;
    }
    case 'VOICE_PEER_LEFT':
      closePeer(data.guildId, data.connId);
      break;
    case 'VOICE_SIGNAL':
      await handleVoiceSignal(data);
      break;
    case 'VOICE_LEFT':
      console.log(`[voz ${data.guildId}] desconectado: ${data.reason}`);
      // Durante uma troca de canal, VOICE_LEFT antecede VOICE_JOINED; preserve a sessão pendente.
      if (data.reason !== 'moved') {
        clearIdleLeaveTimer(data.guildId);
        closeAllPeers(data.guildId);
        voiceSessions.delete(data.guildId);
      }
      break;
    case 'VOICE_STATE': {
      const session = voiceSessions.get(data.guildId);
      if (!session) break;
      const participants = getVoiceMap({ voice: data.voice }).get(session.channelId) || [];
      const humans = participants.filter((p) => {
        const id = participantAccountId(p);
        return id && id !== botAccountId && p?.bot !== true && p?.user?.bot !== true;
      });
      if (participants.length && humans.length === 0) {
        console.log(`[voz ${data.guildId}] canal ficou vazio; saindo.`);
        await leaveVoice(data.guildId);
      }
      break;
    }
    case 'error':
      console.error('Gateway reportou erro:', data);
      break;
  }
}

async function connectGateway() {
  ws = new WebSocket(`${API.replace(/^http/, 'ws')}/gateway`);
  ws.on('message', async (raw) => {
    let event;
    try { event = JSON.parse(raw.toString()); }
    catch { console.warn('Mensagem JSON inválida recebida do gateway.'); return; }
    try {
      if (event.op === 'hello') {
        sendGateway({ op: 'identify', token: TOKEN });
        clearInterval(heartbeat);
        heartbeat = setInterval(() => sendGateway({ op: 'ping' }), event.heartbeatMs || 30_000);
      } else if (event.op === 'ready') {
        reconnectDelay = 1000;
        botAccountId = event.user?.id || null;
        appId = event.application?.id || null;
        console.log(`Online como ${event.user?.displayName || event.user?.username || 'bot'}${appId ? ` (app ${appId})` : ''}`);
        await loadIceServers();
      } else if (event.op === 'dispatch') {
        await handleDispatch(event.t, event.d || {});
      } else if (event.op === 'error') {
        console.error('Erro do gateway:', event.code, event.message);
      } else if (event.op === 'pong') {
        // heartbeat confirmado
      }
    } catch (err) {
      console.error('Erro processando evento do gateway:', err.message);
    }
  });
  ws.on('error', (err) => console.error('WebSocket:', err.message));
  ws.on('close', async (code, reason) => {
    clearInterval(heartbeat);
    closeAllVoiceSessions();
    if (stopping || code === 4001 || code === 4003) {
      console.error(`Gateway fechou com código ${code}: ${reason.toString()}`);
      if (code === 4001 || code === 4003) process.exitCode = 1;
      if (!stopping) process.exit();
      return;
    }
    console.warn(`Gateway desconectou (${code}). Reconectando em ${Math.round(reconnectDelay / 1000)}s...`);
    await sleep(reconnectDelay + Math.floor(Math.random() * 400));
    reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
    if (!stopping) void connectGateway();
  });
}

function closeAllVoiceSessions() {
  for (const guildId of [...voiceSessions.keys()]) {
    clearIdleLeaveTimer(guildId);
    closeAllPeers(guildId);
    voiceSessions.delete(guildId);
  }
  for (const guildId of [...idleLeaveTimers.keys()]) clearIdleLeaveTimer(guildId);
}

async function shutdown() {
  if (stopping) return;
  stopping = true;
  clearInterval(heartbeat);
  for (const guildId of voiceSessions.keys()) sendGateway({ op: 'voice_leave', guildId });
  closeAllVoiceSessions();
  try { ws?.close(); } catch {}
  await sleep(150);
  process.exit(0);
}

await loadConfigs();
// O áudio é processado inteiramente em memória; não precisa de pasta temporária.
console.log('Iniciando bot TTS para VSync...');
console.log(`Leitura automática: ativada${TEXT_CHANNEL_ONLY ? ` (somente canal ${TEXT_CHANNEL_ONLY})` : ' (todos os canais visíveis)'}.`);
console.log(`Voz padrão: Francisca. Velocidade da fala: ${TTS_SPEED.toFixed(2)}x. Limite da fila: ${TTS_QUEUE_LIMIT}. Use !tts ajuda ou /tts ajuda para ver os comandos; !voz lista também funciona.`);
console.log(`Saída automática da call: ${TTS_IDLE_LEAVE_MINUTES} minuto(s) sem mensagens de TTS.`);
console.log(`[runtime] Python: ${PYTHON}; FFmpeg: ${FFMPEG}. Na Discloud, as dependências são instaladas pelo discloud.config.`);
console.log('[TTS] Vozes Fish Audio: requerem FISH_API_KEY; Lhays: proxy comunitário TikTok. Voz local do Windows é apenas fallback.');
console.log('[ACL] A edição de whitelist/blacklist é permitida ao dono/admin do servidor; IDs no .env podem ser usados como exceção global.');
console.log('Quando você mandar uma mensagem, procure a linha [chat] MESSAGE_CREATE no terminal.');
void connectGateway();
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
