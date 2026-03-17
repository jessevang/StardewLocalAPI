
let _deps = null;

/**
 * @param {{
 *  TEMPLATE_CMDS: Set<string>,
 *  COMMAND_NAMES: string[],
 *  escapeHtml: (s:any)=>string,
 *  numOr: (v:any,d:number)=>number,
 *  boolOr: (v:any,d:boolean)=>boolean,
 *  renderCmdRawHtml: (c:any)=>string,
 *  actorNameOptions: ()=>string[],
 *  getLocations?: ()=>string[],
 *  getTempActorAssetOptions?: (kind:string)=>Array<{ name:string, assetName:string, kind?:string, source?:string }>,
 * }} deps
 */
export function initCommands(deps) {
    _deps = deps;
}

export const COMMAND_NAMES = [
    "action",
    "addConversationTopic", "addCookingRecipe", "addCraftingRecipe", "addItem", "addLantern", "addObject", "addProp", "addFloorProp", "addBigProp", "addQuest", "addSpecialOrder", "addTemporaryActor",
    "advancedMove", "ambientLight", "animalNaming", "animate", "attachCharacterToTempSprite", "awardFestivalPrize", "beginSimultaneousCommand", "broadcastEvent", "catQuestion", "cave", "changeLocation",
    "changeMapTile", "changeName", "changePortrait", "changeSprite", "changeToTemporaryMap", "changeYSourceRectOffset", "characterSelect", "cutscene", "doAction", "dump", "elliotbooktalk",
    "emote", "end", "endSimultaneousCommand", "eventSeen", "extendSourceRect", "eyes", "faceDirection", "fade", "farmerAnimation", "farmerEat", "fork", "friendship", "globalFade", "globalFadeToClear", "glow",
    "grandpaCandles", "grandpaEvaluation", "grandpaEvaluation2", "halt", "hideShadow", "hospitaldeath", "ignoreCollisions", "ignoreEventTileOffset", "ignoreMovementAnimation", "itemAboveHead",
    "jump", "loadActors", "makeInvisible", "mail", "mailReceived", "mailToday", "message", "minedeath", "money", "move", "pause", "playMusic", "playSound", "playerControl", "positionOffset",
    "proceedPosition", "question", "questionAnswered", "quickQuestion", "removeItem", "removeObject", "removeQuest", "removeSpecialOrder", "removeSprite", "removeTemporarySprites", "removeTile",
    "replaceWithClone", "resetVariable", "rustyKey", "screenFlash", "setRunning", "setSkipActions", "shake", "showFrame", "skippable", "speak", "specificTemporarySprite", "speed", "splitSpeak",
    "startJittering", "stopAdvancedMoves", "stopAnimation", "stopGlowing", "stopJittering", "stopMusic", "stopRunning", "stopSound", "stopSwimming", "swimming", "switchEvent",
    "temporarySprite", "temporaryAnimatedSprite", "textAboveHead", "tossConcession", "translateName", "tutorialMenu", "updateMinigame", "viewport", "waitForAllStationary", "waitForOtherPlayers",
    "warp", "warpFarmers",
    "Raw"
];


export const COMMAND_DESCS = {
    action: "Run a trigger action string (e.g., AddMoney 1000).",
    addBigProp: "Place a craftables sprite prop at tile X/Y.",
    addConversationTopic: "Starts a conversation topic with the entered given ID. NPCs can reference this topic in dialogue and events can check it using ActiveDialogueEvent. Topics last 4 days by default unless a length (days) is specified. Length 0 means the topic lasts only for the current day.",
    addCookingRecipe: "Teach a cooking recipe to the player.",
    addCraftingRecipe: "Teach a crafting recipe to the player.",
    addFloorProp: "Add a non-solid festival prop at tile X/Y.",
    removeQuest: "Remove a quest from the quest log.",
    removeSpecialOrder: "Remove a special order from the player team (team-wide in MP).",
    addItem: "Give the player an item (opens grab menu if full).",
    addLantern: "Place a glowing lantern sprite at tile X/Y.",
    addObject: "Show a temporary object sprite at tile X/Y.",
    addProp: "Add a solid festival prop at tile X/Y.",
    addQuest: "Add a quest to the quest log.",
    addSpecialOrder: "Add a special order (team-wide in MP).",
    addTemporaryActor: "Spawn a temporary actor (Character/Animal/Monster).",

    advancedMove: "Queue multiple moves/pauses for an actor (optionally loop).",
    ambientLight: "Set ambient light RGB (0–255).",
    animalNaming: "Open animal naming menu (coop context).",
    animate: "Play a sprite animation on an actor.",
    attachCharacterToTempSprite: "Attach actor to the last temp sprite.",
    awardFestivalPrize: "Give festival prize (or specified item).",
    beginSimultaneousCommand: "Run a block of instant commands on same tick.",
    endSimultaneousCommand: "End the simultaneous command block.",
    broadcastEvent: "Force all MP players to see this event.",
    catQuestion: "Ask to adopt the pet.",
    cave: "Ask farm cave choice (bats/mushrooms).",

    changeLocation: "Switch to another location and continue script there.",
    changeMapTile: "Change a map tile (layer, x, y, tile index).",
    changeName: "Change an actor display name during event.",
    changePortrait: "Swap an NPC portrait variant during event.",
    changeSprite: "Swap an NPC sprite variant during event.",
    changeToTemporaryMap: "Load a temporary map for the event.",
    changeYSourceRectOffset: "Offset NPC sprite sheet vertically (rare).",

    cutscene: "Start a cutscene by ID.",
    doAction: "Trigger a tile action as if clicked (doors, etc.).",
    dump: "Trigger 'dumped' / 'second chance' events (legacy).",
    emote: "Show an emote bubble over an actor.",
    end: "End the event (supports variants like warpOut/newDay/etc).",
    eventSeen: "Add/remove an event ID from seen list.",
    faceDirection: "Make actor face a direction (optional continue).",
    fade: "Fade to black (or unfade).",
    farmerEat: "Make the player eat an object (applies effects).",
    fork: "Branch to another script ID if condition is met.",
    friendship: "Add friendship points with an NPC.",
    globalFade: "Fade to black at a speed (optional continue).",
    globalFadeToClear: "Fade in from black at a speed (optional continue).",
    glow: "Glow the screen with an RGB color (optional hold).",

    halt: "Stop all actors from moving.",
    hideShadow: "Hide an actor's shadow (not farmer).",
    hospitaldeath: "Force hospital 'death' (lose money/items).",
    ignoreCollisions: "Make an actor ignore collisions for event.",
    ignoreEventTileOffset: "Disable farmhouse tile offset (must be 4th cmd).",
    ignoreMovementAnimation: "Move actor without walk animation.",
    itemAboveHead: "Show item above head + optional receive message.",
    jump: "Make an actor jump. Defaults to ",
    loadActors: "Load actors from a map layer.",

    makeInvisible: "Temporarily clear objects/terrain in an area.",
    mail: "Queue a letter for tomorrow.",
    mailReceived: "Add/remove a mail flag (bypass mailbox).",
    mailToday: "Deliver letter to mailbox immediately.",
    message: "Show dialogue box without a speaker.",
    minedeath: "Force mine 'death' (lose money/items).",
    money: "Add/remove gold by amount.",
    move: "Move actor by tile offset (optional continue).",
    pause: "Pause for N milliseconds.",

    playMusic: "Play a music track ID.",
    stopMusic: "Stop currently playing music.",
    playSound: "Play a sound cue ID.",

    playerControl: "Return control to the player.",
    positionOffset: "Offset actor position by pixels (instant).",
    proceedPosition: "Wait until actor stops moving.",

    question: "Show a question with answers (supports fork answers).",
    questionAnswered: "Add/remove a dialogue answer flag.",
    quickQuestion: "Question with per-answer mini scripts (break blocks).",

    removeItem: "Remove item(s) from player inventory.",
    removeObject: "Remove a prop at tile X/Y.",
    removeQuest: "Remove quest from quest log.",
    removeSpecialOrder: "Remove a special order (team-wide).",
    removeSprite: "Remove a temp sprite at X/Y.",
    removeTemporarySprites: "Remove all temporary sprites.",
    removeTile: "Remove a tile from a map layer.",

    replaceWithClone: "Replace an NPC with a temporary clone for event.",
    resetVariable: "Reset specialEventVariable1 to false.",
    rustyKey: "Grant sewer access mail flag.",
    screenFlash: "Flash screen white (alpha controls brightness).",
    setRunning: "Set farmer to running.",
    stopRunning: "Stop farmer running.",

    setSkipActions: "Actions to run if player skips the event.",
    shake: "Shake an NPC actor for a duration in milliseconds. Has no effect on farmer; use startJittering for the player.",
    showFrame: "Set actor sprite frame (optional flip).",
    skippable: "Allow skipping from this point.",
    speak: "NPC dialogue line.",
    splitSpeak: "Dialogue split by previous answer (~ separator).",

    startJittering: "Make the player jitter.",
    stopJittering: "Makes the farmer stop jittering.",
    stopGlowing: "Stop glow effects.",

    speed: "Sets the NPC’s movement speed (default is 3). This change lasts until the NPC performs another movement or animation.",
    stopAnimation: "Stop an actor animation (optional end frame).",
    stopAdvancedMoves: "Stop advancedMove paths.",

    stopSound: "Stop a sound cue (optional immediate).",
    swimming: "Make an actor start swimming.",
    stopSwimming: "Make an actor stop swimming.",

    switchEvent: "Switch to another event script in same location.",
    temporarySprite: "Create a temporary sprite (basic).",
    temporaryAnimatedSprite: "Create a configurable animated sprite.",
    textAboveHead: "Show floating text above an actor. Use {{PlayerName}} if you want the player's name in the text.",
    tossConcession: "Make NPC toss concession item.",
    translateName: "Set actor display name via translation key.",
    tutorialMenu: "Show tutorial menu.",
    updateMinigame: "Send event data to current minigame.",

    viewport: "Control camera (center/move/unfreeze).",
    waitForAllStationary: "Wait until all actors stop moving.",
    waitForOtherPlayers: "Wait for other MP players.",
    warp: "Warp actor to tile X/Y (optional continue).",
    warpFarmers: "Warp connected farmers to tiles (MP).",

    characterSelect: "Seemingly unused. Sets Game1.gameMode to 5 and Game1.menuChoice = 0.",
    elliotbooktalk: "Trigger Elliot book talk.",
    extendSourceRect: "Extend an actor's source rectangle, or use reset to restore the actor's normal sprite.",
    grandpaCandles: "Do grandpa candles.",
    grandpaEvaluation: "Do grandpa evaluation.",
    grandpaEvaluation2: "Do grandpa evaluation (manually resummoned).",

    Raw: "Any custom command line (not templated).",
};

