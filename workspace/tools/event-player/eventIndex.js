function splitEventKey(key) {
    const s = String(key || "");
    const i = s.indexOf("/");
    if (i < 0) return { eventKey: s, eventId: s, conditionsRaw: "" };
    return {
        eventKey: s,
        eventId: s.slice(0, i).trim(),
        conditionsRaw: s.slice(i + 1).trim(),
    };
}

function tokenizeScript(script) {
    return String(script || "")
        .split("/")
        .map((x) => x.trim())
        .filter(Boolean);
}

function extractSpeakers(tokens) {
    const speakers = new Set();
    for (const t of tokens) {
        const m = t.match(/^(speak|splitSpeak)\s+([^\s"]+)/i);
        if (m) speakers.add(m[2]);
    }
    return speakers;
}

function extractMentions(tokens, knownNames) {
    const mentions = new Set();
    if (!knownNames || knownNames.size === 0) return mentions;

    const names = Array.from(knownNames);
    for (const t of tokens) {
        for (const n of names) {
            const re = new RegExp(`\\b${escapeRegExp(n)}\\b`);
            if (re.test(t)) mentions.add(n);
        }
    }
    return mentions;
}

function escapeRegExp(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
const COND_ALIAS = {
    "*": "WorldState",
    "*n": "HostOrLocalMail",
    a: "Tile",
    b: "ReachedMineBottom",
    B: "SpouseBed",
    C: "CommunityCenterOrWarehouseDone",
    c: "FreeInventorySlots",
    D: "Dating",
    e: "SawEvent",
    f: "Friendship",
    G: "GameStateQuery",
    g: "Gender",
    H: "IsHost",
    h: "MissingPet",
    Hn: "HostMail",
    i: "HasItem",
    j: "DaysPlayed",
    J: "JojaBundlesDone",
    L: "InUpgradedHouse",
    m: "EarnedMoney",
    M: "HasMoney",
    N: "GoldenWalnuts",
    n: "LocalMail",
    O: "Spouse",
    p: "NpcVisibleHere",
    q: "ChoseDialogueAnswers",
    r: "Random",
    R: "Roommate",
    S: "SawSecretNote",
    s: "Shipped",
    t: "Time",
    u: "DayOfMonth",
    v: "NPCVisible",
    w: "Weather",
    y: "Year",
};

function splitConditions(raw) {
    return String(raw || "")
        .split("/")
        .map((s) => s.trim())
        .filter(Boolean);
}

function normalizeAliasToken(tokens) {
    if (!tokens.length) return { alias: "", rest: [] };

    const first = tokens[0];
    if (first === "*n") return { alias: "*n", rest: tokens.slice(1) };
    if (first === "Hn") return { alias: "Hn", rest: tokens.slice(1) };
    if (first === "*") return { alias: "*", rest: tokens.slice(1) };

    return { alias: first, rest: tokens.slice(1) };
}

function isIntString(s) {
    return /^-?\d+$/.test(String(s || ""));
}

function formatFriendshipArgs(restTokens) {
    //
    const out = [];
    for (let i = 0; i < restTokens.length; i++) {
        const name = restTokens[i];
        const points = restTokens[i + 1];

        if (name && points && isIntString(points)) {
            const p = Number(points);
            const hearts = p / 250;

            if (Number.isFinite(hearts) && Number.isInteger(hearts)) {
                out.push(`${name} ${p} ("${hearts} Heart Event")`);
            } else {
                out.push(`${name} ${p}`);
            }

            i++; 
        } else {

            out.push(name);
        }
    }
    return out.join(", ");
}

function formatConditionLine(condStr) {
    const parts = condStr.trim().split(/\s+/).filter(Boolean);
    const { alias, rest } = normalizeAliasToken(parts);

    const label = COND_ALIAS[alias] || alias || "Condition";
    if (alias === "f") {
        const formatted = formatFriendshipArgs(rest);
        return formatted ? `${label}: ${formatted}` : `${label}`;
    }

    const args = rest.join(" ");
    return args ? `${label}: ${args}` : `${label}`;
}

function formatConditionsPretty(conditionsRaw) {
    const raw = String(conditionsRaw || "").trim();
    if (!raw) return "";
    return splitConditions(raw).map(formatConditionLine).join("\n");
}

/**
 * Only derive "heart" requirements from Friendship conditions (alias "f"),
 * not from arbitrary "<token> <number>" pairs like "i 724".
 *
 * Returns:
 *  - raw: original raw string
 *  - hearts: [{ name, points }] from Friendship only, and only if points are exact heart multiples (250)
 */
function summarizeConditions(conditionsRaw) {
    const raw = String(conditionsRaw || "").trim();
    if (!raw) return { raw: "", hearts: [] };

    const hearts = [];

    for (const cond of splitConditions(raw)) {
        const parts = cond.trim().split(/\s+/).filter(Boolean);
        const { alias, rest } = normalizeAliasToken(parts);

        if (alias !== "f") continue;


        for (let i = 0; i + 1 < rest.length; i += 2) {
            const name = rest[i];
            const points = rest[i + 1];
            if (!name || !isIntString(points)) continue;

            const p = Number(points);
            const h = p / 250;


            if (Number.isFinite(h) && Number.isInteger(h) && h > 0) {
                hearts.push({ name, points: p });
            }
        }
    }

    return { raw, hearts };
}

function computeHeartMax(cond) {
    let heartMax = 0;
    const hs = cond?.hearts || [];
    for (const h of hs) {
        const p = Number(h?.points) || 0;
        const hearts = p / 250;
        if (Number.isFinite(hearts) && Number.isInteger(hearts) && hearts > heartMax) {
            heartMax = hearts;
        }
    }
    return heartMax;
}

//sort heart events low->high, keep non-heart events after.
function sortByHeartThenEventId(a, b) {
    const ah = a.heartMax > 0 ? a.heartMax : 999999;
    const bh = b.heartMax > 0 ? b.heartMax : 999999;
    return ah - bh || (a.eventId || "").localeCompare(b.eventId || "");
}

function sortByHeartThenLocThenId(a, b) {
    const ah = a.heartMax > 0 ? a.heartMax : 999999;
    const bh = b.heartMax > 0 ? b.heartMax : 999999;
    return (
        ah - bh ||
        (a.location || "").localeCompare(b.location || "") ||
        (a.eventId || "").localeCompare(b.eventId || "")
    );
}

export function buildIndex(eventsByLocation, characterNames) {
    const known = new Set(characterNames || []);

    const events = [];
    for (const [loc, dict] of Object.entries(eventsByLocation || {})) {
        for (const [key, script] of Object.entries(dict || {})) {
            const k = splitEventKey(key);
            const tokens = tokenizeScript(script);
            const speakersSet = extractSpeakers(tokens);
            const mentionsSet = extractMentions(tokens, known);


            const participants = new Set([...speakersSet, ...mentionsSet]);

            const cond = summarizeConditions(k.conditionsRaw);
            const condPretty = formatConditionsPretty(k.conditionsRaw);

            const heartMax = computeHeartMax(cond);
            let heartLabel = "";
            if (heartMax > 0) {
                const maxNames = (cond.hearts || [])
                    .filter(h => (Number(h.points) / 250) === heartMax)
                    .map(h => h.name)
                    .filter(Boolean);

                const uniqueMaxNames = Array.from(new Set(maxNames)).sort((a, b) => a.localeCompare(b));
                heartLabel = uniqueMaxNames.length
                    ? `${heartMax} Heart (${uniqueMaxNames.join(", ")})`
                    : `${heartMax} Heart`;
            }

            events.push({
                location: loc,
                eventKey: k.eventKey,
                eventId: k.eventId,
                conditionsRaw: k.conditionsRaw,
                conditionsPretty: condPretty,
                conditions: cond,
                speakers: Array.from(speakersSet).sort(),
                participants: Array.from(participants).sort(),
                heartMax,
                heartLabel,
            });
        }
    }
    const byLocation = {};
    for (const e of events) (byLocation[e.location] ||= []).push(e);
    for (const k of Object.keys(byLocation)) {
        byLocation[k].sort(sortByHeartThenEventId);
    }
    const byCharacter = {};
    for (const e of events) {
        for (const name of e.speakers || []) {
            (byCharacter[name] ||= []).push(e);
        }
    }
    for (const k of Object.keys(byCharacter)) {
        byCharacter[k].sort(sortByHeartThenLocThenId);
    }

    return { events, byLocation, byCharacter };
}