export function getCommandChoices() {

    return (COMMAND_NAMES || []).map(name => ({
        name,
        desc: COMMAND_DESCS[name] || ""
    }));
}

export const ITEM_OPTIONS = [
    { value: "(O)72", label: "Diamond" },
    { value: "(O)74", label: "Prismatic Shard" },
    { value: "(O)60", label: "Emerald" },
    { value: "(O)64", label: "Ruby" },
    { value: "(O)62", label: "Aquamarine" },
    { value: "(O)70", label: "Jade" },
    { value: "(O)66", label: "Amethyst" },
    { value: "(O)68", label: "Topaz" },
];

export const EMOTE_OPTIONS = [
    { value: 4, label: "water drop going empty" },
    { value: 8, label: "question mark" },
    { value: 12, label: "angry" },
    { value: 16, label: "exclamation" },
    { value: 20, label: "heart" },
    { value: 24, label: "sleep (zzz)" },
    { value: 28, label: "sad" },
    { value: 32, label: "happy" },
    { value: 36, label: "X / no" },
    { value: 40, label: "pause / ..." },
    { value: 44, label: "fishing hook" },
    { value: 48, label: "yellow card" },
    { value: 52, label: "game controller" },
    { value: 56, label: "music note" },
    { value: 60, label: "blush" },
];

export const TEMPLATE_CMDS = new Set([
    "pause", "speak", "splitSpeak", "message", "move", "warp", "faceDirection", "playMusic", "stopMusic", "playSound",
    "money", "friendship", "showFrame", "viewport", "action", "addItem", "removeItem", "setSkipActions", "skippable",
    "emote", "end", "fade", "globalFade", "globalFadeToClear", "textAboveHead", "awardFestivalPrize", "addCookingRecipe",
    "addCraftingRecipe", "textAboveHead", "itemAboveHead", "addObject", "addLantern", "farmerEat", "advancedMove", "stopAdvancedMoves",
    "addConversationTopic", "addQuest", "addSpecialOrder", "removeQuest", "removeSpecialOrder", "shake", "speed", "swimming",
    "stopSwimming", "attachCharacterToTempSprite",
    "catQuestion",
    "cave",
    "changeLocation",
    "characterSelect",
    "elliotbooktalk",
    "extendSourceRect",
    "grandpaCandles",
    "grandpaEvaluation",
    "grandpaEvaluation2",
    "halt",
    "hospitaldeath",
    "minedeath",
    "resetVariable",
    "rustyKey",
    "setRunning",
    "startJittering",
    "stopAnimation",
    "stopGlowing",
    "stopJittering",
    "stopRunning",
    "jump",
    "addProp",
    "addFloorProp",
    "addBigProp",
    "addTemporaryActor",


]);

function normalizeGenericRawTail(raw) {
    return String(raw || "").trim();
}

export function cmdToToken(c, options = {}) {
    const numOr = _deps?.numOr || ((v, d) => {
        const n = Number(v);
        return Number.isFinite(n) ? n : d;
    });

    const boolOr = _deps?.boolOr || ((v, d) => {
        if (v === true || v === "true") return true;
        if (v === false || v === "false") return false;
        return d;
    });
    const useI18n = !!options.useI18n;
    const i18nKey = String(options.i18nKey || "").trim();
    const cpText = (raw) => {
        const text = String(raw || "");
        const finalText = (useI18n && i18nKey) ? `{{i18n:${i18nKey}}}` : text;
        return finalText.replace(/"/g, `\"`);
    };

    const t = c.type;
    const rawTail = normalizeGenericRawTail(c?.raw);

    if (t === "attachCharacterToTempSprite") {
        const actor = String(c.actor || "").trim();
        return actor ? `attachCharacterToTempSprite ${actor}` : "attachCharacterToTempSprite";
    }

    if (t === "jump") {
        const actor = String(c.actor || "").trim();
        const intensity = Number(c.intensity || 8);

        if (!actor) return "jump";

        return intensity === 8
            ? `jump ${actor}`
            : `jump ${actor} ${intensity}`;
    }

    if (t === "addProp") {
        const propIndex = String(c.propIndex || "").trim();
        const x = String(c.x || "").trim();
        const y = String(c.y || "").trim();
        const solidWidth = String(c.solidWidth || "").trim();
        const solidHeight = String(c.solidHeight || "").trim();
        const displayHeight = String(c.displayHeight || "").trim();

        let token = `addProp ${propIndex} ${x} ${y}`.trim();

        if (solidWidth) token += ` ${solidWidth}`;
        if (solidHeight) token += ` ${solidHeight}`;
        if (displayHeight) token += ` ${displayHeight}`;

        return token.trim();
    }

    if (t === "addFloorProp") {
        const propIndex = String(c.propIndex || "").trim();
        const x = String(c.x || "").trim();
        const y = String(c.y || "").trim();
        const solidWidth = String(c.solidWidth || "").trim();
        const solidHeight = String(c.solidHeight || "").trim();
        const displayHeight = String(c.displayHeight || "").trim();

        let token = `addFloorProp ${propIndex} ${x} ${y}`.trim();

        if (solidWidth) token += ` ${solidWidth}`;
        if (solidHeight) token += ` ${solidHeight}`;
        if (displayHeight) token += ` ${displayHeight}`;

        return token.trim();
    }

    if (t === "addBigProp") {
        const x = String(c.x || "").trim();
        const y = String(c.y || "").trim();
        const spriteIndex = String(c.spriteIndex || "").trim();

        return `addBigProp ${x} ${y} ${spriteIndex}`.trim();
    }

    if (t === "addTemporaryActor") {
        const quoteArg = (v) => {
            const s = String(v || "").trim();
            if (!s) return "";
            return /\s/.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s;
        };

        const actorKind = String(c.actorKind || "Character").trim() || "Character";

        const spriteAssetName =
            String(c.spriteAssetName || "").trim() ||
            String(c.assetName || "").trim().split("/").pop() ||
            "";

        const spriteWidth = String(c.spriteWidth ?? c.width ?? "").trim();
        const spriteHeight = String(c.spriteHeight ?? c.height ?? "").trim();
        const x = String(c.x ?? "").trim();
        const y = String(c.y ?? "").trim();
        const direction = String(c.direction ?? c.dir ?? "").trim();
        const breather = String(c.breather ?? "").trim();
        const overrideName = String(c.overrideName || "").trim();

        let token = `addTemporaryActor ${quoteArg(spriteAssetName)} ${spriteWidth} ${spriteHeight} ${x} ${y} ${direction}`.trim();

        if (breather) token += ` ${breather}`;
        if (actorKind) token += ` ${actorKind}`;
        if (overrideName) token += ` ${quoteArg(overrideName)}`;

        return token.trim();
    }


    if (t === "catQuestion") return "catQuestion";
    if (t === "cave") return "cave";

    if (t === "changeLocation") {
        const location = String(c.location || "").trim();
        return location ? `changeLocation ${location}` : "changeLocation";
    }

    if (t === "characterSelect") return "characterSelect";
    if (t === "elliotbooktalk") return "elliotbooktalk";

    if (t === "extendSourceRect") {
        const actor = String(c.actor || "").trim();
        const mode = String(c.mode || "").trim().toLowerCase();
        if (!actor) return "extendSourceRect";
        return mode === "reset"
            ? `extendSourceRect ${actor} reset`
            : `extendSourceRect ${actor}`;
    }

    if (t === "grandpaCandles") return "grandpaCandles";
    if (t === "grandpaEvaluation") return "grandpaEvaluation";
    if (t === "grandpaEvaluation2") return "grandpaEvaluation2";
    if (t === "halt") return "halt";
    if (t === "hospitaldeath") return "hospitaldeath";
    if (t === "minedeath") return "minedeath";
    if (t === "resetVariable") return "resetVariable";
    if (t === "rustyKey") return "rustyKey";
    if (t === "setRunning") return "setRunning";
    if (t === "startJittering") return "startJittering";
    if (t === "stopGlowing") return "stopGlowing";
    if (t === "stopJittering") return "stopJittering";
    if (t === "stopRunning") return "stopRunning";

    if (t === "stopAnimation") {
        const actor = String(c.actor || "").trim();
        return actor ? `stopAnimation ${actor}` : "stopAnimation farmer";
    }

    if (t === "speed") {
        const actor = String(c.actor || "").trim();
        const speed = String(c.speed || "").trim();

        if (!actor) return "speed";
        return `speed ${actor} ${speed || "3"}`;
    }


    if (t === "swimming") {
        const actor = String(c.actor || "").trim();
        return actor ? `swimming ${actor}` : "swimming";
    }

    if (t === "stopSwimming") {
        const actor = String(c.actor || "").trim();
        return actor ? `stopSwimming ${actor}` : "stopSwimming";
    }

    if (t === "textAboveHead") {
        const actor = (c.actor || "Abigail").trim() || "Abigail";
        return `textAboveHead ${actor} "${cpText(c.text)}"`;
    }



    if (t === "shake") {
        const actor = String(c.actor || "").trim();
        const duration = String(c.duration || "").trim();

        if (!actor) return "shake";
        return duration ? `shake ${actor} ${duration}` : `shake ${actor}`;
    }

    if (t === "addQuest") {
        const questId = String(c.questId || "").trim();
        return questId ? `addQuest ${questId}` : "addQuest";
    }

    if (t === "removeQuest") {
        const questId = String(c.questId || "").trim();
        return questId ? `removeQuest ${questId}` : "removeQuest";
    }

    if (t === "addSpecialOrder") {
        const orderId = String(c.orderId || "").trim();
        return orderId ? `addSpecialOrder ${orderId}` : "addSpecialOrder";
    }

    if (t === "removeSpecialOrder") {
        const orderId = String(c.orderId || "").trim();
        return orderId ? `removeSpecialOrder ${orderId}` : "removeSpecialOrder";
    }

    if (t === "addConversationTopic") {
        const topicId = String(c.topicId || "").trim();
        const length = String(c.length || "").trim();

        if (!topicId) return "";

        return length
            ? `addConversationTopic ${topicId} ${length}`
            : `addConversationTopic ${topicId}`;
    }


    if (!TEMPLATE_CMDS.has(t)) {
        const raw = String(c.raw || "").trim();
        if (!raw) return t;
        return `${t} ${raw}`.trim();
    }
    if (t === "farmerEat") return `farmerEat ${c.item || ""}`.trim();
    if (t === "pause") return `pause ${numOr(c.ms, 1000)}`;
    if (t === "speak") return `speak ${c.actor || ""} "${cpText(c.text)}"`;
    if (t === "splitSpeak") return `splitSpeak ${c.actor || "Abigail"} "${cpText(c.text)}"`;
    if (t === "message") return `message "${cpText(c.text)}"`;
    if (t === "move") return `move ${c.actor || ""} ${numOr(c.dx, 0)} ${numOr(c.dy, 1)} ${numOr(c.dir, 2)} ${boolOr(c.cont, false)}`;
    if (t === "warp") return `warp ${c.actor || ""} ${numOr(c.x, 0)} ${numOr(c.y, 0)} ${boolOr(c.cont, false)}`;
    if (t === "faceDirection") return `faceDirection ${c.actor || ""} ${numOr(c.dir, 2)} ${boolOr(c.cont, false)}`;
    if (t === "playMusic") return `playMusic ${c.track || ""}`.trim();
    if (t === "stopMusic") return "stopMusic";
    if (t === "playSound") return `playSound ${c.sound || ""}`.trim();
    if (t === "money") return `money ${numOr(c.amount, 0)}`;
    if (t === "friendship") return `friendship ${c.npc || ""} ${numOr(c.points, 250)}`;
    if (t === "emote") return `emote ${c.actor || ""} ${numOr(c.emote, 16)}`;
    if (t === "advancedMove") {
        const actor = (c.actor || "Abigail").trim() || "Abigail";
        const loop = String(c.loop ?? "true").trim() || "true";
        const steps = Array.isArray(c.steps) ? c.steps : [];

        const parts = steps.map(step => {
            const kind = String(step?.kind || "move").toLowerCase();

            if (kind === "pause") {
                return `${numOr(step?.dir, 2)} ${numOr(step?.ms, 1000)}`;
            }

            return `${numOr(step?.x, 0)} ${numOr(step?.y, 0)}`;
        }).filter(Boolean);

        return `advancedMove ${actor} ${loop}${parts.length ? " " + parts.join(" ") : ""}`.trim();
    }

    if (t === "stopAdvancedMoves") return "stopAdvancedMoves";

    if (t === "addLantern") {
        const spriteIndex = String(c.spriteIndex || "").trim();
        const x = String(c.x || "").trim();
        const y = String(c.y || "").trim();
        const radius = String(c.radius || "").trim();

        let s = "addLantern";
        if (spriteIndex) s += ` ${spriteIndex}`;
        if (x) s += ` ${x}`;
        if (y) s += ` ${y}`;
        if (radius) s += ` ${radius}`;
        return s;
    }

    if (t === "showFrame") {
        const actor = (c.actor || "").trim();
        const frame = numOr(c.frame, 0);
        const flip = (c.flip || "").trim();
        if (!actor) return flip ? `showFrame ${frame} ${flip}` : `showFrame ${frame}`;
        return flip ? `showFrame ${actor} ${frame} ${flip}` : `showFrame ${actor} ${frame}`;
    }

    if (t === "addObject") {
        const x = String(c.x || "").trim();
        const y = String(c.y || "").trim();
        const item = String(c.item || "").trim();
        const layer = String(c.layer || "").trim();

        let s = "addObject";
        if (x) s += ` ${x}`;
        if (y) s += ` ${y}`;
        if (item) s += ` ${item}`;
        if (layer) s += ` ${layer}`;
        return s;
    }

    if (t === "itemAboveHead") {
        const item = String(c.item || "").trim();
        const showMessageRaw = String(c.showMessage ?? "").trim().toLowerCase();

        if (!item) return "itemAboveHead";

        if (showMessageRaw === "" || showMessageRaw === "true")
            return `itemAboveHead ${item}`;

        return `itemAboveHead ${item} ${showMessageRaw === "false" ? "false" : "true"}`;
    }

    if (t === "viewport") {
        const viewportType = String(c.viewportType || "target").trim().toLowerCase();
        const targetType = String(c.targetType || "actor").trim().toLowerCase();

        const fade = String(c.fade || "false").trim().toLowerCase() === "true";
        const clamp = String(c.clamp || "false").trim().toLowerCase() === "true";
        const unfreeze = String(c.unfreeze || "false").trim().toLowerCase() === "true";

        if (viewportType === "move") {
            return `viewport move ${numOr(c.x, 0)} ${numOr(c.y, 0)} ${numOr(c.duration, 1000)}`;
        }

        if (targetType === "xy") {
            const parts = ["viewport", numOr(c.x, 0), numOr(c.y, 0)];
            if (clamp) parts.push("clamp");
            if (fade) parts.push("true");
            if (unfreeze) parts.push("unfreeze");
            return parts.join(" ").trim();
        }

        const parts = ["viewport", (c.actor || "player").trim() || "player"];
        if (clamp) parts.push("clamp");
        if (fade) parts.push("true");
        return parts.join(" ").trim();
    }

    if (t === "action") return `action ${(c.action || "")}`.trim();

    if (t === "addItem") {
        const item = (c.item || "").trim();
        const count = (c.count || "").trim();
        return count ? `addItem ${item} ${count}` : `addItem ${item}`;
    }

    if (t === "removeItem") {
        const item = (c.item || "").trim();
        const count = (c.count || "").trim();
        return count ? `removeItem ${item} ${count}` : `removeItem ${item}`;
    }

    if (t === "awardFestivalPrize") {
        const item = (c.item || "").trim();
        return item ? `awardFestivalPrize ${item}` : "awardFestivalPrize";
    }

    if (t === "addCookingRecipe") {
        const recipe = String(c.recipe || "").trim();
        return recipe ? `addCookingRecipe "${recipe}"` : "addCookingRecipe";
    }

    if (t === "addCraftingRecipe") {
        const recipe = String(c.recipe || "").trim();
        return recipe ? `addCraftingRecipe "${recipe}"` : "addCraftingRecipe";
    }

    if (t === "setSkipActions") return (c.actions || "").trim() ? `setSkipActions ${c.actions}` : "setSkipActions";
    if (t === "skippable") return "skippable";
    if (t === "end") {
        const endType = String(c.endType || "default").trim();

        if (endType === "default") return "end";
        if (endType === "bed") return "end bed";
        if (endType === "newDay") return "end newDay";
        if (endType === "warpOut") return "end warpOut";
        if (endType === "wedding") return "end wedding";

        if (endType === "position") {
            return `end position ${numOr(c.x, 0)} ${numOr(c.y, 0)}`;
        }

        if (endType === "invisible") {
            return `end invisible ${(c.npc || "").trim()}`.trim();
        }

        if (endType === "invisibleWarpOut") {
            return `end invisibleWarpOut ${(c.npc || "").trim()}`.trim();
        }

        if (endType === "dialogue") {
            const npc = (c.npc || "").trim();
            const text = String(c.text || "").replace(/"/g, '\\"');
            return `end dialogue ${npc} "${text}"`.trim();
        }

        if (endType === "dialogueWarpOut") {
            const npc = (c.npc || "").trim();
            const text = String(c.text || "").replace(/"/g, '\\"');
            return `end dialogueWarpOut ${npc} "${text}"`.trim();
        }

        return "end";
    }
    if (t === "fade") return (c.arg || "").trim() ? `fade ${(c.arg || "").trim()}` : "fade";
    if (t === "globalFade") return `globalFade ${(c.speed || "").trim()} ${(c.cont || "").trim()}`.trim();
    if (t === "globalFadeToClear") return `globalFadeToClear ${(c.speed || "").trim()} ${(c.cont || "").trim()}`.trim();



    if (t === "Raw") {
        const raw = (c.raw || "").trim();
        if (!raw) return "Raw";
        if (/^end(\s|$)/i.test(raw)) return raw.replace(/^end/i, "end");
        return raw;
    }
    const raw = String(c.raw || "").trim();

    if (raw) {
        return `${String(t || "").trim()} ${raw}`.trim();
    }

    return String(t || "").trim();
}

export function renderCmdTemplateHtml(c) {
    if (!_deps) throw new Error("commands.js not initialized: call initCommands() in tool.js");
    const { escapeHtml, renderCmdRawHtml, getLocations } = _deps;

    const t = c.type;

    if (t === "pause") return `
    <div class="field" style="min-width:150px;">
      <label>ms</label>
      <input class="num" type="number" value="${escapeHtml(c.ms || "1000")}" data-k="ms" />
    </div>
  `;

    if (t === "attachCharacterToTempSprite") return `
  <div class="field" style="min-width:170px;">
    <label>Actor</label>
    <input class="text"
           type="text"
           list="eb-dl-actors"
           autocomplete="off"
           value="${escapeHtml(c.actor || "")}"
           data-k="actor"
           placeholder="Select actor" />
  </div>
`;

    if (t === "addProp") return `
  <div class="field" style="min-width:110px;">
    <label>&nbsp;</label>
    <button class="btn" data-act="pick-festival-prop-sprite" type="button">Pick Prop</button>
  </div>

  <div class="field" style="min-width:110px;">
    <label>Prop Index</label>
    <input class="num"
           type="number"
           value="${escapeHtml(c.propIndex || "")}"
           data-k="propIndex"
           placeholder="index" />
  </div>

  <div class="field" style="min-width:100px;">
    <label>&nbsp;</label>
    <button class="btn" data-act="map" type="button">Pick X/Y</button>
  </div>

  <div class="field" style="min-width:95px;">
    <label>X</label>
    <input class="num" type="number" value="${escapeHtml(c.x || "")}" data-k="x" placeholder="x" />
  </div>

  <div class="field" style="min-width:95px;">
    <label>Y</label>
    <input class="num" type="number" value="${escapeHtml(c.y || "")}" data-k="y" placeholder="y" />
  </div>

  <div class="field" style="min-width:110px;">
    <label>Solid Width</label>
    <input class="num" type="number" value="${escapeHtml(c.solidWidth || "")}" data-k="solidWidth" placeholder="1" />
  </div>

  <div class="field" style="min-width:110px;">
    <label>Solid Height</label>
    <input class="num" type="number" value="${escapeHtml(c.solidHeight || "")}" data-k="solidHeight" placeholder="1" />
  </div>

  <div class="field" style="min-width:120px;">
    <label>Display Height</label>
    <input class="num" type="number" value="${escapeHtml(c.displayHeight || "")}" data-k="displayHeight" placeholder="solid height" />
  </div>

  <div class="field grow">
    <label>Description</label>
    <input class="text"
           type="text"
           disabled
           value="Solid festival prop using Maps/Festivals prop index." />
  </div>
`;

    if (t === "addFloorProp") return `
  <div class="field" style="min-width:110px;">
    <label>&nbsp;</label>
    <button class="btn" data-act="pick-festival-prop-sprite" type="button">Pick Prop</button>
  </div>

  <div class="field" style="min-width:110px;">
    <label>Prop Index</label>
    <input class="num"
           type="number"
           value="${escapeHtml(c.propIndex || "")}"
           data-k="propIndex"
           placeholder="index" />
  </div>

  <div class="field" style="min-width:100px;">
    <label>&nbsp;</label>
    <button class="btn" data-act="map" type="button">Pick X/Y</button>
  </div>

  <div class="field" style="min-width:95px;">
    <label>X</label>
    <input class="num" type="number" value="${escapeHtml(c.x || "")}" data-k="x" placeholder="x" />
  </div>

  <div class="field" style="min-width:95px;">
    <label>Y</label>
    <input class="num" type="number" value="${escapeHtml(c.y || "")}" data-k="y" placeholder="y" />
  </div>

  <div class="field" style="min-width:110px;">
    <label>Solid Width</label>
    <input class="num" type="number" value="${escapeHtml(c.solidWidth || "")}" data-k="solidWidth" placeholder="1" />
  </div>

  <div class="field" style="min-width:110px;">
    <label>Solid Height</label>
    <input class="num" type="number" value="${escapeHtml(c.solidHeight || "")}" data-k="solidHeight" placeholder="1" />
  </div>

  <div class="field" style="min-width:120px;">
    <label>Display Height</label>
    <input class="num" type="number" value="${escapeHtml(c.displayHeight || "")}" data-k="displayHeight" placeholder="solid height" />
  </div>

  <div class="field grow">
    <label>Description</label>
    <input class="text"
           type="text"
           disabled
           value="Non-solid festival prop using Maps/Festivals prop index." />
  </div>
`;

    if (t === "addBigProp") return `
  <div class="field" style="min-width:110px;">
    <label>&nbsp;</label>
    <button class="btn" data-act="pick-craftable-sprite" type="button">Pick Sprite</button>
  </div>

  <div class="field" style="min-width:110px;">
    <label>Sprite Index</label>
    <input class="num"
           type="number"
           value="${escapeHtml(c.spriteIndex || "")}"
           data-k="spriteIndex"
           placeholder="index" />
  </div>

  <div class="field" style="min-width:100px;">
    <label>&nbsp;</label>
    <button class="btn" data-act="map" type="button">Pick X/Y</button>
  </div>

  <div class="field" style="min-width:95px;">
    <label>X</label>
    <input class="num" type="number" value="${escapeHtml(c.x || "")}" data-k="x" placeholder="x" />
  </div>

  <div class="field" style="min-width:95px;">
    <label>Y</label>
    <input class="num" type="number" value="${escapeHtml(c.y || "")}" data-k="y" placeholder="y" />
  </div>
`;

    if (t === "addTemporaryActor") {
        const { getTempActorAssetOptions } = _deps;

        const actorKind = String(c.actorKind || "Character").trim() || "Character";
        const assetName = String(c.assetName || "").trim();
        const spriteWidth = String(c.spriteWidth ?? c.width ?? (actorKind === "Character" ? "16" : "16"));
        const spriteHeight = String(c.spriteHeight ?? c.height ?? (actorKind === "Character" ? "32" : "16"));
        const direction = String(c.direction ?? c.dir ?? "2");
        const breather = String(c.breather ?? "true");
        const overrideName = String(c.overrideName || "").trim();

        const options = Array.isArray(getTempActorAssetOptions?.(actorKind))
            ? getTempActorAssetOptions(actorKind)
            : [];

        return `
  <div class="field" style="min-width:160px;">
    <label>Kind</label>
    <select class="select" data-k="actorKind">
      <option value="Character" ${actorKind === "Character" ? "selected" : ""}>Character</option>
      <option value="Animal" ${actorKind === "Animal" ? "selected" : ""}>Animal</option>
      <option value="Monster" ${actorKind === "Monster" ? "selected" : ""}>Monster</option>
    </select>
  </div>

  <div class="field grow" style="min-width:260px;">
    <label>Sprite Asset</label>
    <select class="select" data-k="assetName">
      <option value="">(select sprite)</option>
      ${options.map(o => `
        <option value="${escapeHtml(o.assetName || "")}" ${String(o.assetName || "") === assetName ? "selected" : ""}>
          ${escapeHtml(o.name || o.assetName || "")}
        </option>
      `).join("")}
    </select>
  </div>

  <div class="field" style="min-width:110px;">
    <label>&nbsp;</label>
    <button class="btn" data-act="preview-temp-actor" type="button">Preview</button>
  </div>

  <div class="field" style="min-width:100px;">
    <label>&nbsp;</label>
    <button class="btn" data-act="map" type="button">Pick X/Y</button>
  </div>

  <div class="field" style="min-width:95px;">
    <label>X</label>
    <input class="num" type="number" value="${escapeHtml(c.x || "")}" data-k="x" placeholder="x" />
  </div>

  <div class="field" style="min-width:95px;">
    <label>Y</label>
    <input class="num" type="number" value="${escapeHtml(c.y || "")}" data-k="y" placeholder="y" />
  </div>

  <div class="field" style="min-width:110px;">
    <label>Width</label>
    <input class="num" type="number" value="${escapeHtml(spriteWidth)}" data-k="spriteWidth" placeholder="16" />
  </div>

  <div class="field" style="min-width:110px;">
    <label>Height</label>
    <input class="num" type="number" value="${escapeHtml(spriteHeight)}" data-k="spriteHeight" placeholder="32" />
  </div>

  <div data-tempactor-block>
    <div data-tempactor-row>
      <div class="field">
        <label>Direction</label>
        <select class="select" data-k="direction">
          <option value="0" ${direction === "0" ? "selected" : ""}>Up</option>
          <option value="1" ${direction === "1" ? "selected" : ""}>Right</option>
          <option value="2" ${direction === "2" ? "selected" : ""}>Down</option>
          <option value="3" ${direction === "3" ? "selected" : ""}>Left</option>
        </select>
      </div>

      <div class="field">
        <label>Breather</label>
        <select class="select" data-k="breather">
          <option value="true" ${breather === "true" ? "selected" : ""}>true</option>
          <option value="false" ${breather === "false" ? "selected" : ""}>false</option>
        </select>
      </div>

      <div class="field">
        <label>Override Name</label>
        <input class="text" type="text" value="${escapeHtml(overrideName)}" data-k="overrideName" placeholder="optional" />
      </div>
    </div>
  </div>
`;
    }


    if (t === "jump") return `
  <div class="field" style="min-width:170px;">
    <label>Actor</label>
    <input class="text"
           type="text"
           list="eb-dl-actors"
           autocomplete="off"
           value="${escapeHtml(c.actor || "")}"
           data-k="actor"
           placeholder="Select actor" />
  </div>

  <div class="field" style="width:90px;">
    <label>Intensity</label>
    <input class="text"
           type="number"
           min="1"
           value="${escapeHtml(c.intensity ?? 8)}"
           data-k="intensity" />
  </div>
`;

    if (t === "catQuestion") return `
  <div class="muted small" style="padding-top:22px;">
    No parameters.
  </div>
`;

    if (t === "cave") return `
  <div class="muted small" style="padding-top:22px;">
    No parameters.
  </div>
`;

    if (t === "changeLocation") {
        const locations = Array.isArray(getLocations?.()) ? getLocations() : [];
        const current = String(c.location || "").trim();

        return `
  <div class="field" style="min-width:240px;">
    <label>Location</label>
    <select class="select" data-k="location">
      <option value="">(select location)</option>
      ${locations.map(loc => `
        <option value="${escapeHtml(loc)}" ${loc === current ? "selected" : ""}>${escapeHtml(loc)}</option>
      `).join("")}
    </select>
  </div>
`;
    }

    if (t === "characterSelect") return `
  <div class="muted small" style="padding-top:22px;">
    No parameters.
  </div>
`;

    if (t === "elliotbooktalk") return `
  <div class="muted small" style="padding-top:22px;">
    No parameters.
  </div>
`;

    if (t === "extendSourceRect") return `
  <div class="field" style="min-width:170px;">
    <label>Actor</label>
    <input class="text"
           type="text"
           list="eb-dl-actors"
           autocomplete="off"
           value="${escapeHtml(c.actor || "")}"
           data-k="actor"
           placeholder="Select actor" />
  </div>

  <div class="field" style="min-width:160px;">
    <label>Mode</label>
    <select class="select" data-k="mode">
      <option value="" ${!String(c.mode || "").trim() ? "selected" : ""}>extend</option>
      <option value="reset" ${String(c.mode || "").trim().toLowerCase() === "reset" ? "selected" : ""}>reset</option>
    </select>
  </div>
`;

    if (t === "fade") return `
  <div class="field" style="min-width:160px;">
    <label>Mode</label>
    <select class="select" data-k="arg">
      <option value="" ${!String(c.arg || "").trim() ? "selected" : ""}>fade out</option>
      <option value="unfade" ${String(c.arg || "").trim().toLowerCase() === "unfade" ? "selected" : ""}>unfade</option>
    </select>
  </div>
`;

    if (t === "grandpaCandles") return `
  <div class="muted small" style="padding-top:22px;">No parameters.</div>
`;

    if (t === "grandpaEvaluation") return `
  <div class="muted small" style="padding-top:22px;">No parameters.</div>
`;

    if (t === "grandpaEvaluation2") return `
  <div class="muted small" style="padding-top:22px;">No parameters.</div>
`;

    if (t === "halt") return `
  <div class="muted small" style="padding-top:22px;">No parameters.</div>
`;

    if (t === "hospitaldeath") return `
  <div class="muted small" style="padding-top:22px;">No parameters.</div>
`;

    if (t === "minedeath") return `
  <div class="muted small" style="padding-top:22px;">No parameters.</div>
`;

    if (t === "resetVariable") return `
  <div class="muted small" style="padding-top:22px;">No parameters.</div>
`;

    if (t === "rustyKey") return `
  <div class="muted small" style="padding-top:22px;">No parameters.</div>
`;

    if (t === "setRunning") return `
  <div class="muted small" style="padding-top:22px;">No parameters.</div>
`;

    if (t === "startJittering") return `
  <div class="muted small" style="padding-top:22px;">No parameters.</div>
`;

    if (t === "stopAnimation") return `
  <div class="field" style="min-width:170px;">
    <label>Actor</label>
    <input class="text"
           type="text"
           list="eb-dl-actors"
           autocomplete="off"
           value="${escapeHtml(c.actor || "farmer")}"
           data-k="actor"
           placeholder="Select actor" />
  </div>
`;

    if (t === "stopGlowing") return `
  <div class="muted small" style="padding-top:22px;">No parameters.</div>
`;

    if (t === "stopJittering") return `
  <div class="muted small" style="padding-top:22px;">No parameters.</div>
`;

    if (t === "stopRunning") return `
  <div class="muted small" style="padding-top:22px;">No parameters.</div>
`;

    if (t === "swimming") return `
  <div class="field" style="min-width:170px;">
    <label>Actor</label>
    <input class="text"
           type="text"
           list="eb-dl-actors"
           autocomplete="off"
           value="${escapeHtml(c.actor || "")}"
           data-k="actor"
           placeholder="Select actor" />
  </div>
`;

    if (t === "stopSwimming") return `
  <div class="field" style="min-width:170px;">
    <label>Actor</label>
    <input class="text"
           type="text"
           list="eb-dl-actors"
           autocomplete="off"
           value="${escapeHtml(c.actor || "")}"
           data-k="actor"
           placeholder="Select actor" />
  </div>
`;

    if (t === "speed") return `
  <div class="field" style="min-width:170px;">
    <label>Actor</label>
    <input class="text"
           type="text"
           list="eb-dl-actors"
           autocomplete="off"
           value="${escapeHtml(c.actor || "")}"
           data-k="actor"
           placeholder="Select actor" />
  </div>

  <div class="field" style="min-width:130px;">
    <label>Speed</label>
    <input class="num"
           type="number"
           value="${escapeHtml(c.speed || "3")}"
           data-k="speed"
           min="0"
           step="1" />
  </div>
`;

    if (t === "addConversationTopic") return `
    <div class="field grow">
      <label>Topic ID</label>
      <input class="text"
             type="text"
             value="${escapeHtml(c.topicId || "")}"
             data-k="topicId"
             placeholder="Example: MyMod_SubmasIntroduction" />
    </div>

    <div class="field" style="min-width:140px;">
      <label>Length (days)</label>
      <input class="num"
             type="number"
             value="${escapeHtml(c.length || "")}"
             data-k="length"
             placeholder="Optional" />
    </div>
  `;

    if (t === "shake") return `
  <div class="field" style="min-width:170px;">
    <label>Actor</label>
    <input class="text"
           type="text"
           list="eb-dl-actors"
           autocomplete="off"
           value="${escapeHtml(c.actor || "")}"
           data-k="actor"
           placeholder="Select actor" />
  </div>

  <div class="field" style="min-width:130px;">
    <label>Duration (ms)</label>
    <input class="num"
           type="number"
           value="${escapeHtml(c.duration || "1000")}"
           data-k="duration"
           min="0"
           step="1" />
  </div>
`;

    if (t === "addQuest") return `
  <div class="field grow" style="min-width:260px;">
    <label>Quest ID</label>
    <input class="text"
           type="text"
           list="eb-dl-quests"
           autocomplete="off"
           value="${escapeHtml(c.questId || "")}"
           data-k="questId"
           placeholder="Select or type quest ID" />
  </div>
`;

    if (t === "removeQuest") return `
  <div class="field grow" style="min-width:260px;">
    <label>Quest ID</label>
    <input class="text"
           type="text"
           list="eb-dl-quests"
           autocomplete="off"
           value="${escapeHtml(c.questId || "")}"
           data-k="questId"
           placeholder="Select or type quest ID" />
  </div>
`;

    if (t === "addSpecialOrder") return `
  <div class="field grow" style="min-width:260px;">
    <label>Special Order ID</label>
    <input class="text"
           type="text"
           list="eb-dl-special-orders"
           autocomplete="off"
           value="${escapeHtml(c.orderId || "")}"
           data-k="orderId"
           placeholder="Select or type special order ID" />
  </div>
`;

    if (t === "removeSpecialOrder") return `
  <div class="field grow" style="min-width:260px;">
    <label>Special Order ID</label>
    <input class="text"
           type="text"
           list="eb-dl-special-orders"
           autocomplete="off"
           value="${escapeHtml(c.orderId || "")}"
           data-k="orderId"
           placeholder="Select or type special order ID" />
  </div>
`;


    if (t === "speak" || t === "splitSpeak") return `
    <div class="field" style="min-width:160px;">
      <label>Actor</label>
      <input class="text" type="text" list="eb-dl-actors" value="${escapeHtml(c.actor || "")}" data-k="actor" />
    </div>
    <div class="field grow eb-cmd-text-field">
      <label>Text</label>
      <textarea class="text eb-cmd-textarea"
                style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;"
                data-k="text"
                rows="2"
                placeholder="${t === "splitSpeak" ? "Yes~No" : "It was fun talking to you today.$h"}">${escapeHtml(c.text || "")}</textarea>
    </div>
  `;

    if (t === "farmerEat") return `
  <div class="field grow" style="min-width:220px;">
    <label>Object ID</label>
    <input class="text"
           type="text"
           list="eb-dl-objects"
           autocomplete="off"
           value="${escapeHtml(c.item || "")}"
           data-k="item"
           placeholder="object id e.g. (O)194" />
  </div>

  <div class="field grow">
    <label>Description</label>
    <input class="text"
           type="text"
           disabled
           value="Make farmer eat an object item. Drink animation plays if IsDrink is true." />
  </div>
`;


    if (t === "message") return `
    <div class="field grow eb-cmd-text-field">
      <label>Text</label>
      <textarea class="text eb-cmd-textarea"
                style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;"
                data-k="text"
                rows="2"
                placeholder="Message text here">${escapeHtml(c.text || "")}</textarea>
    </div>
  `;

    if (t === "addLantern") return `
  <div class="field" style="min-width:110px;">
    <label>&nbsp;</label>
    <button class="btn" data-act="pick-lantern-sprite" type="button">Pick Sprite</button>
  </div>

  <div class="field" style="min-width:110px;">
    <label>Sprite Index</label>
    <input class="num"
           type="number"
           value="${escapeHtml(c.spriteIndex || "")}"
           data-k="spriteIndex"
           placeholder="index" />
  </div>

  <div class="field" style="min-width:100px;">
    <label>&nbsp;</label>
    <button class="btn" data-act="map" type="button">Pick X/Y</button>
  </div>

  <div class="field" style="min-width:95px;">
    <label>X</label>
    <input class="num"
           type="number"
           value="${escapeHtml(c.x || "")}"
           data-k="x"
           placeholder="x" />
  </div>

  <div class="field" style="min-width:95px;">
    <label>Y</label>
    <input class="num"
           type="number"
           value="${escapeHtml(c.y || "")}"
           data-k="y"
           placeholder="y" />
  </div>

  <div class="field" style="min-width:110px;">
    <label>Light Radius</label>
    <input class="num"
           type="number"
           value="${escapeHtml(c.radius || "")}"
           data-k="radius"
           placeholder="0" />
  </div>
`;


    if (t === "addObject") return `
  <div class="field" style="min-width:100px;">
    <label>&nbsp;</label>
    <button class="btn" data-act="map" type="button">Pick X/Y</button>
  </div>

  <div class="field" style="min-width:95px;">
    <label>X</label>
    <input class="num" type="number" value="${escapeHtml(c.x || "")}" data-k="x" placeholder="x" />
  </div>

  <div class="field" style="min-width:95px;">
    <label>Y</label>
    <input class="num" type="number" value="${escapeHtml(c.y || "")}" data-k="y" placeholder="y" />
  </div>

  <div class="field grow" style="min-width:220px;">
    <label>Item ID</label>
    <input class="text"
           type="text"
           list="eb-dl-items"
           autocomplete="off"
           value="${escapeHtml(c.item || "")}"
           data-k="item"
           placeholder="qualified or object id" />
  </div>

  <div class="field" style="min-width:95px;">
    <label>Layer</label>
    <input class="num" type="number" value="${escapeHtml(c.layer || "")}" data-k="layer" placeholder="-1" />
  </div>

  <div class="field grow">
    <label>Description</label>
    <input class="text"
           type="text"
           disabled
           value="Place a temporary object sprite at X/Y. Layer controls draw depth." />
  </div>
`;

    if (t === "message") return `
    <div class="field grow">
      <label>Text</label>
      <input class="text"
             style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;"
             type="text" value="${escapeHtml(c.text || "")}" data-k="text" />
    </div>
  `;


    if (t === "advancedMove") {
        const steps = Array.isArray(c.steps) ? c.steps : [];

        const faceOptions = [
            { value: "0", label: "0 - Up" },
            { value: "1", label: "1 - Right" },
            { value: "2", label: "2 - Down" },
            { value: "3", label: "3 - Left" }
        ];

        const rowsHtml = steps.map((step, idx) => {
            const kind = String(step?.kind || "move").toLowerCase();

            if (kind === "pause") {
                return `
                <div class="row eb-row eb-row-compact" data-adv-row="${idx}" data-adv-index="${idx}" style="margin-top:8px;">
                  <div class="field" style="min-width:52px;">
                    <label>&nbsp;</label>
                    <button class="btn adv-drag-handle" data-act="adv-drag" data-adv-index="${idx}" type="button" draggable="true" title="Drag row">≡</button>
                  </div>

                  <div class="field" style="min-width:140px;">
                    <label>Type</label>
                    <input class="text" type="text" value="Pause" disabled />
                  </div>

                  <div class="field" style="min-width:140px;">
                    <label>Face</label>
                    <select class="select" data-adv-kind="pause" data-adv-k="dir" data-adv-index="${idx}">
                      ${faceOptions.map(v => `
                        <option value="${v.value}" ${String(step?.dir ?? "2") === v.value ? "selected" : ""}>${v.label}</option>
                      `).join("")}
                    </select>
                  </div>

                  <div class="field" style="min-width:110px;">
                    <label>Ms</label>
                    <input class="num" type="number" value="${escapeHtml(step?.ms ?? "1000")}" data-adv-kind="pause" data-adv-k="ms" data-adv-index="${idx}" />
                  </div>

                  <div class="field" style="min-width:52px;">
                    <label>&nbsp;</label>
                    <button class="btn" data-act="adv-dup" data-adv-index="${idx}" type="button">⎘</button>
                  </div>

                  <div class="field" style="min-width:52px;">
                    <label>&nbsp;</label>
                    <button class="btn danger" data-act="adv-remove" data-adv-index="${idx}" type="button">X</button>
                  </div>
                </div>
                `;
            }

            return `
                <div class="row eb-row eb-row-compact" data-adv-row="${idx}" data-adv-index="${idx}" style="margin-top:8px;">
                  <div class="field" style="min-width:52px;">
                    <label>&nbsp;</label>
                    <button class="btn adv-drag-handle" data-act="adv-drag" data-adv-index="${idx}" type="button" draggable="true" title="Drag row">≡</button>
                  </div>

                  <div class="field" style="min-width:140px;">
                    <label>Type</label>
                    <input class="text" type="text" value="Move" disabled />
                  </div>

                  <div class="field" style="min-width:95px;">
                    <label>X</label>
                    <input class="num" type="number" value="${escapeHtml(step?.x ?? "0")}" data-adv-kind="move" data-adv-k="x" data-adv-index="${idx}" />
                  </div>

                  <div class="field" style="min-width:95px;">
                    <label>Y</label>
                    <input class="num" type="number" value="${escapeHtml(step?.y ?? "0")}" data-adv-kind="move" data-adv-k="y" data-adv-index="${idx}" />
                  </div>

                  <div class="field" style="min-width:52px;">
                    <label>&nbsp;</label>
                    <button class="btn" data-act="adv-dup" data-adv-index="${idx}" type="button">⎘</button>
                  </div>

                  <div class="field" style="min-width:52px;">
                    <label>&nbsp;</label>
                    <button class="btn danger" data-act="adv-remove" data-adv-index="${idx}" type="button">X</button>
                  </div>
                </div>
                `;
        }).join("");

        return `
              <div class="field" style="min-width:160px;">
                <label>Actor</label>
                <input class="text"
                       type="text"
                       list="eb-dl-actors"
                       value="${escapeHtml(c.actor || "")}"
                       data-k="actor" />
              </div>

              <div class="field" style="min-width:110px;">
                <label>Loop</label>
                <select class="select" data-k="loop">
                  <option value="true" ${String(c.loop ?? "true") === "true" ? "selected" : ""}>true</option>
                  <option value="false" ${String(c.loop ?? "true") === "false" ? "selected" : ""}>false</option>
                </select>
              </div>

              <div class="field" style="min-width:120px;">
                <label>&nbsp;</label>
                <button class="btn" data-act="adv-add-move" type="button">+ Move</button>
              </div>

              <div class="field" style="min-width:125px;">
                <label>&nbsp;</label>
                <button class="btn" data-act="adv-add-pause" type="button">+ Pause</button>
              </div>

            <div style="flex:1 1 100%; min-width:100%;"></div>

            <div class="field" style="flex:1 1 100%; min-width:100%; padding:0; margin:0;">
              <div data-adv-block>
                ${rowsHtml}
              </div>
            </div>
            `;
    }


    if (t === "stopAdvancedMoves") return `
          <div class="field grow">
            <label>Description</label>
            <input class="text"
                   type="text"
                   disabled
                   value="Stops all advancedMove paths from all actors." />
          </div>
    `;



    if (t === "move") return `
    <div class="field" style="min-width:160px;">
      <label>Actor</label>
      <input class="text" type="text" list="eb-dl-actors" value="${escapeHtml(c.actor || "Abigail")}" data-k="actor" />
    </div>
    <div class="field" style="min-width:100px;">
  <label>&nbsp;</label>
  <button class="btn" data-act="map" type="button">Pick X/Y</button>
</div>
     
    <div class="field" style="min-width:110px;">
      <label>Dir</label>
      <select class="select" data-k="dir">
        ${[
            { value: "0", label: "0 - Up" },
            { value: "1", label: "1 - Right" },
            { value: "2", label: "2 - Down" },
            { value: "3", label: "3 - Left" }
        ].map(v => `<option value="${v.value}" ${String(c.dir || "2") === String(v.value) ? "selected" : ""}>${v.label}</option>`).join("")}
      </select>
    </div>
    <div class="field" style="min-width:100px;" data-axis-wrap="dx">
      <label>ΔX</label>
      <input class="num" type="number" value="${escapeHtml(c.dx || "0")}" data-k="dx" />
    </div>
    <div class="field" style="min-width:100px;" data-axis-wrap="dy">
      <label>ΔY</label>
      <input class="num" type="number" value="${escapeHtml(c.dy || "1")}" data-k="dy" />
    </div>
    <div class="field" style="min-width:120px;">
      <label>Cont</label>
      <select class="select" data-k="cont">
        ${["false", "true"].map(v => `<option value="${v}" ${(c.cont || "false") === v ? "selected" : ""}>${v}</option>`).join("")}
      </select>
    </div>

    <div class="field" style="min-width:140px;">
      <label>Last Spot</label>
      <input class="text" type="text" value="" data-spot="last" readonly />
    </div>
    <div class="field" style="min-width:160px;">
      <label>Current Spot</label>
      <input class="text" type="text" value="" data-spot="cur" readonly />
    </div>
  `;

    if (t === "warp") return `
  <div class="field" style="min-width:160px;">
    <label>Actor</label>
    <input class="text" type="text" list="eb-dl-actors" value="${escapeHtml(c.actor || "Abigail")}" data-k="actor" />
  </div>
  <div class="field" style="min-width:100px;">
  <label>&nbsp;</label>
  <button class="btn" data-act="map" type="button">Pick X/Y</button>
</div>
  <div class="field" style="min-width:95px;">
    <label>X</label>
    <input class="num" type="number" value="${escapeHtml(c.x || "0")}" data-k="x" />
  </div>
  <div class="field" style="min-width:95px;">
    <label>Y</label>
    <input class="num" type="number" value="${escapeHtml(c.y || "0")}" data-k="y" />
  </div>
  <div class="field" style="min-width:120px;">
    <label>Cont</label>
    <select class="select" data-k="cont">
      ${["false", "true"].map(v => `<option value="${v}" ${(c.cont || "false") === v ? "selected" : ""}>${v}</option>`).join("")}
    </select>
  </div>
`;

    if (t === "faceDirection") return `
  <div class="field" style="min-width:160px;">
    <label>Actor</label>
    <input class="text" type="text" list="eb-dl-actors" value="${escapeHtml(c.actor || "Abigail")}" data-k="actor" />
  </div>


  <div class="field" style="min-width:200px;">
    <label>Dir</label>
    <select class="select" data-k="dir">
      ${[
            { value: "0", label: "0 - Up" },
            { value: "1", label: "1 - Right" },
            { value: "2", label: "2 - Down" },
            { value: "3", label: "3 - Left" }
        ].map(v => `<option value="${v.value}" ${(c.dir || "2") === v.value ? "selected" : ""}>${v.label}</option>`).join("")}
    </select>
  </div>
  <div class="field" style="min-width:200px;">
    <label>Cont</label>
    <select class="select" data-k="cont">
      ${["false", "true"].map(v => `<option value="${v}" ${(c.cont || "false") === v ? "selected" : ""}>${v}</option>`).join("")}
    </select>
  </div>
`;

    if (t === "emote") return `
      <div class="field" style="min-width:200px;">
        <label>Actor</label>
        <input class="text" type="text" list="eb-dl-actors" value="${escapeHtml(c.actor || "Abigail")}" data-k="actor" />
      </div>

      <div class="field" style="min-width:220px;">
        <label>Emote</label>
        <select class="select" data-k="emote">
          ${EMOTE_OPTIONS.map(e => {
        const v = String(e.value);
        const cur = String(c.emote ?? "16");
        const text = `${v} — ${e.label}`;
        return `<option value="${v}" ${cur === v ? "selected" : ""}>${escapeHtml(text)}</option>`;
    }).join("")}
        </select>
      </div>
    `;

    if (t === "playMusic") return `
      <div class="field grow">
        <label>Track</label>
        <input class="text"
               type="text"
               list="eb-dl-music"
               autocomplete="off"
               value="${escapeHtml(c.track || "")}"
               data-k="track"
               placeholder="start typing (e.g. spring1)" />
      </div>
    `;

    if (t === "stopMusic") return `<div class="field grow"><label>Info</label><div class="muted small">Stops music.</div></div>`;

    if (t === "playSound") return `
      <div class="field grow">
        <label>Sound</label>
        <input class="text"
               type="text"
               list="eb-dl-sounds"
               autocomplete="off"
               value="${escapeHtml(c.sound || "")}"
               data-k="sound"
               placeholder="start typing a sound cue ID" />
      </div>
    `;

    if (t === "money") return `
    <div class="field" style="min-width:160px;">
      <label>Amount</label>
      <input class="num" type="number" value="${escapeHtml(c.amount || "0")}" data-k="amount" />
    </div>
  `;

    if (t === "friendship") return `
    <div class="field" style="min-width:160px;">
      <label>NPC</label>
      <input class="text" type="text" list="eb-dl-npcs" value="${escapeHtml(c.npc || "Abigail")}" data-k="npc" />
    </div>
    <div class="field" style="min-width:140px;">
      <label>Pts</label>
      <input class="num" type="number" value="${escapeHtml(c.points || "250")}" data-k="points" />
    </div>
  `;

    if (t === "showFrame") return `
    <div class="field" style="min-width:160px;">
      <label>Actor</label>
      <input class="text" type="text" list="eb-dl-actors" value="${escapeHtml(c.actor || "")}" data-k="actor" />
    </div>
    <div class="field" style="min-width:120px;">
      <label>Frame</label>
      <input class="num" type="number" value="${escapeHtml(c.frame || "0")}" data-k="frame" />
    </div>
    <div class="field" style="min-width:120px;">
      <label>Flip</label>
      <select class="select" data-k="flip">
        ${["", "false", "true"].map(v => `<option value="${v}" ${(c.flip || "") === v ? "selected" : ""}>${v || "(none)"}</option>`).join("")}
      </select>
    </div>
  `;

    if (t === "viewport") {
        const viewportType = String(c.viewportType || "target");
        const targetType = String(c.targetType || "actor");
        const fade = String(c.fade || "false");
        const clamp = String(c.clamp || "false");
        const unfreeze = String(c.unfreeze || "false");

        const yesNo = (current) => ["false", "true"].map(v =>
            `<option value="${v}" ${String(current) === v ? "selected" : ""}>${v === "true" ? "Yes" : "No"}</option>`
        ).join("");

        let html = `
            <div class="field" style="min-width:180px;">
                <label>Viewport Type</label>
                <select class="select" data-k="viewportType">
                <option value="move" ${viewportType === "move" ? "selected" : ""}>Viewport Move</option>
                <option value="target" ${viewportType === "target" ? "selected" : ""}>Viewport Target</option>
                </select>
            </div>
            `;

        if (viewportType === "move") {
            html += `
                <div class="field" style="min-width:140px;">
                  <label>&nbsp;</label>
                  <button class="btn" data-act="map" type="button">Pick Viewport X/Y</button>
                </div>
                <div class="field" style="min-width:95px;">
                <label>X</label>
                <input class="num" type="number" value="${escapeHtml(c.x || "0")}" data-k="x" />
                </div>
                <div class="field" style="min-width:95px;">
                <label>Y</label>
                <input class="num" type="number" value="${escapeHtml(c.y || "0")}" data-k="y" />
                </div>
                <div class="field" style="min-width:150px;">
                <label>Duration (ms)</label>
                <input class="num" type="number" value="${escapeHtml(c.duration || c.ms || "1000")}" data-k="duration" />
                </div>
            `;
            return html;
        }

        html += `
            <div class="field" style="min-width:160px;">
                <label>Target Type</label>
                <select class="select" data-k="targetType">
                <option value="actor" ${targetType === "actor" ? "selected" : ""}>Actor</option>
                <option value="xy" ${targetType === "xy" ? "selected" : ""}>Coordinates</option>
                </select>
            </div>
            `;

        if (targetType === "actor") {
            html += `
                <div class="field" style="min-width:170px;">
                <label>Actor</label>
                <input class="text" type="text" list="eb-dl-actors" value="${escapeHtml(c.actor || "player")}" data-k="actor" />
                </div>
                <div class="field" style="min-width:130px;">
                <label>Clamp</label>
                <select class="select" data-k="clamp">
                    ${yesNo(clamp)}
                </select>
                </div>
                <div class="field" style="min-width:130px;">
                <label>Fade</label>
                <select class="select" data-k="fade">
                    ${yesNo(fade)}
                </select>
                </div>
            `;
            return html;
        }

        html += `
                <div class="field" style="min-width:140px;">
                    <label>&nbsp;</label>
                    <button class="btn" data-act="mapViewportXY" type="button">Pick Viewport X/Y</button>
                </div>
                <div class="field" style="min-width:95px;">
                    <label>X</label>
                    <input class="num" type="number" value="${escapeHtml(c.x || "0")}" data-k="x" />
                </div>
                <div class="field" style="min-width:95px;">
                    <label>Y</label>
                    <input class="num" type="number" value="${escapeHtml(c.y || "0")}" data-k="y" />
                </div>
                <div class="field" style="min-width:130px;">
                    <label>Clamp</label>
                    <select class="select" data-k="clamp">
                    ${yesNo(clamp)}
                    </select>
                </div>
                <div class="field" style="min-width:130px;">
                    <label>Fade</label>
                    <select class="select" data-k="fade">
                    ${yesNo(fade)}
                    </select>
                </div>
                <div class="field" style="min-width:130px;">
                    <label>Unfreeze</label>
                    <select class="select" data-k="unfreeze">
                    ${yesNo(unfreeze)}
                    </select>
                </div>
                `;

        return html;
    }

    if (t === "action") return `
    <div class="field grow">
      <label>Action</label>
      <input class="text"
             style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;"
             type="text" value="${escapeHtml(c.action || "AddMoney 500")}" data-k="action" />
    </div>
  `;

    if (t === "addItem" || t === "removeItem") return `
    <div class="field" style="min-width:220px;">
      <label>Item</label>
      <input class="text"
             style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;"
             type="text"
             list="eb-dl-items"
             autocomplete="off"
             value="${escapeHtml(c.item || "(O)72")}"
             data-k="item" />
    </div>

    <div class="field" style="min-width:90px;">
      <label>Count</label>
      <input class="text"
             type="text"
             value="${escapeHtml(c.count || "")}"
             data-k="count"
             placeholder="(opt)" />
    </div>
  `;

    if (t === "itemAboveHead") return `
  <div class="field" style="min-width:260px;">
    <label>Type / Item ID</label>
    <input class="text"
           type="text"
           list="eb-dl-item-above-head"
           autocomplete="off"
           value="${escapeHtml(c.item || "")}"
           data-k="item"
           placeholder="leave blank for furnace blueprint" />
  </div>

  <div class="field" style="min-width:150px;">
    <label>Show Message</label>
    <select class="text" data-k="showMessage">
      <option value="" ${String(c.showMessage ?? "") === "" ? "selected" : ""}>Default (true)</option>
      <option value="true" ${String(c.showMessage ?? "") === "true" ? "selected" : ""}>True</option>
      <option value="false" ${String(c.showMessage ?? "") === "false" ? "selected" : ""}>False</option>
    </select>
  </div>

  <div class="field grow">
    <label>Description</label>
    <input class="text"
           type="text"
           disabled
           value="Leave blank to show the furnace blueprint with no message. itemAboveHead can interrupt following dialogue unless you add about a 1200ms pause after it." />
  </div>
`;

    if (t === "awardFestivalPrize") return `
  <div class="field" style="min-width:220px;">
    <label>Item ID</label>
    <input class="text"
           style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;"
           type="text"
           list="eb-dl-items"
           autocomplete="off"
           value="${escapeHtml(c.item || "(O)72")}"
           data-k="item"
           placeholder="select an item id" />
  </div>

  <div class="field grow">
    <label>Description</label>
    <input class="text"
           type="text"
           value="Festival prize item ID. Preview builds as: awardFestivalPrize <item id>"
           disabled />
  </div>
`;

    if (t === "addCookingRecipe") return `
  <div class="field grow" style="min-width:260px;">
    <label>Recipe</label>
    <input class="text"
           type="text"
           list="eb-dl-cooking-recipes"
           autocomplete="off"
           value="${escapeHtml(c.recipe || "")}"
           data-k="recipe"
           placeholder="start typing a cooking recipe" />
  </div>
`;

    if (t === "addCraftingRecipe") return `
  <div class="field grow" style="min-width:260px;">
    <label>Recipe</label>
    <input class="text"
           type="text"
           list="eb-dl-crafting-recipes"
           autocomplete="off"
           value="${escapeHtml(c.recipe || "")}"
           data-k="recipe"
           placeholder="start typing a crafting recipe" />
  </div>
`;

    if (t === "setSkipActions") return `
    <div class="field grow">
      <label>Actions</label>
      <input class="text"
             style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;"
             type="text" value="${escapeHtml(c.actions || "")}" data-k="actions" placeholder="AddItem (O)72#AddMoney 500" />
    </div>
  `;

    if (t === "skippable") return `<div class="field grow"><label>Info</label><div class="muted small">Allows skipping from this point.</div></div>`;

    if (t === "end") {
        const endType = String(c.endType || "default");

        const typeOptions = [
            { value: "default", label: "Default" },
            { value: "bed", label: "Bed" },
            { value: "dialogue", label: "Dialogue" },
            { value: "dialogueWarpOut", label: "Dialogue Warp Out" },
            { value: "invisible", label: "Invisible NPC" },
            { value: "invisibleWarpOut", label: "Invisible NPC + Warp Out" },
            { value: "newDay", label: "New Day" },
            { value: "position", label: "Position" },
            { value: "warpOut", label: "Warp Out" },
            { value: "wedding", label: "Wedding" }
        ];

        const infoByType = {
            default: "End the event and return to normal gameplay.",
            bed: "End the event and place the player at the coordinates of their last bed.",
            dialogue: "End the event and set the NPC's next dialogue line.",
            dialogueWarpOut: "End the event, warp the player out, and set the NPC's next dialogue line.",
            invisible: "End the event and make the chosen NPC invisible until the next day.",
            invisibleWarpOut: "End the event, warp the player out, and make the chosen NPC invisible until the next day.",
            newDay: "End the event and immediately end the day.",
            position: "End the event and place the player at the given tile position.",
            warpOut: "End the event and send the player through the location's exit warp.",
            wedding: "End the event using the wedding-style cleanup behavior."
        };

        let html = `
            <div class="field" style="min-width:200px;">
              <label>End Type</label>
              <select class="select" data-k="endType">
                ${typeOptions.map(o => `
                  <option value="${o.value}" ${endType === o.value ? "selected" : ""}>${o.label}</option>
                `).join("")}
              </select>
            </div>
          `;

        if (endType === "dialogue" || endType === "dialogueWarpOut") {
            html += `
              <div class="field" style="min-width:170px;">
                <label>NPC</label>
                <input class="text" type="text" list="eb-dl-npcs" value="${escapeHtml(c.npc || "Abigail")}" data-k="npc" />
              </div>
              <div class="field grow">
                <label>Dialogue Text</label>
                <input class="text"
                       style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;"
                       type="text"
                       value="${escapeHtml(c.text || "")}"
                       data-k="text"
                       placeholder="It was fun talking to you today.$h" />
              </div>
            `;
        } else if (endType === "invisible" || endType === "invisibleWarpOut") {
            html += `
              <div class="field" style="min-width:170px;">
                <label>NPC</label>
                <input class="text" type="text" list="eb-dl-npcs" value="${escapeHtml(c.npc || "Abigail")}" data-k="npc" />
              </div>
            `;
        } else if (endType === "position") {
            html += `
              <div class="field" style="min-width:95px;">
                <label>X</label>
                <input class="num" type="number" value="${escapeHtml(c.x || "0")}" data-k="x" />
              </div>
              <div class="field" style="min-width:95px;">
                <label>Y</label>
                <input class="num" type="number" value="${escapeHtml(c.y || "0")}" data-k="y" />
              </div>
            `;
        }

        html += `
            <div class="field grow">
              <label>Description</label>
              <input class="text" type="text" value="${escapeHtml(infoByType[endType] || "")}" disabled />
            </div>
          `;

        return html;
    }

    if (t === "fade") return `
    <div class="field grow">
      <label>Arg</label>
      <input class="text" type="text" value="${escapeHtml(c.arg || "")}" data-k="arg" placeholder="unfade (optional)" />
    </div>
  `;

    if (t === "globalFade" || t === "globalFadeToClear") return `
    <div class="field" style="min-width:150px;">
      <label>Speed</label>
      <input class="text" type="text" value="${escapeHtml(c.speed || "")}" data-k="speed" placeholder="0.007" />
    </div>
    <div class="field" style="min-width:150px;">
      <label>Cont</label>
      <input class="text" type="text" value="${escapeHtml(c.cont || "")}" data-k="cont" placeholder="true/false" />
    </div>
  `;

    return renderCmdRawHtml(c);
}